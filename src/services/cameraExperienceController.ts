import {
  CaptureMode,
  AIScenePrediction,
  ThermalState,
} from '../types';

import { CameraService } from './cameraService';
import { AISceneEngine } from './aiSceneEngine';
import { ThermalManager } from './thermalManager';

/* ============================================================================
 * TYPES
 * ========================================================================== */

export type ExperienceLevel =
  | 'NORMAL'
  | 'PROFESSIONAL'
  | 'DIAGNOSTIC';

export type ProcessingState =
  | 'idle'
  | 'capturing'
  | 'processing'
  | 'saving'
  | 'error';

export type ProcessingBudget =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH';

export type ExposureReason =
  | 'NO_PREDICTION'
  | 'LOW_LIGHT'
  | 'BACKLIGHT'
  | 'OVEREXPOSED'
  | 'NORMAL';

export interface VisibleFeatures {
  photo: boolean;
  video: boolean;
  zoomPills: boolean;
  flash: boolean;
  cameraSwitch: boolean;
  gallery: boolean;
  aspectRatio: boolean;
  timer: boolean;

  manualIso: boolean;
  manualShutter: boolean;
  manualEv: boolean;
  manualFocus: boolean;
  manualWb: boolean;
  rawFormat: boolean;
  scopes: boolean;
  zebra: boolean;
  focusPeaking: boolean;
  falseColor: boolean;

  hardwareCapabilityInspector: boolean;
  thermalTelemetry: boolean;
  pipelineLatency: boolean;
  frameBufferInspector: boolean;
}

export interface CameraRuntimeState {
  cameraReady: boolean;
  streamActive: boolean;
  videoTrackLive: boolean;
  captureReady: boolean;

  selectedDeviceId: string | null;

  processingState: ProcessingState;

  activeUserLocks: {
    exposure: boolean;
    focus: boolean;
    whiteBalance: boolean;
  };

  simplifiedNotice: string | null;

  autoHdrActive: boolean;
  autoNightActive: boolean;

  lastError: string | null;
}

export interface CameraExperienceState {
  experienceLevel: ExperienceLevel;
  visibleFeatures: VisibleFeatures;

  cameraReady: boolean;
  captureReady: boolean;

  processingState: ProcessingState;

  activeUserLocks: {
    exposure: boolean;
    focus: boolean;
    whiteBalance: boolean;
  };

  simplifiedNotice: string | null;

  autoHdrActive: boolean;
  autoNightActive: boolean;

  selectedDeviceId: string | null;
  streamActive: boolean;
  videoTrackLive: boolean;

  lastError: string | null;
}

export interface AutoExposureDecision {
  evBias: number;

  suggestion?: string;

  reason: ExposureReason;

  changed: boolean;
}

export interface AutoProcessingDecision {
  useMultiFrame: boolean;
  useHdr: boolean;
  useNightPro: boolean;

  framesToCapture: number;

  processingBudget: ProcessingBudget;

  temporalStabilization: boolean;
}

export interface CameraCapturePlan {
  exposure: AutoExposureDecision;
  processing: AutoProcessingDecision;

  mode: CaptureMode;

  nativeCapturePreferred: boolean;

  timestamp: number;
}

export interface CameraTrackCapabilities {
  width?: {
    min?: number;
    max?: number;
  };

  height?: {
    min?: number;
    max?: number;
  };

  frameRate?: {
    min?: number;
    max?: number;
  };

  zoom?: {
    min?: number;
    max?: number;
    step?: number;
  };

  torch?: boolean;

  focusMode?: string[];

  exposureMode?: string[];

  whiteBalanceMode?: string[];
}

export interface CameraExperienceConfig {
  defaultExposureBias: number;

  lowLightExposureBias: number;
  backlightExposureBias: number;
  overexposedExposureBias: number;

  maxPositiveEv: number;
  maxNegativeEv: number;

  exposureSmoothing: number;

  normalBurstFrames: number;
  warmBurstFrames: number;
  throttlingBurstFrames: number;

  hdrMaxFrames: number;
  nightMaxFrames: number;

