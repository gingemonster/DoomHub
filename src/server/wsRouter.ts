import type { RawData, WebSocket } from "ws";

interface Session {
  from: number;
  socket: WebSocket;
}

export class DoomRoomRouter {
  private readonly sessions = new Map<string, Session[]>();

  attach(room: string, socket: WebSocket): void {
    const sessions = this.sessionsFor(room);

    socket.on("message", (message) => {
      const packet = toBuffer(message);
      if (!packet || packet.byteLength < 8) {
        return;
      }

      const to = packet.readUInt32LE(0);
      const from = packet.readUInt32LE(4);

      if (from === 1 && to === 0) {
        for (const session of sessions) {
          if (session.socket !== socket) {
            session.socket.close(1011, "server restarted");
          }
        }
        sessions.splice(0, sessions.length);
      }

      if (!sessions.some((session) => session.from === from)) {
        sessions.push({ from, socket });
      }

      const target = sessions.find((session) => session.from === to);
      if (target && target.socket.readyState === 1) {
        target.socket.send(packet.subarray(4));
      }
    });

    const remove = () => {
      const index = sessions.findIndex((session) => session.socket === socket);
      if (index !== -1) {
        sessions.splice(index, 1);
      }
      if (sessions.length === 0) {
        this.sessions.delete(room);
      }
    };

    socket.on("close", remove);
    socket.on("error", remove);
  }

  sessionCount(room: string): number {
    return this.sessionsFor(room).length;
  }

  private sessionsFor(room: string): Session[] {
    const existing = this.sessions.get(room);
    if (existing) {
      return existing;
    }
    const created: Session[] = [];
    this.sessions.set(room, created);
    return created;
  }
}

function toBuffer(message: RawData): Buffer | null {
  if (Buffer.isBuffer(message)) {
    return message;
  }
  if (message instanceof ArrayBuffer) {
    return Buffer.from(message);
  }
  if (Array.isArray(message)) {
    return Buffer.concat(message);
  }
  return null;
}
