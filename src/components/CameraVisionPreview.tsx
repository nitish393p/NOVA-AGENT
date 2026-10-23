import React, { useState } from 'react';
import {
  Camera,
  CameraOff,
  ScreenShare,
  RefreshCw,
  Zap,
  Eye,
  Maximize2,
  ShieldAlert,
} from 'lucide-react';

interface CameraVisionPreviewProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isCameraActive: boolean;
  isScreenSharing: boolean;
  onStartCamera: (facing?: 'user' | 'environment') => void;
  onStopCamera: () => void;
  onStartScreenShare: () => void;
  onSendSnapshot: () => void;
}

export const CameraVisionPreview: React.FC<CameraVisionPreviewProps> = ({
  videoRef,
  isCameraActive,
  isScreenSharing,
  onStartCamera,
  onStopCamera,
  onStartScreenShare,
  onSendSnapshot,
}) => {
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isMirrored, setIsMirrored] = useState(true);
  const [snapshotEffect, setSnapshotEffect] = useState(false);

  const toggleFacingMode = () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    setIsMirrored(next === 'user');
    onStartCamera(next);
  };

  const handleSnapshotClick = () => {
    setSnapshotEffect(true);
    onSendSnapshot();
    setTimeout(() => setSnapshotEffect(false), 300);
  };

  return (
    <div className="relative flex flex-col w-full h-full bg-zinc-900/90 rounded-2xl border border-zinc-800/80 overflow-hidden shadow-xl">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-950/60 border-b border-zinc-800/60 text-xs text-zinc-300">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isCameraActive ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
          <span className="font-medium tracking-wide">
            {isScreenSharing ? 'Screen Feed' : isCameraActive ? 'Camera Feed (1 FPS Live)' : 'Vision Offline'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {isCameraActive && (
            <button
              onClick={handleSnapshotClick}
              title="Send immediate high-priority snapshot"
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 transition-all text-[11px] active:scale-95 font-medium"
            >
              <Zap className="w-3 h-3" />
              <span>Look at this</span>
            </button>
          )}
        </div>
      </div>

      {/* Video Viewport Area */}
      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden min-h-[260px] md:min-h-[320px]">
        {/* Flash Effect on Snapshot */}
        {snapshotEffect && (
          <div className="absolute inset-0 bg-white/40 z-30 pointer-events-none transition-opacity duration-300" />
        )}

        {/* Video Element */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            isCameraActive ? 'opacity-100' : 'opacity-0 hidden'
          } ${isMirrored && !isScreenSharing ? '-scale-x-100' : ''}`}
        />

        {/* Offline Placeholder */}
        {!isCameraActive && (
          <div className="flex flex-col items-center justify-center p-6 text-center text-zinc-500 gap-3">
            <div className="p-4 rounded-full bg-zinc-800/80 border border-zinc-700/50 text-zinc-400">
              <CameraOff className="w-8 h-8" />
            </div>
            <div className="max-w-xs">
              <p className="text-sm font-medium text-zinc-300">Camera is turned off</p>
              <p className="text-xs text-zinc-500 mt-1">
                Enable your camera or share your screen so Nova can see your workspace, hardware, code, or environment in real time.
              </p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => onStartCamera(facingMode)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-all active:scale-95"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Start Camera</span>
              </button>
              <button
                onClick={onStartScreenShare}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-all active:scale-95"
              >
                <ScreenShare className="w-3.5 h-3.5" />
                <span>Share Screen</span>
              </button>
            </div>
          </div>
        )}

        {/* HUD Overlay when Camera is Active */}
        {isCameraActive && (
          <>
            {/* Subdued Target Reticle / Scanning Crosshairs */}
            <div className="absolute inset-8 pointer-events-none border border-emerald-500/20 rounded-xl flex items-center justify-center">
              <div className="w-12 h-12 border-t-2 border-l-2 border-emerald-400/50 absolute top-0 left-0 rounded-tl-lg" />
              <div className="w-12 h-12 border-t-2 border-r-2 border-emerald-400/50 absolute top-0 right-0 rounded-tr-lg" />
              <div className="w-12 h-12 border-b-2 border-l-2 border-emerald-400/50 absolute bottom-0 left-0 rounded-bl-lg" />
              <div className="w-12 h-12 border-b-2 border-r-2 border-emerald-400/50 absolute bottom-0 right-0 rounded-br-lg" />
            </div>

            {/* Live Frame Transmission Indicator */}
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-emerald-500/30 text-[10px] text-emerald-300 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>LIVE FRAME SYNC</span>
            </div>

            {/* Mirroring / Flip / Shutter Controls */}
            <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 p-1 rounded-xl bg-black/70 backdrop-blur-md border border-zinc-700/60 shadow-lg">
              {!isScreenSharing && (
                <>
                  <button
                    onClick={() => setIsMirrored(!isMirrored)}
                    title="Mirror feed"
                    className="p-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800/80 transition-colors text-xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={toggleFacingMode}
                    title="Switch Camera (Front/Back)"
                    className="p-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800/80 transition-colors text-xs"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              <button
                onClick={onStopCamera}
                title="Stop video feed"
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-medium transition-colors"
              >
                <CameraOff className="w-3.5 h-3.5" />
                <span>Pause</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Quick Visual Prompt Helper Pills */}
      {isCameraActive && (
        <div className="flex items-center gap-1.5 px-3 py-2 bg-zinc-950/80 border-t border-zinc-800/60 overflow-x-auto text-[11px] text-zinc-400">
          <span className="text-zinc-500 shrink-0">Try asking:</span>
          <span className="shrink-0 px-2 py-0.5 rounded-full bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 cursor-pointer border border-zinc-700/40">
            "What do you notice here?"
          </span>
          <span className="shrink-0 px-2 py-0.5 rounded-full bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 cursor-pointer border border-zinc-700/40">
            "Check this wiring / circuit"
          </span>
          <span className="shrink-0 px-2 py-0.5 rounded-full bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 cursor-pointer border border-zinc-700/40">
            "Can you read this error on my screen?"
          </span>
        </div>
      )}
    </div>
  );
};