  enableNativeImageCapture: boolean;

  nativeCaptureWidth: number;
  nativeCaptureHeight: number;

  captureTimeoutMs: number;
}

interface ImageCaptureLike {
  takePhoto(settings?: {
    imageWidth?: number;
    imageHeight?: number;
  }): Promise<Blob>;

  grabFrame?: () => Promise<ImageBitmap>;
}

/* ============================================================================
 * DEFAULT CONFIG
 * ========================================================================== */

const DEFAULT_CONFIG: CameraExperienceConfig = {
  defaultExposureBias: 0,

  lowLightExposureBias: 0.65,
  backlightExposureBias: -0.45,
  overexposedExposureBias: -0.60,

  maxPositiveEv: 1.0,
  maxNegativeEv: -1.0,

  /*
   * 0 = completamente estable
   * 1 = seguimiento instantáneo.
   */
  exposureSmoothing: 0.18,

  normalBurstFrames: 6,
  warmBurstFrames: 4,
  throttlingBurstFrames: 2,

  hdrMaxFrames: 3,
  nightMaxFrames: 4,

  enableNativeImageCapture: true,

  nativeCaptureWidth: 4000,
  nativeCaptureHeight: 3000,

  captureTimeoutMs: 12000,
};

/* ============================================================================
 * CONTROLLER
 * ========================================================================== */

export class CameraExperienceController {
  private static instance: CameraExperienceController | null =
    null;

  private readonly cameraService: CameraService;
  private readonly aiSceneEngine: AISceneEngine;
  private readonly thermalManager: ThermalManager;

  private readonly config: CameraExperienceConfig;

  private experienceLevel: ExperienceLevel =
    'NORMAL';

  private processingState: ProcessingState =
    'idle';

  private imageCaptureInstance:
    | ImageCaptureLike
    | null = null;

  private imageCaptureTrack:
    | MediaStreamTrack
    | null = null;

  private imageCaptureTrackEndedHandler:
    | (() => void)
    | null = null;

  private capturePromise:
    | Promise<Blob | null>
    | null = null;

  private lastExposureBias: number;

  private lastError: string | null = null;

  private streamActive = false;

  private selectedDeviceId:
    | string
    | null = null;

  private activeUserLocks = {
    exposure: false,
    focus: false,
    whiteBalance: false,
  };

  private autoHdrActive = false;
  private autoNightActive = false;

  private simplifiedNotice:
    | string
    | null = null;

  private constructor(
    config: Partial<CameraExperienceConfig> = {}
  ) {
    this.config =
      this.normalizeConfig({
        ...DEFAULT_CONFIG,
        ...config,
      });

    this.lastExposureBias =
      this.config.defaultExposureBias;

    this.cameraService =
      CameraService.getInstance();

    this.aiSceneEngine =
      AISceneEngine.getInstance();

    this.thermalManager =
      ThermalManager.getInstance();
  }

  public static getInstance(
    config: Partial<CameraExperienceConfig> = {}
  ): CameraExperienceController {
    if (!CameraExperienceController.instance) {
      CameraExperienceController.instance =
        new CameraExperienceController(config);
    }

    return CameraExperienceController.instance;
  }

  /**
   * Útil exclusivamente para tests/desarrollo.
   */
  public static resetInstanceForTests(): void {
    if (
      CameraExperienceController.instance
    ) {
      CameraExperienceController.instance.dispose();
      CameraExperienceController.instance =
        null;
    }
  }

  /* ==========================================================================
   * EXPERIENCE / UI
   * ======================================================================== */

  public getExperienceLevel(): ExperienceLevel {
    return this.experienceLevel;
  }

  public setExperienceLevel(
    level: ExperienceLevel
  ): void {
    this.experienceLevel = level;
  }

