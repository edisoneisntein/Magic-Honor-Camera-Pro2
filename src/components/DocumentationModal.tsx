import React, { useState } from 'react';
import { X, BookOpen } from 'lucide-react';

interface DocumentationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DocumentationModal: React.FC<DocumentationModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'readme' | 'architecture' | 'capabilities' | 'hardware' | 'guide'>('readme');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 text-[#E0E0E0] backdrop-blur-md animate-fadeIn select-none">
      <div className="flex h-full max-h-[90vh] w-full max-w-4xl flex-col rounded-xs bg-[#050505] border border-white/10 shadow-2xl overflow-hidden font-mono">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 p-4 bg-black/60">
          <div className="flex items-center gap-2.5">
            <BookOpen className="h-5 w-5 text-[#FF9500]" />
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                DOCUMENTACIÓN TÉCNICA — MAGIC CAMERA PRO
              </h2>
              <p className="text-[10px] text-white/40">
                HONOR Magic8 Lite (MagicOS 10 / Snapdragon 6 Gen 1)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2 bg-black/30 overflow-x-auto text-[11px] scrollbar-none">
          <button
            onClick={() => setActiveTab('readme')}
            className={`px-3 py-1 rounded-xs font-bold transition-colors ${
              activeTab === 'readme' ? 'bg-[#FF9500] text-black shadow-[0_0_8px_rgba(255,149,0,0.3)]' : 'text-white/40 hover:text-white hover:bg-white/5'
            }`}
          >
            README.md
          </button>
          <button
            onClick={() => setActiveTab('architecture')}
            className={`px-3 py-1 rounded-xs font-bold transition-colors ${
              activeTab === 'architecture' ? 'bg-[#FF9500] text-black shadow-[0_0_8px_rgba(255,149,0,0.3)]' : 'text-white/40 hover:text-white hover:bg-white/5'
            }`}
          >
            ARCHITECTURE.md
          </button>
          <button
            onClick={() => setActiveTab('capabilities')}
            className={`px-3 py-1 rounded-xs font-bold transition-colors ${
              activeTab === 'capabilities' ? 'bg-[#FF9500] text-black shadow-[0_0_8px_rgba(255,149,0,0.3)]' : 'text-white/40 hover:text-white hover:bg-white/5'
            }`}
          >
            CAPABILITIES.md
          </button>
          <button
            onClick={() => setActiveTab('hardware')}
            className={`px-3 py-1 rounded-xs font-bold transition-colors ${
              activeTab === 'hardware' ? 'bg-[#FF9500] text-black shadow-[0_0_8px_rgba(255,149,0,0.3)]' : 'text-white/40 hover:text-white hover:bg-white/5'
            }`}
          >
            HARDWARE_PROFILE.md
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`px-3 py-1 rounded-xs font-bold transition-colors ${
              activeTab === 'guide' ? 'bg-[#FF9500] text-black shadow-[0_0_8px_rgba(255,149,0,0.3)]' : 'text-white/40 hover:text-white hover:bg-white/5'
            }`}
          >
            USER_GUIDE.md
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5 text-xs text-white/80 leading-relaxed space-y-4">
          {activeTab === 'readme' && (
            <div className="space-y-4">
              <h1 className="text-sm font-bold text-[#FF9500] border-b border-white/10 pb-2 uppercase tracking-wider">
                MAGIC CAMERA PRO — Plataforma de Captura Fotográfica & Cinematográfica
              </h1>
              <p>
                <strong>Magic Camera Pro</strong> convierte el <strong>HONOR Magic8 Lite (MagicOS 10)</strong> en una estación de producción audiovisual profesional y laboratorio de captura fotográfica computacional.
              </p>
              <h2 className="text-xs font-bold text-white mt-4 uppercase tracking-wider">Principios de Ingeniería:</h2>
              <ul className="list-disc pl-5 space-y-1.5 text-white/60">
                <li><strong className="text-white">Primero la Cámara:</strong> La pantalla de inicio es el visor activo en tiempo real, sin dashboards intermedios.</li>
                <li><strong className="text-white">No Fake Features:</strong> Toda capacidad es detectada e inspeccionada directamente de los descriptores de hardware. Si una función no está expuesta, se marca honestamente como no disponible.</li>
                <li><strong className="text-white">Pipeline de Fotografía Computacional:</strong> Fusión multi-frame nocturna, bracketing HDR (-2EV / 0EV / +2EV), reconstrucción de micro-detalle 108 MP y focus stacking con estimación de gradiente.</li>
                <li><strong className="text-white">Monitores Cinematográficos de Transmisión:</strong> Histograma Luma/RGB de 256 bins, forma de onda (waveform), vectorscopio de cromaticidad con línea de tono de piel, falso color IRE y cebra ajustable.</li>
              </ul>
            </div>
          )}

          {activeTab === 'architecture' && (
            <div className="space-y-4">
              <h1 className="text-sm font-bold text-[#FF9500] border-b border-white/10 pb-2 uppercase tracking-wider">
                ARCHITECTURE.md — Clean Architecture & Pipelines Asíncronos
              </h1>
              <div className="bg-white/5 p-4 rounded-xs border border-white/10 text-[10px]">
                <pre className="text-white/80 overflow-x-auto">
{`+-------------------------------------------------------------+
|                     MAGIC CAMERA PRO UI                     |
|  [Viewfinder] [Monitors HUD] [Manual Dials] [Status Bar]    |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                 DEVICE CAPABILITY ENGINE                    |
| - Introspección MediaTrackCapabilities / Camera2 API        |
| - Matriz SUPPORTED / LIMITED / UNSUPPORTED                  |
+-------------------------------------------------------------+
                              |
        +---------------------+---------------------+
        |                                           |
        v                                           v
+-----------------------+               +-----------------------+
|   CAMERA SERVICE      |               |  IMAGE PROCESSING     |
| - WebRTC MediaStream  |               | - Multi-Frame Night   |
| - MediaRecorder 4K    |               | - HDR Exposure Fusion |
| - AudioContext VU     |               | - 108MP Reconstruction|
| - Zoom / EV / AF      |               | - False Color & Scopes|
+-----------------------+               +-----------------------+
        |                                           |
        +---------------------+---------------------+
                              |
                              v
+-------------------------------------------------------------+
|             THERMAL & MEMORY WATCHDOG ENGINE                |
| - Sensor temp monitor, FPS lock & dynamic scope throttle    |
+-------------------------------------------------------------+`}
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'capabilities' && (
            <div className="space-y-4">
              <h1 className="text-sm font-bold text-[#FF9500] border-b border-white/10 pb-2 uppercase tracking-wider">
                CAMERA_CAPABILITIES.md — Matriz de Control de Calidad
              </h1>
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="border-b border-white/10 text-white/40">
                    <th className="py-2">MÓDULO</th>
                    <th className="py-2">ESTADO</th>
                    <th className="py-2">API DE ORIGEN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-white/70">
                  <tr>
                    <td className="py-2 font-bold text-white">Sensor 108 MP (12000x9000)</td>
                    <td className="py-2 text-green-400 font-bold">SUPPORTED</td>
                    <td className="py-2 text-white/40">Camera2 SENSOR_INFO_PIXEL_ARRAY_SIZE</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-bold text-white">OIS (Estabilización Óptica)</td>
                    <td className="py-2 text-green-400 font-bold">SUPPORTED</td>
                    <td className="py-2 text-white/40">LENS_INFO_AVAILABLE_OPTICAL_STABILIZATION</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-bold text-white">Sensibilidad ISO (50 - 6400)</td>
                    <td className="py-2 text-green-400 font-bold">SUPPORTED</td>
                    <td className="py-2 text-white/40">SENSOR_INFO_SENSITIVITY_RANGE</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-bold text-white">Velocidad Obturador (1/4000s - 10s)</td>
                    <td className="py-2 text-green-400 font-bold">SUPPORTED</td>
                    <td className="py-2 text-white/40">SENSOR_INFO_EXPOSURE_TIME_RANGE</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-bold text-white">RAW / DNG 16-Bit Container</td>
                    <td className="py-2 text-[#FF9500] font-bold">LIMITED</td>
                    <td className="py-2 text-white/40">DNG 1.4 Linear Bayer Container Matrix</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'hardware' && (
            <div className="space-y-4">
              <h1 className="text-sm font-bold text-[#FF9500] border-b border-white/10 pb-2 uppercase tracking-wider">
                HARDWARE_PROFILE.md — Especificaciones del Dispositivo
              </h1>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-white/5 p-4 rounded-xs border border-white/10">
                  <h3 className="font-bold text-white mb-2 text-xs">SOC & PROCESAMIENTO</h3>
                  <p><span className="text-white/40">SoC:</span> Qualcomm Snapdragon 6 Gen 1 (4nm)</p>
                  <p><span className="text-white/40">CPU:</span> 4x Cortex-A78 @ 2.2GHz + 4x Cortex-A55 @ 1.8GHz</p>
                  <p><span className="text-white/40">GPU:</span> Adreno 710</p>
                  <p><span className="text-white/40">ISP:</span> Qualcomm Spectra Triple 12-bit ISP</p>
                  <p><span className="text-white/40">RAM:</span> 8 GB LPDDR4X + HONOR RAM Turbo</p>
                </div>

                <div className="bg-white/5 p-4 rounded-xs border border-white/10">
                  <h3 className="font-bold text-white mb-2 text-xs">SISTEMA DE CÁMARAS</h3>
                  <p><span className="text-white/40">Principal:</span> 108 MP f/1.75 OIS (1/1.67", 0.64µm - 1.92µm)</p>
                  <p><span className="text-white/40">Gran Angular:</span> 5 MP f/2.2 110° FOV</p>
                  <p><span className="text-white/40">Macro:</span> 2 MP f/2.4 (4 cm enfoque)</p>
                  <p><span className="text-white/40">Frontal:</span> 16 MP f/2.45</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'guide' && (
            <div className="space-y-4">
              <h1 className="text-sm font-bold text-[#FF9500] border-b border-white/10 pb-2 uppercase tracking-wider">
                USER_GUIDE.md — Manual de Operación y Gestos Táctiles Avanzados
              </h1>
              <div className="space-y-3">
                <div className="bg-white/5 p-3 rounded-xs border border-white/10">
                  <h3 className="font-bold text-[#FF9500] text-xs uppercase tracking-wider mb-2">
                    GESTOS TÁCTILES AVANZADOS EN EL VISOR
                  </h3>
                  <ul className="space-y-2 text-white/70 text-[11px]">
                    <li>
                      <strong className="text-white">👆👆 Doble Toque (Double Tap):</strong> Alterna instantáneamente el modo de enfoque entre <strong>Autofocus Continuo (AF-C)</strong> y <strong>Enfoque Manual (MF)</strong> con Focus Peaking y respuesta háptica.
                    </li>
                    <li>
                      <strong className="text-white">✌️ Deslizar 2 Dedos (Vertical):</strong> Ajuste dinámico y continuo del brillo y compensación de exposición (<strong>-3.0 a +3.0 EV</strong>) con medidor HUD en tiempo real.
                    </li>
                    <li>
                      <strong className="text-white">🤏 Pellizcar (Pinch to Zoom):</strong> Control de zoom digital y crop in-sensor asíncrono ultra-suave (<strong>0.6x a 10.0x</strong>) con indicador HUD de distancia focal equivalente.
                    </li>
                    <li>
                      <strong className="text-white">👆 Deslizar 1 Dedo (Horizontal):</strong> Conmutación rápida entre modos de captura (Pro, Foto, 108MP, Noche Pro, HDR, Vídeo, etc.).
                    </li>
                    <li>
                      <strong className="text-white">👆 Toque Simple / Prolongado:</strong> Retícula de enfoque y medición puntual / Bloqueo AE/AF Lock.
                    </li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-bold text-white">1. Enfoque y Medición Puntual (Tap-to-Focus)</h3>
                  <p className="text-white/60">
                    Toca en cualquier parte del visor para colocar el retículo de enfoque. Desliza el control solar vertical para ajustar el sesgo EV (-3 a +3 EV) o presiona el candado para bloquear AF/AE Lock.
                  </p>
                </div>
                <div>
                  <h3 className="font-bold text-white">2. Monitores de Exposición Cinematográfica</h3>
                  <p className="text-white/60">
                    Activa los <strong>Scopes</strong> en la barra superior para inspeccionar el Histograma RGB/Luma en tiempo real, el monitor de forma de onda (Waveform) y el Vectorscopio con la línea de calibración de tonos de piel (Skin Tone I-Bar).
                  </p>
                </div>
                <div>
                  <h3 className="font-bold text-white">3. Disparo en Modo 108 MP</h3>
                  <p className="text-white/60">
                    Selecciona "108 MP" en el carrusel de modos. El motor computacional desactivará el binning 9-in-1 para renderizar una imagen de resolución completa a 12000x9000 con máscara de desenfoque y supresión de aberraciones cromáticas.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
