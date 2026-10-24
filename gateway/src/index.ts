
import express, {
    type Request,
    type Response,
  } from "express";
  
  const app = express();
  
  // Configuración del API Gateway
  //const PORT = Number(process.env.GATEWAY_PORT ?? 6000);
  const PORT = Number(process.env.GATEWAY_PORT ?? 6001);
  
  const TAREAS_URL =
    process.env.TAREAS_URL ?? "http://localhost:5001";
  
  const NOTIFICACIONES_URL =
    process.env.NOTIFICACIONES_URL ?? "http://localhost:5002";
  
  app.use(express.json());
  
  
  // Información del API Gateway
  app.get("/", (_req: Request, res: Response) => {
    res.json({
      servicio: "api-gateway",
      arquitectura: "microservicios",
      estado: "activo",
      puerto: PORT,
    });
  });
  
  // Estado del propio Gateway
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      servicio: "api-gateway",
      estado: "ok",
    });
  });
  
  // Reenvía solicitudes HTTP al servicio correspondiente
  async function reenviar(
    req: Request,
    res: Response,
    destino: string,
  ): Promise<void> {
    try {
      const tieneCuerpo =
        req.method === "POST" || req.method === "PUT";
  
        const respuesta = await fetch(destino, {
            method: req.method,
          
            headers: tieneCuerpo
              ? { "Content-Type": "application/json" }
              : {},
          
            body: tieneCuerpo
              ? JSON.stringify(req.body ?? {})
              : null,
          
            signal: AbortSignal.timeout(5000),
          });
  
      // Respuesta sin contenido, por ejemplo DELETE exitoso
      if (respuesta.status === 204) {
        res.status(204).end();
        return;
      }
  
      const tipo = respuesta.headers.get("content-type");
  
      if (tipo) {
        res.setHeader("Content-Type", tipo);
      }
  
      const contenido = await respuesta.text();
  
      res.status(respuesta.status).send(contenido);
  
    } catch (error) {
      const expirado =
        error instanceof Error &&
        error.name === "TimeoutError";
  
      res.status(expirado ? 504 : 502).json({
        mensaje: expirado
          ? "Tiempo de espera agotado"
          : "Servicio de destino no disponible",
      });
    }
  }
  
  // Enrutamiento hacia el microservicio de tareas
  app.use("/api/tareas", (req: Request, res: Response) => {
    const permitidos = ["GET", "POST", "PUT", "DELETE"];
  
    if (!permitidos.includes(req.method)) {
      res.status(405).json({
        mensaje: "Método HTTP no permitido",
      });
      return;
    }
  
    const ruta = req.url === "/" ? "" : req.url;
  
    void reenviar(
      req,
      res,
      `${TAREAS_URL}/tasks${ruta}`,
    );
  });
  
  // Comprobación HTTP del servicio de notificaciones
  app.get(
    "/api/notificaciones/health",
    (req: Request, res: Response) => {
      void reenviar(
        req,
        res,
        `${NOTIFICACIONES_URL}/health`,
      );
    },
  );

  app.use(
    "/api/notificaciones",
    (req: Request, res: Response) => {
      const ruta = req.url === "/" ? "" : req.url;
  
      void reenviar(
        req,
        res,
        `${NOTIFICACIONES_URL}${ruta}`,
      );
    },
  );
  
  
  // Iniciar API Gateway
  app.listen(PORT, () => {
    console.log(
      `API Gateway iniciado en http://localhost:${PORT}`,
    );
    console.log(`Servicio de tareas: ${TAREAS_URL}`);
    console.log(
      `Servicio de notificaciones: ${NOTIFICACIONES_URL}`,
    );
  });
  