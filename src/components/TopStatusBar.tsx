import React, { useState, useEffect, useRef } from 'react';
import { 
  Zap, 
  ZapOff, 
  Sparkles, 
  Clock, 
  Crop, 
  ChevronDown, 
  Settings, 
  Grid, 
  Compass, 
  Activity, 
  Layers, 
  Check, 
  Flame,
  Camera,
  Film,
  FileText,
  Download
} from 'lucide-react';
import { CaptureMode, ManualSettings, ThermalState, AspectRatioType, OutputFormat } from '../types';
import { SoundEffects } from '../services/soundEffects';

interface TopStatusBarProps {
  mode: CaptureMode;
  settings: ManualSettings;
  thermal: ThermalState;
  torchOn: boolean;
  onToggleTorch: () => void;
  onChangeSettings: (partial: Partial<ManualSettings>) => void;
  onToggleLab: () => void;
  onToggleDocs: () => void;
  onToggleScopes: () => void;
  onOpenInstall: () => void;
  cameraFacing: 'environment' | 'user';
  isCleanView: boolean;
  onToggleCleanView: () => void;
  isRecordingVideo: boolean;
  recordingSeconds: number;
}

type DropdownType = 'flash' | 'ai' | 'aspect' | 'timer' | 'settings' | null;

export const TopStatusBar: React.FC<TopStatusBarProps> = ({
  mode,
  settings,
  thermal,
  torchOn,
  onToggleTorch,
  onChangeSettings,
  onToggleLab,
  onToggleDocs,
  onToggleScopes,
  onOpenInstall,
  cameraFacing,
  isCleanView,
  isRecordingVideo,
  recordingSeconds,
}) => {
  const [activeDropdown, setActiveDropdown] = useState<DropdownType>(null);
  const containerRef = useRef<HTMLElement>(null);

  const isVideoMode = mode === 'video' || mode === 'cinematic';

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const toggleDropdown = (type: DropdownType) => {
    SoundEffects.playTick();
    setActiveDropdown((prev) => (prev === type ? null : type));
  };

  // Format recording timecode
  const formatTimecode = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (isCleanView) return null;

  return (
    <header 
      ref={containerRef}
      className="pointer-events-none absolute top-0 left-0 right-0 z-40 flex flex-col bg-linear-to-b from-black/95 via-black/60 to-transparent pt-3 pb-8 px-4 text-[#E0E0E0] select-none font-mono"
    >
      {/* Top Essential Icons Row */}
      <div className="flex items-center justify-between w-full max-w-2xl mx-auto pointer-events-auto">
        {/* 1. Flash Selector Dropdown Trigger */}
        <div className="relative">
          <button
            onClick={() => toggleDropdown('flash')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full backdrop-blur-md transition-all active:scale-95 border ${
              torchOn
                ? 'bg-[#FF9500] text-black border-[#FF9500] shadow-[0_0_12px_#FF9500]'
                : activeDropdown === 'flash'
                ? 'bg-white/25 text-white border-white/40'
                : 'bg-white/10 text-white/80 hover:text-white border-white/10'
            }`}
            title="Menú Desplegable de Flash"
          >
            {torchOn ? (
              <Flame className="h-4 w-4 fill-current" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            <span className="text-[10px] font-bold uppercase">
              {torchOn ? 'LUZ' : 'FLASH'}
            </span>
            <ChevronDown className={`h-3 w-3 transition-transform ${activeDropdown === 'flash' ? 'rotate-180 text-[#FF9500]' : 'opacity-60'}`} />
          </button>

          {/* Flash Dropdown Popover */}
          {activeDropdown === 'flash' && (
            <div className="absolute top-full left-0 mt-2 w-48 bg-black/95 backdrop-blur-2xl rounded-2xl border border-white/20 shadow-2xl p-1.5 z-50 animate-fadeIn">
              <div className="text-[9px] font-bold text-[#FF9500] px-3 py-1 uppercase tracking-wider border-b border-white/10 mb-1">
                Control de Flash
              </div>
              <button
                onClick={() => {
                  if (torchOn) onToggleTorch();
                  toggleDropdown(null);
                }}
                className="flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs text-white/80 hover:bg-white/10 hover:text-white transition-all text-left"
              >
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-yellow-400" />
                  <span>Automático</span>
                </div>
                {!torchOn && <Check className="h-3.5 w-3.5 text-[#FF9500]" />}
              </button>
              <button
                onClick={() => {
                  if (torchOn) onToggleTorch();
                  toggleDropdown(null);
                }}
                className="flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs text-white/80 hover:bg-white/10 hover:text-white transition-all text-left"
              >
                <div className="flex items-center gap-2">
                  <ZapOff className="h-3.5 w-3.5 text-white/40" />
                  <span>Desactivado</span>
                </div>
              </button>
              <button
                onClick={() => {
                  if (!torchOn) onToggleTorch();
                  toggleDropdown(null);
                }}
                className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs transition-all text-left ${
                  torchOn ? 'bg-[#FF9500]/20 text-[#FF9500]' : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Flame className="h-3.5 w-3.5 fill-[#FF9500] text-[#FF9500]" />
                  <span className="font-bold">Luz Linterna (Torch)</span>
                </div>
                {torchOn && <Check className="h-3.5 w-3.5 text-[#FF9500]" />}
              </button>
            </div>
          )}
        </div>

        {/* 2. AI Ultra & Output Format Dropdown Trigger */}
        <div className="relative">
          <button
            onClick={() => toggleDropdown('ai')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md transition-all active:scale-95 border ${
              activeDropdown === 'ai'
                ? 'bg-[#FF9500]/30 text-[#FF9500] border-[#FF9500]'
                : settings.format === 'raw_dng'
                ? 'bg-purple-600/30 text-purple-300 border-purple-400/40'
                : 'bg-white/10 text-white/80 hover:text-white border-white/10'
            }`}
            title="Menú Desplegable de IA y Formato"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#FF9500]" />
            <span className="text-[10px] font-bold uppercase">
              {settings.format === 'raw_dng' ? 'RAW DNG' : 'AI ULTRA'}
            </span>
            <ChevronDown className={`h-3 w-3 transition-transform ${activeDropdown === 'ai' ? 'rotate-180 text-[#FF9500]' : 'opacity-60'}`} />
          </button>

          {/* AI & Format Dropdown Popover */}
          {activeDropdown === 'ai' && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-56 bg-black/95 backdrop-blur-2xl rounded-2xl border border-white/20 shadow-2xl p-1.5 z-50 animate-fadeIn">
              <div className="text-[9px] font-bold text-[#FF9500] px-3 py-1 uppercase tracking-wider border-b border-white/10 mb-1">
                Motor de Imagen & Formato
              </div>
              <button
                onClick={() => {
                  onChangeSettings({ format: 'jpeg' });
                  toggleDropdown(null);
                }}
                className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs transition-all text-left ${
                  settings.format === 'jpeg' ? 'bg-white/15 text-white font-bold' : 'text-white/80 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-[#FF9500]" />
                  <div>
                    <div>AI Ultra 3.0</div>
                    <div className="text-[9px] text-white/40 font-normal">Realce computacional IA</div>
                  </div>
                </div>
                {settings.format === 'jpeg' && <Check className="h-3.5 w-3.5 text-[#FF9500]" />}
              </button>
              <button
                onClick={() => {
                  onChangeSettings({ format: 'raw_dng' });
                  toggleDropdown(null);
                }}
                className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs transition-all text-left ${
                  settings.format === 'raw_dng' ? 'bg-purple-600/30 text-purple-300 font-bold' : 'text-white/80 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-purple-400" />
                  <div>
                    <div>RAW DNG (108 MP)</div>
                    <div className="text-[9px] text-white/40 font-normal">Matriz lineal 16-bit sin pérdida</div>
                  </div>
                </div>
                {settings.format === 'raw_dng' && <Check className="h-3.5 w-3.5 text-purple-400" />}
              </button>
            </div>
          )}
        </div>

        {/* Center: Live Recording Beacon */}
        {isRecordingVideo && (
          <div className="flex items-center gap-2 bg-red-600/90 text-white px-3 py-1 rounded-full shadow-[0_0_15px_rgba(220,38,38,0.6)] border border-red-400/40 animate-pulse">
            <div className="h-2 w-2 rounded-full bg-white animate-ping" />
            <span className="text-xs font-bold tracking-widest">{formatTimecode(recordingSeconds)}</span>
          </div>
        )}

        {/* 3. Aspect Ratio Dropdown Trigger */}
        <div className="relative">
          <button
            onClick={() => toggleDropdown('aspect')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full backdrop-blur-md transition-all active:scale-95 border ${
              activeDropdown === 'aspect'
                ? 'bg-white/25 text-white border-white/40'
                : 'bg-white/10 text-white/80 hover:text-white border-white/10'
            }`}
            title="Menú Desplegable de Relación de Aspecto"
          >
            <Crop className="h-3.5 w-3.5 text-[#FF9500]" />
            <span className="text-[10px] font-bold">{settings.aspectRatio}</span>
            <ChevronDown className={`h-3 w-3 transition-transform ${activeDropdown === 'aspect' ? 'rotate-180 text-[#FF9500]' : 'opacity-60'}`} />
          </button>

          {/* Aspect Ratio Dropdown Popover */}
          {activeDropdown === 'aspect' && (
            <div className="absolute top-full right-0 mt-2 w-48 bg-black/95 backdrop-blur-2xl rounded-2xl border border-white/20 shadow-2xl p-1.5 z-50 animate-fadeIn">
              <div className="text-[9px] font-bold text-[#FF9500] px-3 py-1 uppercase tracking-wider border-b border-white/10 mb-1">
                Relación de Aspecto
              </div>
              {[
                { label: '4:3', sub: 'Sensor Completo 108 MP', val: '4:3' as AspectRatioType },
                { label: '16:9', sub: 'Panorámico Cinemático', val: '16:9' as AspectRatioType },
                { label: '1:1', sub: 'Cuadrado Redes', val: '1:1' as AspectRatioType },
              ].map((r) => (
                <button
                  key={r.val}
                  onClick={() => {
                    onChangeSettings({ aspectRatio: r.val });
                    toggleDropdown(null);
                  }}
                  className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs transition-all text-left ${
                    settings.aspectRatio === r.val ? 'bg-white/15 text-white font-bold' : 'text-white/80 hover:bg-white/10'
                  }`}
                >
                  <div>
                    <div>{r.label}</div>
                    <div className="text-[9px] text-white/40 font-normal">{r.sub}</div>
                  </div>
                  {settings.aspectRatio === r.val && <Check className="h-3.5 w-3.5 text-[#FF9500]" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 4. Timer Dropdown Trigger */}
        <div className="relative">
          <button
            onClick={() => toggleDropdown('timer')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full backdrop-blur-md transition-all active:scale-95 border ${
              settings.timer > 0
                ? 'bg-[#FF9500] text-black border-[#FF9500] shadow-[0_0_10px_#FF9500]'
                : activeDropdown === 'timer'
                ? 'bg-white/25 text-white border-white/40'
                : 'bg-white/10 text-white/80 hover:text-white border-white/10'
            }`}
            title="Menú Desplegable de Temporizador"
          >
            <Clock className="h-3.5 w-3.5" />
            <span className="text-[10px] font-bold">{settings.timer > 0 ? `${settings.timer}s` : 'OFF'}</span>
            <ChevronDown className={`h-3 w-3 transition-transform ${activeDropdown === 'timer' ? 'rotate-180 text-[#FF9500]' : 'opacity-60'}`} />
          </button>

          {/* Timer Dropdown Popover */}
          {activeDropdown === 'timer' && (
            <div className="absolute top-full right-0 mt-2 w-48 bg-black/95 backdrop-blur-2xl rounded-2xl border border-white/20 shadow-2xl p-1.5 z-50 animate-fadeIn">
              <div className="text-[9px] font-bold text-[#FF9500] px-3 py-1 uppercase tracking-wider border-b border-white/10 mb-1">
                Temporizador
              </div>
              {[
                { label: 'Desactivado', sec: 0 as const },
                { label: '2 Segundos (Rápido)', sec: 2 as const },
                { label: '5 Segundos (Medio)', sec: 5 as const },
                { label: '10 Segundos (Trípode)', sec: 10 as const },
              ].map((t) => (
                <button
                  key={t.sec}
                  onClick={() => {
                    onChangeSettings({ timer: t.sec });
                    toggleDropdown(null);
                  }}
                  className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs transition-all text-left ${
                    settings.timer === t.sec ? 'bg-white/15 text-white font-bold' : 'text-white/80 hover:bg-white/10'
                  }`}
                >
                  <span>{t.label}</span>
                  {settings.timer === t.sec && <Check className="h-3.5 w-3.5 text-[#FF9500]" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 5. Install App Action Button */}
        <button
          onClick={() => {
            SoundEffects.playTick();
            onOpenInstall();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md transition-all active:scale-95 border bg-[#FF9500]/20 text-[#FF9500] hover:bg-[#FF9500]/35 border-[#FF9500]/50 shadow-[0_0_12px_rgba(255,149,0,0.35)]"
          title="Instalar Cámara Pro / Descargar Instalador"
        >
          <Download className="h-3.5 w-3.5 animate-bounce" />
          <span className="text-[10px] font-bold tracking-wider">INSTALAR</span>
        </button>

        {/* 6. Settings / Camera Tools Dropdown Trigger */}
        <div className="relative">
          <button
            onClick={() => toggleDropdown('settings')}
            className={`p-2 rounded-full backdrop-blur-md transition-all active:scale-95 border ${
              activeDropdown === 'settings'
                ? 'bg-[#FF9500] text-black border-[#FF9500]'
                : 'bg-white/10 text-white hover:bg-white/20 border-white/10'
            }`}
            title="Menú Desplegable de Ajustes y Asistencias"
          >
            <Settings className="h-4 w-4" />
          </button>

          {/* Settings Dropdown Popover */}
          {activeDropdown === 'settings' && (
            <div className="absolute top-full right-0 mt-2 w-64 bg-black/95 backdrop-blur-2xl rounded-2xl border border-white/20 shadow-2xl p-2 z-50 animate-fadeIn">
              <div className="text-[9px] font-bold text-[#FF9500] px-3 py-1 uppercase tracking-wider border-b border-white/10 mb-1">
                Asistencias de Cámara
              </div>
              
              {/* Cuadrícula */}
              <button
                onClick={() => {
                  SoundEffects.playTick();
                  onChangeSettings({
                    framingGuide: settings.framingGuide === 'thirds' ? 'none' : 'thirds',
                  });
                }}
                className="flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs text-white/80 hover:bg-white/10 hover:text-white transition-all text-left"
              >
                <div className="flex items-center gap-2">
                  <Grid className="h-4 w-4 text-[#FF9500]" />
                  <span>Cuadrícula 3x3</span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${settings.framingGuide === 'thirds' ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'}`}>
                  {settings.framingGuide === 'thirds' ? 'ON' : 'OFF'}
                </span>
              </button>

              {/* Nivel Giroscópico */}
              <button
                onClick={() => {
                  SoundEffects.playTick();
                  onChangeSettings({ showLevel: !settings.showLevel });
                }}
                className="flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs text-white/80 hover:bg-white/10 hover:text-white transition-all text-left"
              >
                <div className="flex items-center gap-2">
                  <Compass className="h-4 w-4 text-green-400" />
                  <span>Nivel Giroscópico</span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${settings.showLevel ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'}`}>
                  {settings.showLevel ? 'ON' : 'OFF'}
                </span>
              </button>

              {/* Focus Peaking */}
              <button
                onClick={() => {
                  SoundEffects.playTick();
                  onChangeSettings({ showFocusPeaking: !settings.showFocusPeaking });
                }}
                className="flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs text-white/80 hover:bg-white/10 hover:text-white transition-all text-left"
              >
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-cyan-400" />
                  <span>Focus Peaking</span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${settings.showFocusPeaking ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/10 text-white/40'}`}>
                  {settings.showFocusPeaking ? 'ON' : 'OFF'}
                </span>
              </button>

              {/* Tools Divider */}
              <div className="my-1 border-t border-white/10 pt-1">
                <button
                  onClick={() => { onOpenInstall(); toggleDropdown(null); }}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-xs text-[#FF9500] font-bold bg-[#FF9500]/10 hover:bg-[#FF9500]/20 mb-1"
                >
                  <Download className="h-3.5 w-3.5 text-[#FF9500]" />
                  <span>Instalador de Cámara / PWA</span>
                </button>
                <button
                  onClick={() => { onToggleScopes(); toggleDropdown(null); }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 rounded-xl text-xs text-white/70 hover:bg-white/10 hover:text-white"
                >
                  <Film className="h-3.5 w-3.5 text-[#FF9500]" />
                  <span>Monitores Cinemáticos (Scopes)</span>
                </button>
                <button
                  onClick={() => { onToggleLab(); toggleDropdown(null); }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 rounded-xl text-xs text-white/70 hover:bg-white/10 hover:text-white"
                >
                  <Camera className="h-3.5 w-3.5 text-blue-400" />
                  <span>Hardware Lab & Diagnóstico</span>
                </button>
                <button
                  onClick={() => { onToggleDocs(); toggleDropdown(null); }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 rounded-xl text-xs text-white/70 hover:bg-white/10 hover:text-white"
                >
                  <FileText className="h-3.5 w-3.5 text-amber-400" />
                  <span>Manual de Usuario</span>
                </button>
              </div>

              {/* Thermal / Battery Status */}
              <div className="mt-1 pt-1 border-t border-white/10 flex items-center justify-between text-[9px] text-white/40 px-2">
                <span>BAT: <strong className="text-green-400">{thermal.batteryLevelPercent}%</strong></span>
                <span>TEMP: <strong className="text-white">{thermal.temperatureC}°C</strong></span>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
