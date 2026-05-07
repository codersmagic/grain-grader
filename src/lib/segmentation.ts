import sharp from "sharp";
import path from "path";
import fs from "fs";

interface GrainRegion {
  bbox: { x: number; y: number; width: number; height: number };
  area: number;
  cropBuffer: Buffer;
  lengthPx: number;
  widthPx: number;
  tailLengthPx: number;
}

interface SegmentationResult {
  grains: GrainRegion[];
  hasOverlaps: boolean;
  pixelsPerMm: number | null;
}

interface OrientedBBox {
  cx: number;
  cy: number;
  majorLen: number;
  minorLen: number;
  angle: number;
}

interface RegionData {
  label: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
  brightnessSum: number;
  rSum: number;
  gSum: number;
  bSum: number;
  xSum: number;
  ySum: number;
  xxSum: number;
  yySum: number;
  xySum: number;
}

function otsuThreshold(histogram: number[], totalPixels: number): number {
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * histogram[i];

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
    const variance = weightBg * weightFg * (meanBg - meanFg) ** 2;
    if (variance > maxVariance) {
      maxVariance = variance;
      bestThreshold = t;
    }
  }
  return bestThreshold;
}

function dilate(src: Uint8Array, w: number, h: number): Uint8Array {
  const dst = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = false;
      for (let dy = -1; dy <= 1 && !on; dy++) {
        for (let dx = -1; dx <= 1 && !on; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && src[ny * w + nx] === 1) on = true;
        }
      }
      dst[y * w + x] = on ? 1 : 0;
    }
  }
  return dst;
}

function erode(src: Uint8Array, w: number, h: number): Uint8Array {
  const dst = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let all = true;
      for (let dy = -1; dy <= 1 && all; dy++) {
        for (let dx = -1; dx <= 1 && all; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h || src[ny * w + nx] !== 1) all = false;
        }
      }
      dst[y * w + x] = all ? 1 : 0;
    }
  }
  return dst;
}

function distanceTransform2D(localBin: Uint8Array, w: number, h: number): Float32Array {
  const dist = new Float32Array(w * h);
  const INF = w + h;
  for (let i = 0; i < w * h; i++) dist[i] = localBin[i] === 1 ? INF : 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (dist[idx] === 0) continue;
      if (y > 0) dist[idx] = Math.min(dist[idx], dist[(y - 1) * w + x] + 1);
      if (x > 0) dist[idx] = Math.min(dist[idx], dist[y * w + x - 1] + 1);
      if (y > 0 && x > 0) dist[idx] = Math.min(dist[idx], dist[(y - 1) * w + x - 1] + 1.41);
      if (y > 0 && x < w - 1) dist[idx] = Math.min(dist[idx], dist[(y - 1) * w + x + 1] + 1.41);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const idx = y * w + x;
      if (dist[idx] === 0) continue;
      if (y < h - 1) dist[idx] = Math.min(dist[idx], dist[(y + 1) * w + x] + 1);
      if (x < w - 1) dist[idx] = Math.min(dist[idx], dist[y * w + x + 1] + 1);
      if (y < h - 1 && x < w - 1) dist[idx] = Math.min(dist[idx], dist[(y + 1) * w + x + 1] + 1.41);
      if (y < h - 1 && x > 0) dist[idx] = Math.min(dist[idx], dist[(y + 1) * w + x - 1] + 1.41);
    }
  }
  return dist;
}

