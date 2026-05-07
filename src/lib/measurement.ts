import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

interface MeasurementResult {
  grainId: number;
  lengthPx: number;
  widthPx: number;
  tailLengthPx: number;
  success: boolean;
  error?: string;
}

interface CalibratedMeasurement extends MeasurementResult {
  lengthMm: number;
  widthMm: number;
  tailLengthMm: number;
}

interface CalibrationResult {
  calibrationFactor: number;
  calibrated: CalibratedMeasurement[];
}

const client = new Anthropic();

export async function measureSingleGrain(
  grainImagePath: string,
  grainId: number,
  retries = 2
): Promise<MeasurementResult> {
  const absoluteGrainPath = path.isAbsolute(grainImagePath)
    ? grainImagePath
    : path.join(process.cwd(), grainImagePath);
  const statsPath = path.join(process.cwd(), "public", "stats.jpg");

  const grainBase64 = fs.readFileSync(absoluteGrainPath).toString("base64");
  const statsBase64 = fs.readFileSync(statsPath).toString("base64");

  const grainExt = path.extname(absoluteGrainPath).toLowerCase();
  const grainMediaType = grainExt === ".jpg" || grainExt === ".jpeg"
    ? "image/jpeg"
    : "image/png";

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: statsBase64,
                },
              },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: grainMediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                  data: grainBase64,
                },
              },
              {
                type: "text",
                text: "You are measuring a single rice grain. Look at the reference diagram showing how to measure length, width, and tail. Measure this grain and return ONLY a JSON object with: length_px (longest axis tip to tip in pixels), width_px (widest perpendicular cross-section in pixels), widest_point_y (y-coordinate of widest point from top), tail_length_px (distance from widest point to bottom tip in pixels). Return ONLY valid JSON.",
              },
            ],
          },
        ],
      });

      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text response from Claude");
      }

      const jsonMatch = textBlock.text.match(/\{[^}]+\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        grainId,
        lengthPx: parsed.length_px,
        widthPx: parsed.width_px,
        tailLengthPx: parsed.tail_length_px,
        success: true,
      };
    } catch (error) {
      if (attempt === retries) {
        return {
          grainId,
          lengthPx: 0,
          widthPx: 0,
          tailLengthPx: 0,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  }

  // Should not reach here, but TypeScript needs it
  return {
    grainId,
    lengthPx: 0,
    widthPx: 0,
    tailLengthPx: 0,
    success: false,
    error: "Exhausted retries",
  };
}

export async function measureAllGrains(
  grainPaths: Array<{ id: number; path: string }>,
  onProgress?: (completed: number, total: number) => void
): Promise<MeasurementResult[]> {
  const results: MeasurementResult[] = [];
  const batchSize = 10;

  for (let i = 0; i < grainPaths.length; i += batchSize) {
    const batch = grainPaths.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((grain) => measureSingleGrain(grain.path, grain.id))
    );
    results.push(...batchResults);

    if (onProgress) {
      onProgress(results.length, grainPaths.length);
    }
  }

  return results;
}

export function calibrateMeasurements(
  measurements: MeasurementResult[],
  rulerPixelsPerMm?: number | null
): CalibrationResult {
  const successful = measurements.filter((m) => m.success && m.lengthPx > 0);

  if (successful.length === 0) {
    return {
      calibrationFactor: 0,
      calibrated: measurements.map((m) => ({
        ...m,
        lengthMm: 0,
        widthMm: 0,
        tailLengthMm: 0,
      })),
    };
  }

  let mmPerPx: number;
  if (rulerPixelsPerMm && rulerPixelsPerMm > 0) {
    mmPerPx = 1 / rulerPixelsPerMm;
  } else {
    const maxLengthPx = Math.max(...successful.map((m) => m.lengthPx));
    mmPerPx = 5.3 / maxLengthPx;
  }

  const calibrated: CalibratedMeasurement[] = measurements.map((m) => ({
    ...m,
    lengthMm: m.success ? m.lengthPx * mmPerPx : 0,
    widthMm: m.success ? m.widthPx * mmPerPx : 0,
    tailLengthMm: m.success ? m.tailLengthPx * mmPerPx : 0,
  }));

  return { calibrationFactor: mmPerPx, calibrated };
}
