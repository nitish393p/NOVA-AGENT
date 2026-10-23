import React, { useState } from 'react';
import { LiveVoice } from '../types/companion';
import { getAuthToken } from '../lib/firebase';
import {
  Settings,
  X,
  Volume2,
  Mic,
  Command,
  Sparkles,
  Check,
  Sliders,
  ShieldCheck,
  Zap,
  Laptop,
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentVoice: string;
  onSelectVoice: (voice: string) => void;
  noiseSuppression?: boolean;
  onToggleNoiseSuppression?: (enabled: boolean) => void;
  voiceFocus?: boolean;
  onToggleVoiceFocus?: (enabled: boolean) => void;
  voiceFocusLevel?: 'balanced' | 'high' | 'aggressive';
  onChangeVoiceFocusLevel?: (level: 'balanced' | 'high' | 'aggressive') => void;
  isMicActive?: boolean;
  isMeetingMode?: boolean;
  onToggleMeetingMode?: () => void;
  isMeetingTextOnly?: boolean;
  onToggleMeetingTextOnly?: (enabled: boolean) => void;
}

const VOICES: LiveVoice[] = [
  {
    id: 'Zephyr',
    name: 'Zephyr',
    gender: 'neutral',
    tone: 'Warm & balanced',
    description: 'Natural, friendly conversational rhythm. Great default companion.',
  },
  {
    id: 'Puck',
    name: 'Puck',
    gender: 'male',
    tone: 'Playful & brisk',
    description: 'Energetic, quick-witted, casual everyday pacing.',
  },
  {
    id: 'Charon',
    name: 'Charon',
    gender: 'male',
    tone: 'Deep & grounded',
    description: 'Calm, authoritative, deliberate cadence for technical topics.',
  },
  {
    id: 'Kore',
    name: 'Female Voice',
    gender: 'female',
    tone: 'Bright & articulate',
    description: 'Engaging, clear, expressive vocal presence.',
  },
  {
    id: 'Fenrir',
    name: 'Male Voice',
    gender: 'male',
    tone: 'Crisp & direct',
    description: 'Sharp, fast, high-precision technical delivery.',
  },
  {
    id: 'Aoede',
    name: 'Aoede',
    gender: 'female',
    tone: 'Melodic & thoughtful',
    description: 'Reflective, gentle, introspective tone.',
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentVoice,
  onSelectVoice,
  noiseSuppression = true,
  onToggleNoiseSuppression,
  voiceFocus = true,
  onToggleVoiceFocus,
  voiceFocusLevel = 'high',
  onChangeVoiceFocusLevel,
  isMicActive = false,
  isMeetingMode = false,
  onToggleMeetingMode,
  isMeetingTextOnly = true,
  onToggleMeetingTextOnly,
}) => {
  const [geminiKey, setGeminiKey] = useState('');
  const [keyStatus, setKeyStatus] = useState('');
  const [savingKey, setSavingKey] = useState(false);

  if (!isOpen) return null;

  const saveGeminiKey = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingKey(true);
    setKeyStatus('');
    try {
      const token = await getAuthToken();
      const response = await fetch('/api/account/gemini-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: geminiKey.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Firebase could not save your Gemini key.');
      setGeminiKey('');
      setKeyStatus(result.usingDefault ? 'Removed your saved key. The app default will be used.' : 'Your Gemini key is saved to Firebase and will be used for your assistant.');
    } catch (error) {
      setKeyStatus(error instanceof Error ? error.message : 'Could not save your Gemini key.');
    } finally {
      setSavingKey(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100">Companion Settings</h2>
              <p className="text-xs text-zinc-400">Personalize voice persona, audio filtering, and interaction controls.</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          <form onSubmit={saveGeminiKey} className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Your Gemini API key</h3>
              <p className="mt-1 text-xs leading-5 text-zinc-400">Save or replace your key in Firebase. It is encrypted on the server and used for your assistant replies and live voice. Leave blank and save to use the app default.</p>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={geminiKey}
                onChange={(event) => setGeminiKey(event.target.value)}
                placeholder="Paste Gemini API key (blank removes saved key)"
                className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-cyan-500"
              />
              <button type="submit" disabled={savingKey} className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-cyan-400 disabled:opacity-50">
                {savingKey ? 'Saving…' : 'Save key'}
              </button>
            </div>
            {keyStatus && <p role="status" className="text-xs text-cyan-200">{keyStatus}</p>}
          </form>

          {/* Voice Persona Selector */}
          <div>
            <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 mb-2.5">
              <Volume2 className="w-4 h-4 text-cyan-400" />
              <span>Gemini Live Voice Persona</span>
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {VOICES.map((v) => {
                const isSelected = currentVoice === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => onSelectVoice(v.id)}
                    className={`p-3 rounded-xl border text-left transition-all relative flex flex-col gap-1 ${
                      isSelected
                        ? 'bg-cyan-500/10 border-cyan-500/50 shadow-sm'
                        : 'bg-zinc-950/40 border-zinc-800 hover:border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-zinc-100">{v.name}</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
                          {v.gender === 'female' ? 'Female' : v.gender === 'male' ? 'Male' : 'Neutral'}
                        </span>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                    </div>
                    <span className="text-[11px] text-cyan-400/90 font-medium">{v.tone}</span>
                    <p className="text-[10px] text-zinc-400 leading-snug mt-0.5">{v.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Microphone Audio Processing & Noise Suppression Toggle */}
          <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${noiseSuppression ? 'bg-cyan-500/10 text-cyan-400' : 'bg-zinc-800 text-zinc-400'}`}>
                  <Mic className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-200">Noise Suppression</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium border ${
                        noiseSuppression
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                      }`}
                    >
                      {noiseSuppression ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Modifies browser MediaStreamTrack constraints in real time to filter HVAC, fan, traffic, and background room hum.
                  </p>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={noiseSuppression}
                onClick={() => onToggleNoiseSuppression?.(!noiseSuppression)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-cyan-500/50 ${
                  noiseSuppression ? 'bg-cyan-500' : 'bg-zinc-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    noiseSuppression ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Live Track Constraint Status */}
            <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-500">
              <span className="flex items-center gap-1 font-mono">
                <ShieldCheck className="w-3 h-3 text-cyan-400" />
                <span>Constraint: MediaTrackConstraints.noiseSuppression: {String(noiseSuppression)}</span>
              </span>
              <span>
                {isMicActive ? (
                  <span className="text-emerald-400 font-medium">Applied to live mic stream</span>
                ) : (
                  <span>Will apply on mic start</span>
                )}
              </span>
            </div>
          </div>

          {/* Voice Focused & Background Noise Filter */}
          <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${voiceFocus ? 'bg-cyan-500/10 text-cyan-400' : 'bg-zinc-800 text-zinc-400'}`}>
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-200">Voice Focused & Noise Immunity</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium border ${
                        voiceFocus
                          ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                      }`}
                    >
                      {voiceFocus ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Filters out background noise (fan hum, typing, AC rumble) with an adaptive noise gate and 125Hz high-pass filter. Keeps a 560ms speech hold buffer so you can talk fluently with natural pauses without being interrupted!
                  </p>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={voiceFocus}
                onClick={() => onToggleVoiceFocus?.(!voiceFocus)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-cyan-500/50 ${
                  voiceFocus ? 'bg-cyan-500' : 'bg-zinc-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    voiceFocus ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Noise Isolation Level Selector */}
            {voiceFocus && (
              <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-300 font-medium">Noise Isolation Level</span>
                  <span className="text-cyan-400 font-mono text-[10px] uppercase font-bold">{voiceFocusLevel}</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['balanced', 'high', 'aggressive'] as const).map((level) => {
                    const isSelected = voiceFocusLevel === level;
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => onChangeVoiceFocusLevel?.(level)}
                        className={`py-1.5 px-2 rounded-lg text-[10px] font-semibold border transition-all ${
                          isSelected
                            ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-200 shadow-sm'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                        }`}
                      >
                        {level === 'balanced' && 'Balanced'}
                        {level === 'high' && 'High (Default)'}
                        {level === 'aggressive' && 'Aggressive'}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Voice DSP Status */}
            <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-500">
              <span className="flex items-center gap-1 font-mono">
                <Sliders className="w-3 h-3 text-cyan-400" />
                <span>Noise Gate: {voiceFocus ? `Adaptive EMA (${voiceFocusLevel})` : 'Standard Flat'}</span>
              </span>
              <span className="text-zinc-400 font-medium">
                {voiceFocus ? 'Fluent Speech Hold: 560ms' : 'Standard Audio'}
              </span>
            </div>
          </div>

          {/* Meeting Copilot & Desktop Audio Settings */}
          <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${isMeetingMode ? 'bg-violet-500/10 text-violet-400' : 'bg-zinc-800 text-zinc-400'}`}>
                  <Laptop className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-200">Meeting Copilot (Desktop Sound)</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium border ${
                        isMeetingMode
                          ? 'bg-violet-500/10 text-violet-400 border-violet-500/30'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                      }`}
                    >
                      {isMeetingMode ? 'Active' : 'Standby'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Captures desktop/tab sound during Google Meet, Zoom, or Teams calls, and delivers real-time talking points, Q&amp;A assistance, and summaries in silent text format.
                  </p>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={isMeetingMode}
                onClick={() => onToggleMeetingMode?.()}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-violet-500/50 ${
                  isMeetingMode ? 'bg-violet-500' : 'bg-zinc-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    isMeetingMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Silent Text Output Option */}
            <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs">
              <div>
                <span className="text-xs text-zinc-300 font-medium">Silent Text Mode:</span>
                <p className="text-[10px] text-zinc-500">Mutes Nova speaker voice so meeting participants hear nothing.</p>
              </div>
              <button
                type="button"
                onClick={() => onToggleMeetingTextOnly?.(!isMeetingTextOnly)}
                className={`text-[10px] font-mono font-bold px-2 py-1 rounded-lg border transition-colors ${
                  isMeetingTextOnly
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                }`}
              >
                {isMeetingTextOnly ? 'MUTED (TEXT ONLY)' : 'VOICE ON'}
              </button>
            </div>
          </div>

          {/* Turn-Taking & Barge-in Guide */}
          <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-2">
            <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Conversational Dynamics</span>
            </span>
            <ul className="text-xs text-zinc-400 space-y-1.5 list-disc list-inside">
              <li>
                <strong className="text-zinc-200">Full-duplex Barge-in:</strong> Start speaking at any time while Nova is talking, and playback cuts off instantly.
              </li>
              <li>
                <strong className="text-zinc-200">Short natural replies:</strong> 1-3 sentences by default so you can have a snappy spoken dialogue.
              </li>
              <li>
                <strong className="text-zinc-200">Camera inspection:</strong> Ask Nova about any object, diagram, or circuit in frame; Nova observes real details directly.
              </li>
            </ul>
          </div>

          {/* Keyboard Shortcuts */}
          <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-2">
            <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <Command className="w-3.5 h-3.5 text-zinc-400" />
              <span>Keyboard Shortcuts</span>
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center justify-between p-1.5 bg-zinc-900 rounded-lg">
                <span className="text-zinc-400">Interrupt speech</span>
                <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700 text-[10px] text-zinc-300">Esc</kbd>
              </div>
              <div className="flex items-center justify-between p-1.5 bg-zinc-900 rounded-lg">
                <span className="text-zinc-400">Toggle Mic</span>
                <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700 text-[10px] text-zinc-300">M</kbd>
              </div>
              <div className="flex items-center justify-between p-1.5 bg-zinc-900 rounded-lg">
                <span className="text-zinc-400">Toggle Camera</span>
                <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700 text-[10px] text-zinc-300">V</kbd>
              </div>
              <div className="flex items-center justify-between p-1.5 bg-zinc-900 rounded-lg">
                <span className="text-zinc-400">Send Frame</span>
                <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700 text-[10px] text-zinc-300">S</kbd>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-800 bg-zinc-950/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
