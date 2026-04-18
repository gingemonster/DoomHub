import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { customAlphabet, nanoid } from "nanoid";
import type { Database } from "better-sqlite3";
import type { AppConfig } from "./config.js";
import { buildDoomWasmArgs } from "./doomLaunch.js";
import { HttpError } from "./errors.js";
import type { LaunchConfig, LaunchRole, MapFormat, RoomMode, RoomRecord, RoomSummary, WadRecord } from "./types.js";
import { hashFile, inspectWadFile } from "./wadMetadata.js";

const roomSlug = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);
const allowedModes = new Set<RoomMode>(["cooperative", "deathmatch"]);
const maxTimerMinutes = 120;

interface CreateRoomInput {
  baseWadId?: string;
  wadId?: string;
  addonWadIds?: string[];
  mode?: RoomMode;
  maxPlayers?: number;
  episode?: number;
  map?: number;
  skill?: number;
  deathmatchMonsters?: boolean;
  levelTimerMinutes?: number;
}

export interface CreateRoomResult {
  room: RoomRecord;
  hostToken: string;
}

interface RoomRow {
  room_id: string;
  slug: string;
  wad_id: string;
  addon_wad_ids: string;
  mode: RoomMode;
  max_players: number;
  episode: number;
  map: number;
  map_format: MapFormat;
  skill: number;
  deathmatch_monsters: number;
  level_timer_minutes: number;
  game_started_at: string | null;
  host_token_hash: string;
  created_at: string;
  expires_at: string;
  last_heartbeat_at: string | null;
}

interface WadRow {
  id: string;
  display_name: string;
  file_name: string;
  sha256: string;
  kind: "base" | "addon";
  identification: "IWAD" | "PWAD";
  allowed_modes: string;
  map_format: MapFormat;
  max_episode: number;
  max_map: number;
  maps_json: string;
  created_at: string;
}

export class RoomService {
  constructor(
    private readonly db: Database,
    private readonly config: AppConfig
  ) {}

  async listRooms(): Promise<RoomSummary[]> {
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
    const wads = new Map((await this.listWads()).map((wad) => [wad.id, wad]));

    return rows.map((row) => ({
      ...mapRoom(row),
      wadDisplayName: wads.get(row.wad_id)?.displayName ?? titleFromId(row.wad_id),
      activePlayers: row.active_players
    }));
  }

