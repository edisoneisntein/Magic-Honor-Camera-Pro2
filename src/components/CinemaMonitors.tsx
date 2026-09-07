import React, { useRef, useEffect } from 'react';
import { ScopeType } from '../types';
import { ImageProcessingEngine, ScopeData } from '../services/imageProcessingEngine';
import { Activity, Mic, X } from 'lucide-react';

interface CinemaMonitorsProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  activeScope: ScopeType;
  audioLevel: number;
  onClose: () => void;
  onSelectScope: (scope: ScopeType) => void;
}

export const CinemaMonitors: React.FC<CinemaMonitorsProps> = ({
  videoRef,
  activeScope,
  audioLevel,
  onClose,
  onSelectScope,
}) => {
  const histCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const vectorCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (activeScope === 'none') return;

    let animId: number;
    const engine = ImageProcessingEngine.getInstance();

    const drawLoop = () => {
      const video = videoRef.current;
      if (video && video.readyState >= 2 && !video.paused) {
        // 1. Draw Histogram
        if (histCanvasRef.current && (activeScope === 'histogram' || activeScope === 'all')) {
          const canvas = histCanvasRef.current;
          const ctx = canvas.getContext('2d')!;
          const data: ScopeData = engine.calculateHistogram(video);

          ctx.fillStyle = 'rgba(5, 5, 5, 0.85)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Grid markers (25%, 50%, 75%)
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.beginPath();
          ctx.moveTo(canvas.width * 0.25, 0); ctx.lineTo(canvas.width * 0.25, canvas.height);
          ctx.moveTo(canvas.width * 0.5, 0); ctx.lineTo(canvas.width * 0.5, canvas.height);
          ctx.moveTo(canvas.width * 0.75, 0); ctx.lineTo(canvas.width * 0.75, canvas.height);
          ctx.stroke();

          // Render Luma & RGB Channels
          const max = data.maxBin || 1;
          const w = canvas.width;
          const h = canvas.height;

          // Red
          ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
          for (let i = 0; i < 256; i++) {
            const barH = (data.rHist[i] / max) * h;
            ctx.fillRect((i / 256) * w, h - barH, w / 256, barH);
          }

          // Green
          ctx.fillStyle = 'rgba(34, 197, 94, 0.4)';
          for (let i = 0; i < 256; i++) {
            const barH = (data.gHist[i] / max) * h;
            ctx.fillRect((i / 256) * w, h - barH, w / 256, barH);
          }

          // Blue
          ctx.fillStyle = 'rgba(59, 130, 246, 0.4)';
          for (let i = 0; i < 256; i++) {
            const barH = (data.bHist[i] / max) * h;
            ctx.fillRect((i / 256) * w, h - barH, w / 256, barH);
          }

          // Luma Outline
          ctx.strokeStyle = '#FF9500';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          for (let i = 0; i < 256; i++) {
            const y = h - (data.lumaHist[i] / max) * h;
            const x = (i / 256) * w;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }

        // 2. Draw Waveform
        if (waveformCanvasRef.current && (activeScope === 'waveform' || activeScope === 'all')) {
          const canvas = waveformCanvasRef.current;
          const ctx = canvas.getContext('2d')!;
          const frame = engine.grabFrame(video, 160, 90);

          ctx.fillStyle = 'rgba(5, 5, 5, 0.85)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // IRE Grid (0, 50, 100 IRE)
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
          ctx.beginPath();
          ctx.moveTo(0, canvas.height * 0.1); ctx.lineTo(canvas.width, canvas.height * 0.1); // 100 IRE
          ctx.moveTo(0, canvas.height * 0.5); ctx.lineTo(canvas.width, canvas.height * 0.5); // 50 IRE
          ctx.moveTo(0, canvas.height * 0.9); ctx.lineTo(canvas.width, canvas.height * 0.9); // 0 IRE
          ctx.stroke();

          if (frame) {
            const d = frame.data;
            ctx.fillStyle = 'rgba(74, 222, 128, 0.35)';
            for (let y = 0; y < 90; y += 2) {
              for (let x = 0; x < 160; x += 2) {
                const i = (y * 160 + x) * 4;
                const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                const waveX = (x / 160) * canvas.width;
                const waveY = canvas.height - (lum / 255) * canvas.height;
                ctx.fillRect(waveX, waveY, 1.5, 1.5);
              }
            }
          }
        }

        // 3. Draw Vectorscope
        if (vectorCanvasRef.current && (activeScope === 'vectorscope' || activeScope === 'all')) {
          const canvas = vectorCanvasRef.current;
          const ctx = canvas.getContext('2d')!;
          const frame = engine.grabFrame(video, 120, 80);

          ctx.fillStyle = 'rgba(5, 5, 5, 0.85)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          const cx = canvas.width / 2;
          const cy = canvas.height / 2;
          const radius = Math.min(cx, cy) - 8;

          // Reticles
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.arc(cx, cy, radius * 0.75, 0, Math.PI * 2);
          ctx.stroke();

          // Skin-tone line
          ctx.strokeStyle = 'rgba(255, 149, 0, 0.8)';
          ctx.beginPath();
          const angle = (123 * Math.PI) / 180;
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(angle) * radius, cy - Math.sin(angle) * radius);
          ctx.stroke();

          if (frame) {
            const d = frame.data;
            ctx.fillStyle = 'rgba(6, 182, 212, 0.4)';
            for (let i = 0; i < d.length; i += 16) {
              const r = d[i];
              const g = d[i + 1];
              const b = d[i + 2];

              const cb = -0.168736 * r - 0.331264 * g + 0.5 * b;
              const cr = 0.5 * r - 0.418688 * g - 0.081312 * b;

              const px = cx + (cb / 128) * radius;
              const py = cy - (cr / 128) * radius;
              ctx.fillRect(px, py, 1.5, 1.5);
            }
          }
        }
      }

      animId = requestAnimationFrame(drawLoop);
    };

    animId = requestAnimationFrame(drawLoop);
    return () => cancelAnimationFrame(animId);
  }, [activeScope, videoRef]);

  if (activeScope === 'none') return null;

  return (
    <div className="absolute top-16 right-4 z-40 flex flex-col gap-2 rounded-xs bg-black/60 p-3 text-[#E0E0E0] backdrop-blur-md border border-white/10 shadow-2xl max-w-xs select-none">
      {/* Header with Scope Switcher Tabs */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#FF9500] uppercase tracking-wider">
          <Activity className="h-3.5 w-3.5" />
          <span>SCOPES HUD</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onSelectScope('histogram')}
            className={`px-1.5 py-0.5 text-[9px] font-mono rounded-xs transition-colors ${
              activeScope === 'histogram' ? 'bg-[#FF9500] text-black font-bold' : 'text-white/40 hover:text-white'
            }`}
          >
            HIST
          </button>
          <button
            onClick={() => onSelectScope('waveform')}
            className={`px-1.5 py-0.5 text-[9px] font-mono rounded-xs transition-colors ${
              activeScope === 'waveform' ? 'bg-[#FF9500] text-black font-bold' : 'text-white/40 hover:text-white'
            }`}
          >
            WAVE
          </button>
          <button
            onClick={() => onSelectScope('vectorscope')}
            className={`px-1.5 py-0.5 text-[9px] font-mono rounded-xs transition-colors ${
              activeScope === 'vectorscope' ? 'bg-[#FF9500] text-black font-bold' : 'text-white/40 hover:text-white'
            }`}
          >
            VCTR
          </button>
          <button
            onClick={() => onSelectScope('all')}
            className={`px-1.5 py-0.5 text-[9px] font-mono rounded-xs transition-colors ${
              activeScope === 'all' ? 'bg-[#FF9500] text-black font-bold' : 'text-white/40 hover:text-white'
            }`}
          >
            ALL
          </button>
          <button
            onClick={onClose}
            className="ml-1 p-0.5 text-white/40 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Scope Canvases */}
      <div className="flex flex-col gap-2">
        {/* Histogram */}
        {(activeScope === 'histogram' || activeScope === 'all') && (
          <div>
            <div className="flex justify-between text-[8px] font-mono text-white/40 uppercase tracking-widest mb-0.5">
              <span>RGB & LUMA HISTOGRAM</span>
              <span>256 BINS</span>
            </div>
            <canvas
              ref={histCanvasRef}
              width={200}
              height={65}
              className="w-full rounded-xs border border-white/10"
            />
          </div>
        )}

        {/* Waveform */}
        {(activeScope === 'waveform' || activeScope === 'all') && (
          <div>
            <div className="flex justify-between text-[8px] font-mono text-white/40 uppercase tracking-widest mb-0.5">
              <span>LUMA WAVEFORM</span>
              <span>100 IRE</span>
            </div>
            <canvas
              ref={waveformCanvasRef}
              width={200}
              height={65}
              className="w-full rounded-xs border border-white/10"
            />
          </div>
        )}

        {/* Vectorscope */}
        {(activeScope === 'vectorscope' || activeScope === 'all') && (
          <div>
            <div className="flex justify-between text-[8px] font-mono text-white/40 uppercase tracking-widest mb-0.5">
              <span>VECTORSCOPE</span>
              <span className="text-[#FF9500]">SKIN I-BAR</span>
            </div>
            <div className="flex justify-center">
              <canvas
                ref={vectorCanvasRef}
                width={110}
                height={110}
                className="rounded-xs border border-white/10"
              />
            </div>
          </div>
        )}

        {/* Audio VU Meter */}
        <div className="flex items-center gap-2 border-t border-white/10 pt-2 font-mono text-[9px]">
          <Mic className="h-3 w-3 text-cyan-400 shrink-0" />
          <div className="flex-1">
            <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden flex">
              <div
                className={`h-full transition-all duration-75 ${
                  audioLevel > 80 ? 'bg-red-500' : audioLevel > 50 ? 'bg-[#FF9500]' : 'bg-green-500'
                }`}
                style={{ width: `${audioLevel}%` }}
              />
            </div>
          </div>
          <span className="w-8 text-right text-white/60">{audioLevel}%</span>
        </div>
      </div>
    </div>
  );
};
