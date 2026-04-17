# DoomHub

Docker-hosted browser Doom rooms using js-dos and IPX room configuration.

## Local macOS run

1. Install Node 22 or newer.
2. Run `make install`.
3. Run `make dev`.
4. Open `http://localhost:5173`.

The API runs on `http://localhost:3000`; Vite proxies `/api` to it.
The local js-dos IPX relay is started through Docker on `ws://localhost:1900/ipx/<room>` by default.
Set `DEV_USE_LOCAL_IPX=false` if you want to use `IPX_WSS_URL` manually instead.
You can confirm the active relay with `curl http://localhost:3000/api/health`.

## Build and test

- `make check`: TypeScript checks for frontend and backend.
- `make test`: unit tests.
- `make build`: Vite frontend build plus server compilation.
- `make start`: serve the production build on `http://localhost:3000`.

## Docker

- `make docker-build`
- `make docker-up`
- Open `http://localhost:3000`.

The compose file mounts:

- `./data/wads` for operator-supplied WAD files.
- `./data/bundles` for generated or copied `.jsdos` bundles.
- A Docker volume for SQLite metadata.

The web image does not include local `data` contents. Keep WADs and `.jsdos` bundles mounted at runtime instead of baking them into the image.

By default, Compose exposes the app directly:

- Web app and API: `http://localhost:3000`
- IPX relay: `ws://localhost:1900/ipx/<room>`

Use an external proxy by pointing it at those services. If the proxy runs on the host, target `localhost:3000` for HTTP and `localhost:1900` for the IPX websocket. If it runs in the same Docker network, target `web:3000` and `ipx:1900`.

The bundled Caddy proxy is optional:

```sh
make docker-up-proxy
```

That starts Compose with `COMPOSE_PROFILES=managed-proxy` and exposes Caddy on `http://localhost:8080`. The browser reaches the IPX relay through `ws://localhost:8080/ipx/<room>`. Override the port with `PUBLIC_HTTP_PORT=8081 IPX_WSS_URL=ws://localhost:8081/ipx make docker-up-proxy`.

Room creation scans direct `.jsdos` files under `data/bundles` and lists them in the WAD dropdown. For example, add `doom-shareware.jsdos` or `doom-full.jsdos` under `data/bundles`. Generated room-specific bundles are written under `data/bundles/generated` and are not listed.

## Linux Docker image exports

From macOS, use Buildx when you need Linux images for another server.

Build Linux images into the local Docker image store:

```sh
docker buildx build --platform linux/amd64 --load -t doomhub-web:latest .
docker buildx build --platform linux/amd64 --load -t doomhub-ipx:latest ./docker/ipx
```

For an ARM Linux server, use `linux/arm64` instead of `linux/amd64`.

Export the images as tar files:

```sh
mkdir -p dist/images
docker save doomhub-web:latest -o dist/images/doomhub-web-linux-amd64.tar
docker save doomhub-ipx:latest -o dist/images/doomhub-ipx-linux-amd64.tar
```

Copy the tar files to the Linux server, then load them:

```sh
docker load -i doomhub-web-linux-amd64.tar
docker load -i doomhub-ipx-linux-amd64.tar
```

If you use those image names with Compose, set the service `image:` values or retag the loaded images to match your production compose file. Keep licensed `.jsdos` bundles out of the image; mount them under `data/bundles` on the server.

## Configuration

Copy `.env.example` to `.env` for local overrides.

- `PUBLIC_BASE_URL`: public origin used in generated room links.
- `IPX_WSS_URL`: browser-accessible js-dos IPX relay websocket base URL. DoomHub appends `/<room>`, so use values like `ws://localhost:1900/ipx` for a directly exposed local relay, `ws://localhost:8080/ipx` for the bundled Caddy proxy, or `wss://example.com/ipx` in production. Required in production.
- `ROOM_TTL_MINUTES`: room expiry window.
- `WAD_STORAGE_PATH`: WAD storage directory.
- `BUNDLE_STORAGE_PATH`: `.jsdos` bundle storage directory.
- `DATABASE_PATH`: SQLite database path.
- `COMPOSE_PROFILES`: set to `managed-proxy` to include bundled Caddy.
- `PUBLIC_HTTP_PORT`: host port for bundled Caddy when the `managed-proxy` profile is enabled.
