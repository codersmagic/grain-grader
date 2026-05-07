import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sessions, grains } from "@/lib/schema";
import { eq, asc } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();

    const { id } = await params;

    const session = db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .get();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const sessionGrains = db
      .select()
      .from(grains)
      .where(eq(grains.sessionId, id))
      .orderBy(asc(grains.grainNumber))
      .all();

    return NextResponse.json({ session, grains: sessionGrains });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Session detail error:", error);
    return NextResponse.json(
      { error: "Failed to load session" },
      { status: 500 }
    );
  }
}
