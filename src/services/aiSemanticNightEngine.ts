/**
 * AI Semantic Night Vision Segmentation & Neural Exposure Engine v2
 *
 * Real-time oriented semantic night enhancement engine.
 *
 * Pipeline:
 *   1. Luminance / chromaticity extraction
 *   2. Multi-feature semantic classification
 *   3. Continuous shadow confidence
 *   4. Adaptive exposure / tone mapping
 *   5. Selective edge-aware bilateral denoising
 *   6. Deterministic organic grain preservation
 *
 * NOTE:
 * This is a neural-inspired heuristic engine, not an actual ML model.
 * It is intentionally dependency-free and suitable for browser / WebView
 * / TypeScript camera pipelines.
 */

export type SemanticRegionType =
  | 'deep_shadow'
  | 'mid_shadow'
  | 'texture_detail'
  | 'sky_horizon'
  | 'highlight_glow'
  | 'neutral_mid';

export interface SemanticSegmentationMap {
  width: number;
  height: number;

  /**
   * Class IDs:
   * 0 = deep_shadow
   * 1 = mid_shadow
   * 2 = texture_detail
   * 3 = sky_horizon
   * 4 = highlight_glow
   * 5 = neutral_mid
   */
  classMap: Uint8Array;

  /**
   * Continuous shadow/exposure confidence.
   * 0 = no lift
   * 1 = maximum shadow recovery
   */
  shadowWeightMap: Float32Array;

  /**
   * 0 = flat/smooth
   * 1 = strong local edge/texture
   */
  edgeTextureMap: Float32Array;

  stats: {
    shadowFraction: number;
    skyFraction: number;
    textureFraction: number;
    highlightFraction: number;
    meanLuma: number;
    dynamicRange: number;
  };
}

interface SceneStats {
  meanLuma: number;
  p05: number;
  p50: number;
  p95: number;
}

export class AISemanticNightEngine {
  private static instance: AISemanticNightEngine;

  private constructor() {}

  public static getInstance(): AISemanticNightEngine {
    if (!AISemanticNightEngine.instance) {
      AISemanticNightEngine.instance = new AISemanticNightEngine();
    }

    return AISemanticNightEngine.instance;
  }

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  private static readonly DEEP_SHADOW_LUMA = 32;
  private static readonly MID_SHADOW_LUMA = 92;

  private static readonly HIGHLIGHT_LUMA = 225;
  private static readonly HIGHLIGHT_SATURATION = 0.18;

  private static readonly SKY_MAX_Y = 0.48;
  private static readonly SKY_MAX_LUMA = 72;
  private static readonly SKY_MAX_GRADIENT = 10;
  private static readonly SKY_MAX_SATURATION = 0.32;

  private static readonly EDGE_START = 5;
  private static readonly EDGE_FULL = 38;

  private static readonly BILATERAL_RADIUS = 2;
  private static readonly SIGMA_COLOR = 30;

