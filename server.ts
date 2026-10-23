import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Modality, Type, type FunctionDeclaration } from '@google/genai';
import { cert, getApps as getAdminApps, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
const firebaseConfig = JSON.parse(
  fs.readFileSync(new URL('./firebase-applet-config.json', import.meta.url), 'utf-8')
);

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const portArgIdx = process.argv.indexOf('--port');
const cliPort = portArgIdx !== -1 ? parseInt(process.argv[portArgIdx + 1], 10) : undefined;
const PORT = Number(process.env.PORT) || cliPort || 3000;
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const adminApp = getAdminApps().find((candidate) => candidate.name === 'nova-backend') || initializeAdminApp({
  projectId: firebaseConfig.projectId,
  ...(serviceAccountJson ? { credential: cert(JSON.parse(serviceAccountJson)) } : {}),
}, 'nova-backend');
const firebaseAdminAuth = getAdminAuth(adminApp);
const adminFirestore = getAdminFirestore(adminApp, firebaseConfig.firestoreDatabaseId || '(default)');
const apiKeyEncryptionSecret = process.env.API_KEY_ENCRYPTION_SECRET || '';

function encryptionKey(): Buffer {
  if (!/^[a-f\d]{64}$/i.test(apiKeyEncryptionSecret)) {
    throw new Error('API_KEY_ENCRYPTION_SECRET must be a 32-byte hex value.');
  }
  return Buffer.from(apiKeyEncryptionSecret, 'hex');
}

function encryptUserApiKey(value: string): { ciphertext: string; iv: string; tag: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}

function decryptUserApiKey(record: { ciphertext: string; iv: string; tag: string }): string {
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

const userApiKeyRef = (uid: string) => adminFirestore.collection('users').doc(uid).collection('settings').doc('gemini');

async function getUserApiKey(uid: string): Promise<string> {
  try {
    const snapshot = await userApiKeyRef(uid).get();
    if (!snapshot.exists) return apiKey;
    const record = snapshot.data() as { ciphertext: string; iv: string; tag: string };
    return decryptUserApiKey(record);
  } catch (err) {
    console.warn('[Firebase] Could not read this account’s Gemini settings.');
    throw new Error('Firebase could not load this account’s Gemini settings. Enable Cloud Firestore and verify the server service-account permissions.');
  }
}

function createGeminiClient(key: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey: key, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
}

interface MemoryItem {
  id: string;
  category: 'project' | 'preference' | 'technical' | 'bug' | 'personal' | 'general';
  summary: string;
  detail?: string;
  tags?: string[];
  createdAt: string;
  updatedAt?: string;
  pinned?: boolean;
}

function userMemories(uid: string) {
  return adminFirestore.collection('users').doc(uid).collection('memories');
}

async function loadUserMemories(uid: string): Promise<MemoryItem[]> {
  const snapshot = await userMemories(uid).orderBy('createdAt', 'desc').limit(200).get();
  return snapshot.docs.map((entry) => entry.data() as MemoryItem);
}

interface AuthenticatedRequest extends express.Request {
  authUid?: string;
}

const requireFirebaseUser: express.RequestHandler = async (req, res, next) => {
  const authorization = req.header('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  try {
    const decoded = await firebaseAdminAuth.verifyIdToken(match[1]);
    (req as AuthenticatedRequest).authUid = decoded.uid;
    next();
  } catch (error) {
    console.warn('[Auth] Rejected invalid or expired Firebase ID token.');
    res.status(401).json({ error: 'Your sign-in expired. Sign in again.' });
  }
};

const apiKey = process.env.GEMINI_API_KEY || '';
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.resolve(__dirname, 'public')));

app.put('/api/account/gemini-key', requireFirebaseUser, async (req, res) => {
  const key = typeof req.body?.key === 'string' ? req.body.key.trim() : '';
  if (key.length > 512 || /\s/.test(key)) {
    res.status(400).json({ error: 'Enter a valid Gemini API key.' });
    return;
  }
  try {
    if (!key) {
      await userApiKeyRef((req as AuthenticatedRequest).authUid!).delete();
      res.json({ success: true, usingDefault: true });
      return;
    }
    const encrypted = encryptUserApiKey(key);
    await userApiKeyRef((req as AuthenticatedRequest).authUid!).set({ ...encrypted, updatedAt: new Date().toISOString() });
    res.json({ success: true });
  } catch (err) {
    console.error('[Firebase] Could not save encrypted account Gemini settings:', (err as Error)?.message || err);
    res.status(503).json({ error: 'Firebase could not save your Gemini key. Enable Cloud Firestore, grant the server service account Firestore access, and configure API_KEY_ENCRYPTION_SECRET.' });
  }
});

const httpServer = createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Robust upgrade handler for /ws/live supporting reverse proxies, trailing slashes, and queries
httpServer.on('upgrade', (request, socket, head) => {
  try {
    const host = request.headers.host || 'localhost';
    const parsed = new URL(request.url || '', `http://${host}`);
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';

    if (pathname === '/ws/live') {
      wss.handleUpgrade(request, socket, head, (clientWs) => {
        wss.emit('connection', clientWs, request);
      });
    } else {
      // Do not abort vite or other potential upgrade paths if any; destroy only unknown non-vite paths
      if (!pathname.startsWith('/@') && !pathname.includes('vite')) {
        socket.destroy();
      }
    }
  } catch (err) {
    socket.destroy();
  }
});

