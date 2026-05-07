# Rice Grain Grader — Design Specification

## Overview

A locally-deployed web application for grading rice grains using computer vision. The app uses client-side image processing (canvas thresholding) to segment grains, and the Claude Vision API to measure each grain's dimensions. Users select reference grains and the app grades the entire batch using a weighted scoring algorithm.

## User Workflow

1. **Upload** — User uploads a photo of 20–50 rice grains on a white or black background
2. **Segment** — App uses canvas-based image processing (thresholding + contour detection) to identify and crop each grain
3. **Measure** — App sends each cropped grain to Claude Vision API to measure length, width, and tail
4. **Sort & Display** — Grains displayed in a numbered grid sorted by length (longest → shortest). Broken grains pre-flagged with gray badge.
5. **Select Reference** — User clicks to select 5–10 "good" grains (click to toggle, green highlight). Tooltip guides selection.
6. **Grade** — User clicks "Grade Now". App computes reference ranges from selected grains and grades all grains in one step.
7. **Results** — Grid transforms in-place with color-coded grains + stats dashboard with grade tier percentages and a plain-language quality verdict.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Next.js (full-stack) |
| UI | shadcn/ui + Tailwind CSS |
| Database | SQLite (via Drizzle ORM) |
| Segmentation | Client-side canvas (thresholding + contour detection) |
| Measurement | Claude Vision API (Anthropic) |
| Auth | Basic authentication (bcrypt + JWT) |
| Deployment | Local |

## System Architecture

### Frontend (Next.js Pages)

