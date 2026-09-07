import React, { useState, useEffect, useRef } from 'react';
import { ManualSettings } from '../types';
import { SoundEffects } from '../services/soundEffects';
import { 
  RotateCcw,
  Check,
  ChevronUp,
  ChevronDown,
  Clock,
  Gauge,
  SunMedium,
  Crosshair,
  Sliders
} from 'lucide-react';

interface ManualControlsBarProps {
  settings: ManualSettings;
  onChangeSettings: (partial: Partial<ManualSettings>) => void;
  isOpen?: boolean;
  onToggleOpen?: () => void;
  isCleanView?: boolean;
}

const ISO_PILLS: Array<{ label: string; value: number | 'auto' }> = [
  { label: 'AUTO', value: 'auto' },
  { label: '50', value: 50 },
  { label: '100', value: 100 },
  { label: '200', value: 200 },
  { label: '400', value: 400 },
  { label: '800', value: 800 },
  { label: '1600', value: 1600 },
  { label: '3200', value: 3200 },
  { label: '6400', value: 6400 },
];

const DETAILED_ISO_STOPS = [
  { value: 50, desc: 'Mínimo ruido / Luz solar intensa' },
  { value: 64, desc: 'Luz diurna intensa' },
  { value: 80, desc: 'Luz diurna clara' },
  { value: 100, desc: 'Sensibilidad base 108MP nativa' },
  { value: 125, desc: 'Exterior iluminado' },
  { value: 160, desc: 'Luz natural exterior' },
  { value: 200, desc: 'Luz natural / Sombra clara' },
  { value: 250, desc: 'Interiores con ventanas' },
  { value: 320, desc: 'Interiores diurnos' },
  { value: 400, desc: 'Interiores iluminados' },
  { value: 500, desc: 'Luz artificial moderada' },
  { value: 640, desc: 'Tarde / Nublado denso' },
  { value: 800, desc: 'Baja iluminación / Atardecer' },
  { value: 1000, desc: 'Crepúsculo' },
  { value: 1250, desc: 'Noche urbana iluminada' },
  { value: 1600, desc: 'Ambiente nocturno / Calles' },
  { value: 2000, desc: 'Interiores oscuros' },
  { value: 2500, desc: 'Conciertos / Teatros' },
  { value: 3200, desc: 'Noche cerrada / Sin flash' },
  { value: 4000, desc: 'Muy baja iluminación' },
  { value: 5000, desc: 'Ambientes casi oscuros' },
  { value: 6400, desc: 'Máxima amplificación sensor' },
];

const DETAILED_SHUTTER_STOPS: Array<{ value: number; label: string; desc: string }> = [
  { value: 1 / 8000, label: '1/8000s', desc: 'Congelar acción ultra veloz' },
  { value: 1 / 4000, label: '1/4000s', desc: 'Deportes extremos / Sol pleno' },
  { value: 1 / 2000, label: '1/2000s', desc: 'Deportes rápidos / Sol' },
  { value: 1 / 1000, label: '1/1000s', desc: 'Movimiento rápido / Salpique' },
  { value: 1 / 500, label: '1/500s', desc: 'Acción moderada / Transeúntes' },
  { value: 1 / 250, label: '1/250s', desc: 'Retrato con luz de día' },
  { value: 1 / 125, label: '1/125s', desc: 'Estándar fotográfico nítido' },
  { value: 1 / 60, label: '1/60s', desc: 'Sujetos estáticos / Interiores' },
  { value: 1 / 30, label: '1/30s', desc: 'Baja iluminación' },
  { value: 1 / 15, label: '1/15s', desc: 'Soporte firme requerido' },
  { value: 1 / 8, label: '1/8s', desc: 'Flujo de movimiento suave' },
  { value: 1 / 4, label: '1/4s', desc: 'Exposición prolongada urbana' },
  { value: 0.5, label: '1/2s', desc: 'Efecto seda en agua' },
  { value: 1, label: '1s', desc: 'Agua sedosa / Luces de noche' },
  { value: 2, label: '2s', desc: 'Estelas de luces de tráfico' },
  { value: 4, label: '4s', desc: 'Fotografía nocturna en trípode' },
  { value: 8, label: '8s', desc: 'Paisajes nocturnos profundos' },
  { value: 15, label: '15s', desc: 'Cielo estrellado' },
  { value: 30, label: '30s', desc: 'Astrofotografía / Vía Láctea' },
];

