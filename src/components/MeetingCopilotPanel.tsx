import React, { useState } from 'react';
import {
  Laptop,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Sparkles,
  StopCircle,
  MessageSquare,
  ListChecks,
  HelpCircle,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { TranscriptEntry } from '../types/companion';

interface MeetingCopilotPanelProps {
  isMeetingMode: boolean;
  meetingAudioVolume: number;
  isMeetingTextOnly: boolean;
  meetingTrackLabel: string;
  transcripts: TranscriptEntry[];
  onStopMeetingMode: () => void;
  onToggleTextOnly: (enabled: boolean) => void;
  onSendQuickPrompt: (prompt: string) => void;
}

export const MeetingCopilotPanel: React.FC<MeetingCopilotPanelProps> = ({
  isMeetingMode,
  meetingAudioVolume,
  isMeetingTextOnly,
  meetingTrackLabel,
  transcripts,
  onStopMeetingMode,
  onToggleTextOnly,
  onSendQuickPrompt,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isMeetingMode) return null;

  // Filter latest assistant responses for the meeting teleprompter
  const assistantMessages = transcripts.filter((t) => t.role === 'assistant');
  const latestResponse = assistantMessages[assistantMessages.length - 1];

  const handleCopy = (text: string, id: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      }).catch(() => {});
    }
  };

  const quickPrompts = [
    {
      label: 'Suggest Answer',
      icon: Sparkles,
      prompt: 'Based on the meeting audio, what is the best direct answer or talking point I can provide right now?',
    },
    {
      label: 'Summarize Discussion',
      icon: FileText,
      prompt: 'Summarize what was just discussed in this meeting in 2-3 concise bullet points.',
    },
    {
      label: 'Key Action Items',
      icon: ListChecks,
      prompt: 'What are the concrete action items, responsibilities, or deadlines mentioned recently in the meeting?',
    },
    {
      label: 'Clarify Technical Term',
      icon: HelpCircle,
      prompt: 'Briefly explain any complex technical terms or acronyms mentioned in this call.',
    },
  ];

  return (
    <section 
      aria-label="Meeting Copilot Active Session"
      className="rounded-3xl border border-violet-500/40 bg-gradient-to-br from-violet-950/40 via-zinc-950/80 to-zinc-900/50 p-4 md:p-5 backdrop-blur-md shadow-2xl animate-fade-in relative overflow-hidden"
    >
      {/* Ambient background glow */}
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-violet-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-violet-500/20">
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-violet-600/30 border border-violet-500/50 text-violet-300 shadow-md shadow-violet-500/20">
            <Laptop className="w-4 h-4 animate-pulse" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-violet-500" />
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-violet-100 tracking-tight">Meeting Copilot Active</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-violet-500/20 text-violet-300 border border-violet-500/40">
                {meetingTrackLabel.toLowerCase().includes('mic') ? 'MIC AUDIO' : 'DESKTOP SOUND'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 truncate max-w-[240px] sm:max-w-md">
              {meetingTrackLabel || 'Listening to meeting sound & tab audio'}
            </p>
          </div>
        </div>

        {/* Meeting Controls: Silent Text Mode & Stop Mode */}
        <div className="flex items-center gap-2">
          {/* Text-only Silent Mode Switch */}
          <button
            type="button"
            onClick={() => onToggleTextOnly(!isMeetingTextOnly)}
            title={
              isMeetingTextOnly
                ? 'Silent Text Mode is ON (Speaker voice is muted so call is not interrupted)'
                : 'Audible Voice is ON (Click to mute Nova speaker for silent text mode)'
            }
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all ${
              isMeetingTextOnly
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-zinc-800 border-zinc-700 text-zinc-400'
            }`}
          >
            {isMeetingTextOnly ? (
              <>
                <VolumeX className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Silent Text Answers</span>
                <span className="sm:hidden">Silent</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Voice Playback ON</span>
                <span className="sm:hidden">Voice</span>
              </>
            )}
          </button>

          {/* Stop Desktop Audio Button */}
          <button
            onClick={onStopMeetingMode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-semibold transition-all active:scale-95"
          >
            <StopCircle className="w-3.5 h-3.5" />
            <span>Stop Meeting Mode</span>
          </button>
        </div>
      </div>

      {/* Desktop Audio Level Visualizer */}
      <div className="mt-3 flex items-center gap-3 px-3 py-2 rounded-xl bg-zinc-950/70 border border-zinc-800/80">
        <span className="text-[11px] text-zinc-400 font-medium shrink-0 flex items-center gap-1.5">
          <Volume2 className="w-3.5 h-3.5 text-violet-400" />
          <span>Desktop Sound:</span>
        </span>
        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden flex">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all duration-75"
            style={{ width: `${Math.min(100, meetingAudioVolume * 100)}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-zinc-300 w-9 text-right font-semibold">
          {Math.round(meetingAudioVolume * 100)}%
        </span>
        <div className="flex items-center gap-1 text-[10px] text-zinc-400 border-l border-zinc-800 pl-2">
          <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
          <span className="hidden sm:inline">Zero Speaker Echo Guard</span>
        </div>
      </div>

      {/* Live AI Meeting Answers Teleprompter */}
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <span className="text-xs font-bold text-violet-200 flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-violet-400" />
            <span>Real-Time Meeting Answers &amp; Talking Points</span>
          </span>
          {latestResponse && (
            <button
              onClick={() => handleCopy(latestResponse.text, latestResponse.id)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 text-[10px] font-medium transition-colors"
            >
              {copiedId === latestResponse.id ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy to Meeting Chat</span>
                </>
              )}
            </button>
          )}
        </div>

        <div className="p-3.5 rounded-2xl bg-zinc-950/90 border border-violet-500/30 text-xs text-zinc-200 min-h-[90px] max-h-[180px] overflow-y-auto leading-relaxed shadow-inner">
          {latestResponse ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-violet-400 font-mono mb-1">
                <span>Nova Teleprompter</span>
                <span>{latestResponse.timestamp}</span>
              </div>
              <p className="whitespace-pre-wrap text-zinc-100 font-medium select-text selection:bg-violet-500/40">
                {latestResponse.text}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-4 text-center text-zinc-500">
              <Sparkles className="w-5 h-5 text-violet-400/60 mb-1 animate-pulse" />
              <p className="text-xs text-zinc-400 font-medium">Listening to desktop meeting sound...</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                When someone speaks in the call or asks a question, answers and talking points will stream here in real-time text format.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Meeting Action Chips */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-zinc-500 font-medium mr-1 hidden sm:inline">Ask Copilot:</span>
        {quickPrompts.map((qp, idx) => {
          const Icon = qp.icon;
          return (
            <button
              key={idx}
              onClick={() => onSendQuickPrompt(qp.prompt)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-violet-950/40 hover:bg-violet-900/50 text-violet-200 border border-violet-500/30 text-[11px] font-medium transition-all active:scale-95"
            >
              <Icon className="w-3 h-3 text-violet-400 shrink-0" />
              <span>{qp.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
