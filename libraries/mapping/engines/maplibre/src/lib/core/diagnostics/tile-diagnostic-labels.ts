import type { DiagnosticLabelFace } from "./tile-diagnostic-box-scene";
import {
  OVERVIEW_COLORS,
  TILE_DIAGNOSTIC_KIND,
  type OverlayModel,
} from "./tile-diagnostic-model";
import { TILE_DIAGNOSTIC_LABEL_MODE } from "./tile-diagnostic-options";
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
      rect.kind !== TILE_DIAGNOSTIC_KIND.ANCESTOR &&
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

export type DiagnosticLabelHit = {
  record: number;
  depth: number;
  polygon: readonly [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number
  ];
};

const drawDiagnosticFaceText = (
  context: OffscreenCanvasRenderingContext2D,
  snapshot: DiagnosticSnapshot,
  frame: DiagnosticFrame,
  faces: readonly DiagnosticLabelFace[],
  onLabel?: (hit: DiagnosticLabelHit) => void
) => {
  const occupied: Array<{
    left: number;
    right: number;
    top: number;
    bottom: number;
  }> = [];
  const accepted: Array<{
    face: DiagnosticLabelFace;
    transform: DiagnosticLabelFace["transform"];
    fontSize: number;
    radius: number;
    phase: number;
    flags: number;
    hasError: boolean;
    lines: string[];
    scale: number;
  }> = [];
  const projection = diagnosticProjection(
    frame.view,
    frame.width,
    frame.height
  );
  const data = snapshot.tiles;
  // Front faces claim screen space first; their text is drawn last below.
  for (const face of [...faces].sort((a, b) => a.depth - b.depth)) {
    const offset = face.record * TILE_RECORD_FLOATS;
    const [faceA, faceB, faceC, faceD, faceE, faceF] = face.transform;
    const a = faceA * projection.scale,
      b = faceB * projection.scale,
      c = faceC * projection.scale,
      d = faceD * projection.scale,
      e = faceE * projection.scale + projection.offsetX,
      f = faceF * projection.scale + projection.offsetY;
    if (
      offset < 0 ||
      offset + TILE_RECORD_FLOATS > data.length ||
      data[offset + 4] < 0 ||
      face.width <= 0 ||
      face.height <= 0 ||
      !face.transform.every(Number.isFinite)
    )
      continue;
    const squaredScale = a * a + b * b + c * c + d * d;
    const determinant = Math.abs(a * d - b * c);
    const scale = Math.sqrt(
      (squaredScale +
        Math.sqrt(Math.max(0, squaredScale ** 2 - 4 * determinant ** 2))) /
        2
    );
    const minimumScale = determinant / scale;
    if (!Number.isFinite(scale) || scale <= 0 || minimumScale / scale < 0.3)
      continue;
    const cx = e + (a * face.width + c * face.height) / 2;
    const cy = f + (b * face.width + d * face.height) / 2;
    const faceHalfWidth =
      (Math.abs(a) * face.width + Math.abs(c) * face.height) / 2;
    const faceHalfHeight =
      (Math.abs(b) * face.width + Math.abs(d) * face.height) / 2;
    if (
      cx + faceHalfWidth < 0 ||
      cy + faceHalfHeight < 0 ||
      cx - faceHalfWidth > frame.width ||
      cy - faceHalfHeight > frame.height
    )
      continue;
    const flags = data[offset + 5];
    const phase = data[offset + 8];
    const diameter = Math.min(face.width, face.height);
    const radius = Math.max(
      0,
      diameter / 2 - Math.max(0.5 / scale, diameter * 0.08)
    );
    const fontSize = 10 / scale;
    let lines: string[] = [];
    if (
      frame.labels !== TILE_DIAGNOSTIC_LABEL_MODE.NONE &&
      face.width * Math.hypot(a, b) >= 26 &&
      face.height * minimumScale >= 12
    ) {
      const id = compactDiagnosticTileId(snapshot.ids[face.record] ?? "");
      const candidateLines = id.split("/");
      const bytes = data[offset + 10];
      if (
        frame.labels === TILE_DIAGNOSTIC_LABEL_MODE.ID_AND_STATS &&
        Number.isFinite(bytes) &&
        bytes > 0
      )
        candidateLines.push(formatTileResidentBytes(bytes));
      if (
        frame.labels === TILE_DIAGNOSTIC_LABEL_MODE.ID_AND_ERROR &&
        Number.isFinite(data[offset + 9])
      )
        candidateLines.push(`${data[offset + 9].toFixed(1)} px`);
      context.font = `${fontSize}px monospace`;
      const labelWidth = Math.max(
        ...candidateLines.map((line) => context.measureText(line).width)
      );
      const labelHeight = candidateLines.length * fontSize;
      if (
        id &&
        labelWidth + 4 / scale <= face.width &&
        labelHeight + 2 / scale <= face.height
      ) {
        const halfWidth = labelWidth / 2 + 2 / scale;
        const halfHeight = labelHeight / 2 + 1 / scale;
        const screenHalfWidth =
          Math.abs(a) * halfWidth + Math.abs(c) * halfHeight;
        const screenHalfHeight =
          Math.abs(b) * halfWidth + Math.abs(d) * halfHeight;
        const bounds = {
          left: cx - screenHalfWidth,
          right: cx + screenHalfWidth,
          top: cy - screenHalfHeight,
          bottom: cy + screenHalfHeight,
        };
        if (
          !occupied.some(
            (other) =>
              bounds.left < other.right &&
              bounds.right > other.left &&
              bounds.top < other.bottom &&
              bounds.bottom > other.top
          )
        ) {
          occupied.push(bounds);
          lines = candidateLines;
          onLabel?.({
            record: face.record,
            depth: face.depth,
            polygon: [
              cx - a * halfWidth - c * halfHeight,
              cy - b * halfWidth - d * halfHeight,
              cx + a * halfWidth - c * halfHeight,
              cy + b * halfWidth - d * halfHeight,
              cx + a * halfWidth + c * halfHeight,
              cy + b * halfWidth + d * halfHeight,
              cx - a * halfWidth + c * halfHeight,
              cy - b * halfWidth + d * halfHeight,
            ],
          });
        }
      }
    }
    accepted.push({
      face,
      transform: [a, b, c, d, e, f],
      fontSize,
      radius,
      phase,
      flags,
      hasError: Boolean(data[offset + 6] || data[offset + 7]),
      lines,
      scale,
    });
  }
  for (let i = accepted.length - 1; i >= 0; i--) {
    const {
      face,
      transform,
      fontSize,
      radius,
      phase,
      flags,
      hasError,
      lines,
      scale,
    } = accepted[i];
    const [a, b, c, d, e, f] = transform;
    context.setTransform(
      a * frame.pixelRatio,
      b * frame.pixelRatio,
      c * frame.pixelRatio,
      d * frame.pixelRatio,
      e * frame.pixelRatio,
      f * frame.pixelRatio
    );
    const text = (
      value: string,
      y: number,
      size: number,
      color: string = OVERVIEW_COLORS.text
    ) => {
      if (size * scale < 3) return;
      context.font = `${size}px monospace`;
      context.strokeStyle = "rgba(0,0,0,.65)";
      context.lineWidth = 2 / scale;
      context.lineJoin = "round";
      context.strokeText(value, face.width / 2, y);
      context.fillStyle = color;
      context.fillText(value, face.width / 2, y);
    };
    if (
      Math.min(face.width, face.height) * scale >= 4 &&
      (!(flags & 4) || phase)
    ) {
      if (phase >= 4)
        text(
          TILE_PHASES[phase],
          face.height / 2,
          radius * 0.9,
          phase === 4 ? OVERVIEW_COLORS.failed : OVERVIEW_COLORS.processing
        );
      if (flags & 8 && hasError)
        text("≈", face.height / 2 + radius * 0.78, radius * 0.22);
    }
    lines.forEach((line, index) =>
      text(
        line,
        face.height / 2 + (index - (lines.length - 1) / 2) * fontSize,
        fontSize
      )
    );
  }
  context.setTransform(frame.pixelRatio, 0, 0, frame.pixelRatio, 0, 0);
};

