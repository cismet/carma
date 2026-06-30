import type { CSSProperties } from "react";
import type { ReactNode } from "react";

import type { CssPixelPosition } from "@carma-units";

/**
 * A world-space anchor that the (engine-specific) host can project to screen.
 * Kept structural (x/y/z) so the provider stays engine-agnostic; a Cesium
 * Cartesian3 satisfies it directly.
 */
export type LabelOverlayWorldAnchor = { x: number; y: number; z: number };

/**
 * Shared, per-frame registry of live world anchors keyed by an arbitrary entity
 * id (gizmo point id, annotation node id, ...). It is the single source of truth
 * for "where is this entity right now", including mid-interaction positions that
 * are known synchronously from pointer input but not yet committed to React
 * state. Writers (a drag interaction) set/clear entries; readers consume them in
 * the same render frame: overlay elements via their `worldAnchor`, and 3D engine
 * primitives via the host's render loop. (cismet/wupp#4078)
 */
export interface LabelOverlayLiveAnchors {
  set: (id: string, anchor: LabelOverlayWorldAnchor) => void;
  get: (id: string) => LabelOverlayWorldAnchor | undefined;
  delete: (id: string) => void;
  clear: () => void;
  readonly size: number;
}

export interface LabelOverlayElement {
  id: string;
  getCanvasPosition?: () => CssPixelPosition | null;
  updatePosition?: (elementDiv: HTMLElement) => boolean;
  /**
   * Optional live world anchor. When provided (and the host can project world
   * anchors), the provider projects it to screen every frame and positions the
   * element — no per-element `updatePosition` needed. Return `null` to hide.
   * Read the anchor live (e.g. from `liveAnchors`) to track a drag in lockstep.
   * Ignored when `updatePosition` is set (that takes full control).
   */
  worldAnchor?: () => LabelOverlayWorldAnchor | null;
  content: ReactNode;
  contentKey?: string;
  zIndex?: number;
  visible?: boolean;
  isHidden?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  cursor?: CSSProperties["cursor"];
}

export interface LabelOverlayContextType {
  addLabelOverlayElement: (element: LabelOverlayElement) => void;
  removeLabelOverlayElement: (id: string) => void;
  updateLabelOverlayElement: (
    id: string,
    updates: Partial<LabelOverlayElement>
  ) => void;
  clearLabelOverlayElements: () => void;
  updatePositions: () => void;
  liveAnchors: LabelOverlayLiveAnchors;
}