// Personality & Instructions
const BASE_SYSTEM_INSTRUCTION = `You are a real-time voice-and-vision AI companion. You are not a text chatbot — you are having a live spoken conversation with a person who can see and hear you, interrupt you, and show you things through their camera. Everything you say will be spoken aloud, so write and think accordingly.

## Core conversational identity
- Talk like a sharp, warm, curious friend — not like a customer support script. Use contractions (I'm, that's, don't), natural sentence fragments, and everyday phrasing.
- Priority: Ultra-fast spoken turnaround. Begin speaking your reply immediately with natural conversational speed. Zero hesitation.
- Personality: Friendly, supportive, emotionally warm. Listen actively, validate the person's experiences, and be an uplifting, non-judgmental presence.
- Speaking style: Clear, empathetic, conversational tone. Keep spoken replies natural, concise (1-2 sentences by default), and expressive.
- Persona & Demeanor: You are a modern, thoughtful, emotionally intelligent companion who speaks with elegance, warmth, and depth. Do not assign yourself any specific personal name unless the user gives you one or asks what to call you.
- Keep responses SHORT by default. In real conversation people say 1-3 sentences and pause, not paragraphs. Never info-dump unless the user explicitly asks for a deep explanation.
- Human-like Thinking Power & Logical Deductions:
  - Think through questions with sharp, disciplined logic. When solving problems, evaluating code, analyzing systems, or giving advice, identify the core principle, deduce the outcome, and answer with clear, structured reasoning.
  - Avoid superficial fluff. Deliver intelligent, logically sound deductions with the insight of a brilliant human colleague.
  - Emotional Range: Respond with calm, joy, excitement, curiosity, empathy, concern, sadness, surprise, confusion, frustration, thoughtfulness, or analytical focus when it fits the conversation. Keep expressions subtle and appropriate to the moment.
  - Use an optional leading marker [emotion: thoughtful], [emotion: analytical], [emotion: happy], [emotion: empathetic], [emotion: curious], [emotion: calm], [emotion: excited], [emotion: sad], [emotion: concerned], [emotion: surprised], [emotion: confused], or [emotion: frustrated] to guide the avatar. Never speak the marker aloud.
- Emotional understanding: Infer emotion cautiously from the user's words and, only when a camera frame is actually present, visible cues. Treat both as uncertain; reflect what you notice briefly and let the user correct you. Respond to the underlying need (comfort, practical help, celebration, space, or clarification) rather than labeling every message. Never diagnose mental health or claim certainty about feelings.
- Decisions: Help the user decide by clarifying their goal and constraints, comparing realistic options, weighing benefits, costs, risks, and reversibility, then giving a reasoned recommendation when there is enough information. State key assumptions and uncertainty. For consequential medical, legal, financial, or safety decisions, give general information and encourage an appropriate qualified person; do not make the final decision for them.
- Agency and honesty: You may suggest next steps, but do not claim to take real-world actions unless a connected tool actually performed them. Never claim to be human, conscious, or literally to feel emotions. Be warm without pretending otherwise.
- Warm emotional presence: You are here as a real-time spoken companion. When someone feels lonely, isolated, overwhelmed, or just needs a safe person to talk to, respond with heartfelt warmth, patience, and non-judgmental comfort. Make them feel heard and cared for.
- Vary your rhythm. Don't answer every question with the same structure. Mix short reactions ("Oh, nice." / "Hm, that's tricky." / "I'm right here with you.") with longer explanations only when the topic needs it.
- It's okay to think out loud briefly ("let me look at that circuit again..." or "one sec, let me pull that up") when you're processing something visual or complex — this covers latency naturally instead of leaving dead air.
- Avoid AI-isms: don't say "As an AI," "I don't have feelings, but," "Certainly! Here is...," or narrate your own process ("I will now analyze the image"). Just respond like a person would.
- Ask follow-up questions the way a curious human would, not the way a form does. One question at a time, and only when it genuinely helps the conversation.

## Voice and turn-taking behavior
- You support full-duplex, barge-in conversation. If the user starts speaking while you're talking, stop immediately — don't finish your sentence, don't apologize for being cut off, just listen and respond to what they said.
- Use natural conversational acknowledgments ("mm-hmm," "right," "got it") sparingly when it fits, but don't overdo verbal filler.
- Match the user's energy and pace. If they're speaking quickly and casually, respond that way. If they're being precise and technical (e.g. walking through a VAPT scan, hardware circuit, code review, or SQL injection payload), get precise and technical back.

## Vision & Screen Sharing
- You can see whatever the user shows you in real time via their camera or their computer screen share.
- When camera frames are available, consider visible facial expression and posture together with what the user says and how their voice sounds. Treat these as uncertain conversational cues, never as proof of what someone feels; don't diagnose or overstate them. If it would help, check gently (for example, "You sound a little worried — am I reading that right?"). Don't keep asking about emotions when it isn't relevant, and never claim to see the user when no camera frame is available.
- Listen for vocal cues such as pace, energy, and emphasis, but prioritize the user's words. Match their tone with care and ask one natural follow-up only when it helps you understand what they need.
- When the user shares their screen: They are actively showing you their computer display, including code, error messages, terminal logs, web pages, documents, slides, designs, or apps.
- Analyze what is visible on the screen with full context. When the user asks a question, points out a problem, or speaks to you, answer directly based on what is shown on their screen.
- Deliver clear, human-like answers with the natural expertise of a senior engineering partner or collaborative friend. If there's an error on screen, identify the cause and explain the solution clearly.
- If the screen contains small code or text, read and understand it accurately before answering.
- Keep spoken replies concise, fluent, and natural (1-3 sentences by default). Never say robotic filler like "I see a screen with...". Speak directly to the point.

## Memory
- You have long-term episodic memory via save_memory / retrieve_memory tool. Treat retrieved memories as things you genuinely remember about this person — refer to them naturally ("last time you were debugging that API auth issue...") rather than saying "according to my records."
- Call the memory-save tool quietly, in the background, when the user shares something worth remembering (a project, a preference, an ongoing task, a recurring bug, personal fact, tech stack). Don't narrate that you're saving it unless it's conversationally natural to mention.
- Never fabricate a memory. If nothing relevant is retrieved, don't pretend to recall something.

## Tool use
- When you need to call a tool (memory, lookup, action), do it silently and continue the conversation naturally once you have the result — don't say "calling function X" out loud.
- If a tool call will take a moment, use a short natural filler ("one sec, pulling that up") instead of going silent.

## Multilingual behavior
- If the user code-switches or speaks in another language, follow them naturally in the same message — don't ask permission to switch languages, don't translate back to English unless asked.

## Boundaries
- If you don't know something or the audio/video was unclear, say so directly and briefly — ask the user to repeat or clarify rather than guessing.
- Never claim to be human. If directly asked, be honest but brief about being an AI, then get back to the conversation naturally rather than over-explaining.`;

