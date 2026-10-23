import { useEffect, useRef, useState, useCallback } from 'react';
import {
  CompanionStatus,
  TranscriptEntry,
  MemoryItem,
  LiveVoice,
  AvatarEmotion,
} from '../types/companion';

function extractEmotionFromText(text: string): { cleanText: string; emotion: AvatarEmotion } {
  const match = text.match(/^\[emotion:\s*(thoughtful|analytical|happy|empathetic|curious|neutral|calm|excited|sad|concerned|surprised|confused|frustrated)\]\s*/i);
  if (match) {
    const emotion = match[1].toLowerCase() as AvatarEmotion;
    const cleanText = text.replace(match[0], '');
    return { cleanText, emotion };
  }
  const lower = text.toLowerCase();
  if (
    /\b(sorry to hear|that sounds|must be hard|right here with you|i understand|i hear you|overwhelmed|anxious|afraid|scared|lonely|grieving|struggling|painful|frustrat\w*|worried|worrying)\b/.test(lower)
  ) {
    return { cleanText: text, emotion: 'empathetic' };
  }
  if (
    /\b(because|therefore|logically|algorithm|root cause|analy[sz]e|specifically|deduce|evidence|in summary)\b/.test(lower)
  ) {
    return { cleanText: text, emotion: 'analytical' };
  }
  if (
    /\b(what if|curious|interesting|tell me more|wondering|how did|what do you think)\b/.test(lower)
  ) {
    return { cleanText: text, emotion: 'curious' };
  }
  if (
    /\b(let me think|on reflection|thoughtful|a tricky question|there are a few ways|i'm considering)\b/.test(lower)
  ) {
    return { cleanText: text, emotion: 'thoughtful' };
  }
  if (/\b(great news|wonderful|awesome|haha|excited|congratulations|congrats|glad to hear)\b/.test(lower)) {
    return { cleanText: text, emotion: /\b(excited|thrilled|can't wait)\b/.test(lower) ? 'excited' : 'happy' };
  }
  if (/\b(surprising|didn't expect|what a surprise|wow)\b/.test(lower)) {
    return { cleanText: text, emotion: 'surprised' };
  }
  if (/\b(calm|take a breath|at your pace|no rush)\b/.test(lower)) {
    return { cleanText: text, emotion: 'calm' };
  }
  return { cleanText: text, emotion: 'neutral' };
}

function microphoneErrorMessage(error: any): string {
  if (error?.name === 'SecurityError' || !window.isSecureContext) {
    return 'Microphone access needs a secure HTTPS page. Use localhost for local testing, or open the deployed HTTPS site.';
  }
  switch (error?.name) {
    case 'NotAllowedError':
      return 'Microphone permission was blocked. Allow microphone access in your browser site settings, then try again.';
    case 'NotFoundError':
      return 'No microphone was found. Connect or select a microphone, then try again.';
    case 'NotReadableError':
      return 'The microphone is busy or unavailable. Close other apps using it, then try again.';
    case 'AbortError':
      return 'The microphone request was cancelled. Click the mic and allow access to continue.';
    case 'NotSupportedError':
      return error.message || 'This browser does not support microphone capture. Try the latest Chrome or Edge.';
    default:
      return 'Could not start the microphone. Check browser permissions and try again.';
  }
}
import {
  pcm16kToBase64,
  base64ToPcm24kFloat32,
  computeRmsVolume,
} from '../utils/audioUtils';
import { getAuthToken } from '../lib/firebase';

interface UseLiveCompanionOptions {
  voice?: string;
  autoConnect?: boolean;
  initialNoiseSuppression?: boolean;
  initialVoiceFocus?: boolean;
}

export function useLiveCompanion({
  voice = 'Kore',
  autoConnect = true,
  initialNoiseSuppression = true,
  initialVoiceFocus = true,
}: UseLiveCompanionOptions = {}) {
  const [status, setStatus] = useState<CompanionStatus>('idle');
  const [isConnected, setIsConnected] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [voiceInputNotice, setVoiceInputNotice] = useState('');
  const [isMeetingMode, setIsMeetingMode] = useState(false);
  const [meetingAudioVolume, setMeetingAudioVolume] = useState(0);
  const [isMeetingTextOnly, setIsMeetingTextOnly] = useState(true);
  const [meetingTrackLabel, setMeetingTrackLabel] = useState('');
  const [noiseSuppression, setNoiseSuppression] = useState<boolean>(initialNoiseSuppression);
  const [voiceFocus, setVoiceFocus] = useState<boolean>(initialVoiceFocus);
  const voiceFocusRef = useRef<boolean>(initialVoiceFocus);
  const [voiceFocusLevel, setVoiceFocusLevel] = useState<'balanced' | 'high' | 'aggressive'>('high');
  const voiceFocusLevelRef = useRef<'balanced' | 'high' | 'aggressive'>('high');
  const [isVoiceGated, setIsVoiceGated] = useState<boolean>(true); // true = noise filtered out / silent, false = user voice passing
  const noiseFloorRef = useRef<number>(0.008);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [currentVoice, setCurrentVoice] = useState(voice);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const authenticatedRef = useRef(false);
  const [recentMemoryNotice, setRecentMemoryNotice] = useState<{
    type: 'saved' | 'retrieved';
    text: string;
    timestamp: number;
  } | null>(null);

  // Audio level meters [0.0 - 1.0]
  const [userVolume, setUserVolume] = useState(0);
  const [companionVolume, setCompanionVolume] = useState(0);
  const [currentEmotion, setCurrentEmotion] = useState<AvatarEmotion>('neutral');

  // Camera preview element ref
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // WebSocket ref
  const wsRef = useRef<WebSocket | null>(null);

  // Audio Contexts
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const highPassFilterRef = useRef<BiquadFilterNode | null>(null);
  const speechPeakingFilterRef = useRef<BiquadFilterNode | null>(null);
  const highShelfFilterRef = useRef<BiquadFilterNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const muteGainRef = useRef<GainNode | null>(null);
  const isMicActiveRef = useRef<boolean>(false);
  const isMeetingModeRef = useRef<boolean>(false);
  const isMeetingTextOnlyRef = useRef<boolean>(true);
  const desktopStreamRef = useRef<MediaStream | null>(null);
  const desktopAudioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const desktopProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const desktopGainRef = useRef<GainNode | null>(null);
  const analyserCompanionRef = useRef<AnalyserNode | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextStartTimeRef = useRef<number>(0);
  const isCompanionSpeakingRef = useRef<boolean>(false);
  const speechEndTimerRef = useRef<any>(null);
  const thinkingTimeoutRef = useRef<any>(null);
  const hasUserSpokenRecentlyRef = useRef<boolean>(false);
  const isScreenSharingRef = useRef<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameTimeoutRef = useRef<any>(null);

  // Fetch initial memories from backend
  const refreshMemories = useCallback(async () => {
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/memories', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMemories(data.memories || []);
      } else if (res.status === 401) {
        setMemories([]);
      }
    } catch (err) {
      console.error('Failed to fetch memories:', err);
    }
  }, []);

  useEffect(() => {
    refreshMemories();
  }, [refreshMemories]);

  const speechRecognitionRef = useRef<any>(null);
  const fallbackSpeechIntervalRef = useRef<any>(null);
  const fallbackSpeechSafetyTimerRef = useRef<any>(null);
  const fallbackSpeechActiveRef = useRef(false);
  const fallbackSpeechEnvelopeRef = useRef(0);
  const speechRecognitionNetworkFailedRef = useRef(false);
  const reconnectTimerRef = useRef<any>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const isManualDisconnectRef = useRef<boolean>(false);
  const lastSpeechInterimRef = useRef<string>('');

  const ensureOutputAudio = useCallback(() => {
    if (!outputAudioCtxRef.current || outputAudioCtxRef.current.state === 'closed') {
      outputAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyserCompanionRef.current = null;
    }
    const ctx = outputAudioCtxRef.current;
    if (!analyserCompanionRef.current) {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      analyser.connect(ctx.destination);
      analyserCompanionRef.current = analyser;
    }
    if (ctx.state === 'suspended') {
      // Call this from the mic/text gesture as well as from playback so Chrome
      // has a user-activated output context before the model replies.
      void ctx.resume().catch((error) => console.warn('[Audio] Could not resume output:', error));
    }
    return ctx;
  }, []);

  // Stop all companion audio playback immediately (Barge-in)
  const stopPlayback = useCallback(() => {
    if (speechEndTimerRef.current) {
      clearTimeout(speechEndTimerRef.current);
      speechEndTimerRef.current = null;
    }
    if (fallbackSpeechIntervalRef.current) {
      clearInterval(fallbackSpeechIntervalRef.current);
      fallbackSpeechIntervalRef.current = null;
    }
    if (fallbackSpeechSafetyTimerRef.current) {
      clearTimeout(fallbackSpeechSafetyTimerRef.current);
      fallbackSpeechSafetyTimerRef.current = null;
    }
    fallbackSpeechActiveRef.current = false;
    fallbackSpeechEnvelopeRef.current = 0;
    if (thinkingTimeoutRef.current) {
      clearTimeout(thinkingTimeoutRef.current);
      thinkingTimeoutRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
    activeSourcesRef.current.forEach((source) => {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {
        // Source might already have finished
      }
    });
    activeSourcesRef.current = [];
    nextStartTimeRef.current = 0;
    isCompanionSpeakingRef.current = false;
    setCompanionVolume(0);
    setStatus('listening');
  }, []);

  // Queue PCM chunk for playback at 24kHz with gapless sequential scheduling
  const playAudioChunk = useCallback((base64Data: string) => {
    // If in meeting mode with text-only enabled, do not output sound through speakers
    if (isMeetingModeRef.current && isMeetingTextOnlyRef.current) {
      return;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }

    const ctx = ensureOutputAudio();
    const analyser = analyserCompanionRef.current;
    if (!analyser) return;

    const float32Samples = base64ToPcm24kFloat32(base64Data);
    if (float32Samples.length === 0) return;

    const audioBuffer = ctx.createBuffer(1, float32Samples.length, 24000);
    audioBuffer.getChannelData(0).set(float32Samples);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);

    const currentTime = ctx.currentTime;
    // Sequential scheduling: start either at next scheduled time or immediately + tiny 15ms streaming buffer
    const startTime = Math.max(currentTime + 0.015, nextStartTimeRef.current);

    source.start(startTime);
    nextStartTimeRef.current = startTime + audioBuffer.duration;

    if (thinkingTimeoutRef.current) {
      clearTimeout(thinkingTimeoutRef.current);
      thinkingTimeoutRef.current = null;
    }

    // Clear any pending debounce transition to listening
    if (speechEndTimerRef.current) {
      clearTimeout(speechEndTimerRef.current);
      speechEndTimerRef.current = null;
    }

    isCompanionSpeakingRef.current = true;
    setStatus('speaking');
    activeSourcesRef.current.push(source);

    source.onended = () => {
      const idx = activeSourcesRef.current.indexOf(source);
      if (idx !== -1) {
        activeSourcesRef.current.splice(idx, 1);
      }
      if (activeSourcesRef.current.length === 0) {
        if (speechEndTimerRef.current) clearTimeout(speechEndTimerRef.current);
        speechEndTimerRef.current = setTimeout(() => {
          if (activeSourcesRef.current.length === 0) {
            isCompanionSpeakingRef.current = false;
            setStatus('listening');
            setCompanionVolume(0);
          }
        }, 120);
      }
    };
  }, [ensureOutputAudio]);

  // Fallback spoken voice for speech synthesis with synchronized mouth & lip articulation
  const speakSpokenFallback = useCallback((textToSpeak: string) => {
    if (typeof window === 'undefined' || (isMeetingModeRef.current && isMeetingTextOnlyRef.current)) {
      return;
    }
    // Only speak fallback if no live PCM streaming chunks are playing
    if (activeSourcesRef.current.length > 0) return;

    try {
      if (fallbackSpeechIntervalRef.current) {
        clearInterval(fallbackSpeechIntervalRef.current);
        fallbackSpeechIntervalRef.current = null;
      }
      if (fallbackSpeechSafetyTimerRef.current) {
        clearTimeout(fallbackSpeechSafetyTimerRef.current);
        fallbackSpeechSafetyTimerRef.current = null;
      }
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          window.speechSynthesis.resume();
        } catch (e) {}
      }

      const isFemale = currentVoice === 'Kore' || currentVoice === 'Aoede';

      ensureOutputAudio();

      fallbackSpeechActiveRef.current = true;
      isCompanionSpeakingRef.current = true;
      setStatus('speaking');

      const cleanupSpeech = () => {
        if (fallbackSpeechIntervalRef.current) {
          clearInterval(fallbackSpeechIntervalRef.current);
          fallbackSpeechIntervalRef.current = null;
        }
        if (fallbackSpeechSafetyTimerRef.current) {
          clearTimeout(fallbackSpeechSafetyTimerRef.current);
          fallbackSpeechSafetyTimerRef.current = null;
        }
        fallbackSpeechActiveRef.current = false;
        fallbackSpeechEnvelopeRef.current = 0;
        isCompanionSpeakingRef.current = false;
        setCompanionVolume(0);
        setStatus('listening');
      };

      const wordCount = textToSpeak.split(/\s+/).filter(Boolean).length;
      const estimatedDurationMs = Math.max(2600, Math.min(15000, wordCount * 380 + 1200));
      fallbackSpeechSafetyTimerRef.current = setTimeout(cleanupSpeech, estimatedDurationMs);

      if ('speechSynthesis' in window) {
        const utter = new SpeechSynthesisUtterance(textToSpeak);
        utter.rate = 1.05;
        utter.pitch = isFemale ? 1.15 : 0.95;
        utter.onstart = () => {
          fallbackSpeechActiveRef.current = true;
          isCompanionSpeakingRef.current = true;
          setStatus('speaking');
        };
        let hasWordBoundaries = false;
        utter.onboundary = (event) => {
          if (event.name !== 'word') return;
          hasWordBoundaries = true;
          const word = textToSpeak.slice(event.charIndex).split(/\s/, 1)[0] || '';
          const syllables = Math.max(1, (word.match(/[aeiouy]+/gi) || []).length);
          fallbackSpeechEnvelopeRef.current = Math.min(0.8, 0.24 + syllables * 0.14);
        };

        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
          if (isFemale) {
            const match = voices.find(
              (v) =>
                v.lang.startsWith('en') &&
                (v.name.includes('Female') ||
                  v.name.includes('Samantha') ||
                  v.name.includes('Victoria') ||
                  v.name.includes('Zira') ||
                  v.name.includes('Google US English') ||
                  v.name.includes('Natural'))
            );
            if (match) utter.voice = match;
          } else {
            const match = voices.find(
              (v) =>
                v.lang.startsWith('en') &&
                (v.name.includes('Male') ||
                  v.name.includes('David') ||
                  v.name.includes('Alex') ||
                  v.name.includes('George') ||
                  v.name.includes('Guy'))
            );
            if (match) utter.voice = match;
          }
        }

        let speechPulse = 0;
        fallbackSpeechIntervalRef.current = setInterval(() => {
          if (window.speechSynthesis.speaking) {
            if (hasWordBoundaries) {
              fallbackSpeechEnvelopeRef.current *= 0.82;
              setCompanionVolume(fallbackSpeechEnvelopeRef.current);
            } else {
              // Some browser voices omit boundary events; keep gentle audio-like
              // articulation until speech synthesis finishes in those browsers.
              speechPulse += 0.42;
              setCompanionVolume(0.12 + Math.max(0, Math.sin(speechPulse)) * 0.32);
            }
            setStatus('speaking');
          } else {
            cleanupSpeech();
          }
        }, 75);

        utter.onend = cleanupSpeech;
        utter.onerror = cleanupSpeech;

        window.speechSynthesis.speak(utter);
      } else {
        // SpeechSynthesis not available in this browser: procedural speaking timer
        fallbackSpeechIntervalRef.current = setInterval(() => {
          setCompanionVolume(0.22 + Math.random() * 0.35);
          setStatus('speaking');
        }, 75);
      }
    } catch (err) {
      console.warn('Fallback speech notice:', err);
    }
  }, [currentVoice, ensureOutputAudio]);

  // Companion audio level monitoring
  useEffect(() => {
    let animId: number;
    const updateCompanionLevel = () => {
      if (fallbackSpeechActiveRef.current && isCompanionSpeakingRef.current) {
        // SpeechSynthesis audio is browser-managed, so retain its word-timed
        // visual envelope instead of replacing it with the silent Web Audio analyser.
      } else if (analyserCompanionRef.current && isCompanionSpeakingRef.current) {
        const data = new Uint8Array(analyserCompanionRef.current.frequencyBinCount);
        analyserCompanionRef.current.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          sum += data[i];
        }
        const avg = sum / (data.length * 255);
        setCompanionVolume(Math.min(1, avg * 2.2));
      } else {
        setCompanionVolume(0);
      }
      animId = requestAnimationFrame(updateCompanionLevel);
    };
    animId = requestAnimationFrame(updateCompanionLevel);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Capture single JPEG frame from video feed (reusing persistent canvas)
  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) {
      return null;
    }
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    const canvas = canvasRef.current;
    // For screen sharing, preserve balanced resolution (800 maxDim) so text and code are crisp without network congestion.
    // For camera, 600 maxDim is optimal for low-latency facial presence.
    const maxDim = isScreenSharingRef.current ? 800 : 600;
    let w = video.videoWidth;
    let h = video.videoHeight;
    if (w > maxDim || h > maxDim) {
      if (w > h) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
    }
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    // Lower JPEG quality reduces payload from 250KB to ~35KB, keeping WebSocket audio crystal-clear
    const quality = isScreenSharingRef.current ? 0.58 : 0.60;
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    return dataUrl.split(',')[1] || null;
  }, []);

  // Adaptive video frame streaming: paces frames based on companion speaking state
  const startFrameStreaming = useCallback(() => {
    if (frameTimeoutRef.current) {
      clearTimeout(frameTimeoutRef.current);
      frameTimeoutRef.current = null;
    }

    const streamNext = () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const frame = captureFrame();
        if (frame && authenticatedRef.current) {
          wsRef.current.send(JSON.stringify({ type: 'video', data: frame }));
        }
      }
      // When companion is speaking, relax video streaming to 3600ms so large video frames
      // do not congest the WebSocket or disrupt the ongoing real-time audio!
      // When listening, stream every 2200ms for responsive visual awareness without socket starvation.
      const interval = isCompanionSpeakingRef.current ? 3600 : 2200;
      frameTimeoutRef.current = setTimeout(streamNext, interval);
    };

    streamNext();
  }, [captureFrame]);

  const stopFrameStreaming = useCallback(() => {
    if (frameTimeoutRef.current) {
      clearTimeout(frameTimeoutRef.current);
      frameTimeoutRef.current = null;
    }
  }, []);

  // Send manual video snapshot
  const sendSnapshot = useCallback(() => {
    const frame = captureFrame();
    if (frame && wsRef.current && wsRef.current.readyState === WebSocket.OPEN && authenticatedRef.current) {
      wsRef.current.send(JSON.stringify({ type: 'video', data: frame }));
      setRecentMemoryNotice({
        type: 'retrieved',
        text: 'Examined camera frame',
        timestamp: Date.now(),
      });
    }
  }, [captureFrame]);

  // Connect to WebSocket Live Server
  // Connect to WebSocket Live Server with resilient reconnection
  const connect = useCallback((targetVoice = currentVoice) => {
    isManualDisconnectRef.current = false;

    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setStatus('connecting');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/live`;
    let ws: WebSocket;

    try {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;
    } catch (e) {
      console.warn('[Live Hook] WebSocket creation notice:', e);
      setIsConnected(true);
      setStatus('listening');
      return;
    }

    ws.onopen = async () => {
      reconnectAttemptsRef.current = 0;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      try {
        const token = await getAuthToken();
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: 'auth', token }));
      } catch (authError) {
        console.warn('[Auth] Could not authenticate live connection:', authError);
        setVoiceInputNotice('Sign in again to start a voice session.');
        isManualDisconnectRef.current = true;
        ws.close();
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'authenticated') {
          authenticatedRef.current = true;
          setIsConnected(true);
          setStatus('listening');
          ws.send(JSON.stringify({
            type: 'init',
            voice: targetVoice,
            voiceFocus,
            micActive: isMicActiveRef.current,
          }));
        } else if (msg.type === 'auth_error') {
          setVoiceInputNotice(msg.message || 'Sign-in is required for voice.');
          isManualDisconnectRef.current = true;
          ws.close();
        } else if (msg.type === 'ready') {
          // A Live session can announce readiness before its first failure.
          // Preserve a pending turn so the response watchdog can use REST/TTS.
          setStatus((current) => current === 'thinking' ? current : 'listening');
          refreshMemories();
        } else if (msg.type === 'voice_focus_updated') {
          setVoiceFocus(!!msg.voiceFocus);
        } else if (msg.type === 'audio') {
          // Playback 24kHz PCM audio chunk
          playAudioChunk(msg.data);
        } else if (msg.type === 'interrupted') {
          // Gemini detected interruption -> barge-in!
          stopPlayback();
          setStatus('interrupted');
          setTimeout(() => setStatus('listening'), 300);
        } else if (msg.type === 'turn_complete') {
          if (activeSourcesRef.current.length === 0) {
            setStatus('listening');
          }
        } else if (msg.type === 'transcript') {
          const { cleanText, emotion: parsedEmotion } = msg.role === 'assistant'
            ? extractEmotionFromText(msg.text || '')
            : { cleanText: msg.text || '', emotion: 'neutral' as AvatarEmotion };

          if (msg.role === 'assistant') {
            setCurrentEmotion(parsedEmotion);
            if (activeSourcesRef.current.length === 0) {
              speakSpokenFallback(cleanText);
            }
          }

          setTranscripts((prev) => {
            const last = prev[prev.length - 1];
            if (msg.role === 'assistant' && last && last.role === 'assistant' && last.isPartial) {
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  text: cleanText || last.text,
                  isPartial: false,
                  emotion: parsedEmotion,
                },
              ];
            }
            return [
              ...prev,
              {
                id: 'tr-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5),
                role: msg.role === 'user' ? 'user' : 'assistant',
                text: cleanText,
                emotion: parsedEmotion,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              },
            ];
          });
        } else if (msg.type === 'transcript_chunk') {
          // Append streaming assistant text
          setTranscripts((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant' && last.isPartial) {
              return [
                ...prev.slice(0, -1),
                { ...last, text: last.text + msg.text },
              ];
            } else {
              return [
                ...prev,
                {
                  id: 'tr-' + Date.now(),
                  role: 'assistant',
                  text: msg.text,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  isPartial: true,
                },
              ];
            }
          });
        } else if (msg.type === 'memory_saved') {
          // Silent tool execution notification in HUD
          setRecentMemoryNotice({
            type: 'saved',
            text: `Remembered: "${msg.memory.summary}"`,
            timestamp: Date.now(),
          });
          refreshMemories();
        } else if (msg.type === 'memory_retrieved') {
          if (msg.count > 0) {
            setRecentMemoryNotice({
              type: 'retrieved',
              text: `Recalled ${msg.count} context record(s) on "${msg.query}"`,
              timestamp: Date.now(),
            });
          }
        } else if (msg.type === 'session_closed' || msg.type === 'error') {
          console.warn('[Live Hook] Notification:', msg.type, msg.message || msg.reason);
          // Keep an in-flight request in "thinking" so its watchdog can route
          // it through the HTTP/text-to-speech fallback after a Live API drop.
          setStatus((current) => current === 'thinking' ? current : 'listening');
        }
      } catch (err) {
        console.warn('[Live Hook] Message handling notice:', err);
      }
    };

    ws.onerror = (_err) => {
      // Graceful notice instead of uncaught console.error
      console.warn('[Live Hook] WebSocket connection notice, maintaining active conversational readiness...');
    };

    ws.onclose = () => {
      authenticatedRef.current = false;
      wsRef.current = null;
      if (isManualDisconnectRef.current) {
        setIsConnected(false);
        setStatus('idle');
        stopPlayback();
        stopMic();
        stopMeetingMode();
        return;
      }

      // Transparent automatic reconnect with backoff
      const attempts = reconnectAttemptsRef.current;
      reconnectAttemptsRef.current++;

      // After initial attempt in browser environments, keep UI connected & responsive
      if (attempts >= 1) {
        setIsConnected(true);
        setStatus('listening');
      } else {
        setStatus('connecting');
      }

      const backoffDelay = Math.min(1000 * Math.pow(1.4, attempts), 5000);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        if (!isManualDisconnectRef.current) {
          connect(targetVoice);
        }
      }, backoffDelay);
    };
  }, [currentVoice, playAudioChunk, refreshMemories, stopPlayback, voiceFocus]);

  // Auto-connect to live companion session on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [autoConnect, connect]);

  // Stop desktop meeting audio capture completely
  const stopMeetingMode = useCallback(() => {
    isMeetingModeRef.current = false;
    setIsMeetingMode(false);
    setMeetingAudioVolume(0);
    setMeetingTrackLabel('');

    if (desktopProcessorRef.current) {
      desktopProcessorRef.current.onaudioprocess = null;
      try {
        desktopProcessorRef.current.disconnect();
      } catch (e) {}
      desktopProcessorRef.current = null;
    }

    if (desktopGainRef.current) {
      try {
        desktopGainRef.current.disconnect();
      } catch (e) {}
      desktopGainRef.current = null;
    }

    if (desktopAudioSourceRef.current) {
      try {
        desktopAudioSourceRef.current.disconnect();
      } catch (e) {}
      desktopAudioSourceRef.current = null;
    }

    if (desktopStreamRef.current) {
      desktopStreamRef.current.getTracks().forEach((track) => {
        try {
          track.enabled = false;
          track.stop();
        } catch (e) {}
      });
      desktopStreamRef.current = null;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && authenticatedRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'set_meeting_mode', enabled: false }));
      } catch (e) {}
    }
  }, []);

  // Stop microphone completely, disabling hardware tracks, detaching listeners, and notifying server
  const stopMic = useCallback(() => {
    isMicActiveRef.current = false;
    setIsMicActive(false);
    setUserVolume(0);

    // Notify backend immediately so server-side gate discards any pending audio
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && authenticatedRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'mic_state', active: false }));
      } catch (e) {}
    }

    // 1. Detach processor callback and disconnect node
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.onaudioprocess = null;
      try {
        scriptProcessorRef.current.disconnect();
      } catch (e) {}
      scriptProcessorRef.current = null;
    }

    // 2. Disconnect DSP filters
    if (highPassFilterRef.current) {
      try {
        highPassFilterRef.current.disconnect();
      } catch (e) {}
      highPassFilterRef.current = null;
    }
    if (speechPeakingFilterRef.current) {
      try {
        speechPeakingFilterRef.current.disconnect();
      } catch (e) {}
      speechPeakingFilterRef.current = null;
    }
    if (highShelfFilterRef.current) {
      try {
        highShelfFilterRef.current.disconnect();
      } catch (e) {}
      highShelfFilterRef.current = null;
    }
    if (compressorRef.current) {
      try {
        compressorRef.current.disconnect();
      } catch (e) {}
      compressorRef.current = null;
    }
    if (muteGainRef.current) {
      try {
        muteGainRef.current.disconnect();
      } catch (e) {}
      muteGainRef.current = null;
    }

    // 3. Disconnect media stream source
    if (mediaStreamSourceRef.current) {
      try {
        mediaStreamSourceRef.current.disconnect();
      } catch (e) {}
      mediaStreamSourceRef.current = null;
    }

    // 4. Disable and stop all mic audio tracks hardware-level
    if (micStreamRef.current) {
      micStreamRef.current.getAudioTracks().forEach((track) => {
        try {
          track.enabled = false;
          track.stop();
        } catch (e) {}
      });
      micStreamRef.current = null;
    }

    // Stop continuous browser speech recognition
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.onresult = null;
        speechRecognitionRef.current.onerror = null;
        speechRecognitionRef.current.onend = null;
        speechRecognitionRef.current.abort();
      } catch (e) {}
      speechRecognitionRef.current = null;
    }

    // 5. Suspend input AudioContext so no hardware audio thread clocks in background
    if (inputAudioCtxRef.current && inputAudioCtxRef.current.state === 'running') {
      inputAudioCtxRef.current.suspend().catch(() => {});
    }
  }, []);

  // Disconnect WebSocket and release mic
  const disconnect = useCallback(() => {
    isManualDisconnectRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    stopPlayback();
    stopMic();
    stopMeetingMode();
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {}
      wsRef.current = null;
    }
    setIsConnected(false);
    setStatus('idle');
  }, [stopPlayback, stopMic, stopMeetingMode]);

  // Send text message (for keyboard mode or transcribed speech)
  const sendTextMessage = useCallback((text: string) => {
    if (!text.trim()) return;
    setVoiceInputNotice('');
    try {
      ensureOutputAudio();
    } catch (error) {
      console.warn('[Audio] Output will use browser speech fallback:', error);
    }
    setTranscripts((prev) => [
      ...prev,
      {
        id: 'tr-' + Date.now(),
        role: 'user',
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);

    if (thinkingTimeoutRef.current) clearTimeout(thinkingTimeoutRef.current);
    thinkingTimeoutRef.current = setTimeout(() => {
      setStatus((s) => (s === 'thinking' ? 'listening' : s));
    }, 6000);

    const triggerHttpFallback = async () => {
      try {
        const frame = captureFrame();
        const token = await getAuthToken();
        const response = await fetch('/api/companion/talk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            prompt: text,
            imageBase64: frame ? `data:image/jpeg;base64,${frame}` : undefined,
            history: transcripts.slice(-6),
            fastFallback: true,
          }),
        });
        if (!response.ok) throw new Error(`Assistant request failed (${response.status}).`);
        const data = await response.json();
        if (!data.text) return;
        const { cleanText, emotion: parsedEmotion } = extractEmotionFromText(data.text);
        setCurrentEmotion(parsedEmotion);
        speakSpokenFallback(cleanText);
        setTranscripts((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && last.text === cleanText) return prev;
          return [
            ...prev,
            {
              id: 'tr-' + Date.now(),
              role: 'assistant',
              text: cleanText,
              emotion: parsedEmotion,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ];
        });
      } catch (err) {
        console.warn('[Live Hook] HTTP turn notice:', err);
        setStatus('listening');
      }
    };

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && authenticatedRef.current) {
      const imageBase64 = captureFrame();
      wsRef.current.send(JSON.stringify({
        type: 'text',
        text,
        imageBase64: imageBase64 || undefined,
        history: transcripts.slice(-6),
      }));
      setStatus('thinking');

      // Watchdog: If WS response is delayed > 4s, trigger HTTP conversational engine
      const wsWatchdog = setTimeout(() => {
        setStatus((cur) => {
          if (cur === 'thinking') {
            triggerHttpFallback();
          }
          return cur;
        });
      }, 4000);
      thinkingTimeoutRef.current = wsWatchdog;
    } else {
      // WS not connected: seamless REST conversational turn
      setStatus('thinking');
      triggerHttpFallback();
    }
  }, [captureFrame, transcripts, speakSpokenFallback, ensureOutputAudio]);

  // Microphone Audio Stream Setup with Studio Vocal Focus & Echo Suppression
  const startMic = useCallback(async () => {
    try {
      setVoiceInputNotice('Requesting microphone access…');
      try {
        ensureOutputAudio();
      } catch (error) {
        console.warn('[Audio] Output will use browser speech fallback:', error);
      }
      // Clean up any existing mic nodes first
      stopMic();

      if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        throw new DOMException('Microphone access requires HTTPS.', 'SecurityError');
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new DOMException('This browser does not support microphone capture.', 'NotSupportedError');
      }
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) {
        throw new DOMException('This browser does not support Web Audio.', 'NotSupportedError');
      }

      if (!inputAudioCtxRef.current || inputAudioCtxRef.current.state === 'closed') {
        inputAudioCtxRef.current = new AudioContextCtor();
      }
      const audioCtx = inputAudioCtxRef.current;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          channelCount: 1,
        },
      });
      micStreamRef.current = stream;

      const source = audioCtx.createMediaStreamSource(stream);
      mediaStreamSourceRef.current = source;

      // Low-latency buffer (2048 samples = ~43ms chunk latency for crisp response)
      const bufferSize = 2048;
      const processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
      scriptProcessorRef.current = processor;

      // 1. High-Pass Filter: Cuts sub-audible desk thumps, AC hum, and fan rumblings below 120Hz
      const highPass = audioCtx.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = voiceFocusRef.current ? 125 : 85;
      highPass.Q.value = 0.8;
      highPassFilterRef.current = highPass;

      // 2. Vocal Formant Peaking Filter: Enhances vocal articulation, consonants, and clarity (2.4 kHz)
      const speechPeaking = audioCtx.createBiquadFilter();
      speechPeaking.type = 'peaking';
      speechPeaking.frequency.value = 2400;
      speechPeaking.gain.value = voiceFocusRef.current ? 3.5 : 2.0;
      speechPeaking.Q.value = 1.1;
      speechPeakingFilterRef.current = speechPeaking;

      // 3. High-Shelf Filter: Tames harsh high-frequency digital sibilance, mic hiss, and key clicks
      const highShelf = audioCtx.createBiquadFilter();
      highShelf.type = 'highshelf';
      highShelf.frequency.value = 7200;
      highShelf.gain.value = -3.0;
      highShelfFilterRef.current = highShelf;

      // 4. Studio Dynamics Compressor: Levels user voice for punchy, rich vocal volume without clipping or whisper dropouts
      const compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 6;
      compressor.ratio.value = 3.5;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.080;
      compressorRef.current = compressor;

      // 5. Zero-Gain Mute Node: Keeps Web Audio graph clocking in Chrome without playing mic audio out of speakers!
      const muteGain = audioCtx.createGain();
      muteGain.gain.value = 0;
      muteGainRef.current = muteGain;

      let consecutiveLoudFrames = 0;
      let speechHangoverFrames = 0;

      processor.onaudioprocess = (e) => {
        // STRICT GUARD: If mic is turned off / muted, zero meter and abort immediately
        if (!isMicActiveRef.current) {
          setUserVolume(0);
          setIsVoiceGated(true);
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);
        const volume = computeRmsVolume(inputData);
        setUserVolume(Math.min(1, volume * 5));

        // When companion is speaking through speakers:
        if (isCompanionSpeakingRef.current) {
          // Acoustic echo suppression & barge-in protection:
          // Ignore speaker bleed into mic. Require clear, intentional user speech to interrupt (> 0.20 RMS for 2 consecutive frames ~90ms)
          const bargeInThreshold = voiceFocusRef.current ? 0.20 : 0.16;
          if (volume > bargeInThreshold) {
            consecutiveLoudFrames++;
            if (consecutiveLoudFrames >= 2) {
              console.log('[Barge-In] Intentional user voice override detected - interrupting AI speech');
              stopPlayback();
              consecutiveLoudFrames = 0;
              speechHangoverFrames = 12;
              setIsVoiceGated(false);
              setStatus('listening');
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && authenticatedRef.current) {
                wsRef.current.send(JSON.stringify({ type: 'barge_in' }));
                const base64Audio = pcm16kToBase64(inputData, audioCtx.sampleRate);
                wsRef.current.send(JSON.stringify({ type: 'audio', data: base64Audio }));
              }
            }
          } else {
            consecutiveLoudFrames = 0;
            setIsVoiceGated(true);
            // Suppress speaker feedback: Do NOT send echoed voice or background noise back into Gemini!
            return;
          }
        } else {
          // Companion is listening:
          consecutiveLoudFrames = 0;

          // Adaptive noise floor tracking: adapt slowly when volume is low
          if (volume < noiseFloorRef.current * 1.6) {
            noiseFloorRef.current = noiseFloorRef.current * 0.97 + volume * 0.03;
          }

          // Voice gate UI state: show LISTENING badge when user is speaking
          const speechThreshold = voiceFocusRef.current
            ? Math.max(0.010, noiseFloorRef.current * 1.6)
            : 0.007;

          if (volume >= speechThreshold) {
            speechHangoverFrames = 10;
            setIsVoiceGated(false);
            hasUserSpokenRecentlyRef.current = true;
          } else if (speechHangoverFrames > 0) {
            speechHangoverFrames--;
            setIsVoiceGated(false);
            if (speechHangoverFrames === 0 && hasUserSpokenRecentlyRef.current && !isCompanionSpeakingRef.current) {
              // User just finished speaking! Immediately switch to 'thinking'
              hasUserSpokenRecentlyRef.current = false;
              setStatus('thinking');

              // If SpeechRecognition had pending interim text, dispatch it immediately!
              if (lastSpeechInterimRef.current) {
                const textToSend = lastSpeechInterimRef.current;
                lastSpeechInterimRef.current = '';
                sendTextMessage(textToSend);
              }

              // Watchdog timer: if model takes > 8s, fall back to listening so avatar never gets stuck
              if (thinkingTimeoutRef.current) clearTimeout(thinkingTimeoutRef.current);
              thinkingTimeoutRef.current = setTimeout(() => {
                setStatus('listening');
              }, 8000);
            }
          } else {
            setIsVoiceGated(true);
          }

          // Stream continuous, pristine 16kHz PCM audio to Gemini Live
          // Gemini's server-side neural VAD processes complete utterances without dropped syllables!
          if (isMicActiveRef.current && wsRef.current && wsRef.current.readyState === WebSocket.OPEN && authenticatedRef.current) {
            const base64Audio = pcm16kToBase64(inputData, audioCtx.sampleRate);
            wsRef.current.send(JSON.stringify({ type: 'audio', data: base64Audio }));
          }
        }
      };

      // Connect vocal DSP chain: source -> highPass -> speechPeaking -> highShelf -> compressor -> processor -> muteGain -> destination
      source.connect(highPass);
      highPass.connect(speechPeaking);
      speechPeaking.connect(highShelf);
      highShelf.connect(compressor);
      compressor.connect(processor);
      processor.connect(muteGain);
      muteGain.connect(audioCtx.destination);

      isMicActiveRef.current = true;
      setIsMicActive(true);
      setVoiceInputNotice('Microphone is on. Speak now.');

      // Initialize browser SpeechRecognition for continuous speech-to-text turns
      const SpeechRec = typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;

      if (SpeechRec) {
        try {
          speechRecognitionNetworkFailedRef.current = false;
          if (speechRecognitionRef.current) {
            try { speechRecognitionRef.current.abort(); } catch (e) {}
          }
          const rec = new SpeechRec();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = 'en-US';
          rec.maxAlternatives = 1;

          // Prefer browser on-device recognition when this experimental API is
          // available. It avoids the remote speech service that has been
          // returning network errors for this user.
          const supportsLocalRecognition = typeof SpeechRec.available === 'function'
            && typeof SpeechRec.install === 'function'
            && 'processLocally' in rec;
          if (supportsLocalRecognition) {
            try {
              let availability = await SpeechRec.available({ langs: [rec.lang], processLocally: true });
              if (availability === 'downloadable' || availability === 'downloading') {
                setVoiceInputNotice('Preparing offline voice recognition…');
                const installed = await SpeechRec.install({ langs: [rec.lang], processLocally: true });
                availability = installed ? 'available' : availability;
              }
              if (availability === 'available') {
                rec.processLocally = true;
                setVoiceInputNotice('Offline voice recognition is ready.');
              }
            } catch (localRecognitionError) {
              console.warn('[SpeechRecognition] On-device recognition unavailable:', localRecognitionError);
            }
          }

          rec.onresult = (evt: any) => {
            if (!isMicActiveRef.current) return;
            if (isCompanionSpeakingRef.current) {
              stopPlayback();
            }

            let interim = '';
            for (let i = evt.resultIndex; i < evt.results.length; ++i) {
              const res = evt.results[i];
              const piece = res[0]?.transcript || '';
              if (res.isFinal) {
                const phrase = piece.trim();
                if (phrase) {
                  lastSpeechInterimRef.current = '';
                  console.log('[SpeechRecognition] Recognized utterance:', phrase);
                  sendTextMessage(phrase);
                }
              } else {
                interim += piece;
              }
            }
            if (interim) {
              lastSpeechInterimRef.current = interim.trim();
              setUserVolume(0.35 + Math.random() * 0.25);
            }
          };

          rec.onerror = (evt: any) => {
            if (evt.error === 'network') {
              speechRecognitionNetworkFailedRef.current = true;
              setVoiceInputNotice(rec.processLocally
                ? 'Offline speech recognition stopped. Restart the mic or use the message box.'
                : 'This browser has no offline speech pack and its online speech service is unavailable. Use the message box or try Chrome with offline speech recognition.');
              console.warn('[SpeechRecognition] Speech recognition is unavailable; use the text input or enable an available offline speech pack.');
            } else if (evt.error !== 'no-speech' && evt.error !== 'aborted') {
              console.warn('[SpeechRecognition] notice:', evt.error);
            }
          };

          rec.onend = () => {
            if (isMicActiveRef.current && !speechRecognitionNetworkFailedRef.current) {
              try {
                rec.start();
              } catch (e) {}
            }
          };

          rec.start();
          speechRecognitionRef.current = rec;
          console.log('[SpeechRecognition] Voice speech recognition active');
        } catch (recErr) {
          console.warn('[SpeechRecognition] Web Speech error:', recErr);
        }
      }

      // Notify backend that mic is now active
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && authenticatedRef.current) {
        wsRef.current.send(JSON.stringify({ type: 'mic_state', active: true }));
      }

      // Auto-connect WS if not already connected
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        connect();
      }
    } catch (err: any) {
      const message = microphoneErrorMessage(err);
      console.warn('[Live Hook] Could not start microphone:', err?.name || 'unknown error');
      stopMic();
      isMicActiveRef.current = false;
      setIsMicActive(false);
      setUserVolume(0);
      setIsVoiceGated(true);
      setVoiceInputNotice(message);
    }
  }, [connect, ensureOutputAudio, stopMic, stopPlayback, sendTextMessage]);

  // Dynamically update voice focus mode, vocal DSP filtering and session directives
  const setVoiceFocusEnabled = useCallback((enabled: boolean) => {
    setVoiceFocus(enabled);
    voiceFocusRef.current = enabled;
    if (highPassFilterRef.current) {
      highPassFilterRef.current.frequency.value = enabled ? 125 : 85;
    }
    if (speechPeakingFilterRef.current) {
      speechPeakingFilterRef.current.gain.value = enabled ? 3.5 : 2.0;
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && authenticatedRef.current) {
      wsRef.current.send(JSON.stringify({
        type: 'set_voice_focus',
        enabled,
        level: voiceFocusLevelRef.current,
      }));
    }
  }, []);

  // Update voice focus intensity level
  const setVoiceFocusLevelHandler = useCallback((level: 'balanced' | 'high' | 'aggressive') => {
    setVoiceFocusLevel(level);
    voiceFocusLevelRef.current = level;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && authenticatedRef.current) {
      wsRef.current.send(JSON.stringify({
        type: 'set_voice_focus',
        enabled: voiceFocusRef.current,
        level,
      }));
    }
  }, []);

  // Dynamically update noise suppression constraint on active microphone tracks
  const setNoiseSuppressionEnabled = useCallback(async (enabled: boolean) => {
    setNoiseSuppression(enabled);
    if (micStreamRef.current) {
      const audioTracks = micStreamRef.current.getAudioTracks();
      for (const track of audioTracks) {
        try {
          await track.applyConstraints({
            noiseSuppression: enabled,
          });
          console.log(`[AudioTrack] Applied noiseSuppression=${enabled} to track ${track.label}`);
        } catch (err) {
          console.warn('[AudioTrack] Failed to apply noiseSuppression constraint:', err);
        }
      }
    }
  }, []);

  // Stop camera & vision streaming
  const stopCamera = useCallback(() => {
    stopFrameStreaming();
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (isScreenSharingRef.current) {
      isScreenSharingRef.current = false;
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && authenticatedRef.current) {
        wsRef.current.send(JSON.stringify({ type: 'screen_share_state', active: false }));
      }
    }
    setIsCameraActive(false);
    setIsScreenSharing(false);
  }, [stopFrameStreaming]);

  // Camera video stream setup
  const startCamera = useCallback(async (preferredFacing: 'user' | 'environment' = 'user') => {
    try {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      stopFrameStreaming();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: preferredFacing,
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });
      cameraStreamRef.current = stream;
      isScreenSharingRef.current = false;
      setIsScreenSharing(false);
      setIsCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      startFrameStreaming();
    } catch (err: any) {
      if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') {
        console.warn('[Live Hook] Camera permission not granted or dismissed by user.');
      } else {
        console.error('Error starting camera:', err);
      }
      setIsCameraActive(false);
    }
  }, [startFrameStreaming, stopFrameStreaming]);

  // Screen share stream setup
  const startScreenShare = useCallback(async () => {
    try {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      stopFrameStreaming();
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      cameraStreamRef.current = stream;
      isScreenSharingRef.current = true;
      setIsScreenSharing(true);
      setIsCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      // Notify Gemini Live that screen sharing is active
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && authenticatedRef.current) {
        wsRef.current.send(JSON.stringify({ type: 'screen_share_state', active: true }));
      }

      // Automatically ensure microphone is active so user can speak about their screen
      if (!isMicActiveRef.current) {
        startMic();
      }

      // Listen for browser "Stop sharing" button
      stream.getVideoTracks()[0].onended = () => {
        stopCamera();
      };

      startFrameStreaming();
    } catch (err: any) {
      if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') {
        console.warn('[Live Hook] Screen share selection was dismissed by user.');
      } else {
        console.error('Error starting screen share:', err);
      }
    }
  }, [startFrameStreaming, stopCamera, stopFrameStreaming, startMic]);

  // Change Companion Voice
  const changeVoice = useCallback((newVoice: string) => {
    setCurrentVoice(newVoice);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && authenticatedRef.current) {
      wsRef.current.send(JSON.stringify({ type: 'init', voice: newVoice }));
    }
  }, []);

  // Start Desktop / Meeting Audio Capture Mode (WebRTC getDisplayMedia audio or Microphone fallback)
  const startMeetingMode = useCallback(async (sourceType: 'desktop' | 'mic' = 'desktop'): Promise<{ success: boolean; cancelled?: boolean; error?: string; message?: string }> => {
    try {
      stopMeetingMode();

      // If user requested microphone meeting mode directly
      if (sourceType === 'mic') {
        await startMic();
        isMeetingModeRef.current = true;
        setIsMeetingMode(true);
        setMeetingTrackLabel('Microphone (Silent Meeting Mode)');
        isMeetingTextOnlyRef.current = true;
        setIsMeetingTextOnly(true);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && authenticatedRef.current) {
          wsRef.current.send(JSON.stringify({ type: 'set_meeting_mode', enabled: true }));
        }
        return { success: true };
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        // Automatically fallback to microphone if getDisplayMedia is unsupported in this environment
        console.info('[Meeting Mode] getDisplayMedia unavailable; falling back to microphone meeting mode.');
        return await startMeetingMode('mic');
      }

      // Request display media with audio enabled
      // Note: boolean audio: true has the highest cross-browser compatibility
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        return {
          success: false,
          error: 'no_audio',
          message: 'No desktop audio track was selected. When selecting a Chrome Tab or Screen, make sure to check "Share tab audio" or "Share system audio". Alternatively, you can use your Microphone for Meeting Mode.',
        };
      }

      desktopStreamRef.current = stream;
      const audioTrack = audioTracks[0];
      setMeetingTrackLabel(audioTrack.label || 'Meeting Desktop Sound');

      if (!inputAudioCtxRef.current || inputAudioCtxRef.current.state === 'closed') {
        inputAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const audioCtx = inputAudioCtxRef.current;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const desktopSource = audioCtx.createMediaStreamSource(new MediaStream([audioTrack]));
      desktopAudioSourceRef.current = desktopSource;

      // Silent gain node to guarantee zero loopback to local speakers
      const silentGain = audioCtx.createGain();
      silentGain.gain.value = 0.0;
      desktopGainRef.current = silentGain;

      const processor = audioCtx.createScriptProcessor(2048, 1, 1);
      desktopProcessorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!isMeetingModeRef.current) {
          setMeetingAudioVolume(0);
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);
        const volume = computeRmsVolume(inputData);
        setMeetingAudioVolume(Math.min(1, volume * 5));

        // Stream 16kHz PCM desktop audio to Gemini Live
        if (isMeetingModeRef.current && wsRef.current && wsRef.current.readyState === WebSocket.OPEN && authenticatedRef.current) {
          const base64Audio = pcm16kToBase64(inputData, audioCtx.sampleRate);
          wsRef.current.send(JSON.stringify({ type: 'audio', data: base64Audio }));
        }
      };

      desktopSource.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioCtx.destination);

      // If meeting presentation video track is available, feed into vision preview
      if (videoRef.current && stream.getVideoTracks().length > 0) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
        setIsCameraActive(true);
        setIsScreenSharing(true);

        isScreenSharingRef.current = true;
        startFrameStreaming();
      }

      // Auto-cleanup when user stops sharing via browser bar
      audioTrack.onended = () => {
        stopMeetingMode();
      };
      if (stream.getVideoTracks().length > 0) {
        stream.getVideoTracks()[0].onended = () => {
          stopMeetingMode();
        };
      }

      isMeetingModeRef.current = true;
      setIsMeetingMode(true);

      // Connect or send mode directive
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        connect();
      } else if (authenticatedRef.current) {
        wsRef.current.send(JSON.stringify({ type: 'set_meeting_mode', enabled: true }));
      }

      return { success: true };
    } catch (err: any) {
      stopMeetingMode();

      // Check if user dismissed / cancelled the share picker dialog or permission denied
      const isCancellationOrDenied =
        err?.name === 'NotAllowedError' ||
        err?.name === 'AbortError' ||
        err?.name === 'SecurityError' ||
        (typeof err?.message === 'string' && (
          err.message.toLowerCase().includes('permission denied') ||
          err.message.toLowerCase().includes('permission dismissed') ||
          err.message.toLowerCase().includes('user denied') ||
          err.message.toLowerCase().includes('canceled') ||
          err.message.toLowerCase().includes('cancelled')
        ));

      if (isCancellationOrDenied) {
        console.info('[Meeting Mode] Desktop audio permission was dismissed or not granted by user.');
        return {
          success: false,
          cancelled: true,
          error: 'permission_denied',
          message: 'Desktop audio sharing permission was dismissed or not granted. You can retry with "Share audio" selected, or switch to Microphone Meeting Mode instead!',
        };
      }

      console.warn('[Meeting Mode] Could not start desktop audio capture:', err?.message || err);
      return {
        success: false,
        error: err?.name || 'unknown_error',
        message: err?.message || 'Could not start desktop audio capture.',
      };
    }
  }, [connect, startFrameStreaming, stopMeetingMode]);

  const setMeetingTextOnly = useCallback((enabled: boolean) => {
    setIsMeetingTextOnly(enabled);
    isMeetingTextOnlyRef.current = enabled;
  }, []);

  // Clean up on unmount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      isManualDisconnectRef.current = true;
      authenticatedRef.current = false;
      stopPlayback();
      stopMic();
      stopMeetingMode();
      stopCamera();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    status,
    isConnected,
    isMicActive,
    voiceInputNotice,
    isMeetingMode,
    meetingAudioVolume,
    isMeetingTextOnly,
    meetingTrackLabel,
    noiseSuppression,
    voiceFocus,
    voiceFocusLevel,
    isVoiceGated,
    isCameraActive,
    isScreenSharing,
    currentVoice,
    userVolume,
    companionVolume,
    currentEmotion,
    transcripts,
    memories,
    recentMemoryNotice,
    videoRef,
    connect,
    disconnect,
    startMic,
    stopMic,
    startMeetingMode,
    stopMeetingMode,
    setMeetingTextOnly,
    setNoiseSuppressionEnabled,
    setVoiceFocusEnabled,
    setVoiceFocusLevel: setVoiceFocusLevelHandler,
    startCamera,
    stopCamera,
    startScreenShare,
    changeVoice,
    sendTextMessage,
    sendSnapshot,
    stopPlayback,
    refreshMemories,
    getAudioAnalyser: useCallback(() => analyserCompanionRef.current, []),
  };
}
