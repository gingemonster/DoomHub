import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import type { AppConfig } from "./config.js";

export function openDatabase(config: AppConfig): DatabaseType {
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  const db = new Database(config.databasePath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS wads (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      sha256 TEXT NOT NULL UNIQUE,
      allowed_modes TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rooms (
      room_id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      wad_id TEXT NOT NULL REFERENCES wads(id),
      mode TEXT NOT NULL,
      max_players INTEGER NOT NULL,
      episode INTEGER NOT NULL,
      map INTEGER NOT NULL,
      skill INTEGER NOT NULL,
      deathmatch_monsters INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_heartbeat_at TEXT
    );

    CREATE TABLE IF NOT EXISTS room_heartbeats (
      room_slug TEXT NOT NULL,
      player_id TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      PRIMARY KEY (room_slug, player_id)
    );
  `);

  ensureRoomColumns(db);
  seedSharewareWad(db);
  return db;
}

function ensureRoomColumns(db: DatabaseType): void {
  const columns = db.prepare("PRAGMA table_info(rooms)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "deathmatch_monsters")) {
    db.prepare("ALTER TABLE rooms ADD COLUMN deathmatch_monsters INTEGER NOT NULL DEFAULT 0").run();
  }
}

function seedSharewareWad(db: DatabaseType): void {
  const exists = db.prepare("SELECT id FROM wads WHERE id = ?").get("doom-shareware");
  if (exists) {
    return;
  }

  db.prepare(`
    INSERT INTO wads (id, display_name, file_name, sha256, allowed_modes, created_at)
    VALUES (@id, @displayName, @fileName, @sha256, @allowedModes, @createdAt)
  `).run({
    id: "doom-shareware",
    displayName: "Doom Shareware",
    fileName: "doom1.wad",
    sha256: "operator-mounted-shareware-wad",
    allowedModes: JSON.stringify(["cooperative", "deathmatch"]),
    createdAt: new Date().toISOString()
  });
}