  public getFeatureVisibility(
    level: ExperienceLevel,
    mode: CaptureMode
  ): VisibleFeatures {
    const professional =
      level === 'PROFESSIONAL' ||
      mode === 'pro' ||
      mode === 'cinematic';

    const diagnostic =
      level === 'DIAGNOSTIC';

    const rawCapableMode =
      mode === 'mode_108mp';

    return {
      photo: true,
      video: true,
      zoomPills: true,
      flash: true,
      cameraSwitch: true,
      gallery: true,
      aspectRatio: true,
      timer: true,

      manualIso: professional,
      manualShutter: professional,
      manualEv: professional,
      manualFocus: professional,
      manualWb: professional,

      rawFormat:
        professional ||
        rawCapableMode,

      scopes: professional,
      zebra: professional,
      focusPeaking: professional,
      falseColor: professional,

      hardwareCapabilityInspector:
        diagnostic,

      thermalTelemetry:
        diagnostic,

      pipelineLatency:
        diagnostic,

      frameBufferInspector:
        diagnostic,
    };
  }

  public getState(
    mode: CaptureMode
  ): CameraExperienceState {
    const trackLive =
      this.hasLiveVideoTrack();

    const cameraReady =
      this.streamActive &&
      trackLive;

    const captureReady =
      cameraReady &&
      this.processingState === 'idle';

    return {
      experienceLevel:
        this.experienceLevel,

      visibleFeatures:
        this.getFeatureVisibility(
          this.experienceLevel,
          mode
        ),

      cameraReady,

      captureReady,

      processingState:
        this.processingState,

      activeUserLocks: {
        ...this.activeUserLocks,
      },

      simplifiedNotice:
        this.simplifiedNotice,

      autoHdrActive:
        this.autoHdrActive,

      autoNightActive:
        this.autoNightActive,

      selectedDeviceId:
        this.selectedDeviceId,

      streamActive:
        this.streamActive,

      videoTrackLive:
        trackLive,

      lastError:
        this.lastError,
    };
  }

  public setProcessingState(
    state: ProcessingState
  ): void {
    this.processingState = state;

    if (state !== 'error') {
      this.lastError = null;
    }
  }

  public setCameraRuntimeState(
    state: Partial<CameraRuntimeState>
  ): void {
    if (
      typeof state.streamActive ===
      'boolean'
    ) {
      this.streamActive =
        state.streamActive;
    }

    if (
      state.selectedDeviceId !== undefined
    ) {
      this.selectedDeviceId =
        state.selectedDeviceId;
    }

    if (
      state.processingState
    ) {
      this.processingState =
        state.processingState;
    }

    if (
      state.activeUserLocks
    ) {
      this.activeUserLocks = {
        ...this.activeUserLocks,
        ...state.activeUserLocks,
      };
    }

    if (
      state.simplifiedNotice !== undefined
    ) {
      this.simplifiedNotice =
        state.simplifiedNotice;
    }

    if (
      typeof state.autoHdrActive ===
      'boolean'
    ) {
      this.autoHdrActive =
        state.autoHdrActive;
    }

    if (
      typeof state.autoNightActive ===
      'boolean'
    ) {
      this.autoNightActive =
        state.autoNightActive;
    }

    if (
      state.lastError !== undefined
    ) {
      this.lastError =
        state.lastError;
    }
  }

  public isCaptureBusy(): boolean {
    return (
      this.capturePromise !== null ||
      this.processingState !== 'idle'
    );
  }

  /* ==========================================================================
   * AUTO EXPOSURE
   * ======================================================================== */

