import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  originalImage: text("original_image").notNull(),
  calibrationFactor: real("calibration_factor"),
  grainCount: integer("grain_count").notNull().default(0),
  status: text("status").notNull().default("segmented"),
  name: text("name"),
});

export const grains = sqliteTable("grains", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  grainNumber: integer("grain_number").notNull(),
  cropImage: text("crop_image").notNull(),
  bboxX: integer("bbox_x").notNull(),
  bboxY: integer("bbox_y").notNull(),
  bboxWidth: integer("bbox_width").notNull(),
  bboxHeight: integer("bbox_height").notNull(),
  lengthPx: real("length_px").notNull().default(0),
  widthPx: real("width_px").notNull().default(0),
  tailLengthPx: real("tail_length_px").notNull().default(0),
  lengthMm: real("length_mm").notNull().default(0),
  widthMm: real("width_mm").notNull().default(0),
  tailLengthMm: real("tail_length_mm").notNull().default(0),
  isBroken: integer("is_broken", { mode: "boolean" }).notNull().default(false),
  isReference: integer("is_reference", { mode: "boolean" }).notNull().default(false),
  grade: text("grade"),
  score: real("score"),
});

export const referenceProfiles = sqliteTable("reference_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  name: text("name").notNull(),
  lengthMin: real("length_min").notNull(),
  lengthMax: real("length_max").notNull(),
  widthMin: real("width_min").notNull(),
  widthMax: real("width_max").notNull(),
  tailMin: real("tail_min").notNull(),
  tailMax: real("tail_max").notNull(),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});
