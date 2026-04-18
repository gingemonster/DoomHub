import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "./db.js";
import { HttpError } from "./errors.js";
import { RoomService } from "./rooms.js";
import type { AppConfig } from "./config.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("RoomService", () => {
  it("lists IWADs as base WADs and PWADs as add-ons", async () => {
    const service = await createService();

    const wads = await service.listWads();
    expect(wads.find((wad) => wad.id === "doom2")).toMatchObject({
      kind: "base",
      identification: "IWAD",
      mapFormat: "map-number",
      maxMap: 32,
      maps: ["MAP01", "MAP15", "MAP32"]
    });
    expect(wads.find((wad) => wad.id === "dwango20")).toMatchObject({
      kind: "addon",
      identification: "PWAD",
      mapFormat: "map-number",
      maps: ["MAP01", "MAP07"]
    });
  });

  it("creates rooms with a base IWAD, add-on PWADs, selected map, and timer", async () => {
    const service = await createService();
    const result = await service.createRoom({
      baseWadId: "doom2",
      addonWadIds: ["dwango20"],
      mode: "deathmatch",
      maxPlayers: 4,
      map: 7,
      levelTimerMinutes: 10
    });

    expect(result.hostToken).toHaveLength(64);
    expect(result.room).toMatchObject({
      baseWadId: "doom2",
      addonWadIds: ["dwango20"],
      mapFormat: "map-number",
      map: 7,
      levelTimerMinutes: 10
    });
  });

  it("rejects add-ons with the shareware IWAD", async () => {
    const service = await createService();

    await expect(service.createRoom({
      baseWadId: "doom-shareware",
      addonWadIds: ["episode-addon"],
      episode: 1,
      map: 1
    })).rejects.toThrow(HttpError);
  });

  it("rejects maps not present in the selected WAD files", async () => {
    const service = await createService();

    await expect(service.createRoom({ baseWadId: "doom2", addonWadIds: ["dwango20"], map: 6 })).rejects.toThrow(HttpError);
  });

  it("rejects invalid level timers", async () => {
    const service = await createService();

    await expect(service.createRoom({ baseWadId: "doom2", levelTimerMinutes: 121 })).rejects.toThrow(HttpError);
  });

  it("marks rooms as started only for the host and blocks late joiners", async () => {
    const service = await createService();
    const { room, hostToken } = await service.createRoom({ baseWadId: "doom2" });

    await expect(() => service.startRoom(room.slug, undefined)).toThrow(HttpError);
    expect(service.startRoom(room.slug, hostToken).gameStartedAt).not.toBeNull();

    const joinerLaunch = await service.getLaunchConfig(room.slug, undefined, "ws://localhost/ws");
    expect(joinerLaunch).toMatchObject({
      role: "joiner",
      canLaunch: false,
      gameStarted: true
    });

    const hostLaunch = await service.getLaunchConfig(room.slug, hostToken, "ws://localhost/ws");
    expect(hostLaunch).toMatchObject({
      role: "host",
      canLaunch: true,
      gameStarted: true
    });
  });

  it("tracks active players through heartbeats", async () => {
    const service = await createService();
    const { room } = await service.createRoom({ baseWadId: "doom2" });

    expect(service.heartbeat(room.slug, "player-a")).toEqual({ activePlayers: 1 });
    expect(service.heartbeat(room.slug, "player-b")).toEqual({ activePlayers: 2 });
  });

  it("hides private rooms unless visibility is enabled", async () => {
    const hidden = await createService({ visiblePrivateRooms: false });
    await hidden.createRoom({ baseWadId: "doom2" });
    await expect(hidden.listRooms()).resolves.toEqual([]);

    const visible = await createService({ visiblePrivateRooms: true });
    await visible.createRoom({ baseWadId: "doom2" });
    await expect(visible.listRooms()).resolves.toHaveLength(1);
  });
});

async function createService(overrides: Partial<AppConfig> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doomhub-"));
  tempDirs.push(dir);
  const wadStoragePath = path.join(dir, "wads");
  fs.mkdirSync(wadStoragePath, { recursive: true });
  fs.writeFileSync(path.join(wadStoragePath, "doom-shareware.wad"), createWad("IWAD", ["E1M1", "E1M9"]));
  fs.writeFileSync(path.join(wadStoragePath, "doom2.wad"), createWad("IWAD", ["MAP01", "MAP15", "MAP32"]));
  fs.writeFileSync(path.join(wadStoragePath, "DWANGO20.WAD"), createWad("PWAD", ["MAP01", "MAP07"]));
  fs.writeFileSync(path.join(wadStoragePath, "episode-addon.wad"), createWad("PWAD", ["E1M1"]));

  const config: AppConfig = {
    publicBaseUrl: "http://localhost:5173",
    roomTtlMinutes: 180,
    wadStoragePath,
    databasePath: path.join(dir, "test.sqlite"),
    port: 0,
    host: "127.0.0.1",
    visiblePrivateRooms: true,
    ...overrides
  };
  return new RoomService(openDatabase(config), config);
}

function createWad(identification: "IWAD" | "PWAD", lumpNames: string[]): Buffer {
  const headerSize = 12;
  const directoryOffset = headerSize;
  const buffer = Buffer.alloc(headerSize + lumpNames.length * 16);
  buffer.write(identification, 0, "ascii");
  buffer.writeInt32LE(lumpNames.length, 4);
  buffer.writeInt32LE(directoryOffset, 8);

  lumpNames.forEach((lumpName, index) => {
    const entryOffset = directoryOffset + index * 16;
    buffer.writeInt32LE(0, entryOffset);
    buffer.writeInt32LE(0, entryOffset + 4);
    buffer.write(lumpName, entryOffset + 8, 8, "ascii");
  });

  return buffer;
}
