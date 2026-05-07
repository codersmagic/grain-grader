import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sessions, grains } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { measureAllGrains, calibrateMeasurements } from "@/lib/measurement";

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

    // Load all grains for session
    const sessionGrains = db
      .select()
      .from(grains)
      .where(eq(grains.sessionId, sessionId))
      .all();

    if (sessionGrains.length === 0) {
      return NextResponse.json(
        { error: "No grains found for this session" },
        { status: 400 }
      );
    }

    // Prepare grain paths
    const grainPaths = sessionGrains.map((g) => ({
      id: g.id,
      path: g.cropImage,
    }));

    // Measure all grains
    const measurements = await measureAllGrains(grainPaths);

    // Calibrate measurements
    const { calibrationFactor, calibrated } =
      calibrateMeasurements(measurements);

    // Update each grain with measurements
    let measured = 0;
    let failed = 0;

    for (const m of calibrated) {
      if (m.success) {
        const isBroken = m.lengthMm < 1.2 * m.widthMm;
        db.update(grains)
          .set({
            lengthPx: m.lengthPx,
            widthPx: m.widthPx,
            tailLengthPx: m.tailLengthPx,
            lengthMm: m.lengthMm,
            widthMm: m.widthMm,
            tailLengthMm: m.tailLengthMm,
            isBroken,
          })
          .where(eq(grains.id, m.grainId))
          .run();
        measured++;
      } else {
        failed++;
      }
    }

    // Re-sort grains by lengthPx descending and update grainNumber
    const updatedGrains = db
      .select()
      .from(grains)
      .where(eq(grains.sessionId, sessionId))
      .all()
      .sort((a, b) => (b.lengthPx ?? 0) - (a.lengthPx ?? 0));

    for (let i = 0; i < updatedGrains.length; i++) {
      db.update(grains)
        .set({ grainNumber: i + 1 })
        .where(eq(grains.id, updatedGrains[i].id))
        .run();
    }

    // Update session
    db.update(sessions)
      .set({
        calibrationFactor,
        status: "measured",
      })
      .where(eq(sessions.id, sessionId))
      .run();

    return NextResponse.json({
      measured,
      failed,
      calibrationFactor,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Measurement error:", error);
    return NextResponse.json(
      { error: "Measurement failed" },
      { status: 500 }
    );
  }
}
