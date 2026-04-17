import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type RoomMode = "cooperative" | "deathmatch";
type MapFormat = "episode-map" | "map-number";

interface WadRecord {
  id: string;
  displayName: string;
  allowedModes: RoomMode[];
  mapFormat: MapFormat;
  maxEpisode: number;
  maxMap: number;
}

interface RoomRecord {
  slug: string;
  wadId: string;
  mode: RoomMode;
  maxPlayers: number;
  episode: number;
  map: number;
  mapFormat: MapFormat;
  skill: number;
  deathmatchMonsters: boolean;
  expiresAt: string;
}

interface LaunchConfig {
  bundleUrl: string;
  ipxBackend: string;
  room: string;
  ipx: Array<{ name: string; host: string }>;
}

interface BundleStatus {
  available: boolean;
  expectedPath: string;
}

interface DosProps {
  stop(): Promise<void>;
  setFullScreen(fullScreen: boolean): void;
}

interface CommandInterface {
  networkConnect(networkType: number, address: string): Promise<void>;
}

interface DosOptions {
  url: string;
  ipxBackend: string;
  room: string;
  ipx: Array<{ name: string; host: string }>;
  autoStart: boolean;
  mouseCapture: boolean;
  renderAspect: "Fit" | "4/3";
  imageRendering: "pixelated" | "smooth";
  theme: "dark" | "retro";
  noNetworking: boolean;
  onEvent?: (event: string, arg?: CommandInterface | boolean) => void;
}

