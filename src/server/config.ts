import path from "node:path";

export interface AppConfig {
  publicBaseUrl: string;
  ipxWssUrl: string;
  roomTtlMinutes: number;
  wadStoragePath: string;
  bundleStoragePath: string;
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
  const defaultIpxUrl = process.env.NODE_ENV === "production" ? "" : "ws://localhost";
  const ipxWssUrl = process.env.IPX_WSS_URL ?? defaultIpxUrl;
  if (!ipxWssUrl) {
    throw new Error("IPX_WSS_URL is required in production.");
  }

  return {
    publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:5173",
    ipxWssUrl,
    roomTtlMinutes: numberFromEnv("ROOM_TTL_MINUTES", 180),
    wadStoragePath: path.resolve(process.env.WAD_STORAGE_PATH ?? "./data/wads"),
    bundleStoragePath: path.resolve(process.env.BUNDLE_STORAGE_PATH ?? "./data/bundles"),
    databasePath: path.resolve(process.env.DATABASE_PATH ?? "./data/doomhub.sqlite"),
    port: numberFromEnv("PORT", 3000),
    host: process.env.HOST ?? "0.0.0.0",
    visiblePrivateRooms: process.env.VISIBLE_PRIVATE_ROOMS === "true"
  };
}
