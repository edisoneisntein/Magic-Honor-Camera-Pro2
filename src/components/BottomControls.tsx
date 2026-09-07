import React, { useRef, useEffect, useState } from 'react';
import { 
  CaptureMode, 
  CapturedMediaItem, 
  ManualSettings 
} from '../types';
import { 
  RotateCw, 
  Image as ImageIcon, 
  Sparkles,
  Square,
  Sliders,
  ChevronDown
} from 'lucide-react';
import { SoundEffects } from '../services/soundEffects';
import { ManualControlsBar } from './ManualControlsBar';

interface BottomControlsProps {
  mode: CaptureMode;
  onSelectMode: (mode: CaptureMode) => void;
  onShutter: () => void;
  isCapturing: boolean;
  isRecordingVideo: boolean;
  onFlipCamera: () => void;
  onOpenGallery: () => void;
  lastMedia: CapturedMediaItem | null;
  settings: ManualSettings;
  onChangeSettings: (partial: Partial<ManualSettings>) => void;
  onChangeZoom: (zoom: number) => void;
  onToggleProControls: () => void;
  isProControlsOpen: boolean;
  isCleanView?: boolean;
  onStartBurst?: () => void;
  onStopBurst?: () => void;
}

const MODES: Array<{ id: CaptureMode; label: string; badge?: string }> = [
  { id: 'smart_auto', label: 'APERTURA' },
  { id: 'night_pro', label: 'NOCHE', badge: 'RAW' },
  { id: 'photo', label: 'FOTO' },
  { id: 'video', label: 'VÍDEO' },
  { id: 'pro', label: 'PRO', badge: 'MANUAL' },
  { id: 'mode_108mp', label: '108 MP', badge: 'ULTRA' },
  { id: 'cinematic', label: 'CINEMA', badge: 'LOG' },
  { id: 'hdr', label: 'HDR' },
  { id: 'focus_stack', label: 'MACRO' },
];

const ZOOM_PILLS = [
  { label: '0.6x', value: 0.6, sub: 'UW' },
  { label: '1x', value: 1.0, sub: '108M' },
  { label: '2x', value: 2.0, sub: '2X' },
  { label: '3x', value: 3.0, sub: 'ISZ' },
  { label: '5x', value: 5.0, sub: '5X' },
  { label: '10x', value: 10.0, sub: '10X' },
];

