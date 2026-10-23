/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from './auth/AuthContext';
import { SignInScreen } from './auth/SignInScreen';
import { useLiveCompanion } from './hooks/useLiveCompanion';
import { CompanionAvatar } from './components/CompanionAvatar';
import { CameraVisionPreview } from './components/CameraVisionPreview';
import { LiveTranscriptTicker } from './components/LiveTranscriptTicker';
import { MemoryVault } from './components/MemoryVault';
import { SettingsModal } from './components/SettingsModal';
import { MeetingCopilotPanel } from './components/MeetingCopilotPanel';
import {
  Mic,
  MicOff,
  Camera,
  CameraOff,
  ScreenShare,
  Brain,
  Settings,
  Send,
  Radio,
  Sparkles,
  Zap,
  VolumeX,
  Keyboard,
  Info,
  Clock,
  Laptop,
  Volume2,
} from 'lucide-react';

export default function App() {
  const { user, loading, signOutUser } = useAuth();

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 text-zinc-400 flex items-center justify-center text-sm">Loading your account…</div>;
  }

  if (!user) return <SignInScreen />;

  return <CompanionApp onSignOut={signOutUser} />;
}

function CompanionApp({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const {
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
    setVoiceFocusLevel,
    startCamera,
    stopCamera,
    startScreenShare,
    changeVoice,
    sendTextMessage,
    sendSnapshot,
    stopPlayback,
    refreshMemories,
    getAudioAnalyser,
  } = useLiveCompanion();

  const [textInput, setTextInput] = useState('');
  const [isMemoryVaultOpen, setIsMemoryVaultOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showInfoBanner, setShowInfoBanner] = useState(true);
  const [meetingErrorNotice, setMeetingErrorNotice] = useState<string | null>(null);

  // Active live session duration tracker
  const [sessionDuration, setSessionDuration] = useState<number>(0);

  useEffect(() => {
    let timer: any = null;
    if (isConnected) {
      const startTime = Date.now();
      // Tick every second to accurately display how long the current active session has been running
      timer = setInterval(() => {
        setSessionDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    } else {
      setSessionDuration(0);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isConnected]);

  const getVoiceDisplayLabel = (v: string) => {
    if (v === 'Kore') return 'Female Voice';
    if (v === 'Fenrir') return 'Male Voice';
    return v;
  };

  const formatDuration = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Avatar gender state ('female' | 'male')
  const [avatarGender, setAvatarGender] = useState<'female' | 'male'>(() => {
    if (currentVoice === 'Fenrir' || currentVoice === 'Puck' || currentVoice === 'Charon') {
      return 'male';
    }
    return 'female';
  });

  // Keep gender in sync whenever currentVoice changes (e.g. from Settings modal)
  useEffect(() => {
    if (currentVoice === 'Fenrir' || currentVoice === 'Puck' || currentVoice === 'Charon') {
      setAvatarGender('male');
    } else if (currentVoice === 'Kore' || currentVoice === 'Aoede') {
      setAvatarGender('female');
    }
  }, [currentVoice]);

  // Handler to toggle avatar gender and automatically shift voice
  const handleSelectGender = (newGender: 'female' | 'male') => {
    setAvatarGender(newGender);
    if (newGender === 'female') {
      // Auto-shift to female voice
      const targetVoice = currentVoice === 'Aoede' ? 'Aoede' : 'Kore';
      if (currentVoice !== targetVoice) {
        changeVoice(targetVoice);
      }
    } else {
      // Auto-shift to male voice
      const targetVoice = (currentVoice === 'Puck' || currentVoice === 'Charon') ? currentVoice : 'Fenrir';
      if (currentVoice !== targetVoice) {
        changeVoice(targetVoice);
      }
    }
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when user is typing in text input
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (e.key === 'Escape') {
        stopPlayback();
      } else if (e.key === 'm' || e.key === 'M') {
        if (isMicActive) stopMic();
        else startMic();
      } else if (e.key === 'v' || e.key === 'V') {
        if (isCameraActive) stopCamera();
        else startCamera();
      } else if (e.key === 's' || e.key === 'S') {
        if (isCameraActive) sendSnapshot();
      } else if (e.key === 'd' || e.key === 'D') {
        handleToggleMeetingMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMicActive, isCameraActive, isMeetingMode, startMic, stopMic, startMeetingMode, stopMeetingMode, startCamera, stopCamera, sendSnapshot, stopPlayback]);

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    sendTextMessage(textInput);
    setTextInput('');
  };

  const toggleMic = () => {
    if (isMicActive) {
      stopMic();
    } else {
      startMic();
    }
  };

  const handleToggleMeetingMode = async (preferredSource?: 'desktop' | 'mic' | React.SyntheticEvent) => {
    if (isMeetingMode) {
      stopMeetingMode();
    } else {
      setMeetingErrorNotice(null);
      const targetSource: 'desktop' | 'mic' = preferredSource === 'mic' ? 'mic' : 'desktop';
      const res = await startMeetingMode(targetSource);
      if (!res.success) {
        if (res.error === 'permission_denied' || res.cancelled) {
          setMeetingErrorNotice(
            res.message || 'Desktop audio permission was dismissed or not granted. You can retry with "Share audio" checked, or use Microphone Meeting Mode instead!'
          );
        } else if (res.message) {
          setMeetingErrorNotice(res.message);
        }
      }
    }
  };

  const toggleCamera = () => {
    if (isCameraActive && !isScreenSharing) {
      stopCamera();
    } else {
      startCamera();
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-100 antialiased font-sans select-none">
      {/* Top Header */}
      <header className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-500 shadow-md shadow-cyan-500/20">
            <Radio className="w-4 h-4 text-white animate-pulse" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm md:text-base font-bold tracking-tight text-white">AI Companion</h1>
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-semibold">
                Voice &amp; Vision Live
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 hidden sm:block">
              Full-duplex barge-in conversation with camera awareness &amp; episodic memory
            </p>
          </div>
        </div>

        {/* Action Controls & Indicators */}
        <div className="flex items-center gap-2 md:gap-3">
          <button
            type="button"
            onClick={() => void onSignOut()}
            title="Sign out of your account"
            className="flex items-center gap-1.5 rounded-xl border border-zinc-700/60 bg-zinc-800/80 px-2.5 py-1.5 text-xs text-zinc-300 transition hover:border-rose-500/40 hover:text-rose-200"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>

          {/* Episodic Memory HUD button */}
          <button
            onClick={() => setIsMemoryVaultOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-medium transition-all active:scale-95"
          >
            <Brain className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Memory Vault</span>
            <span className="px-1.5 py-0.2 rounded-full bg-purple-500/30 text-[10px] font-mono">
              {memories.length}
            </span>
          </button>

          {/* Voice Focus Quick Toggle */}
          <button
            onClick={() => setVoiceFocusEnabled(!voiceFocus)}
            title={voiceFocus ? `Voice Focus is ACTIVE (${voiceFocusLevel} noise isolation). Filters room noise & enables fluent talking.` : 'Voice Focus is DISABLED. Click to activate background noise filtering.'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all active:scale-95 ${
              voiceFocus
                ? 'bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border-cyan-500/40 shadow-sm shadow-cyan-500/15'
                : 'bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-400 border-zinc-700/60'
            }`}
          >
            <Zap className={`w-3.5 h-3.5 ${voiceFocus ? 'text-cyan-400 animate-pulse' : 'text-zinc-500'}`} />
            <span className="hidden sm:inline">Voice Focus</span>
            <span
              className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold ${
                voiceFocus ? 'bg-cyan-500/30 text-cyan-200' : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {voiceFocus ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* Voice & Settings */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-200 border border-zinc-700/60 text-xs font-medium transition-all active:scale-95"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{getVoiceDisplayLabel(currentVoice)}</span>
          </button>

          {/* Active Live Session Duration Tracker */}
          {isConnected ? (
            <div
              title={`Live session active: ${formatDuration(sessionDuration)}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 text-xs font-mono font-semibold shadow-sm shadow-emerald-500/10 transition-all animate-fade-in"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="tracking-wider">{formatDuration(sessionDuration)}</span>
              <span className="text-[9px] uppercase font-sans tracking-wider px-1.5 py-0.2 rounded bg-emerald-500/25 text-emerald-200 font-bold hidden sm:inline">
                LIVE
              </span>
            </div>
          ) : (
            <div
              title="Session duration will track once Live connects"
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-800/40 text-zinc-500 border border-zinc-800 text-xs font-mono"
            >
              <Clock className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
              <span>00:00</span>
            </div>
          )}

          {/* Connect / Disconnect Live Stream */}
          {isConnected ? (
            <button
              onClick={() => {
                stopMic();
                disconnect();
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-semibold transition-all active:scale-95"
            >
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
              <span>End Live</span>
            </button>
          ) : (
            <button
              onClick={async () => {
                await startMic();
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white shadow-md shadow-cyan-500/20 text-xs font-semibold transition-all active:scale-95"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Start Live</span>
            </button>
          )}
        </div>
      </header>

      {/* Subtle Background Notice when Memory Saved/Retrieved */}
      {recentMemoryNotice && (
        <div className="mx-4 mt-2 px-4 py-2 rounded-xl bg-purple-950/60 border border-purple-500/30 text-purple-200 text-xs flex items-center justify-between animate-fade-in shadow-md">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
            <span>{recentMemoryNotice.text}</span>
          </div>
          <span className="text-[10px] text-purple-400 font-mono">Episodic Context</span>
        </div>
      )}

      {/* Meeting Mode Audio Hint Banner with one-click Mic Fallback */}
      {meetingErrorNotice && (
        <div className="mx-4 mt-2 px-4 py-3 rounded-2xl bg-gradient-to-r from-amber-950/80 via-zinc-900 to-amber-950/70 border border-amber-500/40 text-amber-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in shadow-xl">
          <div className="flex items-start gap-2.5">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-300">Meeting Copilot Audio Setup</p>
              <p className="text-[11px] text-amber-200/90 mt-0.5 leading-relaxed">
                {meetingErrorNotice}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <button
              onClick={async () => {
                setMeetingErrorNotice(null);
                await handleToggleMeetingMode('mic');
              }}
              className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs shadow-md shadow-violet-500/20 transition-all active:scale-95"
            >
              Use Mic for Meeting
            </button>
            <button
              onClick={async () => {
                setMeetingErrorNotice(null);
                await handleToggleMeetingMode('desktop');
              }}
              className="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-xs transition-all active:scale-95"
            >
              Retry Desktop
            </button>
            <button
              onClick={() => setMeetingErrorNotice(null)}
              className="px-2 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Split Layout */}
      <main className="flex-1 p-3 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6 max-w-7xl mx-auto w-full">
        {/* Left Side: Avatar, Audio Presence & Controls (5 Cols on large screens) */}
        <div className="lg:col-span-5 flex flex-col justify-between bg-zinc-900/40 rounded-3xl border border-zinc-800/60 p-4 md:p-6 backdrop-blur-sm shadow-xl">
          {/* Audio Visualizer & Companion Presence */}
          <div className="flex-1 flex flex-col items-center justify-center min-h-[300px]">
            <CompanionAvatar
              status={status}
              userVolume={userVolume}
              companionVolume={companionVolume}
              isCameraActive={isCameraActive}
              voiceName={currentVoice}
              gender={avatarGender}
              emotion={currentEmotion}
              isMicActive={isMicActive}
              isVoiceGated={isVoiceGated}
              voiceFocus={voiceFocus}
              audioAnalyser={getAudioAnalyser()}
              onSelectGender={handleSelectGender}
              onInterrupt={stopPlayback}
            />
          </div>

          {/* Primary Controls Bar */}
          <div className="mt-4 flex flex-col gap-3">
            {/* Live Mic Meter Bar */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition-colors ${
              isMicActive
                ? 'bg-zinc-950/60 border-zinc-800/80'
                : 'bg-rose-950/20 border-rose-900/30'
            }`}>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-zinc-500 text-[11px]">Mic:</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold ${
                  isMicActive
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}>
                  {isMicActive ? 'ON' : 'MUTED'}
                </span>
              </div>
              <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden flex">
                <div
                  className={`h-full transition-all duration-75 ${
                    isMicActive ? 'bg-cyan-400' : 'bg-transparent'
                  }`}
                  style={{ width: `${isMicActive ? Math.min(100, userVolume * 100) : 0}%` }}
                />
              </div>
              <span className={`text-[10px] font-mono w-9 text-right ${
                isMicActive ? 'text-zinc-400' : 'text-rose-400'
              }`}>
                {isMicActive ? `${Math.round(userVolume * 100)}%` : 'OFF'}
              </span>
              <button
                onClick={() => setNoiseSuppressionEnabled(!noiseSuppression)}
                title={`Hardware noise suppression is ${noiseSuppression ? 'active' : 'disabled'}. Click to toggle.`}
                className={`text-[10px] px-1.5 py-0.5 rounded font-mono transition-colors border ${
                  noiseSuppression
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                    : 'bg-zinc-800/80 text-zinc-500 border-zinc-700/60 hover:text-zinc-300'
                }`}
              >
                {noiseSuppression ? 'NR: ON' : 'NR: OFF'}
              </button>
            </div>

            {voiceInputNotice && (
              <p role="status" className="px-2 text-[11px] leading-relaxed text-amber-300/90">
                {voiceInputNotice}
              </p>
            )}

            {/* Voice Focused & Noise Immunity Panel */}
            <div
              className={`flex flex-col gap-2 p-3 rounded-2xl border transition-all ${
                voiceFocus
                  ? 'bg-gradient-to-r from-cyan-950/40 via-indigo-950/30 to-zinc-950/40 border-cyan-500/40 text-cyan-200 shadow-sm shadow-cyan-500/10'
                  : 'bg-zinc-950/60 border-zinc-800 text-zinc-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`p-1.5 rounded-lg shrink-0 ${
                      voiceFocus ? 'bg-cyan-500/20 text-cyan-300' : 'bg-zinc-800 text-zinc-500'
                    }`}
                  >
                    <Zap className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-zinc-200">Voice Focused & Noise Immunity</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold border ${
                          voiceFocus
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                            : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                        }`}
                      >
                        {voiceFocus ? 'ACTIVE' : 'STANDARD'}
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-400 truncate">
                      {voiceFocus
                        ? 'Adaptive noise gate + 560ms fluent hold: talk freely without noise interruptions'
                        : 'Standard turn-taking responses'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={voiceFocus}
                  onClick={() => setVoiceFocusEnabled(!voiceFocus)}
                  title={voiceFocus ? 'Voice Focus is ACTIVE. Click to switch to standard.' : 'Voice Focus is OFF. Click to activate background noise filter.'}
                  className={`relative inline-flex h-5 w-9 shrink-0 ml-2 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    voiceFocus ? 'bg-cyan-500' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      voiceFocus ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Noise Isolation Level Selector Pills */}
              {voiceFocus && (
                <div className="flex items-center justify-between pt-1 border-t border-cyan-500/20">
                  <span className="text-[10px] text-zinc-400 font-medium">Noise Isolation:</span>
                  <div className="flex items-center gap-1">
                    {(['balanced', 'high', 'aggressive'] as const).map((lvl) => {
                      const isSel = voiceFocusLevel === lvl;
                      return (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setVoiceFocusLevel(lvl)}
                          className={`text-[10px] px-2 py-0.5 rounded-lg font-mono font-semibold transition-all border ${
                            isSel
                              ? 'bg-cyan-500/25 text-cyan-200 border-cyan-500/50 shadow-sm'
                              : 'bg-zinc-900/80 text-zinc-400 border-zinc-800 hover:text-zinc-300'
                          }`}
                        >
                          {lvl === 'balanced' ? 'Balanced' : lvl === 'high' ? 'High' : 'Aggressive'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Meeting Copilot (Desktop Sound) Mode Switch Banner */}
            <div
              className={`flex items-center justify-between px-3 py-2 rounded-xl border transition-all ${
                isMeetingMode
                  ? 'bg-gradient-to-r from-violet-950/50 via-purple-950/40 to-zinc-950/50 border-violet-500/50 text-violet-200 shadow-sm shadow-violet-500/15'
                  : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700/80'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className={`p-1.5 rounded-lg shrink-0 ${
                    isMeetingMode ? 'bg-violet-500/20 text-violet-300' : 'bg-zinc-800 text-zinc-500'
                  }`}
                >
                  <Laptop className="w-4 h-4" />
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-zinc-200">Meeting Mode</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold border ${
                        isMeetingMode
                          ? 'bg-violet-500/20 text-violet-300 border-violet-500/40'
                          : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                      }`}
                    >
                      {isMeetingMode ? 'DESKTOP SOUND' : 'DESKTOP SOUND'}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      TEXT ANSWERS
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-400 truncate">
                    {isMeetingMode
                      ? meetingTrackLabel || 'Listening to meeting sound & answering silently in text'
                      : 'Hears Google Meet/Zoom sound & answers in real-time text'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={isMeetingMode}
                onClick={handleToggleMeetingMode}
                title={isMeetingMode ? 'Meeting Mode is ON (Click to switch off)' : 'Meeting Mode is OFF (Click to switch on desktop audio capture)'}
                className={`relative inline-flex h-5 w-9 shrink-0 ml-2 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isMeetingMode ? 'bg-violet-500' : 'bg-zinc-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    isMeetingMode ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Dedicated Separate Button to Switch On Meeting Mode */}
            <button
              onClick={handleToggleMeetingMode}
              title={
                isMeetingMode
                  ? 'Meeting Copilot is Active (Click to turn off desktop audio)'
                  : 'Turn on Meeting Mode: listens to desktop/call audio and answers silently in text'
              }
              className={`flex items-center justify-between p-2.5 rounded-2xl border transition-all active:scale-[0.98] ${
                isMeetingMode
                  ? 'bg-gradient-to-r from-violet-600/25 via-purple-600/20 to-indigo-600/15 border-violet-500/50 text-violet-200 shadow-md shadow-violet-500/20'
                  : 'bg-zinc-900/90 hover:bg-zinc-800/80 border-zinc-800 hover:border-violet-500/40 text-zinc-300'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2 rounded-xl transition-colors ${
                    isMeetingMode ? 'bg-violet-500/30 text-violet-300' : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  <Laptop className="w-4 h-4" />
                </div>
                <div className="flex flex-col text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-100">
                      {isMeetingMode ? 'Meeting Audio Active' : 'Switch On Meeting Mode'}
                    </span>
                    {isMeetingMode && (
                      <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-400">
                    {isMeetingMode
                      ? 'Listening to desktop sound — answers in silent text'
                      : 'Listen to meeting audio & answer in text format'}
                  </span>
                </div>
              </div>

              <span
                className={`text-[10px] font-mono px-2.5 py-1 rounded-xl font-bold border transition-colors ${
                  isMeetingMode
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                    : 'bg-violet-500/20 text-violet-300 border-violet-500/40 hover:bg-violet-500/30'
                }`}
              >
                {isMeetingMode ? 'STOP' : 'SWITCH ON'}
              </span>
            </button>

            {/* Quick Action Buttons */}
            <div className="grid grid-cols-4 gap-2">
              {/* Mic Toggle */}
              <button
                onClick={toggleMic}
                title={isMicActive ? 'Click to Mute Microphone' : 'Click to Unmute Microphone'}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all active:scale-95 ${
                  isMicActive
                    ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300 shadow-sm shadow-cyan-500/10'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20'
                }`}
              >
                {isMicActive ? <Mic className="w-5 h-5 text-cyan-400" /> : <MicOff className="w-5 h-5 text-rose-400" />}
                <span className="text-[11px] font-medium mt-1">{isMicActive ? 'Mute Mic' : 'Unmute Mic'}</span>
              </button>

              {/* Camera Toggle */}
              <button
                onClick={toggleCamera}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all active:scale-95 ${
                  isCameraActive && !isScreenSharing
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-sm shadow-emerald-500/10'
                    : 'bg-zinc-800/70 border-zinc-700/60 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {isCameraActive && !isScreenSharing ? (
                  <Camera className="w-5 h-5 text-emerald-400" />
                ) : (
                  <CameraOff className="w-5 h-5" />
                )}
                <span className="text-[11px] font-medium mt-1">{isCameraActive ? 'Camera On' : 'Camera Off'}</span>
              </button>

              {/* Screen Share */}
              <button
                onClick={isScreenSharing ? stopCamera : startScreenShare}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all active:scale-95 ${
                  isScreenSharing
                    ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300 shadow-sm shadow-indigo-500/10'
                    : 'bg-zinc-800/70 border-zinc-700/60 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <ScreenShare className={`w-5 h-5 ${isScreenSharing ? 'text-indigo-400' : ''}`} />
                <span className="text-[11px] font-medium mt-1">{isScreenSharing ? 'Sharing' : 'Share Screen'}</span>
              </button>

              {/* Snapshot Frame */}
              <button
                onClick={sendSnapshot}
                disabled={!isCameraActive}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all active:scale-95 ${
                  isCameraActive
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-600 opacity-60 cursor-not-allowed'
                }`}
              >
                <Zap className="w-5 h-5" />
                <span className="text-[11px] font-medium mt-1">Look Now</span>
              </button>
            </div>

            {/* Hybrid Text Input Form */}
            <form onSubmit={handleTextSubmit} className="relative mt-1">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Type a question or message to your companion..."
                className="w-full pl-4 pr-11 py-2.5 bg-zinc-950/80 border border-zinc-800 rounded-2xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/60 transition-all shadow-inner"
              />
              <button
                type="submit"
                disabled={!textInput.trim()}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-40 disabled:hover:bg-cyan-600 transition-all"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>

            <div className="flex items-center justify-between text-[11px] text-zinc-500 px-1">
              <span className="flex items-center gap-1">
                <Keyboard className="w-3 h-3" />
                <span>Shortcuts: Esc to interrupt, M for mic, V for cam, D for meeting mode</span>
              </span>
            </div>
          </div>
        </div>

        {/* Right Side: Vision Feed & Conversation Transcript (7 Cols on large screens) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Meeting Copilot Teleprompter & Live Answers HUD */}
          {isMeetingMode && (
            <MeetingCopilotPanel
              isMeetingMode={isMeetingMode}
              meetingAudioVolume={meetingAudioVolume}
              isMeetingTextOnly={isMeetingTextOnly}
              meetingTrackLabel={meetingTrackLabel}
              transcripts={transcripts}
              onStopMeetingMode={stopMeetingMode}
              onToggleTextOnly={setMeetingTextOnly}
              onSendQuickPrompt={sendTextMessage}
            />
          )}

          {/* Vision Viewport */}
          <div className="h-[280px] sm:h-[340px]">
            <CameraVisionPreview
              videoRef={videoRef}
              isCameraActive={isCameraActive}
              isScreenSharing={isScreenSharing}
              onStartCamera={startCamera}
              onStopCamera={stopCamera}
              onStartScreenShare={startScreenShare}
              onSendSnapshot={sendSnapshot}
            />
          </div>

          {/* Dialogue Log */}
          <div className="flex-1 min-h-[220px]">
            <LiveTranscriptTicker transcripts={transcripts} />
          </div>
        </div>
      </main>

      {/* Memory Vault Modal */}
      <MemoryVault
        memories={memories}
        isOpen={isMemoryVaultOpen}
        onClose={() => setIsMemoryVaultOpen(false)}
        onRefresh={refreshMemories}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentVoice={currentVoice}
        onSelectVoice={(voice) => {
          changeVoice(voice);
          setIsSettingsOpen(false);
        }}
        noiseSuppression={noiseSuppression}
        onToggleNoiseSuppression={setNoiseSuppressionEnabled}
        voiceFocus={voiceFocus}
        onToggleVoiceFocus={setVoiceFocusEnabled}
        voiceFocusLevel={voiceFocusLevel}
        onChangeVoiceFocusLevel={setVoiceFocusLevel}
        isMicActive={isMicActive}
        isMeetingMode={isMeetingMode}
        onToggleMeetingMode={handleToggleMeetingMode}
        isMeetingTextOnly={isMeetingTextOnly}
        onToggleMeetingTextOnly={setMeetingTextOnly}
      />
    </div>
  );
}
