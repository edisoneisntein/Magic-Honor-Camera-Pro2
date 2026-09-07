import React, { useState } from 'react';
import { HonorDeviceProfile, ThermalState } from '../types';
import { DeviceCapabilityEngine } from '../services/deviceCapabilityEngine';
import { 
  X, 
  Cpu, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Download, 
  HardDrive, 
  Activity, 
  Zap, 
  Copy,
  Check
} from 'lucide-react';

interface CameraLabModalProps {
  isOpen: boolean;
  onClose: () => void;
  thermal: ThermalState;
  profile: HonorDeviceProfile | null;
}

export const CameraLabModal: React.FC<CameraLabModalProps> = ({
  isOpen,
  onClose,
  thermal,
  profile,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const currentProfile = profile || DeviceCapabilityEngine.getInstance().getCachedProfile();

  const handleExportJson = () => {
    const jsonStr = DeviceCapabilityEngine.getInstance().exportProfileJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HONOR_MAGIC8_LITE_CAMERA_PROFILE_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyJson = () => {
    const jsonStr = DeviceCapabilityEngine.getInstance().exportProfileJson();
    navigator.clipboard.writeText(jsonStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 text-[#E0E0E0] backdrop-blur-md animate-fadeIn select-none">
      <div className="flex h-full max-h-[90vh] w-full max-w-4xl flex-col rounded-xs bg-[#050505] border border-white/10 shadow-2xl overflow-hidden font-mono">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 p-4 bg-black/60">
          <div className="flex items-center gap-2.5">
            <Cpu className="h-5 w-5 text-[#FF9500]" />
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-white tracking-wider uppercase">
                CAMERA LAB & MOTOR DE CAPACIDADES
              </h2>
              <p className="text-[10px] text-white/40">
                HONOR Magic8 Lite (MagicOS 10 / Snapdragon 6 Gen 1 / Spectra ISP)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyJson}
              className="flex items-center gap-1 rounded-xs bg-white/5 px-2.5 py-1 text-[10px] text-white/70 hover:text-white hover:bg-white/10 transition-colors border border-white/10"
            >
              {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
              <span>{copied ? 'Copiado' : 'Copiar JSON'}</span>
            </button>

            <button
              onClick={handleExportJson}
              className="flex items-center gap-1 rounded-xs bg-[#FF9500] px-2.5 py-1 text-[10px] font-bold text-black hover:bg-[#FF9500]/90 transition-colors shadow-[0_0_8px_rgba(255,149,0,0.3)]"
            >
              <Download className="h-3 w-3" />
              <span>Exportar Perfil</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors ml-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* Live Telemetry Grid */}
          <div>
            <h3 className="text-[10px] font-bold text-[#FF9500] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              TELEMETRÍA DE RENDIMIENTO EN TIEMPO REAL
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* FPS */}
              <div className="rounded-xs bg-white/5 p-3 border border-white/10">
                <span className="text-[9px] text-white/40">TASA DE CUADROS</span>
                <div className="text-lg font-bold text-white mt-0.5">
                  {thermal.fps} FPS
                </div>
                <span className="text-[9px] text-white/40">
                  Frame: {(1000 / (thermal.fps || 30)).toFixed(1)} ms
                </span>
              </div>

              {/* Thermal */}
              <div className="rounded-xs bg-white/5 p-3 border border-white/10">
                <span className="text-[9px] text-white/40">TEMPERATURA</span>
                <div className={`text-lg font-bold mt-0.5 ${
                  thermal.status === 'NORMAL' ? 'text-green-400' : thermal.status === 'WARM' ? 'text-[#FF9500]' : 'text-red-400 animate-pulse'
                }`}>
                  {thermal.temperatureC} °C
                </div>
                <span className="text-[9px] text-white/40">
                  Estado: {thermal.status}
                </span>
              </div>

              {/* CPU Load */}
              <div className="rounded-xs bg-white/5 p-3 border border-white/10">
                <span className="text-[9px] text-white/40">CARGA CPU / GPU</span>
                <div className="text-lg font-bold text-[#FF9500] mt-0.5">
                  {thermal.cpuLoadPercent}%
                </div>
                <span className="text-[9px] text-white/40">
                  Octa-Core Kryo
                </span>
              </div>

              {/* Memory Heap */}
              <div className="rounded-xs bg-white/5 p-3 border border-white/10">
                <span className="text-[9px] text-white/40">MEMORIA RAM / HEAP</span>
                <div className="text-lg font-bold text-white mt-0.5">
                  {thermal.memoryUsageMb} MB
                </div>
                <span className="text-[9px] text-white/40">
                  8 GB + RAM Turbo
                </span>
              </div>
            </div>
          </div>

          {/* Hardware Sensor Specs */}
          <div>
            <h3 className="text-[10px] font-bold text-[#FF9500] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <HardDrive className="h-3.5 w-3.5" />
              SISTEMA ÓPTICO HONOR MAGIC8 LITE
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <div className="rounded-xs bg-white/5 p-3 border border-white/10">
                <div className="flex justify-between items-center text-[#FF9500] font-bold mb-1">
                  <span>SENSOR PRINCIPAL 108 MP</span>
                  <span className="text-[9px] bg-[#FF9500]/10 text-[#FF9500] px-1.5 py-0.5 rounded-xs border border-[#FF9500]/30">OIS</span>
                </div>
                <p className="text-white/80">12000 x 9000 px | 1/1.67" Matrix</p>
                <p className="text-white/40 text-[10px] mt-1">
                  Pixel binning 9-en-1 a 1.92µm (12MP) y modo nativo 108MP de ultra-detalle. Apertura f/1.75.
                </p>
              </div>

              <div className="rounded-xs bg-white/5 p-3 border border-white/10">
                <div className="flex justify-between items-center text-cyan-400 font-bold mb-1">
                  <span>ULTRA GRAN ANGULAR 5 MP</span>
                  <span className="text-[9px] bg-cyan-950/80 text-cyan-400 px-1.5 py-0.5 rounded-xs border border-cyan-500/30">110° FOV</span>
                </div>
                <p className="text-white/80">2592 x 1944 px | f/2.2</p>
                <p className="text-white/40 text-[10px] mt-1">
                  Lente ultra-amplio para fotografía de arquitectura, paisajes y tomas de grupo.
                </p>
              </div>

              <div className="rounded-xs bg-white/5 p-3 border border-white/10">
                <div className="flex justify-between items-center text-amber-300 font-bold mb-1">
                  <span>MACRO CLOSE-UP 2 MP</span>
                  <span className="text-[9px] bg-amber-950/80 text-amber-300 px-1.5 py-0.5 rounded-xs border border-amber-500/30">4 CM</span>
                </div>
                <p className="text-white/80">1600 x 1200 px | f/2.4</p>
                <p className="text-white/40 text-[10px] mt-1">
                  Enfoque a distancia ultracorta de 4 cm para textura de micro-detalles.
                </p>
              </div>
            </div>
          </div>

          {/* Real Capability Matrix */}
          <div>
            <h3 className="text-[10px] font-bold text-[#FF9500] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              MATRIZ DE CAPACIDADES REALES (NO FAKE FEATURES)
            </h3>
            <div className="divide-y divide-white/5 rounded-xs bg-white/5 border border-white/10 overflow-hidden text-xs">
              {currentProfile?.capabilities.map((cap) => (
                <div key={cap.name} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 gap-2">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{cap.name}</span>
                      <span className="text-[9px] text-white/40 uppercase">[{cap.category}]</span>
                    </div>
                    <span className="text-[10px] text-white/60 mt-0.5">{cap.details}</span>
                    <span className="text-[8px] text-white/30 font-mono mt-0.5">API: {cap.apiSource}</span>
                  </div>

                  <div className="shrink-0">
                    {cap.status === 'SUPPORTED' ? (
                      <span className="inline-flex items-center gap-1 rounded-xs bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-400 border border-green-500/30">
                        <CheckCircle2 className="h-3 w-3" />
                        SUPPORTED
                      </span>
                    ) : cap.status === 'LIMITED' ? (
                      <span className="inline-flex items-center gap-1 rounded-xs bg-[#FF9500]/10 px-2 py-0.5 text-[10px] font-bold text-[#FF9500] border border-[#FF9500]/30">
                        <AlertTriangle className="h-3 w-3" />
                        LIMITED
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-xs bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400 border border-red-500/30">
                        <XCircle className="h-3 w-3" />
                        UNSUPPORTED
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