  public evaluateAutoExposure(
    prediction: AIScenePrediction | null
  ): AutoExposureDecision {
    if (!prediction) {
      return {
        evBias:
          this.lastExposureBias,

        reason:
          'NO_PREDICTION',

        changed: false,
      };
    }

    let targetBias =
      this.config.defaultExposureBias;

    let reason:
      ExposureReason =
        'NORMAL';

    let suggestion:
      string | undefined;

    if (
      prediction.lightLevel ===
      'Low-light'
    ) {
      targetBias =
        this.config.lowLightExposureBias;

      reason =
        'LOW_LIGHT';

      suggestion =
        'Poca luz detectada. Modo Noche computacional preparado.';
    } else if (
      prediction.lightLevel ===
      'Overexposed'
    ) {
      targetBias =
        this.config.overexposedExposureBias;

      reason =
        'OVEREXPOSED';

      suggestion =
        'Altas luces detectadas. Protegiendo detalle.';
    } else if (
      prediction.scene ===
      'Backlight'
    ) {
      targetBias =
        this.config.backlightExposureBias;

      reason =
        'BACKLIGHT';

      suggestion =
        'Contraluz detectado. HDR adaptativo preparado.';
    } else if (
      prediction.recommendedHdr ||
      prediction.scene ===
        'High Dynamic Range'
    ) {
      /*
       * En HDR evitamos compensaciones agresivas.
       */
      targetBias = -0.10;

      reason =
        'NORMAL';
    }

    targetBias =
      this.clamp(
        targetBias,
        this.config.maxNegativeEv,
        this.config.maxPositiveEv
      );

    /*
     * Si el usuario bloqueó exposición,
     * la política automática no modifica EV.
     */
    if (
      this.activeUserLocks.exposure
    ) {
      return {
        evBias:
          this.lastExposureBias,

        suggestion:
          'Exposición manual bloqueada.',

        reason,

        changed: false,
      };
    }

    const alpha =
      this.clamp01(
        this.config.exposureSmoothing
      );

    const previous =
      this.lastExposureBias;

    const next =
      previous +
      (targetBias - previous) *
        alpha;

    this.lastExposureBias =
      this.clamp(
        next,
        this.config.maxNegativeEv,
        this.config.maxPositiveEv
      );

    return {
      evBias:
        this.lastExposureBias,

      suggestion,

      reason,

      changed:
        Math.abs(
          this.lastExposureBias -
            previous
        ) > 0.005,
    };
  }

  public resetAutoExposure(): void {
    this.lastExposureBias =
      this.config.defaultExposureBias;
  }

  /* ==========================================================================
   * CAPTURE PLAN
   * ======================================================================== */

  public createCapturePlan(
    mode: CaptureMode,
    prediction: AIScenePrediction | null,
    thermal: ThermalState
  ): CameraCapturePlan {
    const exposure =
      this.evaluateAutoExposure(
        prediction
      );

    const processing =
      this.determineAutoProcessing(
        mode,
        prediction,
        thermal
      );

    this.autoHdrActive =
      processing.useHdr;

    this.autoNightActive =
      processing.useNightPro;

    return {
      exposure,

      processing,

      mode,

      nativeCapturePreferred:
        this.config.enableNativeImageCapture,

      timestamp:
        Date.now(),
    };
  }

  /* ==========================================================================
   * COMPUTATIONAL POLICY
   * ======================================================================== */

  public determineAutoProcessing(
    mode: CaptureMode,
    prediction: AIScenePrediction | null,
    thermal: ThermalState
  ): AutoProcessingDecision {
    const maxFrames =
      this.getThermalFrameBudget(
        thermal
      );

    const budget =
      this.getProcessingBudget(
        thermal
      );

    const temporalStabilization =
      thermal.status !==
      'THROTTLING';

    /*
     * NIGHT PRO
     */
    if (
      mode === 'night_pro'
    ) {
      const frames =
        Math.min(
          this.config.nightMaxFrames,
          maxFrames
        );

      return {
        useMultiFrame:
          frames > 1,

        useHdr: false,

        useNightPro: true,

        framesToCapture:
          Math.max(1, frames),

        processingBudget:
          budget,

        temporalStabilization,
      };
    }

    /*
     * HDR
     */
    if (
      mode === 'hdr'
    ) {
      const frames =
        Math.min(
          this.config.hdrMaxFrames,
          maxFrames
        );

      return {
        useMultiFrame:
          frames > 1,

        useHdr: true,

        useNightPro: false,

        framesToCapture:
          Math.max(1, frames),

        processingBudget:
          budget,

        temporalStabilization,
      };
    }

    /*
     * AUTO PHOTO
     */
    if (
      mode === 'photo' &&
      prediction
    ) {
      if (
        prediction.lightLevel ===
        'Low-light'
      ) {
        const frames =
          Math.min(
            this.config.nightMaxFrames,
            maxFrames
          );

        return {
          useMultiFrame:
            frames > 1,

          useHdr: false,

          useNightPro: true,

          framesToCapture:
            Math.max(1, frames),

          processingBudget:
            budget,

          temporalStabilization,
        };
      }

      const hdrRecommended =
        prediction.recommendedHdr ||
        prediction.scene ===
          'Backlight' ||
        prediction.scene ===
          'High Dynamic Range';

      if (
        hdrRecommended
      ) {
        const frames =
          Math.min(
            this.config.hdrMaxFrames,
            maxFrames
          );

        return {
          useMultiFrame:
            frames > 1,

          useHdr: true,

          useNightPro: false,

          framesToCapture:
            Math.max(1, frames),

          processingBudget:
            budget,

          temporalStabilization,
        };
      }
    }

    /*
     * SINGLE FRAME
     */
    return {
      useMultiFrame: false,

      useHdr: false,

      useNightPro: false,

      framesToCapture: 1,

      processingBudget:
        budget,

      temporalStabilization: false,
    };
  }