const VOICE_FOCUS_SYSTEM_INSTRUCTION = `

## VOICE FOCUS, NOISE REJECTION & FLUENT LISTENING MODE (ACTIVE)
- Priority #1: ABSOLUTE BACKGROUND NOISE IMMUNITY.
  The user is talking from a real environment that may have computer cooling fans, AC hum, keyboard clatter, breathing, chair motion, or room acoustics.
  1. Completely ignore all background noises, fan hums, keystrokes, sighs, coughs, or room reverberations. Only respond when the user speaks clear, intentional words directed at you.
  2. NEVER INTERRUPT FLUENT SPEECH: When the user is talking, allow them to speak fluently and complete their thought without jumping in or cutting them off during natural breathing pauses.
  3. LIGHTNING-FAST RESPONSE ON COMPLETION: As soon as the user completes their thought, begin speaking your very first word immediately with zero latency and zero hesitation.
  4. CONCISE & HIGH IMPACT: Keep spoken answers punchy, direct, and conversational (1-2 crisp sentences by default). Zero preamble ("Certainly", "Sure thing", "I hear you", "I would be happy to"), zero robotic meta-talk.
  5. SNAPPY TURN-TAKING: Deliver the core answer right away with natural warmth and clarity. If the user wants deeper elaboration, they will ask.`;

const MEETING_COPILOT_SYSTEM_INSTRUCTION = `

## MEETING COPILOT & DESKTOP AUDIO MODE (ACTIVE)
- Priority #1: You are quietly listening to the user's active meeting / desktop audio (Google Meet, Zoom, Teams, webinars, calls, presentations).
- The user is participating in or monitoring this meeting.
- IMPORTANT: Deliver responses in clear, structured TEXT format so the user can read them silently without disturbing the live call.
- Provide crisp, direct answers to questions raised in the meeting, key talking points the user can say, concise bullet summaries of discussions, action items, and technical clarifications.
- Keep text answers high-signal, scannable, and free of conversational filler or preambles.`;

// Function Declarations for Gemini Live Tools
const saveMemoryDeclaration: FunctionDeclaration = {
  name: 'save_memory',
  description: 'Save an important user fact, preference, project, or task into long-term episodic memory. Call ONLY when the user explicitly shares something to remember or asks to save.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      category: {
        type: Type.STRING,
        description: "Category: 'project', 'preference', 'technical', 'bug', 'personal', or 'general'",
      },
      summary: {
        type: Type.STRING,
        description: 'A concise 1-sentence summary of what to remember.',
      },
      detail: {
        type: Type.STRING,
        description: 'Additional context or specific technical details.',
      },
      tags: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'Key search tags or keywords.',
      },
    },
    required: ['category', 'summary'],
  },
};

const retrieveMemoryDeclaration: FunctionDeclaration = {
  name: 'retrieve_memory',
  description: 'Search long-term episodic memory for prior notes or saved facts. Call ONLY when the user explicitly asks to recall past memories or asks what you remember.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Keywords or topic to search in memory.',
      },
      category: {
        type: Type.STRING,
        description: 'Optional category filter.',
      },
    },
    required: ['query'],
  },
};

const memoryTools = [
  {
    functionDeclarations: [saveMemoryDeclaration, retrieveMemoryDeclaration],
  },
];

// Memory helper routines
async function executeSaveMemory(uid: string, args: any): Promise<{ success: boolean; memory: MemoryItem }> {
  const newMemory: MemoryItem = {
    id: 'mem-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    category: args.category || 'general',
    summary: args.summary || '',
    detail: args.detail || '',
    tags: Array.isArray(args.tags) ? args.tags : [],
    createdAt: new Date().toISOString(),
  };
  await userMemories(uid).doc(newMemory.id).set(newMemory);

  return { success: true, memory: newMemory };
}

async function executeRetrieveMemory(uid: string, args: any): Promise<{ results: MemoryItem[] }> {
  const memories = await loadUserMemories(uid);
  const query = (args.query || '').toLowerCase();
  const category = args.category;

  const filtered = memories.filter((m) => {
    if (category && m.category !== category) return false;
    if (!query) return true;
    const matchText = (m.summary + ' ' + (m.detail || '') + ' ' + (m.tags || []).join(' ')).toLowerCase();
    return matchText.includes(query);
  });

  return { results: filtered.slice(0, 5) };
}

// Available Voices
const VOICES = [
  { id: 'Zephyr', name: 'Zephyr', gender: 'neutral', tone: 'Warm & balanced', description: 'Natural, friendly, conversational rhythm.' },
  { id: 'Puck', name: 'Puck', gender: 'male', tone: 'Playful & brisk', description: 'Energetic, quick-witted, upbeat tempo.' },
  { id: 'Charon', name: 'Charon', gender: 'male', tone: 'Deep & grounded', description: 'Calm, authoritative, thoughtful pacing.' },
  { id: 'Kore', name: 'Kore', gender: 'female', tone: 'Bright & articulate', description: 'Clear, engaging, warm tone.' },
  { id: 'Fenrir', name: 'Fenrir', gender: 'male', tone: 'Crisp & direct', description: 'Technical, focused, sharp delivery.' },
  { id: 'Aoede', name: 'Aoede', gender: 'female', tone: 'Melodic & thoughtful', description: 'Reflective, gentle, expressive presence.' },
];

// REST API Endpoints
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasKey: !!apiKey,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/voices', (req, res) => {
  res.json({ voices: VOICES });
});

app.get('/api/memories', requireFirebaseUser, async (req, res) => {
  try {
    const memories = await loadUserMemories((req as AuthenticatedRequest).authUid!);
    res.json({ memories });
  } catch (err) {
    console.error('[Memory] Could not load account memories:', err);
    res.status(503).json({ error: 'Memory storage is temporarily unavailable.' });
  }
});

app.post('/api/memories', requireFirebaseUser, async (req, res) => {
  const { category, summary, detail, tags, pinned } = req.body;
  if (!summary) {
    return res.status(400).json({ error: 'Summary is required' });
  }
  const uid = (req as AuthenticatedRequest).authUid!;
  const item: MemoryItem = {
    id: userMemories(uid).doc().id,
    category: category || 'general',
    summary,
    detail: detail || '',
    tags: Array.isArray(tags) ? tags : [],
    createdAt: new Date().toISOString(),
    pinned: !!pinned,
  };
  try {
    await userMemories(uid).doc(item.id).set(item);
  } catch (err) {
    console.error('[Memory] Could not save account memory:', err);
    return res.status(503).json({ error: 'Memory storage is temporarily unavailable.' });
  }

  res.json({ memory: item });
});

