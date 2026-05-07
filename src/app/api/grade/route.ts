import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sessions, grains, referenceProfiles } from "@/lib/schema";
import { eq, inArray } from "drizzle-orm";
import { computeReferenceRanges, gradeGrain, getQualityVerdict } from "@/lib/grading";

export async function POST(request: Request) {
  try {
    await requireAuth();

    const body = await request.json();
    const { sessionId, selectedGrainIds } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
    }

    if (
      !selectedGrainIds ||
      !Array.isArray(selectedGrainIds) ||
      selectedGrainIds.length < 5 ||
      selectedGrainIds.length > 10
    ) {
      return NextResponse.json(
        { error: "Please select between 5 and 10 reference grains" },
        { status: 400 }
      );
    }

    const session = db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .get();

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Mark reference grains
    const selectedGrainIdsNum = selectedGrainIds.map(Number);

    // Reset all grains to non-reference first
    db.update(grains)
      .set({ isReference: false })
      .where(eq(grains.sessionId, sessionId))
      .run();

    // Set selected grains as reference
    db.update(grains)
      .set({ isReference: true })
      .where(inArray(grains.id, selectedGrainIdsNum))
      .run();

    // Load reference grains
    const refGrains = db
      .select()
      .from(grains)
      .where(inArray(grains.id, selectedGrainIdsNum))
      .all();

    // Compute reference ranges
    const refMeasurements = refGrains.map((g) => ({
      lengthMm: g.lengthMm ?? 0,
      widthMm: g.widthMm ?? 0,
      tailLengthMm: g.tailLengthMm ?? 0,
    }));

    const ranges = computeReferenceRanges(refMeasurements);

    // Save reference profile
    db.insert(referenceProfiles)
      .values({
        sessionId,
        name: `Profile ${new Date().toISOString()}`,
        lengthMin: ranges.lengthMin,
        lengthMax: ranges.lengthMax,
        widthMin: ranges.widthMin,
        widthMax: ranges.widthMax,
        tailMin: ranges.tailMin,
        tailMax: ranges.tailMax,
      })
      .run();

    // Grade ALL grains
    const allGrains = db
      .select()
      .from(grains)
      .where(eq(grains.sessionId, sessionId))
      .all();

    let gradeACount = 0;
    let gradeBCount = 0;
    let gradeCCount = 0;
    let gradeDCount = 0;
    let brokenCount = 0;
    const total = allGrains.length;

    for (const grain of allGrains) {
      const result = gradeGrain(
        {
          lengthMm: grain.lengthMm ?? 0,
          widthMm: grain.widthMm ?? 0,
          tailLengthMm: grain.tailLengthMm ?? 0,
          isBroken: grain.isBroken ?? false,
        },
        ranges
      );

      db.update(grains)
        .set({ grade: result.grade, score: result.score })
        .where(eq(grains.id, grain.id))
        .run();

      switch (result.grade) {
        case "A":
          gradeACount++;
          break;
        case "B":
          gradeBCount++;
          break;
        case "C":
          gradeCCount++;
          break;
        case "D":
          gradeDCount++;
          break;
        case "broken":
          brokenCount++;
          break;
      }
    }

    // Update session status
    db.update(sessions)
      .set({ status: "graded" })
      .where(eq(sessions.id, sessionId))
      .run();

    const gradeAPercent = total > 0 ? (gradeACount / total) * 100 : 0;
    const verdict = getQualityVerdict(gradeAPercent);

    return NextResponse.json({
      ranges,
      results: {
        gradeA: total > 0 ? (gradeACount / total) * 100 : 0,
        gradeB: total > 0 ? (gradeBCount / total) * 100 : 0,
        gradeC: total > 0 ? (gradeCCount / total) * 100 : 0,
        gradeD: total > 0 ? (gradeDCount / total) * 100 : 0,
        broken: total > 0 ? (brokenCount / total) * 100 : 0,
        total,
        verdict,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Grading error:", error);
    return NextResponse.json(
      { error: "Grading failed" },
      { status: 500 }
    );
  }
}