  private getThermalFrameBudget(
    thermal: ThermalState
  ): number {
    switch (
      thermal.status
    ) {
      case 'THROTTLING':
        return Math.max(
          1,
          this.config
            .throttlingBurstFrames
        );

      case 'WARM':
        return Math.max(
          1,
          this.config
            .warmBurstFrames
        );

      default:
        return Math.max(
          1,
          this.config
            .normalBurstFrames
        );
    }
  }

  private getProcessingBudget(
    thermal: ThermalState
  ): ProcessingBudget {
    switch (
      thermal.status
    ) {
      case 'THROTTLING':
        return 'LOW';

      case 'WARM':
        return 'MEDIUM';

      default:
        return 'HIGH';
    }
  }

  /* ==========================================================================
   * NATIVE IMAGE CAPTURE
   * ======================================================================== */

  public async captureNativeHardwarePhoto(
    videoTrack: MediaStreamTrack
  ): Promise<Blob | null> {
    /*
     * Async mutex:
     * evita dos takePhoto() simultáneos.
     */
    if (
      this.capturePromise
    ) {
      return this.capturePromise;
    }

    this.capturePromise =
      this.performNativeCapture(
        videoTrack
      );

    try {
      return await this.capturePromise;
    } finally {
      this.capturePromise = null;
    }
  }

  private async performNativeCapture(
    videoTrack: MediaStreamTrack
  ): Promise<Blob | null> {
    if (
      !this.config
        .enableNativeImageCapture
    ) {
      return null;
    }

    if (
      !this.isUsableVideoTrack(
        videoTrack
      )
    ) {
      return null;
    }

    if (
      typeof window ===
      'undefined'
    ) {
      return null;
    }

    try {
      const ImageCaptureConstructor =
        (
          window as unknown as {
            ImageCapture?: new (
              track: MediaStreamTrack
            ) => ImageCaptureLike;
          }
        ).ImageCapture;

      if (
        typeof ImageCaptureConstructor !==
        'function'
      ) {
        return null;
      }

      const capture =
        this.getOrCreateImageCapture(
          videoTrack,
          ImageCaptureConstructor
        );

      if (
        !capture ||
        typeof capture.takePhoto !==
          'function'
      ) {
        return null;
      }

      const capabilities =
        this.getTrackCapabilities(
          videoTrack
        );

      const requestedSize =
        this.resolveNativeCaptureSize(
          capabilities
        );

      const blob =
        await this.withTimeout(
          capture.takePhoto(
            requestedSize
          ),
          this.config
            .captureTimeoutMs
        );

      /*
       * No usamos instanceof Blob:
       * WebView/iframe/realtime realms pueden
       * tener distintos constructores.
       */
      if (
        !blob ||
        typeof blob.size !==
          'number' ||
        blob.size <= 0
      ) {
        return null;
      }

      return blob;
    } catch (error) {
      console.warn(
        '[CameraExperience] Native ImageCapture failed.',
        error
      );

      this.invalidateImageCapture();

      return null;
    }
  }

