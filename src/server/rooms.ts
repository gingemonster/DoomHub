import fs from "node:fs";
import path from "node:path";
import { customAlphabet, nanoid } from "nanoid";
import type { Database } from "better-sqlite3";
import type { AppConfig } from "./config.js";
import { HttpError } from "./errors.js";
import type { LaunchConfig, RoomMode, RoomRecord, RoomSummary, WadRecord } from "./types.js";

const roomSlug = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);
const allowedModes = new Set<RoomMode>(["cooperative", "deathmatch"]);

interface CreateRoomInput {
  wadId?: string;
  mode?: RoomMode;
  maxPlayers?: number;
  episode?: number;
  map?: number;
  skill?: number;
  deathmatchMonsters?: boolean;
}

interface RoomRow {
  room_id: string;
  slug: string;
  wad_id: string;
  mode: RoomMode;
  max_players: number;
  episode: number;
  map: number;
  skill: number;
  deathmatch_monsters: number;
  created_at: string;
  expires_at: string;
  last_heartbeat_at: string | null;
}

interface WadRow {
  id: string;
  display_name: string;
  file_name: string;
  sha256: string;
  allowed_modes: string;
  created_at: string;
}

export class RoomService {
  constructor(
    private readonly db: Database,
    private readonly config: AppConfig
  ) {}

  listRooms(): RoomSummary[] {
    if (!this.config.visiblePrivateRooms) {
      return [];
    }

    this.cleanupExpiredRooms();
    const rows = this.db.prepare(`
      SELECT r.*,
        (SELECT COUNT(*) FROM room_heartbeats h
          WHERE h.room_slug = r.slug
          AND h.last_seen_at > datetime('now', '-45 seconds')) AS active_players
      FROM rooms r
      WHERE r.expires_at > datetime('now')
      ORDER BY r.created_at DESC
      LIMIT 50
    `).all() as Array<RoomRow & { active_players: number }>;
    const wads = new Map(this.listWads().map((wad) => [wad.id, wad]));

    return rows.map((row) => ({
      ...mapRoom(row),
      wadDisplayName: wads.get(row.wad_id)?.displayName ?? titleFromId(row.wad_id),
      activePlayers: row.active_players
    }));
  }

  createRoom(input: CreateRoomInput): RoomRecord {
    const availableWads = this.listWads();
    const wadId = input.wadId ?? availableWads.find((wad) => wad.id === "doom-shareware")?.id ?? availableWads[0]?.id ?? "doom-shareware";
    const mode = input.mode ?? "deathmatch";
    const maxPlayers = input.maxPlayers ?? 2;
    const episode = input.episode ?? 1;
    const map = input.map ?? 1;
    const skill = input.skill ?? 3;
    const deathmatchMonsters = mode === "deathmatch" && input.deathmatchMonsters === true;

    if (!allowedModes.has(mode)) {
      throw new HttpError(400, "Mode must be cooperative or deathmatch.");
    }
    if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 4) {
      throw new HttpError(400, "Doom multiplayer rooms support 2 to 4 players.");
    }
    if (!Number.isInteger(episode) || episode < 1 || episode > 4) {
      throw new HttpError(400, "Episode must be between 1 and 4.");
    }
    if (!Number.isInteger(map) || map < 1 || map > 9) {
      throw new HttpError(400, "Map must be between 1 and 9.");
    }
    if (!Number.isInteger(skill) || skill < 1 || skill > 5) {
      throw new HttpError(400, "Skill must be between 1 and 5.");
    }