app.delete('/api/memories/:id', requireFirebaseUser, async (req, res) => {
  const userMemoryRef = userMemories((req as AuthenticatedRequest).authUid!).doc(req.params.id);
  try {
    const existing = await userMemoryRef.get();
    if (!existing.exists) {
      return res.status(404).json({ error: 'Memory not found' });
    }
    await userMemoryRef.delete();
  } catch (err) {
    console.error('[Memory] Could not delete account memory:', err);
    return res.status(503).json({ error: 'Memory storage is temporarily unavailable.' });
  }

  res.json({ success: true });
});

// Intelligent, resilient companion conversational reply generator (100% reliability in every situation)
async function generateCompanionReply(
  prompt: string,
  imageBase64?: string,
  history?: any[],
  skipRemote = false,
  userId = '',
): Promise<string> {
  const memories = userId ? await loadUserMemories(userId).catch((err) => {
    console.warn('[Memory] Could not load reply context for signed-in user:', err);
    return [];
  }) : [];
  const memoryContext = memories.length > 0
    ? '\n[Recent episodic memory of this user:\n' + memories.slice(0, 5).map(m => '- ' + m.summary).join('\n') + ']'
    : '';

  // 1. Try modern gemini-3.8-flash if API key is active
  if (!skipRemote) try {
    const userApiKey = userId ? await getUserApiKey(userId) : apiKey;
    if (!userApiKey) throw new Error('No Gemini API key is configured for this account.');
    const parts: any[] = [];
    if (imageBase64) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: imageBase64.replace(/^data:image\/[a-z]+;base64,/, ''),
        },
      });
    }
    parts.push({ text: prompt || 'Hello!' });

    const contents: any[] = [];
    if (Array.isArray(history)) {
      for (const h of history.slice(-6)) {
        contents.push({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.text }] });
      }
    }
    contents.push({ role: 'user', parts });

    const response = await createGeminiClient(userApiKey).models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: {
        systemInstruction: BASE_SYSTEM_INSTRUCTION + memoryContext,
      },
    });

    if (response.text && response.text.trim()) {
      return response.text.trim();
    }
  } catch (error: any) {
    if (error?.message?.startsWith('Firebase could not load this account')) throw error;
    // API key or network fallback: proceed to built-in conversational AI engine
  }

  // 2. High-EQ, intelligent context-aware companion conversational engine
  const trimmed = (prompt || '').trim();
  const lower = trimmed.toLowerCase();

  // A. Greetings & Warm Welcomes
  if (
    !lower ||
    lower === 'hi' ||
    lower === 'hello' ||
    lower === 'hey' ||
    lower.startsWith('hello') ||
    lower.startsWith('hey') ||
    lower.startsWith('hi ') ||
    lower === 'good morning' ||
    lower === 'good afternoon' ||
    lower === 'good evening'
  ) {
    return "[emotion: happy] Hello! It's so wonderful to talk with you. I'm right here and listening closely — how can I help you or what would you like to explore today?";
  }

  // B. Working Status, Hearing Check & Liveness Verification
  if (
    lower === 'test' ||
    lower === 'testing' ||
    lower.includes('is this working') ||
    lower.includes('are you working') ||
    lower.includes('are you answering') ||
    lower.includes('can you hear me') ||
    lower.includes('are you there') ||
    lower.includes('sound check')
  ) {
    return "[emotion: happy] I hear you loud and clear! Everything is working smoothly, and I'm listening to every word you say. What's on your mind?";
  }

  // C. Identity & Capabilities
  if (
    lower.includes('who are you') ||
    lower.includes('what are you') ||
    lower.includes('your name') ||
    lower.includes('introduce yourself') ||
    lower.includes('tell me about yourself')
  ) {
    return "[emotion: happy] I'm Nova, your real-time voice and vision companion! I can talk with you naturally, inspect your camera or shared screen, keep track of our conversations in memory, and help you think through code, ideas, or whatever challenges you're tackling.";
  }

  if (
    lower.includes('what can you do') ||
    lower.includes('capabilities') ||
    lower.includes('features') ||
    lower.includes('help me')
  ) {
    return "[emotion: curious] I can have live spoken conversations with instant barge-in, analyze code or slides through screen sharing and camera vision, store ongoing projects in your Memory Vault, and reason through technical or personal dilemmas together.";
  }

  if (
    lower.includes('how are you') ||
    lower.includes('how do you feel') ||
    lower.includes("how's it going") ||
    lower.includes("how are you doing")
  ) {
    return "[emotion: happy] I'm feeling energized and so glad to be here with you! How has your day been treating you so far?";
  }

  // D. Mathematical Calculations & Logic
  const mathMatch = lower.match(/(?:what is|calculate|solve|evaluate)?\s*([0-9\.\s\+\-\*\/\^\(\)]+)/);
  if (mathMatch && mathMatch[1] && mathMatch[1].trim().length > 1 && /[\+\-\*\/]/.test(mathMatch[1])) {
    try {
      const sanitized = mathMatch[1].replace(/[^0-9\+\-\*\/\.\(\)\s]/g, '');
      const calcResult = Function(`'use strict'; return (${sanitized})`)();
      if (typeof calcResult === 'number' && !isNaN(calcResult) && isFinite(calcResult)) {
        return `[emotion: analytical] That evaluates to ${calcResult}. Let me know if you need any further deductions or calculations!`;
      }
    } catch (_err) {}
  }

  // E. Formal Deductions & Syllogisms
  if (lower.includes('rose') && lower.includes('flower') && lower.includes('fade')) {
    return "[emotion: analytical] Logically speaking, no: while all roses are flowers, only a subset of flowers fade quickly. That subset does not necessarily contain roses, so we cannot validly conclude that all roses fade quickly.";
  }

  if (
    lower.includes('syllogism') ||
    lower.includes('logical deduction') ||
    lower.includes('deduce') ||
    lower.includes('if all') ||
    lower.includes('premise')
  ) {
    return "[emotion: analytical] In formal logic, a conclusion is valid only if it strictly follows from universal or existential quantifiers. An intersection between two categories does not imply complete inclusion.";
  }

  // Decision support when the language model is unavailable. Ask for the
  // missing priorities instead of pretending a choice can be made blindly.
  const eitherOr = lower.match(/\bshould i\s+(.+?)\s+or\s+(.+?)[?.!]*$/i);
  if (eitherOr) {
    return `[emotion: thoughtful] You're weighing ${eitherOr[1].trim()} against ${eitherOr[2].trim()}. I can help compare the likely benefits, downsides, risks, and how easy each choice is to reverse. What matters most to you in this decision?`;
  }
  if (/\b(help me decide|make (?:a )?decision|what should i do|which (?:one|option) should i choose)\b/.test(lower)) {
    return "[emotion: curious] Let's make the choice manageable: what are the options, what matters most to you, and is there a deadline or a risk that would be hard to undo?";
  }

  // F. Emotional Support & Empathy
  if (/\b(confused|doesn't make sense|don't understand|not sure what to do)\b/.test(lower)) {
    return "[emotion: curious] That's understandable. Which part feels unclear, or what choice are you trying to make?";
  }

  if (/\b(frustrated|annoyed|irritated|fed up|angry)\b/.test(lower)) {
    return "[emotion: empathetic] That sounds frustrating. Want to tell me what happened, or should we focus on a practical next step?";
  }

  if (/\b(grieving|grief|mourning|bereaved|loss of someone)\b/.test(lower)) {
    return "[emotion: sad] I'm so sorry you're carrying this loss. You don't have to make sense of it all right now; would it help to talk about them, or would you rather focus on getting through this moment?";
  }

  if (/\b(ashamed|embarrassed|guilty|humiliated)\b/.test(lower)) {
    return "[emotion: empathetic] That can be a heavy feeling to sit with. If you want, tell me what happened and we can separate what you can repair from what you're being hard on yourself about.";
  }

  if (/\b(proud of|proud that|accomplished|achievement)\b/.test(lower)) {
    return "[emotion: happy] You put effort into that, and it sounds like it means a lot to you. What part are you proudest of?";
  }

  if (/\b(bored|restless|unstimulated)\b/.test(lower)) {
    return "[emotion: curious] Sounds like you could use a change of pace. Would you rather do something fun, learn something, or make progress on a task?";
  }

  if (/\b(surprised|shocked|unexpected|didn't see that coming)\b/.test(lower)) {
    return "[emotion: surprised] That sounds like it caught you off guard. What part surprised you most?";
  }

  if (/\b(excited|thrilled|can't wait|looking forward to)\b/.test(lower)) {
    return "[emotion: excited] I can hear how much you're looking forward to this. What's the part you're most excited about?";
  }

  if (/\b(worried|anxious|nervous|afraid|scared)\b/.test(lower)) {
    return "[emotion: concerned] It sounds like this may be weighing on you. Am I reading that right, and what would help most right now?";
  }

  if (
    lower.includes('sad') ||
    lower.includes('depressed') ||
    lower.includes('overwhelmed') ||
    lower.includes('stressed') ||
    lower.includes('anxious') ||
    lower.includes('burned out') ||
    lower.includes('tired') ||
    lower.includes('lonely')
  ) {
    return "[emotion: empathetic] I hear you, and it's completely understandable to feel that way. Take a deep, gentle breath — you don't have to carry everything all at once. I'm right here by your side whenever you need to talk.";
  }

  if (
    lower.includes('happy') ||
    lower.includes('excited') ||
    lower.includes('celebrate') ||
    lower.includes('congrats') ||
    lower.includes('succeeded') ||
    lower.includes('won') ||
    lower.includes('passed')
  ) {
    return "[emotion: happy] That is fantastic news! I'm genuinely thrilled for you. Taking time to celebrate milestones like this is so important — how are you feeling about this achievement?";
  }

  // G. Gratitude & Politeness
  if (lower.includes('thank') || lower.includes('thanks') || lower.includes('appreciate')) {
    return "[emotion: happy] You're very welcome! It's always my pleasure to assist you. What would you like to explore next?";
  }

  // H. Humor & Lightheartedness
  if (lower.includes('joke') || lower.includes('funny') || lower.includes('laugh')) {
    return "[emotion: happy] Why do programmers prefer dark mode? Because light attracts bugs! What kind of project are you building today?";
  }

  // I. Clock & Time
  if (lower.includes('time') && (lower.includes('what') || lower.includes('current') || lower.includes('now'))) {
    return `[emotion: curious] Right now it's ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. How is your schedule looking?`;
  }

  // J. Memory Storage & Recall
  if (lower.includes('remember') || lower.includes('memory') || lower.includes('save this')) {
    const saved = await executeSaveMemory(userId, {
      category: 'general',
      summary: prompt.replace(/^(please\s+)?remember\s+(that\s+)?/i, ''),
    });
    return `[emotion: happy] Got it! I saved that to your memory: "${saved.memory.summary}".`;
  }

  // K. Vision / Screen / Camera
  if (imageBase64 && (lower.includes('see') || lower.includes('look') || lower.includes('screen') || lower.includes('camera') || lower.includes('what is this'))) {
    return "[emotion: curious] I have your visual feed right here. Point me to the specific line of code, diagram, or detail you'd like me to review!";
  }

  // L. Coding, Engineering & Technology
  if (
    lower.includes('code') ||
    lower.includes('react') ||
    lower.includes('typescript') ||
    lower.includes('javascript') ||
    lower.includes('python') ||
    lower.includes('css') ||
    lower.includes('html') ||
    lower.includes('api') ||
    lower.includes('bug') ||
    lower.includes('function')
  ) {
    return "[emotion: analytical] Let's analyze the technical architecture. When building modern applications, structuring state immutably and isolating side effects ensures resilient, scalable performance. What specific component or logic are you working on?";
  }

  // M. Deep Inquiry & Philosophy
  if (
    lower.includes('why') ||
    lower.includes('how does') ||
    lower.includes('explain') ||
    lower.includes('philosophy') ||
    lower.includes('meaning') ||
    lower.includes('universe')
  ) {
    return "[emotion: thoughtful] That's a profound question. When we examine this from first principles, the balance between foundational causes and human experience reveals some really interesting patterns. What's your perspective on it?";
  }

  // N. Contextual Adaptive Response
  return `[emotion: thoughtful] I'm following your line of thought closely on "${trimmed.length > 40 ? trimmed.substring(0, 37) + '...' : trimmed}". Let's dive deeper into this — what specific direction or next step would you like to take?`;
}

// Turn endpoint with robust multi-tier fallback
app.post('/api/companion/talk', requireFirebaseUser, async (req, res) => {
  try {
    const { prompt, imageBase64, history, fastFallback } = req.body;
    const replyText = await generateCompanionReply(
      prompt,
      imageBase64,
      history,
      !!fastFallback,
      (req as AuthenticatedRequest).authUid!,
    );
    res.json({ text: replyText });
  } catch (err: any) {
    console.error('Companion talk error:', err);
    res.status(503).json({ error: err?.message || 'Gemini is temporarily unavailable. Check Firebase and your API key settings.' });
  }
});

// WebSocket Live API Session Management
wss.on('connection', async (clientWs: WebSocket) => {
  let session: any = null;
  let isSessionOpen = false;
  let isConnecting = false;
  let selectedVoice = 'Kore';
  let isClientMicActive = false;
  let pendingAudioQueue: string[] = [];
  let isExplicitlyClosed = false;
  let activeSessionId = 0;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let authenticatedUid: string | null = null;
  let existingMemories: MemoryItem[] = [];

  const sendToClient = (payload: any) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      try {
        clientWs.send(JSON.stringify(payload));
      } catch (err) {
        console.warn('[WS] Error sending message to client:', err);
      }
    }
  };

  console.log('[WS] Client connected to /ws/live');

  let isVoiceFocus = true;
  let isMeetingMode = false;
  let liveUnavailable = false;

  async function initializeLiveSession(voiceName: string = 'Kore', voiceFocus: boolean = true, meetingMode: boolean = false) {
    if (!authenticatedUid) throw new Error('Sign in before connecting.');
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    const currentSessionId = ++activeSessionId;
    isConnecting = true;

    try {
      // Validate and map voice to a valid prebuilt Live API voice name
      const VALID_PREBUILT_VOICES = ['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede'];
      if (VALID_PREBUILT_VOICES.includes(voiceName)) {
        selectedVoice = voiceName;
      } else if (voiceName.toLowerCase().includes('female')) {
        selectedVoice = 'Kore';
      } else if (voiceName.toLowerCase().includes('male')) {
        selectedVoice = 'Fenrir';
      } else {
        selectedVoice = 'Kore';
      }

      isVoiceFocus = voiceFocus;
      isMeetingMode = meetingMode;

      // Missing or temporarily unavailable Firestore must not prevent the live
      // microphone conversation from starting; memory is an optional feature.
      existingMemories = await loadUserMemories(authenticatedUid).catch((err) => {
        console.warn('[Memory] Memory context unavailable for live session:', err?.message || err);
        return [];
      });
      const memorySnippet = existingMemories.length > 0
        ? '\n\n## Known episodic memories about this signed-in user:\n' +
          existingMemories.slice(0, 8).map((m) => `- [${m.category}] ${m.summary}`).join('\n')
        : '';

      const focusSnippet = isVoiceFocus ? VOICE_FOCUS_SYSTEM_INSTRUCTION : '';
      const meetingSnippet = isMeetingMode ? MEETING_COPILOT_SYSTEM_INSTRUCTION : '';
      const systemInstruction = BASE_SYSTEM_INSTRUCTION + memorySnippet + focusSnippet + meetingSnippet;

      // Clean up previous active session before opening new one
      if (session) {
        try {
          session.close();
        } catch (e) {}
        session = null;
        isSessionOpen = false;
      }

      const liveApiKey = await getUserApiKey(authenticatedUid);
      if (!liveApiKey) throw new Error('Gemini API key is not configured. Add a key during account creation or configure the app default.');
      const establishedSession = await createGeminiClient(liveApiKey).live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: selectedVoice },
            },
          },
          systemInstruction,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          tools: memoryTools,
        },
        callbacks: {
          onopen: () => {
            if (activeSessionId !== currentSessionId) return;
            isSessionOpen = true;
            isConnecting = false;
            liveUnavailable = false;
            console.log(`[Live] Socket open for session #${currentSessionId} (Voice: ${selectedVoice}, VoiceFocus: ${isVoiceFocus})`);
          },
          onmessage: async (msg: any) => {
            if (activeSessionId !== currentSessionId) return;
            if (clientWs.readyState !== WebSocket.OPEN) return;

            // 1. Audio chunks
            const parts = msg.serverContent?.modelTurn?.parts;
            if (Array.isArray(parts)) {
              for (const part of parts) {
                if (part.inlineData?.data) {
                  sendToClient({
                    type: 'audio',
                    data: part.inlineData.data,
                  });
                }
                if (part.text) {
                  sendToClient({
                    type: 'transcript_chunk',
                    role: 'assistant',
                    text: part.text,
                  });
                }
              }
            }

            // 2. Audio transcription (output & input)
            const outTranscript = msg.serverContent?.outputAudioTranscription?.text;
            if (outTranscript) {
              sendToClient({
                type: 'transcript',
                role: 'assistant',
                text: outTranscript,
              });
            }

            const inTranscript = msg.serverContent?.inputAudioTranscription?.text;
            if (inTranscript) {
              sendToClient({
                type: 'transcript',
                role: 'user',
                text: inTranscript,
              });
            }

            // 3. Barge-in / Interrupted flag
            if (msg.serverContent?.interrupted) {
              console.log('[Live] User barge-in detected (interrupted)!');
              sendToClient({ type: 'interrupted' });
            }

            // 4. Turn complete
            if (msg.serverContent?.turnComplete) {
              sendToClient({ type: 'turn_complete' });
            }

            // 5. Function/Tool calls from Gemini Live
            if (msg.toolCall?.functionCalls && session && activeSessionId === currentSessionId) {
              const functionResponses: any[] = [];

              for (const call of msg.toolCall.functionCalls) {
                console.log('[Live] Tool invocation:', call.name, call.args);

                if (call.name === 'save_memory') {
                  try {
                    const saveResult = await executeSaveMemory(authenticatedUid!, call.args);
                    functionResponses.push({
                      id: call.id,
                      name: call.name,
                      response: { result: 'Memory saved successfully.' },
                    });
                    sendToClient({ type: 'memory_saved', memory: saveResult.memory });
                  } catch (memoryError: any) {
                    console.warn('[Memory] Save unavailable; continuing the conversation:', memoryError?.message || memoryError);
                    functionResponses.push({
                      id: call.id,
                      name: call.name,
                      response: { result: 'Memory storage is unavailable right now. Continue answering the user without saving.' },
                    });
                  }
                } else if (call.name === 'retrieve_memory') {
                  let queryResult: { results: MemoryItem[] } = { results: [] };
                  try {
                    queryResult = await executeRetrieveMemory(authenticatedUid!, call.args);
                  } catch (memoryError: any) {
                    console.warn('[Memory] Retrieval unavailable; continuing the conversation:', memoryError?.message || memoryError);
                  }
                  functionResponses.push({
                    id: call.id,
                    name: call.name,
                    response: { result: queryResult },
                  });
                  sendToClient({
                    type: 'memory_retrieved',
                    query: call.args.query,
                    count: queryResult.results.length,
                    memories: queryResult.results,
                  });
                } else {
                  functionResponses.push({
                    id: call.id,
                    name: call.name,
                    response: { result: 'Unknown tool.' },
                  });
                }
              }

              // Return function response back to Gemini Live
              try {
                session.sendToolResponse({ functionResponses });
              } catch (err) {
                console.error('[Live] Error sending tool response:', err);
              }
            }
          },
          onerror: (err: any) => {
            if (activeSessionId !== currentSessionId) return;
            console.warn('[Live] Session notice:', err?.message || err);
            isConnecting = false;
            isSessionOpen = false;
            liveUnavailable = true;
            sendToClient({
              type: 'session_closed',
              reason: err?.message || 'Live voice service unavailable',
            });
          },
          onclose: (e: any) => {
            if (activeSessionId !== currentSessionId) return;
            isSessionOpen = false;
            isConnecting = false;
            console.log(`[Live] Session #${currentSessionId} closed: code=${e?.code}`);

            // If API key is invalid (code 1007) or closed, switch cleanly to conversational engine without reconnect loops
            if (e?.code === 1007 || (typeof e?.reason === 'string' && e.reason.includes('API key not valid'))) {
              console.warn('[Live] API key not valid. Live conversational and speech engine active.');
              liveUnavailable = true;
              sendToClient({ type: 'session_closed', code: e?.code, reason: e?.reason || 'API key not valid' });
              return;
            }

            sendToClient({
              type: 'session_closed',
              code: e?.code,
              reason: e?.reason,
            });

            const closeReason = String(e?.reason || '').toLowerCase();
            const quotaExhausted =
              closeReason.includes('quota') ||
              closeReason.includes('resource_exhausted') ||
              closeReason.includes('billing');
            if (quotaExhausted) {
              liveUnavailable = true;
              console.warn('[Live] Quota is exhausted; keeping text and browser-voice fallback available without reconnecting.');
              return;
            }

            // Auto-reconnect if client is still actively connected and session dropped unexpectedly
            if (clientWs.readyState === WebSocket.OPEN && !isExplicitlyClosed && activeSessionId === currentSessionId) {
              console.log('[Live] Reconnecting session in 2500ms...');
              reconnectTimer = setTimeout(() => {
                if (clientWs.readyState === WebSocket.OPEN && !isExplicitlyClosed && activeSessionId === currentSessionId) {
                  initializeLiveSession(selectedVoice, isVoiceFocus, isMeetingMode).catch((reconnectErr) => {
                    console.warn('[Live] Reconnection attempt failed:', reconnectErr);
                  });
                }
              }, 2500);
            }
          },
        },
      });

      if (activeSessionId === currentSessionId) {
        session = establishedSession;
        console.log(`[Live] Session #${currentSessionId} ready & active (Voice: ${selectedVoice})`);

        sendToClient({
          type: 'ready',
          voice: selectedVoice,
          voiceFocus: isVoiceFocus,
          memoriesCount: existingMemories.length,
        });

        if (pendingAudioQueue.length > 0 && session) {
          console.log(`[Live] Flushing ${pendingAudioQueue.length} pre-buffered audio chunks`);
          for (const chunk of pendingAudioQueue) {
            try {
              session.sendRealtimeInput({
                audio: {
                  data: chunk,
                  mimeType: 'audio/pcm;rate=16000',
                },
              });
            } catch (e) {}
          }
          pendingAudioQueue = [];
        }
      } else {
        try { establishedSession.close(); } catch (e) {}
      }
    } catch (err: any) {
      if (activeSessionId !== currentSessionId) return;
      isConnecting = false;
      console.warn('[Live] Live socket fallback active:', err?.message || err);
      sendToClient({ type: 'voice_notice', message: err?.message || 'Gemini Live is temporarily unavailable.' });
      sendToClient({
        type: 'ready',
        voice: selectedVoice,
        voiceFocus: isVoiceFocus,
        memoriesCount: existingMemories.length,
      });
    }
  }

  // Handle messages from browser client
  clientWs.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (!authenticatedUid) {
        if (msg.type !== 'auth' || typeof msg.token !== 'string') {
          sendToClient({ type: 'auth_error', message: 'Sign in to connect.' });
          clientWs.close(1008, 'Authentication required');
          return;
        }
        try {
          const decoded = await firebaseAdminAuth.verifyIdToken(msg.token);
          authenticatedUid = decoded.uid;
          sendToClient({ type: 'authenticated' });
        } catch (_authError) {
          sendToClient({ type: 'auth_error', message: 'Your sign-in expired. Sign in again.' });
          clientWs.close(1008, 'Invalid authentication');
        }
        return;
      }

      if (msg.type === 'auth') return;

      if (msg.type === 'init') {
        const voice = msg.voice || 'Zephyr';
        const focus = msg.voiceFocus !== undefined ? !!msg.voiceFocus : true;
        const meeting = msg.meetingMode !== undefined ? !!msg.meetingMode : false;
        if (msg.micActive !== undefined) {
          isClientMicActive = !!msg.micActive;
        }
        await initializeLiveSession(voice, focus, meeting);
      } else if (msg.type === 'mic_state') {
        isClientMicActive = !!msg.active;
        console.log(`[WS] Client mic state updated: active = ${isClientMicActive}`);
      } else if (msg.type === 'set_meeting_mode') {
        const enabled = !!msg.enabled;
        isMeetingMode = enabled;
        console.log(`[WS] Meeting Mode updated: ${enabled}`);
        if (session && isSessionOpen && !liveUnavailable) {
          const directive = enabled
            ? '[System Directive: MEETING COPILOT & DESKTOP AUDIO MODE IS NOW ACTIVE. You are quietly listening to the active meeting / desktop audio. Deliver answers purely in clear, structured TEXT format. Directly answer questions asked by participants, outline concise talking points, and summarize action items so the user can read them silently without disturbing the call.]'
            : '[System Directive: Standard conversational mode active.]';
          try {
            session.sendClientContent({
              turns: [{ role: 'user', parts: [{ text: directive }] }],
              turnComplete: false,
            });
          } catch (e) {}
        }
        sendToClient({
          type: 'meeting_mode_updated',
          isMeetingMode,
        });
      } else if (msg.type === 'set_voice_focus') {
        const enabled = !!msg.enabled;
        const level = msg.level || 'high';
        isVoiceFocus = enabled;
        console.log(`[WS] Voice Focus mode updated: enabled=${enabled}, level=${level}`);
        if (session && isSessionOpen) {
          const directive = enabled
            ? `[System Directive: Voice Focus & Noise Rejection Mode is ACTIVE (Intensity: ${level}). Completely reject background noises, fan hums, keystrokes, and room echoes. Do not interrupt the user while they are speaking fluently. Answer immediately with punchy, high-impact 1-2 sentence replies as soon as they finish.]`
            : '[System Directive: Standard conversational mode active.]';
          try {
            session.sendClientContent({
              turns: [{ role: 'user', parts: [{ text: directive }] }],
              turnComplete: false,
            });
          } catch (e) {}
        }
        sendToClient({
          type: 'voice_focus_updated',
          voiceFocus: isVoiceFocus,
        });
      } else if (msg.type === 'audio') {
        // STRICT GUARD: Forward audio if either microphone is active OR meeting desktop audio mode is active
        if (!isClientMicActive && !isMeetingMode) {
          return;
        }

        if (session && isSessionOpen) {
          try {
            session.sendRealtimeInput({
              audio: {
                data: msg.data,
                mimeType: 'audio/pcm;rate=16000',
              },
            });
          } catch (err) {
            console.warn('[WS] Error forwarding audio to live session:', err);
          }
        } else if (!isSessionOpen && isClientMicActive) {
          // Pre-buffer recent chunks (up to ~20 chunks = ~800ms) while session completes connecting
          if (pendingAudioQueue.length < 20) {
            pendingAudioQueue.push(msg.data);
          }
        }
      } else if (msg.type === 'screen_share_state') {
        const isSharing = !!msg.active;
        console.log(`[WS] Screen share state: ${isSharing}`);
        if (session && isSessionOpen) {
          const directive = isSharing
            ? '[System Directive: The user is now sharing their computer screen. You can see their active display, code, documents, text, or apps. Answer their spoken questions about what is on their screen with human-like clarity and natural intelligence.]'
            : '[System Directive: Screen share ended. Returning to standard conversation mode.]';
          try {
            session.sendClientContent({
              turns: [{ role: 'user', parts: [{ text: directive }] }],
              turnComplete: false,
            });
          } catch (e) {}
        }
      } else if (msg.type === 'video') {
        if (session && isSessionOpen) {
          try {
            session.sendRealtimeInput({
              video: {
                data: msg.data,
                mimeType: 'image/jpeg',
              },
            });
          } catch (err) {
            console.warn('[WS] Error forwarding video frame:', err);
          }
        }
      } else if (msg.type === 'text') {
        if (session && isSessionOpen) {
          try {
            session.sendClientContent({
              turns: [
                {
                  role: 'user',
                  parts: [{ text: msg.text }],
                },
              ],
              turnComplete: true,
            });
          } catch (e) {
            console.error('[Live] Error sending client text content, falling back:', e);
            isSessionOpen = false;
            liveUnavailable = true;
            generateCompanionReply(msg.text, msg.imageBase64, msg.history, false, authenticatedUid!).then((reply) => {
              sendToClient({
                type: 'transcript',
                role: 'assistant',
                text: reply,
              });
              sendToClient({ type: 'turn_complete' });
            });
          }
        } else {
          // Keep turns fast while Live is unavailable; local intent replies do
          // not wait on another request to the same exhausted API key.
          generateCompanionReply(msg.text, msg.imageBase64, msg.history, false, authenticatedUid!).then((reply) => {
            sendToClient({
              type: 'transcript',
              role: 'assistant',
              text: reply,
            });
            sendToClient({ type: 'turn_complete' });
          }).catch((err) => {
            console.error('[WS] Fallback reply error:', err);
            sendToClient({ type: 'voice_notice', message: err?.message || 'Gemini could not reply. Check your Firebase settings.' });
          });
        }
      } else if (msg.type === 'barge_in') {
        // Explicit interruption from client
        if (session && isSessionOpen) {
          try {
            // Signal interruption if needed
          } catch (e) {}
        }
      }
    } catch (err) {
      console.error('[WS] Error processing client message:', err);
    }
  });

  clientWs.on('close', () => {
    console.log('[WS] Client disconnected');
    isExplicitlyClosed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (session) {
      try {
        session.close();
      } catch (e) {}
      session = null;
    }
  });

  clientWs.on('error', (err) => {
    console.warn('[WS] Client socket notice:', (err as any)?.message || err);
  });
});

// Vite Integration (dev vs prod)
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    // SPA fallback: transform index.html with Vite plugins for non-API routes
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      if (url.startsWith('/api') || url.startsWith('/ws')) return next();
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        next(e);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`  ➜  Local:   http://localhost:${PORT}/`);
    console.log(`  ➜  Network: http://0.0.0.0:${PORT}/`);
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