  private getOrCreateImageCapture(
    videoTrack: MediaStreamTrack,
    Constructor: new (
      track: MediaStreamTrack
    ) => ImageCaptureLike
  ): ImageCaptureLike | null {
    if (
      this.imageCaptureInstance &&
      this.imageCaptureTrack ===
        videoTrack
    ) {
      return this.imageCaptureInstance;
    }

    this.invalidateImageCapture();

    try {
      const capture =
        new Constructor(
          videoTrack
        );

      this.imageCaptureInstance =
        capture;

      this.imageCaptureTrack =
        videoTrack;

      /*
       * Invalidamos inmediatamente si el track termina.
       */
      const onEnded = () => {
        if (
          this.imageCaptureTrack ===
          videoTrack
        ) {
          this.invalidateImageCapture();
        }
      };

      videoTrack.addEventListener(
        'ended',
        onEnded,
        { once: true }
      );

      this.imageCaptureTrackEndedHandler =
        onEnded;

      return capture;
    } catch {
      this.invalidateImageCapture();

      return null;
    }
  }

  private resolveNativeCaptureSize(
    capabilities: CameraTrackCapabilities
  ): {
    imageWidth: number;
    imageHeight: number;
  } {
    const configuredWidth =
      this.config
        .nativeCaptureWidth;

    const configuredHeight =
      this.config
        .nativeCaptureHeight;

    const maxWidth =
      capabilities.width?.max;

    const maxHeight =
      capabilities.height?.max;

    const width =
      maxWidth
        ? Math.min(
            configuredWidth,
            maxWidth
          )
        : configuredWidth;

    const height =
      maxHeight
        ? Math.min(
            configuredHeight,
            maxHeight
          )
        : configuredHeight;

    /*
     * Garantiza dimensiones enteras
     * y válidas.
     */
    return {
      imageWidth:
        Math.max(
          1,
          Math.round(width)
        ),

      imageHeight:
        Math.max(
          1,
          Math.round(height)
        ),
    };
  }

  private invalidateImageCapture(): void {
    if (
      this.imageCaptureTrack &&
      this.imageCaptureTrackEndedHandler
    ) {
      try {
        this.imageCaptureTrack.removeEventListener(
          'ended',
          this.imageCaptureTrackEndedHandler
        );
      } catch {
        // Ignore cleanup failures.
      }
    }

    this.imageCaptureInstance =
      null;

    this.imageCaptureTrack =
      null;

    this.imageCaptureTrackEndedHandler =
      null;
  }

  public disposeImageCapture(): void {
    this.invalidateImageCapture();
  }

  /* ==========================================================================
   * TRACK / HARDWARE
   * ======================================================================== */

  public getTrackCapabilities(
    track: MediaStreamTrack
  ): CameraTrackCapabilities {
    if (
      !this.isUsableVideoTrack(
        track
      )
    ) {
      return {};
    }

    try {
      if (
        typeof track.getCapabilities !==
        'function'
      ) {
        return {};
      }

      return track.getCapabilities() as CameraTrackCapabilities;
    } catch {
      return {};
    }
  }

  public getTrackSettings(
    track: MediaStreamTrack
  ): MediaTrackSettings | null {
    if (
      !this.isUsableVideoTrack(
        track
      )
    ) {
      return null;
    }

    try {
      return track.getSettings();
    } catch {
      return null;
    }
  }

  public hasLiveVideoTrack(): boolean {
    try {
      /*
       * No asumimos una API concreta de CameraService.
       * Esta función queda preparada para ser conectada
       * a getCurrentStream()/getVideoTrack().
       */
      const service =
        this.cameraService as unknown as {
          getVideoTrack?: () =>
            | MediaStreamTrack
            | null;

          getCurrentStream?: () =>
            | MediaStream
            | null;
        };

      const track =
        service.getVideoTrack?.();

      if (
        track
      ) {
        return this.isUsableVideoTrack(
          track
        );
      }

      const stream =
        service.getCurrentStream?.();

      if (
        stream
      ) {
        return stream
          .getVideoTracks()
          .some(track =>
            this.isUsableVideoTrack(
              track
            )
          );
      }
    } catch {
      // Fall through.
    }

    /*
     * Si CameraService aún no expone el stream,
     * usamos el estado reportado externamente.
     */
    return this.streamActive;
  }

