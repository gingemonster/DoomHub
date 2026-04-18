import path from "node:path";
import fs from "node:fs";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import fastify from "fastify";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db.js";
import { HttpError } from "./errors.js";
import { registerRoutes } from "./routes.js";
import { RoomService } from "./rooms.js";

export async function buildServer() {
  const config = loadConfig();
  fs.mkdirSync(config.wadStoragePath, { recursive: true });
  const app = fastify({ logger: true });
  const db = openDatabase(config);
  const rooms = new RoomService(db, config);
  app.log.info("Using Doom WASM WebSocket router");

  await app.register(cors, { origin: true });
  await app.register(fastifyWebsocket, {
    options: {
      perMessageDeflate: false
    }
  });
  await registerRoutes(app, rooms, config);

  const clientDist = path.resolve("dist/client");
  if (fs.existsSync(clientDist)) {
    await app.register(fastifyStatic, {
      root: clientDist,
      prefix: "/"
    });
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.code(404).send({ error: "Not Found", message: "API route not found." });
    }
    if (fs.existsSync(clientDist)) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({ error: "Frontend build not found. Run npm run build:web or npm run dev:web." });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      request.log.info({ statusCode: error.statusCode, message: error.message }, "Handled request error");
      return reply.code(error.statusCode).send({ error: error.message });
    }
    request.log.error(error);
    return reply.code(500).send({ error: "Internal Server Error" });
  });

  return { app, config };
}

const startedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (startedDirectly) {
  const { app, config } = await buildServer();
  await app.listen({ port: config.port, host: config.host });
}