function splitOversizedComponents(
  labels: Int32Array,
  w: number,
  h: number,
  excludeAboveY: number,
): void {
  const areas = new Map<number, number>();
  const centroids = new Map<number, { ySum: number; count: number }>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = labels[y * w + x];
      if (l > 0) {
        areas.set(l, (areas.get(l) || 0) + 1);
        const c = centroids.get(l);
        if (c) { c.ySum += y; c.count++; }
        else centroids.set(l, { ySum: y, count: 1 });
      }
    }
  }

  const areaValues = [...areas.values()].filter((a) => a > 100).sort((a, b) => a - b);
  if (areaValues.length < 3) return;
  const medianArea = areaValues[Math.floor(areaValues.length / 2)];
  const expectedRadius = Math.sqrt(medianArea / Math.PI);
  const suppressRadius = Math.max(8, expectedRadius * 0.8);

  let nextLabel = 0;
  for (const l of areas.keys()) if (l > nextLabel) nextLabel = l;
  nextLabel++;

  for (const [label, area] of areas) {
    if (area < medianArea * 2.0) continue;

    const c = centroids.get(label)!;
    if (c.ySum / c.count < excludeAboveY) continue;

    let minX = w, maxX = 0, minY = h, maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (labels[y * w + x] === label) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    const localBin = new Uint8Array(bw * bh);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (labels[y * w + x] === label) localBin[(y - minY) * bw + (x - minX)] = 1;
      }
    }

    const dist = distanceTransform2D(localBin, bw, bh);

    const r = Math.max(3, Math.ceil(suppressRadius));
    const peaks: Array<{ x: number; y: number; d: number }> = [];
    for (let y = 2; y < bh - 2; y++) {
      for (let x = 2; x < bw - 2; x++) {
        const d = dist[y * bw + x];
        if (d < expectedRadius * 0.35) continue;
        let isPeak = true;
        for (let dy = -2; dy <= 2 && isPeak; dy++) {
          for (let dx = -2; dx <= 2 && isPeak; dx++) {
            if (dx === 0 && dy === 0) continue;
            const ny = y + dy, nx = x + dx;
            if (ny >= 0 && ny < bh && nx >= 0 && nx < bw && dist[ny * bw + nx] > d)
              isPeak = false;
          }
        }
        if (isPeak) peaks.push({ x, y, d });
      }
    }

    peaks.sort((a, b) => b.d - a.d);
    const kept: Array<{ x: number; y: number }> = [];
    for (const p of peaks) {
      let tooClose = false;
      for (const k of kept) {
        if (Math.hypot(p.x - k.x, p.y - k.y) < r) { tooClose = true; break; }
      }
      if (!tooClose) kept.push(p);
    }

    if (kept.length <= 1) continue;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (labels[y * w + x] !== label) continue;
        let minDist = Infinity, closest = 0;
        for (let p = 0; p < kept.length; p++) {
          const d = (x - minX - kept[p].x) ** 2 + (y - minY - kept[p].y) ** 2;
          if (d < minDist) { minDist = d; closest = p; }
        }
        labels[y * w + x] = nextLabel + closest;
      }
    }
    nextLabel += kept.length;
  }
}

function splitTouchingByRoundness(
  labels: Int32Array,
  w: number,
  h: number,
  pixelsPerMm: number | null,
): number {
  let splitCount = 0;
  const maxLengthPx = pixelsPerMm ? 10 * pixelsPerMm : Infinity;

  const areas = new Map<number, number>();
  const perimeters = new Map<number, number>();

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = labels[y * w + x];
      if (l === 0) continue;
      areas.set(l, (areas.get(l) || 0) + 1);
      let isBoundary = false;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h || labels[ny * w + nx] !== l) {
          isBoundary = true;
          break;
        }
      }
      if (isBoundary) perimeters.set(l, (perimeters.get(l) || 0) + 1);
    }
  }

  const circularities = new Map<number, number>();
  for (const [l, area] of areas) {
    const perim = perimeters.get(l) || 1;
    circularities.set(l, (4 * Math.PI * area) / (perim * perim));
  }

  const areaValues = [...areas.values()].filter((a) => a > 100).sort((a, b) => a - b);
  if (areaValues.length < 5) return 0;
  const medianArea = areaValues[Math.floor(areaValues.length / 2)];

  const normalCircs: number[] = [];
  for (const [l, area] of areas) {
    if (area >= medianArea * 0.5 && area <= medianArea * 1.5) {
      normalCircs.push(circularities.get(l) || 0);
    }
  }
  if (normalCircs.length < 3) return 0;
  normalCircs.sort((a, b) => a - b);
  const medianCirc = normalCircs[Math.floor(normalCircs.length / 2)];

  let nextLabel = 0;
  for (const l of areas.keys()) if (l > nextLabel) nextLabel = l;
  nextLabel++;

  for (const [label, area] of areas) {
    const circ = circularities.get(label) || 0;
    const isOversized = area >= medianArea * 1.5;
    const isIrregular = circ < medianCirc * 0.85;

    let minX = w, maxX = 0, minY = h, maxY = 0;
    let xSum = 0, ySum = 0, xxSum = 0, yySum = 0, xySum = 0;
    let pixelCount = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (labels[y * w + x] === label) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          xSum += x; ySum += y;
          xxSum += x * x; yySum += y * y; xySum += x * y;
          pixelCount++;
        }
      }
    }
    if (pixelCount < 100) continue;

    const cx = xSum / pixelCount;
    const cy = ySum / pixelCount;
    const mxx = xxSum / pixelCount - cx * cx;
    const myy = yySum / pixelCount - cy * cy;
    const mxy = xySum / pixelCount - cx * cy;
    const angle = 0.5 * Math.atan2(2 * mxy, mxx - myy);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    let majorMin = Infinity, majorMax = -Infinity;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (labels[y * w + x] !== label) continue;
        const major = (x - cx) * cos + (y - cy) * sin;
        if (major < majorMin) majorMin = major;
        if (major > majorMax) majorMax = major;
      }
    }
    const majorLength = majorMax - majorMin;
    const isTooLong = majorLength > maxLengthPx;

    if (!(isOversized && isIrregular) && !isTooLong) continue;

    const projections = new Map<number, { min: number; max: number }>();
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (labels[y * w + x] !== label) continue;
        const dx = x - cx, dy = y - cy;
        const major = Math.round(dx * cos + dy * sin);
        const minor = -dx * sin + dy * cos;
        const existing = projections.get(major);
        if (!existing) {
          projections.set(major, { min: minor, max: minor });
        } else {
          if (minor < existing.min) existing.min = minor;
          if (minor > existing.max) existing.max = minor;
        }
      }
    }

    const majorKeys = [...projections.keys()].sort((a, b) => a - b);
    if (majorKeys.length < 10) continue;

    const widthProfile = majorKeys.map((k) => {
      const p = projections.get(k)!;
      return { majorPos: k, width: p.max - p.min };
    });

    const smoothWin = Math.max(3, Math.floor(widthProfile.length * 0.05));
    const smoothed = widthProfile.map((_, i) => {
      let sum = 0, count = 0;
      for (let j = Math.max(0, i - smoothWin); j <= Math.min(widthProfile.length - 1, i + smoothWin); j++) {
        sum += widthProfile[j].width;
        count++;
      }
      return sum / count;
    });

    const maxWidth = Math.max(...smoothed);
    const startIdx = Math.floor(widthProfile.length * 0.1);
    const endIdx = Math.floor(widthProfile.length * 0.9);
    const neckThreshold = isTooLong ? 0.75 : 0.6;

    let bestNeck = -1;
    let bestNeckWidth = Infinity;
    for (let i = startIdx + 1; i < endIdx - 1; i++) {
      if (
        smoothed[i] < smoothed[i - 1] &&
        smoothed[i] < smoothed[i + 1] &&
        smoothed[i] < maxWidth * neckThreshold &&
        smoothed[i] < bestNeckWidth
      ) {
        bestNeck = i;
        bestNeckWidth = smoothed[i];
      }
    }

    if (bestNeck < 0) continue;

    const neckMajorPos = widthProfile[bestNeck].majorPos;
    const newLabel = nextLabel++;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (labels[y * w + x] !== label) continue;
        const dx = x - cx, dy = y - cy;
        const major = dx * cos + dy * sin;
        if (major > neckMajorPos) {
          labels[y * w + x] = newLabel;
        }
      }
    }
    splitCount++;
  }
  return splitCount;
}