  /**
   * Gaussian-ish 5x5 kernel.
   *
   * Sum does not need to equal 1 because normalization is performed
   * dynamically by the bilateral filter.
   */
  private static readonly SPATIAL_KERNEL = new Float32Array([
    1,  4,  7,  4, 1,
    4, 16, 26, 16, 4,
    7, 26, 41, 26, 7,
    4, 16, 26, 16, 4,
    1,  4,  7,  4, 1,
  ]);

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  public generateSemanticSegmentation(
    frame: ImageData,
    zoomRatio: number = 1.0
  ): SemanticSegmentationMap {
    const width = frame.width;
    const height = frame.height;

    if (width <= 0 || height <= 0) {
      throw new Error('Invalid ImageData dimensions.');
    }

    const data = frame.data;
    const totalPixels = width * height;

    if (data.length < totalPixels * 4) {
      throw new Error('ImageData buffer is smaller than expected.');
    }

    const classMap = new Uint8Array(totalPixels);
    const shadowWeightMap = new Float32Array(totalPixels);
    const edgeTextureMap = new Float32Array(totalPixels);

    const lumaBuffer = new Float32Array(totalPixels);

    const sceneStats = this.calculateSceneStatistics(
      data,
      lumaBuffer
    );

    let deepShadowCount = 0;
    let midShadowCount = 0;
    let skyCount = 0;
    let textureCount = 0;
    let highlightCount = 0;

    /*
     * Zoom can influence spatial assumptions slightly.
     *
     * Digital zoom tends to amplify texture/noise, therefore we become
     * slightly more conservative with texture classification.
     */
    const safeZoom = Math.max(1, zoomRatio);
    const textureThreshold = Math.min(
      0.65,
      0.45 + (safeZoom - 1) * 0.04
    );

    for (let y = 0; y < height; y++) {
      const yNorm = height > 1 ? y / (height - 1) : 0;

      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const pixelIndex = i * 4;

        const r = data[pixelIndex];
        const g = data[pixelIndex + 1];
        const b = data[pixelIndex + 2];

        const luma = lumaBuffer[i];

        // ---------------------------------------------------------------
        // Local gradient
        // ---------------------------------------------------------------

        const left = y * width + Math.max(0, x - 1);
        const right = y * width + Math.min(width - 1, x + 1);
        const top = Math.max(0, y - 1) * width + x;
        const bottom = Math.min(height - 1, y + 1) * width + x;

        const gx = Math.abs(
          lumaBuffer[right] - lumaBuffer[left]
        );

        const gy = Math.abs(
          lumaBuffer[bottom] - lumaBuffer[top]
        );

        /*
         * L1 gradient is cheap and works well for real-time camera frames.
         */
        const gradient = Math.min(255, gx + gy);

        const edgeConfidence = this.smoothStep(
          AISemanticNightEngine.EDGE_START,
          AISemanticNightEngine.EDGE_FULL,
          gradient
        );

        edgeTextureMap[i] = edgeConfidence;

        // ---------------------------------------------------------------
        // Chromaticity
        // ---------------------------------------------------------------

        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);

        const saturation =
          maxC > 0
            ? (maxC - minC) / maxC
            : 0;

        const chroma = maxC - minC;

        /*
         * Instead of simplistic "green > red" detection,
         * use relative chroma relationships.
         */
        const foliageScore =
          this.clamp01(
            ((g - r) / 70) * 0.55 +
            ((g - b) / 90) * 0.45
          ) *
          this.smoothStep(20, 70, luma);

        const redObjectScore =
          this.clamp01(
            ((r - g) / 80) * 0.6 +
            ((r - b) / 90) * 0.4
          ) *
          this.smoothStep(20, 80, luma);

        const saturatedObject =
          saturation > 0.22 && chroma > 18;

        // ---------------------------------------------------------------
        // Semantic scores
        // ---------------------------------------------------------------

        const shadowScore = this.calculateShadowWeight(
          luma,
          sceneStats.meanLuma
        );

        const deepShadowScore =
          this.smoothStep(0, AISemanticNightEngine.DEEP_SHADOW_LUMA, 40 - luma);

        const midShadowScore =
          this.smoothStep(
            AISemanticNightEngine.DEEP_SHADOW_LUMA,
            AISemanticNightEngine.MID_SHADOW_LUMA,
            luma
          );

        /*
         * Smooth sky prior.
         *
         * Sky is not simply "top + dark".
         * We require low texture and low saturation.
         */
        const skyPositionScore =
          1 -
          this.smoothStep(
            AISemanticNightEngine.SKY_MAX_Y,
            0.65,
            yNorm
          );

        const skyLumaScore =
          1 -
          this.smoothStep(
            AISemanticNightEngine.SKY_MAX_LUMA,
            105,
            luma
          );

        const skyGradientScore =
          1 -
          this.smoothStep(
            AISemanticNightEngine.SKY_MAX_GRADIENT,
            24,
            gradient
          );

        const skySaturationScore =
          1 -
          this.smoothStep(
            AISemanticNightEngine.SKY_MAX_SATURATION,
            0.55,
            saturation
          );

        const skyScore =
          skyPositionScore *
          skyLumaScore *
          skyGradientScore *
          skySaturationScore;

        // ---------------------------------------------------------------
        // Highlight score
        // ---------------------------------------------------------------

        /*
         * Very bright low-saturation pixels are likely light sources.
         *
         * Saturated bright objects are treated less aggressively so
         * flowers / signs / colored objects do not become "light sources".
         */
        const highlightLumaScore =
          this.smoothStep(
            AISemanticNightEngine.HIGHLIGHT_LUMA,
            255,
            luma
          );

        const highlightScore =
          highlightLumaScore *
          (
            1 -
            this.smoothStep(
              AISemanticNightEngine.HIGHLIGHT_SATURATION,
              0.7,
              saturation
            )
          );

        // ---------------------------------------------------------------
        // Texture score
        // ---------------------------------------------------------------

        const textureScore = this.clamp01(
          edgeConfidence * 0.62 +
          foliageScore * 0.22 +
          redObjectScore * 0.10 +
          (saturatedObject ? 0.06 : 0)
        );

        // ---------------------------------------------------------------
        // Classification
        // ---------------------------------------------------------------

        let semanticClass: number;

        /*
         * Priority order matters:
         *
         * 1. Highlight
         * 2. Texture
         * 3. Sky
         * 4. Deep shadow
         * 5. Mid shadow
         * 6. Neutral
         */

        if (highlightScore > 0.55) {
          semanticClass = 4;
          highlightCount++;
        } else if (textureScore > textureThreshold) {
          semanticClass = 2;
          textureCount++;
        } else if (skyScore > 0.52) {
          semanticClass = 3;
          skyCount++;
        } else if (deepShadowScore > 0.45) {
          semanticClass = 0;
          deepShadowCount++;
        } else if (midShadowScore > 0.35) {
          semanticClass = 1;
          midShadowCount++;
        } else {
          semanticClass = 5;
        }

        classMap[i] = semanticClass;

        // ---------------------------------------------------------------
        // Continuous exposure weight
        // ---------------------------------------------------------------

        let exposureWeight = shadowScore;

        switch (semanticClass) {
          case 0:
            exposureWeight *= 1.00;
            break;

          case 1:
            exposureWeight *= 0.78;
            break;

          case 2:
            exposureWeight *= 0.38;
            break;

          case 3:
            exposureWeight *= 0.20;
            break;

          case 4:
            exposureWeight = 0;
            break;

          default:
            exposureWeight *= 0.08;
            break;
        }

        /*
         * Strong edges automatically reduce shadow lifting.
         * This prevents bright halos around leaves, buildings and lamps.
         */
        exposureWeight *= 1 - edgeConfidence * 0.35;

        shadowWeightMap[i] = this.clamp01(exposureWeight);
      }
    }

    const shadowFraction =
      (deepShadowCount + midShadowCount) / totalPixels;

    const dynamicRange =
      sceneStats.p95 - sceneStats.p05;

    return {
      width,
      height,
      classMap,
      shadowWeightMap,
      edgeTextureMap,

      stats: {
        shadowFraction,
        skyFraction: skyCount / totalPixels,
        textureFraction: textureCount / totalPixels,
        highlightFraction: highlightCount / totalPixels,
        meanLuma: sceneStats.meanLuma,
        dynamicRange,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Neural Exposure
  // ---------------------------------------------------------------------------

  public applyNeuralExposure(
    data: Uint8ClampedArray,
    segMap: SemanticSegmentationMap,
    exposureBoostMultiplier: number = 1.65
  ): void {
    const width = segMap.width;
    const height = segMap.height;
    const total = width * height;

    if (data.length < total * 4) {
      throw new Error('Image buffer does not match segmentation map.');
    }

    const boost =
      Math.max(1, exposureBoostMultiplier);

    const shadowWeights = segMap.shadowWeightMap;
    const classMap = segMap.classMap;

    for (let i = 0; i < total; i++) {
      const idx = i * 4;

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const semanticClass = classMap[i];
      const shadowWeight = shadowWeights[i];

      let regionalStrength: number;

      switch (semanticClass) {
        case 0:
          regionalStrength = 1.30;
          break;

        case 1:
          regionalStrength = 0.98;
          break;

        case 2:
          regionalStrength = 0.58;
          break;

        case 3:
          regionalStrength = 0.25;
          break;

        case 4:
          regionalStrength = 0;
          break;

        default:
          regionalStrength = 0.05;
          break;
      }

      /*
       * Convert exposure multiplier into an additive logarithmic-style
       * strength. This behaves more naturally than directly multiplying
       * RGB values.
       */
      const exposure =
        1 +
        (boost - 1) *
        regionalStrength *
        shadowWeight;

      if (semanticClass === 4) {
        /*
         * Soft highlight compression.
         */
        data[idx] =
          this.highlightCompress(r, 215, 255);

        data[idx + 1] =
          this.highlightCompress(g, 215, 255);

        data[idx + 2] =
          this.highlightCompress(b, 215, 255);

        continue;
      }

      let newR = r * exposure;
      let newG = g * exposure;
      let newB = b * exposure;

      // ---------------------------------------------------------------
      // Shadow chroma preservation
      // ---------------------------------------------------------------

      if (shadowWeight > 0.25 && semanticClass !== 3) {
        const luma =
          0.2126 * newR +
          0.7152 * newG +
          0.0722 * newB;

        /*
         * Less aggressive than the original 1.15 saturation boost.
         * Large saturation boosts amplify chroma noise in dark frames.
         */
        const saturationBoost =
          1 + 0.08 * shadowWeight;

        newR =
          luma +
          (newR - luma) * saturationBoost;

        newG =
          luma +
          (newG - luma) * saturationBoost;

        newB =
          luma +
          (newB - luma) * saturationBoost;
      }

      /*
       * Final soft shoulder.
       */
      data[idx] = this.softClip(newR);
      data[idx + 1] = this.softClip(newG);
      data[idx + 2] = this.softClip(newB);
    }
  }

  // ---------------------------------------------------------------------------
  // Selective Bilateral Denoising
  // ---------------------------------------------------------------------------

  public applySelectiveShadowDenoising(
    data: Uint8ClampedArray,
    segMap: SemanticSegmentationMap,
    w: number,
    h: number
  ): void {
    if (w <= 0 || h <= 0) {
      return;
    }

    const total = w * h;

    if (
      data.length < total * 4 ||
      segMap.classMap.length < total ||
      segMap.edgeTextureMap.length < total
    ) {
      throw new Error('Invalid image / segmentation buffer dimensions.');
    }

    /*
     * Snapshot only once.
     *
     * This prevents filtered pixels from contaminating later neighborhoods.
     */
    const source = new Uint8ClampedArray(data);

    const classMap = segMap.classMap;
    const edgeMap = segMap.edgeTextureMap;

    const radius =
      AISemanticNightEngine.BILATERAL_RADIUS;

    const sigmaColor =
      AISemanticNightEngine.SIGMA_COLOR;

    const invTwoSigmaSq =
      1 / (2 * sigmaColor * sigmaColor);

    for (let y = radius; y < h - radius; y++) {
      for (let x = radius; x < w - radius; x++) {
        const i = y * w + x;

        const semanticClass = classMap[i];
        const edgeConfidence = edgeMap[i];

        /*
         * Texture and strong edges receive either no denoising
         * or only an extremely weak blend.
         */
        if (
          semanticClass === 2 ||
          edgeConfidence > 0.55
        ) {
          continue;
        }

        if (
          semanticClass !== 0 &&
          semanticClass !== 1 &&
          semanticClass !== 3
        ) {
          continue;
        }

        const center = i * 4;

        const cR = source[center];
        const cG = source[center + 1];
        const cB = source[center + 2];

        let weightedR = 0;
        let weightedG = 0;
        let weightedB = 0;
        let totalWeight = 0;

        let kernelIndex = 0;

        for (let dy = -radius; dy <= radius; dy++) {
          const row =
            (y + dy) * w;

          for (let dx = -radius; dx <= radius; dx++) {
            const n =
              (row + x + dx) * 4;

            const nR = source[n];
            const nG = source[n + 1];
            const nB = source[n + 2];

            const dr = nR - cR;
            const dg = nG - cG;
            const db = nB - cB;

            const colorDistanceSq =
              dr * dr +
              dg * dg +
              db * db;

            const rangeWeight =
              Math.exp(
                -colorDistanceSq *
                invTwoSigmaSq
              );

            const spatialWeight =
              AISemanticNightEngine.SPATIAL_KERNEL[
                kernelIndex++
              ];

            const weight =
              spatialWeight *
              rangeWeight;

            weightedR += nR * weight;
            weightedG += nG * weight;
            weightedB += nB * weight;

            totalWeight += weight;
          }
        }

        if (totalWeight <= 0.0001) {
          continue;
        }

        const filteredR =
          weightedR / totalWeight;

        const filteredG =
          weightedG / totalWeight;

        const filteredB =
          weightedB / totalWeight;

        // ---------------------------------------------------------------
        // Adaptive blend
        // ---------------------------------------------------------------

        let baseBlend: number;

        switch (semanticClass) {
          case 0:
            baseBlend = 0.78;
            break;

          case 1:
            baseBlend = 0.52;
            break;

          case 3:
            baseBlend = 0.68;
            break;

          default:
            baseBlend = 0;
        }

        /*
         * Strong local texture reduces smoothing.
         */
        const blend =
          baseBlend *
          (1 - edgeConfidence * 0.65);

        // ---------------------------------------------------------------
        // Deterministic organic grain
        // ---------------------------------------------------------------

        const grain =
          this.deterministicGrain(
            x,
            y,
            cR + cG * 0.7 + cB * 0.3
          );

        const grainStrength =
          semanticClass === 0
            ? 1.25
            : semanticClass === 3
              ? 0.75
              : 0.55;

        data[center] =
          this.clampByte(
            cR * (1 - blend) +
            filteredR * blend +
            grain * grainStrength
          );

        data[center + 1] =
          this.clampByte(
            cG * (1 - blend) +
            filteredG * blend +
            grain * grainStrength
          );

        data[center + 2] =
          this.clampByte(
            cB * (1 - blend) +
            filteredB * blend +
            grain * grainStrength
          );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Scene Statistics
  // ---------------------------------------------------------------------------

  private calculateSceneStatistics(
    data: Uint8ClampedArray,
    lumaBuffer: Float32Array
  ): SceneStats {
    const totalPixels =
      lumaBuffer.length;

    const histogram =
      new Uint32Array(256);

    let sum = 0;

    for (let i = 0; i < totalPixels; i++) {
      const idx = i * 4;

      const luma =
        0.2126 * data[idx] +
        0.7152 * data[idx + 1] +
        0.0722 * data[idx + 2];

      lumaBuffer[i] = luma;

      histogram[
        Math.min(255, Math.max(0, Math.round(luma)))
      ]++;

      sum += luma;
    }

    return {
      meanLuma:
        sum / Math.max(1, totalPixels),

      p05:
        this.histogramPercentile(
          histogram,
          totalPixels,
          0.05
        ),

      p50:
        this.histogramPercentile(
          histogram,
          totalPixels,
          0.50
        ),

      p95:
        this.histogramPercentile(
          histogram,
          totalPixels,
          0.95
        ),
    };
  }

  private histogramPercentile(
    histogram: Uint32Array,
    total: number,
    percentile: number
  ): number {
    const target =
      Math.max(
        1,
        Math.floor(total * percentile)
      );

    let accumulated = 0;

    for (let i = 0; i < histogram.length; i++) {
      accumulated += histogram[i];

      if (accumulated >= target) {
        return i;
      }
    }

    return 255;
  }

  // ---------------------------------------------------------------------------
  // Shadow Model
  // ---------------------------------------------------------------------------

  private calculateShadowWeight(
    luma: number,
    meanLuma: number
  ): number {
    /*
     * Absolute darkness component.
     */
    const absoluteShadow =
      1 -
      this.smoothStep(
        28,
        115,
        luma
      );

    /*
     * Scene-relative darkness.
     *
     * This helps when shooting in extremely dark environments where
     * almost the entire image sits below 100 luma.
     */
    const relativeShadow =
      this.clamp01(
        (meanLuma - luma + 18) / 100
      );

    return this.clamp01(
      absoluteShadow * 0.72 +
      relativeShadow * 0.28
    );
  }

  // ---------------------------------------------------------------------------
  // Tone helpers
  // ---------------------------------------------------------------------------

  private highlightCompress(
    value: number,
    kneeStart: number,
    maxValue: number
  ): number {
    if (value <= kneeStart) {
      return value;
    }

    const t =
      this.clamp01(
        (value - kneeStart) /
        (maxValue - kneeStart)
      );

    /*
     * Smooth shoulder.
     */
    const compressed =
      kneeStart +
      (maxValue - kneeStart) *
      (1 - Math.pow(1 - t, 1.65));

    return this.clampByte(compressed);
  }

  private softClip(value: number): number {
    if (value <= 0) {
      return 0;
    }

    if (value >= 255) {
      /*
       * Soft shoulder instead of hard clipping.
       */
      return 255;
    }

    if (value > 220) {
      const t =
        (value - 220) / 35;

      return this.clampByte(
        220 +
        35 *
        (1 - Math.pow(1 - t, 1.35))
      );
    }

    return this.clampByte(value);
  }

  // ---------------------------------------------------------------------------
  // Deterministic Grain
  // ---------------------------------------------------------------------------

  /**
   * Stable pseudo-random noise based on pixel coordinates.
   *
   * Unlike Math.random(), this does NOT change randomly every frame.
   *
   * This avoids visible temporal flickering in video.
   */
  private deterministicGrain(
    x: number,
    y: number,
    seed: number
  ): number {
    let n =
      Math.imul(
        x + 374761393,
        668265263
      );

    n =
      Math.imul(
        n ^ Math.imul(y + 1274126177, 2246822519),
        3266489917
      );

    n ^=
      Math.imul(
        Math.floor(seed),
        374761393
      );

    n ^=
      n >>> 13;

    n =
      Math.imul(
        n,
        1274126177
      );

    n ^=
      n >>> 16;

    /*
     * Convert unsigned 32-bit integer into [-1, 1].
     */
    return (
      (n >>> 0) / 4294967295
    ) * 2 - 1;
  }

  // ---------------------------------------------------------------------------
  // Math helpers
  // ---------------------------------------------------------------------------

  private smoothStep(
    edge0: number,
    edge1: number,
    value: number
  ): number {
    if (edge0 === edge1) {
      return value >= edge1 ? 1 : 0;
    }

    const t =
      this.clamp01(
        (value - edge0) /
        (edge1 - edge0)
      );

    return (
      t * t * (3 - 2 * t)
    );
  }

  private clamp01(value: number): number {
    return value < 0
      ? 0
      : value > 1
        ? 1
        : value;
  }

  private clampByte(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }

    return value <= 0
      ? 0
      : value >= 255
        ? 255
        : value;
  }
}
