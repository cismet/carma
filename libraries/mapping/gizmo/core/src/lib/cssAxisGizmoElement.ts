import {
  createCssAxisDragController,
  type GizmoCssAxisController,
  type GizmoCssAxisSnapshot,
} from "./cssAxisDragController";
import {
  createCssAxisGizmoView,
  type GizmoCssAxisView,
} from "./cssAxisGizmoView";
import { Vector3 } from "three";

type AxisId = "x" | "y" | "z";

const AXIS_DIRECTIONS: Record<AxisId, Vector3> = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
};

const AXIS_ORIGIN = new Vector3(0, 0, 0);

const toNumber = (value: string | null, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBool = (value: string | null, fallback: boolean): boolean => {
  if (value === null) return fallback;
  if (value === "" || value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
};

const fmt = (value: number, digits = 3) => value.toFixed(digits);

export class CssAxisGizmoElement extends HTMLElement {
  static get observedAttributes() {
    return [
      "initial-offset",
      "pointer-depth",
      "grid-size-px",
      "grid-tilt-deg",
      "grid-scale",
      "show-readouts",
    ];
  }

  private readonly shadowRootRef: ShadowRoot;
  private readonly stageEl: HTMLDivElement;
  private readonly gridHostEl: HTMLDivElement;
  private readonly gridEl: HTMLDivElement;
  private readonly readoutEl: HTMLDivElement;

  private controller: GizmoCssAxisController | null = null;
  private view: GizmoCssAxisView | null = null;
  private activeAxis: AxisId = "z";
  private lastSnapshot: GizmoCssAxisSnapshot | null = null;

  constructor() {
    super();
    this.shadowRootRef = this.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }

      .stage {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #0f172a;
        user-select: none;
      }

      .grid-host {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        display: grid;
        place-items: center;
      }

      .grid {
        transform-style: preserve-3d;
        background-image:
          linear-gradient(rgba(34,211,238,0.3) 1px, transparent 1px),
          linear-gradient(90deg, rgba(34,211,238,0.3) 1px, transparent 1px);
        background-size: 20px 20px;
        box-shadow: 0 0 28px rgba(34,211,238,0.18);
      }

      .readout {
        position: absolute;
        top: 10px;
        right: 10px;
        width: 300px;
        border-radius: 8px;
        border: 1px solid #334155;
        background: rgba(11,16,32,0.82);
        color: #d1d5db;
        padding: 10px;
        font-size: 12px;
        line-height: 1.45;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        pointer-events: none;
        z-index: 10;
        display: none;
      }
    `;

    this.stageEl = document.createElement("div");
    this.stageEl.className = "stage";

    this.gridHostEl = document.createElement("div");
    this.gridHostEl.className = "grid-host";
    this.gridEl = document.createElement("div");
    this.gridEl.className = "grid";
    this.gridHostEl.appendChild(this.gridEl);

    this.readoutEl = document.createElement("div");
    this.readoutEl.className = "readout";

    this.stageEl.append(this.gridHostEl, this.readoutEl);
    this.shadowRootRef.append(style, this.stageEl);
  }

  connectedCallback() {
    this.initialize();
    this.applyAttributes();
  }

  disconnectedCallback() {
    this.view?.destroy();
    this.view = null;
    this.controller = null;
  }

  attributeChangedCallback() {
    this.applyAttributes();
  }

  private initialize() {
    if (this.controller && this.view) return;

    const initialOffset = toNumber(this.getAttribute("initial-offset"), 0.35);
    const pointerDepth = toNumber(this.getAttribute("pointer-depth"), 1.6);
    const gridScale = toNumber(this.getAttribute("grid-scale"), 80);
    const gridTiltDeg = toNumber(this.getAttribute("grid-tilt-deg"), 58);

    this.controller = createCssAxisDragController({
      axisOrigin: AXIS_ORIGIN,
      axisDirection: AXIS_DIRECTIONS[this.activeAxis],
      initialAxisParam: initialOffset,
      pointerDepth,
      gridScale,
      gridTiltDeg,
      onChange: (snapshot) => {
        this.lastSnapshot = snapshot;
        this.applySnapshot(snapshot);
      },
    });

    this.view = createCssAxisGizmoView({
      container: this.stageEl,
      controller: this.controller,
      axisOrigin: AXIS_ORIGIN,
      axisDirections: AXIS_DIRECTIONS,
      initialActiveAxisId: this.activeAxis,
      getViewportRect: () => this.stageEl.getBoundingClientRect(),
      onActiveAxisChange: (axisId) => {
        this.activeAxis = axisId;
        this.refreshReadout();
      },
    });

    this.lastSnapshot = this.controller.getSnapshot();
    this.applySnapshot(this.lastSnapshot);
  }

  private applyAttributes() {
    if (!this.controller) return;

    const gridSizePx = toNumber(this.getAttribute("grid-size-px"), 280);
    const gridTiltDeg = toNumber(this.getAttribute("grid-tilt-deg"), 58);
    const gridScale = toNumber(this.getAttribute("grid-scale"), 80);
    const pointerDepth = toNumber(this.getAttribute("pointer-depth"), 1.6);
    const initialOffset = toNumber(this.getAttribute("initial-offset"), 0.35);
    const showReadouts = toBool(this.getAttribute("show-readouts"), false);

    this.gridHostEl.style.width = `${gridSizePx}px`;
    this.gridHostEl.style.height = `${gridSizePx}px`;
    this.gridEl.style.width = `${gridSizePx}px`;
    this.gridEl.style.height = `${gridSizePx}px`;

    this.controller.setPointerDepth(pointerDepth);
    this.controller.setGridStyle(gridScale, gridTiltDeg);

    const snapshot = this.controller.getSnapshot();
    if (!snapshot.isDragging) {
      this.controller.setAxisParam(initialOffset);
    }

    this.readoutEl.style.display = showReadouts ? "block" : "none";
    this.view?.refresh();
    this.refreshReadout();
  }

  private applySnapshot(snapshot: GizmoCssAxisSnapshot) {
    this.gridEl.style.transform = snapshot.gridTransform;
    this.refreshReadout();
  }

  private refreshReadout() {
    if (!this.readoutEl || !this.controller) return;

    const snapshot = this.lastSnapshot ?? this.controller.getSnapshot();
    this.readoutEl.innerHTML = `
      <div><strong>Axis</strong>: ${this.activeAxis.toUpperCase()}</div>
      <div><strong>Offset</strong>: ${fmt(snapshot.axisParam)}</div>
      <div><strong>Dragging</strong>: ${
        snapshot.isDragging ? "yes" : "no"
      }</div>
      <div><strong>Point</strong>: (${fmt(snapshot.point.x)}, ${fmt(
      snapshot.point.y
    )}, ${fmt(snapshot.point.z)})</div>
      <div><strong>Ray</strong>: ${
        snapshot.lastRayDirection
          ? `(${fmt(snapshot.lastRayDirection.x)}, ${fmt(
              snapshot.lastRayDirection.y
            )}, ${fmt(snapshot.lastRayDirection.z)})`
          : "-"
      }</div>
    `;
  }
}

customElements.define("carma-css-axis-gizmo", CssAxisGizmoElement);
