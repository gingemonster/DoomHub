import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type RoomMode = "cooperative" | "deathmatch";
type MapFormat = "episode-map" | "map-number";
type WadKind = "base" | "addon";
type LaunchRole = "host" | "joiner";

interface WadRecord {
  id: string;
  displayName: string;
  fileName: string;
  kind: WadKind;
  allowedModes: RoomMode[];
  mapFormat: MapFormat;
  maxEpisode: number;
  maxMap: number;
  maps: string[];
}

interface RoomRecord {
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
  expiresAt: string;
}

interface LaunchWadFile {
  id: string;
  fileName: string;
  url: string;
}

interface LaunchConfig {
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

interface DoomModule {
  FS?: {
    createPreloadedFile(parent: string, name: string, url: string, canRead: boolean, canWrite: boolean): void;
  };
  canvas?: HTMLCanvasElement | null;
  noInitialRun?: boolean;
  onRuntimeInitialized?: () => void;
  preRun?: () => void;
  print?: (text: string) => void;
  printErr?: (text: string) => void;
  setStatus?: (text: string) => void;
  totalDependencies?: number;
  monitorRunDependencies?: (left: number) => void;
}

declare global {
  interface Window {
    Module?: DoomModule;
    callMain?: (args: string[]) => void;
    __DOOMHUB_LAUNCH__?: LaunchConfig;
  }
}

const playerId = getPlayerId();

function App() {
  const roomSlug = getRoomSlug();
  return roomSlug ? <RoomPage slug={roomSlug} /> : <HomePage />;
}

function HomePage() {
  const [wads, setWads] = useState<WadRecord[]>([]);
  const [mode, setMode] = useState<RoomMode>("deathmatch");
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [mapName, setMapName] = useState("E1M1");
  const [skill, setSkill] = useState(3);
  const [levelTimerMinutes, setLevelTimerMinutes] = useState(0);
  const [deathmatchMonsters, setDeathmatchMonsters] = useState(false);
  const [selectedBaseWadId, setSelectedBaseWadId] = useState("");
  const [selectedAddonWadIds, setSelectedAddonWadIds] = useState<string[]>([]);
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchJson<WadRecord[]>("/api/wads")
      .then((loadedWads) => {
        setWads(loadedWads);
        const baseWads = loadedWads.filter((wad) => wad.kind === "base");
        setSelectedBaseWadId((current) => current || baseWads.find((wad) => wad.id === "doom-shareware")?.id || baseWads[0]?.id || "");
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const baseWads = wads.filter((wad) => wad.kind === "base");
  const addonWads = wads.filter((wad) => wad.kind === "addon");
  const selectedBaseWad = baseWads.find((wad) => wad.id === selectedBaseWadId);
  const compatibleAddonWads = addonWads.filter((wad) => selectedBaseWad && wad.mapFormat === selectedBaseWad.mapFormat);
  const selectedAddonWads = selectedAddonWadIds
    .map((id) => compatibleAddonWads.find((wad) => wad.id === id))
    .filter((wad): wad is WadRecord => Boolean(wad));
  const mapOptions = useMemo(() => effectiveMapOptions(selectedBaseWad, selectedAddonWads), [selectedBaseWad, selectedAddonWads]);
  const selectedMap = parseMapName(mapName, selectedBaseWad?.mapFormat ?? "episode-map");

  useEffect(() => {
    setSelectedAddonWadIds((current) => current.filter((id) => compatibleAddonWads.some((wad) => wad.id === id)));
  }, [compatibleAddonWads]);

  useEffect(() => {
    if (mapOptions.length > 0 && !mapOptions.includes(mapName)) {
      setMapName(mapOptions[0]);
    }
  }, [mapOptions, mapName]);

  async function createRoom(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedBaseWad || !selectedMap) {
      setError("Choose a base WAD and map.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetchJson<{ room: RoomRecord; hostToken: string }>("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseWadId: selectedBaseWad.id,
          addonWadIds: selectedAddonWadIds,
          mode,
          maxPlayers,
          episode: selectedMap.episode,
          map: selectedMap.map,
          skill,
          deathmatchMonsters,
          levelTimerMinutes
        })
      });
      window.localStorage.setItem(hostTokenKey(response.room.slug), response.hostToken);
      window.location.assign(`/r/${response.room.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create room.");
    } finally {
      setBusy(false);
    }
  }

  function joinRoom(event: React.FormEvent) {
    event.preventDefault();
    const slug = joinCode.trim().toUpperCase();
    if (slug) {
      window.location.assign(`/r/${slug}`);
    }
  }

  function changeMode(nextMode: RoomMode) {
    setMode(nextMode);
    setDeathmatchMonsters(false);
  }

  function toggleAddon(id: string, checked: boolean) {
    setSelectedAddonWadIds((current) => checked ? [...current, id] : current.filter((item) => item !== id));
  }

  return (
    <main className="page-shell">
      <section className="home-layout">
        <header className="home-header">
          <img className="logo-mark" src="/doomhublogo.png" alt="DoomHub" />
        </header>

        <div className="home-panels">
          <form onSubmit={createRoom} className="room-form">
            <h2>Create a Room</h2>
            <label>
              Base Game (IWADS)
              <select value={selectedBaseWadId} onChange={(event) => setSelectedBaseWadId(event.target.value)} disabled={baseWads.length === 0}>
                {baseWads.length === 0 ? <option value="">No IWADs found</option> : null}
                {baseWads.map((wad) => (
                  <option key={wad.id} value={wad.id}>
                    {wad.displayName}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="addon-list">
              <legend>Add-on maps</legend>
              {addonWads.length === 0 ? <p>No PWADs found in data/wads.</p> : null}
              {addonWads.length > 0 && compatibleAddonWads.length === 0 ? <p>No add-on maps match this base game.</p> : null}
              {compatibleAddonWads.map((wad) => (
                <label key={wad.id} className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={selectedAddonWadIds.includes(wad.id)}
                    onChange={(event) => toggleAddon(wad.id, event.target.checked)}
                  />
                  <span>{wad.displayName}</span>
                </label>
              ))}
            </fieldset>

            <label>
              Mode
              <select value={mode} onChange={(event) => changeMode(event.target.value as RoomMode)}>
                <option value="cooperative">Co-op</option>
                <option value="deathmatch">Deathmatch</option>
              </select>
            </label>

            {mode === "deathmatch" ? (
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={deathmatchMonsters}
                  onChange={(event) => setDeathmatchMonsters(event.target.checked)}
                />
                <span>Allow monsters in deathmatch</span>
              </label>
            ) : null}

            <div className="field-row">
              <label>
                Players
                <input type="number" min="2" max="4" value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value))} />
              </label>
              <label>
                Level
                <select value={mapName} onChange={(event) => setMapName(event.target.value)} disabled={mapOptions.length === 0}>
                  {mapOptions.map((map) => (
                    <option key={map} value={map}>{map}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="field-row">
              <label>
                Skill
                <input type="number" min="1" max="5" value={skill} onChange={(event) => setSkill(Number(event.target.value))} />
              </label>
              <div className="field-with-help">
                <label>
                  Level timer
                  <input type="number" min="0" max="120" value={levelTimerMinutes} onChange={(event) => setLevelTimerMinutes(Number(event.target.value))} />
                </label>
                <p className="field-help">Minutes before moving to the next map. Use 0 to disable.</p>
              </div>
            </div>

            <button type="submit" disabled={busy || !selectedBaseWad}>
              {busy ? "Creating..." : "Start Game Room"}
            </button>
          </form>

          <form onSubmit={joinRoom} className="join-form">
            <h2>Join a Room</h2>
            <p className="form-help">
              Join before the host starts the game as Doom multiplayer does not allow players to join after the game starts.
            </p>
            <label>
              Room code
              <input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="ABCD2345" />
            </label>
            <button type="submit">Join</button>
          </form>
        </div>

        {error ? <p className="error">{error}</p> : null}
      </section>
    </main>
  );
}

function RoomPage({ slug }: { slug: string }) {
  const [room, setRoom] = useState<RoomRecord | null>(null);
  const [launch, setLaunch] = useState<LaunchConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playerStarted, setPlayerStarted] = useState(false);
  const [activePlayers, setActivePlayers] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [playerStatus, setPlayerStatus] = useState("");
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostToken = useMemo(() => window.localStorage.getItem(hostTokenKey(slug)) ?? undefined, [slug]);
  const setCanvasRef = useCallback((element: HTMLCanvasElement | null) => {
    canvasRef.current = element;
    setCanvasElement(element);
  }, []);

  useEffect(() => {
    fetchJson<{ room: RoomRecord; launch: LaunchConfig }>(`/api/rooms/${slug}`, hostToken ? {
      headers: { "x-doomhub-host-token": hostToken }
    } : undefined)
      .then((payload) => {
        setRoom(payload.room);
        setLaunch(payload.launch);
      })
      .catch((err: Error) => setError(err.message));
  }, [hostToken, slug]);

  useEffect(() => {
    if (!room) {
      return;
    }

    let cancelled = false;
    async function beat() {
      try {
        const result = await fetchJson<{ activePlayers: number }>(`/api/rooms/${slug}/heartbeat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId })
        });
        if (!cancelled) {
          setActivePlayers(result.activePlayers);
        }
      } catch {
        if (!cancelled) {
          setActivePlayers(0);
        }
      }
    }

    void beat();
    const timer = window.setInterval(beat, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [room, slug]);

  const shareUrl = useMemo(() => `${window.location.origin}/r/${slug}`, [slug]);
  const gameStarted = Boolean(room?.gameStartedAt ?? launch?.gameStarted);

  async function startPlayer() {
    if (!launch || !room) {
      return;
    }
    setError(null);
    if (!launch.canLaunch) {
      setError(launch.blockedReason ?? "Game cannot be launched.");
      return;
    }
    setPlayerStarted(true);
  }

  async function markGameStarted() {
    if (launch?.role !== "host") {
      return;
    }

    try {
      const payload = await fetchJson<{ room: RoomRecord }>(`/api/rooms/${slug}/start`, {
        method: "POST",
        headers: { "x-doomhub-host-token": hostToken ?? "" }
      });
      setRoom(payload.room);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark the room as started.");
    }
  }

  return (
    <main className="room-page">
      <header className="room-header">
        <a href="/" className="back-link" aria-label="DoomHub home">
          <img src="/doomhublogosmall.png" alt="DoomHub" />
        </a>
        <div>
          <p className="eyebrow">Room {slug}</p>
          <h1>{room ? `${room.mode} ${formatRoomMap(room)}` : "Loading room..."}</h1>
        </div>
        <div className="room-actions">
          <span>{activePlayers} active</span>
          <button type="button" onClick={() => setShowControls(true)}>Controls</button>
          {!gameStarted ? <button type="button" onClick={() => navigator.clipboard.writeText(shareUrl)}>Copy Link</button> : null}
          <button type="button" onClick={() => canvasRef.current?.requestFullscreen()}>Fullscreen</button>
        </div>
      </header>

      {error ? (
        <div className="error room-error">
          <p>{error}</p>
          {!room ? <a href="/" className="error-link">Create a room</a> : null}
        </div>
      ) : null}
      <section className="player-stage">
        {room && launch && !playerStarted ? (
          <div className="start-panel">
            <p className="eyebrow">{launch.role === "host" ? "Host room" : "Join room"}</p>
            <h2>Room {slug}</h2>
            <p>
              {launch.canLaunch
                ? `Start before the match begins. The game waits for ${room.maxPlayers} players.`
                : launch.blockedReason}
            </p>
            <button type="button" onClick={startPlayer} disabled={!launch.canLaunch}>
              {launch.role === "host" ? "Start Doom" : "Join Doom"}
            </button>
          </div>
        ) : null}
        <div className="dos-player">
          <canvas ref={setCanvasRef} id="canvas" onContextMenu={(event) => event.preventDefault()} tabIndex={-1} />
          {playerStarted && launch ? <DoomWasmPlayer launch={launch} canvas={canvasElement} onStatus={setPlayerStatus} onGameStarted={markGameStarted} /> : null}
          {playerStatus ? <p className="player-status">{playerStatus}</p> : null}
        </div>
      </section>
      {showControls ? <ControlsDialog onClose={() => setShowControls(false)} /> : null}
    </main>
  );
}