  private isUsableVideoTrack(
    track: MediaStreamTrack | null
  ): track is MediaStreamTrack {
    if (!track) {
      return false;
    }

    if (
      track.kind !== 'video'
    ) {
      return false;
    }

    if (
      track.readyState === 'ended'
    ) {
      return false;
    }

    if (
      track.enabled === false
    ) {
      return false;
    }

    return true;
  }

  /* ==========================================================================
   * ERRORS
   * ======================================================================== */

  public translateError(
    error: unknown
  ): string {
    const name =
      this.extractErrorName(
        error
      );

    const message =
      this.extractErrorMessage(
        error
      );

    switch (name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return (
          'Permiso de cámara requerido para capturar fotos.'
        );

      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return (
          'No se encontró ningún sensor de cámara disponible.'
        );

      case 'NotReadableError':
      case 'TrackStartError':
        return (
          'La cámara está siendo usada por otra aplicación o no pudo iniciarse.'
        );

      case 'AbortError':
        return (
          'La operación de cámara fue cancelada.'
        );

      case 'OverconstrainedError':
        return (
          'Ajustando resolución para coincidir con el sensor.'
        );

      case 'InvalidStateError':
        return (
          'La cámara necesita reiniciarse antes de continuar.'
        );

      case 'NotSupportedError':
        return (
          'Esta función no está disponible en este dispositivo.'
        );

      case 'OperationError':
        return (
          'La cámara no pudo completar la operación.'
        );
    }

    const normalized =
      message.toLowerCase();

    if (
      normalized.includes(
        'permission'
      ) ||
      normalized.includes(
        'not allowed'
      )
    ) {
      return (
        'Permiso de cámara requerido para capturar fotos.'
      );
    }

    if (
      normalized.includes(
        'not found'
      ) ||
      normalized.includes(
        'no camera'
      ) ||
      normalized.includes(
        'device not found'
      )
    ) {
      return (
        'No se encontró ningún sensor de cámara disponible.'
      );
    }

    if (
      normalized.includes(
        'busy'
      ) ||
      normalized.includes(
        'in use'
      ) ||
      normalized.includes(
        'trackstart'
      )
    ) {
      return (
        'La cámara está siendo usada por otra aplicación.'
      );
    }

    if (
      normalized.includes(
        'constraint'
      ) ||
      normalized.includes(
        'resolution'
      )
    ) {
      return (
        'Ajustando resolución para coincidir con el sensor.'
      );
    }

    return (
      'La cámara no pudo completar la operación. Inténtalo de nuevo.'
    );
  }

  private extractErrorName(
    error: unknown
  ): string {
    if (
      typeof error ===
        'object' &&
      error !== null &&
      'name' in error
    ) {
      return String(
        (
          error as {
            name?: unknown;
          }
        ).name ?? ''
      );
    }

    return '';
  }

  private extractErrorMessage(
    error: unknown
  ): string {
    if (
      typeof error === 'string'
    ) {
      return error;
    }

    if (
      error instanceof Error
    ) {
      return (
        error.message || ''
      );
    }

    if (
      typeof error ===
        'object' &&
      error !== null &&
      'message' in error
    ) {
      return String(
        (
          error as {
            message?: unknown;
          }
        ).message ?? ''
      );
    }

    return '';
  }

  /* ==========================================================================
   * RECOVERY
   * ======================================================================== */

  public shouldRecoverCamera(
    error: unknown
  ): boolean {
    const name =
      this.extractErrorName(
        error
      );

    return (
      name ===
        'AbortError' ||
      name ===
        'InvalidStateError' ||
      name ===
        'NotReadableError' ||
      name ===
        'TrackStartError'
    );
  }

  public resetForCameraRestart(): void {
    this.invalidateImageCapture();

    this.resetAutoExposure();

    this.processingState =
      'idle';

    this.lastError =
      null;

    this.autoHdrActive =
      false;

    this.autoNightActive =
      false;

    this.simplifiedNotice =
      null;
  }

