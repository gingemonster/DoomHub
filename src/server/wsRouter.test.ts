import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { DoomRoomRouter } from "./wsRouter.js";
import type { WebSocket } from "ws";

describe("DoomRoomRouter", () => {
  it("routes packets by Doom WebSocket address", () => {
    const router = new DoomRoomRouter();
    const server = new FakeSocket();
    const client = new FakeSocket();

    router.attach("ROOM", server as unknown as WebSocket);
    router.attach("ROOM", client as unknown as WebSocket);

    server.emitMessage(packet(0, 1, "server hello"));
    client.emitMessage(packet(1, 42, "client hello"));
    server.emitMessage(packet(42, 1, "to client"));

    expect(client.sent.map((item) => item.toString())).toContain(packet(42, 1, "to client").subarray(4).toString());
  });

  it("removes closed sessions", () => {
    const router = new DoomRoomRouter();
    const socket = new FakeSocket();

    router.attach("ROOM", socket as unknown as WebSocket);
    socket.emitMessage(packet(0, 1, "server hello"));
    expect(router.sessionCount("ROOM")).toBe(1);

    socket.emit("close");
    expect(router.sessionCount("ROOM")).toBe(0);
  });
});

class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = 1;
  readonly sent: Buffer[] = [];

  send(data: Buffer): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.emit("close");
  }

  emitMessage(data: Buffer): void {
    this.emit("message", data);
  }
}

function packet(to: number, from: number, payload: string): Buffer {
  const body = Buffer.from(payload);
  const buffer = Buffer.alloc(8 + body.byteLength);
  buffer.writeUInt32LE(to, 0);
  buffer.writeUInt32LE(from, 4);
  body.copy(buffer, 8);
  return buffer;
}
