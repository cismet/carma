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

export interface HighlightedFotoSource {
  url: string | undefined;
  highlight: unknown;
  color: string | undefined;
}

const SEPARATOR = "\n";

const toKey = ({ url, highlight, color }: HighlightedFotoSource) => {
  const boxKey = parseFotoHighlight(highlight)?.join(",");
  return url && boxKey ? `${url}|${boxKey}|${color ?? ""}` : "";
};

/**
 * Returns, per source, an object URL of the photo with its box highlighted,
 * undefined while rendering or without a valid box, and null when rendering
 * failed (callers then fall back to the plain photo). Used for the lightbox,
 * which can't take the SVG overlay of the preview.
 */
export const useHighlightedFotos = (
  sources: HighlightedFotoSource[]
): (string | null | undefined)[] => {
  // the sources are rebuilt on every render, so the effect runs on their keys
  const keys = sources.map(toKey);
  const keysKey = keys.join(SEPARATOR);
  const [results, setResults] = useState<Record<string, string | null>>({});

  useEffect(() => {
    const pending = [...new Set(keysKey.split(SEPARATOR))].filter(Boolean);
    if (pending.length === 0) {
      return;
    }
    let cancelled = false;
    const objectUrls: string[] = [];

    pending.forEach((key) => {
      // box and color never contain "|", the url might
      const parts = key.split("|");
      const color = parts.pop();
      const boxKey = parts.pop() ?? "";
      const url = parts.join("|");
      const box = boxKey.split(",").map(Number) as Box;
      renderHighlightedFoto(url, box, color || DEFAULT_HIGHLIGHT_COLOR)
        .then((highlightedUrl) => {
          if (cancelled) {
            URL.revokeObjectURL(highlightedUrl);
            return;
          }
          objectUrls.push(highlightedUrl);
          setResults((prev) => ({ ...prev, [key]: highlightedUrl }));
        })
        .catch((error) => {
          console.warn("[FOTO HIGHLIGHT]", error);
          if (!cancelled) {
            setResults((prev) => ({ ...prev, [key]: null }));
          }
        });
    });

    return () => {
      cancelled = true;
      objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
      setResults({});
    };
  }, [keysKey]);

  return keys.map((key) => (key ? results[key] : undefined));
};

/**
 * Single-photo form of useHighlightedFotos: the object URL of the boxed copy,
 * or undefined while rendering, without a valid box or when rendering failed.
 */
export const useHighlightedFoto = (
  url: string | undefined,
  highlight: unknown,
  color: string | undefined
): string | undefined =>
  useHighlightedFotos([{ url, highlight, color }])[0] ?? undefined;
