import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { grains } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;
    const grainId = parseInt(id, 10);
    if (isNaN(grainId)) {
      return NextResponse.json({ error: "Invalid grain ID" }, { status: 400 });
    }

    db.delete(grains).where(eq(grains.id, grainId)).run();

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Delete grain error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
