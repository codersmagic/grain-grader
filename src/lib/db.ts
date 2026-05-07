import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const dbDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, "grain-grader.db");
const sqlite = new Database(dbPath);

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const initSQL = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
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
    length_px REAL NOT NULL DEFAULT 0,
    width_px REAL NOT NULL DEFAULT 0,
    tail_length_px REAL NOT NULL DEFAULT 0,
    length_mm REAL NOT NULL DEFAULT 0,
    width_mm REAL NOT NULL DEFAULT 0,
    tail_length_mm REAL NOT NULL DEFAULT 0,
    is_broken INTEGER NOT NULL DEFAULT 0,
    is_reference INTEGER NOT NULL DEFAULT 0,
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
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

sqlite.exec(initSQL);

export const db = drizzle(sqlite, { schema });
