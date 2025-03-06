// main.ts
import express, { Request, Response } from "express";

const host = process.env.HOST ?? "localhost";
const port = process.env.PORT ? Number(process.env.PORT) : 3000;
const app = express();

// Default route (can be kept or removed as needed)
app.get("/", (req: Request, res: Response) => {
  res.send({ message: "Hello API" });
});

// Configurable constants for the image URL
const BASE_URL = "https://tsgl4printing.cismet.de/styles";
const IMAGE_FORMAT = "png"; // can be 'png', 'jpg', etc.

// New endpoint converted from the old index.js
app.get(
  "/tgl-wms/:scalefactor/:sizefactor?",
  async (req: Request, res: Response) => {
    // Extract query parameters (they come as strings or string arrays, so we cast them to string)
    const { BBOX, WIDTH, HEIGHT, REQUEST, LAYERS } = req.query;
    const { scalefactor, sizefactor } = req.params;

    // Validate required query parameters
    if (!BBOX || !WIDTH || !HEIGHT || !REQUEST || !LAYERS) {
      return res.status(400).send("Missing required parameters.");
    }

    // Convert LAYERS to string for the STYLE_ID
    const styleId = LAYERS.toString();

    // Determine the scale factor string based on the provided parameter
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

    // Parse and validate the optional size factor (defaults to 1)
    let factor = 1;
    if (sizefactor) {
      factor = parseFloat(sizefactor);
      if (isNaN(factor) || factor <= 0) {
        return res.status(400).send("Invalid size factor.");
      }
    }

    // Adjust WIDTH and HEIGHT based on the size factor
    const adjustedWidth = Math.round(Number(WIDTH) * factor);
    const adjustedHeight = Math.round(Number(HEIGHT) * factor);

    // Clean up the BBOX parameter (this replacement is a no-op, but kept for consistency)
    const bboxStr = BBOX.toString();
    const bboxCleaned = bboxStr.replace(/,/g, ",");

    // Construct the image URL
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

      // Set the appropriate content type and send the image buffer
      res.set("Content-Type", `image/${IMAGE_FORMAT}`);
      res.send(buffer);
    } catch (error) {
      console.error("Error fetching image:", error);
      res.status(500).send("Server error.");
    }
  }
);

app.listen(port, host, () => {
  console.log(`[ ready ] http://${host}:${port}`);
});
