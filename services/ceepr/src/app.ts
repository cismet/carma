// app.ts
import express, { Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";

/**
 * Sets up the Express application with all routes and middleware
 * @param configDir Directory to store configuration files
 * @returns Configured Express application
 */
export function setupApp(configDir?: string): express.Express {
  const app = express();

  // Middleware to parse JSON bodies
  app.use(express.json());

  // Configuration storage directory
  const STORAGE_DIR = configDir ?? path.join(__dirname, "storage");

  // Ensure the storage directory exists
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }

  // Default route
  app.get("/", (req: Request, res: Response) => {
    res.send({
      message: "ceepr - Configuration Entry & Exchange Persistence Relay",
    });
  });

  // Store configuration endpoint with optional structure path
  app.post("/store/*?", (req: Request, res: Response) => {
    try {
      // Get the structure path from the URL
      const structurePath = req.path.replace(/^\/store\/?/, "");
      
      // Validate the request body
      const config = req.body;

      if (
        !config ||
        typeof config !== "object" ||
        Object.keys(config).length === 0
      ) {
        return res
          .status(400)
          .send({
            error: "Invalid configuration: must be a non-empty JSON object",
          });
      }

      // Generate a random key (16 characters)
      const randomKey = crypto.randomBytes(8).toString("hex");
      
      // Create the full directory path including the structure
      let fullDirPath = STORAGE_DIR;
      if (structurePath) {
        fullDirPath = path.join(STORAGE_DIR, structurePath);
        // Create the directory structure if it doesn't exist
        if (!fs.existsSync(fullDirPath)) {
          fs.mkdirSync(fullDirPath, { recursive: true });
        }
      }

      // Create the file path
      const filePath = path.join(fullDirPath, `${randomKey}.json`);

      // Write the configuration to a file
      fs.writeFileSync(filePath, JSON.stringify(config, null, 2));

      // Return the random key and structure path
      res.status(201).send({ 
        key: randomKey,
        path: structurePath || "/"
      });
    } catch (error) {
      console.error("Error storing configuration:", error);
      res.status(500).send({ error: "Failed to store configuration" });
    }
  });

  // Retrieve configuration endpoint with structure path
  app.get("/config/*/:key", (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      
      // Extract the structure path from the URL
      const pathParts = req.path.split('/');
      // Remove 'config' and the key from the path parts
      pathParts.shift(); // Remove empty string before first slash
      pathParts.shift(); // Remove 'config'
      pathParts.pop();   // Remove the key
      const structurePath = pathParts.join('/');

      // Validate the key format (hexadecimal string)
      if (!/^[0-9a-f]+$/.test(key)) {
        return res.status(400).send({ error: "Invalid key format" });
      }

      // Create the file path
      const filePath = path.join(STORAGE_DIR, structurePath, `${key}.json`);

      // Check if the configuration exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).send({ 
          error: "Configuration not found", 
          details: {
            requestedPath: structurePath,
            requestedKey: key,
            fullPath: filePath
          }
        });
      }

      // Read the configuration file
      const configData = fs.readFileSync(filePath, "utf-8");

      // Parse and return the configuration
      const config = JSON.parse(configData);
      res.send(config);
    } catch (error) {
      console.error("Error retrieving configuration:", error);
      res.status(500).send({ error: "Failed to retrieve configuration" });
    }
  });
  
  // Maintain backward compatibility with the original endpoint
  app.get("/config/:key", (req: Request, res: Response) => {
    try {
      const { key } = req.params;

      // Validate the key format (hexadecimal string)
      if (!/^[0-9a-f]+$/.test(key)) {
        return res.status(400).send({ error: "Invalid key format" });
      }

      // Create the file path
      const filePath = path.join(STORAGE_DIR, `${key}.json`);

      // Check if the configuration exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).send({ error: "Configuration not found" });
      }

      // Read the configuration file
      const configData = fs.readFileSync(filePath, "utf-8");

      // Parse and return the configuration
      const config = JSON.parse(configData);
      res.send(config);
    } catch (error) {
      console.error("Error retrieving configuration:", error);
      res.status(500).send({ error: "Failed to retrieve configuration" });
    }
  });

  // Custom error handling middleware for JSON parsing errors - must be after all routes
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && "body" in err) {
      return res.status(400).send({ error: "Invalid JSON format" });
    }
    next(err);
  });

  return app;
}
