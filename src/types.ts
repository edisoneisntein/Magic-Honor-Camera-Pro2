export type CaptureMode = 
  | 'photo' 
  | 'pro' 
  | 'mode_108mp' 
  | 'night_pro' 
  | 'hdr' 
  | 'focus_stack' 
  | 'video' 
  | 'cinematic' 
  | 'smart_auto';

export type AspectRatioType = '4:3' | '16:9' | '1:1' | '2.39:1' | '2.35:1' | '1.85:1';

export type FramingGuide = 'none' | 'thirds' | 'golden' | 'crosshair' | 'diagonals' | 'safe_areas';

export type ScopeType = 'none' | 'histogram' | 'waveform' | 'vectorscope' | 'all';

export type FocusModeType = 'continuous' | 'manual' | 'locked' | 'macro' | 'infinity';

export type WhiteBalancePreset = 'auto' | '2800K' | '3200K' | '4000K' | '5200K' | '6000K' | '7500K' | 'custom';

export type OutputFormat = 'jpeg' | 'heif' | 'raw_dng' | 'raw_plus_jpeg';

export type SupportStatus = 'SUPPORTED' | 'LIMITED' | 'UNSUPPORTED';

export interface HardwareCapability {
  name: string;
  category: 'sensor' | 'optics' | 'processing' | 'video' | 'api';
  status: SupportStatus;
  details: string;
  apiSource: string;
}

export interface HonorDeviceProfile {
  deviceName: string;
  model: string;
  os: string;
  chipset: string;
  isp: string;
  mainSensor: {
    resolution: string;
    rawMegapixels: number;
    sensorSize: string;
    pixelSize: string;
    ois: boolean;
    aperture: string;
    focalLengthEquivalent: string;
  };
  secondarySensors: {
    ultrawide: { resolution: string; fov: string; aperture: string };
    macro: { resolution: string; distance: string; aperture: string };
    front: { resolution: string; aperture: string };
  };
  capabilities: HardwareCapability[];
  timestamp: string;
}

export interface ManualSettings {
  iso: number | 'auto';
  shutterSpeed: number | 'auto'; // in seconds, e.g. 1/125 = 0.008
  evBias: number; // e.g. -3.0 to +3.0
  focusDistance: number | 'auto'; // 0.0 (macro) to 1.0 (infinity) or 'auto'
  focusMode: FocusModeType;
  whiteBalance: WhiteBalancePreset;
  kelvin: number;
  zoomRatio: number;
  aspectRatio: AspectRatioType;
  framingGuide: FramingGuide;
  format: OutputFormat;
  timer: 0 | 2 | 5 | 10;
  
  // Monitoring overlays
  showZebra: boolean;
  zebraThreshold: number; // 70 to 100 %
  showFocusPeaking: boolean;
  peakingColor: 'green' | 'red' | 'cyan' | 'yellow';
  peakingThreshold: number;
  showFalseColor: boolean;
  showLevel: boolean;
  activeScope: ScopeType;
  
  // Cine video options
  fps: 24 | 25 | 30 | 60;
  videoBitrate: 'low' | 'medium' | 'high';
  videoResolution: '1080p' | '4k';
  stabilizationMode: 'ois_active' | 'eis' | 'off';
  
  // Multi-frame options
  nightFrames: number;
  hdrBrackets: number;
  focusStackSteps: number;
}

export interface AIScenePrediction {
  scene: 'Night' | 'Landscape' | 'Portrait' | 'Sunset' | 'Macro' | 'Document' | 'Backlight' | 'High Dynamic Range' | 'Standard Auto';
  confidence: number;
  recommendedIso: number;
  recommendedShutter: string;
  recommendedWb: string;
  recommendedHdr: boolean;
  recommendedMultiFrame: boolean;
  reasoning: string;
  lightLevel: 'Low-light' | 'Golden-hour' | 'Normal' | 'Overexposed';
}

export interface CapturedMediaItem {
  id: string;
  dataUrl: string;
  thumbnailUrl: string;
  type: 'photo' | 'video' | 'dng';
  timestamp: number;
  mode: CaptureMode;
  width: number;
  height: number;
  sizeBytes: number;
  format: string;
  exif: {
    make: string;
    model: string;
    lens: string;
    iso: string;
    shutter: string;
    aperture: string;
    focalLength: string;
    whiteBalance: string;
    megapixels: string;
    dateTime: string;
    location?: { latitude: number; longitude: number };
  };
  durationSec?: number;
}

export interface ThermalState {
  temperatureC: number;
  status: 'NORMAL' | 'WARM' | 'THROTTLING' | 'CRITICAL';
  cpuLoadPercent: number;
  memoryUsageMb: number;
  fps: number;
  batteryLevelPercent: number;
  isCharging: boolean;
}
