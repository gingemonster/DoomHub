export type RoomMode = "cooperative" | "deathmatch";

export interface WadRecord {
  id: string;
  displayName: string;
  fileName: string;
  sha256: string;
  allowedModes: RoomMode[];
  createdAt: string;
}

export interface RoomRecord {
  roomId: string;
  slug: string;
  wadId: string;
  mode: RoomMode;
  maxPlayers: number;
  episode: number;
  map: number;
  skill: number;
  deathmatchMonsters: boolean;
  createdAt: string;
  expiresAt: string;
  lastHeartbeatAt: string | null;
}

export interface RoomSummary extends RoomRecord {
  wadDisplayName: string;
  activePlayers: number;
}

export interface LaunchConfig {
  bundleUrl: string;
  ipxBackend: string;
  room: string;
  ipx: Array<{ name: string; host: string }>;
}