  async createRoom(input: CreateRoomInput): Promise<CreateRoomResult> {
    const availableWads = await this.listWads();
    const baseWads = availableWads.filter((wad) => wad.kind === "base");
    const baseWadId = input.baseWadId ?? input.wadId ?? baseWads.find((wad) => wad.id === "doom-shareware")?.id ?? baseWads[0]?.id;
    if (!baseWadId) {
      throw new HttpError(400, "No base IWAD files are available.");
    }

    const baseWad = this.getWadFromList(baseWadId, availableWads);
    if (baseWad.kind !== "base") {
      throw new HttpError(400, "Room base WAD must be an IWAD.");
    }

    const addonWadIds = uniqueStrings(input.addonWadIds ?? []);
    const addonWads = addonWadIds.map((id) => this.getWadFromList(id, availableWads));
    for (const addon of addonWads) {
      if (addon.kind !== "addon") {
        throw new HttpError(400, `${addon.displayName} is not an add-on PWAD.`);
      }
      if (addon.mapFormat !== baseWad.mapFormat) {
        throw new HttpError(400, `${addon.displayName} is not compatible with ${baseWad.displayName}.`);
      }
    }

    if (addonWads.length > 0 && isSharewareBase(baseWad)) {
      throw new HttpError(400, "Shareware Doom cannot load add-on PWAD files.");
    }

    const mode = input.mode ?? "deathmatch";
    const maxPlayers = input.maxPlayers ?? 2;
    const episode = input.episode ?? 1;
    const map = input.map ?? 1;
    const skill = input.skill ?? 3;
    const levelTimerMinutes = input.levelTimerMinutes ?? 0;
    const deathmatchMonsters = mode === "deathmatch" && input.deathmatchMonsters === true;
    const mapFormat = baseWad.mapFormat;
    const effectiveMaps = effectiveMapNames(baseWad, addonWads);

    if (!allowedModes.has(mode)) {
      throw new HttpError(400, "Mode must be cooperative or deathmatch.");
    }
    if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 4) {
      throw new HttpError(400, "Doom multiplayer rooms support 2 to 4 players.");
    }
    if (!Number.isInteger(skill) || skill < 1 || skill > 5) {
      throw new HttpError(400, "Skill must be between 1 and 5.");
    }
    if (!Number.isInteger(levelTimerMinutes) || levelTimerMinutes < 0 || levelTimerMinutes > maxTimerMinutes) {
      throw new HttpError(400, `Level timer must be between 0 and ${maxTimerMinutes} minutes.`);
    }
    if (mapFormat === "episode-map" && (!Number.isInteger(episode) || episode < 1 || episode > maxEpisode(baseWad, addonWads))) {
      throw new HttpError(400, `Episode must be between 1 and ${maxEpisode(baseWad, addonWads)}.`);
    }
    if (!Number.isInteger(map) || map < 1 || map > maxMap(baseWad, addonWads)) {
      throw new HttpError(400, `Map must be between 1 and ${maxMap(baseWad, addonWads)}.`);
    }
    if (effectiveMaps.length > 0 && !effectiveMaps.includes(formatMapName(mapFormat, episode, map))) {
      throw new HttpError(400, `${formatMapName(mapFormat, episode, map)} is not available in the selected WAD files.`);
    }
    if (!baseWad.allowedModes.includes(mode)) {
      throw new HttpError(400, `${baseWad.displayName} does not allow ${mode} rooms.`);
    }

