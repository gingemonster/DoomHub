# DoomHub

Docker-hosted browser based Doom for playing with up to 4 players online in their web browsers with no client install required.

DoomHub runs Cloudflare's WebAssembly Doom port with a self-hosted WebSocket router. It keeps vanilla Chocolate Doom multiplayer behavior: players must join before the host starts the match, and active late join is not supported.

## Running it locally for development

1. Install Node 22 or newer.
2. Run `make install`.
3. Add legally distributable WAD files under `data/wads`.
4. Run `make dev`.
5. Open `http://localhost:5173`.

The API and WebSocket router run on `http://localhost:3000`. In local development, the frontend server on `http://localhost:5173` forwards `/api` HTTP and WebSocket requests to that API server.
You can confirm the server is running with `curl http://localhost:3000/api/health`.

## Build and test

- `make check`: TypeScript checks for frontend and backend.
- `make test`: unit tests.
- `make build`: Vite frontend build plus server compilation.
- `make start`: serve the production build on `http://localhost:3000`.

## WAD files

DoomHub scans direct `.wad` files under `data/wads`.

- IWAD files are listed as base games.
- PWAD files are listed as optional add-on maps during room creation.
- Browser clients download the selected IWAD and PWAD files to run Doom locally, so only deploy WAD files you are legally allowed to distribute to players.
- Shareware Doom cannot be combined with add-on PWADs because Chocolate Doom rejects `-file` with the shareware IWAD.

Room creation supports choosing the starting level and an optional level timer. The timer uses Chocolate Doom's native `-timer <minutes>` multiplayer behavior.

The WebAssembly runtime assets are included under `src/client/public/doom-wasm` and copied into the production Docker image by the normal Vite build.

## Running it in Docker

- `make docker-build`
- `make docker-up`
- Open `http://localhost:3000`.

The compose file mounts:

- `./data/wads` for operator-supplied IWAD and PWAD files.
- A Docker volume for SQLite metadata.

The web image does not include local `data` contents. Keep WAD files mounted at runtime instead of baking licensed game data into the image.

By default, Compose exposes the app directly:

- Web app, API, and Doom WebSocket router: `http://localhost:3000`

The bundled Caddy proxy is optional:

```sh
make docker-up-proxy
```

That starts Compose with `COMPOSE_PROFILES=managed-proxy` and exposes Caddy on `http://localhost:8080`. Override the port with `PUBLIC_HTTP_PORT=8081 make docker-up-proxy`.

## Simple deployment

1. Build and install the Docker image on the target server. Use the Linux export flow below if the server cannot build the image itself.
2. Put a reverse proxy in front of the app. The proxy must provide SSL for the website and support WebSocket upgrades for `/api/rooms/<room>/ws`.
3. Mount legally distributable WAD files under `data/wads` on the server.

## Linux Docker image exports

Use Buildx when you need Linux images for another server.

Build a Linux image into the local Docker image store:

```sh
docker buildx build --platform linux/amd64 --load -t doomhub-web:latest .
```

For an ARM Linux server, use `linux/arm64` instead of `linux/amd64`.

Export the image as a tar file:

```sh
mkdir -p dist/images
docker save doomhub-web:latest -o dist/images/doomhub-web-linux-amd64.tar
```

Copy the tar file to the Linux server, then load it:

```sh
docker load -i doomhub-web-linux-amd64.tar
```

If you use that image name with Compose, set the service `image:` value or retag the loaded image to match your production compose file. Keep licensed WADs out of the image; mount them under `data/wads` on the server.

## Configuration

Copy `.env.example` to `.env` for local overrides.

- `PUBLIC_BASE_URL`: public origin used in generated room links.
- `ROOM_TTL_MINUTES`: room expiry window.
- `WAD_STORAGE_PATH`: WAD storage directory.
- `DATABASE_PATH`: SQLite database path.
- `COMPOSE_PROFILES`: set to `managed-proxy` to include bundled Caddy.
- `PUBLIC_HTTP_PORT`: host port for bundled Caddy when the `managed-proxy` profile is enabled.