declare global {
  interface Window {
    Dos?: (element: HTMLDivElement, options: Partial<DosOptions>) => DosProps;
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
  const [episode, setEpisode] = useState(1);
  const [map, setMap] = useState(1);
  const [skill, setSkill] = useState(3);
  const [deathmatchMonsters, setDeathmatchMonsters] = useState(false);
  const [selectedWadId, setSelectedWadId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchJson<WadRecord[]>("/api/wads")
      .then((loadedWads) => {
        setWads(loadedWads);
        setSelectedWadId((current) => current || loadedWads.find((wad) => wad.id === "doom-shareware")?.id || loadedWads[0]?.id || "");
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const selectedWad = wads.find((wad) => wad.id === selectedWadId);
  const usesEpisodes = selectedWad?.mapFormat !== "map-number";

  useEffect(() => {
    if (!selectedWad) {
      return;
    }
    setEpisode((current) => Math.min(Math.max(current, 1), selectedWad.maxEpisode));
    setMap((current) => Math.min(Math.max(current, 1), selectedWad.maxMap));
  }, [selectedWad]);

  async function createRoom(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetchJson<{ room: RoomRecord }>("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wadId: selectedWad?.id,
          mode,
          maxPlayers,
          episode,
          map,
          skill,
          deathmatchMonsters
        })
      });
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
              WAD
              <select value={selectedWadId} onChange={(event) => setSelectedWadId(event.target.value)} disabled={wads.length === 0}>
                {wads.length === 0 ? <option value="">No bundles found</option> : null}
                {wads.map((wad) => (
                  <option key={wad.id} value={wad.id}>
                    {wad.displayName}
                  </option>
                ))}
              </select>
            </label>

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
                Episode
                <input
                  type="number"
                  min="1"
                  max={selectedWad?.maxEpisode ?? 4}
                  value={episode}
                  onChange={(event) => setEpisode(Number(event.target.value))}
                  disabled={!usesEpisodes}
                />
              </label>
            </div>

            <div className="field-row">
              <label>
                Map
                <input type="number" min="1" max={selectedWad?.maxMap ?? 9} value={map} onChange={(event) => setMap(Number(event.target.value))} />
              </label>
              <label>
                Skill
                <input type="number" min="1" max="5" value={skill} onChange={(event) => setSkill(Number(event.target.value))} />
              </label>
            </div>

            <button type="submit" disabled={busy || !selectedWad}>
              {busy ? "Creating..." : "Start Private Room"}
            </button>
          </form>

          <form onSubmit={joinRoom} className="join-form">
            <h2>Join a Room</h2>
            <p className="form-help">
              Ask the friend who created the room for their room code or invite link.
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
  const [bundleStatus, setBundleStatus] = useState<BundleStatus | null>(null);
  const [playerStarted, setPlayerStarted] = useState(false);
  const [activePlayers, setActivePlayers] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const playerRef = useRef<HTMLDivElement | null>(null);
  const dosRef = useRef<DosProps | null>(null);
  const ipxConnectedRef = useRef(false);

  useEffect(() => {
    fetchJson<{ room: RoomRecord; launch: LaunchConfig }>(`/api/rooms/${slug}`)
      .then((payload) => {
        setRoom(payload.room);
        setLaunch(payload.launch);
        return fetchJson<BundleStatus>(`/api/rooms/${slug}/bundle/status`);
      })
      .then((status) => {
        setBundleStatus(status);
      })
      .catch((err: Error) => setError(err.message));
  }, [slug]);

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

  useEffect(() => {
    if (!playerStarted || !launch || !playerRef.current || dosRef.current) {
      return;
    }

    if (!window.Dos) {
      setError("js-dos did not load. Check your internet connection or vendor the js-dos assets locally.");
      return;
    }

    const ipxSocketUrl = getIpxSocketUrl(launch);
    const isDev = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
    if (isDev) {
      window.__DOOMHUB_LAUNCH__ = launch;
      console.debug("[DoomHub] js-dos launch config", launch);
      console.debug("[DoomHub] js-dos IPX socket", ipxSocketUrl);
    }

    dosRef.current = window.Dos(playerRef.current, {
      url: launch.bundleUrl,
      ipxBackend: launch.ipxBackend,
      ipx: launch.ipx,
      room: launch.room,
      autoStart: true,
      mouseCapture: false,
      renderAspect: "Fit",
      imageRendering: "pixelated",
      theme: "dark",
      noNetworking: false,
      onEvent: (event, arg) => {
        if (event === "bnd-play") {
          void fetchJson(`/api/rooms/${slug}/heartbeat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ playerId })
          });
        }
        if (event === "ci-ready" && arg && typeof arg !== "boolean" && !ipxConnectedRef.current) {
          ipxConnectedRef.current = true;
          arg.networkConnect(0, ipxSocketUrl).catch((err: Error) => {
            ipxConnectedRef.current = false;
            setError(`Could not connect to the IPX relay at ${ipxSocketUrl}: ${err.message}`);
          });
        }
      }
    });

    return () => {
      void dosRef.current?.stop();
      dosRef.current = null;
      ipxConnectedRef.current = false;
    };
  }, [launch, playerStarted, slug]);

  const shareUrl = useMemo(() => `${window.location.origin}/r/${slug}`, [slug]);

  function startPlayer() {
    setError(null);
    if (!bundleStatus?.available) {
      setError(
        bundleStatus
          ? `Room is ready, but Doom is not installed yet. Add a js-dos bundle at ${bundleStatus.expectedPath}.`
          : "Room is ready, but bundle status has not loaded yet."
      );
      return;
    }
    setPlayerStarted(true);
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
          <button type="button" onClick={() => navigator.clipboard.writeText(shareUrl)}>Copy Link</button>
          <button type="button" onClick={() => dosRef.current?.setFullScreen(true)}>Fullscreen</button>
        </div>
      </header>

      {error ? (
        <div className="error room-error">
          <p>{error}</p>
          {!room ? <a href="/" className="error-link">Create a room</a> : null}
        </div>
      ) : null}
      <section className="player-stage">
        {room && !playerStarted ? (
          <div className="start-panel">
            <p className="eyebrow">Ready room</p>
            <h2>Room {slug}</h2>
            <p>
              Share the link, then start Doom. The game waits for {room.maxPlayers} players before launching.
            </p>
            <button type="button" onClick={startPlayer}>
              Start Doom
            </button>
          </div>
        ) : null}
        <div ref={playerRef} className="dos-player" />
      </section>
      {showControls ? <ControlsDialog onClose={() => setShowControls(false)} /> : null}
    </main>
  );
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
          <div><dt>Move</dt><dd>Arrow keys</dd></div>
          <div><dt>Fire</dt><dd>S</dd></div>
          <div><dt>Open doors / use</dt><dd>Space</dd></div>
          <div><dt>Run</dt><dd>Right Shift</dd></div>
          <div><dt>Strafe</dt><dd>Left Alt</dd></div>
          <div><dt>Strafe left / right</dt><dd>A / D</dd></div>
          <div><dt>Weapons</dt><dd>Number keys</dd></div>
          <div><dt>Menu</dt><dd>Esc</dd></div>
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

function getIpxSocketUrl(launch: LaunchConfig): string {
  const backend = launch.ipx.find((item) => item.name === launch.ipxBackend) ?? launch.ipx[0];
  const host = backend.host.endsWith("/") ? backend.host.slice(0, -1) : backend.host;
  return `${host}:1900/ipx/${launch.room.replaceAll("@", "_")}`;
}

createRoot(document.getElementById("root")!).render(<App />);
