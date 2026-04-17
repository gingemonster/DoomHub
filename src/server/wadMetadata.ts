import crypto from "node:crypto";
import fs from "node:fs/promises";
import JSZip from "jszip";
import type { MapFormat } from "./types.js";

export interface WadMapMetadata {
  sha256: string;
  mapFormat: MapFormat;
  maxEpisode: number;
  maxMap: number;
}

interface WadDirectoryMetadata {
  episodeMaps: Array<{ episode: number; map: number }>;
  numberedMaps: number[];
}

const defaultMetadata: Omit<WadMapMetadata, "sha256"> = {
  mapFormat: "episode-map",
  maxEpisode: 4,
  maxMap: 9
};

export async function inspectJsdosBundle(bundlePath: string): Promise<WadMapMetadata> {
  const buffer = await fs.readFile(bundlePath);
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const metadata = await inspectJsdosBuffer(buffer);
  return { sha256, ...metadata };
}

export async function hashFile(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function inspectJsdosBuffer(buffer: Buffer): Promise<Omit<WadMapMetadata, "sha256">> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const wadFiles = Object.values(zip.files).filter((file) => !file.dir && file.name.toLowerCase().endsWith(".wad"));
    const wadMetadata = await Promise.all(wadFiles.map(async (file) => inspectWad(await file.async("nodebuffer"))));
    return combineWadMetadata(wadMetadata);
  } catch {
    return defaultMetadata;
  }
}

export function inspectWad(buffer: Buffer): WadDirectoryMetadata {
  if (buffer.byteLength < 12) {
    return { episodeMaps: [], numberedMaps: [] };
  }

  const identification = buffer.toString("ascii", 0, 4);
  if (identification !== "IWAD" && identification !== "PWAD") {
    return { episodeMaps: [], numberedMaps: [] };
  }

  const lumpCount = buffer.readInt32LE(4);
  const directoryOffset = buffer.readInt32LE(8);
  const episodeMaps: Array<{ episode: number; map: number }> = [];
  const numberedMaps: number[] = [];

  if (lumpCount < 0 || directoryOffset < 0 || directoryOffset + lumpCount * 16 > buffer.byteLength) {
    return { episodeMaps, numberedMaps };
  }

  for (let index = 0; index < lumpCount; index += 1) {
    const nameOffset = directoryOffset + index * 16 + 8;
    const lumpName = buffer.toString("ascii", nameOffset, nameOffset + 8).replace(/\0+$/, "").toUpperCase();
    const episodeMatch = /^E([1-9])M([1-9])$/.exec(lumpName);
    if (episodeMatch) {
      episodeMaps.push({ episode: Number(episodeMatch[1]), map: Number(episodeMatch[2]) });
      continue;
    }

    const numberedMatch = /^MAP(\d{2})$/.exec(lumpName);
    if (numberedMatch) {
      numberedMaps.push(Number(numberedMatch[1]));
    }
  }

  return { episodeMaps, numberedMaps };
}

function combineWadMetadata(wads: WadDirectoryMetadata[]): Omit<WadMapMetadata, "sha256"> {
  const episodeMaps = wads.flatMap((wad) => wad.episodeMaps);
  const numberedMaps = wads.flatMap((wad) => wad.numberedMaps);

  if (numberedMaps.length > 0 && episodeMaps.length === 0) {
    return {
      mapFormat: "map-number",
      maxEpisode: 1,
      maxMap: Math.max(...numberedMaps)
    };
  }

  if (episodeMaps.length > 0) {
    return {
      mapFormat: "episode-map",
      maxEpisode: Math.max(...episodeMaps.map((map) => map.episode)),
      maxMap: Math.max(...episodeMaps.map((map) => map.map))
    };
  }

  return defaultMetadata;
}
