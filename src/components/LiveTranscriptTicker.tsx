import React, { useEffect, useRef } from 'react';
import { TranscriptEntry } from '../types/companion';
import { MessageSquare, User, Bot, Copy, Check, Radio } from 'lucide-react';

interface LiveTranscriptTickerProps {
  transcripts: TranscriptEntry[];
  onClear?: () => void;
}

export const LiveTranscriptTicker: React.FC<LiveTranscriptTickerProps> = ({
  transcripts,
  onClear,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = React.useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts]);

  const copyTranscript = () => {
    const text = transcripts
      .map((t) => `[${t.timestamp}] ${t.role === 'user' ? 'You' : 'Nova'}: ${t.text}`)
      .join('\n');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {});
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900/80 rounded-2xl border border-zinc-800/80 overflow-hidden shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-950/60 border-b border-zinc-800/60 text-xs text-zinc-300">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
          <span className="font-medium tracking-wide">Live Conversation Transcript</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 font-mono">
            {transcripts.length} turns
          </span>
        </div>

        <div className="flex items-center gap-2">
          {transcripts.length > 0 && (
            <button
              onClick={copyTranscript}
              title="Copy dialogue to clipboard"
              className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Transcript Log */}
      <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-3 min-h-[160px] max-h-[360px] md:max-h-[420px]">
        {transcripts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-zinc-500 py-8 gap-2">
            <Radio className="w-6 h-6 text-zinc-600 animate-pulse" />
            <p className="text-xs font-medium text-zinc-400">Audio channel ready</p>
            <p className="text-[11px] max-w-xs text-zinc-500">
              Start talking into your mic. Nova listens, responds in natural short dialogue, and supports instant barge-in interruptions.
            </p>
          </div>
        ) : (
          transcripts.map((entry) => (
            <div
              key={entry.id}
              className={`flex gap-2.5 text-xs ${
                entry.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {entry.role === 'assistant' && (
                <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5" />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 leading-relaxed ${
                  entry.role === 'user'
                    ? 'bg-cyan-600/20 border border-cyan-500/30 text-cyan-100 rounded-tr-none'
                    : 'bg-zinc-800/80 border border-zinc-700/60 text-zinc-200 rounded-tl-none'
                }`}
              >
                <div className="flex items-center justify-between gap-4 mb-1 text-[10px] opacity-60">
                  <span className="font-semibold">{entry.role === 'user' ? 'You' : 'Nova'}</span>
                  <span>{entry.timestamp}</span>
                </div>
                <p className="whitespace-pre-wrap">{entry.text}</p>
                {entry.isPartial && (
                  <span className="inline-block w-1.5 h-3 ml-1 bg-emerald-400 animate-pulse" />
                )}
              </div>

              {entry.role === 'user' && (
                <div className="w-6 h-6 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
