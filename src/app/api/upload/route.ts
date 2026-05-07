import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { validateImageMagicBytes, MAX_FILE_SIZE } from "@/lib/upload-validation";
import { db } from "@/lib/db";
import { sessions } from "@/lib/schema";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";

export async function POST(request: Request) {
  try {
    const user = await requireAuth();

    const formData = await request.formData();
    const file = formData.get("image");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No image file provided" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size exceeds 10MB limit" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const imageType = validateImageMagicBytes(buffer);
    if (!imageType) {
      return NextResponse.json(
        { error: "Invalid image format. Only JPEG and PNG are supported." },
        { status: 400 }
      );
    }

    const uploadsDir = path.join(process.cwd(), "data", "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const ext = imageType === "jpeg" ? "jpg" : "png";
    const filename = `${uuidv4()}.${ext}`;
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, buffer);

    const sessionId = uuidv4();
    const imagePath = `data/uploads/${filename}`;

    db.insert(sessions)
      .values({
        id: sessionId,
        userId: user.userId,
        originalImage: imagePath,
        grainCount: 0,
        status: "segmented",
      })
      .run();

    return NextResponse.json({ sessionId, imagePath });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
