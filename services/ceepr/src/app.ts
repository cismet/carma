// app.ts
import express, { Request, Response, NextFunction } from "express";
import fs, { readFileSync } from "fs";
import path from "path";
import crypto from "crypto";
import cors from "cors";
/**
 * Sets up the Express application with all routes and middleware
 * @param configDir Directory to store configuration files
 * @returns Configured Express application
 */
export function setupApp(configDir?: string): express.Express {
  const app = express();

  // Configure CORS
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",")
    : [];
  console.log(
    `CORS allowed origins: ${
      allowedOrigins.length ? allowedOrigins.join(", ") : "none"
    }`
  );

  // Setup CORS middleware
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, etc)
        if (!origin) return callback(null, true);

        // Check if the origin is in the allowed list or if wildcard is enabled
        if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        // If not allowed
        callback(new Error("CORS not allowed"));
      },
      credentials: true,
      optionsSuccessStatus: 200,
    })
  );

  // Middleware to parse JSON bodies
  app.use(express.json());

  // Configuration storage directory
  const STORAGE_DIR = configDir ?? path.join(__dirname, "storage");

  // Ensure the storage directory exists
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }

  // Serve static files from the assets directory - try multiple possible locations
  const possibleAssetPaths = [
    path.join(__dirname, "assets"), // For production build
    path.join(__dirname, "../assets"), // Alternative production path
    path.join(process.cwd(), "services/ceepr/src/assets"), // For development
  ];

  // Use the first path that exists
  for (const assetPath of possibleAssetPaths) {
    if (fs.existsSync(assetPath)) {
      app.use(express.static(assetPath));
      console.log(`Serving static files from: ${assetPath}`);
      break;
    }
  }

  // Default route
  app.get("/", (req: Request, res: Response) => {
    res.send({
      message: "ceepr - Configuration Entry & Exchange Persistence Relay",
    });
  });

  // Serve robots.txt from the root directory
  app.get("/robots.txt", (req: Request, res: Response) => {
    try {
      // The robots.txt file should now be in the root directory of the build
      const robotsPath = path.join(__dirname, "../robots.txt");

      if (fs.existsSync(robotsPath)) {
        const content = fs.readFileSync(robotsPath, "utf-8");
        res.type("text/plain");
        res.send(content);
        console.log(`Served robots.txt from ${robotsPath}`);
      } else {
        console.error(`robots.txt file not found at ${robotsPath}`);
        res.status(404).send("Not found");
      }
    } catch (error) {
      console.error("Error serving robots.txt:", error);
      res.status(500).send("Server error");
    }
  });

  // Edit tokens. A configuration stored with one can later be replaced under
  // the same key by whoever holds the token, so a link handed out once keeps
  // working after the content changes (a pm-show show and its phone link).
  // Only the token's sha256 is kept, in a sidecar next to the configuration
  // that the read routes never serve. Configurations stored without a token,
  // which is every share link, stay immutable.
  const EDIT_TOKEN_HEADER = "x-ceepr-edit-token";
  const EDIT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;
  const INVALID_TOKEN_MESSAGE = `Invalid ${EDIT_TOKEN_HEADER}: 16 to 256 characters of A-Z, a-z, 0-9, _ and -`;

  const hashEditToken = (token: string): Buffer =>
    crypto.createHash("sha256").update(token).digest();

  /** undefined when the header is absent, null when it is unusable */
  const editTokenOf = (req: Request): string | null | undefined => {
    const raw = req.get(EDIT_TOKEN_HEADER);
    if (raw === undefined) {
      return undefined;
    }
    return EDIT_TOKEN_PATTERN.test(raw) ? raw : null;
  };

  const isNonEmptyObject = (value: unknown): boolean =>
    Boolean(value) &&
    typeof value === "object" &&
    Object.keys(value as object).length > 0;

  // Store configuration endpoint with optional structure path. "/store/*?"
  // alone never matched a bare /store, so the root gets its own entry.
  app.post(["/store", "/store/*"], (req: Request, res: Response) => {
    try {
      // Get the structure path from the URL
      const structurePath = req.path.replace(/^\/store\/?/, "");
      // Validate the request body
      const config = req.body;

      if (!isNonEmptyObject(config)) {
        return res.status(400).send({
          error: "Invalid configuration: must be a non-empty JSON object",
        });
      }

      const editToken = editTokenOf(req);
      if (editToken === null) {
        return res.status(400).send({ error: INVALID_TOKEN_MESSAGE });
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

      if (editToken) {
        fs.writeFileSync(
          path.join(fullDirPath, `${randomKey}.edit`),
          hashEditToken(editToken).toString("hex")
        );
      }

      // Return the random key and structure path
      res.status(201).send({
        key: randomKey,
        path: structurePath || "/",
      });
    } catch (error) {
      console.error("Error storing configuration:", error);
      res.status(500).send({ error: "Failed to store configuration" });
    }
  });

  // Replace a configuration that was stored with an edit token
  app.put("/store/*/:key", (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      if (!/^[0-9a-f]+$/.test(key)) {
        return res.status(400).send({ error: "Invalid key format" });
      }

      const editToken = editTokenOf(req);
      if (!editToken) {
        return res.status(401).send({ error: INVALID_TOKEN_MESSAGE });
      }

      const config = req.body;
      if (!isNonEmptyObject(config)) {
        return res.status(400).send({
          error: "Invalid configuration: must be a non-empty JSON object",
        });
      }

      // everything between "store" and the key
      const pathParts = req.path.split("/").slice(2, -1);
      const structurePath = pathParts.join("/");
      const storageRoot = path.resolve(STORAGE_DIR);
      const dirPath = path.resolve(storageRoot, structurePath);
      if (dirPath !== storageRoot && !dirPath.startsWith(storageRoot + path.sep)) {
        return res.status(400).send({ error: "Invalid path" });
      }

      const filePath = path.join(dirPath, `${key}.json`);
      const tokenPath = path.join(dirPath, `${key}.edit`);
      if (!fs.existsSync(filePath)) {
        return res.status(404).send({ error: "Configuration not found" });
      }
      if (!fs.existsSync(tokenPath)) {
        return res
          .status(403)
          .send({ error: "This configuration cannot be changed" });
      }

      const stored = Buffer.from(
        fs.readFileSync(tokenPath, "utf-8").trim(),
        "hex"
      );
      const given = hashEditToken(editToken);
      if (stored.length !== given.length || !crypto.timingSafeEqual(stored, given)) {
        return res.status(403).send({ error: "Wrong edit token" });
      }

      // written aside and renamed, so a read never sees half a file
      const tempPath = `${filePath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(config, null, 2));
      fs.renameSync(tempPath, filePath);

      res.status(200).send({ key, path: structurePath || "/" });
    } catch (error) {
      console.error("Error replacing configuration:", error);
      res.status(500).send({ error: "Failed to replace configuration" });
    }
  });

  // Retrieve configuration endpoint with structure path
  app.get("/config/*/:key", (req: Request, res: Response) => {
    try {
      const { key } = req.params;

      // Extract the structure path from the URL
      const pathParts = req.path.split("/");
      // Remove 'config' and the key from the path parts
      pathParts.shift(); // Remove empty string before first slash
      pathParts.shift(); // Remove 'config'
      pathParts.pop(); // Remove the key
      const structurePath = pathParts.join("/");

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
            fullPath: filePath,
          },
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
