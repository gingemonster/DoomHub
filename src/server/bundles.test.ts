import { describe, expect, it } from "vitest";
import { buildDoomLaunchCommand } from "./bundles.js";
import type { RoomRecord } from "./types.js";

describe("buildDoomLaunchCommand", () => {
  it("starts cooperative Doom through IPXSETUP", () => {
    expect(buildDoomLaunchCommand(room({ mode: "cooperative", maxPlayers: 3 }))).toBe(
      "IPXSETUP.EXE -nodes 3 -skill 3 -warp 1 1"
    );
  });

  it("starts deathmatch without monsters by default", () => {
    expect(buildDoomLaunchCommand(room({ mode: "deathmatch", episode: 2, map: 4, skill: 5 }))).toBe(
      "IPXSETUP.EXE -nodes 2 -skill 5 -warp 2 4 -deathmatch -nomonsters"
    );
  });

  it("allows monsters in deathmatch rooms", () => {
    expect(buildDoomLaunchCommand(room({ mode: "deathmatch", deathmatchMonsters: true }))).toBe(
      "IPXSETUP.EXE -nodes 2 -skill 3 -warp 1 1 -deathmatch"
    );
  });
});

function room(overrides: Partial<RoomRecord>): RoomRecord {
  return {
    roomId: "room",
    slug: "ABCDEFGH",
    wadId: "doom-shareware",
    mode: "cooperative",
    maxPlayers: 2,
    episode: 1,
    map: 1,
    skill: 3,
    deathmatchMonsters: false,
    createdAt: new Date(0).toISOString(),
    expiresAt: new Date(1).toISOString(),
    lastHeartbeatAt: null,
    ...overrides
  };
}
