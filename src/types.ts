export type GradeLabel = "A" | "B" | "C" | "D" | "broken";
export type SessionStatus = "segmented" | "measured" | "graded";
export type QualityVerdict = "Excellent batch" | "Good quality" | "Mixed quality" | "Review recommended";

export interface BoundingBox {
  x: number; y: number; width: number; height: number;
}

export interface GrainMeasurement {
  length_px: number; width_px: number; widest_point_y: number; tail_length_px: number;
}

export interface GrainData {
  id: number; sessionId: string; grainNumber: number; cropImage: string;
  bbox: BoundingBox; lengthPx: number; widthPx: number; tailLengthPx: number;
  lengthMm: number; widthMm: number; tailLengthMm: number;
  isBroken: boolean; isReference: boolean; grade: GradeLabel | null; score: number | null;
}

export interface SessionData {
  id: string; userId: number; createdAt: string; originalImage: string;
  calibrationFactor: number | null; grainCount: number; status: SessionStatus; name: string | null;
}

export interface GradingResult {
  gradeA: number; gradeB: number; gradeC: number; gradeD: number;
  broken: number; total: number; verdict: QualityVerdict;
}

export interface ReferenceRanges {
  lengthMin: number; lengthMax: number; widthMin: number; widthMax: number;
  tailMin: number; tailMax: number;
}