    this.ensureWadRecord(baseWad);
    addonWads.forEach((wad) => this.ensureWadRecord(wad));

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.roomTtlMinutes * 60_000);
    const hostToken = crypto.randomBytes(32).toString("hex");
    let slug = roomSlug();
    for (let i = 0; i < 5 && this.findRoom(slug, false); i += 1) {
      slug = roomSlug();
    }

    const room: RoomRecord = {
      roomId: nanoid(),
      slug,
      baseWadId,
      addonWadIds,
      mode,
      maxPlayers,
      episode,
      map,
      mapFormat,
      skill,
      deathmatchMonsters,
      levelTimerMinutes,
      gameStartedAt: null,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastHeartbeatAt: null
    };

    this.db.prepare(`
      INSERT INTO rooms (
        room_id, slug, wad_id, addon_wad_ids, mode, max_players, episode, map, map_format, skill,
        deathmatch_monsters, level_timer_minutes, game_started_at, host_token_hash,
        created_at, expires_at, last_heartbeat_at
      )
      VALUES (
        @roomId, @slug, @baseWadId, @addonWadIds, @mode, @maxPlayers, @episode, @map, @mapFormat, @skill,
        @deathmatchMonsters, @levelTimerMinutes, @gameStartedAt, @hostTokenHash,
        @createdAt, @expiresAt, @lastHeartbeatAt
      )
    `).run({
      ...room,
      addonWadIds: JSON.stringify(room.addonWadIds),
      deathmatchMonsters: room.deathmatchMonsters ? 1 : 0,
      hostTokenHash: hashHostToken(hostToken)
    });

    return { room, hostToken };
  }

  getRoom(slug: string): RoomRecord {
    const room = this.findRoom(slug, true);
    if (!room) {
      throw new HttpError(404, "Room not found.");
    }
    return room;
  }

  async getLaunchConfig(slug: string, hostToken: string | undefined, wsUrl: string): Promise<LaunchConfig> {
    const room = this.getRoom(slug);
    const role = this.isHost(slug, hostToken) ? "host" : "joiner";
    const gameStarted = room.gameStartedAt !== null;
    const canLaunch = role === "host" || !gameStarted;
    const wads = await this.listWads();
    const baseWad = this.getWadFromList(room.baseWadId, wads);
    const addonWads = room.addonWadIds.map((id) => this.getWadFromList(id, wads));

    return {
      role,
      room: room.slug,
      canLaunch,
      gameStarted,
      blockedReason: canLaunch ? null : "Game already started. Doom multiplayer rooms do not support late join.",
      wsPath: `/api/rooms/${room.slug}/ws`,
      wasmScriptUrl: "/doom-wasm/websockets-doom.js",
      baseWad: launchWadFile(baseWad),
      addonWads: addonWads.map(launchWadFile),
      args: buildDoomWasmArgs(room, baseWad, addonWads, role, wsUrl)
    };
  }

  startRoom(slug: string, hostToken: string | undefined): RoomRecord {
    if (!this.isHost(slug, hostToken)) {
      throw new HttpError(403, "Host token is required to start the room.");
    }

    const room = this.getRoom(slug);
    if (room.gameStartedAt) {
      return room;
    }

    const startedAt = new Date().toISOString();
    this.db.prepare("UPDATE rooms SET game_started_at = ? WHERE slug = ?").run(startedAt, slug);
    return { ...room, gameStartedAt: startedAt };
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

  async listWads(): Promise<WadRecord[]> {
    const rows = this.db.prepare("SELECT * FROM wads ORDER BY display_name").all() as WadRow[];
    const dbWads = new Map(rows.map((row) => [row.id, mapWad(row)]));
    const wads = await this.listWadFiles(dbWads);
    return wads.sort((a, b) => a.kind.localeCompare(b.kind) || a.displayName.localeCompare(b.displayName));
  }

  getWadFilePath(id: string): string {
    const row = this.db.prepare("SELECT * FROM wads WHERE id = ?").get(id) as WadRow | undefined;
    if (!row) {
      throw new HttpError(404, "WAD not found.");
    }
    const filePath = path.join(this.config.wadStoragePath, row.file_name);
    if (!fs.existsSync(filePath)) {
      throw new HttpError(404, "WAD file is not available.");
    }
    return filePath;
  }

  private getWadFromList(id: string, wads: WadRecord[]): WadRecord {
    const wad = wads.find((item) => item.id === id);
    if (!wad) {
      throw new HttpError(400, "Unknown WAD.");
    }
    return wad;
  }

  private async listWadFiles(dbWads: Map<string, WadRecord>): Promise<WadRecord[]> {
    const entries = fs.existsSync(this.config.wadStoragePath)
      ? fs.readdirSync(this.config.wadStoragePath, { withFileTypes: true })
      : [];

    return Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".wad"))
      .map(async (entry) => {
        const id = idFromFileName(entry.name);
        const dbWad = dbWads.get(id);
        const wadPath = path.join(this.config.wadStoragePath, entry.name);
        const sha256 = await hashFile(wadPath);
        const existingMetadataIsCurrent = dbWad?.sha256 === sha256;
        const metadata = existingMetadataIsCurrent
          ? {
              sha256,
              kind: dbWad.kind,
              identification: dbWad.identification,
              mapFormat: dbWad.mapFormat,
              maxEpisode: dbWad.maxEpisode,
              maxMap: dbWad.maxMap,
              maps: dbWad.maps
            }
          : await inspectWadFile(wadPath);
        const wad: WadRecord = {
          id,
          displayName: dbWad?.displayName ?? titleFromId(id),
          fileName: entry.name,
          sha256: metadata.sha256,
          kind: metadata.kind,
          identification: metadata.identification,
          allowedModes: dbWad?.allowedModes ?? ["cooperative", "deathmatch"],
          mapFormat: metadata.mapFormat,
          maxEpisode: metadata.maxEpisode,
          maxMap: metadata.maxMap,
          maps: metadata.maps,
          createdAt: dbWad?.createdAt ?? fs.statSync(wadPath).mtime.toISOString()
        };
        if (!existingMetadataIsCurrent) {
          this.ensureWadRecord(wad);
        }
        return wad;
      }));
  }

  private ensureWadRecord(wad: WadRecord): void {
    this.db.prepare(`
      INSERT INTO wads (
        id, display_name, file_name, sha256, kind, identification, allowed_modes,
        map_format, max_episode, max_map, maps_json, created_at
      )
      VALUES (
        @id, @displayName, @fileName, @sha256, @kind, @identification, @allowedModes,
        @mapFormat, @maxEpisode, @maxMap, @mapsJson, @createdAt
      )
      ON CONFLICT(id) DO UPDATE SET
        display_name = excluded.display_name,
        file_name = excluded.file_name,
        sha256 = excluded.sha256,
        kind = excluded.kind,
        identification = excluded.identification,
        allowed_modes = excluded.allowed_modes,
        map_format = excluded.map_format,
        max_episode = excluded.max_episode,
        max_map = excluded.max_map,
        maps_json = excluded.maps_json
    `).run({
      id: wad.id,
      displayName: wad.displayName,
      fileName: wad.fileName,
      sha256: wad.sha256,
      kind: wad.kind,
      identification: wad.identification,
      allowedModes: JSON.stringify(wad.allowedModes),
      mapFormat: wad.mapFormat,
      maxEpisode: wad.maxEpisode,
      maxMap: wad.maxMap,
      mapsJson: JSON.stringify(wad.maps),
      createdAt: wad.createdAt
    });
  }

  private isHost(slug: string, hostToken: string | undefined): boolean {
    if (!hostToken) {
      return false;
    }

    const row = this.db.prepare("SELECT host_token_hash FROM rooms WHERE slug = ?").get(slug) as Pick<RoomRow, "host_token_hash"> | undefined;
    return row ? row.host_token_hash === hashHostToken(hostToken) : false;
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
    baseWadId: row.wad_id,
    addonWadIds: JSON.parse(row.addon_wad_ids) as string[],
    mode: row.mode,
    maxPlayers: row.max_players,
    episode: row.episode,
    map: row.map,
    mapFormat: row.map_format,
    skill: row.skill,
    deathmatchMonsters: row.deathmatch_monsters === 1,
    levelTimerMinutes: row.level_timer_minutes,
    gameStartedAt: row.game_started_at,
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
    kind: row.kind,
    identification: row.identification,
    allowedModes: JSON.parse(row.allowed_modes) as RoomMode[],
    mapFormat: row.map_format,
    maxEpisode: row.max_episode,
    maxMap: row.max_map,
    maps: JSON.parse(row.maps_json) as string[],
    createdAt: row.created_at
  };
}

