import type { ImageLevelPlan, ImageRect } from "../core/image-level-plan";
import type { ImageLevelReadiness } from "./image-level-stack";

export type ImageLevelDiagramPlan = Pick<
  ImageLevelPlan,
  "target" | "underlay" | "floor" | "finer"
>;
export const IMAGE_LEVEL_STATE_COLORS = [
  "#303844",
  "#f5cd66",
  "#6da8ff",
  "#71e390",
] as const;

/** The compact tile-readiness diagram shared by the viewer stories and pool diagnostics. */
export const drawImageLevelReadiness = (
  host: HTMLElement,
  canvases: Map<number, HTMLCanvasElement>,
  level: ImageLevelReadiness,
  plan: ImageLevelDiagramPlan | null,
  area: ImageRect | null,
  native: { width: number; height: number } | null
) => {
  let view = canvases.get(level.level);
  if (!view) {
    view = host.ownerDocument.createElement("canvas");
    const scale = 48 / Math.max(level.width, level.height);
    view.width = Math.max(1, Math.round(level.width * scale));
    view.height = Math.max(1, Math.round(level.height * scale));
    Object.assign(view.style, {
      border: "1px solid #5a6678",
      borderRadius: "3px",
      flexShrink: "0",
    });
    view.dataset.testId = `image-pyramid-level-${level.level}`;
    canvases.set(level.level, view);
    const ordered = [...canvases.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, canvas]) => canvas);
    host.replaceChildren(...ordered);
  }
  const context = view.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, view.width, view.height);
  const sx = view.width / level.width,
    sy = view.height / level.height;
  const tileWidth = level.tileWidth ?? level.width / level.cols,
    tileHeight = level.tileHeight ?? level.height / level.rows;
  for (let i = 0; i < level.states.length; i++) {
    const x = (i % level.cols) * tileWidth;
    const y = Math.floor(i / level.cols) * tileHeight;
    context.fillStyle = IMAGE_LEVEL_STATE_COLORS[level.states[i]];
    context.fillRect(
      x * sx,
      y * sy,
      Math.max(0, Math.min(tileWidth, level.width - x) * sx - 0.4),
      Math.max(0, Math.min(tileHeight, level.height - y) * sy - 0.4)
    );
  }
  const role =
    level.level === plan?.target
      ? "Ziel"
      : level.level === plan?.underlay
      ? "Unterlage"
      : level.level === plan?.floor
      ? "Boden"
      : level.level === plan?.finer
      ? "Feiner"
      : "";
  view.style.borderColor = level.level === plan?.target ? "#60caff" : "#5a6678";
  view.title = `L${level.level} ${level.width}×${level.height}${
    role ? ` · ${role}` : ""
  }`;
  if (native && area) {
    context.strokeStyle = "white";
    context.lineWidth = 1;
    context.strokeRect(
      (area.x / native.width) * view.width,
      (area.y / native.height) * view.height,
      (area.width / native.width) * view.width,
      (area.height / native.height) * view.height
    );
  }
  context.fillStyle = "rgba(17, 24, 39, 0.85)";
  context.fillRect(1, 1, 18, 12);
  context.font = "9px sans-serif";
  context.textBaseline = "top";
  context.fillStyle = "white";
  context.fillText(`L${level.level}`, 3, 3);
};
