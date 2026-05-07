import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import path from "path";
import fs from "fs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    await requireAuth();

    const { path: pathSegments } = await params;
    const filePath = path.join(process.cwd(), ...pathSegments);

    // Prevent directory traversal
    const resolved = path.resolve(filePath);
    const dataDir = path.resolve(process.cwd(), "data");
    if (!resolved.startsWith(dataDir)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!fs.existsSync(resolved)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const buffer = fs.readFileSync(resolved);
    const ext = path.extname(resolved).toLowerCase();

    let contentType = "application/octet-stream";
    if (ext === ".png") contentType = "image/png";
    else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";

    return new NextResponse(buffer, {
      headers: { "Content-Type": contentType },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
