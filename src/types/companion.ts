export interface MemoryItem {
  id: string;
  category: 'project' | 'preference' | 'technical' | 'bug' | 'personal' | 'general';
  summary: string;
  detail?: string;
  tags?: string[];
  createdAt: string;
  updatedAt?: string;
  pinned?: boolean;
}

export type CompanionStatus = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'interrupted' | 'error';

export type AvatarEmotion =
  | 'neutral'
  | 'thoughtful'
  | 'analytical'
  | 'happy'
  | 'empathetic'
  | 'curious'
  | 'calm'
  | 'excited'
  | 'sad'
  | 'concerned'
  | 'surprised'
  | 'confused'
  | 'frustrated';

export interface TranscriptEntry {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
  isPartial?: boolean;
  interrupted?: boolean;
  toolNotice?: string;
  emotion?: AvatarEmotion;
}

export interface LiveVoice {
  id: string;
  name: string;
  gender: 'female' | 'male' | 'neutral';
  tone: string;
  description: string;
}

export interface CompanionSettings {
  voice: string;
  voiceFocus: boolean;
  noiseSuppression: boolean;
  visionEnabled: boolean;
  visionFps: number; // 0.5 to 1 fps
  autoBargeIn: boolean;
  micSensitivity: number; // threshold 0.01 to 0.1
  speechSynthesisFallback: boolean;
  debugMode: boolean;
}
