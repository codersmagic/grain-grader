import type { GradeLabel, QualityVerdict, ReferenceRanges } from "@/types";

interface GrainForGrading {
  lengthMm: number;
  widthMm: number;
  tailLengthMm: number;
  isBroken: boolean;
}

interface GradeResult {
  grade: GradeLabel;
  score: number | null;
}

interface RefMeasurement {
  lengthMm: number;
  widthMm: number;
  tailLengthMm: number;
}

export function computeReferenceRanges(refs: RefMeasurement[]): ReferenceRanges {
  const lengths = refs.map((r) => r.lengthMm);
  const widths = refs.map((r) => r.widthMm);
  const tails = refs.map((r) => r.tailLengthMm);

  return {
    lengthMin: Math.min(...lengths),
    lengthMax: Math.max(...lengths),
    widthMin: Math.min(...widths),
    widthMax: Math.max(...widths),
    tailMin: Math.min(...tails),
    tailMax: Math.max(...tails),
  };
}

export function gradeGrain(grain: GrainForGrading, ranges: ReferenceRanges): GradeResult {
  if (grain.isBroken) {
    return { grade: "broken", score: null };
  }

  const lengthPass = grain.lengthMm >= ranges.lengthMin && grain.lengthMm <= ranges.lengthMax ? 1 : 0;
  const widthPass = grain.widthMm >= ranges.widthMin && grain.widthMm <= ranges.widthMax ? 1 : 0;
  const tailPass = grain.tailLengthMm >= ranges.tailMin && grain.tailLengthMm <= ranges.tailMax ? 1 : 0;

  const score = lengthPass * 0.6 + widthPass * 0.25 + tailPass * 0.15;

  let grade: GradeLabel;
  if (score >= 0.9) {
    grade = "A";
  } else if (score >= 0.7) {
    grade = "B";
  } else if (score >= 0.5) {
    grade = "C";
  } else {
    grade = "D";
  }

  return { grade, score };
}

export function getQualityVerdict(gradeAPercent: number): QualityVerdict {
  if (gradeAPercent >= 80) return "Excellent batch";
  if (gradeAPercent >= 60) return "Good quality";
  if (gradeAPercent >= 40) return "Mixed quality";
  return "Review recommended";
}