/** Canvas text stays in the worker too; no per-tile DOM or font atlas dependency. */
export const drawDiagnosticText = (
  context: OffscreenCanvasRenderingContext2D,
  snapshot: DiagnosticSnapshot,
  frame: DiagnosticFrame,
  faces?: readonly DiagnosticLabelFace[],
  onLabel?: (hit: DiagnosticLabelHit) => void
) => {
  const { width, height, pixelRatio, view } = frame;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.globalAlpha = frame.opacity;
  if (faces) {
    drawDiagnosticFaceText(context, snapshot, frame, faces, onLabel);
    return;
  }
  const { scale, offsetX, offsetY } = diagnosticProjection(view, width, height);
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
    if (
      frame.labels === TILE_DIAGNOSTIC_LABEL_MODE.NONE ||
      w * scale < 26 ||
      h * scale < 12
    )
      continue;
    // Only the tile key, z/x/y: the runtime and source prefix says nothing the
    // overview does not show already, and it never fits inside a tile.
    const id = compactDiagnosticTileId(
      snapshot.ids[i / TILE_RECORD_FLOATS] ?? ""
    );
    const lines = id.split("/");
    const bytes = data[i + 10];
    if (
      frame.labels === TILE_DIAGNOSTIC_LABEL_MODE.ID_AND_STATS &&
      Number.isFinite(bytes) &&
      bytes > 0
    )
      lines.push(formatTileResidentBytes(bytes));
    if (
      frame.labels === TILE_DIAGNOSTIC_LABEL_MODE.ID_AND_ERROR &&
      Number.isFinite(data[i + 9])
    )
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
    onLabel?.({
      record: i / TILE_RECORD_FLOATS,
      depth: 0,
      polygon: [
        bounds.left,
        bounds.top,
        bounds.right,
        bounds.top,
        bounds.right,
        bounds.bottom,
        bounds.left,
        bounds.bottom,
      ],
    });
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
