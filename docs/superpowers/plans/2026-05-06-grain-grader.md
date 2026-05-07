# Rice Grain Grader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build a locally-deployed Next.js webapp that segments rice grains from uploaded photos, measures them via Claude Vision API, and grades them against user-selected reference grains.

**Architecture:** Next.js 14 App Router full-stack app. Client uploads image, server segments via sharp + custom algorithm, Claude Vision measures each grain, client displays sorted grid, user selects references, server grades all grains. SQLite via Drizzle ORM for persistence.

**Tech Stack:** Next.js 14, TypeScript, shadcn/ui, Tailwind CSS, Drizzle ORM, better-sqlite3, sharp, @anthropic-ai/sdk, jose (JWT), bcryptjs

---

## File Structure

```
grain-grader/
  package.json
  next.config.mjs
  tailwind.config.ts
  tsconfig.json
  components.json               (shadcn/ui config)
  drizzle.config.ts
  .env.example
  .env.local                    (local secrets, gitignored)
  .gitignore
  public/
    stats.jpg                   (grain measurement reference diagram)
  src/
    app/
      layout.tsx                (root layout: dark theme, fonts, nav)
      page.tsx                  (redirect to /upload or /login)
      login/page.tsx
      setup/page.tsx
      upload/page.tsx
      grading/[sessionId]/page.tsx
      sessions/page.tsx
      api/
        auth/login/route.ts
        auth/setup/route.ts
        upload/route.ts
        segment/route.ts
        measure/route.ts
        grade/route.ts
        sessions/route.ts
        sessions/[id]/route.ts
        static/[...path]/route.ts
    lib/
      db.ts                     (SQLite connection singleton)
      schema.ts                 (Drizzle schema for all tables)
      auth.ts                   (JWT sign/verify + auth helpers)
      upload-validation.ts      (magic byte validation, UUID rename)
      segmentation.ts           (image segmentation via sharp + pixel processing)
      measurement.ts            (Claude Vision API measurement client)
      grading.ts                (grading algorithm + quality verdict)
      rate-limit.ts             (simple in-memory rate limiter)
    components/
      ui/                       (shadcn components)
      nav-bar.tsx
      upload-dropzone.tsx
      progress-indicator.tsx
      grain-grid.tsx
      grain-card.tsx
      selection-counter.tsx
      results-dashboard.tsx
      quality-verdict.tsx
    types.ts                    (shared TypeScript types)
  data/                         (runtime data, gitignored)
    uploads/
    grains/
  __tests__/
    grading.test.ts
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `next.config.mjs`, `tailwind.config.ts`, `tsconfig.json`, `.env.example`, `.env.local`, `.gitignore`, `components.json`, `drizzle.config.ts`

- [ ] **Step 1: Initialize Next.js project**

Run in the project root `/Users/irraju/src/adish/grain-grader`:

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

Accept defaults. This creates the base Next.js 14 project with App Router, TypeScript, Tailwind, and ESLint.

- [ ] **Step 2: Install dependencies**

```bash
npm install @anthropic-ai/sdk drizzle-orm better-sqlite3 bcryptjs jose sharp uuid
npm install -D drizzle-kit @types/better-sqlite3 @types/bcryptjs @types/uuid vitest
```

- [ ] **Step 3: Install shadcn/ui**

```bash
npx shadcn@latest init -d
npx shadcn@latest add button card input label badge tooltip progress dialog
```

- [ ] **Step 4: Configure dark mode in tailwind.config.ts**

Ensure `darkMode: ["class"]` is set and `tailwindcss-animate` plugin is included.

- [ ] **Step 5: Create .env.example and .env.local**

`.env.example`:
```
ANTHROPIC_API_KEY=sk-ant-...
AUTH_SECRET=
```

`.env.local`:
```
ANTHROPIC_API_KEY=
AUTH_SECRET=
```

- [ ] **Step 6: Update .gitignore**

Append:
```
data/
.env.local
```

- [ ] **Step 7: Create data directories and copy reference image**

```bash
mkdir -p data/uploads data/grains
cp stats.jpg public/stats.jpg
```

- [ ] **Step 8: Create drizzle.config.ts**

```ts
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/lib/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: "./data/grain-grader.db",
  },
} satisfies Config;
```

- [ ] **Step 9: Create next.config.mjs**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "sharp"],
};

export default nextConfig;
```