function DoomWasmPlayer({
  launch,
  canvas,
  onStatus,
  onGameStarted
}: {
  launch: LaunchConfig;
  canvas: HTMLCanvasElement | null;
  onStatus: (status: string) => void;
  onGameStarted: () => void;
}) {
  const startedRef = useRef(false);

  useEffect(() => {
    if (!canvas || startedRef.current) {
      return;
    }
    startedRef.current = true;
    const isDev = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
    if (isDev) {
      window.__DOOMHUB_LAUNCH__ = launch;
      console.debug("[DoomHub] doom-wasm launch config", launch);
    }

    window.Module = {
      canvas,
      noInitialRun: true,
      preRun: () => {
        window.Module?.FS?.createPreloadedFile("", "default.cfg", "/doom-wasm/default.cfg", true, true);
        for (const wad of [launch.baseWad, ...launch.addonWads]) {
          window.Module?.FS?.createPreloadedFile("", wad.fileName, wad.url, true, true);
        }
      },
      onRuntimeInitialized: () => {
        onStatus("Launching Doom...");
        window.callMain?.(launch.args);
      },
      print: (text) => {
        if (text.startsWith("doom:")) {
          onStatus(text);
          if (/^doom:\s*10,/.test(text)) {
            void onGameStarted();
          }
        }
        console.log(text);
      },
      printErr: (text) => {
        console.error(text);
      },
      setStatus: (text) => {
        onStatus(text);
      },
      totalDependencies: 0,
      monitorRunDependencies(left) {
        this.totalDependencies = Math.max(this.totalDependencies ?? 0, left);
        onStatus(left ? `Preparing... (${(this.totalDependencies ?? 0) - left}/${this.totalDependencies})` : "All downloads complete.");
      }
    };

    loadScript(launch.wasmScriptUrl).catch((err: Error) => onStatus(err.message));
  }, [canvas, launch, onStatus]);

  return null;
}

function ControlsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="controls-dialog" role="dialog" aria-modal="true" aria-labelledby="controls-title" onClick={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <h2 id="controls-title">Controls</h2>
          <button type="button" onClick={onClose} aria-label="Close controls">Close</button>
        </div>
        <dl className="controls-list">
          <div><dt>Move</dt><dd>W / S or arrow keys</dd></div>
          <div><dt>Turn</dt><dd>O / P or arrow keys</dd></div>
          <div><dt>Fire</dt><dd>Space or left mouse</dd></div>
          <div><dt>Open doors / use</dt><dd>E</dd></div>
          <div><dt>Run</dt><dd>Left Shift</dd></div>
          <div><dt>Strafe modifier</dt><dd>C</dd></div>
          <div><dt>Strafe left / right</dt><dd>A / D</dd></div>
          <div><dt>Mouse turn</dt><dd>Move mouse left / right</dd></div>
          <div><dt>Weapons</dt><dd>Number keys</dd></div>
          <div><dt>Map / chat</dt><dd>Tab / T</dd></div>
          <div><dt>Fullscreen</dt><dd>F</dd></div>
        </dl>
      </section>
    </div>
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.error ?? payload?.message ?? `Request failed: ${response.status}`);
  }
  return payload as T;
}

function getRoomSlug(): string | null {
  const match = window.location.pathname.match(/^\/r\/([^/]+)$/);
  return match ? match[1].toUpperCase() : null;
}

