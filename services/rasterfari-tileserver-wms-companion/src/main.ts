// main.ts
import express, { Request, Response } from "express";
// import version from "./version.json";
// console.log(`Starting rasterfari-tileserver-wms-companion v${version}`);

const host = process.env.HOST ?? "localhost";
const port = process.env.PORT ? Number(process.env.PORT) : 3000;
const app = express();

// Default route
app.get("/", (req: Request, res: Response) => {
  res.send({ message: "Hello rasterfari-tileserver-wms-companion" });
});

// Configurable constants for the image URL
const BASE_URL = "https://tsgl4printing.cismet.de/styles";
const IMAGE_FORMAT = "png"; // e.g., 'png', 'jpg', etc.

// WMS-like endpoint
app.get(
  "/tgl-wms/:scalefactor/:sizefactor?",
  async (req: Request, res: Response) => {
    const { BBOX, WIDTH, HEIGHT, REQUEST, LAYERS } = req.query;
    const { scalefactor, sizefactor } = req.params;

    if (!BBOX || !WIDTH || !HEIGHT || !REQUEST || !LAYERS) {
      return res.status(400).send("Missing required parameters.");
    }

    const styleId = LAYERS.toString();
    let SCALE_FACTOR = "";
    if (scalefactor === "1x") {
      SCALE_FACTOR = "";
    } else {
      const numericScaleFactor = parseFloat(scalefactor);
      if (isNaN(numericScaleFactor) || numericScaleFactor <= 0) {
        return res.status(400).send("Invalid scale factor.");
      }
      SCALE_FACTOR = `@${numericScaleFactor}x`;
    }

    let factor = 1;
    if (sizefactor) {
      factor = parseFloat(sizefactor);
      if (isNaN(factor) || factor <= 0) {
        return res.status(400).send("Invalid size factor.");
      }
    }

    const adjustedWidth = Math.round(Number(WIDTH) * factor);
    const adjustedHeight = Math.round(Number(HEIGHT) * factor);

    const bboxStr = BBOX.toString();
    const bboxCleaned = bboxStr.replace(/,/g, ",");

    const sizeString = `${adjustedWidth}x${adjustedHeight}${SCALE_FACTOR}.${IMAGE_FORMAT}`;
    const imageUrl = `${BASE_URL}/${styleId}/static/raw/${bboxCleaned}/${sizeString}?padding=0.0`;

    try {
      // Use the built-in fetch API (Node 18+ supports global fetch)
      const response = await fetch(imageUrl);
      if (!response.ok) {
        return res.status(500).send("Failed to fetch image.");
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      res.set("Content-Type", `image/${IMAGE_FORMAT}`);
      res.send(buffer);
    } catch (error) {
      console.error("Error fetching image:", error);
      res.status(500).send("Server error.");
    }
  }
);

// Start the server and capture the server instance
const server = app.listen(port, host, () => {
  console.log(`[ ready ] http://${host}:${port}`);
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
