import crypto from "node:crypto";
import fs from "node:fs/promises";
import type { MapFormat, WadKind } from "./types.js";

export interface WadMapMetadata {
  sha256: string;
  identification: "IWAD" | "PWAD";
  kind: WadKind;
  mapFormat: MapFormat;
  maxEpisode: number;
  maxMap: number;
  maps: string[];
}

interface WadDirectoryMetadata {
  identification: "IWAD" | "PWAD" | null;
  episodeMaps: Array<{ episode: number; map: number; name: string }>;
  numberedMaps: Array<{ map: number; name: string }>;
}

const defaultMapMetadata = {
  mapFormat: "episode-map" as const,
  maxEpisode: 4,
  maxMap: 9,
  maps: []
};

export async function inspectWadFile(filePath: string): Promise<WadMapMetadata> {
  const buffer = await fs.readFile(filePath);
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const metadata = inspectWad(buffer);

  if (!metadata.identification) {
    throw new Error(`${filePath} is not a valid IWAD or PWAD file.`);
  }

  return {
    sha256,
    identification: metadata.identification,
    kind: metadata.identification === "IWAD" ? "base" : "addon",
    ...combineWadMetadata([metadata])
  };
}

export async function hashFile(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function inspectWad(buffer: Buffer): WadDirectoryMetadata {
  if (buffer.byteLength < 12) {
    return { identification: null, episodeMaps: [], numberedMaps: [] };
  }

  const identification = buffer.toString("ascii", 0, 4);
  if (identification !== "IWAD" && identification !== "PWAD") {
    return { identification: null, episodeMaps: [], numberedMaps: [] };
  }

  const lumpCount = buffer.readInt32LE(4);
  const directoryOffset = buffer.readInt32LE(8);
  const episodeMaps: Array<{ episode: number; map: number; name: string }> = [];
  const numberedMaps: Array<{ map: number; name: string }> = [];

  if (lumpCount < 0 || directoryOffset < 0 || directoryOffset + lumpCount * 16 > buffer.byteLength) {
    return { identification, episodeMaps, numberedMaps };
  }

  for (let index = 0; index < lumpCount; index += 1) {
    const nameOffset = directoryOffset + index * 16 + 8;
    const lumpName = buffer.toString("ascii", nameOffset, nameOffset + 8).replace(/\0+$/, "").toUpperCase();
    const episodeMatch = /^E([1-9])M([1-9])$/.exec(lumpName);
    if (episodeMatch) {
      episodeMaps.push({
        episode: Number(episodeMatch[1]),
        map: Number(episodeMatch[2]),
        name: lumpName
      });
      continue;
    }

    const numberedMatch = /^MAP(\d{2})$/.exec(lumpName);
    if (numberedMatch) {
      const map = Number(numberedMatch[1]);
      if (map >= 1) {
        numberedMaps.push({ map, name: lumpName });
      }
    }
  }

  return { identification, episodeMaps, numberedMaps };
}

export function combineWadMetadata(wads: WadDirectoryMetadata[]): Omit<WadMapMetadata, "sha256" | "identification" | "kind"> {
  const episodeMaps = uniqueMaps(wads.flatMap((wad) => wad.episodeMaps), (map) => map.name);
  const numberedMaps = uniqueMaps(wads.flatMap((wad) => wad.numberedMaps), (map) => map.name);

  if (numberedMaps.length > 0 && episodeMaps.length === 0) {
    return {
      mapFormat: "map-number",
      maxEpisode: 1,
      maxMap: Math.max(...numberedMaps.map((map) => map.map)),
      maps: numberedMaps
        .sort((a, b) => a.map - b.map)
        .map((map) => map.name)
    };
  }

  if (episodeMaps.length > 0) {
    return {
      mapFormat: "episode-map",
      maxEpisode: Math.max(...episodeMaps.map((map) => map.episode)),
      maxMap: Math.max(...episodeMaps.map((map) => map.map)),
      maps: episodeMaps
        .sort((a, b) => a.episode - b.episode || a.map - b.map)
        .map((map) => map.name)
    };
  }

  return defaultMapMetadata;
}

function uniqueMaps<T>(maps: T[], key: (map: T) => string): T[] {
  const seen = new Set<string>();
  return maps.filter((map) => {
    const value = key(map);
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}
