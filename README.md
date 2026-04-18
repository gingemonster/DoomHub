<p align="center">
  <img src="https://raw.githubusercontent.com/gingemonster/DoomHub/main/src/client/public/doomhublogo.png" alt="DoomHub" width="420">
</p>

# DoomHub

Docker-hosted browser-based Doom for playing with up to 4 players online with no client install required.

DoomHub runs Cloudflare's WebAssembly Doom port with a self-hosted WebSocket router. It keeps vanilla Chocolate Doom multiplayer behavior: players must join before the host starts the match, and active late join is not supported.

Source code: https://github.com/gingemonster/DoomHub

Docker image: https://hub.docker.com/r/gingemonsteruk/doomhub

## Quick Start

Create a local data directory and add legally distributable WAD files:

```sh
mkdir -p data/wads
```

Run DoomHub with Docker Compose:

```sh
docker compose up --build
```

Open `http://localhost:3000`.

The compose file mounts one host data directory:

- `./data` to `/data` for SQLite metadata and operator-supplied IWAD/PWAD files.

The server creates `/data/wads` on startup if it does not exist. Put WAD files under `data/wads` on the host.

## WAD Files

WAD files store Doom game data.

- IWAD files are complete base games, such as Doom, Doom II, or Ultimate Doom.
- PWAD files are optional add-on maps or modifications loaded on top of a base IWAD.

No WAD files are included in this repository or Docker image. You must source your own WAD files.

DoomHub scans direct `.wad` files under `data/wads`.

- IWAD files are listed as base games.
- PWAD files are listed as optional add-on maps during room creation.
- Browser clients download the selected IWAD and PWAD files to run Doom locally, so only deploy WAD files you are legally allowed to distribute to players.
- Shareware Doom cannot be combined with add-on PWADs because Chocolate Doom rejects `-file` with the shareware IWAD.

Room creation supports choosing the starting level and an optional level timer. The timer uses Chocolate Doom's native `-timer <minutes>` multiplayer behavior.

## Internet Play

For play over the internet, put your own reverse proxy in front of DoomHub. Caddy, Nginx Proxy Manager, or a similar proxy should terminate HTTPS and support WebSocket upgrades for `/api/rooms/<room>/ws`.

Set `PUBLIC_BASE_URL` to the public origin used in room links, for example:

```sh
PUBLIC_BASE_URL=https://doom.example.com
```

## Docker Image

The intended DockerHub image name is:

```sh
gingemonsteruk/doomhub
```

Example runtime command:

```sh
docker run --rm \
  -p 3000:3000 \
  -e PUBLIC_BASE_URL=http://localhost:3000 \
  -v "$PWD/data:/data" \
  gingemonsteruk/doomhub:latest
```

The web image does not include local `data` contents. Keep WAD files mounted at runtime instead of baking licensed game data into the image.

## Credits

DoomHub uses and references:

- [Chocolate Doom](https://github.com/chocolate-doom/chocolate-doom)
- [Cloudflare doom-wasm](https://github.com/cloudflare/doom-wasm)
- [Cloudflare doom-workers](https://github.com/cloudflare/doom-workers)

The bundled Doom WebAssembly runtime is GPL-licensed third-party software. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `src/client/public/doom-wasm/COPYING.md`.

## AI Acknowledgement

Portions of DoomHub were implemented with assistance from OpenAI Codex. The maintainer is responsible for reviewing, testing, and publishing releases.

## Disclaimer

DoomHub is provided as-is, without warranty. Use it at your own risk. The maintainer is not responsible for data loss, service issues, licensing problems, server exposure, gameplay issues, or other consequences from running or modifying this software.

## Development

Development setup, VS Code tasks, testing, and publishing notes are in [DEVELOPMENT.md](DEVELOPMENT.md) and [PUBLISHING.md](PUBLISHING.md).
