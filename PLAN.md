# DoomHub Architecture

DoomHub now runs Cloudflare's WebAssembly Doom runtime in the browser and routes multiplayer packets through the Node/Fastify server.

Current implementation:

- IWAD and PWAD files are discovered from `data/wads`.
- Room creation chooses one IWAD base game, optional PWAD add-ons, a starting level, and an optional native Doom level timer.
- WebAssembly runtime assets live in `src/client/public/doom-wasm` and are copied into the production build by Vite.
- The server exposes `/api/rooms/:slug/ws` for Doom WebSocket traffic.
- Players must join before the host starts the actual match. Once doom-wasm reports the game has started, late joiners are blocked.

Operational constraints:

- Do not bake licensed WAD files into Docker images.
- Proxies must support WebSocket upgrades for `/api/rooms/<room>/ws`.
- Shareware Doom cannot be combined with add-on PWAD files.