function floodFill(
  binary: Uint8Array,
  labels: Int32Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  label: number
): void {
  const stack: number[] = [startX, startY];
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

function computeOBB(r: RegionData): OrientedBBox {
  const cx = r.xSum / r.area;
  const cy = r.ySum / r.area;

  // Second-order central moments
  const mxx = r.xxSum / r.area - cx * cx;
  const myy = r.yySum / r.area - cy * cy;
  const mxy = r.xySum / r.area - cx * cy;

  // Orientation from covariance matrix eigenvectors
  const angle = 0.5 * Math.atan2(2 * mxy, mxx - myy);

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // Project all region pixels onto the principal axes to find extent
  // Using the bounding box corners as a fast approximation,
  // but we stored actual moment sums so we can compute spread
  // Standard deviations along principal axes
  const varMajor =
    mxx * cos * cos + 2 * mxy * cos * sin + myy * sin * sin;
  const varMinor =
    mxx * sin * sin - 2 * mxy * cos * sin + myy * cos * cos;

  // Use ~3 standard deviations to cover ~99.7% of the grain
  const majorLen = Math.max(6 * Math.sqrt(Math.abs(varMajor)), 10);
  const minorLen = Math.max(6 * Math.sqrt(Math.abs(varMinor)), 6);

  return {
    cx,
    cy,
    majorLen,
    minorLen,
    angle: (angle * 180) / Math.PI,
  };
}

export function detectRulerScale(
  grayPixels: Uint8Array,
  width: number,
  height: number
): { pixelsPerMm: number; rulerBottom: number; rulerLeft: number; rulerRight: number } | null {
  const BRIGHT_THRESH = 155;
  const FRAC_THRESH = 0.20;
  const SMOOTH_R = 15;

  const scanRows = Math.floor(height * 0.30);
  if (scanRows < 5) return null;

  // Step 1: Per-column bright fraction over the top 30% of the image
  const colFrac = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    let bright = 0;
    for (let y = 0; y < scanRows; y++) {
      if (grayPixels[y * width + x] >= BRIGHT_THRESH) bright++;
    }
    colFrac[x] = bright / scanRows;
  }

  const smoothed = new Float64Array(width);
  const prefix = new Float64Array(width + 1);
  for (let x = 0; x < width; x++) prefix[x + 1] = prefix[x] + colFrac[x];
  for (let x = 0; x < width; x++) {
    const lo = Math.max(0, x - SMOOTH_R);
    const hi = Math.min(width - 1, x + SMOOTH_R);
    smoothed[x] = (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1);
  }

  // Step 2: Longest run of columns with fraction >= threshold
  let bestRunStart = 0, bestRunLen = 0, curStart = 0, curLen = 0;
  for (let x = 0; x <= width; x++) {
    if (x < width && smoothed[x] >= FRAC_THRESH) {
      if (curLen === 0) curStart = x;
      curLen++;
    } else {
      if (curLen > bestRunLen) {
        bestRunLen = curLen;
        bestRunStart = curStart;
      }
      curLen = 0;
    }
  }

  const rulerLeft = bestRunStart;
  const rulerRight = bestRunStart + bestRunLen - 1;
  const rulerSpan = bestRunLen;
  if (rulerSpan < 200) return null;

  // Step 3: Vertical extent — find the bright band (ruler body).
  // Scan row averages within ruler columns, then find where brightness rises and falls.
  const maxScanY = Math.floor(height * 0.50);
  const coreLeft = rulerLeft + Math.floor(rulerSpan * 0.15);
  const coreRight = rulerRight - Math.floor(rulerSpan * 0.15);
  const coreStep = Math.max(1, Math.floor((coreRight - coreLeft) / 60));

  const rowAvgs: number[] = [];
  for (let y = 0; y < maxScanY; y++) {
    let sum = 0, count = 0;
    for (let x = coreLeft; x <= coreRight; x += coreStep) {
      sum += grayPixels[y * width + x];
      count++;
    }
    rowAvgs.push(sum / count);
  }

  const sortedAvgs = [...rowAvgs].sort((a, b) => b - a);
  const peakBrightness = sortedAvgs[Math.floor(sortedAvgs.length * 0.1)];
  const brightThresh = peakBrightness * 0.7;

  let rulerTop = 0;
  let rulerBottom = maxScanY;
  for (let y = 0; y < rowAvgs.length; y++) {
    if (rowAvgs[y] >= brightThresh) { rulerTop = y; break; }
  }
  for (let y = rulerTop + 10; y < rowAvgs.length - 5; y++) {
    let windowSum = 0;
    for (let dy = 0; dy < 5; dy++) windowSum += rowAvgs[y + dy];
    if (windowSum / 5 < brightThresh) { rulerBottom = y; break; }
  }

  if (rulerBottom - rulerTop < 15) return null;

  // Step 4: Column averages — use up to 50 rows from inside the ruler's bright band
  const rulerMid = rulerTop + Math.floor((rulerBottom - rulerTop) * 0.3);
  const useRows = Math.min(50, rulerBottom - rulerMid);
  if (useRows < 5) return null;

  const colAvg = new Float64Array(rulerSpan);
  for (let i = 0; i < rulerSpan; i++) {
    const x = rulerLeft + i;
    let sum = 0;
    for (let y = rulerMid; y < rulerMid + useRows; y++) {
      sum += grayPixels[y * width + x];
    }
    colAvg[i] = sum / useRows;
  }

  // Step 5: Autocorrelation — compute over full useful lag range
  const sigMean = colAvg.reduce((a, b) => a + b, 0) / colAvg.length;
  const maxLag = Math.min(Math.floor(rulerSpan / 2.5), 400);
  let ac0 = 0;
  for (let i = 0; i < colAvg.length; i++) ac0 += (colAvg[i] - sigMean) ** 2;
  if (ac0 < 1) return null;

  const acValues = new Float64Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < colAvg.length - lag; i++) {
      sum += (colAvg[i] - sigMean) * (colAvg[i + lag] - sigMean);
    }
    acValues[lag] = sum / ac0;
  }

  // Step 6: Find cm-scale AC peak (for validation) and mm-scale peak (for precision).
  // The mm peak gives better sub-pixel precision via parabolic interpolation because
  // many more periods are visible, creating a more asymmetric (and thus informative) peak shape.

  // 6a: cm peak — broad search for validation
  const cmSearchLo = 30;
  const cmSearchHi = Math.min(maxLag - 1, 200);

  const cmPeaks: Array<{ lag: number; r: number }> = [];
  for (let lag = cmSearchLo + 1; lag < cmSearchHi; lag++) {
    if (
      acValues[lag] > acValues[lag - 1] &&
      acValues[lag] > acValues[lag + 1] &&
      acValues[lag] > 0.05
    ) {
      cmPeaks.push({ lag, r: acValues[lag] });
    }
  }

  if (cmPeaks.length === 0) return null;

  cmPeaks.sort((a, b) => b.r - a.r);
  let cmLag = 0;
  let cmR = -1;
  let bestScore = -1;

  for (const p of cmPeaks) {
    const cmCount = rulerSpan / p.lag;
    if (cmCount < 2.5 || cmCount > 20) continue;

    let score = p.r;
    for (const divisor of [2, 5, 10]) {
      const subLag = p.lag / divisor;
      if (subLag < 3) continue;
      const nearIdx = Math.round(subLag);
      if (nearIdx >= 1 && nearIdx <= maxLag && acValues[nearIdx] > 0.3) {
        score += 0.1;
      }
    }
    for (const mult of [2, 3]) {
      const harmLag = p.lag * mult;
      if (harmLag <= maxLag && acValues[Math.round(harmLag)] > 0.05) {
        score += 0.05;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      cmLag = p.lag;
      cmR = p.r;
    }
  }

  if (cmR < 0.05 || cmLag === 0) return null;

  // 6b: mm peak — search near cmLag/10 for precise sub-pixel estimate
  const mmTarget = cmLag / 10;
  const mmSearchLo = Math.max(3, Math.floor(mmTarget) - 3);
  const mmSearchHi = Math.min(maxLag - 1, Math.ceil(mmTarget) + 3);

  let mmLag = 0;
  let mmR = -1;
  for (let lag = mmSearchLo; lag <= mmSearchHi; lag++) {
    if (lag < 1 || lag >= maxLag) continue;
    if (
      acValues[lag] > acValues[lag - 1] &&
      acValues[lag] > acValues[lag + 1] &&
      acValues[lag] > mmR
    ) {
      mmLag = lag;
      mmR = acValues[lag];
    }
  }

  let pixelsPerMm: number;

  if (mmLag > 0 && mmR > 0.3) {
    // Parabolic interpolation on the mm peak
    const yL = acValues[mmLag - 1];
    const yC = acValues[mmLag];
    const yR = acValues[mmLag + 1];
    const denom = 2 * (2 * yC - yL - yR);
    if (Math.abs(denom) > 1e-10) {
      const offset = (yL - yR) / denom;
      if (Math.abs(offset) < 1.0) {
        const refinedMm = mmLag + offset;
        // Consistency: refined mm * 10 should be within 20% of cm lag
        if (Math.abs(refinedMm * 10 - cmLag) / cmLag < 0.20) {
          pixelsPerMm = refinedMm;
        } else {
          pixelsPerMm = cmLag / 10;
        }
      } else {
        pixelsPerMm = cmLag / 10;
      }
    } else {
      pixelsPerMm = cmLag / 10;
    }
  } else {
    // Fall back to cm peak / 10
    let refinedCmLag: number = cmLag;
    if (cmLag > cmSearchLo && cmLag < cmSearchHi) {
      const yL = acValues[cmLag - 1];
      const yC = acValues[cmLag];
      const yR = acValues[cmLag + 1];
      const denom = 2 * (2 * yC - yL - yR);
      if (Math.abs(denom) > 1e-10) {
        const offset = (yL - yR) / denom;
        if (Math.abs(offset) < 0.5) {
          refinedCmLag = cmLag + offset;
        }
      }
    }
    pixelsPerMm = refinedCmLag / 10;
  }

  if (pixelsPerMm < 3 || pixelsPerMm > 200) return null;

  return { pixelsPerMm, rulerBottom, rulerLeft, rulerRight };
}

