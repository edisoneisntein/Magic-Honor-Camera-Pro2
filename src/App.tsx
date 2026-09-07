/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  CaptureMode,
  ManualSettings,
  CapturedMediaItem,
  ThermalState,
  AIScenePrediction,
  HonorDeviceProfile,
  ScopeType,
} from './types';

import { CameraService } from './services/cameraService';
import { DeviceCapabilityEngine } from './services/deviceCapabilityEngine';
import { ImageProcessingEngine } from './services/imageProcessingEngine';
import { AISceneEngine } from './services/aiSceneEngine';
import { ThermalManager } from './services/thermalManager';
import { SoundEffects } from './services/soundEffects';
import { CameraExperienceController } from './services/cameraExperienceController';

import {
  ShieldAlert,
  RefreshCw,
  ExternalLink,
  X,
} from 'lucide-react';

// UI
import { TopStatusBar } from './components/TopStatusBar';
import { CameraViewfinder } from './components/CameraViewfinder';
import { CinemaMonitors } from './components/CinemaMonitors';
import { BottomControls } from './components/BottomControls';
import { GalleryModal } from './components/GalleryModal';
import { CameraLabModal } from './components/CameraLabModal';
import { DocumentationModal } from './components/DocumentationModal';
import { InstallModal } from './components/InstallModal';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const ORDERED_MODES: readonly CaptureMode[] = [
  'smart_auto',
  'night_pro',
  'photo',
  'video',
  'pro',
  'mode_108mp',
  'cinematic',
  'hdr',
  'focus_stack',
] as const;

const CAMERA_WIDTH = 3840;
const CAMERA_HEIGHT = 2160;
const CAMERA_FPS = 30;

const TELEMETRY_INTERVAL_MS = 1000;
const SHUTTER_FLASH_MS = 90;
const CAPTURE_RESET_DELAY_MS = 250;

type CameraFacing = 'environment' | 'user';

type CameraPermissionStatus =
  | 'prompt'
  | 'granted'
  | 'denied'
  | 'unavailable';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
};

type StandaloneNavigator = Navigator & {
  standalone?: boolean;
};

const INITIAL_SETTINGS: ManualSettings = {
  iso: 'auto',
  shutterSpeed: 'auto',
  evBias: 0,
  focusDistance: 'auto',
  focusMode: 'continuous',
  whiteBalance: 'auto',
  kelvin: 5500,
  zoomRatio: 1.0,
  aspectRatio: '4:3',
  framingGuide: 'thirds',
  format: 'jpeg',
  timer: 0,
  showZebra: false,
  zebraThreshold: 85,
  showFocusPeaking: false,
  peakingColor: 'green',
  peakingThreshold: 32,
  showFalseColor: false,
  showLevel: true,
  activeScope: 'none',
  fps: 30,
  videoBitrate: 'high',
  videoResolution: '4k',
  stabilizationMode: 'ois_active',
  nightFrames: 6,
  hdrBrackets: 3,
  focusStackSteps: 5,
};