  public setCameraStreamActive(
    active: boolean
  ): void {
    this.streamActive =
      active;

    if (!active) {
      this.invalidateImageCapture();
    }
  }

  public setSelectedDevice(
    deviceId: string | null
  ): void {
    this.selectedDeviceId =
      deviceId;

    this.invalidateImageCapture();
  }

  public setUserLocks(
    locks: Partial<
      CameraRuntimeState['activeUserLocks']
    >
  ): void {
    this.activeUserLocks = {
      ...this.activeUserLocks,
      ...locks,
    };
  }

  public setSimplifiedNotice(
    notice: string | null
  ): void {
    this.simplifiedNotice =
      notice;
  }

  public setError(
    error: unknown
  ): string {
    const message =
      this.translateError(
        error
      );

    this.lastError =
      message;

    this.processingState =
      'error';

    return message;
  }

  /* ==========================================================================
   * LIFECYCLE
   * ======================================================================== */

  public dispose(): void {
    this.invalidateImageCapture();

    this.capturePromise =
      null;

    this.processingState =
      'idle';

    this.streamActive =
      false;

    this.lastError =
      null;
  }

  /* ==========================================================================
   * INTERNAL HELPERS
   * ======================================================================== */

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    let timer:
      ReturnType<typeof setTimeout> |
      null = null;

    try {
      return await Promise.race([
        promise,

        new Promise<T>(
          (_, reject) => {
            timer =
              setTimeout(
                () => {
                  reject(
                    new Error(
                      'Camera capture timeout'
                    )
                  );
                },
                timeoutMs
              );
          }
        ),
      ]);
    } finally {
      if (timer !== null) {
        clearTimeout(timer);
      }
    }
  }

  private normalizeConfig(
    config: CameraExperienceConfig
  ): CameraExperienceConfig {
    return {
      ...config,

      defaultExposureBias:
        Number.isFinite(
          config.defaultExposureBias
        )
          ? config.defaultExposureBias
          : 0,

      lowLightExposureBias:
        Number.isFinite(
          config.lowLightExposureBias
        )
          ? config.lowLightExposureBias
          : 0.65,

      backlightExposureBias:
        Number.isFinite(
          config.backlightExposureBias
        )
          ? config.backlightExposureBias
          : -0.45,

      overexposedExposureBias:
        Number.isFinite(
          config.overexposedExposureBias
        )
          ? config.overexposedExposureBias
          : -0.60,

      maxPositiveEv:
        Math.max(
          0,
          config.maxPositiveEv
        ),

      maxNegativeEv:
        Math.min(
          0,
          config.maxNegativeEv
        ),

      exposureSmoothing:
        this.clamp01(
          config.exposureSmoothing
        ),

      normalBurstFrames:
        Math.max(
          1,
          Math.round(
            config.normalBurstFrames
          )
        ),

      warmBurstFrames:
        Math.max(
          1,
          Math.round(
            config.warmBurstFrames
          )
        ),

      throttlingBurstFrames:
        Math.max(
          1,
          Math.round(
            config.throttlingBurstFrames
          )
        ),

      hdrMaxFrames:
        Math.max(
          1,
          Math.round(
            config.hdrMaxFrames
          )
        ),

      nightMaxFrames:
        Math.max(
          1,
          Math.round(
            config.nightMaxFrames
          )
        ),

      nativeCaptureWidth:
        Math.max(
          1,
          Math.round(
            config.nativeCaptureWidth
          )
        ),

      nativeCaptureHeight:
        Math.max(
          1,
          Math.round(
            config.nativeCaptureHeight
          )
        ),

      captureTimeoutMs:
        Math.max(
          1000,
          Math.round(
            config.captureTimeoutMs
          )
        ),
    };
  }

  private clamp(
    value: number,
    min: number,
    max: number
  ): number {
    return Math.min(
      max,
      Math.max(
        min,
        value
      )
    );
  }

  private clamp01(
    value: number
  ): number {
    return this.clamp(
      value,
      0,
      1
    );
  }
}
