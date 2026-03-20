import sharp from 'sharp';

export interface ImageQualityScore {
  overall: number;
  blur: number;
  glare: number;
  lowLight: number;
  crop: number;
  issues: string[];
  suggestions: string[];
  isPoorQuality: boolean;
}

const THRESHOLDS = {
  BLUR_VARIANCE: 300,
  GLARE_PERCENTAGE: 0.15,
  LOW_LIGHT_PERCENTAGE: 0.4,
  EDGE_DENSITY_MIN: 0.02,
  MIN_DIMENSION: 200,
};

export async function analyzeImageQuality(imageBuffer: Buffer): Promise<ImageQualityScore> {
  const issues: string[] = [];
  const suggestions: string[] = [];

  const blurScore = await detectBlur(imageBuffer);
  const glareScore = await detectGlare(imageBuffer);
  const lowLightScore = await detectLowLight(imageBuffer);
  const cropScore = await analyzeFraming(imageBuffer);

  if (blurScore < 0.5) {
    issues.push('Image appears blurry');
    suggestions.push('Hold camera steady or use a tripod');
  }

  if (glareScore < 0.5) {
    issues.push('Image has glare or overexposed areas');
    suggestions.push('Reduce glare by adjusting lighting angle');
  }

  if (lowLightScore < 0.5) {
    issues.push('Image is too dark');
    suggestions.push('Increase lighting or use flash');
  }

  if (cropScore < 0.5) {
    issues.push('Document may be cropped or too small');
    suggestions.push('Fill frame with document, flatten paper');
  }

  const overall = blurScore * 0.4 + glareScore * 0.25 + lowLightScore * 0.2 + cropScore * 0.15;
  const isPoorQuality = overall < 0.5 || issues.length >= 2;

  return {
    overall,
    blur: blurScore,
    glare: glareScore,
    lowLight: lowLightScore,
    crop: cropScore,
    issues,
    suggestions,
    isPoorQuality,
  };
}

async function detectBlur(imageBuffer: Buffer): Promise<number> {
  try {
    const laplacianKernel = {
      width: 3,
      height: 3,
      kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
    };

    const { data } = await sharp(imageBuffer)
      .greyscale()
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .convolve(laplacianKernel)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const mean = data.reduce((a: number, b: number) => a + b, 0) / data.length;
    const variance =
      data.reduce((sum: number, val: number) => sum + Math.pow(val - mean, 2), 0) / data.length;

    const score = Math.min(1, variance / THRESHOLDS.BLUR_VARIANCE);
    return score;
  } catch (error) {
    console.error('[ImageQuality] Blur detection failed:', error);
    return 0.7;
  }
}

async function detectGlare(imageBuffer: Buffer): Promise<number> {
  try {
    const { data, info } = await sharp(imageBuffer)
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let overexposedPixels = 0;
    const threshold = 250;
    const channels = info.channels || 3;
    const totalPixels = info.width * info.height;

    for (let i = 0; i < data.length; i += channels) {
      let brightness = 0;
      for (let c = 0; c < Math.min(channels, 3); c++) {
        brightness += data[i + c];
      }
      brightness /= Math.min(channels, 3);

      if (brightness > threshold) {
        overexposedPixels++;
      }
    }

    const glarePercentage = overexposedPixels / totalPixels;
    const score = 1 - Math.min(1, glarePercentage / THRESHOLDS.GLARE_PERCENTAGE);
    return score;
  } catch (error) {
    console.error('[ImageQuality] Glare detection failed:', error);
    return 0.7;
  }
}

async function detectLowLight(imageBuffer: Buffer): Promise<number> {
  try {
    const { data, info } = await sharp(imageBuffer)
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let underexposedPixels = 0;
    const threshold = 40;
    const channels = info.channels || 3;
    const totalPixels = info.width * info.height;

    for (let i = 0; i < data.length; i += channels) {
      let brightness = 0;
      for (let c = 0; c < Math.min(channels, 3); c++) {
        brightness += data[i + c];
      }
      brightness /= Math.min(channels, 3);

      if (brightness < threshold) {
        underexposedPixels++;
      }
    }

    const darkPercentage = underexposedPixels / totalPixels;
    const score = 1 - Math.min(1, darkPercentage / THRESHOLDS.LOW_LIGHT_PERCENTAGE);
    return score;
  } catch (error) {
    console.error('[ImageQuality] Low light detection failed:', error);
    return 0.7;
  }
}

async function analyzeFraming(imageBuffer: Buffer): Promise<number> {
  try {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    if (width < THRESHOLDS.MIN_DIMENSION || height < THRESHOLDS.MIN_DIMENSION) {
      return 0.3;
    }

    const aspectRatio = Math.max(width, height) / Math.min(width, height);
    if (aspectRatio > 3) {
      return 0.4;
    }

    const sobelX = {
      width: 3,
      height: 3,
      kernel: [-1, 0, 1, -2, 0, 2, -1, 0, 1],
    };

    const { data } = await sharp(imageBuffer)
      .greyscale()
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .convolve(sobelX)
      .raw()
      .toBuffer({ resolveWithObject: true });

    let edgePixels = 0;
    const edgeThreshold = 30;
    for (let i = 0; i < data.length; i++) {
      if (data[i] > edgeThreshold) {
        edgePixels++;
      }
    }

    const edgeDensity = edgePixels / data.length;

    if (edgeDensity < THRESHOLDS.EDGE_DENSITY_MIN) {
      return 0.4;
    }

    return Math.min(1, 0.6 + edgeDensity * 10);
  } catch (error) {
    console.error('[ImageQuality] Framing analysis failed:', error);
    return 0.7;
  }
}

export function formatQualityFeedback(quality: ImageQualityScore): string {
  if (!quality.isPoorQuality) {
    return '';
  }

  const feedback: string[] = [
    'Image quality issues detected:',
    ...quality.issues.map((i) => `- ${i}`),
    '',
    'Suggestions:',
    ...quality.suggestions.map((s) => `- ${s}`),
  ];

  return feedback.join('\n');
}

export async function analyzeImageQualityFromBase64(
  base64Data: string
): Promise<ImageQualityScore> {
  const buffer = Buffer.from(base64Data, 'base64');
  return analyzeImageQuality(buffer);
}