    const wad = this.getWad(wadId);
    if (!wad.allowedModes.includes(mode)) {
      throw new HttpError(400, `${wad.displayName} does not allow ${mode} rooms.`);
    }
    this.ensureWadRecord(wad);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.roomTtlMinutes * 60_000);
    let slug = roomSlug();
    for (let i = 0; i < 5 && this.findRoom(slug, false); i += 1) {
      slug = roomSlug();
    }

    const room: RoomRecord = {
      roomId: nanoid(),
      slug,
      wadId,
      mode,
      maxPlayers,
      episode,
      map,
      skill,
      deathmatchMonsters,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastHeartbeatAt: null
    };

    this.db.prepare(`
      INSERT INTO rooms (
        room_id, slug, wad_id, mode, max_players, episode, map, skill, deathmatch_monsters,
        created_at, expires_at, last_heartbeat_at
      )
      VALUES (
        @roomId, @slug, @wadId, @mode, @maxPlayers, @episode, @map, @skill, @deathmatchMonsters,
        @createdAt, @expiresAt, @lastHeartbeatAt
      )
    `).run({
      ...room,
      deathmatchMonsters: room.deathmatchMonsters ? 1 : 0
    });

    return room;
  }

  getRoom(slug: string): RoomRecord {
    const room = this.findRoom(slug, true);
    if (!room) {
      throw new HttpError(404, "Room not found.");
    }
    return room;
  }

  getLaunchConfig(slug: string): LaunchConfig {
    const room = this.getRoom(slug);
    return {
      bundleUrl: `/api/rooms/${room.slug}/bundle`,
      ipxBackend: "DoomHub",
      room: room.slug,
      ipx: [{ name: "DoomHub", host: this.config.ipxWssUrl }]
    };
  }

  heartbeat(slug: string, playerId: string): { activePlayers: number } {
    this.getRoom(slug);
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO room_heartbeats (room_slug, player_id, last_seen_at)
      VALUES (?, ?, ?)
      ON CONFLICT(room_slug, player_id)
      DO UPDATE SET last_seen_at = excluded.last_seen_at
    `).run(slug, playerId, now);
    this.db.prepare("UPDATE rooms SET last_heartbeat_at = ? WHERE slug = ?").run(now, slug);
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM room_heartbeats
      WHERE room_slug = ?
      AND last_seen_at > datetime('now', '-45 seconds')
    `).get(slug) as { count: number };
    return { activePlayers: row.count };
  }

  listWads(): WadRecord[] {
    const rows = this.db.prepare("SELECT * FROM wads ORDER BY display_name").all() as WadRow[];
    const dbWads = new Map(rows.map((row) => [row.id, mapWad(row)]));
    return this.listBundleWads(dbWads).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  private getWad(id: string): WadRecord {
    const wad = this.listWads().find((item) => item.id === id);
    if (!wad) {
      throw new HttpError(400, "Unknown WAD.");
    }
    return wad;
  }

  private listBundleWads(dbWads: Map<string, WadRecord>): WadRecord[] {
    const entries = fs.existsSync(this.config.bundleStoragePath)
      ? fs.readdirSync(this.config.bundleStoragePath, { withFileTypes: true })
      : [];

    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".jsdos"))
      .map((entry) => {
        const id = entry.name.slice(0, -".jsdos".length);
        const dbWad = dbWads.get(id);
        return {
          id,
          displayName: dbWad?.displayName ?? titleFromId(id),
          fileName: dbWad?.fileName ?? entry.name,
          sha256: dbWad?.sha256 ?? `bundle:${id}`,
          allowedModes: dbWad?.allowedModes ?? ["cooperative", "deathmatch"],
          createdAt: dbWad?.createdAt ?? fs.statSync(path.join(this.config.bundleStoragePath, entry.name)).mtime.toISOString()
        };
      });
  }

  private ensureWadRecord(wad: WadRecord): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO wads (id, display_name, file_name, sha256, allowed_modes, created_at)
      VALUES (@id, @displayName, @fileName, @sha256, @allowedModes, @createdAt)
    `).run({
      id: wad.id,
      displayName: wad.displayName,
      fileName: wad.fileName,
      sha256: wad.sha256,
      allowedModes: JSON.stringify(wad.allowedModes),
      createdAt: wad.createdAt
    });
  }

  private findRoom(slug: string, requireActive: boolean): RoomRecord | null {
    const row = this.db.prepare("SELECT * FROM rooms WHERE slug = ?").get(slug) as RoomRow | undefined;
    if (!row) {
      return null;
    }

    const room = mapRoom(row);
    if (requireActive && Date.parse(room.expiresAt) <= Date.now()) {
      throw new HttpError(410, "Room has expired.");
    }

    return room;
  }

  private cleanupExpiredRooms(): void {
    this.db.prepare("DELETE FROM room_heartbeats WHERE room_slug IN (SELECT slug FROM rooms WHERE expires_at <= datetime('now'))").run();
    this.db.prepare("DELETE FROM rooms WHERE expires_at <= datetime('now')").run();
  }
}

function mapRoom(row: RoomRow): RoomRecord {
  return {
    roomId: row.room_id,
    slug: row.slug,
    wadId: row.wad_id,
    mode: row.mode,
    maxPlayers: row.max_players,
    episode: row.episode,
    map: row.map,
    skill: row.skill,
    deathmatchMonsters: row.deathmatch_monsters === 1,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastHeartbeatAt: row.last_heartbeat_at
  };
}

function mapWad(row: WadRow): WadRecord {
  return {
    id: row.id,
    displayName: row.display_name,
    fileName: row.file_name,
    sha256: row.sha256,
    allowedModes: JSON.parse(row.allowed_modes) as RoomMode[],
    createdAt: row.created_at
  };
}

function titleFromId(id: string): string {
  return id
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
