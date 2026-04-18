export type RoomMode = "cooperative" | "deathmatch";
export type MapFormat = "episode-map" | "map-number";
export type WadKind = "base" | "addon";
export type LaunchRole = "host" | "joiner";

export interface WadRecord {
  id: string;
  displayName: string;
  fileName: string;
  sha256: string;
  kind: WadKind;
  identification: "IWAD" | "PWAD";
  allowedModes: RoomMode[];
  mapFormat: MapFormat;
  maxEpisode: number;
  maxMap: number;
  maps: string[];
  createdAt: string;
}

export interface RoomRecord {
  roomId: string;
  slug: string;
  baseWadId: string;
  addonWadIds: string[];
  mode: RoomMode;
  maxPlayers: number;
  episode: number;
  map: number;
  mapFormat: MapFormat;
  skill: number;
  deathmatchMonsters: boolean;
  levelTimerMinutes: number;
  gameStartedAt: string | null;
  createdAt: string;
  expiresAt: string;
  lastHeartbeatAt: string | null;
}

export interface RoomSummary extends RoomRecord {
  wadDisplayName: string;
  activePlayers: number;
}

export interface LaunchConfig {
  role: LaunchRole;
  room: string;
  canLaunch: boolean;
  gameStarted: boolean;
  blockedReason: string | null;
  wsPath: string;
  wasmScriptUrl: string;
  baseWad: LaunchWadFile;
  addonWads: LaunchWadFile[];
  args: string[];
}

export interface LaunchWadFile {
  id: string;
  fileName: string;
  url: string;
}
