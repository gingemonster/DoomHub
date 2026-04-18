import { describe, expect, it } from "vitest";
import { buildDoomWasmArgs } from "./doomLaunch.js";
import type { RoomRecord, WadRecord } from "./types.js";

describe("buildDoomWasmArgs", () => {
  it("starts a host with base IWAD and multiplayer server args", () => {
    expect(buildDoomWasmArgs(room({ mode: "cooperative", maxPlayers: 3 }), wad("doom2"), [], "host", "ws://example/ws")).toEqual([
      "-iwad", "doom2.wad",
      "-window", "-nogui", "-nomusic", "-config", "default.cfg", "-servername", "DoomHub",
      "-nodes", "3", "-skill", "3", "-warp", "1", "1",
      "-server", "-privateserver", "-dup", "1", "-wss", "ws://example/ws"
    ]);
  });

  it("adds PWADs, deathmatch flags, timer, and joiner args", () => {
    expect(buildDoomWasmArgs(
      room({ mode: "deathmatch", mapFormat: "map-number", map: 7, levelTimerMinutes: 15 }),
      wad("doom2"),
      [wad("dwango20", "DWANGO20.WAD", "addon")],
      "joiner",
      "ws://example/ws"
    )).toEqual([
      "-iwad", "doom2.wad",
      "-window", "-nogui", "-nomusic", "-config", "default.cfg", "-servername", "DoomHub",
      "-nodes", "2", "-skill", "3", "-file", "DWANGO20.WAD", "-warp", "7",
      "-deathmatch", "-nomonsters", "-timer", "15",
      "-connect", "1", "-dup", "1", "-wss", "ws://example/ws"
    ]);
  });
});

function room(overrides: Partial<RoomRecord>): RoomRecord {
  return {
    roomId: "room",
    slug: "ABCDEFGH",
    baseWadId: "doom2",
    addonWadIds: [],
    mode: "cooperative",
    maxPlayers: 2,
    episode: 1,
    map: 1,
    mapFormat: "episode-map",
    skill: 3,
    deathmatchMonsters: false,
    levelTimerMinutes: 0,
    gameStartedAt: null,
    createdAt: new Date(0).toISOString(),
    expiresAt: new Date(1).toISOString(),
    lastHeartbeatAt: null,
    ...overrides
  };
}

function wad(id: string, fileName = `${id}.wad`, kind: "base" | "addon" = "base"): WadRecord {
  return {
    id,
    displayName: id,
    fileName,
    sha256: id,
    kind,
    identification: kind === "base" ? "IWAD" : "PWAD",
    allowedModes: ["cooperative", "deathmatch"],
    mapFormat: "episode-map",
    maxEpisode: 1,
    maxMap: 9,
    maps: ["E1M1"],
    createdAt: new Date(0).toISOString()
  };
}
