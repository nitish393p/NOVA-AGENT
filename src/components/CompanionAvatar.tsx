import React from 'react';
import { CompanionStatus, AvatarEmotion } from '../types/companion';
import { Eye, Sparkles, Brain, Heart, Lightbulb, Smile, Compass, ShieldCheck } from 'lucide-react';
import { CompanionAvatarFace, AvatarGender } from './CompanionAvatarFace';

const EMOTION_LABELS: Record<AvatarEmotion, string> = {
  neutral: 'Neutral',
  thoughtful: 'Thoughtful',
  analytical: 'Analytical',
  happy: 'Happy',
  empathetic: 'Empathetic',
  curious: 'Curious',
  calm: 'Calm',
  excited: 'Excited',
  sad: 'Sad',
  concerned: 'Concerned',
  surprised: 'Surprised',
  confused: 'Confused',
  frustrated: 'Frustrated',
};

interface CompanionAvatarProps {
  status: CompanionStatus;
  userVolume: number;
  companionVolume: number;
  isCameraActive: boolean;
  voiceName: string;
  gender: AvatarGender;
  emotion?: AvatarEmotion;
  isMicActive?: boolean;
  isVoiceGated?: boolean;
  voiceFocus?: boolean;
  audioAnalyser?: AnalyserNode | null;
  onSelectGender: (gender: AvatarGender) => void;
  onInterrupt: () => void;
}

