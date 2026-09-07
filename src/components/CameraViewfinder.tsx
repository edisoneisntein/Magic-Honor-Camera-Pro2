import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { 
  CaptureMode, 
  ManualSettings, 
  AIScenePrediction, 
  AspectRatioType
} from '../types';
import { CameraService } from '../services/cameraService';
import { ImageProcessingEngine } from '../services/imageProcessingEngine';
import { SoundEffects } from '../services/soundEffects';
import { 
  Lock, 
  Unlock, 
  Sun, 
  Sparkles, 
  Focus, 
  ZoomIn
} from 'lucide-react';

interface CameraViewfinderProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  mode: CaptureMode;
  settings: ManualSettings;
  aiScene: AIScenePrediction | null;
  processingProgress: number | null;
  processingMessage: string | null;
  isCleanView: boolean;
  shutterFlash: boolean;
  timerCount: number | null;
  cameraFacing: 'environment' | 'user';
  onToggleCleanView: () => void;
  onFocusPointChange: (x: number, y: number) => void;
  onEvChange: (ev: number) => void;
  onToggleFocusMode?: () => void;
  onSwipeModeChange?: (direction: 'next' | 'prev') => void;
  onPinchZoom?: (zoom: number) => Promise<void> | void;
}

interface TwoFingerGestureState {
  initialDist: number;
  initialMidY: number;
  initialZoom: number;
  initialEV: number;
  mode: 'unknown' | 'pinch' | 'brightness';
}

