import {
  HardwareCapability,
  HonorDeviceProfile,
  SupportStatus,
} from '../types';

/**
 * Camera capabilities exposed by Chromium/WebView are highly device-dependent.
 * Keep vendor-specific fields behind this normalized boundary.
 */

export type CapabilityKey =
  | 'sensor_108mp'
  | 'ois'
  | 'eis'
  | 'manual_exposure'
  | 'manual_focus'
  | 'manual_white_balance'
  | 'zoom'
  | 'raw'
  | 'night_mode'
  | 'hdr'
  | 'video_4k'
  | 'scopes'
  | 'ai_scene'
  | 'thermal';

export interface NumericRange {
  min?: number;
  max?: number;
  step?: number;
}

export interface ExtendedTrackCapabilities extends MediaTrackCapabilities {
  zoom?: NumericRange;
  focusDistance?: NumericRange;
  exposureCompensation?: NumericRange;
  exposureTime?: NumericRange;
  iso?: NumericRange;

  torch?: boolean;

  focusMode?: string[];
  exposureMode?: string[];
  whiteBalanceMode?: string[];

  colorTemperature?: NumericRange;
  resizeMode?: string[];
}

export interface CapabilityEvaluation {
  key: CapabilityKey;
  name: string;
  category: HardwareCapability['category'];
  status: SupportStatus;
  details: string;
  apiSource: string;
  detected: boolean;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface DeviceCapabilitySnapshot {
  profile: HonorDeviceProfile;
  trackCapabilities: ExtendedTrackCapabilities | null;
  trackSettings: MediaTrackSettings | null;
  inspectedAt: string;
  trackId: string | null;
}

export class DeviceCapabilityEngine {
  private static instance: DeviceCapabilityEngine | null = null;

  private profile: HonorDeviceProfile | null = null;
  private trackCapabilities: ExtendedTrackCapabilities | null = null;
  private trackSettings: MediaTrackSettings | null = null;

  private inspectedTrackId: string | null = null;
  private inspectedAt: string | null = null;

  private constructor() {}

  public static getInstance(): DeviceCapabilityEngine {
    if (!DeviceCapabilityEngine.instance) {
      DeviceCapabilityEngine.instance = new DeviceCapabilityEngine();
    }

    return DeviceCapabilityEngine.instance;
  }

