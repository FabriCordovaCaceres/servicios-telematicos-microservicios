import path from "node:path";
import { createServer } from "node:http";
import express from "express";
import { iniciarWebSocket } from "./websocket";

const app = express();
const PORT = Number(process.env.PORT ?? 5002);

const TIPOS_VALIDOS = [
  "tarea:creada",
  "tarea:actualizada",
  "tarea:eliminada",
];

// El servidor HTTP se crea primero para poder compartirlo con el WebSocket
const server = createServer(app);
const canal = iniciarWebSocket(server);

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    arquitectura: "microservicios",
    servicio: "notificaciones",
    puerto: PORT,
    estado: "activo",
  });
});

app.get("/health", (_req, res) => {
  res.json({
    servicio: "notificaciones",
    estado: "ok",
    clientesConectados: canal.conectados(),
  });
});

// Página de demostración: http://<servidor>:5002/demo/
app.use("/demo", express.static(path.join(__dirname, "..", "public")));

// Endpoint interno: el servicio de tareas envía aquí cada cambio y este
// servicio lo difunde por WebSocket a los clientes conectados.
app.post("/eventos", (req, res) => {
  const cuerpo: unknown = req.body;

  if (
    typeof cuerpo !== "object" ||
    cuerpo === null ||
    !("tipo" in cuerpo) ||
    typeof cuerpo.tipo !== "string" ||
    !TIPOS_VALIDOS.includes(cuerpo.tipo)
  ) {
    return res.status(400).json({
      mensaje: "Evento inválido",
    });
  }

  const enviados = canal.difundir(cuerpo);

  return res.status(202).json({
    mensaje: "Evento recibido",
    clientesAlcanzados: enviados,
  });
});

server.listen(PORT, () => {
  console.log(
    `Microservicio de notificaciones iniciado en http://localhost:${PORT}`,
  );
});