export async function segmentGrains(
  imagePath: string,
  sessionId: string
): Promise<SegmentationResult> {
  const absolutePath = path.isAbsolute(imagePath)
    ? imagePath
    : path.join(process.cwd(), imagePath);

  const [grayResult, rgbResult] = await Promise.all([
    sharp(absolutePath).grayscale().raw().toBuffer({ resolveWithObject: true }),
    sharp(absolutePath).removeAlpha().toColorspace("srgb").raw().toBuffer({ resolveWithObject: true }),
  ]);

  const { width, height } = grayResult.info;
  const grayPixels = new Uint8Array(
    grayResult.data.buffer,
    grayResult.data.byteOffset,
    grayResult.data.length
  );
  const rgbPixels = new Uint8Array(
    rgbResult.data.buffer,
    rgbResult.data.byteOffset,
    rgbResult.data.length
  );

  // Detect ruler scale for pixel-to-mm calibration
  const scaleResult = detectRulerScale(grayPixels, width, height);
  const pixelsPerMm = scaleResult?.pixelsPerMm ?? null;

  // Detect the dark content zone (the actual photographed area).
  // Photos of screens have bright UI bands (taskbar, etc.) around a dark photo region.
  const bandHeight = 16;
  const numBands = Math.floor(height / bandHeight);
  const bandBrightness: number[] = [];
  for (let b = 0; b < numBands; b++) {
    let sum = 0;
    const startY = b * bandHeight;
    const endY = Math.min(startY + bandHeight, height);
    const count = (endY - startY) * width;
    for (let y = startY; y < endY; y++)
      for (let x = 0; x < width; x++) sum += grayPixels[y * width + x];
    bandBrightness.push(sum / count);
  }
  // Content zone = dark bands (avg brightness < 110)
  let roiTopBand = -1;
  let roiBottomBand = -1;
  for (let b = 0; b < numBands; b++) {
    if (bandBrightness[b] < 110) { roiTopBand = b; break; }
  }
  for (let b = numBands - 1; b >= 0; b--) {
    if (bandBrightness[b] < 110) { roiBottomBand = b; break; }
  }
  // If no dark zone found, use the full image (no ROI filtering)
  const hasROI = roiTopBand >= 0 && roiBottomBand >= 0;
  const roiTop = hasROI ? roiTopBand * bandHeight : 0;
  const roiBottom = hasROI ? Math.min((roiBottomBand + 1) * bandHeight, height) : height;

  // Otsu threshold
  const histogram = new Array<number>(256).fill(0);
  const totalPixels = width * height;
  for (let i = 0; i < totalPixels; i++) histogram[grayPixels[i]]++;
  const otsu = otsuThreshold(histogram, totalPixels);

  // Rice grains are bright white — select bright pixels above threshold.
  // Floor of 150 prevents merging with medium-gray background artifacts.
  const threshold = Math.max(otsu, 150);

  // Binary image: foreground = bright pixels above threshold
  const rawBinary = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    rawBinary[i] = grayPixels[i] > threshold ? 1 : 0;
  }

  // Morphological closing (dilate→erode): fills small gaps within grains
  const closed = erode(dilate(rawBinary, width, height), width, height);
  // Morphological opening (erode→dilate): removes small noise specks
  const binary = dilate(erode(closed, width, height), width, height);

  // Blank out the ruler zone so no components form there
  if (scaleResult) {
    const pad = 20;
    const rTop = 0;
    const rBot = Math.min(height, scaleResult.rulerBottom + pad);
    const rLeft = Math.max(0, scaleResult.rulerLeft - pad);
    const rRight = Math.min(width, scaleResult.rulerRight + pad);
    for (let y = rTop; y < rBot; y++) {
      for (let x = rLeft; x < rRight; x++) {
        binary[y * width + x] = 0;
      }
    }
  }

  // Connected component labeling
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

  // Multi-pass splitting: repeat until no more splits or max 5 passes
  for (let pass = 0; pass < 5; pass++) {
    const splits = splitTouchingByRoundness(labels, width, height, pixelsPerMm);
    if (splits === 0) break;
  }

  // Extract regions with brightness, color, and moment data
  const regionMap = new Map<number, RegionData>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const label = labels[y * width + x];
      if (label === 0) continue;
      const idx = y * width + x;
      const rgbIdx = idx * 3;

      let r = regionMap.get(label);
      if (!r) {
        r = {
          label,
          minX: x, minY: y, maxX: x, maxY: y,
          area: 0, brightnessSum: 0,
          rSum: 0, gSum: 0, bSum: 0,
          xSum: 0, ySum: 0, xxSum: 0, yySum: 0, xySum: 0,
        };
        regionMap.set(label, r);
      }
      if (x < r.minX) r.minX = x;
      if (x > r.maxX) r.maxX = x;
      if (y < r.minY) r.minY = y;
      if (y > r.maxY) r.maxY = y;
      r.area++;
      r.brightnessSum += grayPixels[idx];
      r.rSum += rgbPixels[rgbIdx];
      r.gSum += rgbPixels[rgbIdx + 1];
      r.bSum += rgbPixels[rgbIdx + 2];
      r.xSum += x;
      r.ySum += y;
      r.xxSum += x * x;
      r.yySum += y * y;
      r.xySum += x * y;
    }
  }

  const allRegions = Array.from(regionMap.values());
  const imageArea = width * height;

  // Compute metrics per region
  const withMetrics = allRegions.map((r) => {
    const bboxW = r.maxX - r.minX + 1;
    const bboxH = r.maxY - r.minY + 1;
    const longer = Math.max(bboxW, bboxH);
    const shorter = Math.min(bboxW, bboxH);
    const aspectRatio = shorter > 0 ? longer / shorter : 999;
    const solidity = r.area / (bboxW * bboxH);
    const meanBrightness = r.brightnessSum / r.area;
    const meanR = r.rSum / r.area;
    const meanG = r.gSum / r.area;
    const meanB = r.bSum / r.area;
    const colorSpread =
      Math.max(meanR, meanG, meanB) - Math.min(meanR, meanG, meanB);
    const blueDominance = meanB - Math.min(meanR, meanG);
    return { ...r, bboxW, bboxH, longer, shorter, aspectRatio, solidity, meanBrightness, colorSpread, blueDominance, meanR, meanG, meanB };
  });

  // Pass 1: Size + ROI — remove noise, giant blobs, regions outside content zone, and ruler area
  const sizeFiltered = withMetrics.filter((r) => {
    const centroidY = r.ySum / r.area;
    return (
      r.area >= 150 &&
      r.shorter >= 10 &&
      r.area / imageArea < 0.01 &&
      centroidY >= roiTop &&
      centroidY <= roiBottom &&
      true
    );
  });

  if (sizeFiltered.length === 0) return { grains: [], hasOverlaps: false, pixelsPerMm };

  // Pass 2: Shape — reasonable fill, not too elongated.
  // Min aspect ratio is low because grains at ~45° have near-square AABBs.
  const shapeFiltered = sizeFiltered.filter(
    (r) => r.aspectRatio <= 6.0 && r.solidity > 0.25
  );

  if (shapeFiltered.length === 0) return { grains: [], hasOverlaps: false, pixelsPerMm };

  // Pass 3: Brightness — rice grains are bright white
  const brightFiltered = shapeFiltered.filter((r) => r.meanBrightness >= 150);

  if (brightFiltered.length === 0) return { grains: [], hasOverlaps: false, pixelsPerMm };

  // Pass 4: Color — white/cream (low saturation), reject blue-tinted UI artifacts
  const colorFiltered = brightFiltered.filter(
    (r) => r.colorSpread < 70 && r.blueDominance < 30
  );

  if (colorFiltered.length === 0) return { grains: [], hasOverlaps: false, pixelsPerMm };

  // Pass 5: Whiteness — real grains have all channels high and similar;
  // reject regions where the minimum channel is too low (colored objects)
  const whiteFiltered = colorFiltered.filter(
    (r) => Math.min(r.meanR, r.meanG, r.meanB) >= 120
  );

  if (whiteFiltered.length === 0) return { grains: [], hasOverlaps: false, pixelsPerMm };

  // Pass 6: Size consistency — reject outliers
  const sortedAreas = whiteFiltered.map((r) => r.area).sort((a, b) => a - b);
  const medianArea = sortedAreas[Math.floor(sortedAreas.length / 2)];
  const validRegions = whiteFiltered.filter(
    (r) => r.area >= medianArea * 0.1 && r.area <= medianArea * 6
  );

  if (validRegions.length === 0) return { grains: [], hasOverlaps: false, pixelsPerMm };

  // Compute oriented bounding boxes via image moments
  const obbs = validRegions.map((r) => ({
    region: r,
    obb: computeOBB(r),
  }));

  // Create output directory
  const grainsDir = path.join(process.cwd(), "data", "grains", sessionId);
  if (!fs.existsSync(grainsDir)) {
    fs.mkdirSync(grainsDir, { recursive: true });
  }

  // Pass A: create masked, rotated crops and collect dimensions
  interface CropEntry {
    index: number;
    region: RegionData;
    rawData: Buffer;
    rawW: number;
    rawH: number;
    lengthPx: number;
    widthPx: number;
    tailLengthPx: number;
    bbox: { x: number; y: number; width: number; height: number };
  }
  const cropEntries: CropEntry[] = [];

  for (let i = 0; i < obbs.length; i++) {
    const { region, obb } = obbs[i];

    const rad = (obb.angle * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const aabbW = obb.majorLen * cos + obb.minorLen * sin;
    const aabbH = obb.majorLen * sin + obb.minorLen * cos;

    const pad = 10;
    const left = Math.max(0, Math.round(obb.cx - aabbW / 2 - pad));
    const top = Math.max(0, Math.round(obb.cy - aabbH / 2 - pad));
    const right = Math.min(width, Math.round(obb.cx + aabbW / 2 + pad));
    const bottom = Math.min(height, Math.round(obb.cy + aabbH / 2 + pad));
    const cropW = right - left;
    const cropH = bottom - top;

    if (cropW < 5 || cropH < 5) continue;

    const cropRGBA = Buffer.alloc(cropW * cropH * 4);
    for (let cy = 0; cy < cropH; cy++) {
      for (let cx = 0; cx < cropW; cx++) {
        const gx = left + cx;
        const gy = top + cy;
        const ci = (cy * cropW + cx) * 4;
        const gi = gy * width + gx;
        if (gx < width && gy < height && labels[gi] === region.label) {
          const ri = gi * 3;
          cropRGBA[ci] = rgbPixels[ri];
          cropRGBA[ci + 1] = rgbPixels[ri + 1];
          cropRGBA[ci + 2] = rgbPixels[ri + 2];
          cropRGBA[ci + 3] = 255;
        }
      }
    }

    try {
      const uprightAngle = 90 - obb.angle;
      const rotated = await sharp(cropRGBA, {
        raw: { width: cropW, height: cropH, channels: 4 },
      })
        .rotate(uprightAngle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .raw()
        .toBuffer({ resolveWithObject: true });

      const rW = rotated.info.width;
      const rH = rotated.info.height;
      const rData = new Uint8Array(
        rotated.data.buffer,
        rotated.data.byteOffset,
        rotated.data.length
      );

      const topQ = Math.floor(rH * 0.25);
      const botStart = Math.floor(rH * 0.75);
      let topPx = 0, botPx = 0;
      for (let y = 0; y < topQ; y++)
        for (let x = 0; x < rW; x++)
          if (rData[(y * rW + x) * 4 + 3] > 128) topPx++;
      for (let y = botStart; y < rH; y++)
        for (let x = 0; x < rW; x++)
          if (rData[(y * rW + x) * 4 + 3] > 128) botPx++;

      const needsFlip = botPx > topPx;
      // Optionally flip, then trim transparent padding
      const oriented = needsFlip
        ? await sharp(rotated.data, { raw: { width: rW, height: rH, channels: 4 } })
            .rotate(180, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer()
        : await sharp(rotated.data, { raw: { width: rW, height: rH, channels: 4 } })
            .png()
            .toBuffer();

      const trimmed = await sharp(oriented)
        .trim({ threshold: 0 })
        .raw()
        .toBuffer({ resolveWithObject: true });

      const tW = trimmed.info.width;
      const tH = trimmed.info.height;
      const tData = new Uint8Array(trimmed.data.buffer, trimmed.data.byteOffset, trimmed.data.length);

      let widestRow = 0, maxRowWidth = 0;
      for (let y = 0; y < tH; y++) {
        let leftmost = tW, rightmost = -1;
        for (let x = 0; x < tW; x++) {
          if (tData[(y * tW + x) * 4 + 3] > 128) {
            if (x < leftmost) leftmost = x;
            if (x > rightmost) rightmost = x;
          }
        }
        const rowW = rightmost >= leftmost ? rightmost - leftmost + 1 : 0;
        if (rowW > maxRowWidth) { maxRowWidth = rowW; widestRow = y; }
      }

      cropEntries.push({
        index: i,
        region,
        rawData: trimmed.data,
        rawW: tW,
        rawH: tH,
        lengthPx: tH,
        widthPx: maxRowWidth,
        tailLengthPx: Math.max(0, tH - 1 - widestRow),
        bbox: { x: left, y: top, width: cropW, height: cropH },
      });
    } catch {
      continue;
    }
  }

  // Pass B: normalize all crops to the same canvas size for consistent scale
  const sortedW = cropEntries.map((c) => c.rawW).sort((a, b) => a - b);
  const sortedH = cropEntries.map((c) => c.rawH).sort((a, b) => a - b);
  const p95Idx = Math.min(Math.floor(sortedW.length * 0.95), sortedW.length - 1);
  const canvasPad = 8;
  const canvasW = sortedW[p95Idx] + canvasPad * 2;
  const canvasH = sortedH[p95Idx] + canvasPad * 2;
  const grains: GrainRegion[] = [];

  for (const entry of cropEntries) {
    // Clamp oversized crops to canvas dimensions
    const fitW = Math.min(entry.rawW, canvasW);
    const fitH = Math.min(entry.rawH, canvasH);
    const offsetX = Math.max(0, Math.floor((entry.rawW - fitW) / 2));
    const offsetY = Math.max(0, Math.floor((entry.rawH - fitH) / 2));

    let source: Buffer;
    let srcW: number, srcH: number;
    if (fitW < entry.rawW || fitH < entry.rawH) {
      const extracted = await sharp(entry.rawData, {
        raw: { width: entry.rawW, height: entry.rawH, channels: 4 },
      })
        .extract({ left: offsetX, top: offsetY, width: fitW, height: fitH })
        .raw()
        .toBuffer({ resolveWithObject: true });
      source = extracted.data;
      srcW = extracted.info.width;
      srcH = extracted.info.height;
    } else {
      source = entry.rawData;
      srcW = entry.rawW;
      srcH = entry.rawH;
    }

    const padTop = Math.floor((canvasH - srcH) / 2);
    const padBottom = canvasH - srcH - padTop;
    const padLeft = Math.floor((canvasW - srcW) / 2);
    const padRight = canvasW - srcW - padLeft;

    const cropBuffer = await sharp(source, {
      raw: { width: srcW, height: srcH, channels: 4 },
    })
      .extend({
        top: padTop,
        bottom: padBottom,
        left: padLeft,
        right: padRight,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    const cropPath = path.join(grainsDir, `grain_${entry.index + 1}.png`);
    fs.writeFileSync(cropPath, cropBuffer);

    grains.push({
      bbox: entry.bbox,
      area: entry.region.area,
      cropBuffer,
      lengthPx: entry.lengthPx,
      widthPx: entry.widthPx,
      tailLengthPx: entry.tailLengthPx,
    });
  }

  // Generate annotated image with oriented bounding boxes (labels match crop filenames)
  const svgRects = cropEntries
    .map((entry) => {
      const obb = obbs[entry.index].obb;
      const hw = obb.majorLen / 2;
      const hh = obb.minorLen / 2;
      const label = entry.index + 1;
      return (
        `<g transform="translate(${obb.cx},${obb.cy}) rotate(${obb.angle})">` +
        `<rect x="${-hw}" y="${-hh}" width="${obb.majorLen}" height="${obb.minorLen}" ` +
        `fill="none" stroke="#22c55e" stroke-width="3"/>` +
        `</g>` +
        `<text x="${obb.cx}" y="${obb.cy - hh - 6}" fill="#22c55e" ` +
        `font-size="18" font-weight="bold" font-family="sans-serif" text-anchor="middle">${label}</text>`
      );
    })
    .join("\n");

  const svgOverlay = Buffer.from(
    `<svg width="${width}" height="${height}">${svgRects}</svg>`
  );

  const annotatedBuffer = await sharp(absolutePath)
    .composite([{ input: svgOverlay, top: 0, left: 0 }])
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(grainsDir, "annotated.png"), annotatedBuffer);

  let hasOverlaps = false;
  for (const r of validRegions) {
    if (r.area > 2 * medianArea) {
      hasOverlaps = true;
      break;
    }
  }

  return { grains, hasOverlaps, pixelsPerMm };
}
