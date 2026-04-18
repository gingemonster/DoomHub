import type { LaunchRole, RoomRecord, WadRecord } from "./types.js";

export function buildDoomWasmArgs(
  room: RoomRecord,
  baseWad: WadRecord,
  addonWads: WadRecord[],
  role: LaunchRole,
  wsUrl: string
): string[] {
  const args = [
    "-iwad",
    baseWad.fileName,
    "-window",
    "-nogui",
    "-nomusic",
    "-config",
    "default.cfg",
    "-servername",
    "DoomHub",
    "-nodes",
    String(room.maxPlayers),
    "-skill",
    String(room.skill)
  ];

  if (addonWads.length > 0) {
    args.push("-file", ...addonWads.map((wad) => wad.fileName));
  }

  if (room.mapFormat === "map-number") {
    args.push("-warp", String(room.map));
  } else {
    args.push("-warp", String(room.episode), String(room.map));
  }

  if (room.mode === "deathmatch") {
    args.push("-deathmatch");
    if (!room.deathmatchMonsters) {
      args.push("-nomonsters");
    }
  }

  if (room.levelTimerMinutes > 0) {
    args.push("-timer", String(room.levelTimerMinutes));
  }

  if (role === "host") {
    args.push("-server", "-privateserver", "-dup", "1", "-wss", wsUrl);
  } else {
    args.push("-connect", "1", "-dup", "1", "-wss", wsUrl);
  }

  return args;
}
