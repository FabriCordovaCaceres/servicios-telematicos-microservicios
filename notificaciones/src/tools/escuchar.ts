import { WebSocket } from "ws";

// Herramienta de prueba: se conecta a un servidor WebSocket e imprime
// cada mensaje que llega. Sirve para comprobar el tiempo real desde una
// VM sin navegador.
//
// Uso:  npm run escuchar -- ws://192.168.56.12:5002/ws
const url = process.argv[2] ?? "ws://localhost:5002/ws";

console.log(`Conectando a ${url} ...`);

const socket = new WebSocket(url);

socket.on("open", () => {
  console.log("Conectado. Esperando eventos (Ctrl+C para salir)...");
});

socket.on("message", (datos) => {
  const hora = new Date().toLocaleTimeString();
  console.log(`[${hora}] ${datos.toString()}`);
});

socket.on("close", () => {
  console.log("Conexión cerrada.");
  process.exit(0);
});

socket.on("error", (error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
