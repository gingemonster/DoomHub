import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import type { AppConfig } from "./config.js";
import type { RoomRecord } from "./types.js";

const bundleCacheVersion = 3;

export async function getRoomBundlePath(room: RoomRecord, config: AppConfig): Promise<string> {
  const sourcePath = path.join(config.bundleStoragePath, `${room.wadId}.jsdos`);
  const generatedPath = path.join(
    config.bundleStoragePath,
    "generated",
    `${room.wadId}-v${bundleCacheVersion}-${room.mode}-${room.maxPlayers}-${room.mapFormat === "episode-map" ? `e${room.episode}m${room.map}` : `map${room.map}`}-s${room.skill}-${room.deathmatchMonsters ? "monsters" : "nomonsters"}.jsdos`
  );

  const [sourceStat, generatedStat] = await Promise.all([
    fs.stat(sourcePath),
    fs.stat(generatedPath).catch(() => null)
  ]);

  if (generatedStat && generatedStat.mtimeMs >= sourceStat.mtimeMs) {
    return generatedPath;
  }

  await fs.mkdir(path.dirname(generatedPath), { recursive: true });
  const zip = await JSZip.loadAsync(await fs.readFile(sourcePath));
  const dosboxConfFile = zip.file(".jsdos/dosbox.conf");
  const jsdosJsonFile = zip.file(".jsdos/jsdos.json");

  if (!dosboxConfFile || !jsdosJsonFile) {
    throw new Error(`${sourcePath} is missing .jsdos configuration files.`);
  }

  const launchCommand = buildDoomLaunchCommand(room);
  const dosboxConf = await dosboxConfFile.async("string");
  const jsdosJson = JSON.parse(await jsdosJsonFile.async("string")) as {
    ipx?: { options?: { ipx?: { value?: boolean } } };
    autoexec?: { options?: { script?: { value?: string } } };
  };

  zip.file(".jsdos/dosbox.conf", patchDosboxConf(dosboxConf, launchCommand));
  jsdosJson.ipx ??= { options: {} };
  jsdosJson.ipx.options ??= {};
  jsdosJson.ipx.options.ipx ??= {};
  jsdosJson.ipx.options.ipx.value = true;
  jsdosJson.autoexec ??= { options: {} };
  jsdosJson.autoexec.options ??= {};
  jsdosJson.autoexec.options.script ??= {};
  jsdosJson.autoexec.options.script.value = launchCommand;
  zip.file(".jsdos/jsdos.json", JSON.stringify(jsdosJson, null, 2));

  const generated = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });
  await fs.writeFile(generatedPath, generated);
  return generatedPath;
}

export function buildDoomLaunchCommand(room: RoomRecord): string {
  const parts = [
    "IPXSETUP.EXE",
    "-nodes",
    String(room.maxPlayers),
    "-skill",
    String(room.skill),
    "-warp"
  ];

  if (room.mapFormat === "episode-map") {
    parts.push(String(room.episode), String(room.map));
  } else {
    parts.push(String(room.map));
  }

  if (room.mode === "deathmatch") {
    parts.push("-deathmatch");
    if (!room.deathmatchMonsters) {
      parts.push("-nomonsters");
    }
  }

  return parts.join(" ");
}

function patchDosboxConf(dosboxConf: string, launchCommand: string): string {
  const withIpx = dosboxConf.replace(/(\[ipx\][\s\S]*?ipx=)false/i, "$1true");
  return withIpx.replace(/\[autoexec\][\s\S]*?(?=\n# Generated using|\s*$)/, `[autoexec]
echo off
mount c .
c:

type jsdos~1/readme.txt
echo on

${launchCommand}
`);
}
