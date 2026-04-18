import path from "node:path";

export interface AppConfig {
  publicBaseUrl: string;
  roomTtlMinutes: number;
  wadStoragePath: string;
  databasePath: string;
  port: number;
  host: string;
  visiblePrivateRooms: boolean;
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(): AppConfig {
  return {
    publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:5173",
    roomTtlMinutes: numberFromEnv("ROOM_TTL_MINUTES", 180),
    wadStoragePath: path.resolve(process.env.WAD_STORAGE_PATH ?? "./data/wads"),
    databasePath: path.resolve(process.env.DATABASE_PATH ?? "./data/doomhub.sqlite"),
    port: numberFromEnv("PORT", 3000),
    host: process.env.HOST ?? "0.0.0.0",
    visiblePrivateRooms: process.env.VISIBLE_PRIVATE_ROOMS === "true"
  };
}
