import { ThermalState } from '../types';

export type ThermalStatus =
  | 'NORMAL'
  | 'WARM'
  | 'THROTTLING'
  | 'CRITICAL';

export interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

export interface BatteryManager extends EventTarget {
  level: number;
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
  addEventListener(
    type: 'levelchange' | 'chargingchange',
    listener: EventListenerOrEventListenerObject
  ): void;
  removeEventListener(
    type: 'levelchange' | 'chargingchange',
    listener: EventListenerOrEventListenerObject
  ): void;
}

export interface NavigatorWithBattery extends Navigator {
  getBattery?: () => Promise<BatteryManager>;
}

export interface ThermalThresholds {
  warmC: number;
  throttlingC: number;
  criticalC: number;
  recoveryC: number;
}

export interface ThermalSnapshot {
  temperatureC: number;
  status: ThermalStatus;
  cpuLoadPercent: number;
  memoryUsageMb: number;
  fps: number;
  batteryLevelPercent: number;
  isCharging: boolean;
}

export class ThermalManager {
  private static instance: ThermalManager | null = null;

  // ---------------------------------------------------------------------------
  // Thermal model
  // ---------------------------------------------------------------------------

  private temperatureC = 32.5;

  private readonly thresholds: ThermalThresholds = {
    warmC: 37,
    throttlingC: 41,
    criticalC: 44,
    recoveryC: 39.5,
  };

  /**
   * The thermal manager cannot read the physical SoC temperature from a
   * normal WebView. This value is therefore an internal thermal estimate.
   *
   * A native Android bridge can update it through setExternalTemperature().
   */
  private hasExternalTemperature = false;

  // ---------------------------------------------------------------------------
  // Battery
  // ---------------------------------------------------------------------------

  private batteryLevelPercent = 88;
  private isCharging = false;

  private batteryManager: BatteryManager | null = null;

  private readonly onBatteryLevelChange = (): void => {
    if (!this.batteryManager) {
      return;
    }

    this.batteryLevelPercent = clamp(
      Math.round(this.batteryManager.level * 100),
      0,
      100
    );
  };

  private readonly onChargingChange = (): void => {
    if (!this.batteryManager) {
      return;
    }

    this.isCharging = Boolean(this.batteryManager.charging);
  };

  // ---------------------------------------------------------------------------
  // FPS
  // ---------------------------------------------------------------------------

  private frameCount = 0;
  private fps = 30;

  private lastFpsTimestamp = performance.now();

  private fpsAccumulator = 30;

  // ---------------------------------------------------------------------------
  // CPU / performance
  // ---------------------------------------------------------------------------

  private cpuLoadPercent = 0;

  /**
   * CPU load is not directly available in browsers/WebView.
   * This is an estimate based on frame timing + registered heavy work.
   */
  private heavyWorkScore = 0;

  private lastPerformanceTimestamp = performance.now();

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  private thermalTimer: ReturnType<typeof setInterval> | null = null;

  private disposed = false;

  private constructor() {
    this.initBatteryListener();
    this.startMonitoringLoop();
  }

  public static getInstance(): ThermalManager {
    if (!ThermalManager.instance) {
      ThermalManager.instance = new ThermalManager();
    }

    return ThermalManager.instance;
  }

  /**
   * Useful for tests and hot-reload environments.
   */
  public static resetInstanceForTests(): void {
    ThermalManager.instance?.dispose();
    ThermalManager.instance = null;
  }

  // ===========================================================================
  // BATTERY
  // ===========================================================================

  private async initBatteryListener(): Promise<void> {
    try {
      const navigatorWithBattery = navigator as NavigatorWithBattery;

      if (typeof navigatorWithBattery.getBattery !== 'function') {
        return;
      }

      const battery = await navigatorWithBattery.getBattery();

      if (this.disposed) {
        return;
      }

      this.batteryManager = battery;

      this.batteryLevelPercent = clamp(
        Math.round(battery.level * 100),
        0,
        100
      );

      this.isCharging = Boolean(battery.charging);

      battery.addEventListener('levelchange', this.onBatteryLevelChange);
      battery.addEventListener('chargingchange', this.onChargingChange);
    } catch {
      /*
       * Battery API is optional and is unavailable in many browsers/WebViews.
       *
       * Do not pretend that the fallback is an actual reading.
       */
      this.batteryLevelPercent = 85;
      this.isCharging = false;
    }
  }

  // ===========================================================================
  // MONITORING
  // ===========================================================================

  private startMonitoringLoop(): void {
    if (this.thermalTimer) {
      return;
    }

    this.thermalTimer = setInterval(() => {
      this.updateThermalModel();
    }, 2000);
  }

  private updateThermalModel(): void {
    if (this.disposed) {
      return;
    }

    const now = performance.now();

    const elapsedSeconds = Math.max(
      0,
      (now - this.lastPerformanceTimestamp) / 1000
    );

    this.lastPerformanceTimestamp = now;

    /*
     * If native temperature is available, do not overwrite it with
     * the browser thermal model.
     */
    if (!this.hasExternalTemperature) {
      this.updateEstimatedTemperature(elapsedSeconds);
    }

    this.updateCpuEstimate();
  }

