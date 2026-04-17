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
  it("creates private rooms with valid Doom multiplayer settings", () => {
    const service = createService();
    const room = service.createRoom({
      mode: "cooperative",
      maxPlayers: 4,
      episode: 1,
      map: 3,
      skill: 2
    });

    expect(room.slug).toMatch(/^[A-Z2-9]{8}$/);
    expect(room.maxPlayers).toBe(4);
    expect(room.map).toBe(3);
  });

  it("rejects player counts outside vanilla multiplayer limits", () => {
    const service = createService();
    expect(() => service.createRoom({ maxPlayers: 5 })).toThrow(HttpError);
  });

  it("tracks active players through heartbeats", () => {
    const service = createService();
    const room = service.createRoom({});

    expect(service.heartbeat(room.slug, "player-a")).toEqual({ activePlayers: 1 });
    expect(service.heartbeat(room.slug, "player-b")).toEqual({ activePlayers: 2 });
  });

  it("hides private rooms unless visibility is enabled", () => {
    const hidden = createService({ visiblePrivateRooms: false });
    hidden.createRoom({});
    expect(hidden.listRooms()).toEqual([]);

    const visible = createService({ visiblePrivateRooms: true });
    visible.createRoom({});
    expect(visible.listRooms()).toHaveLength(1);
  });
});

function createService(overrides: Partial<AppConfig> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doomhub-"));
  tempDirs.push(dir);
  const config: AppConfig = {
    publicBaseUrl: "http://localhost:5173",
    ipxWssUrl: "ws://localhost:9001",
    roomTtlMinutes: 180,
    wadStoragePath: path.join(dir, "wads"),
    bundleStoragePath: path.join(dir, "bundles"),
    databasePath: path.join(dir, "test.sqlite"),
    port: 0,
    host: "127.0.0.1",
    visiblePrivateRooms: true,
    ...overrides
  };
  return new RoomService(openDatabase(config), config);
}
