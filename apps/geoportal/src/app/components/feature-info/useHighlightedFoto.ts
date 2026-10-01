import { useEffect, useState } from "react";

type Box = [number, number, number, number];

const DEFAULT_HIGHLIGHT_COLOR = "#3A7CEB";
const DIM_COLOR = "rgba(0, 0, 0, 0.45)";

// Accepts [xmin, ymin, xmax, ymax] or a WKT polygon in pixel coordinates of
// the photo (e.g. geom_img of the crack detection) and returns its bbox.
export const parseFotoHighlight = (value: unknown): Box | undefined => {
  let nums: number[] = [];
  if (Array.isArray(value)) {
    nums = value.map(Number);
  } else if (typeof value === "string") {
    nums = (value.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  }
  if (nums.length < 4 || nums.some((n) => !Number.isFinite(n))) {
    return undefined;
  }
  const xs = nums.filter((_, i) => i % 2 === 0);
  const ys = nums.filter((_, i) => i % 2 === 1);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

// Draws the photo on a canvas, dims everything outside the box and outlines
// the box. Needs CORS on the photo server, otherwise the canvas is tainted.
const renderHighlightedFoto = (
  url: string,
  box: Box,
  color: string
): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("no 2d context"));
        return;
      }
      ctx.drawImage(img, 0, 0);

      // scale with the photo so the outline stays visible in the small preview
      const lineWidth = Math.max(3, Math.round(canvas.width / 300));
      const pad = lineWidth * 2;
      const x = box[0] - pad;
      const y = box[1] - pad;
      const w = box[2] - box[0] + 2 * pad;
      const h = box[3] - box[1] + 2 * pad;

      ctx.fillStyle = DIM_COLOR;
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, canvas.height);
      ctx.rect(x, y, w, h);
      ctx.fill("evenodd");

      // white halo below the coloured outline, readable on dark asphalt too
      ctx.lineWidth = lineWidth * 2;
      ctx.strokeStyle = "white";
      ctx.strokeRect(x, y, w, h);
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = color;
      ctx.strokeRect(x, y, w, h);

      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(URL.createObjectURL(blob))
            : reject(new Error("toBlob failed")),
        "image/jpeg",
        0.9
      );
    };
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });

/**
 * Returns an object URL of the photo with the given box highlighted, or
 * undefined while rendering, without a valid box or when rendering fails
 * (callers then fall back to the plain photo). Used for the lightbox, which
 * can't take the SVG overlay of the preview.
 */
export const useHighlightedFoto = (
  url: string | undefined,
  highlight: unknown,
  color: string | undefined
): string | undefined => {
  const boxKey = parseFotoHighlight(highlight)?.join(",");
  const key = url && boxKey ? `${url}|${boxKey}|${color ?? ""}` : undefined;
  const [result, setResult] = useState<{ key: string; url: string }>();

  useEffect(() => {
    if (!url || !boxKey || !key) {
      return;
    }
    const box = boxKey.split(",").map(Number) as Box;
    let cancelled = false;
    let objectUrl: string | undefined;

    renderHighlightedFoto(url, box, color || DEFAULT_HIGHLIGHT_COLOR)
      .then((highlightedUrl) => {
        if (cancelled) {
          URL.revokeObjectURL(highlightedUrl);
          return;
        }
        objectUrl = highlightedUrl;
        setResult({ key, url: highlightedUrl });
      })
      .catch((error) => {
        console.warn("[FOTO HIGHLIGHT]", error);
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [url, boxKey, color, key]);

  return result && key && result.key === key ? result.url : undefined;
};
