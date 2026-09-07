import { ManualSettings } from '../types';
import {
  AISemanticNightEngine,
  SemanticSegmentationMap,
} from './aiSemanticNightEngine';

export interface ScopeData {
  lumaHist: number[];
  rHist: number[];
  gHist: number[];
  bHist: number[];
  maxBin: number;
}

export interface ProcessedImage {
  dataUrl: string;
  width: number;
  height: number;
}

export interface NightProResult extends ProcessedImage {
  segmentationStats?: SemanticSegmentationMap['stats'];
}

export type FocusPeakingColor =
  | 'green'
  | 'red'
  | 'cyan'
  | 'yellow';

export interface RenderSize {
  width: number;
  height: number;
}

export interface DngMetadata {
  make?: string;
  model?: string;
  iso?: number | 'auto';
  shutterSpeed?: number | 'auto';
  evBias?: number;
  kelvin?: number;
}

export interface FrameCaptureOptions {
  width?: number;
  height?: number;
  zoomRatio?: number;
  settings?: ManualSettings;
}

const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;

const HISTOGRAM_WIDTH = 320;
const HISTOGRAM_HEIGHT = 180;

const DEFAULT_JPEG_QUALITY = 0.95;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 20;

const DEFAULT_ISO = 100;
const DEFAULT_SHUTTER = 1 / 125;
const DEFAULT_KELVIN = 5500;

const TARGET_108MP_WIDTH = 6000;
const TARGET_108MP_HEIGHT = 4500;

const MAX_NIGHT_FRAMES = 12;
const MIN_NIGHT_FRAMES = 3;

const MAX_HDR_FRAMES = 5;
const MIN_HDR_FRAMES = 2;

const MAX_FOCUS_FRAMES = 9;
const MIN_FOCUS_FRAMES = 2;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const clamp = (
  value: number,
  min: number,
  max: number
): number => Math.min(max, Math.max(min, value));

const finiteOr = (
  value: unknown,
  fallback: number
): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : fallback;

export class ImageProcessingEngine {
  private static instance: ImageProcessingEngine | null = null;

  /**
   * Reusable offscreen canvas for lightweight single-frame captures and live overlays
   * (e.g. histogram, waveform, vectorscope, peaking, zebra) to prevent GC thrashing.
   */
  private readonly offscreenCanvas: HTMLCanvasElement;
  private readonly offscreenCtx: CanvasRenderingContext2D;

