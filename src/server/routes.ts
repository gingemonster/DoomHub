import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppConfig } from "./config.js";
import { HttpError } from "./errors.js";
import type { RoomService } from "./rooms.js";
import { DoomRoomRouter } from "./wsRouter.js";

const doomRouter = new DoomRoomRouter();

export async function registerRoutes(app: FastifyInstance, rooms: RoomService, config: AppConfig): Promise<void> {
  app.get("/api/health", async () => ({
    ok: true,
    websocketUrl: websocketBaseUrl(config)
  }));

  app.get("/api/wads", async () => rooms.listWads());

  app.get<{ Params: { id: string } }>("/api/wads/:id/file", async (request, reply) => {
    await rooms.listWads();
    const wadPath = rooms.getWadFilePath(decodeURIComponent(request.params.id));
    return reply
      .type("application/octet-stream")
      .header("Content-Disposition", `inline; filename="${path.basename(wadPath).replaceAll("\"", "")}"`)
      .send(fs.createReadStream(wadPath));
  });

  app.get("/api/rooms", async () => rooms.listRooms());

  app.post("/api/rooms", async (request, reply) => {
    const result = await rooms.createRoom(request.body ?? {});
    return reply.code(201).send({
      room: result.room,
      hostToken: result.hostToken,
      url: `${config.publicBaseUrl.replace(/\/$/, "")}/r/${result.room.slug}`
    });
  });

  app.get<{ Params: { slug: string } }>("/api/rooms/:slug", async (request, reply) => {
    try {
      const slug = request.params.slug.toUpperCase();
      const room = rooms.getRoom(slug);
      return {
        room,
        launch: await rooms.getLaunchConfig(slug, hostTokenFromRequest(request), websocketRoomUrl(request, slug))
      };
    } catch (error) {
      if (error instanceof HttpError) {
        return reply.code(error.statusCode).send({ error: error.message });
      }
      throw error;
    }
  });

  app.post<{ Params: { slug: string } }>("/api/rooms/:slug/start", async (request) => {
    const slug = request.params.slug.toUpperCase();
    return { room: rooms.startRoom(slug, hostTokenFromRequest(request)) };
  });

  app.post<{ Params: { slug: string }; Body: { playerId?: string } }>("/api/rooms/:slug/heartbeat", async (request) => {
    const playerId = request.body?.playerId;
    if (!playerId) {
      throw new HttpError(400, "playerId is required.");
    }
    return rooms.heartbeat(request.params.slug.toUpperCase(), playerId);
  });

  app.get<{ Params: { slug: string } }>("/api/rooms/:slug/ws", { websocket: true }, (socket, request) => {
    const slug = request.params.slug.toUpperCase();
    rooms.getRoom(slug);
    doomRouter.attach(slug, socket);
  });
}

function hostTokenFromRequest(request: FastifyRequest): string | undefined {
  const token = request.headers["x-doomhub-host-token"];
  return Array.isArray(token) ? token[0] : token;
}

function websocketRoomUrl(request: FastifyRequest, slug: string): string {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const protocol = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) ?? (request.protocol === "https" ? "https" : "http");
  const wsProtocol = protocol === "https" ? "wss" : "ws";
  return `${wsProtocol}://${request.headers.host}/api/rooms/${slug}/ws`;
}

function websocketBaseUrl(config: AppConfig): string {
  const baseUrl = config.publicBaseUrl.replace(/^http/, "ws").replace(/\/$/, "");
  return `${baseUrl}/api/rooms/:slug/ws`;
}
