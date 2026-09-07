import React, { useState } from 'react';
import { CapturedMediaItem } from '../types';
import { 
  X, 
  Download, 
  Trash2, 
  Info, 
  Camera, 
  ChevronLeft, 
  ChevronRight,
  Play
} from 'lucide-react';

interface GalleryModalProps {
  items: CapturedMediaItem[];
  isOpen: boolean;
  onClose: () => void;
  onDeleteItem: (id: string) => void;
}

export const GalleryModal: React.FC<GalleryModalProps> = ({
  items,
  isOpen,
  onClose,
  onDeleteItem,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [showExif, setShowExif] = useState<boolean>(true);

  if (!isOpen) return null;

  const currentItem = items[selectedIndex] || null;

  const handleDownload = (item: CapturedMediaItem) => {
    const a = document.createElement('a');
    a.href = item.dataUrl;
    const ext = item.type === 'video' ? 'webm' : item.type === 'dng' ? 'dng' : 'jpg';
    a.download = `HONOR_MAGIC8_LITE_${item.mode.toUpperCase()}_${item.id}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 text-[#E0E0E0] backdrop-blur-xl animate-fadeIn select-none">
      {/* Top Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-linear-to-b from-black/95 to-transparent border-b border-white/10">
        <div className="flex items-center gap-2 font-mono text-xs sm:text-sm">
          <Camera className="h-4 w-4 text-[#FF9500]" />
          <span className="font-bold tracking-wider uppercase">GALERÍA MAGIC CAMERA PRO</span>
          {items.length > 0 && (
            <span className="text-white/40 text-xs">
              ({selectedIndex + 1} / {items.length})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {currentItem && (
            <>
              <button
                onClick={() => setShowExif(!showExif)}
                className={`p-2 rounded-full transition-colors ${
                  showExif ? 'bg-[#FF9500] text-black shadow-[0_0_10px_rgba(255,149,0,0.4)]' : 'bg-white/10 text-white/60 hover:text-white'
                }`}
                title="Información EXIF"
              >
                <Info className="h-4 w-4" />
              </button>

              <button
                onClick={() => handleDownload(currentItem)}
                className="p-2 rounded-full bg-white/10 text-white/70 hover:text-white hover:bg-white/20 transition-colors"
                title="Descargar Archivo Original"
              >
                <Download className="h-4 w-4" />
              </button>

              <button
                onClick={() => {
                  onDeleteItem(currentItem.id);
                  if (selectedIndex > 0) setSelectedIndex(selectedIndex - 1);
                }}
                className="p-2 rounded-full bg-red-950/80 text-red-400 hover:bg-red-900 transition-colors border border-red-500/30"
                title="Eliminar Captura"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}

          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 text-white/70 hover:text-white hover:bg-white/20 transition-colors ml-2"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 text-white/40 font-mono">
          <Camera className="h-12 w-12 stroke-1 text-white/20" />
          <p className="text-sm font-bold">No hay capturas registradas en esta sesión.</p>
          <p className="text-xs text-white/30">
            Utiliza el disparador para capturar fotos en 108MP, Night Pro, HDR o grabar vídeo.
          </p>
        </div>
      ) : (
        <div className="relative flex h-full w-full items-center justify-center p-4 pt-16 pb-24">
          {/* Previous Button */}
          {selectedIndex > 0 && (
            <button
              onClick={() => setSelectedIndex(selectedIndex - 1)}
              className="absolute left-4 z-20 rounded-full bg-black/60 p-3 text-white hover:bg-black/90 transition-all border border-white/10"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {/* Media Lightbox */}
          <div className="relative flex max-h-full max-w-4xl items-center justify-center overflow-hidden rounded-lg shadow-2xl">
            {currentItem?.type === 'video' ? (
              <video
                src={currentItem.dataUrl}
                controls
                autoPlay
                className="max-h-[75vh] w-auto rounded-lg"
              />
            ) : (
              <img
                src={currentItem?.dataUrl}
                alt={`Captura ${currentItem?.id}`}
                className="max-h-[75vh] max-w-full object-contain rounded-lg"
                referrerPolicy="no-referrer"
              />
            )}

            {/* EXIF Metadata Card Overlay */}
            {showExif && currentItem && (
              <div className="absolute bottom-4 left-4 z-20 flex flex-col gap-1.5 rounded-xs bg-black/85 p-3.5 text-xs font-mono backdrop-blur-md border border-white/15 shadow-2xl max-w-xs sm:max-w-sm">
                <div className="flex items-center justify-between border-b border-white/10 pb-1 font-bold text-[#FF9500]">
                  <span>{currentItem.exif.make} {currentItem.exif.model}</span>
                  <span className="text-[10px] text-green-400">{currentItem.mode.toUpperCase()}</span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-white/70 text-[10px]">
                  <div>
                    <span className="text-white/40">Lente:</span> {currentItem.exif.lens}
                  </div>
                  <div>
                    <span className="text-white/40">Resolución:</span> {currentItem.width}x{currentItem.height}
                  </div>
                  <div>
                    <span className="text-white/40">ISO:</span> {currentItem.exif.iso}
                  </div>
                  <div>
                    <span className="text-white/40">Obturación:</span> {currentItem.exif.shutter}
                  </div>
                  <div>
                    <span className="text-white/40">Apertura:</span> {currentItem.exif.aperture}
                  </div>
                  <div>
                    <span className="text-white/40">WB:</span> {currentItem.exif.whiteBalance}
                  </div>
                  <div>
                    <span className="text-white/40">Formato:</span> {currentItem.format.toUpperCase()}
                  </div>
                  <div>
                    <span className="text-white/40">Tamaño:</span> {(currentItem.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                  </div>
                </div>

                <div className="border-t border-white/10 pt-1 text-[9px] text-white/40">
                  {currentItem.exif.dateTime}
                </div>
              </div>
            )}
          </div>

          {/* Next Button */}
          {selectedIndex < items.length - 1 && (
            <button
              onClick={() => setSelectedIndex(selectedIndex + 1)}
              className="absolute right-4 z-20 rounded-full bg-black/60 p-3 text-white hover:bg-black/90 transition-all border border-white/10"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          {/* Bottom Thumbnails Strip */}
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 overflow-x-auto px-4 scrollbar-none">
            {items.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => setSelectedIndex(idx)}
                className={`relative h-14 w-14 shrink-0 rounded-xs overflow-hidden border-2 transition-all ${
                  selectedIndex === idx
                    ? 'border-[#FF9500] scale-105 shadow-[0_0_10px_rgba(255,149,0,0.5)]'
                    : 'border-transparent opacity-60 hover:opacity-100'
                }`}
              >
                <img
                  src={item.thumbnailUrl || item.dataUrl}
                  alt={`Thumb ${idx}`}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
                {item.type === 'video' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <Play className="h-4 w-4 fill-white text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