export const CompanionAvatar: React.FC<CompanionAvatarProps> = ({
  status,
  userVolume,
  companionVolume,
  isCameraActive,
  voiceName: _voiceName,
  gender,
  emotion = 'neutral',
  isMicActive = true,
  isVoiceGated = true,
  voiceFocus = true,
  audioAnalyser = null,
  onSelectGender,
  onInterrupt,
}) => {
  const handleGenderChange = (newGender: AvatarGender) => {
    onSelectGender(newGender);
  };

  // Scale factor for outer atmospheric glow based on audio volume
  const userScale = 1 + Math.min(0.25, userVolume * 0.6);

  const getStatusLabel = () => {
    switch (status) {
      case 'speaking':
        return 'Speaking';
      case 'listening':
        if (!isMicActive) {
          return 'Mic muted';
        }
        return userVolume > 0.04 ? 'Listening...' : 'Listening';
      case 'thinking':
        return 'Thinking...';
      case 'interrupted':
        return 'Listening to you';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return 'Connection issue';
      default:
        return 'Ready';
    }
  };

  const getStatusBadgeColor = () => {
    switch (status) {
      case 'speaking':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'listening':
        if (!isMicActive) {
          return 'bg-rose-500/10 text-rose-300 border-rose-500/30';
        }
        return userVolume > 0.04
          ? gender === 'female'
            ? 'bg-pink-500/15 text-pink-300 border-pink-500/40 shadow-sm shadow-pink-500/20'
            : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40 shadow-sm shadow-cyan-500/20'
          : 'bg-zinc-800 text-zinc-400 border-zinc-700';
      case 'thinking':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'interrupted':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      default:
        return 'bg-zinc-800 text-zinc-400 border-zinc-700';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-3 select-none">
      {/* Outer Halo Rings & Audio Visualizer Ripple */}
      <div className="relative flex items-center justify-center">
        {/* Animated Listening Halo */}
        {status === 'listening' && isMicActive && (
          <div
            className={`absolute -inset-5 rounded-full blur-xl opacity-35 transition-all duration-150 ${
              gender === 'female'
                ? 'bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500'
                : 'bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500'
            }`}
            style={{
              transform: `scale(${userScale * 1.08})`,
            }}
          />
        )}

        {/* Dynamic Speaking Halo */}
        {status === 'speaking' && (
          <div
            className="absolute -inset-6 rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500 blur-2xl opacity-20 transition-opacity duration-500"
          />
        )}

        {/* Thinking Pulsing Halo */}
        {status === 'thinking' && (
          <div className="absolute -inset-5 rounded-full bg-gradient-to-r from-purple-500 via-violet-500 to-indigo-500 blur-xl opacity-25" />
        )}

        {/* Voice Focus Active Indicator Ring */}
        {voiceFocus && (
          <div
            className={`absolute -inset-2.5 rounded-full border border-dashed transition-all duration-300 pointer-events-none ${
              !isVoiceGated
                ? gender === 'female'
                  ? 'border-pink-500/60 animate-spin-slow'
                  : 'border-cyan-500/60 animate-spin-slow'
                : 'border-zinc-700/40'
            }`}
          />
        )}

        {status === 'listening' && userVolume > 0.05 && (
          <div
            className={`absolute inset-4 rounded-full border transition-transform duration-75 ${
              gender === 'female' ? 'border-pink-400/40' : 'border-cyan-400/40'
            }`}
            style={{ transform: `scale(${userScale * 1.12})` }}
          />
        )}

        {/* Stable portrait frame for the rigged 3D face */}
        <div
          className="relative w-72 h-[410px] sm:w-80 sm:h-[450px] md:w-88 md:h-[470px] rounded-3xl flex items-center justify-center bg-gradient-to-b from-[#171525] via-[#100f1c] to-[#0a0912] border border-white/10 shadow-2xl shadow-indigo-950/30 overflow-hidden"
        >
          {/* Subtle Ambient Radial Backlight */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(139,92,246,0.12),transparent_70%)] pointer-events-none" />

          {/* Rigged face with audio-driven mouth shapes, blinks, and expression */}
          <div className="relative z-10 flex items-center justify-center w-full h-full">
            <CompanionAvatarFace
              gender={gender}
              status={status}
              userVolume={userVolume}
              companionVolume={companionVolume}
              emotion={emotion}
              isMicActive={isMicActive}
              audioAnalyser={audioAnalyser}
              className="w-full h-full"
            />
          </div>

          {/* Live Mic Activity Overlay */}
          {status === 'listening' && userVolume > 0.04 && (
            <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/85 border border-emerald-500/50 text-[9px] text-emerald-300 font-mono font-medium shadow-md z-20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>LISTENING</span>
            </div>
          )}

          {/* Camera Awareness Badge */}
          {isCameraActive && (
            <div className="absolute top-2.5 left-2.5 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/75 border border-emerald-500/40 text-[10px] text-emerald-300 font-medium shadow-md z-20">
              <Eye className="w-3 h-3 text-emerald-400" />
              <span>VISION</span>
            </div>
          )}

        </div>
      </div>

      {/* Status & Identity Info */}
      <div className="mt-3.5 flex flex-col items-center text-center gap-1.5">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold tracking-tight text-zinc-100 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>AI Voice Companion</span>
            <span
              className={`text-xs font-normal px-2.5 py-0.5 rounded-full border ${
                gender === 'female'
                  ? 'text-pink-300 bg-pink-950/60 border-pink-500/40 shadow-xs'
                  : 'text-cyan-300 bg-cyan-950/60 border-cyan-500/40 shadow-xs'
              }`}
            >
              {gender === 'female' ? 'Female Voice' : 'Male Voice'}
            </span>
          </span>
        </div>

        {/* Emotion & State Pills */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium transition-colors ${getStatusBadgeColor()}`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                status === 'speaking'
                  ? 'bg-emerald-400 animate-pulse'
                  : status === 'interrupted'
                  ? 'bg-amber-400'
                  : status === 'listening'
                  ? 'bg-emerald-400'
                  : status === 'thinking'
                  ? 'bg-purple-400 animate-bounce'
                  : 'bg-zinc-500'
              }`}
            />
            <span>{getStatusLabel()}</span>
          </div>

          {/* Active Human Cognitive / Emotional State */}
          {emotion && emotion !== 'neutral' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-950/70 border border-indigo-500/40 text-[10px] text-indigo-200 font-medium shadow-xs animate-fade-in">
              {emotion === 'analytical' && <Brain className="w-3 h-3 text-indigo-400" />}
              {(emotion === 'thoughtful' || emotion === 'confused' || emotion === 'surprised') && <Compass className="w-3 h-3 text-amber-400" />}
              {(emotion === 'happy' || emotion === 'excited') && <Smile className="w-3 h-3 text-emerald-400" />}
              {(emotion === 'empathetic' || emotion === 'concerned' || emotion === 'sad') && <Heart className="w-3 h-3 text-pink-400" />}
              {(emotion === 'curious' || emotion === 'calm') && <Lightbulb className="w-3 h-3 text-yellow-400" />}
              {emotion === 'frustrated' && <ShieldCheck className="w-3 h-3 text-cyan-400" />}
              <span>{EMOTION_LABELS[emotion]}</span>
            </div>
          )}

          {status === 'speaking' && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-[10px] text-emerald-300 font-mono font-medium shadow-sm animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>Real-Time Lip Sync</span>
            </div>
          )}

          {status === 'listening' && isMicActive && voiceFocus && (
            <div
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-mono font-medium shadow-sm transition-all ${
                !isVoiceGated
                  ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300 animate-pulse'
                  : 'bg-cyan-950/40 border-cyan-500/30 text-cyan-300/90'
              }`}
            >
              {!isVoiceGated ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>Voice Active</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3 h-3 text-cyan-400" />
                  <span>Noise Filtered</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Quick interrupt hint when speaking */}
        {status === 'speaking' && (
          <button
            onClick={onInterrupt}
            className="mt-1 flex items-center gap-1.5 px-3.5 py-1 text-xs font-medium bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-full transition-all active:scale-95 shadow-sm cursor-pointer"
          >
            <span>Interrupt companion</span>
            <kbd className="px-1.5 py-0.5 bg-black/40 rounded text-[10px] text-amber-200">Esc</kbd>
          </button>
        )}
      </div>

      {/* Female/Male Voice & Avatar Preset Toggle */}
      <div className="mt-4 w-full max-w-xs flex flex-col items-center gap-2">
        <div className="flex items-center justify-between w-full px-1 text-[11px] text-zinc-400 font-medium">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-pink-400" />
            <span className="text-zinc-200 font-semibold">Voice Model</span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 p-1.5 bg-zinc-950/80 border border-zinc-800/90 rounded-2xl w-full shadow-inner">
          {/* Female Option */}
          <button
            type="button"
            aria-pressed={gender === 'female'}
            onClick={() => handleGenderChange('female')}
            className={`relative flex items-center justify-center py-2.5 px-3 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer ${
              gender === 'female'
                ? 'bg-gradient-to-r from-pink-500/25 via-rose-500/20 to-purple-500/10 text-pink-200 border border-pink-500/50 shadow-md shadow-pink-500/20'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/80 border border-transparent'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  gender === 'female' ? 'bg-pink-400 shadow-[0_0_8px_#f472b6] animate-pulse' : 'bg-zinc-600'
                }`}
              />
              <span className="tracking-wide text-zinc-100 font-bold">Female Voice</span>
            </div>
          </button>

          {/* Male Option */}
          <button
            type="button"
            aria-pressed={gender === 'male'}
            onClick={() => handleGenderChange('male')}
            className={`relative flex items-center justify-center py-2.5 px-3 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer ${
              gender === 'male'
                ? 'bg-gradient-to-r from-cyan-500/25 via-blue-500/20 to-indigo-500/10 text-cyan-200 border border-cyan-500/50 shadow-md shadow-cyan-500/20'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/80 border border-transparent'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  gender === 'male' ? 'bg-cyan-400 shadow-[0_0_8px_#06b6d4] animate-pulse' : 'bg-zinc-600'
                }`}
              />
              <span className="tracking-wide text-zinc-100 font-bold">Male Voice</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
