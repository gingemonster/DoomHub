# Publishing DoomHub

## Pre-Publish Checklist

Complete this checklist before publishing a public Docker image.

- Confirm the bundled Doom WebAssembly runtime provenance in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- Confirm `src/client/public/doom-wasm/COPYING.md` remains in the repository and Docker image.
- Confirm no WAD files are included in the image.
- Run `make check`.
- Run `make test`.
- Run `make build`.
- Build the Docker image locally.

The bundled `websockets-doom.js` and `websockets-doom.wasm` were imported from `@nicejsisverycool/tizendoom@0.1.6`. The exact upstream `cloudflare/doom-wasm` source commit used to build them is not documented in that package metadata; DoomHub records the npm package tarball, npm integrity value, and artifact hashes instead.

## DockerHub

The intended image name is:

```sh
gingemonsteruk/doomhub
```

Create a DockerHub access token and add this GitHub repository secret:

- `DOCKERHUB_TOKEN`: the DockerHub personal access token

Do not commit the DockerHub token to the repository.

After the pre-publish checklist is complete, add this GitHub repository variable:

- `ALLOW_DOCKERHUB_PUBLISH`: `true`

The workflow will build images without this variable, but it will not push to DockerHub.

## Automated Builds

The workflow in `.github/workflows/docker-publish.yml` builds the image on pull requests and pushes it to DockerHub on `main` and version tags.

Tags:

- `latest` for the default branch.
- `vX.Y.Z` tags produce semantic version tags.
- Every pushed image also gets a short SHA tag.

The workflow builds `linux/amd64` and `linux/arm64` images and requests SBOM/provenance attestations from Docker Buildx.

## Manual Local Build

Build a local image:

```sh
docker build -t gingemonsteruk/doomhub:local .
```

Run it:

```sh
docker run --rm \
  -p 3000:3000 \
  -e PUBLIC_BASE_URL=http://localhost:3000 \
  -v "$PWD/data:/data" \
  gingemonsteruk/doomhub:local
```

For internet play, run DoomHub behind a reverse proxy that terminates HTTPS and supports WebSocket upgrades for `/api/rooms/<room>/ws`.
