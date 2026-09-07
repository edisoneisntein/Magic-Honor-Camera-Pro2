import { AIScenePrediction } from '../types';

export class AISceneEngine {
  private static instance: AISceneEngine;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 160;
    this.canvas.height = 120;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  }

  public static getInstance(): AISceneEngine {
    if (!AISceneEngine.instance) {
      AISceneEngine.instance = new AISceneEngine();
    }
    return AISceneEngine.instance;
  }

  public analyzeFrame(video: HTMLVideoElement): AIScenePrediction {
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      return {
        scene: 'Standard Auto',
        confidence: 0.85,
        recommendedIso: 200,
        recommendedShutter: '1/125s',
        recommendedWb: '5500K (Luz Día)',
        recommendedHdr: false,
        recommendedMultiFrame: false,
        reasoning: 'Condición de luz estándar detectada.',
        lightLevel: 'Normal',
      };
    }

    this.ctx.drawImage(video, 0, 0, 160, 120);
    const imgData = this.ctx.getImageData(0, 0, 160, 120);
    const data = imgData.data;
    const totalPixels = 160 * 120;

    let totalLuma = 0;
    let redSum = 0;
    let greenSum = 0;
    let blueSum = 0;
    let darkPixels = 0;
    let brightPixels = 0;
    let centerLuma = 0;
    let centerPixels = 0;

    // Edge estimation
    let edgeEnergy = 0;

    for (let y = 0; y < 120; y++) {
      for (let x = 0; x < 160; x++) {
        const i = (y * 160 + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;

        totalLuma += luma;
        redSum += r;
        greenSum += g;
        blueSum += b;

        if (luma < 40) darkPixels++;
        if (luma > 215) brightPixels++;

        // Center weight (for portrait/macro focus evaluation)
        if (x >= 50 && x <= 110 && y >= 35 && y <= 85) {
          centerLuma += luma;
          centerPixels++;
        }

        // Horizontal gradient
        if (x < 159) {
          const nextR = data[i + 4];
          const nextG = data[i + 5];
          const nextB = data[i + 6];
          const nextLuma = 0.299 * nextR + 0.587 * nextG + 0.114 * nextB;
          edgeEnergy += Math.abs(nextLuma - luma);
        }
      }
    }

    const avgLuma = totalLuma / totalPixels;
    const avgR = redSum / totalPixels;
    const avgG = greenSum / totalPixels;
    const avgB = blueSum / totalPixels;
    const avgCenterLuma = centerLuma / centerPixels;
    const avgEdge = edgeEnergy / totalPixels;
    const dynamicRangeRatio = (brightPixels + darkPixels) / totalPixels;

    // Rule-based classification calibrated for mobile imaging
    if (avgLuma < 35 || darkPixels / totalPixels > 0.6) {
      return {
        scene: 'Night',
        confidence: 0.94,
        recommendedIso: 800,
        recommendedShutter: '1/15s (OIS asistido)',
        recommendedWb: '4200K (Cálido controlado)',
        recommendedHdr: true,
        recommendedMultiFrame: true,
        reasoning: `Iluminación baja crítica (Luma ${Math.round(avgLuma)}/255). Se recomienda ráfaga multi-frame Night Pro para fusionar 6 frames y reducir ruido térmico.`,
        lightLevel: 'Low-light',
      };
    }

    if (dynamicRangeRatio > 0.45 && brightPixels / totalPixels > 0.15) {
      return {
        scene: 'High Dynamic Range',
        confidence: 0.91,
        recommendedIso: 100,
        recommendedShutter: '1/500s (Auto bracketing)',
        recommendedWb: '5600K',
        recommendedHdr: true,
        recommendedMultiFrame: true,
        reasoning: `Alto contraste entre luces y sombras (Ratio DR ${(dynamicRangeRatio * 100).toFixed(0)}%). Se aconseja HDR Auto-Bracketing (-2EV / 0EV / +2EV).`,
        lightLevel: 'Overexposed',
      };
    }

    if (avgR > avgB * 1.35 && avgR > 110 && avgLuma > 60 && avgLuma < 170) {
      return {
        scene: 'Sunset',
        confidence: 0.88,
        recommendedIso: 100,
        recommendedShutter: '1/250s',
        recommendedWb: '6200K (Acentuar calidez crepuscular)',
        recommendedHdr: true,
        recommendedMultiFrame: false,
        reasoning: 'Predominio de tonos cálidos y cielo dorado. Balance Kelvin optimizado para tonos anaranjados.',
        lightLevel: 'Golden-hour',
      };
    }

    if (avgEdge > 28 && avgCenterLuma > 70 && avgCenterLuma < 190) {
      return {
        scene: 'Macro',
        confidence: 0.84,
        recommendedIso: 100,
        recommendedShutter: '1/250s',
        recommendedWb: '5200K',
        recommendedHdr: false,
        recommendedMultiFrame: true,
        reasoning: 'Gran densidad de micro-detalles y bordes en el centro. Se recomienda Focus Stacking de 5 pasos para profundidad de campo infinita.',
        lightLevel: 'Normal',
      };
    }

    if (avgCenterLuma > avgLuma * 1.25 && avgG > avgB) {
      return {
        scene: 'Portrait',
        confidence: 0.86,
        recommendedIso: 100,
        recommendedShutter: '1/160s',
        recommendedWb: '5400K (Tono de piel fiel)',
        recommendedHdr: false,
        recommendedMultiFrame: false,
        reasoning: 'Sujeto central iluminado con gradiente suave. Bokeh computacional f/1.75 activado.',
        lightLevel: 'Normal',
      };
    }

    if (avgG > avgR * 1.15 && avgLuma > 80) {
      return {
        scene: 'Landscape',
        confidence: 0.89,
        recommendedIso: 50,
        recommendedShutter: '1/320s',
        recommendedWb: '5600K (Luz Solar)',
        recommendedHdr: true,
        recommendedMultiFrame: false,
        reasoning: 'Amplio campo de visión con tonos verdes y cielo abierto. 108 MP recomendado para máxima resolución de follaje.',
        lightLevel: 'Normal',
      };
    }

    return {
      scene: 'Standard Auto',
      confidence: 0.9,
      recommendedIso: 100,
      recommendedShutter: '1/125s',
      recommendedWb: '5500K',
      recommendedHdr: false,
      recommendedMultiFrame: false,
      reasoning: 'Escena equilibrada en luz diurna. Configuración óptima para máxima fidelidad.',
      lightLevel: 'Normal',
    };
  }
}
