# Third-Party Notices

This file summarizes important third-party software used by DoomHub. It is not a substitute for the upstream license texts.

## DoomHub Original Code

Original DoomHub code is licensed under the MIT License. See [LICENSE](LICENSE).

## Chocolate Doom And doom-wasm Runtime

DoomHub bundles a WebAssembly Doom runtime under `src/client/public/doom-wasm`.

Bundled files:

- `src/client/public/doom-wasm/websockets-doom.js`
- `src/client/public/doom-wasm/websockets-doom.wasm`
- `src/client/public/doom-wasm/default.cfg`
- `src/client/public/doom-wasm/COPYING.md`
- `src/client/public/doom-wasm/README-cloudflare-doom-wasm.md`

Upstream projects:

- Chocolate Doom: https://github.com/chocolate-doom/chocolate-doom
- Cloudflare doom-wasm: https://github.com/cloudflare/doom-wasm
- Cloudflare doom-workers: https://github.com/cloudflare/doom-workers

Licensing:

- Chocolate Doom is distributed under the GNU GPL.
- Cloudflare doom-wasm states that Chocolate Doom and the WebAssembly port are distributed under the GNU GPL.
- The bundled GPL license text is kept at `src/client/public/doom-wasm/COPYING.md`.
- Cloudflare doom-workers is listed by GitHub as BSD-3-Clause licensed.

Current runtime artifact hashes:

```text
a2909044a9fbc5529f941c8dbf93cc2931927690e0341c737545cf0b9cff23fb  src/client/public/doom-wasm/websockets-doom.js
6366f83a58fe8596ce742a66dbf86871d315862c89c11e65b54935be03c7e6c4  src/client/public/doom-wasm/websockets-doom.wasm
80bc17bdc9077d2caeeb8b5345aa314faa119f6deb0dcb3c9f97851741277b2b  src/client/public/doom-wasm/default.cfg
aef8b4222b79d0dbf6bf17cfff71c90a6a6bb8917a4162abe417b469ed22da2e  src/client/public/doom-wasm/COPYING.md
```

Provenance status:

- These runtime files were imported during the DoomHub migration to doom-wasm from the npm package `@nicejsisverycool/tizendoom@0.1.6`.
- npm tarball: https://registry.npmjs.org/@nicejsisverycool/tizendoom/-/tizendoom-0.1.6.tgz
- npm integrity: `sha512-AclhnWFsUUXlIkO2txq1VV4iTyYzudMBkof0KqfZZoGDG9BBHmwBum2SWo/R/rx3agII/wbgYx6gIHdEyyBCag==`
- Package repository metadata points to https://github.com/nicejs-is-cool/tizendoom
- The package describes itself as "DOOM for Tizen (based on cloudflare/doom-wasm)".
- The package also contains `doom1.wad`; DoomHub did not import or bundle that WAD file.
- The exact upstream `cloudflare/doom-wasm` source commit and build environment used by that npm package to produce `websockets-doom.js` and `websockets-doom.wasm` are not documented in the package metadata.
- DoomHub accepts the npm package tarball and the hashes above as the recorded provenance for the bundled runtime artifacts.

Optional future cleanup:

1. Choose and record the exact `cloudflare/doom-wasm` commit.
2. Build `websockets-doom.js` and `websockets-doom.wasm` from that commit.
3. Replace the bundled runtime files.
4. Record the build command, toolchain version, source commit, and new SHA-256 hashes here.

## WAD Files

DoomHub does not include Doom IWAD or PWAD files. Operators must provide their own WAD files and are responsible for ensuring they have the right to distribute those files to browser clients.
