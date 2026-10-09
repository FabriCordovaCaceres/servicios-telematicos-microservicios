import express from "express";
import taskRoutes from "./routes/task.routes";

const app = express();

const PORT = Number(process.env.PORT ?? 5001);

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    arquitectura: "microservicios",
    servicio: "tareas",
    puerto: PORT,
    estado: "activo",
  });
});

app.get("/health", (_req, res) => {
  res.json({
    servicio: "tareas",
    estado: "ok",
  });
});

app.use("/tasks", taskRoutes);

app.listen(PORT, () => {
  console.log(
    `Microservicio de tareas iniciado en http://localhost:${PORT}`,
  );
});
