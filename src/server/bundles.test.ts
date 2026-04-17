import { describe, expect, it } from "vitest";
import { buildDoomLaunchCommand } from "./bundles.js";
import type { RoomRecord } from "./types.js";

describe("buildDoomLaunchCommand", () => {
  it("starts cooperative Doom through IPXSETUP", () => {
    expect(buildDoomLaunchCommand(room({ mode: "cooperative", maxPlayers: 3 }))).toBe(
      "IPXSETUP.EXE -nodes 3 -skill 3 -warp 1 1"
    );
  });

  it("adds deathmatch mode for deathmatch rooms", () => {
    expect(buildDoomLaunchCommand(room({ mode: "deathmatch", episode: 2, map: 4, skill: 5 }))).toBe(
      "IPXSETUP.EXE -nodes 2 -skill 5 -warp 2 4 -deathmatch"
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
    createdAt: new Date(0).toISOString(),
    expiresAt: new Date(1).toISOString(),
    lastHeartbeatAt: null,
    ...overrides
  };
}