  /**
   * Useful for unit/integration tests.
   */
  public static resetInstanceForTests(): void {
    DeviceCapabilityEngine.instance = null;
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API
  // ---------------------------------------------------------------------------

  public async inspectDevice(
    videoTrack?: MediaStreamTrack,
  ): Promise<HonorDeviceProfile> {
    this.readTrack(videoTrack);

    const capabilities = this.evaluateCapabilities(
      this.trackCapabilities,
    );

    const profile: HonorDeviceProfile = {
      deviceName: 'HONOR Magic8 Lite',
      model: 'ALI-NX1 / BRP-NX1 (5G)',
      os: 'MagicOS 10 (Android 15 Base / Camera2 Architecture)',
      chipset: 'Qualcomm Snapdragon 6 Gen 1 (4nm, Octa-Core)',
      isp: 'Qualcomm Spectra 12-bit Triple ISP',

      mainSensor: {
        resolution: '108 MP (12000 x 9000)',
        rawMegapixels: 108.0,
        sensorSize:
          '1/1.67" Matrix (0.64µm Native, 9-in-1 to 1.92µm Pixel Binning)',
        pixelSize: '0.64 µm (1.92 µm binned)',
        ois: true,
        aperture: 'f/1.75 Large Aperture',
        focalLengthEquivalent: '24mm Wide Angle',
      },

      secondarySensors: {
        ultrawide: {
          resolution: '5 MP (2592 x 1944)',
          fov: '110° Ultra-Wide Field of View',
          aperture: 'f/2.2',
        },

        macro: {
          resolution: '2 MP (1600 x 1200)',
          distance: '4cm Fixed Close-Up Distance',
          aperture: 'f/2.4',
        },

        front: {
          resolution: '16 MP High-Definition Selfie',
          aperture: 'f/2.45',
        },
      },

      capabilities,
      timestamp: new Date().toISOString(),
    };

    this.profile = profile;
    this.inspectedAt = profile.timestamp;

    return profile;
  }

  /**
   * Returns the last profile without triggering a new hardware inspection.
   */
  public getCachedProfile(): HonorDeviceProfile | null {
    return this.profile;
  }

  /**
   * Returns a complete diagnostic snapshot.
   */
  public getSnapshot(): DeviceCapabilitySnapshot | null {
    if (!this.profile) {
      return null;
    }

    return {
      profile: this.profile,
      trackCapabilities: this.trackCapabilities,
      trackSettings: this.trackSettings,
      inspectedAt: this.inspectedAt ?? this.profile.timestamp,
      trackId: this.inspectedTrackId,
    };
  }

  /**
   * True when a capability is effectively available to the current track.
   */
  public supports(name: string): boolean {
    return (
      this.profile?.capabilities.some(
        capability =>
          capability.name === name &&
          capability.status === 'SUPPORTED',
      ) ?? false
    );
  }

  /**
   * More robust lookup than comparing localized capability names.
   */
  public supportsCapability(key: CapabilityKey): boolean {
    return this.buildCapabilityEvaluations(this.trackCapabilities).some(
      capability =>
        capability.key === key &&
        capability.status === 'SUPPORTED',
    );
  }

  public getTrackCapabilities(): ExtendedTrackCapabilities | null {
    return this.trackCapabilities;
  }

  public getTrackSettings(): MediaTrackSettings | null {
    return this.trackSettings;
  }

  /**
   * Useful for CameraExperienceController.
   */
  public getZoomRange(): NumericRange | null {
    return this.trackCapabilities?.zoom ?? null;
  }

  public getIsoRange(): NumericRange | null {
    return this.trackCapabilities?.iso ?? null;
  }

  public getExposureCompensationRange(): NumericRange | null {
    return this.trackCapabilities?.exposureCompensation ?? null;
  }

  public getExposureTimeRange(): NumericRange | null {
    return this.trackCapabilities?.exposureTime ?? null;
  }

  public getFocusDistanceRange(): NumericRange | null {
    return this.trackCapabilities?.focusDistance ?? null;
  }

  /**
   * Re-inspect an existing track and refresh the cached profile.
   */
  public refresh(videoTrack: MediaStreamTrack): HonorDeviceProfile {
    this.readTrack(videoTrack);

    const capabilities = this.evaluateCapabilities(
      this.trackCapabilities,
    );

    const currentProfile = this.profile;

    const profile: HonorDeviceProfile = {
      ...(currentProfile ?? this.createBaseProfile()),
      capabilities,
      timestamp: new Date().toISOString(),
    };

    this.profile = profile;
    this.inspectedAt = profile.timestamp;

    return profile;
  }

  /**
   * Clears only the track-specific information.
   * Useful after camera restart.
   */
  public clearTrackInspection(): void {
    this.trackCapabilities = null;
    this.trackSettings = null;
    this.inspectedTrackId = null;
    this.inspectedAt = null;
  }

  public exportProfileJson(): string {
    return JSON.stringify(this.profile, null, 2);
  }

  public exportSnapshotJson(): string {
    return JSON.stringify(this.getSnapshot(), null, 2);
  }

  // ---------------------------------------------------------------------------
  // TRACK INSPECTION
  // ---------------------------------------------------------------------------

  private readTrack(videoTrack?: MediaStreamTrack): void {
    if (!videoTrack) {
      return;
    }

    try {
      this.inspectedTrackId = videoTrack.id;

      if (typeof videoTrack.getCapabilities === 'function') {
        this.trackCapabilities =
          videoTrack.getCapabilities() as ExtendedTrackCapabilities;
      } else {
        this.trackCapabilities = null;
      }

      if (typeof videoTrack.getSettings === 'function') {
        this.trackSettings = videoTrack.getSettings();
      } else {
        this.trackSettings = null;
      }
    } catch (error) {
      console.warn(
        '[DeviceCapabilityEngine] Unable to inspect camera track:',
        error,
      );

      this.trackCapabilities = null;
      this.trackSettings = null;
    }
  }

  // ---------------------------------------------------------------------------
  // CAPABILITY EVALUATION
  // ---------------------------------------------------------------------------

  private evaluateCapabilities(
    caps: ExtendedTrackCapabilities | null,
  ): HardwareCapability[] {
    const evaluations = this.buildCapabilityEvaluations(caps);

    return evaluations.map(
      ({
        name,
        category,
        status,
        details,
        apiSource,
      }): HardwareCapability => ({
        name,
        category,
        status,
        details,
        apiSource,
      }),
    );
  }

  private buildCapabilityEvaluations(
    caps: ExtendedTrackCapabilities | null,
  ): CapabilityEvaluation[] {
    return [
      this.evaluate108MP(),
      this.evaluateOIS(),
      this.evaluateEIS(caps),
      this.evaluateManualExposure(caps),
      this.evaluateManualFocus(caps),
      this.evaluateWhiteBalance(caps),
      this.evaluateZoom(caps),
      this.evaluateRaw(),
      this.evaluateNightMode(),
      this.evaluateHDR(),
      this.evaluateVideo(caps),
      this.evaluateScopes(),
      this.evaluateAI(),
      this.evaluateThermal(),
    ];
  }

  // ---------------------------------------------------------------------------
  // SENSOR
  // ---------------------------------------------------------------------------

  private evaluate108MP(): CapabilityEvaluation {
    return {
      key: 'sensor_108mp',
      name: '108 MP Ultra High-Resolution Sensor Capture',
      category: 'sensor',
      status: 'SUPPORTED',
      detected: true,
      confidence: 'MEDIUM',

      details:
        'El perfil de hardware declara un sensor principal de 108 MP. ' +
        'La API MediaStream no permite verificar por sí sola que WebView ' +
        'esté entregando el stream completo de 108 MP.',

      apiSource:
        'Hardware profile + MediaStreamTrack settings/capabilities',
    };
  }

  private evaluateOIS(): CapabilityEvaluation {
    return {
      key: 'ois',
      name: 'OIS (Optical Image Stabilization)',
      category: 'optics',
      status: 'SUPPORTED',
      detected: true,
      confidence: 'MEDIUM',

      details:
        'OIS declarado por el perfil del dispositivo. La presencia de OIS ' +
        'no implica que MediaStream exponga un control directo sobre el actuador óptico.',

      apiSource:
        'Device hardware profile / Camera2 LENS_INFO_AVAILABLE_OPTICAL_STABILIZATION',
    };
  }

  // ---------------------------------------------------------------------------
  // VIDEO
  // ---------------------------------------------------------------------------

  private evaluateEIS(
    caps: ExtendedTrackCapabilities | null,
  ): CapabilityEvaluation {
    const stabilization =
      this.hasCapability(caps, 'resizeMode') ||
      this.hasCapability(caps, 'frameRate');

    return {
      key: 'eis',
      name: 'EIS (Electronic Video Stabilization)',
      category: 'video',
      status: stabilization ? 'SUPPORTED' : 'LIMITED',
      detected: stabilization,
      confidence: stabilization ? 'MEDIUM' : 'LOW',

      details: stabilization
        ? 'El pipeline de vídeo está disponible, pero la API Web no garantiza acceso directo al modo EIS del ISP.'
        : 'No se detectaron indicadores suficientes en MediaStream para confirmar EIS.',

      apiSource:
        'MediaStreamTrack capabilities / Camera2 CONTROL_VIDEO_STABILIZATION_MODE',
    };
  }

  private evaluateVideo(
    caps: ExtendedTrackCapabilities | null,
  ): CapabilityEvaluation {
    const frameRate = this.readRange(caps?.frameRate);
    const width = this.readRange(caps?.width);
    const height = this.readRange(caps?.height);

    const supports4K =
      (width.max ?? 0) >= 3840 &&
      (height.max ?? 0) >= 2160;

    const supports60fps =
      (frameRate.max ?? 0) >= 60;

    let status: SupportStatus = 'LIMITED';

    if (supports4K && supports60fps) {
      status = 'SUPPORTED';
    } else if (supports4K || supports60fps) {
      status = 'LIMITED';
    } else if (caps) {
      status = 'LIMITED';
    }

    return {
      key: 'video_4k',
      name: 'Grabación de Vídeo 4K 30FPS & 1080p 60FPS',
      category: 'video',
      status,
      detected: supports4K || supports60fps,
      confidence: caps ? 'HIGH' : 'LOW',

      details:
        `4K detectado: ${supports4K ? 'sí' : 'no'}. ` +
        `60 FPS detectado: ${supports60fps ? 'sí' : 'no'}. ` +
        `Resolución máxima reportada: ${width.max ?? 'desconocida'}x${height.max ?? 'desconocida'}. ` +
        `FPS máximo reportado: ${frameRate.max ?? 'desconocido'}.`,

      apiSource:
        'MediaStreamTrack.getCapabilities() / MediaRecorder',
    };
  }

  // ---------------------------------------------------------------------------
  // EXPOSURE
  // ---------------------------------------------------------------------------

  private evaluateManualExposure(
    caps: ExtendedTrackCapabilities | null,
  ): CapabilityEvaluation {
    const iso = caps?.iso;
    const exposureTime = caps?.exposureTime;
    const exposureCompensation = caps?.exposureCompensation;
    const exposureModes = caps?.exposureMode ?? [];

    const hasIso = Boolean(iso);
    const hasShutter = Boolean(exposureTime);
    const hasEv = Boolean(exposureCompensation);

    const hasManualMode =
      exposureModes.includes('manual') ||
      exposureModes.includes('continuous');

    const fullManual =
      hasIso &&
      hasShutter &&
      hasManualMode;

    const partialManual =
      hasIso ||
      hasShutter ||
      hasEv;

    let status: SupportStatus;

    if (fullManual) {
      status = 'SUPPORTED';
    } else if (partialManual) {
      status = 'LIMITED';
    } else {
      status = 'LIMITED';
    }

    const details: string[] = [];

    if (iso) {
      details.push(`ISO ${this.formatRange(iso)}`);
    }

    if (exposureTime) {
      details.push(`Shutter ${this.formatRange(exposureTime)} s`);
    }

    if (exposureCompensation) {
      details.push(`EV ${this.formatRange(exposureCompensation)}`);
    }

    if (details.length === 0) {
      details.push(
        'El navegador no expone controles manuales de exposición para este track.',
      );
    }

    return {
      key: 'manual_exposure',
      name: 'Control Manual de Exposición (ISO y Shutter)',
      category: 'api',
      status,
      detected: partialManual,
      confidence: caps ? 'HIGH' : 'LOW',

      details: details.join(' · '),

      apiSource:
        'MediaStreamTrack.getCapabilities() / Camera2 SENSOR_SENSITIVITY / CONTROL_AE_EXPOSURE_COMPENSATION',
    };
  }

  // ---------------------------------------------------------------------------
  // FOCUS
  // ---------------------------------------------------------------------------

  private evaluateManualFocus(
    caps: ExtendedTrackCapabilities | null,
  ): CapabilityEvaluation {
    const distance = caps?.focusDistance;
    const modes = caps?.focusMode ?? [];

    const hasDistance = Boolean(distance);
    const hasManual =
      modes.includes('manual') ||
      modes.includes('single-shot') ||
      modes.includes('continuous');

    let status: SupportStatus = 'LIMITED';

    if (hasDistance && modes.includes('manual')) {
      status = 'SUPPORTED';
    } else if (hasDistance || hasManual) {
      status = 'LIMITED';
    }

    return {
      key: 'manual_focus',
      name: 'Enfoque Manual y Macro Stack',
      category: 'optics',
      status,
      detected: hasDistance || hasManual,
      confidence: caps ? 'HIGH' : 'LOW',

      details: hasDistance
        ? `Distancia de enfoque expuesta por WebView: ${this.formatRange(distance)}. ` +
          `Modos: ${modes.length ? modes.join(', ') : 'no declarados'}.`
        : 'No se expone focusDistance; se debe utilizar autofocus/tap-to-focus cuando el dispositivo lo permita.',

      apiSource:
        'MediaStreamTrack focusDistance/focusMode / Camera2 LENS_FOCUS_DISTANCE / CONTROL_AF_MODE',
    };
  }

  // ---------------------------------------------------------------------------
  // WHITE BALANCE
  // ---------------------------------------------------------------------------

  private evaluateWhiteBalance(
    caps: ExtendedTrackCapabilities | null,
  ): CapabilityEvaluation {
    const modes = caps?.whiteBalanceMode ?? [];
    const temperature = caps?.colorTemperature;

    const manual =
      modes.includes('manual') ||
      modes.includes('temperature');

    const hasTemperature = Boolean(temperature);

    let status: SupportStatus = 'LIMITED';

    if (manual && hasTemperature) {
      status = 'SUPPORTED';
    } else if (manual || hasTemperature) {
      status = 'LIMITED';
    }

    return {
      key: 'manual_white_balance',
      name: 'Balance de Blancos Manual (Kelvin)',
      category: 'api',
      status,
      detected: manual || hasTemperature,
      confidence: caps ? 'HIGH' : 'LOW',

      details:
        manual || hasTemperature
          ? `Control Kelvin: ${hasTemperature ? this.formatRange(temperature) : 'no expuesto'}. ` +
            `Modos: ${modes.length ? modes.join(', ') : 'no declarados'}.`
          : 'WebView no expone control manual Kelvin para el track actual; utilizar AWB o procesamiento posterior.',

      apiSource:
        'MediaStreamTrack whiteBalanceMode/colorTemperature / Camera2 COLOR_CORRECTION_MODE / CONTROL_AWB_MODE',
    };
  }

  // ---------------------------------------------------------------------------
  // ZOOM
  // ---------------------------------------------------------------------------

  private evaluateZoom(
    caps: ExtendedTrackCapabilities | null,
  ): CapabilityEvaluation {
    const zoom = caps?.zoom;

    const detected = Boolean(zoom);
    const min = zoom?.min ?? 1;
    const max = zoom?.max ?? 1;

    let status: SupportStatus = 'LIMITED';

    if (detected && max > min) {
      status = 'SUPPORTED';
    } else if (detected) {
      status = 'LIMITED';
    }

    return {
      key: 'zoom',
      name: 'Zoom Fluido',
      category: 'optics',
      status,
      detected,
      confidence: caps ? 'HIGH' : 'LOW',

      details: detected
        ? `Zoom nativo expuesto: ${min.toFixed(2)}x – ${max.toFixed(2)}x.`
        : 'No se expone zoom nativo; el controlador debe utilizar recorte/reencuadre computacional como fallback.',

      apiSource:
        'MediaStreamTrack zoom / Camera2 CONTROL_ZOOM_RATIO / SCALER_CROP_REGION',
    };
  }

  // ---------------------------------------------------------------------------
  // COMPUTATIONAL FEATURES
  // ---------------------------------------------------------------------------

  private evaluateRaw(): CapabilityEvaluation {
    return {
      key: 'raw',
      name: 'RAW / DNG Sensor Stream',
      category: 'processing',
      status: 'LIMITED',
      detected: false,
      confidence: 'LOW',

      details:
        'MediaStream/Canvas no garantiza acceso al RAW_SENSOR. El perfil de hardware puede soportar RAW mediante Camera2 nativo, pero el navegador debe considerarse sin RAW hasta que exista un bridge nativo verificable.',

      apiSource:
        'Camera2 RAW_SENSOR / Native Android bridge / DNG exporter',
    };
  }

  private evaluateNightMode(): CapabilityEvaluation {
    return {
      key: 'night_mode',
      name: 'Night Pro Multi-Frame',
      category: 'processing',
      status: 'SUPPORTED',
      detected: true,
      confidence: 'MEDIUM',

      details:
        'Modo Night Pro disponible como pipeline computacional de la aplicación: captura múltiple, alineación, reducción de ruido temporal y tone mapping.',

      apiSource:
        'Prometheus computational pipeline / Canvas / WebGL / native Camera2 bridge',
    };
  }

  private evaluateHDR(): CapabilityEvaluation {
    return {
      key: 'hdr',
      name: 'HDR Multi-Exposure Fusion',
      category: 'processing',
      status: 'SUPPORTED',
      detected: true,
      confidence: 'HIGH',

      details:
        'HDR puede implementarse en el pipeline de Prometheus mediante exposiciones múltiples y fusión computacional, independientemente de que el navegador exponga HDR hardware directamente.',

      apiSource:
        'Prometheus HDR pipeline / Canvas / WebGL',
    };
  }

  private evaluateScopes(): CapabilityEvaluation {
    return {
      key: 'scopes',
      name: 'Monitores Cinematográficos de Transmisión',
      category: 'processing',
      status: 'SUPPORTED',
      detected: true,
      confidence: 'HIGH',

      details:
        'Histogramas, waveform, vectorscope, false color y zebra pueden calcularse a partir de los frames entregados por MediaStream.',

      apiSource:
        'Prometheus frame analyzer / Canvas / WebGL',
    };
  }

  private evaluateAI(): CapabilityEvaluation {
    return {
      key: 'ai_scene',
      name: 'Motor de Detección de Escena IA',
      category: 'processing',
      status: 'SUPPORTED',
      detected: true,
      confidence: 'HIGH',

      details:
        'Clasificación contextual basada en luminancia, contraste, color, textura y movimiento. Esta entrada no debe interpretarse automáticamente como acceso directo a una NPU Qualcomm.',

      apiSource:
        'Prometheus AISceneEngine / computational scene analyzer',
    };
  }

  private evaluateThermal(): CapabilityEvaluation {
    return {
      key: 'thermal',
      name: 'Control Térmico y Gestión de Rendimiento',
      category: 'processing',
      status: 'SUPPORTED',
      detected: true,
      confidence: 'MEDIUM',

      details:
        'La aplicación puede implementar gestión térmica adaptativa mediante FPS, carga de procesamiento, memoria y señales disponibles del sistema. La temperatura física del SoC/sensor no está garantizada por Web APIs.',

      apiSource:
        'Prometheus ThermalManager / Android native thermal bridge when available',
    };
  }

  // ---------------------------------------------------------------------------
  // PROFILE
  // ---------------------------------------------------------------------------

  private createBaseProfile(): HonorDeviceProfile {
    return {
      deviceName: 'HONOR Magic8 Lite',
      model: 'ALI-NX1 / BRP-NX1 (5G)',
      os: 'MagicOS 10 (Android 15 Base / Camera2 Architecture)',
      chipset: 'Qualcomm Snapdragon 6 Gen 1 (4nm, Octa-Core)',
      isp: 'Qualcomm Spectra 12-bit Triple ISP',

      mainSensor: {
        resolution: '108 MP (12000 x 9000)',
        rawMegapixels: 108.0,
        sensorSize:
          '1/1.67" Matrix (0.64µm Native, 9-in-1 to 1.92µm Pixel Binning)',
        pixelSize: '0.64 µm (1.92 µm binned)',
        ois: true,
        aperture: 'f/1.75 Large Aperture',
        focalLengthEquivalent: '24mm Wide Angle',
      },

      secondarySensors: {
        ultrawide: {
          resolution: '5 MP (2592 x 1944)',
          fov: '110° Ultra-Wide Field of View',
          aperture: 'f/2.2',
        },

        macro: {
          resolution: '2 MP (1600 x 1200)',
          distance: '4cm Fixed Close-Up Distance',
          aperture: 'f/2.4',
        },

        front: {
          resolution: '16 MP High-Definition Selfie',
          aperture: 'f/2.45',
        },
      },

      capabilities: [],
      timestamp: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // UTILITIES
  // ---------------------------------------------------------------------------

  private hasCapability(
    caps: ExtendedTrackCapabilities | null,
    key: string,
  ): boolean {
    return Boolean(
      caps &&
        Object.prototype.hasOwnProperty.call(caps, key) &&
        (caps as Record<string, unknown>)[key] !== undefined,
    );
  }

  private readRange(
    value: unknown,
  ): NumericRange {
    if (!value || typeof value !== 'object') {
      return {};
    }

    const source = value as Record<string, unknown>;

    return {
      min: this.toNumber(source.min),
      max: this.toNumber(source.max),
      step: this.toNumber(source.step),
    };
  }

  private toNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined;
  }

  private formatRange(
    range: NumericRange | undefined,
  ): string {
    if (!range) {
      return 'no disponible';
    }

    const min =
      range.min !== undefined
        ? this.formatNumber(range.min)
        : '?';

    const max =
      range.max !== undefined
        ? this.formatNumber(range.max)
        : '?';

    const step =
      range.step !== undefined
        ? `, step ${this.formatNumber(range.step)}`
        : '';

    return `${min} – ${max}${step}`;
  }

  private formatNumber(value: number): string {
    if (Math.abs(value) >= 100) {
      return value.toFixed(0);
    }

    if (Math.abs(value) >= 10) {
      return value.toFixed(1);
    }

    return value.toFixed(2);
  }
}
