import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type RoomMode = "cooperative" | "deathmatch";

interface WadRecord {
  id: string;
  displayName: string;
  allowedModes: RoomMode[];
}

interface RoomRecord {
  slug: string;
  wadId: string;
  mode: RoomMode;
  maxPlayers: number;
  episode: number;
  map: number;
  skill: number;
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
  onEvent?: (event: string, arg?: unknown) => void;
}

declare global {
  interface Window {
    Dos?: (element: HTMLDivElement, options: Partial<DosOptions>) => DosProps;
  }
}

const playerId = getPlayerId();

function App() {
  const roomSlug = getRoomSlug();
  return roomSlug ? <RoomPage slug={roomSlug} /> : <HomePage />;
}

function HomePage() {
  const [wads, setWads] = useState<WadRecord[]>([]);
  const [mode, setMode] = useState<RoomMode>("cooperative");
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [episode, setEpisode] = useState(1);
  const [map, setMap] = useState(1);
  const [skill, setSkill] = useState(3);
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchJson<WadRecord[]>("/api/wads")
      .then(setWads)
      .catch((err: Error) => setError(err.message));
  }, []);

  const selectedWad = wads[0];

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
          skill
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

  return (
    <main className="page-shell">
      <section className="home-grid">
        <div className="control-panel">
          <p className="eyebrow">Private IPX rooms</p>
          <h1>Start Doom with the people you invite.</h1>

          <form onSubmit={createRoom} className="room-form">
            <h2>Create a Room</h2>
            <label>
              WAD
              <select value={selectedWad?.id ?? ""} disabled>
                {wads.map((wad) => (
                  <option key={wad.id} value={wad.id}>
                    {wad.displayName}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Mode
              <select value={mode} onChange={(event) => setMode(event.target.value as RoomMode)}>
                <option value="cooperative">Co-op</option>
                <option value="deathmatch">Deathmatch</option>
              </select>
            </label>

            <div className="field-row">
              <label>
                Players
                <input type="number" min="2" max="4" value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value))} />
              </label>
              <label>
                Episode
                <input type="number" min="1" max="4" value={episode} onChange={(event) => setEpisode(Number(event.target.value))} />
              </label>
            </div>

            <div className="field-row">
              <label>
                Map
                <input type="number" min="1" max="9" value={map} onChange={(event) => setMap(Number(event.target.value))} />
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
            <label>
              Room code
              <input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="ABCD2345" />
            </label>
            <button type="submit">Join</button>
          </form>

          {error ? <p className="error">{error}</p> : null}
        </div>

        <img
          className="side-image"
          alt="Dim industrial corridor"
          src="https://images.unsplash.com/photo-1517999144091-3d9dca6d1e43?auto=format&fit=crop&w=1200&q=80"
        />
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
  const playerRef = useRef<HTMLDivElement | null>(null);
  const dosRef = useRef<DosProps | null>(null);

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

    dosRef.current = window.Dos(playerRef.current, {
      url: launch.bundleUrl,
      ipxBackend: launch.ipxBackend,
      ipx: launch.ipx,
      room: launch.room,
      autoStart: false,
      mouseCapture: true,
      renderAspect: "Fit",
      imageRendering: "pixelated",
      theme: "dark",
      onEvent: (event) => {
        if (event === "bnd-play") {
          void fetchJson(`/api/rooms/${slug}/heartbeat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ playerId })
          });
        }
      }
    });

    return () => {
      void dosRef.current?.stop();
      dosRef.current = null;
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
        <a href="/" className="back-link">DoomHub</a>
        <div>
          <p className="eyebrow">Room {slug}</p>
          <h1>{room ? `${room.mode} E${room.episode}M${room.map}` : "Loading room..."}</h1>
        </div>
        <div className="room-actions">
          <span>{activePlayers} active</span>
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
              Share the link, then start Doom when the bundle is installed.
            </p>
            <button type="button" onClick={startPlayer}>
              Start Doom
            </button>
          </div>
        ) : null}
        <div ref={playerRef} className="dos-player" />
      </section>
    </main>
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

createRoot(document.getElementById("root")!).render(<App />);