function launchWadFile(wad: WadRecord) {
  return {
    id: wad.id,
    fileName: wad.fileName,
    url: `/api/wads/${encodeURIComponent(wad.id)}/file`
  };
}

function titleFromId(id: string): string {
  return id
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function idFromFileName(fileName: string): string {
  return path.basename(fileName, path.extname(fileName)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))];
}

function hashHostToken(hostToken: string): string {
  return crypto.createHash("sha256").update(hostToken).digest("hex");
}

function isSharewareBase(wad: WadRecord): boolean {
  return wad.id.includes("shareware") || wad.fileName.toLowerCase() === "doom1.wad";
}

function effectiveMapNames(baseWad: WadRecord, addonWads: WadRecord[]): string[] {
  return uniqueStrings([baseWad, ...addonWads].flatMap((wad) => wad.maps));
}

function maxEpisode(baseWad: WadRecord, addonWads: WadRecord[]): number {
  return Math.max(baseWad.maxEpisode, ...addonWads.map((wad) => wad.maxEpisode));
}

function maxMap(baseWad: WadRecord, addonWads: WadRecord[]): number {
  return Math.max(baseWad.maxMap, ...addonWads.map((wad) => wad.maxMap));
}

function formatMapName(mapFormat: MapFormat, episode: number, map: number): string {
  return mapFormat === "map-number" ? `MAP${String(map).padStart(2, "0")}` : `E${episode}M${map}`;
}