function formatRoomMap(room: RoomRecord): string {
  return room.mapFormat === "map-number" ? `MAP${String(room.map).padStart(2, "0")}` : `E${room.episode}M${room.map}`;
}

function getPlayerId(): string {
  const key = "doomhub-player-id";
  const existing = window.localStorage.getItem(key);
  if (existing) {
    return existing;
  }
  const created = crypto.randomUUID();
  window.localStorage.setItem(key, created);
  return created;
}

function hostTokenKey(slug: string): string {
  return `doomhub-host-token-${slug}`;
}

function effectiveMapOptions(baseWad: WadRecord | undefined, addonWads: WadRecord[]): string[] {
  if (!baseWad) {
    return [];
  }
  const maps = [...baseWad.maps, ...addonWads.flatMap((wad) => wad.maps)];
  if (maps.length > 0) {
    return [...new Set(maps)].sort(compareMapNames);
  }
  if (baseWad.mapFormat === "map-number") {
    return Array.from({ length: baseWad.maxMap }, (_, index) => `MAP${String(index + 1).padStart(2, "0")}`);
  }
  const generated: string[] = [];
  for (let episode = 1; episode <= baseWad.maxEpisode; episode += 1) {
    for (let map = 1; map <= baseWad.maxMap; map += 1) {
      generated.push(`E${episode}M${map}`);
    }
  }
  return generated;
}

function parseMapName(mapName: string, mapFormat: MapFormat): { episode: number; map: number } | null {
  if (mapFormat === "map-number") {
    const match = /^MAP(\d{2})$/.exec(mapName);
    return match ? { episode: 1, map: Number(match[1]) } : null;
  }

  const match = /^E(\d+)M(\d+)$/.exec(mapName);
  return match ? { episode: Number(match[1]), map: Number(match[2]) } : null;
}

function compareMapNames(a: string, b: string): number {
  const parsedA = parseMapName(a, a.startsWith("MAP") ? "map-number" : "episode-map");
  const parsedB = parseMapName(b, b.startsWith("MAP") ? "map-number" : "episode-map");
  if (!parsedA || !parsedB) {
    return a.localeCompare(b);
  }
  return parsedA.episode - parsedB.episode || parsedA.map - parsedB.map;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Could not load ${src}. Make sure doom-wasm assets are installed.`));
    document.body.appendChild(script);
  });
}

createRoot(document.getElementById("root")!).render(<App />);
