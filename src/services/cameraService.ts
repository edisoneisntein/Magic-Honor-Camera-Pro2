export type CameraFacing = 'user' | 'environment';

export type CameraPermissionStatus =
  | 'prompt'
  | 'granted'
  | 'denied'
  | 'unavailable';

export type CameraStreamState =
  | 'idle'
  | 'starting'
  | 'active'
  | 'simulated'
  | 'stopping'
  | 'error';

export type RecordingBitrate =
  | 'low'
  | 'medium'
  | 'high';

export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
  facing: CameraFacing;
}

export interface CameraResolution {
  width: number;
  height: number;
}

export interface CameraServiceState {
  streamState: CameraStreamState;
  permissionStatus: CameraPermissionStatus;
  facing: CameraFacing;
  zoomRatio: number;
  hasVideoTrack: boolean;
  hasAudioTrack: boolean;
  isSimulated: boolean;
  isRecording: boolean;
  lastErrorMessage: string | null;
}

export interface CameraHardwareCapabilities {
  width?: {
    min?: number;
    max?: number;
    step?: number;
  };

  height?: {
    min?: number;
    max?: number;
    step?: number;
  };

  frameRate?: {
    min?: number;
    max?: number;
    step?: number;
  };

  zoom?: {
    min?: number;
    max?: number;
    step?: number;
  };

  torch?: boolean;

  focusMode?: string[];

  focusDistance?: {
    min?: number;
    max?: number;
    step?: number;
  };

  exposureMode?: string[];

  exposureCompensation?: {
    min?: number;
    max?: number;
    step?: number;
  };

  exposureTime?: {
    min?: number;
    max?: number;
    step?: number;
  };

  iso?: {
    min?: number;
    max?: number;
    step?: number;
  };

  whiteBalanceMode?: string[];

  colorTemperature?: {
    min?: number;
    max?: number;
    step?: number;
  };
}

export interface ManualCameraSettings {
  iso: number | 'auto';
  shutterSpeed: number | 'auto';
  evBias: number;
  kelvin: number;
}

export interface NativePhotoResult {
  dataUrl: string;
  width: number;
  height: number;
  isNative: boolean;
  blob: Blob;
}

interface ImageCaptureLike {
  takePhoto(options?: {
    imageWidth?: number;
    imageHeight?: number;
  }): Promise<Blob>;
}

interface ImageCaptureConstructorLike {
  new (track: MediaStreamTrack): ImageCaptureLike;
}

interface ExtendedVideoConstraints extends MediaTrackConstraints {
  advanced?: Array<
    MediaTrackConstraintSet & {
      zoom?: ConstrainDouble;
      torch?: ConstrainBoolean;
      focusMode?: string;
      focusDistance?: ConstrainDouble;
      exposureMode?: string;
      exposureCompensation?: ConstrainDouble;
      iso?: ConstrainDouble;
      exposureTime?: ConstrainDouble;
      whiteBalanceMode?: string;
      colorTemperature?: ConstrainDouble;
      pointsOfInterest?: Array<{
        x: number;
        y: number;
      }>;
    }
  >;
}

interface WindowWithCameraAPIs extends Window {
  ImageCapture?: ImageCaptureConstructorLike;

  webkitAudioContext?: typeof AudioContext;

  mozCaptureStream?: (
    fps?: number
  ) => MediaStream;
}

const DEFAULT_RESOLUTION: CameraResolution = {
  width: 3840,
  height: 2160,
};

const SIMULATED_RESOLUTION: CameraResolution = {
  width: 1920,
  height: 1080,
};

const DEFAULT_FPS = 30;

const MIN_ZOOM = 1;

const DEFAULT_ZOOM = 1;

const MIME_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=h264,opus',
  'video/webm',
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4',
] as const;

const BITRATES: Record<
  RecordingBitrate,
  number
> = {
  low: 8_000_000,
  medium: 20_000_000,
  high: 40_000_000,
};

export class CameraService {
  private static instance: CameraService | null = null;

  private currentStream: MediaStream | null = null;
  private activeTrack: MediaStreamTrack | null = null;
  private audioTrack: MediaStreamTrack | null = null;

  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private audioSource: MediaStreamAudioSourceNode | null = null;

  private availableDevices: CameraDeviceInfo[] = [];

  private selectedFacing: CameraFacing =
    'environment';

  private zoomRatio = DEFAULT_ZOOM;

  private streamState: CameraStreamState =
    'idle';

  private permissionStatus: CameraPermissionStatus =
    'prompt';

  private lastErrorMessage: string | null = null;

  private isSimulatedStream = false;

  private simulatedCanvas: HTMLCanvasElement | null =
    null;

  private simulatedAnimTimer:
    | ReturnType<typeof setInterval>
    | null = null;

  private simulatedExposureBias = 0;

  private simulatedKelvin = 5500;

  private imageCaptureInstance:
    | ImageCaptureLike
    | null = null;

  private imageCaptureTrack:
    | MediaStreamTrack
    | null = null;

  /**
   * Generation token.
   *
   * Prevents an old asynchronous getUserMedia()
   * from replacing a newer camera stream.
   */
  private streamGeneration = 0;

  private startPromise: Promise<MediaStream> | null =
    null;

  private constructor() {}

  public static getInstance(): CameraService {
    if (!CameraService.instance) {
      CameraService.instance =
        new CameraService();
    }

    return CameraService.instance;
  }

  // ===========================================================================
  // STATE
  // ===========================================================================

  public getState(): CameraServiceState {
    return {
      streamState: this.streamState,

      permissionStatus:
        this.permissionStatus,

      facing: this.selectedFacing,

      zoomRatio: this.zoomRatio,

      hasVideoTrack:
        !!this.activeTrack &&
        this.activeTrack.readyState !== 'ended',

      hasAudioTrack:
        !!this.audioTrack &&
        this.audioTrack.readyState !== 'ended',

      isSimulated:
        this.isSimulatedStream,

      isRecording:
        this.isRecordingVideo(),

      lastErrorMessage:
        this.lastErrorMessage,
    };
  }

  public isSimulated(): boolean {
    return this.isSimulatedStream;
  }

  public getPermissionStatus(): CameraPermissionStatus {
    return this.permissionStatus;
  }

  public getLastErrorMessage(): string | null {
    return this.lastErrorMessage;
  }

  public getFacing(): CameraFacing {
    return this.selectedFacing;
  }

  public getActiveTrack(): MediaStreamTrack | null {
    return this.activeTrack;
  }

  public getVideoTrack(): MediaStreamTrack | null {
    return this.activeTrack;
  }

