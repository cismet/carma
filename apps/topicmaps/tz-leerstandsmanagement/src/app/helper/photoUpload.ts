import { APP_CONFIG } from "../../config/appConfig";

interface FilesTarget {
  url: string;
  user: string;
  password: string;
}

let cachedTarget: FilesTarget | undefined;

async function loadFilesTarget(jwt: string): Promise<FilesTarget> {
  if (cachedTarget) return cachedTarget;
  const base = APP_CONFIG.restService.endsWith("/")
    ? APP_CONFIG.restService
    : APP_CONFIG.restService + "/";
  const response = await fetch(
    `${base}configattributes/${APP_CONFIG.filesConfigAttribute}`,
    { headers: { Authorization: "Bearer " + jwt } }
  );
  if (!response.ok) {
    throw new Error(`Upload-Ziel nicht verfügbar (HTTP ${response.status})`);
  }
  const json = await response.json();
  const raw = json[APP_CONFIG.filesConfigAttribute];
  // the server answers null for a valid login without the attribute
  if (!raw) {
    throw new Error(
      `Keine Berechtigung für den Foto-Upload (Konfigurationsattribut ${APP_CONFIG.filesConfigAttribute} fehlt)`
    );
  }
  const parsed = JSON.parse(raw) as FilesTarget;
  if (!parsed.url) throw new Error("Upload-Ziel ohne URL");
  cachedTarget = parsed;
  return parsed;
}

/**
 * Shrinks a phone photo to a web-friendly JPEG. Falls back to the original
 * file when the browser cannot decode it (rare formats, very old browsers).
 */
export async function compressImage(
  file: File,
  maxSide = 1600,
  quality = 0.82
): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    return blob ?? file;
  } catch (e) {
    console.warn("[LEERSTAND] image compression failed, uploading original", e);
    return file;
  }
}

const randomSuffix = () => Math.random().toString(36).slice(2, 8);

/** Uploads one photo via WebDAV PUT and returns its public URL. */
export async function uploadPhoto(jwt: string, blob: Blob): Promise<string> {
  const target = await loadFilesTarget(jwt);
  const name = `${Date.now()}-${randomSuffix()}.jpg`;
  const url = `${target.url.replace(/\/$/, "")}/${APP_CONFIG.photoFolder}/${name}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: "Basic " + btoa(`${target.user}:${target.password}`),
      "Content-Type": "image/jpeg",
    },
    body: blob,
  });
  if (!response.ok) {
    throw new Error(`Foto-Upload fehlgeschlagen (HTTP ${response.status})`);
  }
  return url;
}