export const BottomControls: React.FC<BottomControlsProps> = ({
  mode,
  onSelectMode,
  onShutter,
  isCapturing,
  isRecordingVideo,
  onFlipCamera,
  onOpenGallery,
  lastMedia,
  settings,
  onChangeSettings,
  onChangeZoom,
  isProControlsOpen,
  onToggleProControls,
  isCleanView,
}) => {
  const modeContainerRef = useRef<HTMLDivElement>(null);
  const [showZoomDial, setShowZoomDial] = useState(false);
  const isVideo = mode === 'video' || mode === 'cinematic';
  const isNight = mode === 'night_pro';
  const is108M = mode === 'mode_108mp';
  const isProMode = mode === 'pro' || mode === 'cinematic' || isProControlsOpen;

  // Smoothly center the active mode
  useEffect(() => {
    if (modeContainerRef.current) {
      const activeEl = modeContainerRef.current.querySelector(`[data-mode="${mode}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({
          behavior: 'smooth',
          inline: 'center',
          block: 'nearest',
        });
      }
    }
  }, [mode]);

  if (isCleanView) return null;

  const currentFocalMm = Math.round(24 * settings.zoomRatio);

  return (
    <footer className="pointer-events-none absolute bottom-0 left-0 right-0 z-30 flex flex-col items-center bg-linear-to-t from-black/95 via-black/75 to-transparent pt-4 pb-6 px-4 select-none font-mono">
      {/* 1. Zoom Selector Layer (Continuous Wheel Slider or Discrete Quick Pills) */}
      {showZoomDial ? (
        <div className="pointer-events-auto mb-2.5 flex flex-col items-center gap-2 bg-black/85 backdrop-blur-2xl px-4 py-2.5 rounded-2xl border border-white/20 shadow-2xl animate-scaleUp max-w-sm w-full">
          <div className="flex w-full items-center justify-between text-xs text-white/80">
            <span className="font-bold text-[#FF9500] text-sm">{settings.zoomRatio}x</span>
            <span className="text-[10px] text-white/50">{currentFocalMm}mm equivalente</span>
            <button
              onClick={() => setShowZoomDial(false)}
              className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10"
              title="Cerrar dial"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          <div className="w-full flex items-center gap-3">
            <span className="text-[10px] font-bold text-white/40">0.6x</span>
            <input
              type="range"
              min="0.6"
              max="10.0"
              step="0.1"
              value={settings.zoomRatio}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                SoundEffects.playTick();
                onChangeZoom(val);
              }}
              className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#FF9500]"
            />
            <span className="text-[10px] font-bold text-[#FF9500]">10x</span>
          </div>

          <div className="flex items-center justify-between w-full pt-1 border-t border-white/10">
            {ZOOM_PILLS.map((z) => (
              <button
                key={z.label}
                onClick={() => {
                  SoundEffects.playTick();
                  onChangeZoom(z.value);
                }}
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${
                  Math.abs(settings.zoomRatio - z.value) < 0.15
                    ? 'bg-[#FF9500] text-black shadow-sm scale-105'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                {z.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Discrete Smartphone Zoom Switcher Pills (0.6x, 1x, 2x, 3x, 5x, 10x) */
        <div className="pointer-events-auto mb-2.5 flex items-center gap-1 bg-black/60 backdrop-blur-xl px-2 py-1 rounded-full border border-white/15 shadow-2xl">
          {ZOOM_PILLS.map((z) => {
            const isSelected = Math.abs(settings.zoomRatio - z.value) < 0.15;
            return (
              <button
                key={z.label}
                onClick={() => {
                  SoundEffects.playTick();
                  onChangeZoom(z.value);
                }}
                onDoubleClick={() => setShowZoomDial(true)}
                className={`relative px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                  isSelected
                    ? 'bg-[#FF9500] text-black shadow-[0_0_12px_#FF9500] scale-105'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                {z.label}
              </button>
            );
          })}
          <button
            onClick={() => {
              SoundEffects.playTick();
              setShowZoomDial(true);
            }}
            className="p-1 rounded-full text-white/60 hover:text-[#FF9500] hover:bg-white/10 ml-0.5"
            title="Abrir dial de zoom fino continuo 0.6x-10x"
          >
            <Sliders className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 2. Manual Pro Controls Bar (ISO | S | EV | AF | WB) with non-overlapping Dropdowns */}
      {isProMode && (
        <ManualControlsBar
          settings={settings}
          onChangeSettings={onChangeSettings}
          isCleanView={isCleanView}
        />
      )}

      {/* 3. Horizontal Native Mode Carousel */}
      <div
        ref={modeContainerRef}
        className="pointer-events-auto mb-4 flex w-full max-w-lg items-center gap-6 overflow-x-auto px-16 py-1.5 scrollbar-none text-xs mask-gradient justify-start"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {MODES.map((m) => {
          const isActive = mode === m.id;
          return (
            <button
              key={m.id}
              data-mode={m.id}
              onClick={() => {
                SoundEffects.playTick();
                onSelectMode(m.id);
              }}
              className={`relative shrink-0 font-bold uppercase tracking-widest transition-all duration-200 ${
                isActive
                  ? 'text-[#FF9500] scale-110 drop-shadow-[0_0_8px_rgba(255,149,0,0.8)]'
                  : 'text-white/40 hover:text-white/80'
              }`}
              style={{ scrollSnapAlign: 'center' }}
            >
              <span>{m.label}</span>
              {m.badge && (
                <span className="ml-1 rounded-xs bg-[#FF9500]/20 px-1 py-0.2 text-[7px] text-[#FF9500] border border-[#FF9500]/40">
                  {m.badge}
                </span>
              )}
              {isActive && (
                <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[#FF9500] rounded-full shadow-[0_0_6px_#FF9500]" />
              )}
            </button>
          );
        })}
      </div>

      {/* 4. Smartphone Shutter Deck (Gallery Thumbnail | Shutter Button | Camera Flip) */}
      <div className="pointer-events-auto flex w-full max-w-md items-center justify-around px-4">
        {/* Left: Round Gallery Thumbnail */}
        <button
          onClick={onOpenGallery}
          className="group relative flex h-14 w-14 items-center justify-center rounded-full overflow-hidden border-2 border-white/30 bg-black/60 backdrop-blur-md shadow-2xl transition-all hover:scale-105 active:scale-95 hover:border-[#FF9500]"
          title="Ver Galería de Fotos"
        >
          {lastMedia ? (
            <img
              src={lastMedia.thumbnailUrl || lastMedia.dataUrl}
              alt="Última foto"
              className="h-full w-full object-cover"
            />
          ) : (
            <ImageIcon className="h-6 w-6 text-white/50 group-hover:text-white" />
          )}
          {lastMedia?.format?.includes('RAW') && (
            <span className="absolute bottom-0 left-0 right-0 bg-[#FF9500] text-[6px] font-mono font-bold text-black text-center">
              RAW
            </span>
          )}
        </button>

        {/* Center: Iconic Smartphone Shutter Button */}
        <div className="relative flex items-center justify-center">
          {/* External Outer Ring */}
          <div
            className={`absolute h-22 w-22 rounded-full border-2 transition-all duration-300 pointer-events-none ${
              isRecordingVideo
                ? 'border-red-500 scale-110 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.6)]'
                : isNight
                ? 'border-[#FF9500] scale-105 shadow-[0_0_15px_rgba(255,149,0,0.5)]'
                : is108M
                ? 'border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.5)]'
                : 'border-white/50'
            }`}
          />

          {/* Shutter Trigger Button */}
          <button
            onClick={onShutter}
            disabled={isCapturing}
            className={`relative flex items-center justify-center h-18 w-18 rounded-full shadow-2xl transition-all duration-150 active:scale-90 ${
              isCapturing
                ? 'opacity-80 cursor-wait'
                : isRecordingVideo
                ? 'bg-red-600 hover:bg-red-500'
                : isVideo
                ? 'bg-red-500 hover:bg-red-400'
                : isNight
                ? 'bg-linear-to-tr from-amber-600 to-yellow-400 hover:from-amber-500 hover:to-yellow-300'
                : 'bg-white hover:bg-neutral-100'
            }`}
            title={isVideo ? (isRecordingVideo ? 'Detener Grabación' : 'Grabar Vídeo') : 'Disparar Fotografía'}
          >
            {/* Shutter Center Graphics */}
            {isRecordingVideo ? (
              <Square className="h-6 w-6 fill-white text-white rounded-xs" />
            ) : isVideo ? (
              <div className="h-7 w-7 rounded-full bg-white shadow-md" />
            ) : isNight ? (
              <Sparkles className="h-7 w-7 text-black fill-black/20" />
            ) : is108M ? (
              <span className="text-[10px] font-bold text-black tracking-tighter">108M</span>
            ) : (
              <div className="h-16 w-16 rounded-full border-2 border-black/10 flex items-center justify-center">
                <div className="h-2 w-2 rounded-full bg-[#FF9500] opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
          </button>
        </div>

        {/* Right: Camera Lens Switcher (Front <-> Back 108MP) */}
        <button
          onClick={() => {
            SoundEffects.playTick();
            onFlipCamera();
          }}
          className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/20 bg-black/60 backdrop-blur-md text-white/80 shadow-2xl transition-all hover:text-white hover:scale-105 active:scale-95 active:rotate-180 hover:border-white"
          title="Cambiar Cámara (108MP / Frontal Selfie)"
        >
          <RotateCw className="h-6 w-6 transition-transform duration-300" />
        </button>
      </div>
    </footer>
  );
};
