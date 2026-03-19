import type { GizmoCssAxisController } from "./cssAxisDragController";
import type { Vector3 } from "three";

export type GizmoAxisId = "x" | "y" | "z";

export type GizmoCssAxisViewOptions = {
  container: HTMLElement;
  controller: GizmoCssAxisController;
  axisOrigin: Vector3;
  axisDirections: Record<GizmoAxisId, Vector3>;
  getViewportRect: () => DOMRect | ClientRect | null;
  initialActiveAxisId?: GizmoAxisId;
  axisColors?: Partial<Record<GizmoAxisId, string>>;
  onActiveAxisChange?: (axisId: GizmoAxisId) => void;
};

export type GizmoCssAxisView = {
  getActiveAxisId: () => GizmoAxisId;
  setActiveAxisId: (axisId: GizmoAxisId) => void;
  refresh: () => void;
  destroy: () => void;
};

const LABEL_LINE_WIDTH_PX = 1;
const INACTIVE_AXIS_OPACITY = 0.75;
const INACTIVE_AXIS_ARROW_SCALE = 0.74;
const INACTIVE_AXIS_ARROW_OFFSET_SCALE = 1.28;

const AXIS_UI_LENGTH_PX = 108;
const AXIS_ARROW_OFFSET_PX = Math.max(26, Math.round(AXIS_UI_LENGTH_PX * 0.42));
const CENTER_DRAG_HIT_AREA_PX = 40;

const DEFAULT_AXIS_COLORS: Record<GizmoAxisId, string> = {
  x: "#ef4444",
  y: "#22c55e",
  z: "#3b82f6",
};

type AxisLayer = {
  wrapper: HTMLDivElement;
  line: HTMLDivElement;
  arrowForward: HTMLDivElement;
  arrowBackward: HTMLDivElement;
};

const createDiv = (style: Partial<CSSStyleDeclaration>): HTMLDivElement => {
  const div = document.createElement("div");
  Object.assign(div.style, style);
  return div;
};

const getAxisVisual = (
  axisId: GizmoAxisId,
  axisDirections: Record<GizmoAxisId, Vector3>,
  axisColors: Record<GizmoAxisId, string>
) => {
  const direction = axisDirections[axisId];
  const dir2d = { x: direction.x, y: -direction.y };
  const len = Math.hypot(dir2d.x, dir2d.y);
  const normalized =
    len > 0.001 ? { x: dir2d.x / len, y: dir2d.y / len } : { x: 0, y: -1 };
  const angleRad = Math.atan2(normalized.y, normalized.x);
  return {
    angleRad,
    dirX: normalized.x,
    dirY: normalized.y,
    color: axisColors[axisId],
  };
};

const createAxisLayer = (
  axisId: GizmoAxisId,
  color: string,
  onPointerDown: (event: MouseEvent, axisId: GizmoAxisId) => void
): AxisLayer => {
  const wrapper = createDiv({
    position: "absolute",
    inset: "0",
  });

  const line = createDiv({
    position: "absolute",
    left: "50%",
    top: "50%",
    width: `${AXIS_ARROW_OFFSET_PX * 2}px`,
    height: "1px",
    background: "rgba(255,255,255,0.82)",
    pointerEvents: "none",
    zIndex: "0",
  });

  const makeArrow = (glyph: "▲" | "▼") => {
    const arrow = createDiv({
      position: "absolute",
      width: "22px",
      height: "22px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color,
      fontSize: "18px",
      fontWeight: "700",
      lineHeight: "1",
      webkitTextStroke: `${LABEL_LINE_WIDTH_PX}px rgba(255, 255, 255, 0.95)`,
      textShadow: "none",
      pointerEvents: "auto",
      cursor: "move",
      userSelect: "none",
      zIndex: "2",
    });
    arrow.textContent = glyph;
    arrow.title = `Move point along ${axisId.toUpperCase()} axis`;
    arrow.addEventListener("mousedown", (event) =>
      onPointerDown(event, axisId)
    );
    return arrow;
  };

  const arrowForward = makeArrow("▲");
  const arrowBackward = makeArrow("▼");

  wrapper.append(line, arrowForward, arrowBackward);
  return {
    wrapper,
    line,
    arrowForward,
    arrowBackward,
  };
};

const setElementCenterPos = (
  element: HTMLElement,
  xPx: number,
  yPx: number
) => {
  element.style.left = `calc(50% + ${xPx}px)`;
  element.style.top = `calc(50% + ${yPx}px)`;
};