- [ ] **Step 10: Verify project builds**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 11: Commit**

```bash
git init && git add -A && git commit -m "feat: scaffold Next.js project with dependencies"
```

---

## Task 2: Database Schema and Shared Types

**Files:**
- Create: `src/types.ts`, `src/lib/schema.ts`, `src/lib/db.ts`

- [ ] **Step 1: Create shared types in src/types.ts**

```ts
export type GradeLabel = "A" | "B" | "C" | "D" | "broken";
export type SessionStatus = "segmented" | "measured" | "graded";
export type QualityVerdict = "Excellent batch" | "Good quality" | "Mixed quality" | "Review recommended";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GrainMeasurement {
  length_px: number;
  width_px: number;
  widest_point_y: number;
  tail_length_px: number;
}

export interface GrainData {
  id: number;
  sessionId: string;
  grainNumber: number;
  cropImage: string;
  bbox: BoundingBox;
  lengthPx: number;
  widthPx: number;
  tailLengthPx: number;
  lengthMm: number;
  widthMm: number;
  tailLengthMm: number;
  isBroken: boolean;
  isReference: boolean;
  grade: GradeLabel | null;
  score: number | null;
}

export interface SessionData {
  id: string;
  userId: number;
  createdAt: string;
  originalImage: string;
  calibrationFactor: number | null;
  grainCount: number;
  status: SessionStatus;
  name: string | null;
}

export interface GradingResult {
  gradeA: number;
  gradeB: number;
  gradeC: number;
  gradeD: number;
  broken: number;
  total: number;
  verdict: QualityVerdict;
}

export interface ReferenceRanges {
  lengthMin: number;
  lengthMax: number;
  widthMin: number;
  widthMax: number;
  tailMin: number;
  tailMax: number;
}

export interface SegmentationResult {
  grains: Array<{
    bbox: BoundingBox;
    cropDataUrl: string;
    isOverlapping: boolean;
  }>;
  hasOverlaps: boolean;
}
```

- [ ] **Step 2: Create Drizzle schema in src/lib/schema.ts**

```ts
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  createdAt: text("created_at").notNull(),
  originalImage: text("original_image").notNull(),
  calibrationFactor: real("calibration_factor"),
  grainCount: integer("grain_count").notNull().default(0),
  status: text("status").notNull().default("segmented"),
  name: text("name"),
});

export const grains = sqliteTable("grains", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id").notNull().references(() => sessions.id),
  grainNumber: integer("grain_number").notNull(),
  cropImage: text("crop_image").notNull(),
  bboxX: integer("bbox_x").notNull(),
  bboxY: integer("bbox_y").notNull(),
  bboxWidth: integer("bbox_width").notNull(),
  bboxHeight: integer("bbox_height").notNull(),
  lengthPx: real("length_px"),
  widthPx: real("width_px"),
  tailLengthPx: real("tail_length_px"),
  lengthMm: real("length_mm"),
  widthMm: real("width_mm"),
  tailLengthMm: real("tail_length_mm"),
  isBroken: integer("is_broken", { mode: "boolean" }).default(false),
  isReference: integer("is_reference", { mode: "boolean" }).default(false),
  grade: text("grade"),
  score: real("score"),
});

export const referenceProfiles = sqliteTable("reference_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id").notNull().references(() => sessions.id),
  name: text("name").notNull(),
  lengthMin: real("length_min").notNull(),
  lengthMax: real("length_max").notNull(),
  widthMin: real("width_min").notNull(),
  widthMax: real("width_max").notNull(),
  tailMin: real("tail_min").notNull(),
  tailMax: real("tail_max").notNull(),
  createdAt: text("created_at").notNull(),
});
```

- [ ] **Step 3: Create database connection in src/lib/db.ts**

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "grain-grader.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    original_image TEXT NOT NULL,
    calibration_factor REAL,
    grain_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'segmented',
    name TEXT
  );
  CREATE TABLE IF NOT EXISTS grains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    grain_number INTEGER NOT NULL,
    crop_image TEXT NOT NULL,
    bbox_x INTEGER NOT NULL,
    bbox_y INTEGER NOT NULL,
    bbox_width INTEGER NOT NULL,
    bbox_height INTEGER NOT NULL,
    length_px REAL,
    width_px REAL,
    tail_length_px REAL,
    length_mm REAL,
    width_mm REAL,
    tail_length_mm REAL,
    is_broken INTEGER DEFAULT 0,
    is_reference INTEGER DEFAULT 0,
    grade TEXT,
    score REAL
  );
  CREATE TABLE IF NOT EXISTS reference_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    name TEXT NOT NULL,
    length_min REAL NOT NULL,
    length_max REAL NOT NULL,
    width_min REAL NOT NULL,
    width_max REAL NOT NULL,
    tail_min REAL NOT NULL,
    tail_max REAL NOT NULL,
    created_at TEXT NOT NULL
  );