  private updateEstimatedTemperature(elapsedSeconds: number): void {
    /*
     * Heavy processing produces heat.
     */
    const heating =
      this.heavyWorkScore * 0.012 * Math.min(elapsedSeconds, 2);

    /*
     * Cooling is slower while charging.
     */
    const coolingRate = this.isCharging ? 0.025 : 0.045;

    const cooling = coolingRate * Math.min(elapsedSeconds, 2);

    /*
     * Ambient baseline.
     * Never allow the simulated estimate to drift unrealistically low.
     */
    const baseline = this.isCharging ? 33 : 31.5;

    const ambientRecovery =
      this.temperatureC > baseline ? cooling : -cooling * 0.15;

    this.temperatureC = clamp(
      this.temperatureC + heating - ambientRecovery,
      25,
      50
    );

    /*
     * Decay heavy-work contribution.
     */
    this.heavyWorkScore = Math.max(0, this.heavyWorkScore * 0.82);
  }

  // ===========================================================================
  // FPS
  // ===========================================================================

  public updateFps(): void {
    if (this.disposed) {
      return;
    }

    const now = performance.now();

    this.frameCount++;

    const elapsed = now - this.lastFpsTimestamp;

    if (elapsed < 500) {
      return;
    }

    const measuredFps = this.frameCount / (elapsed / 1000);

    /*
     * Clamp impossible values caused by background-tab suspension or timer jitter.
     */
    const sanitizedFps = clamp(measuredFps, 0, 240);

    /*
     * Exponential smoothing avoids abrupt UI changes.
     */
    this.fps = this.fps * 0.65 + sanitizedFps * 0.35;
    this.fpsAccumulator = this.fps;

    this.frameCount = 0;
    this.lastFpsTimestamp = now;
  }

  // ===========================================================================
  // EXTERNAL NATIVE TEMPERATURE
  // ===========================================================================

  /**
   * Allows the Android native layer to provide a real thermal/skin/SoC
   * temperature when available.
   *
   * Example bridge:
   * thermalManager.setExternalTemperature(42.3);
   */
  public setExternalTemperature(temperatureC: number): void {
    if (!Number.isFinite(temperatureC)) {
      return;
    }

    this.temperatureC = clamp(temperatureC, 20, 70);
    this.hasExternalTemperature = true;
  }

  /**
   * Returns control to the browser-side estimator.
   */
  public clearExternalTemperature(): void {
    this.hasExternalTemperature = false;
  }

  // ===========================================================================
  // HEAVY PROCESSING
  // ===========================================================================

  /**
   * Register expensive work such as:
   * - Night Pro
   * - HDR
   * - Focus Stack
   * - AI segmentation
   * - large ImageData processing
   * - WASM inference
   */
  public registerHeavyProcessing(durationMs: number): void {
    if (this.disposed) {
      return;
    }

    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      return;
    }

    const duration = clamp(durationMs, 0, 120000);

    /*
     * Convert processing duration into a normalized workload.
     * Long jobs increase thermal pressure sub-linearly to avoid jumping straight to CRITICAL.
     */
    const workload = Math.sqrt(duration / 1000);

    this.heavyWorkScore = clamp(
      this.heavyWorkScore + workload * 7,
      0,
      100
    );