  public getCurrentStream(): MediaStream | null {
    return this.currentStream;
  }

  public isStreamActive(): boolean {
    return (
      !!this.currentStream &&
      !!this.activeTrack &&
      this.activeTrack.readyState === 'live'
    );
  }

  // ===========================================================================
  // DEVICE ENUMERATION
  // ===========================================================================

  public async getCameraDevices(): Promise<
    CameraDeviceInfo[]
  > {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices
        .enumerateDevices !== 'function'
    ) {
      this.availableDevices = [];
      return [];
    }

    try {
      const devices =
        await navigator.mediaDevices
          .enumerateDevices();

      const videoDevices =
        devices.filter(
          (device) =>
            device.kind === 'videoinput'
        );

      this.availableDevices =
        videoDevices.map(
          (device, index) => ({
            deviceId: device.deviceId,
            label:
              device.label ||
              this.createFallbackDeviceLabel(
                device.deviceId,
                index
              ),
            facing:
              this.detectFacing(
                device.label
              ),
          })
        );

      return [...this.availableDevices];
    } catch (error) {
      console.warn(
        '[CameraService] enumerateDevices failed:',
        error
      );

      return [];
    }
  }

  public getAvailableDevices(): CameraDeviceInfo[] {
    return [...this.availableDevices];
  }

  private createFallbackDeviceLabel(
    deviceId: string,
    index: number
  ): string {
    const suffix =
      deviceId.length > 0
        ? ` (${deviceId.slice(0, 6)})`
        : '';

    return `Cámara ${index + 1}${suffix}`;
  }

  private detectFacing(
    label: string
  ): CameraFacing {
    const normalized =
      label.toLowerCase();

    const frontKeywords = [
      'front',
      'facetime',
      'selfie',
      'user',
      'frontal',
      'delantera',
    ];

    return frontKeywords.some(
      (keyword) =>
        normalized.includes(keyword)
    )
      ? 'user'
      : 'environment';
  }

  // ===========================================================================
  // START STREAM
  // ===========================================================================

  public async startStream(
    facing: CameraFacing = 'environment',
    idealWidth = DEFAULT_RESOLUTION.width,
    idealHeight = DEFAULT_RESOLUTION.height,
    idealFps = DEFAULT_FPS
  ): Promise<MediaStream> {
    /*
     * If another start is already running, let the newest
     * call own the lifecycle.
     */
    const generation =
      ++this.streamGeneration;

    this.selectedFacing = facing;

    await this.stopStream();

    this.streamState = 'starting';
    this.lastErrorMessage = null;

    const normalizedWidth =
      this.sanitizePositiveNumber(
        idealWidth,
        DEFAULT_RESOLUTION.width
      );

    const normalizedHeight =
      this.sanitizePositiveNumber(
        idealHeight,
        DEFAULT_RESOLUTION.height
      );

    const normalizedFps =
      this.sanitizePositiveNumber(
        idealFps,
        DEFAULT_FPS
      );

    if (
      !this.isMediaDevicesAvailable()
    ) {
      return this.activateSimulation(
        'MediaDevices API no disponible.'
      );
    }

    /*
     * Avoid duplicate simultaneous getUserMedia()
     * operations.
     */
    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise =
      this.acquireHardwareStream(
        generation,
        facing,
        normalizedWidth,
        normalizedHeight,
        normalizedFps
      );

    try {
      return await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private async acquireHardwareStream(
    generation: number,
    facing: CameraFacing,
    width: number,
    height: number,
    fps: number
  ): Promise<MediaStream> {
    let stream: MediaStream | null = null;
    let lastError: unknown = null;

    /*
     * Strategy:
     *
     * 1. High quality + audio
     * 2. High quality video
     * 3. Standard facing
     * 4. Generic video
     */
    const attempts: MediaStreamConstraints[] = [
      {
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: true,
        },
        video: {
          facingMode: {
            ideal: facing,
          },
          width: {
            ideal: width,
            min: 1280,
          },
          height: {
            ideal: height,
            min: 720,
          },
          frameRate: {
            ideal: fps,
            min: Math.min(24, fps),
          },
        },
      },

      {
        video: {
          facingMode: {
            ideal: facing,
          },
          width: {
            ideal: width,
            min: 1280,
          },
          height: {
            ideal: height,
            min: 720,
          },
          frameRate: {
            ideal: fps,
            min: Math.min(24, fps),
          },
        },
      },

      {
        video: {
          facingMode: facing,
        },
      },

      {
        video: true,
      },
    ];

    for (
      let index = 0;
      index < attempts.length;
      index++
    ) {
      try {
        stream =
          await navigator.mediaDevices
            .getUserMedia(
              attempts[index]
            );

        if (
          !this.isCurrentGeneration(
            generation
          )
        ) {
          this.stopStreamTracks(stream);
          throw new DOMException(
            'Stale camera request',
            'AbortError'
          );
        }

        break;
      } catch (error) {
        lastError = error;

        console.warn(
          `[CameraService] getUserMedia attempt ${index + 1} failed:`,
          this.getErrorName(error)
        );
      }
    }

    if (!stream) {
      const permissionDenied =
        this.isPermissionDenied(lastError);

      this.permissionStatus =
        permissionDenied
          ? 'denied'
          : 'unavailable';

      this.lastErrorMessage =
        this.getErrorMessage(
          lastError
        ) ||
        'No fue posible acceder a la cámara.';

      return this.activateSimulation(
        this.lastErrorMessage
      );
    }

    /*
     * Configure hardware state.
     */
    this.isSimulatedStream = false;

    this.permissionStatus = 'granted';

    this.lastErrorMessage = null;

    this.currentStream = stream;

    this.activeTrack =
      stream.getVideoTracks()[0] ||
      null;

    this.audioTrack =
      stream.getAudioTracks()[0] ||
      null;

    if (!this.activeTrack) {
      this.stopStreamTracks(stream);

      return this.activateSimulation(
        'El dispositivo no proporcionó una pista de vídeo válida.'
      );
    }

    this.streamState = 'active';

    this.attachTrackLifecycle(
      this.activeTrack
    );

    if (this.audioTrack) {
      await this.initAudioAnalyser(
        stream
      );
    }

    await this.getCameraDevices();

    return stream;
  }

  public async requestHardwarePermission(
    facing: CameraFacing = 'environment',
    idealWidth = DEFAULT_RESOLUTION.width,
    idealHeight = DEFAULT_RESOLUTION.height,
    idealFps = DEFAULT_FPS
  ): Promise<MediaStream> {
    return this.startStream(
      facing,
      idealWidth,
      idealHeight,
      idealFps
    );
  }

  // ===========================================================================
  // SIMULATION
  // ===========================================================================

  private activateSimulation(
    reason: string
  ): MediaStream {
    this.permissionStatus =
      this.permissionStatus ===
      'denied'
        ? 'denied'
        : 'unavailable';

    this.lastErrorMessage = reason;

    this.isSimulatedStream = true;

    this.streamState = 'simulated';

    const stream =
      this.createSimulatedStream(
        SIMULATED_RESOLUTION.width,
        SIMULATED_RESOLUTION.height
      );

    this.currentStream = stream;

    this.activeTrack =
      stream.getVideoTracks()[0] ||
      null;

    this.audioTrack =
      stream.getAudioTracks()[0] ||
      null;

    return stream;
  }

  /**
   * Virtual ISP feed.
   *
   * IMPORTANT:
   * This is a software simulation and does not represent
   * a physical 108MP sensor.
   */
  private createSimulatedStream(
    width = 1920,
    height = 1080
  ): MediaStream {
    this.stopSimulationLoop();

    const canvas =
      document.createElement('canvas');

    canvas.width = width;
    canvas.height = height;

    this.simulatedCanvas = canvas;

    const ctx =
      canvas.getContext(
        '2d',
        {
          alpha: false,
          desynchronized: true,
        }
      );

    if (!ctx) {
      return new MediaStream();
    }

    let frameCount = 0;

    const renderFrame = (): void => {
      frameCount++;

      const time =
        frameCount / 30;

      const w = canvas.width;
      const h = canvas.height;

      const ev =
        Math.max(
          -4,
          Math.min(
            4,
            this.simulatedExposureBias
          )
        );

      const evFactor =
        Math.pow(2, ev);

      // -----------------------------------------------------------------------
      // SKY
      // -----------------------------------------------------------------------

      const skyR =
        Math.min(
          255,
          Math.round(
            10 * evFactor
          )
        );

      const skyG =
        Math.min(
          255,
          Math.round(
            14 * evFactor
          )
        );

      const skyB =
        Math.min(
          255,
          Math.round(
            28 * evFactor
          )
        );

      const skyGradient =
        ctx.createLinearGradient(
          0,
          0,
          0,
          h * 0.65
        );

      skyGradient.addColorStop(
        0,
        `rgb(${skyR},${skyG},${skyB})`
      );

      skyGradient.addColorStop(
        1,
        `rgb(${Math.round(
          skyR * 0.5
        )},${Math.round(
          skyG * 0.6
        )},${Math.round(
          skyB * 0.8
        )})`
      );

      ctx.fillStyle =
        skyGradient;

      ctx.fillRect(
        0,
        0,
        w,
        h
      );

      // -----------------------------------------------------------------------
      // STARS
      // -----------------------------------------------------------------------

      ctx.save();

      for (
        let s = 0;
        s < 35;
        s++
      ) {
        const sx =
          (s * 137.5) % w;

        const sy =
          (s * 93.3) %
          (h * 0.45);

        const twinkle =
          0.5 +
          0.5 *
            Math.sin(
              time * 2 + s
            );

        ctx.globalAlpha =
          twinkle * 0.6;

        ctx.fillStyle =
          '#ffffff';

        ctx.fillRect(
          sx,
          sy,
          1.5,
          1.5
        );
      }

      ctx.restore();

      // -----------------------------------------------------------------------
      // MOON
      // -----------------------------------------------------------------------

      const moonX =
        w * 0.78;

      const moonY =
        h * 0.18;

      const moonGlow =
        ctx.createRadialGradient(
          moonX,
          moonY,
          4,
          moonX,
          moonY,
          60
        );

      const moonIntensity =
        Math.min(
          1.5,
          evFactor
        );

      moonGlow.addColorStop(
        0,
        `rgba(255,248,220,${
          0.9 * moonIntensity
        })`
      );

      moonGlow.addColorStop(
        0.3,
        `rgba(255,240,190,${
          0.4 * moonIntensity
        })`
      );

      moonGlow.addColorStop(
        1,
        'rgba(255,240,190,0)'
      );

      ctx.fillStyle =
        moonGlow;

      ctx.beginPath();

      ctx.arc(
        moonX,
        moonY,
        60,
        0,
        Math.PI * 2
      );

      ctx.fill();

      ctx.fillStyle =
        '#FFF8DC';

      ctx.beginPath();

      ctx.arc(
        moonX,
        moonY,
        14,
        0,
        Math.PI * 2
      );

      ctx.fill();

      // -----------------------------------------------------------------------
      // SCENE
      // -----------------------------------------------------------------------

      if (
        this.selectedFacing ===
        'environment'
      ) {
        this.renderRearSimulation(
          ctx,
          w,
          h,
          evFactor,
          time
        );
      } else {
        this.renderFrontSimulation(
          ctx,
          w,
          h,
          evFactor
        );
      }

      // -----------------------------------------------------------------------
      // HUD
      // -----------------------------------------------------------------------

      this.renderSimulationHud(
        ctx,
        w,
        h
      );
    };

    renderFrame();

    this.simulatedAnimTimer =
      setInterval(
        renderFrame,
        33
      );

    const canvasWithCapture =
      canvas as HTMLCanvasElement & {
        captureStream?: (
          fps?: number
        ) => MediaStream;

        mozCaptureStream?: (
          fps?: number
        ) => MediaStream;
      };

    if (
      typeof canvasWithCapture
        .captureStream ===
      'function'
    ) {
      return canvasWithCapture
        .captureStream(30);
    }

    if (
      typeof canvasWithCapture
        .mozCaptureStream ===
      'function'
    ) {
      return canvasWithCapture
        .mozCaptureStream(30);
    }

    console.warn(
      '[CameraService] Canvas captureStream unavailable.'
    );

    return new MediaStream();
  }

  private renderRearSimulation(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    evFactor: number,
    time: number
  ): void {
    // -------------------------------------------------------------------------
    // CITY
    // -------------------------------------------------------------------------

    ctx.fillStyle =
      '#080c14';

    const buildings = 14;

    const buildingWidth =
      w / buildings;

    for (
      let b = 0;
      b < buildings;
      b++
    ) {
      const buildingHeight =
        120 +
        Math.sin(b * 1.8) * 60 +
        (b % 3) * 40;

      const x =
        b * buildingWidth;

      const y =
        h * 0.55 -
        buildingHeight;

      ctx.fillRect(
        x,
        y,
        buildingWidth + 2,
        buildingHeight + 100
      );

      for (
        let wy = 0;
        wy < 6;
        wy++
      ) {
        for (
          let wx = 0;
          wx < 3;
          wx++
        ) {
          if (
            (b + wy + wx) % 3 !==
            0
          ) {
            continue;
          }

          const intensity =
            Math.min(
              255,
              Math.round(
                230 * evFactor
              )
            );

          ctx.fillStyle =
            `rgba(${intensity},${Math.round(
              intensity * 0.85
            )},120,0.85)`;

          ctx.fillRect(
            x +
              8 +
              wx * 14,
            y +
              16 +
              wy * 18,
            7,
            10
          );
        }
      }

      ctx.fillStyle =
        '#080c14';
    }

    // -------------------------------------------------------------------------
    // GROUND
    // -------------------------------------------------------------------------

    const groundGradient =
      ctx.createLinearGradient(
        0,
        h * 0.65,
        0,
        h
      );

    groundGradient.addColorStop(
      0,
      '#0c1017'
    );

    groundGradient.addColorStop(
      1,
      '#05070a'
    );

    ctx.fillStyle =
      groundGradient;

    ctx.fillRect(
      0,
      h * 0.65,
      w,
      h * 0.35
    );

    // -------------------------------------------------------------------------
    // ARCHITECTURAL COLUMN
    // -------------------------------------------------------------------------

    ctx.fillStyle =
      '#181f2a';

    ctx.fillRect(
      w * 0.05,
      h * 0.42,
      w * 0.16,
      h * 0.58
    );

    ctx.strokeStyle =
      'rgba(255,255,255,0.06)';

    ctx.lineWidth = 1;

    for (
      let y = h * 0.44;
      y < h;
      y += 16
    ) {
      ctx.beginPath();

      ctx.moveTo(
        w * 0.05,
        y
      );

      ctx.lineTo(
        w * 0.21,
        y
      );

      ctx.stroke();
    }

    // -------------------------------------------------------------------------
    // FOLIAGE
    // -------------------------------------------------------------------------

    ctx.fillStyle =
      '#0e2316';

    ctx.beginPath();

    ctx.arc(
      w * 0.82,
      h * 0.74,
      95,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.fillStyle =
      '#153622';

    ctx.beginPath();

    ctx.arc(
      w * 0.88,
      h * 0.70,
      75,
      0,
      Math.PI * 2
    );

    ctx.fill();

    // -------------------------------------------------------------------------
    // FLOWERS
    // -------------------------------------------------------------------------

    ctx.fillStyle =
      '#e82572';

    for (
      let fl = 0;
      fl < 7;
      fl++
    ) {
      const fx =
        w * 0.78 +
        ((fl * 26) % 110);

      const fy =
        h * 0.68 +
        ((fl * 19) % 80);

      ctx.beginPath();

      ctx.arc(
        fx,
        fy,
        4.5,
        0,
        Math.PI * 2
      );

      ctx.fill();
    }

    // -------------------------------------------------------------------------
    // LAMP
    // -------------------------------------------------------------------------

    const lampX =
      w * 0.48;

    const lampY =
      h * 0.58;

    ctx.strokeStyle =
      '#282828';

    ctx.lineWidth = 4;

    ctx.beginPath();

    ctx.moveTo(
      lampX,
      h * 0.85
    );

    ctx.lineTo(
      lampX,
      lampY
    );

    ctx.stroke();

    ctx.fillStyle =
      '#444';

    ctx.fillRect(
      lampX - 10,
      lampY - 14,
      20,
      14
    );

    const lampGlow =
      ctx.createRadialGradient(
        lampX,
        lampY,
        2,
        lampX,
        lampY,
        90
      );

    lampGlow.addColorStop(
      0,
      `rgba(255,220,130,${
        Math.min(
          1,
          0.9 * evFactor
        )
      })`
    );

    lampGlow.addColorStop(
      0.35,
      `rgba(255,180,70,${
        Math.min(
          0.7,
          0.45 * evFactor
        )
      })`
    );

    lampGlow.addColorStop(
      1,
      'rgba(255,180,70,0)'
    );

    ctx.fillStyle =
      lampGlow;

    ctx.beginPath();

    ctx.arc(
      lampX,
      lampY,
      90,
      0,
      Math.PI * 2
    );

    ctx.fill();

    // -------------------------------------------------------------------------
    // RESOLUTION TARGET
    // -------------------------------------------------------------------------

    const chartX =
      w * 0.13;

    const chartY =
      h * 0.70;

    ctx.save();

    ctx.translate(
      chartX,
      chartY
    );

    ctx.fillStyle =
      '#0a0d14';

    ctx.fillRect(
      -35,
      -35,
      70,
      70
    );

    ctx.strokeStyle =
      '#FF9500';

    ctx.lineWidth = 1.5;

    ctx.strokeRect(
      -35,
      -35,
      70,
      70
    );

    for (
      let r = 5;
      r <= 30;
      r += 6
    ) {
      ctx.strokeStyle =
        r % 12 === 0
          ? '#FFFFFF'
          : '#666';

      ctx.beginPath();

      ctx.arc(
        0,
        0,
        r,
        0,
        Math.PI * 2
      );

      ctx.stroke();
    }

    ctx.restore();

    // -------------------------------------------------------------------------
    // ANTENNA
    // -------------------------------------------------------------------------

    const antennaX =
      w * 0.28;

    const antennaY =
      h * 0.28;

    ctx.strokeStyle =
      '#222';

    ctx.lineWidth = 2;

    ctx.beginPath();

    ctx.moveTo(
      antennaX,
      h * 0.45
    );

    ctx.lineTo(
      antennaX,
      antennaY
    );

    ctx.stroke();

    const beacon =
      (Math.sin(time * 4) + 1) *
        0.5 >
      0.6;

    ctx.fillStyle =
      beacon
        ? '#FF3B30'
        : 'rgba(100,0,0,0.4)';

    ctx.beginPath();

    ctx.arc(
      antennaX,
      antennaY,
      3,
      0,
      Math.PI * 2
    );

    ctx.fill();
  }

  private renderFrontSimulation(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    evFactor: number
  ): void {
    // Background bokeh.
    for (
      let b = 0;
      b < 12;
      b++
    ) {
      const bx =
        (b * 163.7) % w;

      const by =
        (b * 97.1) %
        (h * 0.7);

      const size =
        35 +
        (b % 4) * 20;

      ctx.fillStyle =
        b % 2 === 0
          ? 'rgba(255,149,0,0.12)'
          : 'rgba(0,122,255,0.10)';

      ctx.beginPath();

      ctx.arc(
        bx,
        by,
        size,
        0,
        Math.PI * 2
      );

      ctx.fill();
    }

    const centerX =
      w * 0.5;

    const centerY =
      h * 0.52;

    const rim =
      ctx.createRadialGradient(
        centerX,
        centerY - 40,
        40,
        centerX,
        centerY - 40,
        220
      );

    rim.addColorStop(
      0,
      `rgba(255,230,200,${
        0.4 * evFactor
      })`
    );

    rim.addColorStop(
      1,
      'rgba(0,0,0,0)'
    );

    ctx.fillStyle =
      rim;

    ctx.beginPath();

    ctx.arc(
      centerX,
      centerY - 40,
      220,
      0,
      Math.PI * 2
    );

    ctx.fill();

    // Head.
    ctx.fillStyle =
      '#161922';

    ctx.beginPath();

    ctx.arc(
      centerX,
      centerY - 60,
      95,
      0,
      Math.PI * 2
    );

    ctx.fill();

    // Shoulders.
    ctx.beginPath();

    ctx.ellipse(
      centerX,
      centerY + 120,
      220,
      110,
      0,
      0,
      Math.PI * 2
    );

    ctx.fill();
  }

  private renderSimulationHud(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ): void {
    const x = w * 0.04;
    const y = h * 0.04;

    ctx.save();

    ctx.fillStyle =
      'rgba(0,0,0,0.6)';

    ctx.fillRect(
      x,
      y,
      380,
      42
    );

    ctx.strokeStyle =
      '#FF9500';

    ctx.lineWidth = 1;

    ctx.strokeRect(
      x,
      y,
      380,
      42
    );

    ctx.fillStyle =
      '#FF9500';

    ctx.font =
      'bold 12px monospace';

    ctx.fillText(
      'VIRTUAL ISP • 108MP SIMULATION',
      x + 14,
      y + 18
    );

    ctx.fillStyle =
      'rgba(255,255,255,0.7)';

    ctx.font =
      '10px monospace';

    const ev =
      this.simulatedExposureBias >=
      0
        ? `+${this.simulatedExposureBias.toFixed(
            1
          )}`
        : this.simulatedExposureBias.toFixed(
            1
          );

    const time =
      new Date()
        .toISOString()
        .substring(11, 19);

    ctx.fillText(
      `LIVE 30FPS • ZOOM ${this.zoomRatio.toFixed(
        1
      )}x • EV ${ev} • ${time}`,
      x + 14,
      y + 33
    );

    ctx.restore();
  }

  // ===========================================================================
  // AUDIO
  // ===========================================================================

  private async initAudioAnalyser(
    stream: MediaStream
  ): Promise<void> {
    this.disposeAudioAnalyser();

    try {
      const win =
        window as WindowWithCameraAPIs;

      const AudioContextConstructor =
        window.AudioContext ||
        win.webkitAudioContext;

      if (!AudioContextConstructor) {
        return;
      }

      const context =
        new AudioContextConstructor();

      this.audioContext = context;

      this.audioSource =
        context.createMediaStreamSource(
          stream
        );

      this.analyser =
        context.createAnalyser();

      this.analyser.fftSize = 64;

      this.analyser.smoothingTimeConstant =
        0.65;

      this.audioSource.connect(
        this.analyser
      );

      if (
        context.state ===
        'suspended'
      ) {
        try {
          await context.resume();
        } catch {
          // Browser may require a user gesture.
        }
      }
    } catch (error) {
      console.warn(
        '[CameraService] Audio analyser unavailable:',
        error
      );

      this.disposeAudioAnalyser();
    }
  }

  public getAudioLevel(): number {
    if (!this.analyser) {
      return 0;
    }

    const data =
      new Uint8Array(
        this.analyser.frequencyBinCount
      );

    this.analyser.getByteFrequencyData(
      data
    );

    if (data.length === 0) {
      return 0;
    }

    let sum = 0;

    for (
      let i = 0;
      i < data.length;
      i++
    ) {
      sum += data[i];
    }

    const average =
      sum / data.length;

    return Math.round(
      Math.min(
        100,
        (average / 255) * 100
      )
    );
  }

  // ===========================================================================
  // HARDWARE CAPABILITIES
  // ===========================================================================

  public getTrackCapabilities(
    track: MediaStreamTrack | null =
      this.activeTrack
  ): CameraHardwareCapabilities {
    if (
      !this.isUsableVideoTrack(track)
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

      return track.getCapabilities() as CameraHardwareCapabilities;
    } catch {
      return {};
    }
  }

  public getTrackSettings(
    track: MediaStreamTrack | null =
      this.activeTrack
  ): MediaTrackSettings | null {
    if (
      !this.isUsableVideoTrack(track)
    ) {
      return null;
    }

    try {
      return track.getSettings();
    } catch {
      return null;
    }
  }

  public supports(
    capability: keyof CameraHardwareCapabilities
  ): boolean {
    const capabilities =
      this.getTrackCapabilities();

    return (
      capabilities[capability] !==
      undefined
    );
  }

  // ===========================================================================
  // ZOOM
  // ===========================================================================

  public getZoom(): number {
    return this.zoomRatio;
  }

  public async setZoom(
    zoom: number
  ): Promise<boolean> {
    const normalized =
      this.sanitizePositiveNumber(
        zoom,
        DEFAULT_ZOOM
      );

    /*
     * Always keep simulation state synchronized.
     */
    this.zoomRatio =
      normalized;

    if (
      !this.activeTrack ||
      this.isSimulatedStream
    ) {
      return this.isSimulatedStream;
    }

    const capabilities =
      this.getTrackCapabilities();

    if (!capabilities.zoom) {
      return false;
    }

    const min =
      capabilities.zoom.min ??
      MIN_ZOOM;

    const max =
      capabilities.zoom.max ??
      10;

    const clamped =
      this.clamp(
        normalized,
        min,
        max
      );

    try {
      await this.applyAdvancedConstraint(
        this.activeTrack,
        {
          zoom: clamped,
        }
      );

      this.zoomRatio =
        clamped;

      return true;
    } catch (error) {
      console.warn(
        '[CameraService] Zoom failed:',
        error
      );

      return false;
    }
  }

  // ===========================================================================
  // FOCUS
  // ===========================================================================

  public async setFocusMode(
    mode: 'continuous' | 'manual',
    distance?: number
  ): Promise<boolean> {
    if (
      !this.activeTrack ||
      this.isSimulatedStream
    ) {
      return this.isSimulatedStream;
    }

    const caps =
      this.getTrackCapabilities();

    if (
      !caps.focusMode?.includes(mode)
    ) {
      return false;
    }

    const advanced: NonNullable<
      ExtendedVideoConstraints['advanced']
    >[number] = {
      focusMode: mode,
    };

    if (
      mode === 'manual' &&
      typeof distance === 'number' &&
      caps.focusDistance
    ) {
      advanced.focusDistance =
        this.clamp(
          distance,
          caps.focusDistance.min ??
            0,
          caps.focusDistance.max ??
            distance
        );
    }

    try {
      await this.applyAdvancedConstraint(
        this.activeTrack,
        advanced
      );

      return true;
    } catch (error) {
      console.warn(
        '[CameraService] Focus mode failed:',
        error
      );

      return false;
    }
  }

  public async applyFocusPoint(
    xPct: number,
    yPct: number
  ): Promise<boolean> {
    if (
      !this.activeTrack ||
      this.isSimulatedStream
    ) {
      return this.isSimulatedStream;
    }

    const caps =
      this.getTrackCapabilities();

    if (
      !caps.focusMode?.includes(
        'continuous'
      )
    ) {
      return false;
    }

    const x =
      this.clamp(
        xPct / 100,
        0,
        1
      );

    const y =
      this.clamp(
        yPct / 100,
        0,
        1
      );

    try {
      await this.applyAdvancedConstraint(
        this.activeTrack,
        {
          focusMode: 'continuous',
          pointsOfInterest: [
            {
              x,
              y,
            },
          ],
        }
      );

      return true;
    } catch (error) {
      console.warn(
        '[CameraService] Focus point failed:',
        error
      );

      return false;
    }
  }

  // ===========================================================================
  // TORCH
  // ===========================================================================

  public async setTorch(
    enabled: boolean
  ): Promise<boolean> {
    if (
      !this.activeTrack ||
      this.isSimulatedStream
    ) {
      return this.isSimulatedStream;
    }

    const caps =
      this.getTrackCapabilities();

    if (!caps.torch) {
      return false;
    }

    try {
      await this.applyAdvancedConstraint(
        this.activeTrack,
        {
          torch: enabled,
        }
      );

      return true;
    } catch (error) {
      console.warn(
        '[CameraService] Torch failed:',
        error
      );

      return false;
    }
  }

  // ===========================================================================
  // EXPOSURE
  // ===========================================================================

  public async applyExposureBias(
    bias: number
  ): Promise<boolean> {
    this.simulatedExposureBias =
      this.clamp(
        Number.isFinite(bias)
          ? bias
          : 0,
        -4,
        4
      );

    if (
      !this.activeTrack ||
      this.isSimulatedStream
    ) {
      return this.isSimulatedStream;
    }

    const caps =
      this.getTrackCapabilities();

    if (
      !caps.exposureCompensation
    ) {
      return false;
    }

    const min =
      caps.exposureCompensation.min ??
      -3;

    const max =
      caps.exposureCompensation.max ??
      3;

    const value =
      this.clamp(
        bias,
        min,
        max
      );

    try {
      await this.applyAdvancedConstraint(
        this.activeTrack,
        {
          exposureCompensation:
            value,
        }
      );

      return true;
    } catch (error) {
      console.warn(
        '[CameraService] Exposure compensation failed:',
        error
      );

      return false;
    }
  }

  // ===========================================================================
  // ISO
  // ===========================================================================

  public async setISO(
    iso: number | 'auto'
  ): Promise<boolean> {
    if (
      !this.activeTrack ||
      this.isSimulatedStream
    ) {
      return this.isSimulatedStream;
    }

    const caps =
      this.getTrackCapabilities();

    if (!caps.iso) {
      return false;
    }

    const advanced: NonNullable<
      ExtendedVideoConstraints['advanced']
    >[number] = {};

    if (iso === 'auto') {
      if (
        caps.exposureMode?.includes(
          'continuous'
        )
      ) {
        advanced.exposureMode =
          'continuous';
      } else {
        return false;
      }
    } else {
      const min =
        caps.iso.min ?? 50;

      const max =
        caps.iso.max ?? 6400;

      advanced.exposureMode =
        'manual';

      advanced.iso =
        this.clamp(
          iso,
          min,
          max
        );
    }

    try {
      await this.applyAdvancedConstraint(
        this.activeTrack,
        advanced
      );

      return true;
    } catch (error) {
      console.warn(
        '[CameraService] ISO failed:',
        error
      );

      return false;
    }
  }

  // ===========================================================================
  // SHUTTER
  // ===========================================================================

  public async setShutterSpeed(
    speed: number | 'auto'
  ): Promise<boolean> {
    if (
      !this.activeTrack ||
      this.isSimulatedStream
    ) {
      return this.isSimulatedStream;
    }

    const caps =
      this.getTrackCapabilities();

    if (!caps.exposureTime) {
      return false;
    }

    const advanced: NonNullable<
      ExtendedVideoConstraints['advanced']
    >[number] = {};

    if (speed === 'auto') {
      if (
        caps.exposureMode?.includes(
          'continuous'
        )
      ) {
        advanced.exposureMode =
          'continuous';
      } else {
        return false;
      }
    } else {
      const min =
        caps.exposureTime.min ??
        0.0001;

      const max =
        caps.exposureTime.max ??
        30;

      advanced.exposureMode =
        'manual';

      advanced.exposureTime =
        this.clamp(
          speed,
          min,
          max
        );
    }

    try {
      await this.applyAdvancedConstraint(
        this.activeTrack,
        advanced
      );

      return true;
    } catch (error) {
      console.warn(
        '[CameraService] Shutter failed:',
        error
      );

      return false;
    }
  }

  // ===========================================================================
  // WHITE BALANCE
  // ===========================================================================

  public async setWhiteBalance(
    kelvin: number
  ): Promise<boolean> {
    this.simulatedKelvin =
      this.clamp(
        Number.isFinite(kelvin)
          ? kelvin
          : 5500,
        1000,
        20000
      );

    if (
      !this.activeTrack ||
      this.isSimulatedStream
    ) {
      return this.isSimulatedStream;
    }

    const caps =
      this.getTrackCapabilities();

    if (
      !caps.colorTemperature
    ) {
      return false;
    }

    const min =
      caps.colorTemperature.min ??
      2800;

    const max =
      caps.colorTemperature.max ??
      7500;

    const temperature =
      this.clamp(
        kelvin,
        min,
        max
      );

    const advanced: NonNullable<
      ExtendedVideoConstraints['advanced']
    >[number] = {
      colorTemperature:
        temperature,
    };

    if (
      caps.whiteBalanceMode?.includes(
        'manual'
      )
    ) {
      advanced.whiteBalanceMode =
        'manual';
    }

    try {
      await this.applyAdvancedConstraint(
        this.activeTrack,
        advanced
      );

      return true;
    } catch (error) {
      console.warn(
        '[CameraService] White balance failed:',
        error
      );

      return false;
    }
  }

  // ===========================================================================
  // MANUAL SETTINGS
  // ===========================================================================

  public async applyManualSettings(
    settings: ManualCameraSettings
  ): Promise<void> {
    /*
     * Run sequentially.
     *
     * This is slightly slower than Promise.all(),
     * but much safer with camera drivers because some
     * WebView implementations serialize constraints poorly.
     */
    await this.applyExposureBias(
      settings.evBias
    );

    await this.setISO(
      settings.iso
    );

    await this.setShutterSpeed(
      settings.shutterSpeed
    );

    await this.setWhiteBalance(
      settings.kelvin
    );
  }

  // ===========================================================================
  // VIDEO RECORDING
  // ===========================================================================

  public startVideoRecording(
    onDataAvailable?: (
      blob: Blob
    ) => void,
    fps = 30,
    bitrate: RecordingBitrate = 'high'
  ): boolean {
    if (
      !this.currentStream ||
      !this.isStreamActive()
    ) {
      return false;
    }

    if (
      this.isRecordingVideo()
    ) {
      return false;
    }

    if (
      typeof MediaRecorder ===
      'undefined'
    ) {
      console.warn(
        '[CameraService] MediaRecorder unavailable.'
      );

      return false;
    }

    this.recordedChunks = [];

    const mimeType =
      this.getSupportedRecordingMimeType();

    const bitsPerSecond =
      BITRATES[bitrate];

    try {
      const options: MediaRecorderOptions =
        {
          videoBitsPerSecond:
            bitsPerSecond,
        };

      if (mimeType) {
        options.mimeType =
          mimeType;
      }

      this.mediaRecorder =
        new MediaRecorder(
          this.currentStream,
          options
        );

      const recorder =
        this.mediaRecorder;

      recorder.ondataavailable = (
        event: BlobEvent
      ) => {
        if (
          event.data &&
          event.data.size > 0
        ) {
          this.recordedChunks.push(
            event.data
          );

          onDataAvailable?.(
            event.data
          );
        }
      };

      recorder.onerror = (
        event
      ) => {
        console.warn(
          '[CameraService] MediaRecorder error:',
          event
        );
      };

      /*
       * 1 second timeslice gives a reasonable
       * balance between latency and memory pressure.
       */
      recorder.start(
        Math.max(
          250,
          Math.round(
            1000 /
              Math.max(
                1,
                fps / 30
              )
          )
        )
      );

      return true;
    } catch (error) {
      console.warn(
        '[CameraService] Failed to start recording:',
        error
      );

      this.mediaRecorder = null;
      this.recordedChunks = [];

      return false;
    }
  }

  public async stopVideoRecording(): Promise<
    Blob | null
  > {
    const recorder =
      this.mediaRecorder;

    if (
      !recorder ||
      recorder.state ===
        'inactive'
    ) {
      this.mediaRecorder =
        null;

      this.recordedChunks =
        [];

      return null;
    }

    return new Promise(
      (resolve) => {
        let settled = false;

        const finish = (): void => {
          if (settled) {
            return;
          }

          settled = true;

          const mime =
            recorder.mimeType ||
            'video/webm';

          const chunks =
            this.recordedChunks;

          this.recordedChunks =
            [];

          this.mediaRecorder =
            null;

          if (
            chunks.length === 0
          ) {
            resolve(null);
            return;
          }

          const blob =
            new Blob(
              chunks,
              {
                type: mime,
              }
            );

          resolve(
            blob.size > 0
              ? blob
              : null
          );
        };

        recorder.addEventListener(
          'stop',
          finish,
          {
            once: true,
          }
        );

        recorder.addEventListener(
          'error',
          finish,
          {
            once: true,
          }
        );

        try {
          recorder.stop();
        } catch {
          finish();
        }
      }
    );
  }

  public isRecordingVideo(): boolean {
    return (
      !!this.mediaRecorder &&
      this.mediaRecorder.state ===
        'recording'
    );
  }

  private getSupportedRecordingMimeType(): string {
    if (
      typeof MediaRecorder ===
      'undefined' ||
      typeof MediaRecorder
        .isTypeSupported !==
        'function'
    ) {
      return '';
    }

    for (
      const mime of MIME_TYPES
    ) {
      try {
        if (
          MediaRecorder.isTypeSupported(
            mime
          )
        ) {
          return mime;
        }
      } catch {
        // Ignore unsupported MIME.
      }
    }

    return '';
  }

  // ===========================================================================
  // NATIVE PHOTO
  // ===========================================================================

  public async takeNativePhoto(
    width = 4000,
    height = 3000
  ): Promise<NativePhotoResult | null> {
    if (
      !this.activeTrack ||
      !this.isUsableVideoTrack(
        this.activeTrack
      )
    ) {
      return null;
    }

    if (
      typeof window === 'undefined'
    ) {
      return null;
    }

    const win =
      window as WindowWithCameraAPIs;

    const ImageCaptureConstructor =
      win.ImageCapture;

    if (
      typeof ImageCaptureConstructor !==
      'function'
    ) {
      return null;
    }

    try {
      /*
       * Reuse ImageCapture when possible.
       */
      if (
        !this.imageCaptureInstance ||
        this.imageCaptureTrack !==
          this.activeTrack
      ) {
        this.imageCaptureInstance =
          new ImageCaptureConstructor(
            this.activeTrack
          );

        this.imageCaptureTrack =
          this.activeTrack;
      }

      if (
        !this.imageCaptureInstance
      ) {
        return null;
      }

      const capabilities =
        this.getTrackCapabilities(
          this.activeTrack
        );

      const requested =
        this.resolveNativePhotoSize(
          width,
          height,
          capabilities
        );

      const blob =
        await this.imageCaptureInstance
          .takePhoto({
            imageWidth:
              requested.width,
            imageHeight:
              requested.height,
          });

      if (
        !blob ||
        blob.size <= 0
      ) {
        return null;
      }

      const dataUrl =
        await this.blobToDataUrl(
          blob
        );

      const dimensions =
        await this.getImageDimensions(
          dataUrl
        );

      return {
        dataUrl,
        width:
          dimensions.width ||
          requested.width,
        height:
          dimensions.height ||
          requested.height,
        isNative: true,
        blob,
      };
    } catch (error) {
      console.warn(
        '[CameraService] Native ImageCapture failed:',
        error
      );

      this.invalidateImageCapture();

      return null;
    }
  }

  private resolveNativePhotoSize(
    width: number,
    height: number,
    capabilities: CameraHardwareCapabilities
  ): CameraResolution {
    let resolvedWidth =
      this.sanitizePositiveNumber(
        width,
        4000
      );

    let resolvedHeight =
      this.sanitizePositiveNumber(
        height,
        3000
      );

    if (
      capabilities.width?.max
    ) {
      resolvedWidth =
        Math.min(
          resolvedWidth,
          capabilities.width.max
        );
    }

    if (
      capabilities.height?.max
    ) {
      resolvedHeight =
        Math.min(
          resolvedHeight,
          capabilities.height.max
        );
    }

    return {
      width: Math.max(
        1,
        Math.round(
          resolvedWidth
        )
      ),
      height: Math.max(
        1,
        Math.round(
          resolvedHeight
        )
      ),
    };
  }

  private async blobToDataUrl(
    blob: Blob
  ): Promise<string> {
    return new Promise(
      (
        resolve,
        reject
      ) => {
        const reader =
          new FileReader();

        reader.onload =
          () => {
            if (
              typeof reader.result ===
              'string'
            ) {
              resolve(
                reader.result
              );
            } else {
              reject(
                new Error(
                  'Invalid FileReader result'
                )
              );
            }
          };

        reader.onerror =
          () =>
            reject(
              reader.error ||
                new Error(
                  'FileReader failed'
                )
            );

        reader.readAsDataURL(
          blob
        );
      }
    );
  }

  private async getImageDimensions(
    dataUrl: string
  ): Promise<CameraResolution> {
    return new Promise(
      (resolve) => {
        const image =
          new Image();

        image.onload =
          () => {
            resolve({
              width:
                image.naturalWidth,
              height:
                image.naturalHeight,
            });
          };

        image.onerror =
          () => {
            resolve({
              width: 0,
              height: 0,
            });
          };

        image.src = dataUrl;
      }
    );
  }

  // ===========================================================================
  // CONSTRAINT ENGINE
  // ===========================================================================

  private async applyAdvancedConstraint(
    track: MediaStreamTrack,
    constraint: NonNullable<
      ExtendedVideoConstraints['advanced']
    >[number]
  ): Promise<void> {
    if (
      typeof track.applyConstraints !==
      'function'
    ) {
      throw new Error(
        'MediaTrackConstraints unavailable'
      );
    }

    const constraints: ExtendedVideoConstraints =
      {
        advanced: [
          constraint,
        ],
      };

    await track.applyConstraints(
      constraints
    );
  }

  // ===========================================================================
  // STREAM LIFECYCLE
  // ===========================================================================

  public async stopStream(): Promise<void> {
    this.streamState =
      this.currentStream
        ? 'stopping'
        : 'idle';

    /*
     * Invalidate pending asynchronous starts.
     */
    this.streamGeneration++;

    this.stopSimulationLoop();

    await this.stopVideoRecording();

    this.invalidateImageCapture();

    if (this.currentStream) {
      this.stopStreamTracks(
        this.currentStream
      );
    }

    this.currentStream =
      null;

    this.activeTrack =
      null;

    this.audioTrack =
      null;

    this.disposeAudioAnalyser();

    this.simulatedCanvas =
      null;

    this.isSimulatedStream =
      false;

    this.streamState =
      'idle';
  }

  private stopStreamTracks(
    stream: MediaStream
  ): void {
    for (
      const track of stream.getTracks()
    ) {
      try {
        track.stop();
      } catch {
        // Ignore already stopped tracks.
      }
    }
  }

  private stopSimulationLoop(): void {
    if (
      this.simulatedAnimTimer
    ) {
      clearInterval(
        this.simulatedAnimTimer
      );

      this.simulatedAnimTimer =
        null;
    }
  }

  private disposeAudioAnalyser(): void {
    try {
      this.audioSource?.disconnect();
    } catch {
      // Ignore.
    }

    this.audioSource = null;
    this.analyser = null;

    if (
      this.audioContext &&
      this.audioContext.state !==
        'closed'
    ) {
      void this.audioContext
        .close()
        .catch(() => {});
    }

    this.audioContext =
      null;
  }

  private invalidateImageCapture(): void {
    this.imageCaptureInstance =
      null;

    this.imageCaptureTrack =
      null;
  }

  public disposeImageCapture(): void {
    this.invalidateImageCapture();
  }

  // ===========================================================================
  // TRACK LIFECYCLE
  // ===========================================================================

  private attachTrackLifecycle(
    track: MediaStreamTrack
  ): void {
    track.addEventListener(
      'ended',
      () => {
        if (
          this.activeTrack ===
          track
        ) {
          this.invalidateImageCapture();

          if (
            !this.isSimulatedStream
          ) {
            this.streamState =
              'error';
          }
        }
      },
      {
        once: true,
      }
    );

    track.addEventListener(
      'mute',
      () => {
        // Intentionally no state change.
        // Temporary mute can occur on mobile camera pipelines.
      }
    );
  }

  // ===========================================================================
  // VALIDATION
  // ===========================================================================

  private isMediaDevicesAvailable(): boolean {
    return (
      typeof navigator !==
        'undefined' &&
      !!navigator.mediaDevices &&
      typeof navigator
        .mediaDevices
        .getUserMedia ===
        'function'
    );
  }

  private isUsableVideoTrack(
    track: MediaStreamTrack | null
  ): track is MediaStreamTrack {
    return (
      !!track &&
      track.kind === 'video' &&
      track.readyState !== 'ended'
    );
  }

  private isCurrentGeneration(
    generation: number
  ): boolean {
    return (
      generation ===
      this.streamGeneration
    );
  }

  private isPermissionDenied(
    error: unknown
  ): boolean {
    const name =
      this.getErrorName(error);

    if (
      name === 'NotAllowedError' ||
      name ===
        'PermissionDeniedError'
    ) {
      return true;
    }

    const message =
      this.getErrorMessage(
        error
      ).toLowerCase();

    return (
      message.includes(
        'permission'
      ) ||
      message.includes(
        'denied'
      ) ||
      message.includes(
        'not allowed'
      )
    );
  }

  private getErrorName(
    error: unknown
  ): string {
    if (
      typeof error === 'object' &&
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

  private getErrorMessage(
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
      return error.message;
    }

    if (
      typeof error === 'object' &&
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

  // ===========================================================================
  // UTILITY
  // ===========================================================================

  private sanitizePositiveNumber(
    value: number,
    fallback: number
  ): number {
    return Number.isFinite(
      value
    ) && value > 0
      ? value
      : fallback;
  }

  private clamp(
    value: number,
    min: number,
    max: number
  ): number {
    return Math.min(
      max,
      Math.max(min, value)
    );
  }
}
