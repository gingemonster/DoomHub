import { spawn, spawnSync } from "node:child_process";

const children = new Set();
let shuttingDown = false;
let startedIpx = false;

if (process.env.DEV_USE_LOCAL_IPX !== "false") {
  ensureLocalIpxRelay();
}

const api = start("api", "npm", ["run", "dev:api"], {
  ...process.env,
  IPX_WSS_URL: process.env.IPX_WSS_URL ?? "ws://localhost:1900/ipx"
});

api.stdout.on("data", (chunk) => {
  if (chunk.toString().includes("Server listening")) {
    startWebOnce();
  }
});
api.stderr.on("data", stopOnAddressInUse);
api.stdout.on("data", stopOnAddressInUse);

api.on("exit", (code, signal) => {
  if (!shuttingDown) {
    console.error(`[api] exited with ${signal ?? code}`);
    shutdown(code || 1);
  }
});

let webStarted = false;
function startWebOnce() {
  if (webStarted || shuttingDown) {
    return;
  }

  webStarted = true;
  const web = start("web", "npm", ["run", "dev:web"]);
  web.on("exit", (code, signal) => {
    if (!shuttingDown) {
      console.error(`[web] exited with ${signal ?? code}`);
      shutdown(code || 1);
    }
  });
}

function start(name, command, args, env = process.env) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env,
    stdio: ["inherit", "pipe", "pipe"]
  });

  children.add(child);
  child.on("exit", () => children.delete(child));
  child.stdout.on("data", (chunk) => writePrefixed(name, chunk));
  child.stderr.on("data", (chunk) => writePrefixed(name, chunk));
  return child;
}

function writePrefixed(name, chunk) {
  const lines = chunk.toString().split(/\r?\n/);
  for (const line of lines) {
    if (line.length > 0) {
      console.log(`[${name}] ${line}`);
    }
  }
}

function stopOnAddressInUse(chunk) {
  if (chunk.toString().includes("EADDRINUSE")) {
    console.error("[dev] A required port is already in use. Stop the existing dev server before launching DoomHub.");
    shutdown(1);
  }
}

function ensureLocalIpxRelay() {
  console.log("[ipx] Starting local js-dos IPX relay on ws://localhost:1900/ipx/<room>");
  const result = spawnSync("docker", ["compose", "up", "-d", "--build", "ipx"], {
    cwd: process.cwd(),
    stdio: "inherit"
  });

  if (result.status !== 0) {
    console.error("[ipx] Could not start the local IPX relay. Start Docker Desktop or set DEV_USE_LOCAL_IPX=false.");
    process.exit(result.status ?? 1);
  }

  startedIpx = true;
}

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of children) {
    child.kill("SIGTERM");
  }

  if (startedIpx && process.env.DEV_KEEP_IPX !== "true") {
    spawnSync("docker", ["compose", "stop", "ipx"], {
      cwd: process.cwd(),
      stdio: "ignore"
    });
  }

  setTimeout(() => process.exit(code), 250);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