    /*
     * Immediate estimate update gives callers faster feedback instead of
     * waiting for the next 2-second monitoring tick.
     */
    if (!this.hasExternalTemperature) {
      this.temperatureC = clamp(
        this.temperatureC + Math.min(1.5, (duration / 1000) * 0.08),
        25,
        50
      );
    }
  }

  public registerCooling(durationMs = 1000): void {
    if (this.disposed || this.hasExternalTemperature) {
      return;
    }

    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      return;
    }

    const seconds = clamp(durationMs / 1000, 0, 30);
    const coolingRate = this.isCharging ? 0.025 : 0.045;

    this.temperatureC = Math.max(
      25,
      this.temperatureC - coolingRate * seconds
    );
  }

  // ===========================================================================
  // THERMAL STATE
  // ===========================================================================

  public getThermalState(): ThermalState {
    /*
     * Pure query: does not mutate thermal state.
     */
    const status = this.calculateStatus(this.temperatureC);
    const memoryUsageMb = this.getMemoryUsageMb();

    const batteryPenalty =
      this.batteryLevelPercent < 15
        ? 8
        : this.batteryLevelPercent < 25
          ? 4
          : 0;

    const thermalPenalty =
      status === 'CRITICAL'
        ? 35
        : status === 'THROTTLING'
          ? 20
          : status === 'WARM'
            ? 8
            : 0;

    const estimatedCpu = clamp(
      Math.round(this.cpuLoadPercent + batteryPenalty + thermalPenalty),
      0,
      100
    );

    return {
      temperatureC: round1(this.temperatureC),
      status,
      cpuLoadPercent: estimatedCpu,
      memoryUsageMb,
      fps: Math.max(0, Math.round(this.fps || 30)),
      batteryLevelPercent: clamp(
        Math.round(this.batteryLevelPercent),
        0,
        100
      ),
      isCharging: this.isCharging,
    };
  }

  private calculateStatus(temperatureC: number): ThermalStatus {
    if (temperatureC >= this.thresholds.criticalC) {
      return 'CRITICAL';
    }

    if (temperatureC >= this.thresholds.throttlingC) {
      return 'THROTTLING';
    }

    if (temperatureC >= this.thresholds.warmC) {
      return 'WARM';
    }

    return 'NORMAL';
  }

  // ===========================================================================
  // THROTTLING POLICIES
  // ===========================================================================

  public shouldThrottleScopes(): boolean {
    const status = this.calculateStatus(this.temperatureC);
    return status === 'THROTTLING' || status === 'CRITICAL';
  }

  public shouldThrottlePreview(): boolean {
    return this.temperatureC >= this.thresholds.throttlingC;
  }

  public shouldDisableHeavyProcessing(): boolean {
    return (
      this.temperatureC >= this.thresholds.criticalC ||
      this.batteryLevelPercent <= 5
    );
  }

  public shouldReduceFrameRate(): boolean {
    return (
      this.temperatureC >= this.thresholds.throttlingC ||
      this.fps < 20
    );
  }

  public shouldReduceAIQuality(): boolean {
    return (
      this.temperatureC >= this.thresholds.throttlingC ||
      this.batteryLevelPercent <= 15
    );
  }

  public getRecommendedPreviewFps(): number {
    if (this.temperatureC >= this.thresholds.criticalC) {
      return 15;
    }

    if (this.temperatureC >= this.thresholds.throttlingC) {
      return 24;
    }

    if (this.temperatureC >= this.thresholds.warmC) {
      return 30;
    }

    return 60;
  }

  public getRecommendedProcessingScale(): number {
    if (this.temperatureC >= this.thresholds.criticalC) {
      return 0.50;
    }

    if (this.temperatureC >= this.thresholds.throttlingC) {
      return 0.67;
    }

    if (this.temperatureC >= this.thresholds.warmC) {
      return 0.85;
    }

    return 1;
  }

  public getRecommendedNightFrames(requestedFrames: number): number {
    const requested = clamp(Math.round(requestedFrames), 3, 12);

    if (this.temperatureC >= this.thresholds.criticalC) {
      return Math.min(requested, 3);
    }

    if (this.temperatureC >= this.thresholds.throttlingC) {
      return Math.min(requested, 4);
    }

    if (this.temperatureC >= this.thresholds.warmC) {
      return Math.min(requested, 5);
    }

    return requested;
  }

  // ===========================================================================
  // MEMORY
  // ===========================================================================

  private getMemoryUsageMb(): number {
    const performanceWithMemory = performance as PerformanceWithMemory;
    const memory = performanceWithMemory.memory;

    if (!memory || !Number.isFinite(memory.usedJSHeapSize)) {
      return 0;
    }

    return Math.max(
      0,
      Math.round(memory.usedJSHeapSize / (1024 * 1024))
    );
  }

  // ===========================================================================
  // CPU ESTIMATION
  // ===========================================================================

  private updateCpuEstimate(): void {
    /*
     * Browsers do not expose actual process CPU utilization.
     * We estimate pressure from frame rate, heavy processing and thermal state.
     */
    const framePressure = clamp(
      (60 - Math.min(this.fps, 60)) * 1.25,
      0,
      70
    );

    const workloadPressure = this.heavyWorkScore * 0.35;

    const target = clamp(framePressure + workloadPressure, 0, 100);

    this.cpuLoadPercent = this.cpuLoadPercent * 0.75 + target * 0.25;
  }

  // ===========================================================================
  // DIAGNOSTICS
  // ===========================================================================

  public getDiagnostics(): {
    thermal: ThermalState;
    estimatedTemperature: boolean;
    recommendedPreviewFps: number;
    recommendedProcessingScale: number;
    shouldThrottleScopes: boolean;
    shouldThrottlePreview: boolean;
    shouldDisableHeavyProcessing: boolean;
    shouldReduceAIQuality: boolean;
  } {
    return {
      thermal: this.getThermalState(),
      estimatedTemperature: !this.hasExternalTemperature,
      recommendedPreviewFps: this.getRecommendedPreviewFps(),
      recommendedProcessingScale: this.getRecommendedProcessingScale(),
      shouldThrottleScopes: this.shouldThrottleScopes(),
      shouldThrottlePreview: this.shouldThrottlePreview(),
      shouldDisableHeavyProcessing: this.shouldDisableHeavyProcessing(),
      shouldReduceAIQuality: this.shouldReduceAIQuality(),
    };
  }

  // ===========================================================================
  // DISPOSE
  // ===========================================================================

  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    if (this.thermalTimer) {
      clearInterval(this.thermalTimer);
      this.thermalTimer = null;
    }

    if (this.batteryManager) {
      this.batteryManager.removeEventListener(
        'levelchange',
        this.onBatteryLevelChange
      );
      this.batteryManager.removeEventListener(
        'chargingchange',
        this.onChargingChange
      );
      this.batteryManager = null;
    }
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