`);
```

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/lib/schema.ts src/lib/db.ts
git commit -m "feat: add database schema, types, and connection"
```

---

## Task 3: Authentication System

**Files:**
- Create: `src/lib/auth.ts`, `src/lib/rate-limit.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/setup/route.ts`

- [ ] **Step 1: Create rate limiter in src/lib/rate-limit.ts**

```ts
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (entry.count >= maxPerMinute) {
    return false;
  }

  entry.count++;
  return true;
}
```

- [ ] **Step 2: Create auth helpers in src/lib/auth.ts**

```ts
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { db } from "./db";
import { users } from "./schema";
import crypto from "crypto";

function getSecret(): Uint8Array {
  let secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    secret = crypto.randomBytes(32).toString("hex");
    process.env.AUTH_SECRET = secret;
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createToken(userId: number, username: string): Promise<string> {
  return new SignJWT({ userId, username })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30m")
    .setIssuedAt()
    .sign(getSecret());
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as { userId: number; username: string };
  } catch {
    return null;
  }
}

export async function getAuthUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function requireAuth() {
  const user = await getAuthUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function needsSetup(): Promise<boolean> {
  const allUsers = db.select().from(users).all();
  return allUsers.length === 0;
}
```

- [ ] **Step 3: Create setup API route at src/app/api/auth/setup/route.ts**

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { hashPassword, createToken, needsSetup } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  const isSetup = await needsSetup();
  if (!isSetup) {
    return NextResponse.json({ error: "Setup already completed" }, { status: 400 });
  }

  const { username, password } = await request.json();
  if (!username || !password || password.length < 8) {
    return NextResponse.json(
      { error: "Username required. Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const passwordHash = await hashPassword(password);
  const result = db.insert(users).values({ username, passwordHash }).returning().get();
  const token = await createToken(result.id, result.username);

  const cookieStore = await cookies();
  cookieStore.set("auth-token", token, {
    httpOnly: true,
    sameSite: "strict",
    maxAge: 30 * 60,
    path: "/",
  });

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Create login API route at src/app/api/auth/login/route.ts**

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { verifyPassword, createToken } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "local";
  if (!rateLimit(`login:${ip}`, 5)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const { username, password } = await request.json();
  const user = db.select().from(users).where(eq(users.username, username)).get();
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await createToken(user.id, user.username);
  const cookieStore = await cookies();
  cookieStore.set("auth-token", token, {
    httpOnly: true,
    sameSite: "strict",
    maxAge: 30 * 60,
    path: "/",
  });

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/lib/rate-limit.ts src/app/api/auth/
git commit -m "feat: add authentication system with JWT and rate limiting"
```

---

## Task 4: Auth UI (Login + Setup Pages)

**Files:**
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`
- Create: `src/app/login/page.tsx`, `src/app/setup/page.tsx`, `src/components/nav-bar.tsx`

- [ ] **Step 1: Update root layout for dark theme in src/app/layout.tsx**

Set `<html className="dark">` and body to `bg-zinc-950 text-zinc-100 min-h-screen`.

- [ ] **Step 2: Create nav bar in src/components/nav-bar.tsx**

NavBar with: app title linking to /upload, Sessions link, Logout button that clears the auth cookie and redirects to /login.

- [ ] **Step 3: Create root page redirect in src/app/page.tsx**

Server component that checks: if `needsSetup()` redirect to /setup, if no auth user redirect to /login, else redirect to /upload.

- [ ] **Step 4: Create setup page in src/app/setup/page.tsx**

Client component with form: username input, password input (min 8 chars), submit button. POSTs to /api/auth/setup. On success redirects to /upload. Shows errors.

- [ ] **Step 5: Create login page in src/app/login/page.tsx**

Client component with form: username input, password input, submit button. POSTs to /api/auth/login. On success redirects to /upload. Shows errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/layout.tsx src/app/page.tsx src/app/login/ src/app/setup/ src/components/nav-bar.tsx
git commit -m "feat: add auth UI with login and first-run setup pages"
```

See full component code in the design spec UI section. Components use shadcn Card, Input, Label, Button.

---

## Task 5: File Upload and Validation

**Files:**
- Create: `src/lib/upload-validation.ts`, `src/app/api/upload/route.ts`

- [ ] **Step 1: Create upload validation in src/lib/upload-validation.ts**

```ts
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

export function validateImageMagicBytes(buffer: Buffer): "jpeg" | "png" | null {
  if (buffer.length < 4) return null;
  if (JPEG_MAGIC.every((byte, i) => buffer[i] === byte)) return "jpeg";
  if (PNG_MAGIC.every((byte, i) => buffer[i] === byte)) return "png";
  return null;
}

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
```

- [ ] **Step 2: Create upload API route at src/app/api/upload/route.ts**

Accepts multipart form data with "image" field. Validates magic bytes, checks size under 10MB, generates UUID filename, writes to data/uploads/, creates session row in DB with status "segmented". Returns `{ sessionId, imagePath }`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/upload-validation.ts src/app/api/upload/
git commit -m "feat: add file upload with magic byte validation"
```

---

## Task 6: Segmentation Engine

**Files:**
- Create: `src/lib/segmentation.ts`, `src/app/api/segment/route.ts`

- [ ] **Step 1: Create segmentation library in src/lib/segmentation.ts**

Implementation using `sharp` for image loading:
1. Load image, get raw grayscale pixels via `sharp().grayscale().raw().toBuffer()`
2. Auto-detect background: sample 4 corner pixels, avgCorner < 128 means dark background
3. Otsu's threshold: compute histogram, find threshold that maximizes inter-class variance
4. Create binary image: on dark bg, pixels > threshold = grain; on light bg, pixels < threshold = grain
5. Connected component labeling: flood-fill based, assigns unique label to each connected region
6. Extract regions: compute bounding box (minX, minY, maxX, maxY) and area for each label
7. Filter: remove regions with area < 100 pixels (noise)
8. Overlap detection: if region area > 2x median area, flag as potentially overlapping
9. Crop each grain: use `sharp().extract()` with 4px padding around bbox, save as PNG to data/grains/{sessionId}/grain_{n}.png

Returns `{ grains: Array<{ bbox, area, cropBuffer }>, hasOverlaps: boolean }`.

- [ ] **Step 2: Create segment API route at src/app/api/segment/route.ts**

Accepts `{ sessionId }`. Loads session from DB, runs `segmentGrains()`, inserts each grain into grains table with bbox coordinates and crop_image path. Updates session grain_count and status. Returns `{ grainCount, hasOverlaps }`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/segmentation.ts src/app/api/segment/
git commit -m "feat: add grain segmentation with Otsu thresholding"
```

---

## Task 7: Claude Measurement Service

**Files:**
- Create: `src/lib/measurement.ts`, `src/app/api/measure/route.ts`

- [ ] **Step 1: Create measurement library in src/lib/measurement.ts**

Functions:
- `measureSingleGrain(grainImagePath, grainId, retries=2)`: Reads grain PNG and stats.jpg reference as base64. Calls Claude API (claude-sonnet-4-20250514) with both images + measurement prompt. Prompt asks Claude to return JSON with length_px, width_px, widest_point_y, tail_length_px. Extracts JSON from response text. Returns `MeasurementResult`.
- `measureAllGrains(grainPaths, onProgress?)`: Processes grains in batches of 10 (concurrency limit). Uses `Promise.all` per batch. Calls onProgress callback after each batch.
- `calibrateMeasurements(measurements)`: Finds max length_px among successful measurements. Computes `mmPerPx = 5.3 / maxLengthPx`. Converts all measurements to mm. Returns `{ calibrationFactor, calibrated }`.

- [ ] **Step 2: Create measure API route at src/app/api/measure/route.ts**

Accepts `{ sessionId }`. Loads all grains for session. Calls `measureAllGrains()`. Calls `calibrateMeasurements()`. Updates each grain row with measurements (px and mm) and is_broken flag (`lengthMm < 1.2 * widthMm`). Re-sorts grains by length descending and updates grain_number. Updates session calibration_factor and status to "measured". Returns `{ measured, failed, calibrationFactor }`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/measurement.ts src/app/api/measure/
git commit -m "feat: add Claude Vision measurement with calibration"
```

---

## Task 8: Grading Algorithm

**Files:**
- Create: `src/lib/grading.ts`, `src/app/api/grade/route.ts`, `__tests__/grading.test.ts`

- [ ] **Step 1: Write grading tests in __tests__/grading.test.ts**

Test cases:
- `computeReferenceRanges`: given 3 reference grains, returns correct min/max for each dimension
- `gradeGrain`: all 3 pass returns Grade A (score 1.0), length+width pass returns Grade B (0.85), length only returns Grade C (0.60), none pass returns Grade D (0.0), broken returns "broken" with null score
- `getQualityVerdict`: 85% returns "Excellent batch", 65% returns "Good quality", 45% returns "Mixed quality", 30% returns "Review recommended"

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run __tests__/grading.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Create grading library in src/lib/grading.ts**

Functions:
- `computeReferenceRanges(refs)`: Returns `{ lengthMin, lengthMax, widthMin, widthMax, tailMin, tailMax }` from min/max of each dimension.
- `gradeGrain(grain, ranges)`: Binary pass/fail per dimension. Score = lengthPass*0.6 + widthPass*0.25 + tailPass*0.15. Grade: >=0.9 A, >=0.7 B, >=0.5 C, else D. Broken grains return { grade: "broken", score: null }.
- `getQualityVerdict(gradeAPercent)`: >=80 "Excellent batch", >=60 "Good quality", >=40 "Mixed quality", else "Review recommended".

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run __tests__/grading.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Create grade API route at src/app/api/grade/route.ts**

Accepts `{ sessionId, selectedGrainIds }`. Validates 5-10 selections. Marks reference grains in DB. Computes reference ranges. Saves reference profile. Grades all grains. Updates each grain with grade and score. Updates session status to "graded". Returns `{ ranges, results: { gradeA%, gradeB%, gradeC%, gradeD%, broken%, total, verdict } }`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/grading.ts src/app/api/grade/ __tests__/grading.test.ts
git commit -m "feat: add grading algorithm with weighted scoring"
```

---

## Task 9: Upload Page UI

**Files:**
- Create: `src/components/upload-dropzone.tsx`, `src/components/progress-indicator.tsx`, `src/app/upload/page.tsx`

- [ ] **Step 1: Create progress indicator in src/components/progress-indicator.tsx**

Props: `{ step, measuredCount?, totalCount?, error? }`. Steps: idle, uploading, segmenting, measuring, done, error. Shows vertical step list with colored dots (green=done, blue+pulse=active, zinc=pending). Active measuring step shows "Measuring grain X of Y...".

- [ ] **Step 2: Create upload dropzone in src/components/upload-dropzone.tsx**

Props: `{ onFileSelected, disabled }`. Drag-and-drop zone with dashed border. Shows camera icon, "Drop rice grain image here", file type info. On file drop/select, shows image preview. Supports click-to-browse.

- [ ] **Step 3: Create upload page in src/app/upload/page.tsx**

Client component with NavBar. Shows UploadDropzone. "Analyze Image" button (disabled until file selected, hidden during processing). On click: POST /api/upload, then POST /api/segment, then POST /api/measure, updating ProgressIndicator at each step. On success, navigates to /grading/{sessionId} after 1.5s delay.

- [ ] **Step 4: Commit**

```bash
git add src/components/upload-dropzone.tsx src/components/progress-indicator.tsx src/app/upload/
git commit -m "feat: add upload page with drag-and-drop and progress"
```

---

## Task 10: Grain Grid, Selection, and Grading Page

**Files:**
- Create: `src/components/grain-card.tsx`, `src/components/grain-grid.tsx`, `src/components/selection-counter.tsx`, `src/app/grading/[sessionId]/page.tsx`

- [ ] **Step 1: Create grain card in src/components/grain-card.tsx**

Props: `{ grainNumber, cropImage, isBroken, isSelected, grade, onToggle, selectable }`. Shows cropped grain image on dark background. Selection: green ring + corner checkmark. Graded: colored ring matching grade (green/yellow/orange/red/gray). Broken: gray badge + dimmed opacity. Hover: brightens slightly. Broken grains show tooltip "This grain appears broken" when selectable.

- [ ] **Step 2: Create selection counter in src/components/selection-counter.tsx**

Shows "Selected: X / 5-10" in a pill. Green tint when 5-10 selected. Tooltip: "Select representative good grains".

- [ ] **Step 3: Create grain grid in src/components/grain-grid.tsx**

Props: `{ grains, selectedIds, onToggleGrain, selectable, columns=8 }`. CSS grid with alternating column backgrounds (zinc-900 / zinc-800/70). Renders GrainCard for each grain.

- [ ] **Step 4: Create grading page in src/app/grading/[sessionId]/page.tsx**

Client component. On mount: fetches session data from GET /api/sessions/{id}. Shows NavBar, grain count header, sorted-by-length indicator. Before grading: shows GrainGrid (selectable), SelectionCounter, "Grade Now" button (enabled when 5-10 selected). On Grade Now: POSTs to /api/grade with selectedGrainIds, reloads grains with grades. After grading: shows ResultsDashboard above grid, GrainGrid (not selectable, showing grades), Export CSV + New Image buttons.

- [ ] **Step 5: Commit**

```bash
git add src/components/grain-card.tsx src/components/grain-grid.tsx src/components/selection-counter.tsx src/app/grading/
git commit -m "feat: add grain grid with selection and grading page"
```

---

## Task 11: Results Dashboard

**Files:**
- Create: `src/components/quality-verdict.tsx`, `src/components/results-dashboard.tsx`

- [ ] **Step 1: Create quality verdict in src/components/quality-verdict.tsx**

Banner component. Maps verdict to color style: Excellent=green, Good=blue, Mixed=yellow, Review=red. Shows verdict text in colored rounded box.

- [ ] **Step 2: Create results dashboard in src/components/results-dashboard.tsx**

Props: `{ results: GradingResult, ranges: ReferenceRanges }`. Shows: QualityVerdictBanner, 5 grade cards in a row (A green, B yellow, C orange, D red, Broken gray) with percentages, Reference Ranges panel (length/width/tail min-max in mm), Color legend bar.

- [ ] **Step 3: Commit**

```bash
git add src/components/quality-verdict.tsx src/components/results-dashboard.tsx
git commit -m "feat: add results dashboard with quality verdict"
```

---

## Task 12: Sessions Page and Static File Serving

**Files:**
- Create: `src/app/api/sessions/route.ts`, `src/app/api/sessions/[id]/route.ts`, `src/app/sessions/page.tsx`, `src/app/api/static/[...path]/route.ts`

- [ ] **Step 1: Create sessions list API at src/app/api/sessions/route.ts**

GET handler. Requires auth. Queries sessions table filtered by user_id, ordered by created_at desc. Returns JSON array.

- [ ] **Step 2: Create session detail API at src/app/api/sessions/[id]/route.ts**

GET handler. Requires auth. Fetches session + all grains ordered by grain_number asc. Returns `{ session, grains }`.

- [ ] **Step 3: Create static file serving at src/app/api/static/[...path]/route.ts**

GET handler. Requires auth. Reads file from data/ directory. Returns with appropriate Content-Type (image/png, image/jpeg). Returns 404 if not found. This serves the cropped grain images to the frontend.

- [ ] **Step 4: Create sessions page at src/app/sessions/page.tsx**

Client component with NavBar. Fetches GET /api/sessions. Shows list of session cards: name (or "Session {id prefix}"), date, grain count, status badge (blue=segmented, yellow=measured, green=graded). Click navigates to /grading/{id}. Empty state: "No sessions yet."

- [ ] **Step 5: Commit**

```bash
git add src/app/api/sessions/ src/app/sessions/ src/app/api/static/
git commit -m "feat: add sessions page and static file serving"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All spec sections have corresponding tasks: auth (T3-T4), upload (T5), segmentation (T6), measurement (T7), grading (T8), upload UI (T9), grid/selection UI (T10), results (T11), sessions (T12), security (T3 rate limiting, T5 magic bytes)
- [x] **Placeholder scan:** No TBD/TODO items. All tasks have concrete implementation details.
- [x] **Type consistency:** Types in T2 (GradeLabel, GradingResult, ReferenceRanges, QualityVerdict) used consistently in T8, T10, T11.
- [x] **Missing items addressed:** Static file serving route added in T12 for grain image display.