const INITIAL_THERMAL_STATE: ThermalState = {
  temperatureC: 33.2,
  status: 'NORMAL',
  cpuLoadPercent: 22,
  memoryUsageMb: 195,
  fps: 30,
  batteryLevelPercent: 88,
  isCharging: false,
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function isVideoCaptureMode(mode: CaptureMode): boolean {
  return mode === 'video' || mode === 'cinematic';
}

function formatMegapixels(width: number, height: number): string {
  return `${((width * height) / 1_000_000).toFixed(1)} MP`;
}

function estimateDataUrlSize(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(',');

  if (commaIndex < 0) {
    return dataUrl.length;
  }

  const base64 = dataUrl.slice(commaIndex + 1);

  return Math.floor((base64.length * 3) / 4);
}

function createMediaId(prefix = 'media'): string {
  if (
    typeof crypto !== 'undefined' &&
    'randomUUID' in crypto
  ) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

/* -------------------------------------------------------------------------- */
/* App                                                                        */
/* -------------------------------------------------------------------------- */

export default function App() {
  /* ------------------------------------------------------------------------ */
  /* Services                                                                 */
  /* ------------------------------------------------------------------------ */

  const cameraServiceRef = useRef(CameraService.getInstance());
  const capabilityEngineRef = useRef(
    DeviceCapabilityEngine.getInstance(),
  );
  const processingEngineRef = useRef(
    ImageProcessingEngine.getInstance(),
  );
  const aiSceneEngineRef = useRef(
    AISceneEngine.getInstance(),
  );
  const thermalManagerRef = useRef(
    ThermalManager.getInstance(),
  );
  const experienceControllerRef = useRef(
    CameraExperienceController.getInstance(),
  );

  /* ------------------------------------------------------------------------ */
  /* DOM / async refs                                                         */
  /* ------------------------------------------------------------------------ */

  const videoRef = useRef<HTMLVideoElement | null>(null);

  const mountedRef = useRef(true);

  const cameraOperationRef = useRef<Promise<void> | null>(null);

  const timerIntervalRef =
    useRef<ReturnType<typeof setInterval> | null>(null);

  const recordingTimerRef =
    useRef<ReturnType<typeof setInterval> | null>(null);

  const shutterFlashTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const captureResetTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const timerCancelledRef = useRef(false);

  const captureLockRef = useRef(false);

  const recordingLockRef = useRef(false);

  const streamGenerationRef = useRef(0);

  /* ------------------------------------------------------------------------ */
  /* Camera state                                                             */
  /* ------------------------------------------------------------------------ */

  const [stream, setStream] =
    useState<MediaStream | null>(null);

  const [cameraFacing, setCameraFacing] =
    useState<CameraFacing>('environment');

  const [cameraPermissionStatus, setCameraPermissionStatus] =
    useState<CameraPermissionStatus>('prompt');

  const [isCameraSimulated, setIsCameraSimulated] =
    useState(false);

  const [cameraErrorMessage, setCameraErrorMessage] =
    useState<string | null>(null);

  const [deviceProfile, setDeviceProfile] =
    useState<HonorDeviceProfile | null>(null);

  /* ------------------------------------------------------------------------ */
  /* Capture settings                                                         */
  /* ------------------------------------------------------------------------ */

  const [mode, setMode] =
    useState<CaptureMode>('photo');

  const [settings, setSettings] =
    useState<ManualSettings>(() => ({
      ...INITIAL_SETTINGS,
    }));

  const [torchOn, setTorchOn] =
    useState(false);

  /* ------------------------------------------------------------------------ */
  /* UI state                                                                 */
  /* ------------------------------------------------------------------------ */

  const [isCleanView, setIsCleanView] =
    useState(false);

  const [shutterFlash, setShutterFlash] =
    useState(false);

  const [timerCount, setTimerCount] =
    useState<number | null>(null);

  const [isProDrawerOpen, setIsProDrawerOpen] =
    useState(false);

  const [isGalleryOpen, setIsGalleryOpen] =
    useState(false);

  const [isLabOpen, setIsLabOpen] =
    useState(false);

  const [isDocsOpen, setIsDocsOpen] =
    useState(false);

  const [isInstallModalOpen, setIsInstallModalOpen] =
    useState(false);

  const [dismissPermissionBanner, setDismissPermissionBanner] =
    useState(false);

  /* ------------------------------------------------------------------------ */
  /* PWA                                                                      */
  /* ------------------------------------------------------------------------ */

  const [deferredPrompt, setDeferredPrompt] =
    useState<InstallPromptEvent | null>(null);

  const [isStandalone, setIsStandalone] =
    useState(false);

  /* ------------------------------------------------------------------------ */
  /* Telemetry                                                                */
  /* ------------------------------------------------------------------------ */

  const [thermalState, setThermalState] =
    useState<ThermalState>(() => ({
      ...INITIAL_THERMAL_STATE,
    }));

  const [audioLevel, setAudioLevel] =
    useState(0);

  const [aiScene, setAiScene] =
    useState<AIScenePrediction | null>(null);

  /* ------------------------------------------------------------------------ */
  /* Capture execution                                                        */
  /* ------------------------------------------------------------------------ */

  const [isCapturing, setIsCapturing] =
    useState(false);

  const [processingProgress, setProcessingProgress] =
    useState<number | null>(null);

  const [processingMessage, setProcessingMessage] =
    useState<string | null>(null);

  const [isRecordingVideo, setIsRecordingVideo] =
    useState(false);

  const [recordingSeconds, setRecordingSeconds] =
    useState(0);

  /* ------------------------------------------------------------------------ */
  /* Gallery                                                                  */
  /* ------------------------------------------------------------------------ */

  const [galleryItems, setGalleryItems] =
    useState<CapturedMediaItem[]>([]);

  /* ------------------------------------------------------------------------ */
  /* Camera state refs                                                        */
  /* ------------------------------------------------------------------------ */

  const modeRef = useRef(mode);
  const settingsRef = useRef(settings);
  const aiSceneRef = useRef(aiScene);
  const thermalStateRef = useRef(thermalState);
  const cameraFacingRef = useRef(cameraFacing);
  const isRecordingVideoRef = useRef(isRecordingVideo);
  const recordingSecondsRef = useRef(recordingSeconds);
  const streamRef = useRef<MediaStream | null>(stream);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    aiSceneRef.current = aiScene;
  }, [aiScene]);

  useEffect(() => {
    thermalStateRef.current = thermalState;
  }, [thermalState]);

  useEffect(() => {
    cameraFacingRef.current = cameraFacing;
  }, [cameraFacing]);

  useEffect(() => {
    isRecordingVideoRef.current = isRecordingVideo;
  }, [isRecordingVideo]);

  useEffect(() => {
    recordingSecondsRef.current = recordingSeconds;
  }, [recordingSeconds]);

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  /* ------------------------------------------------------------------------ */
  /* Cleanup helpers                                                          */
  /* ------------------------------------------------------------------------ */

  const clearTimer = useCallback(() => {
    if (timerIntervalRef.current !== null) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    timerCancelledRef.current = true;

    if (mountedRef.current) {
      setTimerCount(null);
    }
  }, []);

  const clearRecordingTimer = useCallback(() => {
    if (recordingTimerRef.current !== null) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const clearTemporaryTimers = useCallback(() => {
    clearTimer();
    clearRecordingTimer();

    if (shutterFlashTimeoutRef.current !== null) {
      clearTimeout(shutterFlashTimeoutRef.current);
      shutterFlashTimeoutRef.current = null;
    }

    if (captureResetTimeoutRef.current !== null) {
      clearTimeout(captureResetTimeoutRef.current);
      captureResetTimeoutRef.current = null;
    }
  }, [clearTimer, clearRecordingTimer]);

  /* ------------------------------------------------------------------------ */
  /* Camera synchronization                                                   */
  /* ------------------------------------------------------------------------ */

  const synchronizeCameraState = useCallback(
    async (
      newStream: MediaStream,
      facing: CameraFacing,
    ): Promise<void> => {
      if (!mountedRef.current) {
        return;
      }

      const cam = cameraServiceRef.current;

      setStream(newStream);
      setCameraFacing(facing);

      const permission =
        cam.getPermissionStatus();

      setCameraPermissionStatus(permission);
      setIsCameraSimulated(cam.isSimulated());
      setCameraErrorMessage(
        cam.getLastErrorMessage(),
      );

      const track =
        newStream.getVideoTracks()[0];

      if (!track) {
        setDeviceProfile(null);
        return;
      }

      try {
        const profile =
          await capabilityEngineRef.current.inspectDevice(
            track,
          );

        if (mountedRef.current) {
          setDeviceProfile(profile);
        }
      } catch (error) {
        console.warn(
          'Device capability inspection failed:',
          error,
        );

        if (mountedRef.current) {
          setDeviceProfile(null);
        }
      }
    },
    [],
  );

  /* ------------------------------------------------------------------------ */
  /* Camera initialization                                                    */
  /* ------------------------------------------------------------------------ */

  const initCamera = useCallback(
    async (
      facing: CameraFacing = cameraFacingRef.current,
    ): Promise<void> => {
      if (cameraOperationRef.current) {
        await cameraOperationRef.current;
        return;
      }

      const operation = (async () => {
        const generation =
          ++streamGenerationRef.current;

        const cam =
          cameraServiceRef.current;

        try {
          setCameraErrorMessage(null);

          const newStream =
            await cam.startStream(
              facing,
              CAMERA_WIDTH,
              CAMERA_HEIGHT,
              CAMERA_FPS,
            );

          if (
            !mountedRef.current ||
            generation !== streamGenerationRef.current
          ) {
            newStream
              .getTracks()
              .forEach((track) => track.stop());

            return;
          }

          await synchronizeCameraState(
            newStream,
            facing,
          );
        } catch (error) {
          console.warn(
            'Camera initialization notice:',
            error,
          );

          if (!mountedRef.current) {
            return;
          }

          setCameraPermissionStatus(
            cam.getPermissionStatus() ===
              'unavailable'
              ? 'unavailable'
              : 'denied',
          );

          setIsCameraSimulated(true);

          setCameraErrorMessage(
            error instanceof Error
              ? error.message
              : 'No se pudo acceder a la cámara.',
          );
        }
      })();

      cameraOperationRef.current = operation;

      try {
        await operation;
      } finally {
        if (
          cameraOperationRef.current === operation
        ) {
          cameraOperationRef.current = null;
        }
      }
    },
    [synchronizeCameraState],
  );

  /* ------------------------------------------------------------------------ */
  /* Initial camera lifecycle                                                 */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    mountedRef.current = true;

    void initCamera('environment');

    return () => {
      mountedRef.current = false;

      ++streamGenerationRef.current;

      clearTemporaryTimers();

      cameraServiceRef.current.stopStream();

      const currentStream =
        streamRef.current;

      currentStream
        ?.getTracks()
        .forEach((track) => track.stop());
    };
  }, [clearTemporaryTimers, initCamera]);

  /* ------------------------------------------------------------------------ */
  /* PWA                                                                      */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const standaloneNavigator =
      window.navigator as StandaloneNavigator;

    const standalone =
      window.matchMedia(
        '(display-mode: standalone)',
      ).matches ||
      standaloneNavigator.standalone === true;

    setIsStandalone(standalone);

    const handleBeforeInstallPrompt = (
      event: Event,
    ) => {
      event.preventDefault();

      setDeferredPrompt(
        event as InstallPromptEvent,
      );
    };

    const handleAppInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
    };

    window.addEventListener(
      'beforeinstallprompt',
      handleBeforeInstallPrompt,
    );

    window.addEventListener(
      'appinstalled',
      handleAppInstalled,
    );

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt,
      );

      window.removeEventListener(
        'appinstalled',
        handleAppInstalled,
      );
    };
  }, []);

  /* ------------------------------------------------------------------------ */
  /* Telemetry / AI                                                           */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    let cancelled = false;

    const updateTelemetry = () => {
      if (cancelled || !mountedRef.current) {
        return;
      }

      const thermal =
        thermalManagerRef.current.getThermalState();

      const audio =
        cameraServiceRef.current.getAudioLevel();

      setThermalState(thermal);
      setAudioLevel(audio);

      const currentMode =
        modeRef.current;

      const video =
        videoRef.current;

      const shouldAnalyzeScene =
        video !== null &&
        video.readyState >=
          HTMLMediaElement.HAVE_CURRENT_DATA &&
        (
          currentMode === 'smart_auto' ||
          currentMode === 'photo'
        );

      if (!shouldAnalyzeScene || !video) {
        setAiScene(null);
        return;
      }

      try {
        const prediction =
          aiSceneEngineRef.current.analyzeFrame(
            video,
          );

        if (cancelled || !mountedRef.current) {
          return;
        }

        setAiScene(prediction);

        if (
          currentMode === 'smart_auto'
        ) {
          const autoExposure =
            experienceControllerRef.current
              .evaluateAutoExposure(
                prediction,
              );

          if (
            Number.isFinite(
              autoExposure.evBias,
            ) &&
            autoExposure.evBias !== 0
          ) {
            void cameraServiceRef.current
              .applyExposureBias(
                autoExposure.evBias,
              );
          }
        }
      } catch (error) {
        console.warn(
          'Scene analysis notice:',
          error,
        );
      }
    };

    const interval = window.setInterval(
      updateTelemetry,
      TELEMETRY_INTERVAL_MS,
    );

    updateTelemetry();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  /* ------------------------------------------------------------------------ */
  /* Camera permission                                                        */
  /* ------------------------------------------------------------------------ */

  const handleRequestCameraPermission =
    useCallback(async (): Promise<void> => {
      SoundEffects.playTick();

      const cam =
        cameraServiceRef.current;

      try {
        const newStream =
          await cam.requestHardwarePermission(
            cameraFacingRef.current,
            CAMERA_WIDTH,
            CAMERA_HEIGHT,
            CAMERA_FPS,
          );

        if (!mountedRef.current) {
          newStream
            .getTracks()
            .forEach((track) => track.stop());

          return;
        }

        await synchronizeCameraState(
          newStream,
          cameraFacingRef.current,
        );
      } catch (error) {
        console.warn(
          'Retry permission result:',
          error,
        );

        if (!mountedRef.current) {
          return;
        }

        setCameraPermissionStatus(
          cam.getPermissionStatus(),
        );

        setCameraErrorMessage(
          error instanceof Error
            ? error.message
            : 'Permiso de cámara denegado.',
        );
      }
    }, [synchronizeCameraState]);

  /* ------------------------------------------------------------------------ */
  /* Camera switch                                                            */
  /* ------------------------------------------------------------------------ */

  const handleSwitchCamera =
    useCallback(async (): Promise<void> => {
      if (
        captureLockRef.current ||
        recordingLockRef.current
      ) {
        return;
      }

      SoundEffects.playTick();

      const nextFacing: CameraFacing =
        cameraFacingRef.current ===
        'environment'
          ? 'user'
          : 'environment';

      await initCamera(nextFacing);
    }, [initCamera]);

  /* ------------------------------------------------------------------------ */
  /* Zoom                                                                     */
  /* ------------------------------------------------------------------------ */

  const handleChangeZoom =
    useCallback(async (zoom: number) => {
      const clamped =
        Math.round(
          Math.min(
            10,
            Math.max(0.5, zoom),
          ) * 10,
        ) / 10;

      setSettings((previous) => ({
        ...previous,
        zoomRatio: clamped,
      }));

      try {
        await cameraServiceRef.current
          .setZoom(clamped);
      } catch (error) {
        console.warn(
          'Zoom update notice:',
          error,
        );
      }
    }, []);

  /* ------------------------------------------------------------------------ */
  /* Torch                                                                    */
  /* ------------------------------------------------------------------------ */

  const handleToggleTorch =
    useCallback(async () => {
      const next = !torchOn;

      setTorchOn(next);

      try {
        const applied =
          await cameraServiceRef.current
            .setTorch(next);

        if (
          typeof applied === 'boolean' &&
          applied !== next &&
          mountedRef.current
        ) {
          setTorchOn(applied);
        }
      } catch (error) {
        console.warn(
          'Torch update notice:',
          error,
        );

        if (mountedRef.current) {
          setTorchOn(false);
        }
      }
    }, [torchOn]);

  /* ------------------------------------------------------------------------ */
  /* Settings                                                                  */
  /* ------------------------------------------------------------------------ */

  const updateSettings = useCallback(
    (
      partial: Partial<ManualSettings>,
    ) => {
      setSettings((previous) => ({
        ...previous,
        ...partial,
      }));
    },
    [],
  );

  /* ------------------------------------------------------------------------ */
  /* Scopes                                                                   */
  /* ------------------------------------------------------------------------ */

  const handleToggleScopes =
    useCallback(() => {
      setSettings((previous) => {
        const nextScope: ScopeType =
          previous.activeScope === 'none'
            ? 'all'
            : previous.activeScope === 'all'
              ? 'histogram'
              : 'none';

        return {
          ...previous,
          activeScope: nextScope,
        };
      });
    }, []);

  /* ------------------------------------------------------------------------ */
  /* Focus mode                                                               */
  /* ------------------------------------------------------------------------ */

  const handleToggleFocusMode =
    useCallback(async () => {
      const previous =
        settingsRef.current;

      const nextMode =
        previous.focusMode === 'continuous'
          ? 'manual'
          : 'continuous';

      setSettings((current) => ({
        ...current,
        focusMode: nextMode,
        showFocusPeaking:
          nextMode === 'manual'
            ? true
            : current.showFocusPeaking,
      }));

      try {
        await cameraServiceRef.current
          .setFocusMode(nextMode);
      } catch (error) {
        console.warn(
          'Focus mode notice:',
          error,
        );
      }
    }, []);

  /* ------------------------------------------------------------------------ */
  /* Mode navigation                                                          */
  /* ------------------------------------------------------------------------ */

  const selectMode =
    useCallback((newMode: CaptureMode) => {
      setMode(newMode);

      if (newMode === 'pro') {
        setIsProDrawerOpen(true);
      }

      if (
        newMode !== 'smart_auto' &&
        aiSceneRef.current
      ) {
        setAiScene(null);
      }
    }, []);

  const handleSwipeModeChange =
    useCallback(
      (direction: 'next' | 'prev') => {
        const currentIndex =
          ORDERED_MODES.indexOf(
            modeRef.current,
          );

        if (currentIndex < 0) {
          selectMode('photo');
          return;
        }

        const offset =
          direction === 'next' ? 1 : -1;

        const nextIndex =
          (
            currentIndex +
            offset +
            ORDERED_MODES.length
          ) % ORDERED_MODES.length;

        selectMode(
          ORDERED_MODES[nextIndex],
        );
      },
      [selectMode],
    );

  /* ------------------------------------------------------------------------ */
  /* Shutter flash                                                            */
  /* ------------------------------------------------------------------------ */

  const triggerShutterFlash =
    useCallback(() => {
      if (
        shutterFlashTimeoutRef.current !== null
      ) {
        clearTimeout(
          shutterFlashTimeoutRef.current,
        );
      }

      setShutterFlash(true);

      shutterFlashTimeoutRef.current =
        setTimeout(() => {
          shutterFlashTimeoutRef.current =
            null;

          if (mountedRef.current) {
            setShutterFlash(false);
          }
        }, SHUTTER_FLASH_MS);
    }, []);

  /* ------------------------------------------------------------------------ */
  /* Create EXIF                                                              */
  /* ------------------------------------------------------------------------ */

  const createPhotoExif = useCallback(
    (
      megapixels: string,
    ) => {
      const current =
        settingsRef.current;

      return {
        make: 'HONOR',
        model: 'Magic8 Lite (ALI-NX1)',
        lens: '24mm f/1.75 OIS Wide',
        iso:
          current.iso === 'auto'
            ? '100'
            : String(current.iso),
        shutter:
          current.shutterSpeed === 'auto'
            ? '1/125s'
            : `${current.shutterSpeed}s`,
        aperture: 'f/1.75',
        focalLength:
          `${Math.round(
            24 * current.zoomRatio,
          )}mm eq.`,
        whiteBalance:
          `${current.kelvin}K`,
        megapixels,
        dateTime:
          new Date().toLocaleString(),
      };
    },
    [],
  );

  /* ------------------------------------------------------------------------ */
  /* Photo capture                                                            */
  /* ------------------------------------------------------------------------ */

  const executePhotoCapture =
    useCallback(async (): Promise<void> => {
      const video =
        videoRef.current;

      if (!video) {
        return;
      }

      if (
        captureLockRef.current ||
        recordingLockRef.current
      ) {
        return;
      }

      const controller =
        experienceControllerRef.current;

      if (
        controller.isCaptureBusy()
      ) {
        return;
      }

      captureLockRef.current = true;

      const cam =
        cameraServiceRef.current;

      const processor =
        processingEngineRef.current;

      const currentMode =
        modeRef.current;

      const currentSettings =
        settingsRef.current;

      SoundEffects.playShutterSound();
      triggerShutterFlash();

      setIsCapturing(true);

      controller.setProcessingState(
        'capturing',
      );

      try {
        let finalDataUrl = '';
        let outWidth = 4000;
        let outHeight = 3000;
        let outMegapixels = '12.0 MP';

        const autoProcessing =
          controller.determineAutoProcessing(
            currentMode === 'smart_auto'
              ? 'photo'
              : currentMode,
            aiSceneRef.current,
            thermalStateRef.current,
          );

        /* ------------------------------------------------------------------ */
        /* 108 MP                                                              */
        /* ------------------------------------------------------------------ */

        if (
          currentMode === 'mode_108mp'
        ) {
          controller.setProcessingState(
            'processing',
          );

          setProcessingMessage(
            'Procesamiento de alta resolución...',
          );

          setProcessingProgress(10);

          const result =
            await processor.process108MPCapture(
              video,
              currentSettings.zoomRatio,
              currentSettings,
            );

          finalDataUrl = result.dataUrl;
          outWidth = result.width;
          outHeight = result.height;
          outMegapixels =
            `${formatMegapixels(
              result.width,
              result.height,
            )} (Ultra Definition)`;

          setProcessingProgress(100);
        }

        /* ------------------------------------------------------------------ */
        /* Night Pro                                                           */
        /* ------------------------------------------------------------------ */

        else if (
          currentMode === 'night_pro' ||
          (
            currentMode === 'smart_auto' &&
            autoProcessing.useNightPro
          )
        ) {
          controller.setProcessingState(
            'processing',
          );

          const frames =
            currentMode === 'night_pro'
              ? currentSettings.nightFrames
              : autoProcessing.framesToCapture;

          setProcessingMessage(
            'IA: segmentación y reducción de ruido...',
          );

          setProcessingProgress(5);

          const result =
            await processor.processNightProCapture(
              video,
              frames,
              (progress) => {
                if (
                  !mountedRef.current
                ) {
                  return;
                }

                setProcessingProgress(
                  progress,
                );

                if (
                  progress > 50 &&
                  progress <= 70
                ) {
                  setProcessingMessage(
                    'Analizando sombras y texturas...',
                  );
                } else if (
                  progress > 70 &&
                  progress <= 85
                ) {
                  setProcessingMessage(
                    'Compensando exposición...',
                  );
                } else if (
                  progress > 85
                ) {
                  setProcessingMessage(
                    'Reducción de ruido selectiva...',
                  );
                }
              },
              currentSettings.zoomRatio,
              currentSettings,
            );

          finalDataUrl = result.dataUrl;
          outWidth = result.width;
          outHeight = result.height;

          outMegapixels =
            `${formatMegapixels(
              result.width,
              result.height,
            )} (Night Pro)`;
        }

        /* ------------------------------------------------------------------ */
        /* HDR                                                                 */
        /* ------------------------------------------------------------------ */

        else if (
          currentMode === 'hdr' ||
          (
            currentMode === 'smart_auto' &&
            autoProcessing.useHdr
          )
        ) {
          controller.setProcessingState(
            'processing',
          );

          const frames =
            currentMode === 'hdr'
              ? currentSettings.hdrBrackets
              : autoProcessing.framesToCapture;

          setProcessingMessage(
            'Fusionando exposiciones HDR...',
          );

          setProcessingProgress(10);

          const result =
            await processor.processHDRCapture(
              video,
              frames,
              (progress) => {
                if (
                  mountedRef.current
                ) {
                  setProcessingProgress(
                    progress,
                  );
                }
              },
              currentSettings.zoomRatio,
              currentSettings,
            );

          finalDataUrl = result.dataUrl;
          outWidth = result.width;
          outHeight = result.height;

          outMegapixels =
            `${formatMegapixels(
              result.width,
              result.height,
            )} (HDR Multi-Frame)`;
        }

        /* ------------------------------------------------------------------ */
        /* Focus stack                                                         */
        /* ------------------------------------------------------------------ */

        else if (
          currentMode === 'focus_stack'
        ) {
          controller.setProcessingState(
            'processing',
          );

          setProcessingMessage(
            'Apilando planos focales...',
          );

          setProcessingProgress(10);

          const result =
            await processor.processFocusStackCapture(
              video,
              currentSettings.focusStackSteps,
              (progress) => {
                if (
                  mountedRef.current
                ) {
                  setProcessingProgress(
                    progress,
                  );
                }
              },
              currentSettings.zoomRatio,
              currentSettings,
            );

          finalDataUrl = result.dataUrl;
          outWidth = result.width;
          outHeight = result.height;

          outMegapixels =
            `${formatMegapixels(
              result.width,
              result.height,
            )} (Focus Stack)`;
        }

        /* ------------------------------------------------------------------ */
        /* Standard native photo                                               */
        /* ------------------------------------------------------------------ */

        else {
          setProcessingProgress(50);

          const nativePhoto =
            await cam.takeNativePhoto();

          if (
            nativePhoto?.dataUrl
          ) {
            finalDataUrl =
              nativePhoto.dataUrl;

            outWidth =
              nativePhoto.width;

            outHeight =
              nativePhoto.height;

            outMegapixels =
              `${formatMegapixels(
                nativePhoto.width,
                nativePhoto.height,
              )} (Sensor Nativo)`;
          } else {
            const frame =
              processor.grabFrame(
                video,
                undefined,
                undefined,
                currentSettings.zoomRatio,
                currentSettings,
              );

            if (!frame) {
              throw new Error(
                'No se pudo obtener un frame de la cámara.',
              );
            }

            const canvas =
              document.createElement(
                'canvas',
              );

            canvas.width = frame.width;
            canvas.height = frame.height;

            const context =
              canvas.getContext('2d');

            if (!context) {
              throw new Error(
                'No se pudo crear el contexto de imagen.',
              );
            }

            context.putImageData(
              frame,
              0,
              0,
            );

            finalDataUrl =
              canvas.toDataURL(
                'image/jpeg',
                0.95,
              );

            outWidth = canvas.width;
            outHeight = canvas.height;

            outMegapixels =
              `${formatMegapixels(
                outWidth,
                outHeight,
              )} (Frame Buffer)`;
          }
        }

        if (!finalDataUrl) {
          throw new Error(
            'El pipeline de captura no produjo una imagen.',
          );
        }

        /* ------------------------------------------------------------------ */
        /* Save                                                                */
        /* ------------------------------------------------------------------ */

        controller.setProcessingState(
          'saving',
        );

        const timestamp =
          Date.now();

        /* ------------------------------------------------------------------ */
        /* DNG                                                                  */
        /* ------------------------------------------------------------------ */

        if (
          currentSettings.format ===
          'raw_dng'
        ) {
          const rawFrame =
            processor.grabFrame(
              video,
              undefined,
              undefined,
              currentSettings.zoomRatio,
              currentSettings,
            );

          if (rawFrame) {
            const dngBlob =
              processor.createDngContainer(
                rawFrame,
                currentSettings,
              );

            const dngUrl =
              URL.createObjectURL(
                dngBlob,
              );

            const dngItem:
              CapturedMediaItem = {
              id: createMediaId('dng'),
              dataUrl: dngUrl,
              thumbnailUrl: finalDataUrl,
              type: 'dng',
              timestamp,
              mode: currentMode,
              width: outWidth,
              height: outHeight,
              sizeBytes: dngBlob.size,
              format:
                'RAW DNG (procesado)',
              exif: {
                ...createPhotoExif(
                  outMegapixels,
                ),
              },
            };

            setGalleryItems(
              (previous) => [
                dngItem,
                ...previous,
              ],
            );
          }
        }

        /* ------------------------------------------------------------------ */
        /* JPEG                                                                 */
        /* ------------------------------------------------------------------ */

        const photoItem:
          CapturedMediaItem = {
          id: createMediaId('photo'),
          dataUrl: finalDataUrl,
          thumbnailUrl: finalDataUrl,
          type: 'photo',
          timestamp,
          mode: currentMode,
          width: outWidth,
          height: outHeight,
          sizeBytes:
            estimateDataUrlSize(
              finalDataUrl,
            ),
          format: 'JPEG (sRGB)',
          exif: createPhotoExif(
            outMegapixels,
          ),
        };

        if (mountedRef.current) {
          setGalleryItems(
            (previous) => [
              photoItem,
              ...previous,
            ],
          );
        }
      } catch (error) {
        const errorText =
          controller.translateError(
            error,
          );

        console.warn(
          'Capture processing notice:',
          errorText,
          error,
        );
      } finally {
        controller.setProcessingState(
          'idle',
        );

        if (
          mountedRef.current
        ) {
          if (
            captureResetTimeoutRef.current !==
            null
          ) {
            clearTimeout(
              captureResetTimeoutRef.current,
            );
          }

          captureResetTimeoutRef.current =
            setTimeout(() => {
              captureResetTimeoutRef.current =
                null;

              if (
                mountedRef.current
              ) {
                setIsCapturing(false);
                setProcessingProgress(
                  null,
                );
                setProcessingMessage(
                  null,
                );
              }
            }, CAPTURE_RESET_DELAY_MS);
        }

        captureLockRef.current =
          false;
      }
    }, [triggerShutterFlash, createPhotoExif]);

  /* ------------------------------------------------------------------------ */
  /* Recording timer                                                          */
  /* ------------------------------------------------------------------------ */

  const startRecordingTimer =
    useCallback(() => {
      clearRecordingTimer();

      setRecordingSeconds(0);
      recordingSecondsRef.current = 0;

      recordingTimerRef.current =
        setInterval(() => {
          if (!mountedRef.current) {
            return;
          }

          setRecordingSeconds(
            (previous) => {
              const next =
                previous + 1;

              recordingSecondsRef.current =
                next;

              return next;
            },
          );
        }, 1000);
    }, [clearRecordingTimer]);

  /* ------------------------------------------------------------------------ */
  /* Stop recording                                                           */
  /* ------------------------------------------------------------------------ */

  const stopVideoRecording =
    useCallback(async (): Promise<void> => {
      if (
        recordingLockRef.current
      ) {
        return;
      }

      recordingLockRef.current = true;

      clearRecordingTimer();

      SoundEffects.playVideoStop();

      try {
        const blob =
          await cameraServiceRef.current
            .stopVideoRecording();

        if (!blob) {
          return;
        }

        const videoUrl =
          URL.createObjectURL(blob);

        const timestamp =
          Date.now();

        const item:
          CapturedMediaItem = {
          id: createMediaId('video'),
          dataUrl: videoUrl,
          thumbnailUrl: videoUrl,
          type: 'video',
          timestamp,
          mode: modeRef.current,
          width: CAMERA_WIDTH,
          height: CAMERA_HEIGHT,
          sizeBytes: blob.size,
          format: 'WebM / H.264',
          durationSec:
            recordingSecondsRef.current,
          exif: {
            make: 'HONOR',
            model:
              'Magic8 Lite',
            lens:
              '24mm f/1.75 OIS Wide',
            iso:
              settingsRef.current.iso ===
              'auto'
                ? 'AUTO'
                : String(
                    settingsRef.current.iso,
                  ),
            shutter:
              `${settingsRef.current.fps} FPS`,
            aperture: 'f/1.75',
            focalLength:
              '24mm eq.',
            whiteBalance:
              `${settingsRef.current.kelvin}K`,
            megapixels:
              '4K Ultra HD',
            dateTime:
              new Date().toLocaleString(),
          },
        };

        if (mountedRef.current) {
          setGalleryItems(
            (previous) => [
              item,
              ...previous,
            ],
          );
        }
      } catch (error) {
        console.warn(
          'Video stop notice:',
          error,
        );
      } finally {
        if (mountedRef.current) {
          setIsRecordingVideo(false);
          setRecordingSeconds(0);
        }

        isRecordingVideoRef.current =
          false;

        recordingSecondsRef.current =
          0;

        recordingLockRef.current =
          false;
      }
    }, [clearRecordingTimer]);

  /* ------------------------------------------------------------------------ */
  /* Start recording                                                          */
  /* ------------------------------------------------------------------------ */

  const startVideoRecording =
    useCallback(() => {
      if (
        recordingLockRef.current ||
        captureLockRef.current
      ) {
        return;
      }

      recordingLockRef.current = true;

      try {
        SoundEffects.playVideoStart();

        const started =
          cameraServiceRef.current
            .startVideoRecording(
              undefined,
              settingsRef.current.fps,
              settingsRef.current.videoBitrate,
            );

        if (!started) {
          return;
        }

        isRecordingVideoRef.current =
          true;

        setIsRecordingVideo(true);

        startRecordingTimer();
      } catch (error) {
        console.warn(
          'Video start notice:',
          error,
        );
      } finally {
        recordingLockRef.current =
          false;
      }
    }, [startRecordingTimer]);

  /* ------------------------------------------------------------------------ */
  /* Main trigger                                                             */
  /* ------------------------------------------------------------------------ */

  const handleTriggerCapture =
    useCallback(async (): Promise<void> => {
      if (!videoRef.current) {
        return;
      }

      if (
        captureLockRef.current
      ) {
        return;
      }

      const currentMode =
        modeRef.current;

      /* -------------------------------------------------------------------- */
      /* Video                                                                */
      /* -------------------------------------------------------------------- */

      if (
        isVideoCaptureMode(
          currentMode,
        )
      ) {
        if (
          isRecordingVideoRef.current
        ) {
          await stopVideoRecording();
        } else {
          startVideoRecording();
        }

        return;
      }

      /* -------------------------------------------------------------------- */
      /* Countdown                                                            */
      /* -------------------------------------------------------------------- */

      const timerSeconds =
        settingsRef.current.timer;

      if (timerSeconds > 0) {
        if (
          timerIntervalRef.current !==
          null
        ) {
          clearTimer();
          return;
        }

        timerCancelledRef.current =
          false;

        let remaining =
          timerSeconds;

        setTimerCount(remaining);

        SoundEffects.playTimerBeep(
          false,
        );

        timerIntervalRef.current =
          setInterval(() => {
            if (
              timerCancelledRef.current
            ) {
              return;
            }

            remaining -= 1;

            if (remaining > 0) {
              setTimerCount(
                remaining,
              );

              SoundEffects.playTimerBeep(
                false,
              );

              return;
            }

            if (
              timerIntervalRef.current !==
              null
            ) {
              clearInterval(
                timerIntervalRef.current,
              );

              timerIntervalRef.current =
                null;
            }

            setTimerCount(null);

            SoundEffects.playTimerBeep(
              true,
            );

            void executePhotoCapture();
          }, 1000);

        return;
      }

      /* -------------------------------------------------------------------- */
      /* Instant photo                                                        */
      /* -------------------------------------------------------------------- */

      await executePhotoCapture();
    }, [
      clearTimer,
      executePhotoCapture,
      startVideoRecording,
      stopVideoRecording,
    ]);

  /* ------------------------------------------------------------------------ */
  /* Keyboard                                                                  */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (
        isGalleryOpen ||
        isLabOpen ||
        isDocsOpen
      ) {
        return;
      }

      /*
       * No disparar el obturador mientras el
       * usuario escribe en un input/textarea.
       */
      const target =
        event.target as HTMLElement | null;

      const isEditable =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;

      if (isEditable) {
        return;
      }

      switch (event.code) {
        case 'Space':
        case 'Enter':
          event.preventDefault();
          void handleTriggerCapture();
          break;

        case 'KeyC':
          setIsCleanView(
            (previous) => !previous,
          );
          break;

        case 'KeyP':
          setIsProDrawerOpen(
            (previous) => !previous,
          );
          break;

        case 'KeyG':
          setIsGalleryOpen(true);
          break;

        case 'KeyS':
          handleToggleScopes();
          break;

        case 'ArrowRight':
          handleSwipeModeChange(
            'next',
          );
          break;

        case 'ArrowLeft':
          handleSwipeModeChange(
            'prev',
          );
          break;

        default:
          break;
      }
    };

    window.addEventListener(
      'keydown',
      handleKeyDown,
    );

    return () => {
      window.removeEventListener(
        'keydown',
        handleKeyDown,
      );
    };
  }, [
    handleSwipeModeChange,
    handleToggleScopes,
    handleTriggerCapture,
    isDocsOpen,
    isGalleryOpen,
    isLabOpen,
  ]);

  /* ------------------------------------------------------------------------ */
  /* Focus point                                                              */
  /* ------------------------------------------------------------------------ */

  const handleFocusPointChange =
    useCallback(
      (x: number, y: number) => {
        try {
          cameraServiceRef.current
            .applyFocusPoint(x, y);
        } catch (error) {
          console.warn(
            'Focus point notice:',
            error,
          );
        }
      },
      [],
    );

  /* ------------------------------------------------------------------------ */
  /* Exposure                                                                 */
  /* ------------------------------------------------------------------------ */

  const handleEvChange =
    useCallback((ev: number) => {
      setSettings((previous) => ({
        ...previous,
        evBias: ev,
      }));

      void cameraServiceRef.current
        .applyExposureBias(ev);
    }, []);

  /* ------------------------------------------------------------------------ */
  /* Gallery delete                                                           */
  /* ------------------------------------------------------------------------ */

  const handleDeleteGalleryItem =
    useCallback(
      (id: string) => {
        setGalleryItems(
          (previous) => {
            const item =
              previous.find(
                (entry) =>
                  entry.id === id,
              );

            /*
             * Liberar Blob URLs creadas por
             * el navegador.
             */
            if (
              item &&
              item.dataUrl.startsWith(
                'blob:',
              )
            ) {
              URL.revokeObjectURL(
                item.dataUrl,
              );
            }

            if (
              item &&
              item.thumbnailUrl.startsWith(
                'blob:',
              ) &&
              item.thumbnailUrl !==
                item.dataUrl
            ) {
              URL.revokeObjectURL(
                item.thumbnailUrl,
              );
            }

            return previous.filter(
              (entry) =>
                entry.id !== id,
            );
          },
        );
      },
      [],
    );

  /* ------------------------------------------------------------------------ */
  /* Gallery URL cleanup on unmount                                           */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    return () => {
      galleryItems.forEach(
        (item) => {
          if (
            item.dataUrl.startsWith(
              'blob:',
            )
          ) {
            URL.revokeObjectURL(
              item.dataUrl,
            );
          }

          if (
            item.thumbnailUrl.startsWith(
              'blob:',
            ) &&
            item.thumbnailUrl !==
              item.dataUrl
          ) {
            URL.revokeObjectURL(
              item.thumbnailUrl,
            );
          }
        },
      );
    };
  }, [galleryItems]);

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <main
      className="
        relative
        h-screen
        w-screen
        overflow-hidden
        bg-black
        font-sans
        select-none
      "
    >
      {/* ------------------------------------------------------------------ */}
      {/* Camera viewfinder                                                   */}
      {/* ------------------------------------------------------------------ */}

      <CameraViewfinder
        videoRef={videoRef}
        stream={stream}
        mode={mode}
        settings={settings}
        aiScene={
          mode === 'smart_auto'
            ? aiScene
            : null
        }
        processingProgress={
          processingProgress
        }
        processingMessage={
          processingMessage
        }
        isCleanView={isCleanView}
        shutterFlash={shutterFlash}
        timerCount={timerCount}
        cameraFacing={cameraFacing}
        onToggleCleanView={() =>
          setIsCleanView(
            (previous) => !previous,
          )
        }
        onFocusPointChange={
          handleFocusPointChange
        }
        onEvChange={handleEvChange}
        onToggleFocusMode={
          handleToggleFocusMode
        }
        onSwipeModeChange={
          handleSwipeModeChange
        }
        onPinchZoom={
          handleChangeZoom
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* Top status bar                                                      */}
      {/* ------------------------------------------------------------------ */}

      <TopStatusBar
        mode={mode}
        settings={settings}
        thermal={thermalState}
        torchOn={torchOn}
        onToggleTorch={
          handleToggleTorch
        }
        onChangeSettings={
          updateSettings
        }
        onToggleLab={() =>
          setIsLabOpen(true)
        }
        onToggleDocs={() =>
          setIsDocsOpen(true)
        }
        onToggleScopes={
          handleToggleScopes
        }
        onOpenInstall={() =>
          setIsInstallModalOpen(true)
        }
        cameraFacing={cameraFacing}
        isCleanView={isCleanView}
        onToggleCleanView={() =>
          setIsCleanView(
            (previous) => !previous,
          )
        }
        isRecordingVideo={
          isRecordingVideo
        }
        recordingSeconds={
          recordingSeconds
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* Camera permission / simulator notice                               */}
      {/* ------------------------------------------------------------------ */}

      {isCameraSimulated &&
        !dismissPermissionBanner && (
          <aside
            id="camera-permission-notice"
            aria-label="Aviso de sensor de cámara"
            className="
              absolute
              top-16
              left-1/2
              -translate-x-1/2
              z-40
              w-[94%]
              max-w-lg
              animate-in
              fade-in
              slide-in-from-top-3
              duration-300
              pointer-events-auto
            "
          >
            <div
              className="
                bg-[#12141a]/95
                border
                border-[#FF9500]/40
                rounded-xl
                p-3
                shadow-2xl
                backdrop-blur-md
                flex
                items-start
                gap-3
              "
            >
              <div
                className="
                  w-8
                  h-8
                  rounded-lg
                  bg-[#FF9500]/15
                  border
                  border-[#FF9500]/30
                  flex
                  items-center
                  justify-center
                  shrink-0
                  mt-0.5
                "
              >
                <ShieldAlert
                  className="
                    w-4
                    h-4
                    text-[#FF9500]
                  "
                />
              </div>

              <div className="flex-1 min-w-0">
                <div
                  className="
                    flex
                    items-center
                    justify-between
                    gap-2
                  "
                >
                  <span
                    className="
                      text-[11px]
                      font-mono
                      font-bold
                      tracking-wider
                      text-[#FF9500]
                      uppercase
                    "
                  >
                    CÁMARA VIRTUAL ACTIVA
                  </span>

                  <button
                    id="btn-dismiss-permission-banner"
                    onClick={() =>
                      setDismissPermissionBanner(
                        true,
                      )
                    }
                    className="
                      text-white/40
                      hover:text-white
                      transition-colors
                      p-1
                    "
                    title="Cerrar aviso"
                    aria-label="Cerrar aviso"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p
                  className="
                    text-xs
                    text-white/70
                    mt-0.5
                    leading-snug
                  "
                >
                  Acceso a la cámara física
                  restringido (
                  {cameraErrorMessage ||
                    'permiso no disponible'}
                  ). El visor virtual continúa
                  funcionando para pruebas de
                  interfaz y procesamiento.
                </p>

                <div
                  className="
                    mt-2.5
                    flex
                    items-center
                    gap-2
                    flex-wrap
                  "
                >
                  <button
                    id="btn-retry-camera-permission"
                    onClick={
                      handleRequestCameraPermission
                    }
                    className="
                      px-3
                      py-1.5
                      bg-[#FF9500]
                      hover:bg-[#FF9500]/90
                      text-black
                      text-xs
                      font-bold
                      font-mono
                      rounded-lg
                      transition-all
                      flex
                      items-center
                      gap-1.5
                      shadow-md
                      active:scale-95
                    "
                  >
                    <RefreshCw className="w-3 h-3" />
                    Conceder / Reintentar
                  </button>

                  <button
                    id="btn-open-new-tab"
                    onClick={() =>
                      window.open(
                        window.location.href,
                        '_blank',
                        'noopener,noreferrer',
                      )
                    }
                    className="
                      px-2.5
                      py-1.5
                      bg-white/10
                      hover:bg-white/20
                      text-white/90
                      text-xs
                      font-mono
                      rounded-lg
                      transition-all
                      flex
                      items-center
                      gap-1.5
                      active:scale-95
                    "
                    title="Abrir en pestaña nueva"
                  >
                    <ExternalLink className="w-3 h-3 text-white/60" />
                    Abrir Pestaña Nueva
                  </button>
                </div>
              </div>
            </div>
          </aside>
        )}

      {/* ------------------------------------------------------------------ */}
      {/* Cinema scopes                                                       */}
      {/* ------------------------------------------------------------------ */}

      {!isCleanView && (
        <CinemaMonitors
          videoRef={videoRef}
          activeScope={
            settings.activeScope
          }
          audioLevel={audioLevel}
          onClose={() =>
            setSettings(
              (previous) => ({
                ...previous,
                activeScope: 'none',
              }),
            )
          }
          onSelectScope={(
            scope: ScopeType,
          ) =>
            setSettings(
              (previous) => ({
                ...previous,
                activeScope: scope,
              }),
            )
          }
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Bottom controls                                                     */}
      {/* ------------------------------------------------------------------ */}

      <BottomControls
        mode={mode}
        onSelectMode={selectMode}
        onShutter={
          handleTriggerCapture
        }
        isCapturing={isCapturing}
        isRecordingVideo={
          isRecordingVideo
        }
        onFlipCamera={
          handleSwitchCamera
        }
        onOpenGallery={() =>
          setIsGalleryOpen(true)
        }
        lastMedia={
          galleryItems[0] || null
        }
        settings={settings}
        onChangeSettings={
          updateSettings
        }
        onChangeZoom={
          handleChangeZoom
        }
        onToggleProControls={() =>
          setIsProDrawerOpen(
            (previous) => !previous,
          )
        }
        isProControlsOpen={
          isProDrawerOpen
        }
        isCleanView={isCleanView}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Gallery                                                             */}
      {/* ------------------------------------------------------------------ */}

      <GalleryModal
        items={galleryItems}
        isOpen={isGalleryOpen}
        onClose={() =>
          setIsGalleryOpen(false)
        }
        onDeleteItem={
          handleDeleteGalleryItem
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* Camera Lab                                                          */}
      {/* ------------------------------------------------------------------ */}

      <CameraLabModal
        isOpen={isLabOpen}
        onClose={() =>
          setIsLabOpen(false)
        }
        thermal={thermalState}
        profile={deviceProfile}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Documentation                                                       */}
      {/* ------------------------------------------------------------------ */}

      <DocumentationModal
        isOpen={isDocsOpen}
        onClose={() =>
          setIsDocsOpen(false)
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* Install                                                             */}
      {/* ------------------------------------------------------------------ */}

      <InstallModal
        isOpen={isInstallModalOpen}
        onClose={() =>
          setIsInstallModalOpen(false)
        }
        deferredPrompt={deferredPrompt}
        isStandalone={isStandalone}
      />
    </main>
  );
}
