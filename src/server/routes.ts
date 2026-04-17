import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import { HttpError } from "./errors.js";
import type { RoomService } from "./rooms.js";

export async function registerRoutes(app: FastifyInstance, rooms: RoomService, config: AppConfig): Promise<void> {
  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/wads", async () => rooms.listWads());

  app.get("/api/rooms", async () => rooms.listRooms());

  app.post("/api/rooms", async (request, reply) => {
    const room = rooms.createRoom(request.body ?? {});
    return reply.code(201).send({
      room,
      url: `${config.publicBaseUrl.replace(/\/$/, "")}/r/${room.slug}`
    });
  });

  app.get<{ Params: { slug: string } }>("/api/rooms/:slug", async (request, reply) => {
    try {
      const room = rooms.getRoom(request.params.slug.toUpperCase());
      return {
        room,
        launch: rooms.getLaunchConfig(room.slug)
      };
    } catch (error) {
      if (error instanceof HttpError) {
        return reply.code(error.statusCode).send({ error: error.message });
      }
      throw error;
    }
  });

  app.post<{ Params: { slug: string }; Body: { playerId?: string } }>("/api/rooms/:slug/heartbeat", async (request) => {
    const playerId = request.body?.playerId;
    if (!playerId) {
      throw new HttpError(400, "playerId is required.");
    }
    return rooms.heartbeat(request.params.slug.toUpperCase(), playerId);
  });

  app.get<{ Params: { slug: string } }>("/api/rooms/:slug/bundle/status", async (request, reply) => {
    try {
      const room = rooms.getRoom(request.params.slug.toUpperCase());
      const bundlePath = path.join(config.bundleStoragePath, `${room.wadId}.jsdos`);
      return {
        available: fs.existsSync(bundlePath),
        expectedPath: bundlePath
      };
    } catch (error) {
      if (error instanceof HttpError) {
        return reply.code(error.statusCode).send({ error: error.message });
      }
      throw error;
    }
  });

  app.get<{ Params: { slug: string } }>("/api/rooms/:slug/bundle", async (request, reply) => {
    const room = rooms.getRoom(request.params.slug.toUpperCase());
    const bundlePath = path.join(config.bundleStoragePath, `${room.wadId}.jsdos`);
    if (!fs.existsSync(bundlePath)) {
      return reply
        .code(501)
        .send({
          error: "Bundle not available",
          message: `Mount or generate ${bundlePath} to launch Doom. Room setup and IPX config are ready.`
        });
    }

    return reply.type("application/octet-stream").send(fs.createReadStream(bundlePath));
  });
}
