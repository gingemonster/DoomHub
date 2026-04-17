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
      sha256 TEXT NOT NULL,
      allowed_modes TEXT NOT NULL,
      map_format TEXT NOT NULL DEFAULT 'episode-map',
      max_episode INTEGER NOT NULL DEFAULT 4,
      max_map INTEGER NOT NULL DEFAULT 9,
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
      map_format TEXT NOT NULL DEFAULT 'episode-map',
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

  ensureWadSchema(db);
  ensureRoomColumns(db);
  seedSharewareWad(db);
  return db;
}

function ensureWadSchema(db: DatabaseType): void {
  const columns = db.prepare("PRAGMA table_info(wads)").all() as Array<{ name: string }>;
  const indexes = db.prepare("PRAGMA index_list(wads)").all() as Array<{ origin: string; unique: number }>;
  if (indexes.some((index) => index.origin === "u" && index.unique === 1)) {
    rebuildWadsTable(db, columns);
    return;
  }

  if (!columns.some((column) => column.name === "map_format")) {
    db.prepare("ALTER TABLE wads ADD COLUMN map_format TEXT NOT NULL DEFAULT 'episode-map'").run();
  }
  if (!columns.some((column) => column.name === "max_episode")) {
    db.prepare("ALTER TABLE wads ADD COLUMN max_episode INTEGER NOT NULL DEFAULT 4").run();
  }
  if (!columns.some((column) => column.name === "max_map")) {
    db.prepare("ALTER TABLE wads ADD COLUMN max_map INTEGER NOT NULL DEFAULT 9").run();
  }
}

function rebuildWadsTable(db: DatabaseType, columns: Array<{ name: string }>): void {
  const hasColumn = (name: string) => columns.some((column) => column.name === name);
  const mapFormat = hasColumn("map_format") ? "map_format" : "'episode-map'";
  const maxEpisode = hasColumn("max_episode") ? "max_episode" : "4";
  const maxMap = hasColumn("max_map") ? "max_map" : "9";

  db.exec(`
    CREATE TABLE wads_next (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      allowed_modes TEXT NOT NULL,
      map_format TEXT NOT NULL DEFAULT 'episode-map',
      max_episode INTEGER NOT NULL DEFAULT 4,
      max_map INTEGER NOT NULL DEFAULT 9,
      created_at TEXT NOT NULL
    );

    INSERT INTO wads_next (
      id, display_name, file_name, sha256, allowed_modes, map_format, max_episode, max_map, created_at
    )
    SELECT id, display_name, file_name, sha256, allowed_modes, ${mapFormat}, ${maxEpisode}, ${maxMap}, created_at
    FROM wads;

    DROP TABLE wads;
    ALTER TABLE wads_next RENAME TO wads;
  `);
}

function ensureRoomColumns(db: DatabaseType): void {
  const columns = db.prepare("PRAGMA table_info(rooms)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "deathmatch_monsters")) {
    db.prepare("ALTER TABLE rooms ADD COLUMN deathmatch_monsters INTEGER NOT NULL DEFAULT 0").run();
  }
  if (!columns.some((column) => column.name === "map_format")) {
    db.prepare("ALTER TABLE rooms ADD COLUMN map_format TEXT NOT NULL DEFAULT 'episode-map'").run();
  }
}

function seedSharewareWad(db: DatabaseType): void {
  const exists = db.prepare("SELECT id FROM wads WHERE id = ?").get("doom-shareware");
  if (exists) {
    return;
  }

  db.prepare(`
    INSERT INTO wads (id, display_name, file_name, sha256, allowed_modes, map_format, max_episode, max_map, created_at)
    VALUES (@id, @displayName, @fileName, @sha256, @allowedModes, @mapFormat, @maxEpisode, @maxMap, @createdAt)
  `).run({
    id: "doom-shareware",
    displayName: "Doom Shareware",
    fileName: "doom1.wad",
    sha256: "operator-mounted-shareware-wad",
    allowedModes: JSON.stringify(["cooperative", "deathmatch"]),
    mapFormat: "episode-map",
    maxEpisode: 1,
    maxMap: 9,
    createdAt: new Date().toISOString()
  });
}
