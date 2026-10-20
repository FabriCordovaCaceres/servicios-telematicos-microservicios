import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

const INTERVALO_LATIDO_MS = 15_000;

export interface CanalTiempoReal {
  // Envía un mensaje a todos los clientes conectados. Devuelve cuántos lo recibieron.
  difundir: (mensaje: object) => number;
  // Cantidad de clientes conectados en este momento
  conectados: () => number;
}

// Canal WebSocket del microservicio de notificaciones (RQ9).
// Los clientes se conectan a ws://<servidor>:5002/ws
export function iniciarWebSocket(server: Server): CanalTiempoReal {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const vivos = new WeakSet<WebSocket>();

  wss.on("connection", (socket) => {
    vivos.add(socket);

    socket.on("pong", () => {
      vivos.add(socket);
    });

    socket.on("error", (error) => {
      console.error(`Error en un cliente WebSocket: ${error.message}`);
    });

    socket.on("close", () => {
      console.log(`Cliente desconectado. Conectados: ${wss.clients.size}`);
    });

    socket.send(
      JSON.stringify({
        tipo: "conexion",
        mensaje: "Conectado al servicio de notificaciones",
        enviadoEn: Date.now(),
      }),
    );

    console.log(`Cliente conectado. Conectados: ${wss.clients.size}`);
  });

  const latido = setInterval(() => {
    for (const socket of wss.clients) {
      if (!vivos.has(socket)) {
        socket.terminate();
        continue;
      }
      vivos.delete(socket);
      socket.ping();
    }
  }, INTERVALO_LATIDO_MS);

  wss.on("close", () => {
    clearInterval(latido);
  });

  return {
    difundir: (mensaje) => {
      const texto = JSON.stringify(mensaje);
      let enviados = 0;

      for (const socket of wss.clients) {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(texto);
          enviados += 1;
        }
      }

      return enviados;
    },
    conectados: () => wss.clients.size,
  };
}
