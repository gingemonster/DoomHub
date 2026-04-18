# DoomHub Development

## Requirements

- Node 22 or newer.
- Docker Desktop or another Docker engine with Compose support.

## Local Development

1. Install dependencies:

   ```sh
   make install
   ```

2. Add legally distributable WAD files under `data/wads`.

3. Run the development servers:

   ```sh
   make dev
   ```

4. Open `http://localhost:5173`.

The API and WebSocket router run on `http://localhost:3000`. In local development, the Vite frontend server on `http://localhost:5173` forwards `/api` HTTP and WebSocket requests to that API server.

You can confirm the server is running with:

```sh
curl http://localhost:3000/api/health
```

## Build And Test

- `make check`: TypeScript checks for frontend and backend.
- `make test`: unit tests.
- `make build`: Vite frontend build plus server compilation.
- `make start`: serve the production build on `http://localhost:3000`.
- `make docker-build`: build the Docker image with Compose.
- `make docker-up`: run the Docker image with Compose.
- `make docker-down`: stop the Compose stack.

## VS Code

The repository includes VS Code configuration under `.vscode`.

- Launch config: `Launch DoomHub Dev`, which runs `npm run dev` and opens the Vite URL.
- Tasks: install dependencies, run type checks, and run tests.
- Recommended extensions: ESLint and Prettier.

## Configuration

Copy `.env.example` to `.env` for local overrides.

- `PUBLIC_BASE_URL`: public origin used in generated room links.
- `ROOM_TTL_MINUTES`: room expiry window.
- `WAD_STORAGE_PATH`: WAD storage directory.
- `DATABASE_PATH`: SQLite database path.
- `PORT`: API and production web server port.

## Doom Runtime Assets

The WebAssembly runtime assets live under `src/client/public/doom-wasm` and are copied into the production Docker image by the normal Vite build.

Before publishing public Docker images, verify the Doom runtime provenance in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The current bundled runtime files have recorded hashes, but their exact upstream source commit was not recorded at import time.
