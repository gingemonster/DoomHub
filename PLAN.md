# Browser Doom Multiplayer, Docker Hosted

## Summary
Build a new Docker-hosted web app, ignoring the current repo, that lets desktop browser users on PC and Mac create or join private Doom rooms and play through `js-dos` with IPX multiplayer over WebSockets.

Use the shareware Doom IWAD for the first deploy, then add a server-managed WAD catalogue for legally supplied full-game IWADs. Avoid building a custom Doom engine because current browser-native Doom ports commonly lack multiplayer, while `js-dos` explicitly supports browser DOS execution, sound, and IPX rooms.

References used: [js-dos overview](https://js-dos.com/overview.html), [js-dos player API](https://js-dos.com/player-api.html), [js-dos networking](https://js-dos.com/networking.html), [Doom networking background](https://doomwiki.org/wiki/Doom_networking_component).

## Key Changes
- Create a standalone Docker project with four services:
  - `web`: TypeScript Node/Fastify API plus Vite/React frontend.
  - `ipx`: self-hosted js-dos IPX relay exposed as secure `wss://`.
  - `caddy`: TLS reverse proxy for `/`, `/api`, and `/ipx`.
  - `storage`: Docker volumes for SQLite metadata, WAD files, generated js-dos bundles, and room logs.
- Frontend flow:
  - Landing screen is the room browser, not marketing.
  - Users can create a private room or enter a room code/link.
  - Room page embeds the `js-dos` player, enables sound after the required user click, locks mouse on request, and offers fullscreen.
- Room model:
  - `roomId`, `slug`, `wadId`, `mode`, `maxPlayers`, `episode/map`, `skill`, `createdAt`, `expiresAt`.
  - Default MVP mode is private rooms with shareable links.
  - “Currently being played” is tracked by app-level browser heartbeats, not by inspecting Doom packets.
- Doom runtime:
  - Use DOS Doom inside a `.jsdos` bundle.
  - Configure js-dos with the room slug as the IPX room: `room: room.slug`.
  - Use the local IPX relay as the default backend, with no dependency on public js-dos relay servers.
  - Support 2-4 players, matching vanilla Doom-era multiplayer constraints.
- WAD management:
  - Ship or mount shareware Doom as the initial WAD.
  - Add an admin-only WAD manager that accepts server-hosted IWADs later, stores SHA-256, filename, display name, and allowed room modes.
  - Do not bake commercial IWADs into the public Docker image.
  - Generate/cache one js-dos bundle per supported WAD/config combination.

## Public Interfaces
- Web routes:
  - `/` room list/create/join screen.
  - `/r/:slug` playable room page.
  - `/admin/wads` admin WAD upload/management page.
- API routes:
  - `GET /api/rooms` returns active private rooms only if configured to be visible; otherwise returns no global list.
  - `POST /api/rooms` creates a room from `wadId`, `mode`, `maxPlayers`, and map settings.
  - `GET /api/rooms/:slug` returns room metadata and js-dos launch config.
  - `POST /api/rooms/:slug/heartbeat` updates player presence.
  - `GET /api/rooms/:slug/bundle` serves the generated `.jsdos` bundle.
  - `POST /api/admin/wads` uploads or registers a WAD.
- Docker-facing config:
  - `PUBLIC_BASE_URL`
  - `IPX_WSS_URL`
  - `ADMIN_PASSWORD_HASH`
  - `ROOM_TTL_MINUTES`
  - `WAD_STORAGE_PATH`
  - `BUNDLE_STORAGE_PATH`

## Test Plan
- Unit tests:
  - Room creation validates allowed WADs, player counts, and mode settings.
  - Room slugs are unique and unguessable enough for private rooms.
  - Heartbeats mark rooms active/inactive correctly.
  - WAD records store SHA-256 and reject duplicate IDs.
- Integration tests:
  - Docker Compose starts all services.
  - Frontend can create a room and load a js-dos player config.
  - Two browser sessions joining the same room receive the same IPX backend and room name.
  - Expired rooms stop appearing and reject new joins if TTL cleanup has run.
- Manual acceptance:
  - On macOS Chrome/Safari and Windows Chrome/Edge, users can open a room, click play, hear sound, enter fullscreen, and use keyboard/mouse.
  - Two players can join the same room and start a shareware Doom multiplayer session.
  - Uploading/registering a full IWAD makes it selectable without rebuilding the Docker image.

## Assumptions
- MVP targets desktop browsers on PC and Mac, not mobile controls.
- Multiplayer starts with private invite rooms; no public matchmaking, moderation, chat, accounts, or rankings in v1.
- Shareware Doom is the initial playable content. Full Doom support means server-managed IWADs supplied by the operator, not redistribution from the image.
- The implementation uses `js-dos` IPX networking because it is the fastest existing route to browser Doom with sound and multiplayer.
