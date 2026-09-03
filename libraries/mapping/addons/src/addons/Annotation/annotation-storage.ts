import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types/types";

import type { AnnotationAnchor } from "./types";

const VERSION = 1;

export type StoredDrawing = {
  id: string;
  locked: boolean;
  /** the zoom band this drawing owns; missing in files written before bands */
  band?: number;
  anchor: AnnotationAnchor;
  elements: readonly ExcalidrawElement[];
  files?: BinaryFiles;
};

type StoredFile = {
  version: number;
  /** the map zoom band 0 begins at; see `annotation-zoom-bands` */
  origin?: number;
  drawings: StoredDrawing[];
};

export type StoredAnnotations = {
  origin?: number;
  drawings: StoredDrawing[];
};

const isAnchor = (value: unknown): value is AnnotationAnchor => {
  const anchor = value as AnnotationAnchor | null;
  return (
    !!anchor &&
    typeof anchor.lng === "number" &&
    typeof anchor.lat === "number" &&
    typeof anchor.zoom === "number"
  );
};

const isDrawing = (value: unknown): value is StoredDrawing => {
  const drawing = value as StoredDrawing | null;
  return (
    !!drawing &&
    typeof drawing.id === "string" &&
    typeof drawing.locked === "boolean" &&
    isAnchor(drawing.anchor) &&
    (drawing.band === undefined || typeof drawing.band === "number") &&
    Array.isArray(drawing.elements)
  );
};

export const readAnnotations = (key?: string): StoredAnnotations => {
  const empty: StoredAnnotations = { drawings: [] };
  if (!key || typeof localStorage === "undefined") {
    return empty;
  }
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return empty;
    }
    const parsed = JSON.parse(raw) as StoredFile;
    if (parsed?.version !== VERSION || !Array.isArray(parsed.drawings)) {
      return empty;
    }
    return {
      origin: typeof parsed.origin === "number" ? parsed.origin : undefined,
      drawings: parsed.drawings.filter(isDrawing),
    };
  } catch {
    return empty;
  }
};

export const readDrawings = (key?: string): StoredDrawing[] =>
  readAnnotations(key).drawings;

export const writeDrawings = (
  key: string | undefined,
  drawings: StoredDrawing[],
  origin?: number
) => {
  if (!key || typeof localStorage === "undefined") {
    return;
  }
  const kept = drawings.filter((drawing) => drawing.elements.length > 0);
  try {
    if (kept.length === 0) {
      localStorage.removeItem(key);
      return;
    }
    const file: StoredFile = { version: VERSION, origin, drawings: kept };
    localStorage.setItem(key, JSON.stringify(file));
  } catch {
    return;
  }
};

export const highestIdSequence = (drawings: StoredDrawing[]): number =>
  drawings.reduce((highest, drawing) => {
    const match = /(\d+)$/.exec(drawing.id);
    const value = match ? Number(match[1]) : 0;
    return value > highest ? value : highest;
  }, 0);
