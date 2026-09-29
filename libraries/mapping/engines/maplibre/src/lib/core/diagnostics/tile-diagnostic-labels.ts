import { OVERVIEW_COLORS, type OverlayModel } from "./tile-diagnostic-model";
import {
  type DiagnosticView,
  TILE_RECORD_FLOATS,
  TILE_PHASES,
  type DiagnosticSnapshot,
  type DiagnosticFrame,
  diagnosticProjection,
  rgba,
} from "./tile-diagnostic-scene";

/** The runtime cache's resident byte charge, shown without implying transfer size. */
export const formatTileResidentBytes = (bytes: number): string => {
  const units = ["B", "KiB", "MiB", "GiB"] as const;
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? Math.round(value) : Number(value.toFixed(1))} ${
    units[unit]
  }`;
};

/** Reverse draw order, without allocating a reversed tile array on pointer moves. */
export const hitTestDiagnosticLabel = (
  model: OverlayModel,
  view: DiagnosticView,
  width: number,
  height: number,
  screenX: number,
  screenY: number
) => {
  const { scale, offsetX, offsetY } = diagnosticProjection(view, width, height);
  const x = (screenX - offsetX) / scale,
    y = (screenY - offsetY) / scale;
  for (let i = model.rects.length - 1; i >= 0; i--) {
    const rect = model.rects[i];
    if (
      rect.kind !== "ancestor" &&
      rect.w * scale >= 26 &&
      rect.h * scale >= 12 &&
      Math.abs(x - rect.x - rect.w / 2) < Math.min(rect.w / 2, 50 / scale) &&
      Math.abs(y - rect.y - rect.h / 2) < 7 / scale
    )
      return rect.tile;
  }
  return null;
};

/** Keep source URLs out of the on-map label; preserve familiar z/x/y keys. */
export const compactDiagnosticTileId = (value: string): string => {
  // Stable 3D IDs prefix the payload with tilesetUrl#tree/path:contentUrl.
  const fragment = value.indexOf("#");
  const payload =
    fragment >= 0 ? value.slice(fragment + 1).replace(/^[\d/-]*:/, "") : value;
  const key = payload.split(/[?#]/)[0];
  const coordinates = key.match(
    /(?:^|[:/])(\d+[/_]\d+[/_]\d+)(?:\.[a-z0-9]+)?$/i
  );
  if (coordinates) return coordinates[1].replaceAll("_", "/");
  const name =
    key
      .split(/[/:]/)
      .pop()
      ?.replace(/\.(?:glb|gltf|b3dm|json)$/i, "")
      .replace(/^_?mesh_/i, "") ?? "";
  if (/^(?:tile|tileset|metadata|terrain|3d-tile)$/i.test(name)) return "";
  return name.length > 24 ? `${name.slice(0, 11)}…${name.slice(-10)}` : name;
};

/** Canvas text stays in the worker too; no per-tile DOM or font atlas dependency. */
export const drawDiagnosticText = (
  context: OffscreenCanvasRenderingContext2D,
  snapshot: DiagnosticSnapshot,
  frame: DiagnosticFrame
) => {
  const { width, height, pixelRatio, view } = frame;
  const { scale, offsetX, offsetY } = diagnosticProjection(view, width, height);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.globalAlpha = frame.opacity;
  const text = (
    value: string,
    x: number,
    y: number,
    size: number,
    color: string = OVERVIEW_COLORS.text
  ) => {
    if (size < 3) return;
    context.font = `${size}px monospace`;
    context.strokeStyle = "rgba(0,0,0,.65)";
    context.lineWidth = 2;
    context.lineJoin = "round";
    context.strokeText(value, x, y);
    context.fillStyle = color;
    context.fillText(value, x, y);
  };
  const occupied: Array<{
    left: number;
    right: number;
    top: number;
    bottom: number;
  }> = [];
  const data = snapshot.tiles;
  for (let i = 0; i < data.length; i += TILE_RECORD_FLOATS) {
    const [x, y, w, h, kind, flags, minimum, maximum, phase] = data.subarray(
      i,
      i + 9
    );
    if (kind < 0) continue;
    const cx = (x + w / 2) * scale + offsetX,
      cy = (y + h / 2) * scale + offsetY;
    if (
      cx < -w * scale ||
      cy < -h * scale ||
      cx > width + w * scale ||
      cy > height + h * scale
    )
      continue;
    const diameter = Math.min(w, h) * scale,
      radius = Math.max(0, diameter / 2 - Math.max(0.5, diameter * 0.08));
    if (diameter >= 4 && (!(flags & 4) || phase)) {
      if (phase >= 4)
        text(
          TILE_PHASES[phase],
          cx,
          cy,
          radius * 0.9,
          phase === 4 ? OVERVIEW_COLORS.failed : OVERVIEW_COLORS.processing
        );
      if (flags & 8 && (minimum || maximum))
        text("≈", cx, cy + radius * 0.78, radius * 0.22);
    }
    if (frame.labels === "none" || w * scale < 26 || h * scale < 12) continue;
    // Only the tile key, z/x/y: the runtime and source prefix says nothing the
    // overview does not show already, and it never fits inside a tile.
    const id = compactDiagnosticTileId(
      snapshot.ids[i / TILE_RECORD_FLOATS] ?? ""
    );
    const lines = id.split("/");
    const bytes = data[i + 10];
    if (frame.labels === "id and stats" && Number.isFinite(bytes) && bytes > 0)
      lines.push(formatTileResidentBytes(bytes));
    if (frame.labels === "id and error" && Number.isFinite(data[i + 9]))
      lines.push(`${data[i + 9].toFixed(1)} px`);
    const fontSize = 10;
    const lineHeight = fontSize;
    const labelHeight = lines.length * lineHeight;
    context.font = `${fontSize}px monospace`;
    const labelWidth = Math.max(
      ...lines.map((line) => context.measureText(line).width)
    );
    if (!id || labelWidth + 4 > w * scale || labelHeight + 2 > h * scale)
      continue;
    const bounds = {
      left: cx - labelWidth / 2 - 2,
      right: cx + labelWidth / 2 + 2,
      top: cy - labelHeight / 2 - 1,
      bottom: cy + labelHeight / 2 + 1,
    };
    if (
      occupied.some(
        (other) =>
          bounds.left < other.right &&
          bounds.right > other.left &&
          bounds.top < other.bottom &&
          bounds.bottom > other.top
      )
    )
      continue;
    occupied.push(bounds);
    lines.forEach((line, index) =>
      text(
        line,
        cx,
        cy + (index - (lines.length - 1) / 2) * lineHeight,
        fontSize
      )
    );
  }
};
