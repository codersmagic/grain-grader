import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sessions, grains } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { segmentGrains } from "@/lib/segmentation";

export async function POST(request: Request) {
  try {
    await requireAuth();

    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
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

    const result = await segmentGrains(session.originalImage, sessionId);

    // Insert each grain into the grains table
    for (let i = 0; i < result.grains.length; i++) {
      const grain = result.grains[i];
      db.insert(grains)
        .values({
          sessionId,
          grainNumber: i + 1,
          cropImage: `data/grains/${sessionId}/grain_${i + 1}.png`,
          bboxX: grain.bbox.x,
          bboxY: grain.bbox.y,
          bboxWidth: grain.bbox.width,
          bboxHeight: grain.bbox.height,
          lengthPx: grain.lengthPx,
          widthPx: grain.widthPx,
          tailLengthPx: grain.tailLengthPx,
        })
        .run();
    }

    // Update session grain count, status, and ruler calibration if detected
    db.update(sessions)
      .set({
        grainCount: result.grains.length,
        status: "segmented",
        ...(result.pixelsPerMm != null
          ? { calibrationFactor: result.pixelsPerMm }
          : {}),
      })
      .where(eq(sessions.id, sessionId))
      .run();

    return NextResponse.json({
      grainCount: result.grains.length,
      hasOverlaps: result.hasOverlaps,
      pixelsPerMm: result.pixelsPerMm,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Segmentation error:", error);
    return NextResponse.json(
      { error: "Segmentation failed" },
      { status: 500 }
    );
  }
}