- **Login page** — username/password auth
- **Upload page** — drag-and-drop image upload with preview
- **Grading page** — sorted grain grid, selection UI, "Grade Now" button, results dashboard
- **Sessions page** — browse and reload past grading sessions

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/login` | POST | Authenticate user (rate-limited: 5/min) |
| `/api/auth/setup` | POST | First-run password setup |
| `/api/upload` | POST | Validate and store uploaded image, create session |
| `/api/segment` | POST | Client sends image, server runs canvas segmentation |
| `/api/measure` | POST | Claude Vision — measure all grains (parallel, rate-limited: 10/min) |
| `/api/grade` | POST | Compute reference ranges + grade all grains in one call |
| `/api/sessions` | GET | List user's past sessions |
| `/api/sessions/[id]` | GET | Load a specific session |
| `/api/profiles` | GET/POST | Manage saved reference profiles |

### Storage

- **SQLite database** (via Drizzle ORM — parameterized queries enforced) for sessions, grains, profiles, users
- **Filesystem** for original uploads and cropped grain images

## Segmentation — Client-Side Image Processing

### Approach

White grains on a dark background (or vice versa) is a textbook case for thresholding-based segmentation. No LLM needed.

### Pipeline

1. **Load image** into an HTML canvas element
2. **Convert to grayscale** — average RGB channels
3. **Auto-detect background** — sample corners to determine if background is light or dark
4. **Apply binary threshold** — Otsu's method or a fixed threshold based on background detection. Pixels above threshold = grain (on dark bg) or below = grain (on light bg)
5. **Find contours** — connected component labeling on the binary image
6. **Filter contours** — remove noise (too small) and merged blobs (too large). Flag unusually large contours as potential overlapping grains.
7. **Extract bounding boxes** — compute the axis-aligned bounding box for each contour
8. **Crop grains** — extract each grain region from the original image

### Overlap Detection

If a detected region's area exceeds 2× the median grain area, flag it as potentially overlapping grains. Show a warning to the user: "Some grains may be touching — results for those regions may be less accurate."

### Output

Array of cropped grain images with bounding box coordinates, ready for Claude measurement pass.

## Claude Vision API — Measurement Pass

### Input

Individual cropped grain image (base64), plus the stats.jpg reference diagram for context.

### Prompt Strategy

Ask Claude to measure the grain's length (long axis), width (short axis at widest point), and tail length (from widest point to bottom tip).

### Expected Output

```json
{
  "length_px": 78,
  "width_px": 28,
  "widest_point_y": 42,
  "tail_length_px": 18
}
```

### Execution

- 1 API call per grain (20–50 calls, parallelized with concurrency limit of 10)
- All measurements returned in pixels, converted to mm post-hoc
- Retry up to 2 times on malformed JSON
- If measurement fails after retries → mark as "unmeasured", exclude from grading

### Calibration: Pixel-to-Millimeter Conversion

The longest grain in the sample is assumed to be 5.3mm (hardcoded for now; user-configurable in a future release). After all grains are measured:

```
mm_per_px = 5.3 / max(all grain length_px values)
```

Apply to all grains:
```
length_mm = length_px × mm_per_px
width_mm  = width_px × mm_per_px
tail_mm   = tail_length_px × mm_per_px
```

**Future:** Replace with ruler detection in image or user-configurable calibration value.

### Error Handling

- Malformed JSON from Claude → retry up to 2 times
- Grain measurement failure → mark as "unmeasured", exclude from grading
- Segmentation finds 0 grains → show error asking user to re-upload with better contrast
- Segmentation finds overlapping grains → warn user, attempt measurement anyway

## Grain Measurement Definitions

Referencing stats.jpg:

- **Length:** The longest axis of the grain (tip to tip)
- **Width:** The widest perpendicular cross-section of the grain
- **Tail:** The portion of the grain below the widest point — measured from the widest point to the bottom tip

## Grading Algorithm

### Broken Grain Detection

A grain is classified as **broken** if:
```
length < 1.2 × width
```

Broken grains are pre-flagged in the sorted grid (gray badge) so users avoid selecting them as reference. They are excluded from weighted scoring and counted separately.

### Reference Range Computation

From the 5–10 user-selected reference grains:
```
length_range = [min(selected lengths), max(selected lengths)]
width_range  = [min(selected widths), max(selected widths)]
tail_range   = [min(selected tails), max(selected tails)]
```

### Weighted Scoring

For each non-broken grain:

1. **Binary pass/fail per dimension:**
   - `length_pass = 1` if length falls within length_range, else `0`
   - `width_pass = 1` if width falls within width_range, else `0`
   - `tail_pass = 1` if tail falls within tail_range, else `0`

2. **Weighted score:**
   ```
   score = (length_pass × 0.60) + (width_pass × 0.25) + (tail_pass × 0.15)
   ```

3. **Grade assignment:**
   | Grade | Score Range | Color |
   |-------|-------------|-------|
   | A | ≥ 0.90 (all three pass) | Green |
   | B | 0.70 – 0.89 | Yellow |
   | C | 0.50 – 0.69 | Orange |
   | D | < 0.50 | Red |
   | Broken | L < 1.2 × W | Gray |

### Possible Score Values

Given binary pass/fail with weights 60/25/15:
- **1.00** — all three pass → Grade A
- **0.85** — length + width pass → Grade B
- **0.75** — length + tail pass → Grade B
- **0.60** — length only passes → Grade C
- **0.40** — width + tail pass → Grade D
- **0.25** — width only passes → Grade D
- **0.15** — tail only passes → Grade D
- **0.00** — none pass → Grade D

### Quality Verdict

Based on Grade A percentage, display a plain-language verdict above the grade cards:

| Grade A % | Verdict |
|-----------|---------|
| ≥ 80% | "Excellent batch" |
| 60–79% | "Good quality" |
| 40–59% | "Mixed quality" |
| < 40% | "Review recommended" |

### Results Dashboard

Display after grading:
- Plain-language quality verdict (see above)
- Grade A percentage (green)
- Grade B percentage (yellow)
- Grade C percentage (orange)
- Grade D percentage (red)
- Broken grain percentage (gray)

## UI Design

### Screen 1: Upload

- Full-width drag-and-drop zone with camera icon
- "Analyze Image" button (disabled until image selected)
- Accepts JPEG/PNG only (validated server-side via magic bytes)
- Max file size: 10MB
- Shows image preview after selection
- Progress indicator during analysis: "Segmenting grains..." → "Measuring grain X of Y..." → "Done"

### Screen 2: Sorted Grid + Selection + Grading

- Header showing grain count and "Sorted by length ↓" indicator
- Grain grid with subtle alternating column backgrounds (zinc-900 / zinc-800) for scanability
- Each grain displayed at its original cropped size on a dark background cell
- Grain number label below each cell
- **Broken grain indicator** — grains with L < 1.2×W pre-flagged with a gray badge and subtle dimming
- **Selection interaction:**
  - Hover state: grain cell brightens slightly, cursor changes to pointer
  - Click to toggle selection: selected grains get a green ring + corner checkmark badge + slight green tint overlay
  - Click again to deselect
  - Broken grains can be clicked but show a warning tooltip: "This grain appears broken"
- **Selection counter** — sticky, prominent: "Selected: X / 5-10"
- **Selection guidance** — tooltip on the counter: "Select representative good grains — not the largest or smallest"
- **"Grade Now" button** — single action that computes reference ranges and grades in one step. Enabled when 5–10 grains selected, disabled otherwise.

### Screen 3: Grading Results

- Grid transforms in-place: each grain gets a colored outline + tint matching its grade
- **Quality verdict** banner at top: e.g., "Good quality" with appropriate color
- Stats dashboard with 5 cards showing percentages for each grade tier
- Reference ranges panel showing the computed length/width/tail ranges from selected grains
- Color legend bar
- Action buttons: Save Session, New Image, Export (CSV with grain measurements and grades)

### Navigation

- Top nav bar: app logo/name, Sessions link, Logout
- Single-page feel — screens transition within the grading page

### Progress Feedback

During the AI pipeline (10–15 seconds), show a multi-step progress indicator:
1. "Segmenting grains..." (with spinner)
2. "Measuring grain X of Y..." (with count updating in real-time)
3. "Analysis complete — X grains detected"

### Design System

- **Framework:** shadcn/ui components + Tailwind CSS
- **Theme:** Dark mode, modern and simplistic
- **Grid style:** Subtle alternating column backgrounds (zinc-900 / zinc-800) for readability

## Data Model

### sessions

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (UUID) | Primary key |
| user_id | INTEGER (FK) | References users.id |
| created_at | DATETIME | Session creation time |
| original_image | TEXT | File path to uploaded image |
| calibration_factor | REAL | mm_per_px conversion factor |
| grain_count | INTEGER | Number of grains detected |
| status | TEXT | 'segmented', 'measured', or 'graded' |
| name | TEXT | Optional user label |

### grains

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| session_id | TEXT (FK) | References sessions.id |
| grain_number | INTEGER | Sort order (1 = longest) |
| crop_image | TEXT | File path to cropped grain image |
| bbox_x | INTEGER | Bounding box x (px) |
| bbox_y | INTEGER | Bounding box y (px) |
| bbox_width | INTEGER | Bounding box width (px) |
| bbox_height | INTEGER | Bounding box height (px) |
| length_px | REAL | Length in pixels |
| width_px | REAL | Width in pixels |
| tail_length_px | REAL | Tail length in pixels |
| length_mm | REAL | Length in millimeters |
| width_mm | REAL | Width in millimeters |
| tail_length_mm | REAL | Tail length in millimeters |
| is_broken | BOOLEAN | True if L < 1.2 × W |
| is_reference | BOOLEAN | True if selected as reference grain |
| grade | TEXT | 'A', 'B', 'C', 'D', 'broken', or NULL |
| score | REAL | Weighted score (0–1), NULL if broken |

### reference_profiles

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| session_id | TEXT (FK) | References sessions.id |
| name | TEXT | Profile name (e.g., "Basmati Standard") |
| length_min | REAL | Min length (mm) |
| length_max | REAL | Max length (mm) |
| width_min | REAL | Min width (mm) |
| width_max | REAL | Max width (mm) |
| tail_min | REAL | Min tail (mm) |
| tail_max | REAL | Max tail (mm) |
| created_at | DATETIME | Profile creation time |

### users

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| username | TEXT | Unique username |
| password_hash | TEXT | bcrypt hashed password |

### Filesystem Layout

```
/data
├── /uploads        — original uploaded images (UUID-renamed)
├── /grains         — cropped grain images (organized by session_id/)
└── grain-grader.db — SQLite database file
```

## Authentication & Security

- Basic username/password authentication
- Passwords hashed with bcrypt
- **First-run setup:** No default credentials shipped. On first launch, app shows a setup page to create the initial admin account. App rejects startup if no user exists and setup hasn't been completed.
- **JWT:** Short-lived tokens (30 min expiry) stored in HTTP-only cookies with `Secure` and `SameSite=Strict` flags. Refresh token flow for session continuity.
- **AUTH_SECRET:** Auto-generated 256-bit random secret on first run if not provided in .env. Reject startup for secrets under 32 characters.
- **Rate limiting:** 5 attempts/min on login, 10 requests/min on Claude API routes.
- **File upload security:**
  - Validate MIME type via magic bytes (not file extension)
  - UUID-rename all uploaded files server-side (no user-supplied filenames)
  - Max file size: 10MB
  - Store uploads outside the webroot
- **SQL injection prevention:** Drizzle ORM enforces parameterized queries by default.

## Configuration

Environment variables (`.env`):
```
ANTHROPIC_API_KEY=sk-ant-...
AUTH_SECRET=<auto-generated if omitted>
```

Note: Username and password are configured via the first-run setup UI, not environment variables.

## Constraints and Risks

1. **Claude measurement accuracy** — Claude Vision is used only for measurement (not segmentation). Measurement accuracy depends on image quality and grain orientation. Mitigation: calibration factor normalizes relative measurements.

2. **API cost** — Each image analysis costs 20–50 measurement calls (one per grain). At Claude's pricing, approximately $0.05–0.30 per image depending on grain count and image size.

3. **Latency** — Segmentation is instant (client-side). Measurement calls parallelized with concurrency limit of 10. Expected ~5–10 seconds total per image.

4. **Calibration precision** — Using longest grain = 5.3mm is approximate. Real-world accuracy depends on image quality and Claude's measurement precision. Future: user-configurable calibration value and ruler detection.

5. **Overlapping grains** — Client-side segmentation may struggle with touching/overlapping grains. Mitigation: detect unusually large contours, warn user, and attempt measurement anyway.

6. **Binary scoring granularity** — The weighted scoring produces only 8 discrete score values. This is acceptable for the current use case (categorical grading), but a future enhancement could introduce continuous distance-from-range scoring for finer granularity.
