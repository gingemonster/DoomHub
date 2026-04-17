import { spawn } from "node:child_process";

const children = new Set();
let shuttingDown = false;

const api = start("api", "npm", ["run", "dev:api"]);

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

function start(name, command, args) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
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
    console.error("[dev] Port 3000 is already in use. Stop the existing dev server before launching DoomHub.");
    shutdown(1);
  }
}

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of children) {
    child.kill("SIGTERM");
  }

  setTimeout(() => process.exit(code), 250);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