const SHUTTER_PILLS: Array<{ label: string; value: number | 'auto' }> = [
  { label: 'AUTO', value: 'auto' },
  { label: '1/4000', value: 1 / 4000 },
  { label: '1/1000', value: 1 / 1000 },
  { label: '1/250', value: 1 / 250 },
  { label: '1/60', value: 1 / 60 },
  { label: '1/15', value: 1 / 15 },
  { label: '1/4', value: 1 / 4 },
  { label: '1s', value: 1 },
  { label: '4s', value: 4 },
  { label: '30s', value: 30 },
];

const EV_ITEMS = [-3.0, -2.5, -2.0, -1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0];

const FOCUS_ITEMS: Array<{ mode: 'continuous' | 'manual'; label: string; desc: string }> = [
  { mode: 'continuous', label: 'AF-C (Continuo)', desc: 'Autoenfoque continuo con IA y seguimiento' },
  { mode: 'manual', label: 'MF (Manual)', desc: 'Enfoque manual con Focus Peaking en vivo' },
];

const WB_ITEMS: Array<{ label: string; kelvin: number; desc: string }> = [
  { label: 'AWB (5500K)', kelvin: 5500, desc: 'Automático inteligente' },
  { label: '2800K Tungsteno', kelvin: 2800, desc: 'Luz cálida de bombilla incandescente' },
  { label: '3200K Fluorescente', kelvin: 3200, desc: 'Tubos fluorescentes / Oficinas' },
  { label: '4000K Blanco Neutro', kelvin: 4000, desc: 'Luz neutra de estudio' },
  { label: '5500K Luz de Día', kelvin: 5500, desc: 'Sol directo mediodía' },
  { label: '6500K Nublado', kelvin: 6500, desc: 'Día cubierto / Sombras suaves' },
  { label: '7500K Sombra / Golden', kelvin: 7500, desc: 'Atardecer dorado / Sombra abierta' },
];

type ProMenuType = 'iso' | 'shutter' | 'ev' | 'focus' | 'wb' | null;

