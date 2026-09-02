import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";

import type { AnnotationAnchor } from "./types";

const VERSION = 1;

export type StoredDrawing = {
  id: string;
  locked: boolean;
  anchor: AnnotationAnchor;
  elements: readonly ExcalidrawElement[];
};

type StoredFile = {
  version: number;
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
    Array.isArray(drawing.elements)
  );
};

export const readDrawings = (key?: string): StoredDrawing[] => {
  if (!key || typeof localStorage === "undefined") {
    return [];
  }
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as StoredFile;
    if (parsed?.version !== VERSION || !Array.isArray(parsed.drawings)) {
      return [];
    }
    return parsed.drawings.filter(isDrawing);
  } catch {
    return [];
  }
};

export const writeDrawings = (
  key: string | undefined,
  drawings: StoredDrawing[]
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
    const file: StoredFile = { version: VERSION, drawings: kept };
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