export const createCssAxisGizmoView = (
  options: GizmoCssAxisViewOptions
): GizmoCssAxisView => {
  const axisColors: Record<GizmoAxisId, string> = {
    ...DEFAULT_AXIS_COLORS,
    ...(options.axisColors ?? {}),
  };

  const overlay = createDiv({
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: `${AXIS_UI_LENGTH_PX}px`,
    height: `${AXIS_UI_LENGTH_PX}px`,
    pointerEvents: "none",
    userSelect: "none",
    overflow: "visible",
    zIndex: "6",
  });

  let activeAxisId: GizmoAxisId = options.initialActiveAxisId ?? "z";
  let isDraggingByView = false;

  const axisLayers: Record<GizmoAxisId, AxisLayer> = {
    x: undefined as unknown as AxisLayer,
    y: undefined as unknown as AxisLayer,
    z: undefined as unknown as AxisLayer,
  };

  const beginDrag = (event: MouseEvent, axisId: GizmoAxisId) => {
    event.preventDefault();
    event.stopPropagation();

    activeAxisId = axisId;
    options.onActiveAxisChange?.(activeAxisId);
    options.controller.setAxis(
      options.axisOrigin,
      options.axisDirections[axisId]
    );

    const viewportRect = options.getViewportRect();
    if (!viewportRect) return;

    const started = options.controller.beginDragFromClient(
      event.clientX,
      event.clientY,
      viewportRect
    );
    if (!started) {
      refresh();
      return;
    }

    isDraggingByView = true;

    const onMove = (moveEvent: MouseEvent) => {
      const moveRect = options.getViewportRect();
      if (!moveRect) return;
      options.controller.updateDragFromClient(
        moveEvent.clientX,
        moveEvent.clientY,
        moveRect
      );
      refresh();
    };

    const stop = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("pointerup", stop);
      isDraggingByView = false;
      options.controller.endDrag();
      refresh();
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", stop);
    window.addEventListener("pointerup", stop);

    refresh();
  };

  (["x", "y", "z"] as GizmoAxisId[]).forEach((axisId) => {
    const layer = createAxisLayer(axisId, axisColors[axisId], beginDrag);
    axisLayers[axisId] = layer;
    overlay.appendChild(layer.wrapper);
  });

  const centerHit = createDiv({
    position: "absolute",
    left: "50%",
    top: "50%",
    width: `${CENTER_DRAG_HIT_AREA_PX}px`,
    height: `${CENTER_DRAG_HIT_AREA_PX}px`,
    transform: "translate(-50%, -50%)",
    borderRadius: "9999px",
    background: "transparent",
    pointerEvents: "auto",
    cursor: "move",
    zIndex: "1",
  });

  centerHit.title = "Move point";
  centerHit.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  overlay.appendChild(centerHit);
  options.container.appendChild(overlay);

  const refresh = () => {
    const snapshot = options.controller.getSnapshot();
    const { point } = snapshot;

    overlay.style.display = "block";
    overlay.style.transform = `translate(calc(-50% + ${
      point.x
    }px), calc(-50% + ${-point.y}px))`;

    (["x", "y", "z"] as GizmoAxisId[]).forEach((axisId) => {
      const layer = axisLayers[axisId];
      const visual = getAxisVisual(axisId, options.axisDirections, axisColors);
      const isActive = axisId === activeAxisId;
      const axisOpacity = isActive ? 1 : INACTIVE_AXIS_OPACITY;
      const arrowOffsetPx =
        AXIS_ARROW_OFFSET_PX *
        (isActive ? 1 : INACTIVE_AXIS_ARROW_OFFSET_SCALE);
      const arrowScale = isActive ? 1 : INACTIVE_AXIS_ARROW_SCALE;

      layer.line.style.opacity = `${axisOpacity}`;
      layer.line.style.transform = `translate(-50%, -50%) rotate(${visual.angleRad}rad)`;

      setElementCenterPos(
        layer.arrowForward,
        visual.dirX * arrowOffsetPx,
        visual.dirY * arrowOffsetPx
      );
      layer.arrowForward.style.transform = `translate(-50%, -50%) rotate(${
        visual.angleRad + Math.PI / 2
      }rad) scale(${arrowScale})`;
      layer.arrowForward.style.opacity = `${axisOpacity}`;
      layer.arrowForward.style.cursor = isDraggingByView ? "grabbing" : "move";

      setElementCenterPos(
        layer.arrowBackward,
        -visual.dirX * arrowOffsetPx,
        -visual.dirY * arrowOffsetPx
      );
      layer.arrowBackward.style.transform = `translate(-50%, -50%) rotate(${
        visual.angleRad - Math.PI / 2
      }rad) scale(${arrowScale})`;
      layer.arrowBackward.style.opacity = `${axisOpacity}`;
      layer.arrowBackward.style.cursor = isDraggingByView ? "grabbing" : "move";
    });
  };

  refresh();

  return {
    getActiveAxisId: () => activeAxisId,
    setActiveAxisId: (axisId) => {
      activeAxisId = axisId;
      refresh();
    },
    refresh,
    destroy: () => {
      overlay.remove();
    },
  };
};

export default createCssAxisGizmoView;