export const ManualControlsBar: React.FC<ManualControlsBarProps> = ({
  settings,
  onChangeSettings,
  isCleanView,
}) => {
  const [activeMenu, setActiveMenu] = useState<ProMenuType>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const toggleMenu = (type: ProMenuType) => {
    SoundEffects.playTick();
    setActiveMenu((prev) => (prev === type ? null : type));
  };

  if (isCleanView) return null;

  const shutterLabel =
    settings.shutterSpeed === 'auto'
      ? 'AUTO'
      : settings.shutterSpeed < 1
      ? `1/${Math.round(1 / settings.shutterSpeed)}`
      : `${settings.shutterSpeed}s`;

  // Determine current ISO index for slider
  const currentIsoValue = typeof settings.iso === 'number' ? settings.iso : 100;
  const currentIsoIndex = DETAILED_ISO_STOPS.findIndex(s => s.value >= currentIsoValue);
  const sliderIsoIndex = currentIsoIndex >= 0 ? currentIsoIndex : 3;
  const currentIsoInfo = DETAILED_ISO_STOPS.find(s => s.value === currentIsoValue) || DETAILED_ISO_STOPS[sliderIsoIndex];

  // Determine current Shutter index for slider
  const currentShutterValue = typeof settings.shutterSpeed === 'number' ? settings.shutterSpeed : 1 / 125;
  const currentShutterIndex = DETAILED_SHUTTER_STOPS.findIndex(s => Math.abs(s.value - currentShutterValue) < (s.value * 0.25));
  const sliderShutterIndex = currentShutterIndex >= 0 ? currentShutterIndex : 6;
  const currentShutterInfo = DETAILED_SHUTTER_STOPS[sliderShutterIndex] || DETAILED_SHUTTER_STOPS[6];

  return (
    <div 
      ref={containerRef}
      className="relative w-full flex flex-col items-center my-2 select-none font-mono z-40 pointer-events-auto"
    >
      {/* ========================================================================= */}
      {/* 1. Menú Desplegable Colapsable de ISO (Slider + Píldoras Rápidas) */}
      {/* ========================================================================= */}
      {activeMenu === 'iso' && (
        <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-[92vw] max-w-sm bg-black/90 backdrop-blur-2xl px-4 py-3 rounded-2xl border border-white/20 shadow-2xl z-50 animate-scaleUp">
          {/* Header con Valor Activo, Descripción y Controles de Colapso */}
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2.5">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-[#FF9500]" />
              <div>
                <div className="font-bold text-[#FF9500] text-sm tracking-wide leading-none">
                  {settings.iso === 'auto' ? 'ISO AUTO' : `ISO ${settings.iso}`}
                </div>
                <div className="text-[9px] text-white/50 truncate max-w-[170px] mt-0.5">
                  {settings.iso === 'auto' ? 'Control dinámico del ISP Spectra' : currentIsoInfo?.desc}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  SoundEffects.playTick();
                  onChangeSettings({ iso: 'auto' });
                }}
                className={`flex items-center gap-1 text-[9px] px-2.5 py-1 rounded-full border transition-all ${
                  settings.iso === 'auto'
                    ? 'bg-[#FF9500] text-black font-bold border-[#FF9500] shadow-[0_0_8px_rgba(255,149,0,0.5)]'
                    : 'bg-white/10 text-white/80 border-white/10 hover:text-white hover:bg-white/15'
                }`}
                title="Restablecer a ISO Automático"
              >
                <RotateCcw className="h-2.5 w-2.5" />
                <span>AUTO</span>
              </button>

              <button
                onClick={() => {
                  SoundEffects.playTick();
                  setActiveMenu(null);
                }}
                className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                title="Colapsar menú ISO"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Deslizador Continuo de ISO (50 hasta 6400) */}
          <div className="w-full flex items-center gap-3 my-2">
            <span className="text-[10px] font-bold text-white/40">50</span>
            <input
              type="range"
              min="0"
              max={DETAILED_ISO_STOPS.length - 1}
              step="1"
              value={settings.iso === 'auto' ? 3 : sliderIsoIndex}
              onChange={(e) => {
                const idx = parseInt(e.target.value, 10);
                const selectedStop = DETAILED_ISO_STOPS[idx];
                if (selectedStop) {
                  SoundEffects.playTick();
                  onChangeSettings({ iso: selectedStop.value });
                }
              }}
              className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#FF9500] focus:outline-none"
            />
            <span className="text-[10px] font-bold text-[#FF9500]">6400</span>
          </div>

          {/* Fila de Píldoras de Selección Rápida ISO */}
          <div className="flex items-center justify-between w-full pt-2 border-t border-white/10 gap-1 overflow-x-auto scrollbar-none">
            {ISO_PILLS.map((pill) => {
              const isSelected = settings.iso === pill.value;
              return (
                <button
                  key={String(pill.value)}
                  onClick={() => {
                    SoundEffects.playTick();
                    onChangeSettings({ iso: pill.value });
                  }}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all shrink-0 ${
                    isSelected
                      ? 'bg-[#FF9500] text-black shadow-[0_0_10px_rgba(255,149,0,0.5)] scale-105'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. Menú Desplegable Colapsable de Obturación (S - Shutter Speed Slider & Stops) */}
      {/* ========================================================================= */}
      {activeMenu === 'shutter' && (
        <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-[92vw] max-w-sm bg-black/90 backdrop-blur-2xl px-4 py-3 rounded-2xl border border-white/20 shadow-2xl z-50 animate-scaleUp">
          {/* Header con Valor Activo, Descripción y Controles de Colapso */}
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2.5">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[#FF9500]" />
              <div>
                <div className="font-bold text-[#FF9500] text-sm tracking-wide leading-none">
                  {settings.shutterSpeed === 'auto' ? 'OBTURACIÓN AUTO' : shutterLabel}
                </div>
                <div className="text-[9px] text-white/50 truncate max-w-[170px] mt-0.5">
                  {settings.shutterSpeed === 'auto' ? 'Exposición automática optimizada' : currentShutterInfo?.desc}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  SoundEffects.playTick();
                  onChangeSettings({ shutterSpeed: 'auto' });
                }}
                className={`flex items-center gap-1 text-[9px] px-2.5 py-1 rounded-full border transition-all ${
                  settings.shutterSpeed === 'auto'
                    ? 'bg-[#FF9500] text-black font-bold border-[#FF9500] shadow-[0_0_8px_rgba(255,149,0,0.5)]'
                    : 'bg-white/10 text-white/80 border-white/10 hover:text-white hover:bg-white/15'
                }`}
                title="Restablecer a Obturación Automática"
              >
                <RotateCcw className="h-2.5 w-2.5" />
                <span>AUTO</span>
              </button>

              <button
                onClick={() => {
                  SoundEffects.playTick();
                  setActiveMenu(null);
                }}
                className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                title="Colapsar menú obturación"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Deslizador Continuo de Obturación (1/8000s hasta 30s) */}
          <div className="w-full flex items-center gap-3 my-2">
            <span className="text-[10px] font-bold text-white/40">1/8000s</span>
            <input
              type="range"
              min="0"
              max={DETAILED_SHUTTER_STOPS.length - 1}
              step="1"
              value={settings.shutterSpeed === 'auto' ? 6 : sliderShutterIndex}
              onChange={(e) => {
                const idx = parseInt(e.target.value, 10);
                const selectedStop = DETAILED_SHUTTER_STOPS[idx];
                if (selectedStop) {
                  SoundEffects.playTick();
                  onChangeSettings({ shutterSpeed: selectedStop.value });
                }
              }}
              className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#FF9500] focus:outline-none"
            />
            <span className="text-[10px] font-bold text-[#FF9500]">30s</span>
          </div>

          {/* Fila de Píldoras de Selección Rápida Obturación */}
          <div className="flex items-center justify-between w-full pt-2 border-t border-white/10 gap-1 overflow-x-auto scrollbar-none">
            {SHUTTER_PILLS.map((pill) => {
              const isSelected = 
                pill.value === 'auto'
                  ? settings.shutterSpeed === 'auto'
                  : typeof settings.shutterSpeed === 'number' && Math.abs(settings.shutterSpeed - pill.value) < (pill.value * 0.1);

              return (
                <button
                  key={pill.label}
                  onClick={() => {
                    SoundEffects.playTick();
                    onChangeSettings({ shutterSpeed: pill.value });
                  }}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all shrink-0 ${
                    isSelected
                      ? 'bg-[#FF9500] text-black shadow-[0_0_10px_rgba(255,149,0,0.5)] scale-105'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. Menú Desplegable Colapsable de Compensación EV */}
      {/* ========================================================================= */}
      {activeMenu === 'ev' && (
        <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-[92vw] max-w-md bg-black/90 backdrop-blur-2xl rounded-2xl border border-white/20 shadow-2xl p-3 z-50 animate-scaleUp">
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2">
            <div className="flex items-center gap-1.5">
              <SunMedium className="h-4 w-4 text-[#FF9500]" />
              <span className="text-xs font-bold text-[#FF9500] uppercase tracking-wider">
                Compensación de Exposición ({settings.evBias > 0 ? `+${settings.evBias.toFixed(1)}` : settings.evBias.toFixed(1)} EV)
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  SoundEffects.playTick();
                  onChangeSettings({ evBias: 0 });
                }}
                className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full bg-white/10 text-white/80 hover:text-white hover:bg-white/15"
              >
                <RotateCcw className="h-2.5 w-2.5" />
                <span>0.0 EV</span>
              </button>

              <button
                onClick={() => {
                  SoundEffects.playTick();
                  setActiveMenu(null);
                }}
                className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                title="Colapsar menú EV"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
            {EV_ITEMS.map((ev) => {
              const isSelected = Math.abs(settings.evBias - ev) < 0.1;
              return (
                <button
                  key={ev}
                  onClick={() => {
                    SoundEffects.playTick();
                    onChangeSettings({ evBias: ev });
                  }}
                  className={`py-2 px-1 rounded-xl text-xs font-bold transition-all text-center ${
                    isSelected
                      ? 'bg-[#FF9500] text-black shadow-[0_0_10px_#FF9500] scale-105'
                      : 'bg-white/5 text-white/80 hover:bg-white/15'
                  }`}
                >
                  {ev > 0 ? `+${ev.toFixed(1)}` : ev.toFixed(1)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. Menú Desplegable Colapsable de Enfoque (AF/MF) */}
      {/* ========================================================================= */}
      {activeMenu === 'focus' && (
        <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-[92vw] max-w-sm bg-black/90 backdrop-blur-2xl rounded-2xl border border-white/20 shadow-2xl p-3 z-50 animate-scaleUp">
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2">
            <div className="flex items-center gap-1.5">
              <Crosshair className="h-4 w-4 text-[#FF9500]" />
              <span className="text-xs font-bold text-[#FF9500] uppercase tracking-wider">
                Modo de Enfoque
              </span>
            </div>

            <button
              onClick={() => {
                SoundEffects.playTick();
                setActiveMenu(null);
              }}
              className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              title="Colapsar menú enfoque"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-1.5">
            {FOCUS_ITEMS.map((item) => {
              const isSelected = settings.focusMode === item.mode;
              return (
                <button
                  key={item.mode}
                  onClick={() => {
                    SoundEffects.playTick();
                    onChangeSettings({
                      focusMode: item.mode,
                      showFocusPeaking: item.mode === 'manual',
                    });
                  }}
                  className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-xs transition-all text-left ${
                    isSelected
                      ? 'bg-[#FF9500] text-black font-bold shadow-[0_0_12px_rgba(255,149,0,0.5)]'
                      : 'text-white/80 bg-white/5 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <div>
                    <div>{item.label}</div>
                    <div className={`text-[9px] font-normal ${isSelected ? 'text-black/70' : 'text-white/40'}`}>
                      {item.desc}
                    </div>
                  </div>
                  {isSelected && <Check className="h-4 w-4" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. Menú Desplegable Colapsable de Balance de Blancos (WB) */}
      {/* ========================================================================= */}
      {activeMenu === 'wb' && (
        <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-[92vw] max-w-sm bg-black/90 backdrop-blur-2xl rounded-2xl border border-white/20 shadow-2xl p-3 z-50 animate-scaleUp max-h-72 overflow-y-auto scrollbar-none">
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2">
            <span className="text-xs font-bold text-[#FF9500] uppercase tracking-wider">
              Balance de Blancos ({settings.kelvin}K)
            </span>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  SoundEffects.playTick();
                  onChangeSettings({ kelvin: 5500 });
                }}
                className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full bg-white/10 text-white/80 hover:text-white hover:bg-white/15"
              >
                <RotateCcw className="h-2.5 w-2.5" />
                <span>AWB</span>
              </button>

              <button
                onClick={() => {
                  SoundEffects.playTick();
                  setActiveMenu(null);
                }}
                className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                title="Colapsar menú balance de blancos"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-1">
            {WB_ITEMS.map((item) => {
              const isSelected = settings.kelvin === item.kelvin;
              return (
                <button
                  key={item.label}
                  onClick={() => {
                    SoundEffects.playTick();
                    onChangeSettings({ kelvin: item.kelvin });
                  }}
                  className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs transition-all text-left ${
                    isSelected
                      ? 'bg-[#FF9500] text-black font-bold shadow-[0_0_12px_rgba(255,149,0,0.5)]'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <div>
                    <div>{item.label}</div>
                    <div className={`text-[9px] font-normal ${isSelected ? 'text-black/70' : 'text-white/40'}`}>
                      {item.desc}
                    </div>
                  </div>
                  {isSelected && <Check className="h-4 w-4" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Barra Principal Pro Drawer (Píldora Flotante: ISO | S | EV | AF | WB) */}
      {/* ========================================================================= */}
      <div className="flex items-center justify-between gap-3 sm:gap-6 bg-black/85 backdrop-blur-2xl px-5 py-2 rounded-full border border-white/20 shadow-2xl text-[#E0E0E0]">
        {/* ISO Collapsible Trigger */}
        <button
          id="btn-pro-iso"
          onClick={() => toggleMenu('iso')}
          className={`flex flex-col items-center gap-0.5 transition-all active:scale-95 cursor-pointer ${
            activeMenu === 'iso' || settings.iso !== 'auto'
              ? 'text-[#FF9500] font-bold'
              : 'text-white/70 hover:text-white'
          }`}
          title="Menú desplegable colapsable ISO"
        >
          <span className="text-[8px] uppercase tracking-wider opacity-80">ISO</span>
          <div className="flex items-center gap-0.5">
            <span className="text-xs font-bold">
              {settings.iso === 'auto' ? 'AUTO' : settings.iso}
            </span>
            <ChevronUp className={`h-2.5 w-2.5 transition-transform duration-200 ${activeMenu === 'iso' ? 'rotate-180 text-[#FF9500]' : ''}`} />
          </div>
        </button>

        <span className="h-4 w-[1px] bg-white/20" />

        {/* Shutter Speed (S) Collapsible Trigger */}
        <button
          id="btn-pro-shutter"
          onClick={() => toggleMenu('shutter')}
          className={`flex flex-col items-center gap-0.5 transition-all active:scale-95 cursor-pointer ${
            activeMenu === 'shutter' || settings.shutterSpeed !== 'auto'
              ? 'text-[#FF9500] font-bold'
              : 'text-white/70 hover:text-white'
          }`}
          title="Menú desplegable colapsable Velocidad de Obturación"
        >
          <span className="text-[8px] uppercase tracking-wider opacity-80">S</span>
          <div className="flex items-center gap-0.5">
            <span className="text-xs font-bold">{shutterLabel}</span>
            <ChevronUp className={`h-2.5 w-2.5 transition-transform duration-200 ${activeMenu === 'shutter' ? 'rotate-180 text-[#FF9500]' : ''}`} />
          </div>
        </button>

        <span className="h-4 w-[1px] bg-white/20" />

        {/* EV Collapsible Trigger */}
        <button
          id="btn-pro-ev"
          onClick={() => toggleMenu('ev')}
          className={`flex flex-col items-center gap-0.5 transition-all active:scale-95 cursor-pointer ${
            activeMenu === 'ev' || settings.evBias !== 0
              ? 'text-[#FF9500] font-bold'
              : 'text-white/70 hover:text-white'
          }`}
          title="Menú desplegable colapsable Compensación EV"
        >
          <span className="text-[8px] uppercase tracking-wider opacity-80">EV</span>
          <div className="flex items-center gap-0.5">
            <span className="text-xs font-bold">
              {settings.evBias > 0 ? `+${settings.evBias.toFixed(1)}` : settings.evBias.toFixed(1)}
            </span>
            <ChevronUp className={`h-2.5 w-2.5 transition-transform duration-200 ${activeMenu === 'ev' ? 'rotate-180 text-[#FF9500]' : ''}`} />
          </div>
        </button>

        <span className="h-4 w-[1px] bg-white/20" />

        {/* AF/MF Focus Collapsible Trigger */}
        <button
          id="btn-pro-focus"
          onClick={() => toggleMenu('focus')}
          className={`flex flex-col items-center gap-0.5 transition-all active:scale-95 cursor-pointer ${
            activeMenu === 'focus' || settings.focusMode !== 'continuous'
              ? 'text-[#FF9500] font-bold'
              : 'text-white/70 hover:text-white'
          }`}
          title="Menú desplegable colapsable Enfoque"
        >
          <span className="text-[8px] uppercase tracking-wider opacity-80">AF</span>
          <div className="flex items-center gap-0.5">
            <span className="text-xs font-bold">
              {settings.focusMode === 'continuous' ? 'AF-C' : 'MF'}
            </span>
            <ChevronUp className={`h-2.5 w-2.5 transition-transform duration-200 ${activeMenu === 'focus' ? 'rotate-180 text-[#FF9500]' : ''}`} />
          </div>
        </button>

        <span className="h-4 w-[1px] bg-white/20" />

        {/* WB Color Collapsible Trigger */}
        <button
          id="btn-pro-wb"
          onClick={() => toggleMenu('wb')}
          className={`flex flex-col items-center gap-0.5 transition-all active:scale-95 cursor-pointer ${
            activeMenu === 'wb' || settings.kelvin !== 5500
              ? 'text-[#FF9500] font-bold'
              : 'text-white/70 hover:text-white'
          }`}
          title="Menú desplegable colapsable Balance de Blancos"
        >
          <span className="text-[8px] uppercase tracking-wider opacity-80">WB</span>
          <div className="flex items-center gap-0.5">
            <span className="text-xs font-bold">{settings.kelvin}K</span>
            <ChevronUp className={`h-2.5 w-2.5 transition-transform duration-200 ${activeMenu === 'wb' ? 'rotate-180 text-[#FF9500]' : ''}`} />
          </div>
        </button>
      </div>
    </div>
  );
};