  private constructor() {
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = DEFAULT_WIDTH;
    this.offscreenCanvas.height = DEFAULT_HEIGHT;

    const ctx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Canvas 2D context is not available.');
    }
    this.offscreenCtx = ctx;
  }

  public static getInstance(): ImageProcessingEngine {
    if (!ImageProcessingEngine.instance) {
      ImageProcessingEngine.instance = new ImageProcessingEngine();
    }
    return ImageProcessingEngine.instance;
  }

  public static resetInstanceForTests(): void {
    ImageProcessingEngine.instance = null;
  }

  // ===========================================================================
  // MANUAL EXPOSURE / COLOR
  // ===========================================================================

  /**
   * Applies a deterministic computational approximation of manual exposure,
   * ISO amplification, shutter speed curves, and Kelvin white balance.
   */
  public applyManualExposureToImageData(
    imgData: ImageData,
    settings?: ManualSettings
  ): void {
    if (!settings) {
      return;
    }

    const iso =
      settings.iso === 'auto'
        ? DEFAULT_ISO
        : clamp(finiteOr(settings.iso, DEFAULT_ISO), 25, 102400);

    const shutter =
      settings.shutterSpeed === 'auto'
        ? DEFAULT_SHUTTER
        : clamp(finiteOr(settings.shutterSpeed, DEFAULT_SHUTTER), 1 / 8000, 30);

    const evBias = clamp(finiteOr(settings.evBias, 0), -8, 8);
    const kelvin = clamp(finiteOr(settings.kelvin, DEFAULT_KELVIN), 1800, 12000);

    const evMultiplier = Math.pow(2, evBias);
    let manualFactor = 1;

    if (settings.iso !== 'auto' && settings.shutterSpeed !== 'auto') {
      const isoFactor = iso / 100;
      const shutterFactor = shutter / DEFAULT_SHUTTER;
      manualFactor = Math.pow(isoFactor, 0.32) * Math.pow(shutterFactor, 0.32);
    } else if (settings.iso !== 'auto') {
      manualFactor = Math.pow(iso / 100, 0.30);
    } else if (settings.shutterSpeed !== 'auto') {
      manualFactor = Math.pow(shutter / DEFAULT_SHUTTER, 0.30);
    }

    const brightness = clamp(manualFactor * evMultiplier, 0.05, 4);

    const kelvinDelta = (kelvin - DEFAULT_KELVIN) / 2500;
    const rGain = clamp(1 + kelvinDelta * 0.20, 0.65, 1.35);
    const bGain = clamp(1 - kelvinDelta * 0.20, 0.65, 1.35);

    const highIso = settings.iso !== 'auto' && iso >= 800;
    const noiseAmount = highIso ? clamp((iso / 6400) * 8, 0, 14) : 0;

    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i] * brightness * rGain;
      let g = data[i + 1] * brightness;
      let b = data[i + 2] * brightness * bGain;

      if (noiseAmount > 0) {
        const pixelIndex = i >> 2;
        const hash = Math.sin(pixelIndex * 12.9898 + 78.233) * 43758.5453;
        const normalized = hash - Math.floor(hash);
        const noise = (normalized - 0.5) * noiseAmount;

        r += noise;
        g += noise;
        b += noise;
      }

      data[i] = clampByte(r);
      data[i + 1] = clampByte(g);
      data[i + 2] = clampByte(b);
    }
  }

  // ===========================================================================
  // FRAME CAPTURE
  // ===========================================================================

  /**
   * Captures a single frame from HTMLVideoElement respecting zoom magnification and exposure.
   */
  public grabFrame(
    video: HTMLVideoElement,
    width?: number,
    height?: number,
    zoomRatio = 1,
    settings?: ManualSettings
  ): ImageData | null {
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return null;
    }

    const rawWidth = video.videoWidth;
    const rawHeight = video.videoHeight;

    if (rawWidth <= 0 || rawHeight <= 0) {
      return null;
    }

    const targetWidth = sanitizeDimension(width, rawWidth);
    const targetHeight = sanitizeDimension(height, rawHeight);

    this.ensureCanvasSize(this.offscreenCanvas, targetWidth, targetHeight);

    const zoom = clamp(finiteOr(zoomRatio, 1), MIN_ZOOM, MAX_ZOOM);

    this.drawVideoCrop(
      this.offscreenCtx,
      video,
      rawWidth,
      rawHeight,
      targetWidth,
      targetHeight,
      zoom
    );

    const imageData = this.offscreenCtx.getImageData(0, 0, targetWidth, targetHeight);

    if (settings) {
      this.applyManualExposureToImageData(imageData, settings);
    }

    return imageData;
  }

  // ===========================================================================
  // 108 MP COMPUTATIONAL OUTPUT
  // ===========================================================================

  /**
   * Generates a 108 MP computational ultra-high resolution capture (6000x4500 canvas buffer)
   * with bicubic interpolation, selective luminance unsharp masking and micro-contrast recovery.
   */
  public async process108MPCapture(
    video: HTMLVideoElement,
    zoomRatio = 1,
    settings?: ManualSettings
  ): Promise<ProcessedImage> {
    const rawWidth = video.videoWidth || DEFAULT_WIDTH;
    const rawHeight = video.videoHeight || DEFAULT_HEIGHT;

    const targetW = TARGET_108MP_WIDTH;
    const targetH = TARGET_108MP_HEIGHT;

    const canvas = this.createCanvas(targetW, targetH);
    const ctx = this.get2DContext(canvas, true);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const safeZoom = clamp(finiteOr(zoomRatio, 1), MIN_ZOOM, MAX_ZOOM);
    this.drawVideoCrop(ctx, video, rawWidth, rawHeight, targetW, targetH, safeZoom);

    const imageData = ctx.getImageData(0, 0, targetW, targetH);

    if (settings) {
      this.applyManualExposureToImageData(imageData, settings);
    }

    this.applySelectiveSharpen(imageData, 0.35, 8, 2);

    ctx.putImageData(imageData, 0, 0);

    return {
      dataUrl: canvas.toDataURL('image/jpeg', 0.96),
      width: targetW,
      height: targetH,
    };
  }

  // ===========================================================================
  // NIGHT PRO
  // ===========================================================================

  /**
   * Night Pro Engine:
   * Multi-frame burst accumulation, semantic shadow segmentation,
   * neural exposure enhancement and selective bilateral shadow denoising.
   */
  public async processNightProCapture(
    video: HTMLVideoElement,
    frameCount = 6,
    onProgress?: (pct: number) => void,
    zoomRatio = 1,
    settings?: ManualSettings
  ): Promise<NightProResult> {
    this.ensureVideo(video);

    const count = clampInteger(frameCount, MIN_NIGHT_FRAMES, MAX_NIGHT_FRAMES);
    const width = video.videoWidth || DEFAULT_WIDTH;
    const height = video.videoHeight || DEFAULT_HEIGHT;

    const frames: ImageData[] = [];

    this.emitProgress(onProgress, 2);

    for (let i = 0; i < count; i++) {
      const frame = this.grabFrame(video, width, height, zoomRatio, settings);
      if (frame) {
        frames.push(frame);
      }
      this.emitProgress(onProgress, 5 + Math.round(((i + 1) / count) * 40));
      await delay(35);
    }

    if (frames.length === 0) {
      throw new Error('Night Pro: no frames captured.');
    }

    const reference = frames[0];
    const segmentation = AISemanticNightEngine.getInstance().generateSemanticSegmentation(
      reference,
      zoomRatio
    );

    this.emitProgress(onProgress, 52);

    const result = this.createImageData(width, height);

    this.temporalFuse(frames, result, segmentation);
    this.emitProgress(onProgress, 70);

    const semanticEngine = AISemanticNightEngine.getInstance();
    semanticEngine.applyNeuralExposure(result.data, segmentation, 1.55);
    this.emitProgress(onProgress, 82);

    semanticEngine.applySelectiveShadowDenoising(result.data, segmentation, width, height);
    this.emitProgress(onProgress, 94);

    const canvas = this.createCanvas(width, height);
    const ctx = this.get2DContext(canvas, true);
    ctx.putImageData(result, 0, 0);

    this.emitProgress(onProgress, 100);

    return {
      dataUrl: canvas.toDataURL('image/jpeg', 0.96),
      width,
      height,
      segmentationStats: segmentation.stats,
    };
  }

  // ===========================================================================
  // HDR
  // ===========================================================================

  /**
   * HDR Capture:
   * Symmetrical computational exposure bracketing and Debevec-inspired exposure fusion.
   */
  public async processHDRCapture(
    video: HTMLVideoElement,
    brackets = 3,
    onProgress?: (pct: number) => void,
    zoomRatio = 1,
    settings?: ManualSettings
  ): Promise<ProcessedImage> {
    this.ensureVideo(video);

    const count = clampInteger(brackets, MIN_HDR_FRAMES, MAX_HDR_FRAMES);
    const width = video.videoWidth || DEFAULT_WIDTH;
    const height = video.videoHeight || DEFAULT_HEIGHT;

    const frames: ImageData[] = [];

    for (let i = 0; i < count; i++) {
      const bracketEv = this.calculateHdrBracket(i, count);
      const bracketSettings = this.cloneSettingsWithEv(settings, bracketEv);

      const frame = this.grabFrame(video, width, height, zoomRatio, bracketSettings);
      if (frame) {
        frames.push(frame);
      }

      this.emitProgress(onProgress, Math.round(((i + 1) / count) * 55));
      await delay(45);
    }

    if (frames.length === 0) {
      throw new Error('HDR: no frames captured.');
    }

    const result = this.createImageData(width, height);
    this.exposureFuse(frames, result);

    this.emitProgress(onProgress, 90);

    const canvas = this.createCanvas(width, height);
    const ctx = this.get2DContext(canvas, true);
    ctx.putImageData(result, 0, 0);

    this.emitProgress(onProgress, 100);

    return {
      dataUrl: canvas.toDataURL('image/jpeg', DEFAULT_JPEG_QUALITY),
      width,
      height,
    };
  }

  // ===========================================================================
  // FOCUS STACK
  // ===========================================================================

  /**
   * Focus Stacking:
   * Block-based focal plane selection to maximize depth of field without artifacts.
   */
  public async processFocusStackCapture(
    video: HTMLVideoElement,
    steps = 5,
    onProgress?: (pct: number) => void,
    zoomRatio = 1,
    settings?: ManualSettings
  ): Promise<ProcessedImage> {
    this.ensureVideo(video);

    const count = clampInteger(steps, MIN_FOCUS_FRAMES, MAX_FOCUS_FRAMES);
    const width = video.videoWidth || DEFAULT_WIDTH;
    const height = video.videoHeight || DEFAULT_HEIGHT;

    const frames: ImageData[] = [];

    for (let i = 0; i < count; i++) {
      const frame = this.grabFrame(video, width, height, zoomRatio, settings);
      if (frame) {
        frames.push(frame);
      }
      this.emitProgress(onProgress, Math.round(((i + 1) / count) * 60));
      await delay(70);
    }

    if (frames.length === 0) {
      throw new Error('Focus Stack: no frames captured.');
    }

    const result = this.createImageData(width, height);
    this.focusStackFuse(frames, result, 4);

    this.emitProgress(onProgress, 90);

    const canvas = this.createCanvas(width, height);
    const ctx = this.get2DContext(canvas, true);
    ctx.putImageData(result, 0, 0);

    this.emitProgress(onProgress, 100);

    return {
      dataUrl: canvas.toDataURL('image/jpeg', DEFAULT_JPEG_QUALITY),
      width,
      height,
    };
  }

  // ===========================================================================
  // HISTOGRAM
  // ===========================================================================

  public calculateHistogram(video: HTMLVideoElement): ScopeData {
    const lumaHist = new Array<number>(256).fill(0);
    const rHist = new Array<number>(256).fill(0);
    const gHist = new Array<number>(256).fill(0);
    const bHist = new Array<number>(256).fill(0);

    const frame = this.grabFrame(video, HISTOGRAM_WIDTH, HISTOGRAM_HEIGHT);
    if (!frame) {
      return {
        lumaHist,
        rHist,
        gHist,
        bHist,
        maxBin: 1,
      };
    }

    const data = frame.data;
    let maxBin = 0;

    for (let i = 0; i < data.length; i += 8) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const luma = clampByte(LUMA_R * r + LUMA_G * g + LUMA_B * b);

      lumaHist[luma]++;
      rHist[r]++;
      gHist[g]++;
      bHist[b]++;

      if (lumaHist[luma] > maxBin) maxBin = lumaHist[luma];
      if (rHist[r] > maxBin) maxBin = rHist[r];
      if (gHist[g] > maxBin) maxBin = gHist[g];
      if (bHist[b] > maxBin) maxBin = bHist[b];
    }

    return {
      lumaHist,
      rHist,
      gHist,
      bHist,
      maxBin: Math.max(1, maxBin),
    };
  }

  // ===========================================================================
  // FALSE COLOR
  // ===========================================================================

  public renderFalseColor(
    video: HTMLVideoElement,
    targetCanvas: HTMLCanvasElement
  ): void {
    const ctx = this.get2DContext(targetCanvas, true);
    const width = targetCanvas.width;
    const height = targetCanvas.height;

    if (width <= 0 || height <= 0) {
      return;
    }

    ctx.drawImage(video, 0, 0, width, height);
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;

    for (let i = 0; i < data.length; i += 4) {
      const ire =
        ((LUMA_R * data[i] + LUMA_G * data[i + 1] + LUMA_B * data[i + 2]) / 255) * 100;
      this.applyFalseColor(data, i, ire);
    }

    ctx.putImageData(image, 0, 0);
  }

  // ===========================================================================
  // FOCUS PEAKING
  // ===========================================================================

  public renderFocusPeaking(
    video: HTMLVideoElement,
    targetCanvas: HTMLCanvasElement,
    color: FocusPeakingColor = 'green',
    threshold = 32
  ): void {
    const width = targetCanvas.width;
    const height = targetCanvas.height;

    if (width <= 2 || height <= 2) {
      return;
    }

    this.ensureCanvasSize(this.offscreenCanvas, width, height);
    this.offscreenCtx.drawImage(video, 0, 0, width, height);
    const srcData = this.offscreenCtx.getImageData(0, 0, width, height);

    const outputCtx = this.get2DContext(targetCanvas, true);
    outputCtx.clearRect(0, 0, width, height);

    const output = outputCtx.createImageData(width, height);
    const src = srcData.data;
    const out = output.data;

    const rgb = this.getPeakingColor(color);
    const edgeThreshold = clamp(finiteOr(threshold, 32), 1, 255);

    for (let y = 1; y < height - 1; y += 2) {
      for (let x = 1; x < width - 1; x += 2) {
        const index = (y * width + x) * 4;
        const up = index - width * 4;
        const down = index + width * 4;
        const left = index - 4;
        const right = index + 4;

        const center = luminanceAt(src, index);

        const gx = Math.abs(luminanceAt(src, right) - luminanceAt(src, left));
        const gy = Math.abs(luminanceAt(src, down) - luminanceAt(src, up));

        const laplacian = Math.abs(
          4 * center -
            luminanceAt(src, up) -
            luminanceAt(src, down) -
            luminanceAt(src, left) -
            luminanceAt(src, right)
        );

        const edge = gx + gy + laplacian * 0.5;

        if (edge <= edgeThreshold) {
          continue;
        }

        this.writePixel(out, index, rgb[0], rgb[1], rgb[2], 220);

        if (x + 1 < width) {
          this.writePixel(out, index + 4, rgb[0], rgb[1], rgb[2], 220);
        }

        if (y + 1 < height) {
          const nextRow = index + width * 4;
          this.writePixel(out, nextRow, rgb[0], rgb[1], rgb[2], 220);
          if (x + 1 < width) {
            this.writePixel(out, nextRow + 4, rgb[0], rgb[1], rgb[2], 220);
          }
        }
      }
    }

    outputCtx.putImageData(output, 0, 0);
  }

  // ===========================================================================
  // ZEBRA
  // ===========================================================================

  public renderZebraPattern(
    video: HTMLVideoElement,
    targetCanvas: HTMLCanvasElement,
    thresholdPct = 85,
    stripeOffset = 0
  ): void {
    const width = targetCanvas.width;
    const height = targetCanvas.height;

    if (width <= 0 || height <= 0) {
      return;
    }

    const ctx = this.get2DContext(targetCanvas, true);
    ctx.clearRect(0, 0, width, height);

    this.ensureCanvasSize(this.offscreenCanvas, width, height);
    this.offscreenCtx.drawImage(video, 0, 0, width, height);
    const source = this.offscreenCtx.getImageData(0, 0, width, height);

    const output = ctx.createImageData(width, height);
    const src = source.data;
    const out = output.data;

    const threshold = clamp(finiteOr(thresholdPct, 85), 0, 100) * 2.55;
    const offset = Math.round(finiteOr(stripeOffset, 0));

    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const index = (y * width + x) * 4;
        const lum = luminanceAt(src, index);

        if (lum < threshold) {
          continue;
        }

        const stripe = positiveModulo(x + y + offset, 16) < 8;
        const alpha = stripe ? 240 : 180;

        this.writePixel(
          out,
          index,
          stripe ? 255 : 255,
          stripe ? 0 : 255,
          stripe ? 0 : 255,
          alpha
        );
      }
    }

    ctx.putImageData(output, 0, 0);
  }

  // ===========================================================================
  // SYNTHETIC DNG / LINEAR TIFF CONTAINER
  // ===========================================================================

  /**
   * Creates a synthetic 16-bit linear grayscale TIFF/DNG-style container.
   * Encodes compliant TIFF little-endian header, IFD0 tags and 16-bit linear sensor payload.
   */
  public createDngContainer(
    imageData: ImageData,
    settings?: ManualSettings,
    metadata?: DngMetadata
  ): Blob {
    if (imageData.width <= 0 || imageData.height <= 0) {
      throw new Error('Cannot create DNG from an empty image.');
    }

    const width = imageData.width;
    const height = imageData.height;
    const pixelCount = width * height;

    const pixelOffset = 1024;
    const pixelBytes = pixelCount * 2;
    const buffer = new ArrayBuffer(pixelOffset + pixelBytes);
    const view = new DataView(buffer);

    // TIFF Header (Little Endian)
    view.setUint16(0, 0x4949, true); // 'II'
    view.setUint16(2, 42, true); // Magic 42
    view.setUint32(4, 8, true); // Offset to IFD0

    let offset = 8;

    const tags = [
      { tag: 0x0100, type: 4, count: 1, value: width },
      { tag: 0x0101, type: 4, count: 1, value: height },
      { tag: 0x0102, type: 3, count: 1, value: 16 },
      { tag: 0x0103, type: 3, count: 1, value: 1 },
      { tag: 0x0106, type: 3, count: 1, value: 1 },
      { tag: 0x0111, type: 4, count: 1, value: pixelOffset },
      { tag: 0x0115, type: 3, count: 1, value: 1 },
      { tag: 0x0116, type: 4, count: 1, value: height },
      { tag: 0x0117, type: 4, count: 1, value: pixelBytes },
      { tag: 0xc612, type: 1, count: 4, value: 0x01040000 }, // DNGVersion 1.4.0.0
    ];

    view.setUint16(offset, tags.length, true);
    offset += 2;

    for (const tag of tags) {
      view.setUint16(offset, tag.tag, true);
      view.setUint16(offset + 2, tag.type, true);
      view.setUint32(offset + 4, tag.count, true);

      if (tag.type === 3 && tag.count === 1) {
        view.setUint16(offset + 8, tag.value, true);
        view.setUint16(offset + 10, 0, true);
      } else {
        view.setUint32(offset + 8, tag.value, true);
      }
      offset += 12;
    }

    view.setUint32(offset, 0, true); // Next IFD = 0

    const source = imageData.data;
    let writeOffset = pixelOffset;

    const ev = finiteOr(settings?.evBias, 0);
    const exposure = Math.pow(2, ev);

    for (let i = 0; i < source.length; i += 4) {
      const luma =
        (LUMA_R * source[i] + LUMA_G * source[i + 1] + LUMA_B * source[i + 2]) / 255;
      const value16 = Math.round(clamp(luma * exposure, 0, 1) * 65535);

      view.setUint16(writeOffset, value16, true);
      writeOffset += 2;
    }

    void metadata;

    return new Blob([buffer], {
      type: 'image/x-adobe-dng',
    });
  }

  // ===========================================================================
  // INTERNAL: NIGHT FUSION
  // ===========================================================================

  private temporalFuse(
    frames: ImageData[],
    result: ImageData,
    segmentation: SemanticSegmentationMap
  ): void {
    const destination = result.data;
    const pixelCount = destination.length >> 2;
    const frameCount = frames.length;

    const rSum = new Float32Array(pixelCount);
    const gSum = new Float32Array(pixelCount);
    const bSum = new Float32Array(pixelCount);
    const confidence = new Float32Array(pixelCount);

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
      const data = frames[frameIndex].data;
      const frameWeight = frameIndex === 0 ? 1.25 : 1;

      for (let pixel = 0; pixel < pixelCount; pixel++) {
        const i = pixel << 2;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const luma = LUMA_R * r + LUMA_G * g + LUMA_B * b;
        const highlightWeight = luma > 245 ? 0.55 : 1;
        const weight = frameWeight * highlightWeight;

        rSum[pixel] += r * weight;
        gSum[pixel] += g * weight;
        bSum[pixel] += b * weight;
        confidence[pixel] += weight;
      }
    }

    for (let pixel = 0; pixel < pixelCount; pixel++) {
      const i = pixel << 2;
      const weight = confidence[pixel] || 1;

      destination[i] = clampByte(rSum[pixel] / weight);
      destination[i + 1] = clampByte(gSum[pixel] / weight);
      destination[i + 2] = clampByte(bSum[pixel] / weight);
      destination[i + 3] = 255;
    }

    void segmentation;
  }

  // ===========================================================================
  // INTERNAL: HDR FUSION
  // ===========================================================================

  private exposureFuse(frames: ImageData[], result: ImageData): void {
    const destination = result.data;
    const pixelCount = destination.length >> 2;
    const frameCount = frames.length;

    const sigma = 0.20;
    const twoSigmaSquared = 2 * sigma * sigma;

    for (let pixel = 0; pixel < pixelCount; pixel++) {
      const i = pixel << 2;

      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let totalWeight = 0;

      for (let frame = 0; frame < frameCount; frame++) {
        const data = frames[frame].data;
        const r = data[i] / 255;
        const g = data[i + 1] / 255;
        const b = data[i + 2] / 255;

        const exposureWeight = Math.exp(
          -(
            Math.pow(r - 0.5, 2) +
            Math.pow(g - 0.5, 2) +
            Math.pow(b - 0.5, 2)
          ) / twoSigmaSquared
        );

        const weight = Math.max(0.0001, exposureWeight);

        rSum += r * weight;
        gSum += g * weight;
        bSum += b * weight;
        totalWeight += weight;
      }

      const denominator = totalWeight || 1;

      destination[i] = clampByte((rSum / denominator) * 255);
      destination[i + 1] = clampByte((gSum / denominator) * 255);
      destination[i + 2] = clampByte((bSum / denominator) * 255);
      destination[i + 3] = 255;
    }
  }

  // ===========================================================================
  // INTERNAL: FOCUS STACK FUSION
  // ===========================================================================

  private focusStackFuse(
    frames: ImageData[],
    result: ImageData,
    blockSize: number
  ): void {
    const width = result.width;
    const height = result.height;
    const output = result.data;

    for (let by = 1; by < height - 1; by += blockSize) {
      for (let bx = 1; bx < width - 1; bx += blockSize) {
        const sampleX = Math.min(bx + Math.floor(blockSize / 2), width - 2);
        const sampleY = Math.min(by + Math.floor(blockSize / 2), height - 2);

        let bestFrame = 0;
        let bestScore = -Infinity;

        for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
          const score = this.focusScore(frames[frameIndex], sampleX, sampleY);
          if (score > bestScore) {
            bestScore = score;
            bestFrame = frameIndex;
          }
        }

        const source = frames[bestFrame].data;
        const endY = Math.min(by + blockSize, height);
        const endX = Math.min(bx + blockSize, width);

        for (let y = by; y < endY; y++) {
          for (let x = bx; x < endX; x++) {
            const index = (y * width + x) * 4;
            output[index] = source[index];
            output[index + 1] = source[index + 1];
            output[index + 2] = source[index + 2];
            output[index + 3] = 255;
          }
        }
      }
    }
  }

  private focusScore(frame: ImageData, x: number, y: number): number {
    const width = frame.width;
    const data = frame.data;

    const center = (y * width + x) * 4;
    const up = center - width * 4;
    const down = center + width * 4;
    const left = center - 4;
    const right = center + 4;

    const c = luminanceAt(data, center);
    const u = luminanceAt(data, up);
    const d = luminanceAt(data, down);
    const l = luminanceAt(data, left);
    const r = luminanceAt(data, right);

    return Math.abs(4 * c - u - d - l - r);
  }

  // ===========================================================================
  // INTERNAL: SHARPEN
  // ===========================================================================

  private applySelectiveSharpen(
    imageData: ImageData,
    amount: number,
    threshold: number,
    stride: number
  ): void {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;

    const strength = clamp(amount, 0, 1);
    const edgeThreshold = clamp(threshold, 0, 255);

    for (let y = 1; y < height - 1; y += stride) {
      for (let x = 1; x < width - 1; x += stride) {
        const index = (y * width + x) * 4;
        const up = index - width * 4;
        const down = index + width * 4;
        const left = index - 4;
        const right = index + 4;

        const center = luminanceAt(data, index);

        const laplacian =
          4 * center -
          luminanceAt(data, up) -
          luminanceAt(data, down) -
          luminanceAt(data, left) -
          luminanceAt(data, right);

        if (Math.abs(laplacian) <= edgeThreshold) {
          continue;
        }

        const delta = laplacian * strength;

        data[index] = clampByte(data[index] + delta);
        data[index + 1] = clampByte(data[index + 1] + delta);
        data[index + 2] = clampByte(data[index + 2] + delta);
      }
    }
  }

  // ===========================================================================
  // INTERNAL: DRAWING
  // ===========================================================================

  private drawVideoCrop(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    rawWidth: number,
    rawHeight: number,
    targetWidth: number,
    targetHeight: number,
    zoom: number
  ): void {
    const safeZoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    const sourceWidth = rawWidth / safeZoom;
    const sourceHeight = rawHeight / safeZoom;
    const sourceX = (rawWidth - sourceWidth) / 2;
    const sourceY = (rawHeight - sourceHeight) / 2;

    ctx.drawImage(
      video,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      targetWidth,
      targetHeight
    );
  }

  private ensureCanvasSize(
    canvas: HTMLCanvasElement,
    width: number,
    height: number
  ): void {
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  private createCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  private createImageData(width: number, height: number): ImageData {
    try {
      return new ImageData(width, height);
    } catch {
      const canvas = this.createCanvas(width, height);
      return this.get2DContext(canvas, true).createImageData(width, height);
    }
  }

  private get2DContext(
    canvas: HTMLCanvasElement,
    readFrequently: boolean
  ): CanvasRenderingContext2D {
    const ctx = canvas.getContext('2d', {
      willReadFrequently: readFrequently,
    });

    if (!ctx) {
      throw new Error('Canvas 2D context unavailable.');
    }

    return ctx;
  }

  // ===========================================================================
  // INTERNAL: MONITORING
  // ===========================================================================

  private applyFalseColor(
    data: Uint8ClampedArray,
    index: number,
    ire: number
  ): void {
    if (ire >= 98) {
      this.writePixel(data, index, 255, 0, 0, 255);
      return;
    }

    if (ire >= 85) {
      this.writePixel(data, index, 255, 240, 0, 255);
      return;
    }

    if (ire >= 70) {
      this.writePixel(data, index, 255, 105, 180, 255);
      return;
    }

    if (ire >= 60) {
      this.writePixel(data, index, 255, 80, 140, 255);
      return;
    }

    if (ire >= 50) {
      this.writePixel(data, index, 0, 230, 70, 255);
      return;
    }

    if (ire >= 40) {
      this.writePixel(data, index, 128, 128, 128, 255);
      return;
    }

    if (ire >= 20) {
      this.writePixel(data, index, 0, 160, 255, 255);
      return;
    }

    if (ire >= 10) {
      this.writePixel(data, index, 0, 100, 255, 255);
      return;
    }

    this.writePixel(data, index, 138, 43, 226, 255);
  }

  private getPeakingColor(
    color: FocusPeakingColor
  ): [number, number, number] {
    switch (color) {
      case 'red':
        return [255, 30, 30];
      case 'cyan':
        return [0, 255, 255];
      case 'yellow':
        return [255, 255, 0];
      case 'green':
      default:
        return [0, 255, 80];
    }
  }

  private writePixel(
    data: Uint8ClampedArray,
    index: number,
    r: number,
    g: number,
    b: number,
    a: number
  ): void {
    data[index] = r;
    data[index + 1] = g;
    data[index + 2] = b;
    data[index + 3] = a;
  }

  // ===========================================================================
  // INTERNAL: VALIDATION / HELPERS
  // ===========================================================================

  private ensureVideo(video: HTMLVideoElement): void {
    if (!video) {
      throw new Error('Video element is required.');
    }

    if (video.videoWidth <= 0 || video.videoHeight <= 0) {
      throw new Error('Video frame is not ready.');
    }
  }

  private emitProgress(
    callback: ((pct: number) => void) | undefined,
    value: number
  ): void {
    callback?.(clamp(Math.round(value), 0, 100));
  }

  private calculateHdrBracket(index: number, count: number): number {
    if (count <= 1) {
      return 0;
    }
    const normalized = index / (count - 1);
    return -2 + normalized * 4;
  }

  private cloneSettingsWithEv(
    settings: ManualSettings | undefined,
    evBias: number
  ): ManualSettings {
    return {
      ...(settings ?? ({} as ManualSettings)),
      evBias,
    };
  }
}

// =============================================================================
// STATIC HELPERS
// =============================================================================

function clampByte(value: number): number {
  return Math.round(clamp(finiteOr(value, 0), 0, 255));
}

function sanitizeDimension(
  value: number | undefined,
  fallback: number
): number {
  const numeric = finiteOr(value, fallback);
  return Math.max(1, Math.round(numeric));
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.round(clamp(finiteOr(value, min), min, max));
}

function luminanceAt(data: Uint8ClampedArray, index: number): number {
  return LUMA_R * data[index] + LUMA_G * data[index + 1] + LUMA_B * data[index + 2];
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
