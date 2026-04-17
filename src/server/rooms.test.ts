import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import JSZip from "jszip";
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
  it("lists direct js-dos bundles as selectable WADs", async () => {
    const service = await createService();

    const wads = await service.listWads();
    expect(wads.map((wad) => wad.id)).toEqual(["doom-full", "doom-shareware"]);
    expect(wads.find((wad) => wad.id === "doom-full")).toMatchObject({
      displayName: "Doom Full",
      allowedModes: ["cooperative", "deathmatch"],
      mapFormat: "episode-map",
      maxEpisode: 2,
      maxMap: 9
    });
    expect((await service.createRoom({ wadId: "doom-full" })).wadId).toBe("doom-full");
  });

  it("detects Doom II map-number bundles from WAD lumps", async () => {
    const service = await createService({
      bundles: {
        "doom2.jsdos": ["MAP01", "MAP15", "MAP32"]
      }
    });

    expect((await service.listWads()).find((wad) => wad.id === "doom2")).toMatchObject({
      mapFormat: "map-number",
      maxEpisode: 1,
      maxMap: 32
    });

    const room = await service.createRoom({ wadId: "doom2", map: 32 });
    expect(room).toMatchObject({ mapFormat: "map-number", map: 32 });
  });

  it("creates private rooms with valid Doom multiplayer settings", async () => {
    const service = await createService();
    const room = await service.createRoom({
      mode: "cooperative",
      maxPlayers: 4,
      episode: 1,
      map: 3,
      skill: 2
    });

    expect(room.slug).toMatch(/^[A-Z2-9]{8}$/);
    expect(room.maxPlayers).toBe(4);
    expect(room.map).toBe(3);
    expect(room.deathmatchMonsters).toBe(false);
  });

  it("defaults new rooms to deathmatch", async () => {
    const service = await createService();

    expect((await service.createRoom({})).mode).toBe("deathmatch");
  });

  it("stores deathmatch monster preference only for deathmatch rooms", async () => {
    const service = await createService();

    expect((await service.createRoom({ mode: "deathmatch", deathmatchMonsters: true })).deathmatchMonsters).toBe(true);
    expect((await service.createRoom({ mode: "cooperative", deathmatchMonsters: true })).deathmatchMonsters).toBe(false);
  });

  it("rejects player counts outside vanilla multiplayer limits", async () => {
    const service = await createService();
    await expect(service.createRoom({ maxPlayers: 5 })).rejects.toThrow(HttpError);
  });

  it("tracks active players through heartbeats", async () => {
    const service = await createService();
    const room = await service.createRoom({});

    expect(service.heartbeat(room.slug, "player-a")).toEqual({ activePlayers: 1 });
    expect(service.heartbeat(room.slug, "player-b")).toEqual({ activePlayers: 2 });
  });

  it("returns a named js-dos IPX backend with the configured websocket base URL", async () => {
    const service = await createService({ ipxWssUrl: "ws://localhost:1900/ipx" });
    const room = await service.createRoom({});

    expect(service.getLaunchConfig(room.slug)).toMatchObject({
      ipxBackend: "DoomHub",
      room: room.slug,
      ipx: [{ name: "DoomHub", host: "ws://localhost:1900/ipx" }]
    });
  });

  it("hides private rooms unless visibility is enabled", async () => {
    const hidden = await createService({ visiblePrivateRooms: false });
    await hidden.createRoom({});
    await expect(hidden.listRooms()).resolves.toEqual([]);

    const visible = await createService({ visiblePrivateRooms: true });
    await visible.createRoom({});
    await expect(visible.listRooms()).resolves.toHaveLength(1);
  });
});

async function createService(overrides: Partial<AppConfig> & { bundles?: Record<string, string[]> } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doomhub-"));
  tempDirs.push(dir);
  const bundleStoragePath = path.join(dir, "bundles");
  fs.mkdirSync(path.join(bundleStoragePath, "generated"), { recursive: true });
  const bundles = overrides.bundles ?? {
    "doom-shareware.jsdos": ["E1M1", "E1M9"],
    "doom-full.jsdos": ["E1M1", "E1M9", "E2M1"]
  };
  for (const [fileName, maps] of Object.entries(bundles)) {
    fs.writeFileSync(path.join(bundleStoragePath, fileName), await createJsdosBundle(maps));
  }
  fs.writeFileSync(path.join(bundleStoragePath, "generated", "ignored.jsdos"), "");
  const { bundles: _bundles, ...configOverrides } = overrides;
  const config: AppConfig = {
    publicBaseUrl: "http://localhost:5173",
    ipxWssUrl: "ws://localhost:1900/ipx",
    roomTtlMinutes: 180,
    wadStoragePath: path.join(dir, "wads"),
    bundleStoragePath,
    databasePath: path.join(dir, "test.sqlite"),
    port: 0,
    host: "127.0.0.1",
    visiblePrivateRooms: true,
    ...configOverrides
  };
  return new RoomService(openDatabase(config), config);
}

async function createJsdosBundle(lumpNames: string[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("GAME.WAD", createWad(lumpNames));
  return zip.generateAsync({ type: "nodebuffer" });
}

function createWad(lumpNames: string[]): Buffer {
  const headerSize = 12;
  const directoryOffset = headerSize;
  const buffer = Buffer.alloc(headerSize + lumpNames.length * 16);
  buffer.write("IWAD", 0, "ascii");
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
