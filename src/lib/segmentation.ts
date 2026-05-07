import sharp from "sharp";
import path from "path";
import fs from "fs";

interface GrainRegion {
  bbox: { x: number; y: number; width: number; height: number };
  area: number;
  cropBuffer: Buffer;
}

interface SegmentationResult {
  grains: GrainRegion[];
  hasOverlaps: boolean;
}

/**
 * Otsu's threshold: find threshold that maximizes inter-class variance
 */
function otsuThreshold(histogram: number[], totalPixels: number): number {
  let sumAll = 0;
  for (let i = 0; i < 256; i++) {
    sumAll += i * histogram[i];
  }

  let sumBg = 0;
  let weightBg = 0;
  let maxVariance = 0;
  let bestThreshold = 0;

  for (let t = 0; t < 256; t++) {
    weightBg += histogram[t];
    if (weightBg === 0) continue;

    const weightFg = totalPixels - weightBg;
    if (weightFg === 0) break;

    sumBg += t * histogram[t];
    const meanBg = sumBg / weightBg;
    const meanFg = (sumAll - sumBg) / weightFg;

    const variance = weightBg * weightFg * (meanBg - meanFg) * (meanBg - meanFg);
    if (variance > maxVariance) {
      maxVariance = variance;
      bestThreshold = t;
    }
  }

  return bestThreshold;
}

/**
 * Iterative flood fill using a stack (avoids stack overflow on large images)
 */
function floodFill(
  binary: Uint8Array,
  labels: Int32Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  label: number
): void {
  const stack: number[] = [];
  stack.push(startX, startY);

  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;

    if (x < 0 || x >= width || y < 0 || y >= height) continue;

    const idx = y * width + x;
    if (binary[idx] !== 1 || labels[idx] !== 0) continue;

    labels[idx] = label;

    stack.push(x + 1, y);
    stack.push(x - 1, y);
    stack.push(x, y + 1);
    stack.push(x, y - 1);
  }
}

export async function segmentGrains(
  imagePath: string,
  sessionId: string
): Promise<SegmentationResult> {
  const absolutePath = path.isAbsolute(imagePath)
    ? imagePath
    : path.join(process.cwd(), imagePath);

  // Load image as grayscale raw pixels
  const { data, info } = await sharp(absolutePath)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const pixels = new Uint8Array(data.buffer, data.byteOffset, data.length);

  // Auto-detect background: sample 4 corner pixels
  const corners = [
    pixels[0],                              // top-left
    pixels[width - 1],                      // top-right
    pixels[(height - 1) * width],           // bottom-left
    pixels[(height - 1) * width + width - 1], // bottom-right
  ];
  const avgCorner = corners.reduce((a, b) => a + b, 0) / 4;
  const darkBackground = avgCorner < 128;

  // Compute 256-bin histogram
  const histogram = new Array<number>(256).fill(0);
  const totalPixels = width * height;
  for (let i = 0; i < totalPixels; i++) {
    histogram[pixels[i]]++;
  }

  // Find Otsu's threshold
  const threshold = otsuThreshold(histogram, totalPixels);

  // Create binary image
  const binary = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    if (darkBackground) {
      binary[i] = pixels[i] > threshold ? 1 : 0;
    } else {
      binary[i] = pixels[i] < threshold ? 1 : 0;
    }
  }

  // Connected component labeling via iterative flood fill
  const labels = new Int32Array(totalPixels);
  let currentLabel = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (binary[idx] === 1 && labels[idx] === 0) {
        currentLabel++;
        floodFill(binary, labels, width, height, x, y, currentLabel);
      }
    }
  }

  // Extract regions: compute bounding box and area for each label
  const regions = new Map<
    number,
    { minX: number; minY: number; maxX: number; maxY: number; area: number }
  >();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const label = labels[y * width + x];
      if (label === 0) continue;

      let region = regions.get(label);
      if (!region) {
        region = { minX: x, minY: y, maxX: x, maxY: y, area: 0 };
        regions.set(label, region);
      }
      if (x < region.minX) region.minX = x;
      if (x > region.maxX) region.maxX = x;
      if (y < region.minY) region.minY = y;
      if (y > region.maxY) region.maxY = y;
      region.area++;
    }
  }

  // Filter: remove regions with area < 100 pixels
  const validRegions = Array.from(regions.values()).filter((r) => r.area >= 100);

  if (validRegions.length === 0) {
    return { grains: [], hasOverlaps: false };
  }

  // Overlap detection: flag regions with area > 2x median
  const sortedAreas = validRegions.map((r) => r.area).sort((a, b) => a - b);
  const medianArea = sortedAreas[Math.floor(sortedAreas.length / 2)];
  let hasOverlaps = false;

  for (const r of validRegions) {
    if (r.area > 2 * medianArea) {
      hasOverlaps = true;
      break;
    }
  }

  // Create output directory
  const grainsDir = path.join(process.cwd(), "data", "grains", sessionId);
  if (!fs.existsSync(grainsDir)) {
    fs.mkdirSync(grainsDir, { recursive: true });
  }

  // Crop each grain with 4px padding
  const grains: GrainRegion[] = [];
  let grainNum = 0;

  for (const region of validRegions) {
    grainNum++;
    const pad = 4;
    const left = Math.max(0, region.minX - pad);
    const top = Math.max(0, region.minY - pad);
    const right = Math.min(width - 1, region.maxX + pad);
    const bottom = Math.min(height - 1, region.maxY + pad);
    const cropWidth = right - left + 1;
    const cropHeight = bottom - top + 1;

    const cropBuffer = await sharp(absolutePath)
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .png()
      .toBuffer();

    const cropPath = path.join(grainsDir, `grain_${grainNum}.png`);
    fs.writeFileSync(cropPath, cropBuffer);

    grains.push({
      bbox: { x: left, y: top, width: cropWidth, height: cropHeight },
      area: region.area,
      cropBuffer,
    });
  }

  return { grains, hasOverlaps };
}
