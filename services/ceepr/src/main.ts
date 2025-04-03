// main.ts
import { setupApp } from "./app";

const host = process.env.HOST ?? "localhost";
const port = process.env.PORT ? Number(process.env.PORT) : 3000;
const storageDir = process.env.STORAGE_DIR ?? `${__dirname}/storage`;

// Setup the Express application
const app = setupApp(storageDir);

// Start the server and capture the server instance
const server = app.listen(port, host, () => {
  console.log(`[ ready ] http://${host}:${port}`);
  console.log(`ceepr - Configuration Entry & Exchange Persistence Relay`);
  console.log(`Storing configurations in: ${storageDir}`);
});

// Graceful shutdown handler
function gracefulShutdown() {
  console.log("Received shutdown signal, closing server gracefully...");
  server.close(() => {
    console.log("Server closed. Exiting process.");
    process.exit(0);
  });

  // Force shutdown if connections don't close in time (10 seconds)
  setTimeout(() => {
    console.error("Could not close connections in time, forcing shutdown.");
    process.exit(1);
  }, 10000);
}

// Listen for termination signals
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
