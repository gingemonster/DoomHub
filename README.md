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

By default, Compose exposes the app directly:

- Web app and API: `http://localhost:3000`
- IPX relay: `ws://localhost:1900/ipx/<room>`

Use an external proxy by pointing it at those services. If the proxy runs on the host, target `localhost:3000` for HTTP and `localhost:1900` for the IPX websocket. If it runs in the same Docker network, target `web:3000` and `ipx:1900`.

The bundled Caddy proxy is optional:

```sh
make docker-up-proxy
```

That starts Compose with `COMPOSE_PROFILES=managed-proxy` and exposes Caddy on `http://localhost:8080`. Override the port with `PUBLIC_HTTP_PORT=8081 make docker-up-proxy`.

For the MVP, room creation and js-dos launch configuration work before a playable bundle exists. Add a bundle named `doom-shareware.jsdos` under `data/bundles` to let `/api/rooms/:slug/bundle` serve it.

## Configuration

Copy `.env.example` to `.env` for local overrides.

- `PUBLIC_BASE_URL`: public origin used in generated room links.
- `IPX_WSS_URL`: browser-accessible js-dos IPX relay host. js-dos appends `:1900/ipx/<room>`, so use values like `ws://localhost` locally or `wss://example.com` in production. Required in production.
- `ROOM_TTL_MINUTES`: room expiry window.
- `WAD_STORAGE_PATH`: WAD storage directory.
- `BUNDLE_STORAGE_PATH`: `.jsdos` bundle storage directory.
- `DATABASE_PATH`: SQLite database path.
- `COMPOSE_PROFILES`: set to `managed-proxy` to include bundled Caddy.
- `PUBLIC_HTTP_PORT`: host port for bundled Caddy when the `managed-proxy` profile is enabled.
