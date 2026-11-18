import { vi } from "vitest";

// Canvas rendering is covered in browser checks, outside jsdom hook tests.
vi.mock("@excalidraw/excalidraw", () => ({
  Excalidraw: () => null,
  getSceneVersion: () => 0,
}));

if (typeof window !== "undefined") {
  window.URL.createObjectURL ??= () => "";
  window.URL.revokeObjectURL ??= () => undefined;
}
