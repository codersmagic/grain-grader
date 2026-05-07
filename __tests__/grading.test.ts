import { describe, it, expect } from "vitest";
import {
  computeReferenceRanges,
  gradeGrain,
  getQualityVerdict,
} from "../src/lib/grading";

describe("computeReferenceRanges", () => {
  it("computes min and max for all dimensions", () => {
    const refs = [
      { lengthMm: 5.0, widthMm: 2.0, tailLengthMm: 1.0 },
      { lengthMm: 5.5, widthMm: 2.2, tailLengthMm: 1.3 },
      { lengthMm: 4.8, widthMm: 1.9, tailLengthMm: 0.9 },
    ];

    const ranges = computeReferenceRanges(refs);

    expect(ranges.lengthMin).toBe(4.8);
    expect(ranges.lengthMax).toBe(5.5);
    expect(ranges.widthMin).toBe(1.9);
    expect(ranges.widthMax).toBe(2.2);
    expect(ranges.tailMin).toBe(0.9);
    expect(ranges.tailMax).toBe(1.3);
  });

  it("handles single reference grain", () => {
    const refs = [{ lengthMm: 5.0, widthMm: 2.0, tailLengthMm: 1.0 }];
    const ranges = computeReferenceRanges(refs);

    expect(ranges.lengthMin).toBe(5.0);
    expect(ranges.lengthMax).toBe(5.0);
    expect(ranges.widthMin).toBe(2.0);
    expect(ranges.widthMax).toBe(2.0);
    expect(ranges.tailMin).toBe(1.0);
    expect(ranges.tailMax).toBe(1.0);
  });
});

describe("gradeGrain", () => {
  const ranges = {
    lengthMin: 4.5,
    lengthMax: 5.5,
    widthMin: 1.8,
    widthMax: 2.3,
    tailMin: 0.8,
    tailMax: 1.4,
  };

  it("returns grade A when all dimensions pass (score >= 0.9)", () => {
    const grain = {
      lengthMm: 5.0,
      widthMm: 2.0,
      tailLengthMm: 1.0,
      isBroken: false,
    };

    const result = gradeGrain(grain, ranges);
    expect(result.grade).toBe("A");
    expect(result.score).toBe(1.0);
  });

  it("returns grade B when length and width pass (score = 0.85)", () => {
    const grain = {
      lengthMm: 5.0,
      widthMm: 2.0,
      tailLengthMm: 2.0, // out of range
      isBroken: false,
    };

    const result = gradeGrain(grain, ranges);
    expect(result.grade).toBe("B");
    expect(result.score).toBe(0.85);
  });

  it("returns grade C when only length passes (score = 0.6)", () => {
    const grain = {
      lengthMm: 5.0,
      widthMm: 3.0, // out of range
      tailLengthMm: 2.0, // out of range
      isBroken: false,
    };

    const result = gradeGrain(grain, ranges);
    expect(result.grade).toBe("C");
    expect(result.score).toBe(0.6);
  });

  it("returns grade D when no dimensions pass (score = 0)", () => {
    const grain = {
      lengthMm: 3.0, // out of range
      widthMm: 3.0, // out of range
      tailLengthMm: 2.0, // out of range
      isBroken: false,
    };

    const result = gradeGrain(grain, ranges);
    expect(result.grade).toBe("D");
    expect(result.score).toBe(0);
  });

  it("returns broken grade with null score for broken grains", () => {
    const grain = {
      lengthMm: 5.0,
      widthMm: 2.0,
      tailLengthMm: 1.0,
      isBroken: true,
    };

    const result = gradeGrain(grain, ranges);
    expect(result.grade).toBe("broken");
    expect(result.score).toBeNull();
  });
});

describe("getQualityVerdict", () => {
  it("returns 'Excellent batch' for >= 80%", () => {
    expect(getQualityVerdict(80)).toBe("Excellent batch");
    expect(getQualityVerdict(100)).toBe("Excellent batch");
  });

  it("returns 'Good quality' for >= 60%", () => {
    expect(getQualityVerdict(60)).toBe("Good quality");
    expect(getQualityVerdict(79)).toBe("Good quality");
  });

  it("returns 'Mixed quality' for >= 40%", () => {
    expect(getQualityVerdict(40)).toBe("Mixed quality");
    expect(getQualityVerdict(59)).toBe("Mixed quality");
  });

  it("returns 'Review recommended' for < 40%", () => {
    expect(getQualityVerdict(39)).toBe("Review recommended");
    expect(getQualityVerdict(0)).toBe("Review recommended");
  });
});