export const CameraViewfinder: React.FC<CameraViewfinderProps> = ({
  videoRef,
  stream,
  mode,
  settings,
  aiScene,
  processingProgress,
  processingMessage,
  isCleanView,
  shutterFlash,
  timerCount,
  cameraFacing,
  onToggleCleanView,
  onFocusPointChange,
  onEvChange,
  onToggleFocusMode,
  onSwipeModeChange,
  onPinchZoom,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const falseColorCanvasRef = useRef<HTMLCanvasElement>(null);
  const peakingCanvasRef = useRef<HTMLCanvasElement>(null);
  const zebraCanvasRef = useRef<HTMLCanvasElement>(null);

  // Tap-to-focus reticle state
  const [focusReticle, setFocusReticle] = useState<{
    x: number;
    y: number;
    visible: boolean;
    locked: boolean;
  } | null>(null);

  // Digital horizon / electronic level orientation
  const [orientation, setOrientation] = useState<{ roll: number; pitch: number }>({ roll: 0, pitch: 0 });

  // Touch gesture tracker refs
  const singleTouchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const twoFingerStateRef = useRef<TwoFingerGestureState | null>(null);
  const lastTapRef = useRef<number>(0);
  const longPressTimerRef = useRef<any>(null);
  const targetZoomRef = useRef<number>(settings.zoomRatio);
  const zoomRafRef = useRef<number | null>(null);

  // Live HUD Gesture Feedback States
  const [focusToast, setFocusToast] = useState<{ mode: 'continuous' | 'manual'; visible: boolean } | null>(null);
  const [activeBrightnessGesture, setActiveBrightnessGesture] = useState<{ ev: number; visible: boolean } | null>(null);
  const [activeZoomGesture, setActiveZoomGesture] = useState<{ zoom: number; visible: boolean } | null>(null);
  const hideBrightnessTimerRef = useRef<any>(null);
  const hideZoomTimerRef = useRef<any>(null);
  const hideFocusToastTimerRef = useRef<any>(null);

  // Device orientation listener for electronic level
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma !== null && e.beta !== null) {
        setOrientation({
          roll: Math.round(e.gamma * 10) / 10,
          pitch: Math.round(e.beta * 10) / 10,
        });
      }
    };

    window.addEventListener('deviceorientation', handleOrientation, true);
    return () => window.removeEventListener('deviceorientation', handleOrientation, true);
  }, []);

  // Live video stream assignment
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((err) => {
        console.warn('Video auto-play prevented:', err);
      });
    }
  }, [stream, videoRef]);

  // Synchronize manual ISO, shutter speed, EV bias, and color temp with hardware
  useEffect(() => {
    CameraService.getInstance().applyManualSettings({
      iso: settings.iso,
      shutterSpeed: settings.shutterSpeed,
      evBias: settings.evBias,
      kelvin: settings.kelvin,
    });
  }, [settings.iso, settings.shutterSpeed, settings.evBias, settings.kelvin]);

  // Real-time Optical Exposure & Color Science computation for live viewfinder
  const exposureFilterStyle = useMemo(() => {
    // 1. EV Bias multiplier
    const evMultiplier = Math.pow(2, settings.evBias || 0);

    // 2. ISO & Shutter Exposure factor
    let manualFactor = 1.0;
    if (settings.iso !== 'auto' && settings.shutterSpeed !== 'auto') {
      const isoVal = typeof settings.iso === 'number' ? settings.iso : 100;
      const shutterSec = typeof settings.shutterSpeed === 'number' ? settings.shutterSpeed : 1 / 125;
      const raw = (isoVal / 100) * (shutterSec / (1 / 125));
      manualFactor = Math.pow(raw, 0.45);
    } else if (settings.iso !== 'auto') {
      const isoVal = typeof settings.iso === 'number' ? settings.iso : 100;
      manualFactor = Math.pow(isoVal / 100, 0.35);
    } else if (settings.shutterSpeed !== 'auto') {
      const shutterSec = typeof settings.shutterSpeed === 'number' ? settings.shutterSpeed : 1 / 125;
      manualFactor = Math.pow(shutterSec / (1 / 125), 0.35);
    }

    const brightness = Math.min(3.2, Math.max(0.08, manualFactor * evMultiplier));
    const contrast = brightness > 1.3 ? 1.08 : brightness < 0.6 ? 1.15 : 1.0;

    // 3. Kelvin Color Temperature
    const kelvinDiff = (settings.kelvin || 5500) - 5500;
    let sepia = 0;
    let hueRotate = 0;
    let saturate = 1.0;

    if (kelvinDiff > 0) {
      // Warm golden/amber
      sepia = Math.min(0.35, (kelvinDiff / 2000) * 0.35);
      saturate = 1.0 + (kelvinDiff / 2000) * 0.15;
    } else if (kelvinDiff < 0) {
      // Cool cyan/blue
      hueRotate = Math.max(-18, (kelvinDiff / 2700) * 18);
      saturate = 1.0 - (Math.abs(kelvinDiff) / 2700) * 0.1;
    }

    return `brightness(${brightness.toFixed(2)}) contrast(${contrast.toFixed(2)}) saturate(${saturate.toFixed(2)}) sepia(${sepia.toFixed(2)}) hue-rotate(${hueRotate.toFixed(1)}deg)`;
  }, [settings.iso, settings.shutterSpeed, settings.evBias, settings.kelvin]);

  // Keep targetZoomRef synchronized with external changes
  useEffect(() => {
    targetZoomRef.current = settings.zoomRatio;
  }, [settings.zoomRatio]);

  // Real-time canvas processing loop for False Color, Peaking, Zebra
  useEffect(() => {
    let animId: number;
    const engine = ImageProcessingEngine.getInstance();
    let stripeOffset = 0;

    const renderLoop = () => {
      const video = videoRef.current;
      if (video && video.readyState >= 2 && !video.paused) {
        stripeOffset = (stripeOffset + 1) % 16;

        if (settings.showFalseColor && falseColorCanvasRef.current) {
          engine.renderFalseColor(video, falseColorCanvasRef.current);
        }

        if (settings.showFocusPeaking && peakingCanvasRef.current) {
          engine.renderFocusPeaking(
            video,
            peakingCanvasRef.current,
            settings.peakingColor,
            settings.peakingThreshold
          );
        }

        if (settings.showZebra && zebraCanvasRef.current) {
          engine.renderZebraPattern(
            video,
            zebraCanvasRef.current,
            settings.zebraThreshold,
            stripeOffset
          );
        }
      }
      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [
    settings.showFalseColor,
    settings.showFocusPeaking,
    settings.peakingColor,
    settings.peakingThreshold,
    settings.showZebra,
    settings.zebraThreshold,
    videoRef,
  ]);

  // Trigger Focus Mode HUD Toast
  const triggerFocusModeToast = useCallback((newFocusMode: 'continuous' | 'manual') => {
    SoundEffects.playFocusBeep();
    clearTimeout(hideFocusToastTimerRef.current);
    setFocusToast({ mode: newFocusMode, visible: true });
    hideFocusToastTimerRef.current = setTimeout(() => {
      setFocusToast((prev) => (prev ? { ...prev, visible: false } : null));
    }, 2000);
  }, []);

  // Asynchronous Smooth Zoom Dispatcher
  const dispatchAsyncZoom = useCallback((zoom: number) => {
    const clamped = Math.round(Math.min(10, Math.max(0.5, zoom)) * 10) / 10;
    targetZoomRef.current = clamped;

    setActiveZoomGesture({ zoom: clamped, visible: true });
    clearTimeout(hideZoomTimerRef.current);

    if (zoomRafRef.current) cancelAnimationFrame(zoomRafRef.current);
    zoomRafRef.current = requestAnimationFrame(async () => {
      if (onPinchZoom) {
        await onPinchZoom(clamped);
      }
    });
  }, [onPinchZoom]);

  // Touch Gesture Event Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      twoFingerStateRef.current = null;
      const touch = e.touches[0];
      const now = Date.now();
      singleTouchStartRef.current = { x: touch.clientX, y: touch.clientY, time: now };

      // Long press detection for AE/AF lock
      longPressTimerRef.current = setTimeout(() => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const xPct = ((touch.clientX - rect.left) / rect.width) * 100;
        const yPct = ((touch.clientY - rect.top) / rect.height) * 100;
        setFocusReticle({
          x: xPct,
          y: yPct,
          visible: true,
          locked: true,
        });
        SoundEffects.playFocusBeep();
      }, 600);
    } else if (e.touches.length === 2) {
      clearTimeout(longPressTimerRef.current);
      singleTouchStartRef.current = null;

      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const midY = (t1.clientY + t2.clientY) / 2;

      twoFingerStateRef.current = {
        initialDist: dist,
        initialMidY: midY,
        initialZoom: settings.zoomRatio,
        initialEV: settings.evBias,
        mode: 'unknown',
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && twoFingerStateRef.current) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const currentMidY = (t1.clientY + t2.clientY) / 2;

      const state = twoFingerStateRef.current;
      const deltaDist = currentDist - state.initialDist;
      const deltaMidY = currentMidY - state.initialMidY;

      if (state.mode === 'unknown') {
        if (Math.abs(deltaDist) > 18) {
          state.mode = 'pinch';
        } else if (Math.abs(deltaMidY) > 15 && Math.abs(deltaDist) < 25) {
          state.mode = 'brightness';
        }
      }

      // 1. PINCH TO ZOOM GESTURE
      if (state.mode === 'pinch') {
        const scaleFactor = currentDist / Math.max(state.initialDist, 1);
        const newZoom = state.initialZoom * scaleFactor;
        dispatchAsyncZoom(newZoom);
      }

      // 2. TWO-FINGER VERTICAL SWIPE FOR BRIGHTNESS
      else if (state.mode === 'brightness') {
        const evDelta = -(deltaMidY / 120);
        const rawEV = state.initialEV + evDelta;
        const clampedEV = Math.round(Math.min(3.0, Math.max(-3.0, rawEV)) * 10) / 10;

        onEvChange(clampedEV);
        setActiveBrightnessGesture({ ev: clampedEV, visible: true });
        clearTimeout(hideBrightnessTimerRef.current);
      }
    } else if (e.touches.length === 1 && singleTouchStartRef.current) {
      const deltaX = e.touches[0].clientX - singleTouchStartRef.current.x;
      const deltaY = e.touches[0].clientY - singleTouchStartRef.current.y;
      if (Math.hypot(deltaX, deltaY) > 12) {
        clearTimeout(longPressTimerRef.current);
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    clearTimeout(longPressTimerRef.current);

    if (twoFingerStateRef.current) {
      twoFingerStateRef.current = null;

      hideZoomTimerRef.current = setTimeout(() => {
        setActiveZoomGesture((prev) => (prev ? { ...prev, visible: false } : null));
      }, 1500);

      hideBrightnessTimerRef.current = setTimeout(() => {
        setActiveBrightnessGesture((prev) => (prev ? { ...prev, visible: false } : null));
      }, 1500);

      return;
    }

    if (!singleTouchStartRef.current) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - singleTouchStartRef.current.x;
    const deltaY = touch.clientY - singleTouchStartRef.current.y;
    const deltaTime = Date.now() - singleTouchStartRef.current.time;

    // Detect horizontal swipe to change modes
    if (Math.abs(deltaX) > 60 && Math.abs(deltaY) < 40 && deltaTime < 350 && onSwipeModeChange) {
      SoundEffects.playTick();
      if (deltaX < 0) {
        onSwipeModeChange('next');
      } else {
        onSwipeModeChange('prev');
      }
      singleTouchStartRef.current = null;
      return;
    }

    // Detect Tap or Double Tap
    if (Math.hypot(deltaX, deltaY) < 15 && deltaTime < 300) {
      const now = Date.now();
      const doubleTapDelay = 320;

      if (now - lastTapRef.current < doubleTapDelay) {
        // DOUBLE TAP -> TOGGLE FOCUS AF / MF
        const nextMode = settings.focusMode === 'continuous' ? 'manual' : 'continuous';
        if (onToggleFocusMode) {
          onToggleFocusMode();
        }
        triggerFocusModeToast(nextMode);
        lastTapRef.current = 0;
      } else {
        // SINGLE TAP -> FOCUS & METERING POINT
        lastTapRef.current = now;
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const xPct = ((touch.clientX - rect.left) / rect.width) * 100;
          const yPct = ((touch.clientY - rect.top) / rect.height) * 100;

          setFocusReticle({
            x: xPct,
            y: yPct,
            visible: true,
            locked: false,
          });

          SoundEffects.playFocusBeep();
          onFocusPointChange(xPct, yPct);

          setTimeout(() => {
            setFocusReticle((prev) => (prev && !prev.locked ? { ...prev, visible: false } : prev));
          }, 3500);
        }
      }
    }

    singleTouchStartRef.current = null;
  };

  // Mouse click fallback for desktop preview
  const handleViewfinderClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('button, input')) return;
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const xPct = ((e.clientX - rect.left) / rect.width) * 100;
      const yPct = ((e.clientY - rect.top) / rect.height) * 100;

      const now = Date.now();
      if (now - lastTapRef.current < 320) {
        const nextMode = settings.focusMode === 'continuous' ? 'manual' : 'continuous';
        if (onToggleFocusMode) {
          onToggleFocusMode();
        }
        triggerFocusModeToast(nextMode);
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = now;

      setFocusReticle({
        x: xPct,
        y: yPct,
        visible: true,
        locked: false,
      });

      SoundEffects.playFocusBeep();
      onFocusPointChange(xPct, yPct);

      setTimeout(() => {
        setFocusReticle((prev) => (prev && !prev.locked ? { ...prev, visible: false } : prev));
      }, 3500);
    },
    [onFocusPointChange, onToggleFocusMode, settings.focusMode, triggerFocusModeToast]
  );

  const toggleFocusLock = (e: React.MouseEvent) => {
    e.stopPropagation();
    SoundEffects.playFocusBeep();
    setFocusReticle((prev) => (prev ? { ...prev, locked: !prev.locked } : null));
  };

  const isLevel = Math.abs(orientation.roll) <= 0.5;
  const focalLengthEquiv = Math.round(24 * settings.zoomRatio);

  const handleWheelZoom = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.2 : -0.2;
      const nextZoom = Math.round(Math.min(10, Math.max(0.5, settings.zoomRatio + delta)) * 10) / 10;
      dispatchAsyncZoom(nextZoom);
    },
    [dispatchAsyncZoom, settings.zoomRatio]
  );

  return (
    <div
      ref={containerRef}
      onClick={handleViewfinderClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheelZoom}
      className="absolute inset-0 h-full w-full overflow-hidden bg-black select-none cursor-crosshair touch-none flex items-center justify-center"
    >
      {/* 1. Base Real Camera Video Canvas with hardware-accelerated zoom scaling and ISP exposure filtering */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{
          transform: `scale(${settings.zoomRatio}) ${cameraFacing === 'user' ? 'scaleX(-1)' : ''}`,
          transformOrigin: 'center center',
          filter: exposureFilterStyle,
          transition: 'transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1), filter 0.12s ease-out',
        }}
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* High-ISO Sensor Grain Simulation Overlay */}
      {typeof settings.iso === 'number' && settings.iso >= 800 && (
        <div 
          className="pointer-events-none absolute inset-0 mix-blend-overlay opacity-25 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:3px_3px]"
          style={{ opacity: Math.min(0.4, (settings.iso / 6400) * 0.35) }}
        />
      )}

      {/* Fallback Simulation Canvas when no hardware camera stream */}
      {!stream && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-radial from-[#151515] to-[#020202] text-white/50 p-6 text-center">
          <div className="w-20 h-20 rounded-full border-2 border-dashed border-[#FF9500]/60 flex items-center justify-center animate-spin-slow mb-3">
            <span className="text-xs font-mono font-bold text-[#FF9500]">108MP</span>
          </div>
          <p className="text-sm font-mono font-bold text-white tracking-widest uppercase mb-1">
            HONOR MAGIC8 LITE — SPECTRA ISP ACTIVE
          </p>
          <p className="text-xs font-mono text-white/40 max-w-xs">
            Sensor óptico 108 MP (f/1.75 OIS). Toca el visor o el obturador para capturar.
          </p>
        </div>
      )}

      {/* Real-time Hardware Filters: False Color */}
      <canvas
        ref={falseColorCanvasRef}
        className={`pointer-events-none absolute inset-0 h-full w-full object-cover mix-blend-screen transition-opacity duration-150 ${
          settings.showFalseColor ? 'opacity-90' : 'opacity-0'
        }`}
      />

      {/* Real-time Hardware Filters: Focus Peaking */}
      <canvas
        ref={peakingCanvasRef}
        className={`pointer-events-none absolute inset-0 h-full w-full object-cover mix-blend-screen transition-opacity duration-150 ${
          settings.showFocusPeaking ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Real-time Hardware Filters: Zebra Stripes */}
      <canvas
        ref={zebraCanvasRef}
        className={`pointer-events-none absolute inset-0 h-full w-full object-cover mix-blend-screen transition-opacity duration-150 ${
          settings.showZebra ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* 2. Aspect Ratio Letterbox Mattes (Overlay Guides for 4:3, 1:1) */}
      {settings.aspectRatio === '4:3' && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between">
          <div className="w-full h-[8vh] bg-black/90 backdrop-blur-xs border-b border-white/15 flex items-center justify-center">
            <span className="text-[8px] font-mono text-white/30 tracking-widest">4:3 RATIO</span>
          </div>
          <div className="w-full h-[8vh] bg-black/90 backdrop-blur-xs border-t border-white/15 flex items-center justify-center">
            <span className="text-[8px] font-mono text-white/30 tracking-widest">108MP FULL SENSOR</span>
          </div>
        </div>
      )}

      {settings.aspectRatio === '1:1' && (
        <div className="pointer-events-none absolute inset-0 z-10 flex justify-between">
          <div className="h-full w-[12vw] bg-black/90 backdrop-blur-xs border-r border-white/15" />
          <div className="h-full w-[12vw] bg-black/90 backdrop-blur-xs border-l border-white/15" />
        </div>
      )}

      {/* 3. Camera Framing Guides (Rule of Thirds Grid) */}
      {!isCleanView && settings.framingGuide === 'thirds' && (
        <div className="pointer-events-none absolute inset-0 z-20 grid grid-cols-3 grid-rows-3 transition-opacity duration-300">
          <div className="border-r border-b border-white/20" />
          <div className="border-r border-b border-white/20" />
          <div className="border-b border-white/20" />
          <div className="border-r border-b border-white/20" />
          <div className="border-r border-b border-white/20" />
          <div className="border-b border-white/20" />
          <div className="border-r border-b border-white/20" />
          <div className="border-r border-b border-white/20" />
          <div />
        </div>
      )}

      {/* 4. Center Reticle & Electronic Gyro Horizon Level */}
      {!isCleanView && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center transition-opacity duration-300">
          {/* Centered Precision Brackets */}
          <div className="relative w-12 h-12 pointer-events-none opacity-60">
            <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-[#FF9500]" />
            <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-[#FF9500]" />
            <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-[#FF9500]" />
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-[#FF9500]" />
          </div>

          {/* Electronic Horizon Level Bar */}
          {settings.showLevel && (
            <div 
              className="absolute flex items-center gap-2 pointer-events-none transition-transform duration-75"
              style={{ transform: `rotate(${Math.max(-45, Math.min(45, orientation.roll))}deg)` }}
            >
              <div className={`h-[2px] w-16 rounded-full transition-colors ${
                isLevel ? 'bg-green-400 shadow-[0_0_8px_#4ade80]' : 'bg-white/40'
              }`} />
              <span className={`text-[8px] font-mono font-bold px-1 py-0.5 rounded-xs transition-colors ${
                isLevel ? 'bg-green-950/80 text-green-400 border border-green-500/40' : 'bg-black/60 text-white/70'
              }`}>
                {orientation.roll > 0 ? `+${orientation.roll}°` : `${orientation.roll}°`}
              </span>
              <div className={`h-[2px] w-16 rounded-full transition-colors ${
                isLevel ? 'bg-green-400 shadow-[0_0_8px_#4ade80]' : 'bg-white/40'
              }`} />
            </div>
          )}
        </div>
      )}

      {/* 5. Interactive Focus & Metering Reticle (Tap-to-Focus) */}
      {focusReticle?.visible && (
        <div
          className="absolute z-30 flex flex-col items-center pointer-events-auto transition-transform duration-100 select-none animate-fadeIn"
          style={{
            left: `${focusReticle.x}%`,
            top: `${focusReticle.y}%`,
            transform: 'translate(-50%, -50%)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative flex items-center justify-center">
            {/* Outer Golden Reticle Box */}
            <div
              className={`h-18 w-18 rounded-xs border-2 transition-all ${
                focusReticle.locked
                  ? 'border-yellow-400 bg-yellow-400/10 shadow-[0_0_15px_rgba(250,204,21,0.5)]'
                  : 'border-[#FF9500] animate-pulse shadow-[0_0_12px_rgba(255,149,0,0.5)]'
              }`}
            >
              <span className="absolute -top-1 -left-1 h-2 w-2 border-t-2 border-l-2 border-white" />
              <span className="absolute -top-1 -right-1 h-2 w-2 border-t-2 border-r-2 border-white" />
              <span className="absolute -bottom-1 -left-1 h-2 w-2 border-b-2 border-l-2 border-white" />
              <span className="absolute -bottom-1 -right-1 h-2 w-2 border-b-2 border-r-2 border-white" />
            </div>

            {/* Lock / Unlock Toggle Button */}
            <button
              onClick={toggleFocusLock}
              className={`absolute -top-7 rounded-full p-1 text-[9px] font-mono font-bold transition-all shadow-lg ${
                focusReticle.locked
                  ? 'bg-yellow-400 text-black border border-yellow-300'
                  : 'bg-black/70 text-white/80 border border-white/20 hover:text-white'
              }`}
              title="Bloqueo AE/AF"
            >
              {focusReticle.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
            </button>

            {/* EV Exposure Bias Vertical Slider Floating Next to Box */}
            <div className="absolute -right-8 flex flex-col items-center gap-1 bg-black/80 p-1 rounded-full border border-white/20 shadow-xl backdrop-blur-md">
              <Sun className="h-3 w-3 text-[#FF9500]" />
              <input
                type="range"
                min="-3"
                max="3"
                step="0.5"
                value={settings.evBias}
                onChange={(e) => onEvChange(parseFloat(e.target.value))}
                className="h-14 w-1.5 accent-[#FF9500] cursor-pointer appearance-none bg-white/20 rounded-full"
                style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
              />
              <span className="text-[7px] font-mono text-[#FF9500] font-bold">
                {settings.evBias > 0 ? `+${settings.evBias}` : settings.evBias}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 6. SHUTTER CURTAIN FLASH EFFECT (Physical shutter feedback) */}
      {shutterFlash && (
        <div className="pointer-events-none absolute inset-0 z-50 bg-white opacity-80 animate-fadeOut" />
      )}

      {/* 7. TIMER COUNTDOWN DISPLAY (3... 2... 1...) */}
      {timerCount !== null && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-xs font-mono">
          <div className="flex flex-col items-center">
            <span className="text-8xl font-black text-white drop-shadow-[0_0_20px_rgba(255,149,0,0.8)] animate-ping">
              {timerCount}
            </span>
            <span className="text-xs text-[#FF9500] tracking-widest uppercase mt-4">
              CAPTURANDO EN {timerCount}S
            </span>
          </div>
        </div>
      )}

      {/* 8. DOUBLE TAP FOCUS TOGGLE TOAST (AF/MF) */}
      {focusToast?.visible && (
        <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 flex items-center gap-3 bg-black/85 backdrop-blur-2xl px-5 py-3 rounded-2xl border border-white/25 shadow-2xl animate-scaleUp font-mono">
          <div className={`p-2 rounded-xl flex items-center justify-center ${
            focusToast.mode === 'continuous'
              ? 'bg-green-500/20 text-green-400 border border-green-500/40 shadow-[0_0_15px_rgba(74,222,128,0.3)]'
              : 'bg-[#FF9500]/20 text-[#FF9500] border border-[#FF9500]/40 shadow-[0_0_15px_rgba(255,149,0,0.3)]'
          }`}>
            <Focus className="h-5 w-5 animate-pulse" />
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] text-white/50 tracking-widest uppercase">ENFOQUE MODIFICADO</span>
            <span className="text-xs font-bold text-white tracking-wide">
              {focusToast.mode === 'continuous' ? 'AUTOFOCUS CONTINUO (AF-C)' : 'ENFOQUE MANUAL (MF)'}
            </span>
          </div>
        </div>
      )}

      {/* 9. TWO-FINGER VERTICAL SWIPE BRIGHTNESS (EV) HUD METER */}
      {activeBrightnessGesture?.visible && (
        <div className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-2 bg-black/80 backdrop-blur-xl px-3 py-4 rounded-2xl border border-white/20 shadow-2xl animate-fadeIn font-mono">
          <Sun className="h-5 w-5 text-[#FF9500] animate-spin-slow" />
          <div className="relative h-36 w-2.5 bg-white/20 rounded-full overflow-hidden flex flex-col justify-end p-0.5">
            <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-white/60 z-10" />
            <div 
              className="w-full bg-linear-to-t from-amber-500 to-yellow-300 rounded-full transition-all duration-75"
              style={{
                height: `${((activeBrightnessGesture.ev + 3) / 6) * 100}%`
              }}
            />
          </div>
          <span className="text-xs font-bold text-[#FF9500]">
            {activeBrightnessGesture.ev > 0 ? `+${activeBrightnessGesture.ev}` : activeBrightnessGesture.ev} EV
          </span>
        </div>
      )}

      {/* 10. PINCH-TO-ZOOM ASYNC MAGNIFICATION HUD */}
      {activeZoomGesture?.visible && (
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-1 bg-black/80 backdrop-blur-2xl px-6 py-4 rounded-3xl border border-white/25 shadow-2xl animate-fadeIn font-mono">
          <div className="relative flex items-center justify-center mb-1">
            <div className="w-14 h-14 rounded-full border-2 border-dashed border-[#FF9500]/60 flex items-center justify-center animate-spin-slow">
              <ZoomIn className="h-5 w-5 text-[#FF9500]" />
            </div>
            <span className="absolute text-xs font-bold text-white">
              {activeZoomGesture.zoom}x
            </span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-xs font-bold text-white tracking-widest">
              {activeZoomGesture.zoom < 1.0 ? 'ULTRA WIDE' : activeZoomGesture.zoom === 1.0 ? '108MP SENSOR' : activeZoomGesture.zoom <= 3.0 ? 'LOSSLESS ISZ' : 'DIGITAL ZOOM'}
            </span>
            <span className="text-[9px] text-[#FF9500] font-bold">
              {focalLengthEquiv}mm eq.
            </span>
          </div>
        </div>
      )}

      {/* 11. AI Scene Recognition Pill */}
      {!isCleanView && aiScene && (
        <div className="pointer-events-none absolute top-16 left-4 z-20 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-[10px] font-mono text-white backdrop-blur-md border border-white/15 shadow-xl animate-fadeIn">
          <Sparkles className="h-3 w-3 text-[#FF9500]" />
          <span className="font-bold text-white">{aiScene.label}</span>
          <span className="text-[9px] text-green-400">({aiScene.confidence}%)</span>
        </div>
      )}

      {/* 12. Computational Pipeline Processing Overlay Bar */}
      {processingProgress !== null && (
        <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md text-white font-mono p-4 animate-fadeIn">
          <div className="w-16 h-16 rounded-full border-4 border-white/10 border-t-[#FF9500] animate-spin mb-4" />
          <p className="text-sm font-bold text-[#FF9500] tracking-wider uppercase mb-1">
            {processingMessage || 'Procesando captura computacional...'}
          </p>
          <div className="w-64 h-2 bg-white/20 rounded-full overflow-hidden mt-2">
            <div 
              className="h-full bg-linear-to-r from-[#FF9500] to-amber-300 transition-all duration-150"
              style={{ width: `${processingProgress}%` }}
            />
          </div>
          <span className="text-xs text-white/60 mt-1">{processingProgress}% COMPLETADO</span>
        </div>
      )}
    </div>
  );
};
