import type { Quaternion } from "three";
import type { Vector3 } from "three";

import type {
  CameraIntrinsics,
  ObjectCentricCameraAnchor,
} from "@carma-commons/camera/model";
import type { Meters, Radians } from "@carma-units";
// ---------------------------------------------------------------------------
// Canonical view state — ECEF positions + quaternion orientation.
// All angles (bearing, pitch, roll, zoom) are derived, never stored.
// Composes with @carma-commons/camera/model types where applicable.
// ---------------------------------------------------------------------------

export type ViewState = {
  /** Orbit anchor / reference point in ECEF (meters). */
  readonly anchor: Vector3;
  /** Anchor as geodetic coordinates (cached, derived from anchor ECEF). */
  readonly anchorCartographic: ObjectCentricCameraAnchor;
  /** Camera eye position in ECEF (meters). */
  readonly cameraPosition: Vector3;
  /**
   * Camera rotation in the shared local Y-up scene basis:
   * +X east, +Y up, -Z north.
   */
  readonly orientation: Quaternion;
  /** Camera projection parameters (FOV, near, far, type). */
  readonly intrinsics: CameraIntrinsics;
  /** Frame metadata. */
  readonly metadata: ViewStateMetadata;
};

export type ViewStateMetadata = {
  readonly frameId: number;
  readonly timestampMs: number;
  readonly sourceId: string;
  readonly source: ViewStateSource;
  /**
   * Live viewport dimensions used for zoom/hash derivation.
   * This is render-surface context only, not a camera view offset.
   */
  readonly viewport?: {
    readonly widthPx: number;
    readonly heightPx: number;
  };
  /**
   * Whether the source runtime can actually evaluate the shared orbit fields.
   * Unspecified means "treat as evaluable".
   *
   * Example: Leaflet may temporarily preserve shared bearing/pitch/range from a
   * seed state for sync continuity, even though the engine itself is a
   * top-down orthographic map and cannot observe those values natively.
   */
  readonly poseEvaluability?: {
    readonly bearing?: boolean;
    readonly pitch?: boolean;
    readonly roll?: boolean;
    readonly range?: boolean;
  };
  readonly restoreHints?: ViewStateRestoreHints;
};

export type ViewStateRestoreHints = {
  readonly shareable?: {
    readonly zoom?: number;
    readonly fovLongerEdge?: Radians;
  };
};

export const VIEW_STATE_SOURCE = {
  USER_INTERACTION: "user-interaction",
  ANIMATION: "animation",
  SYNC: "sync",
  RESTORE: "restore",
  HASH: "hash",
} as const;

export type ViewStateSource =
  (typeof VIEW_STATE_SOURCE)[keyof typeof VIEW_STATE_SOURCE];

// ---------------------------------------------------------------------------
// Write protocol
// ---------------------------------------------------------------------------

export type WritePriority =
  | "user-interaction"
  | "animation"
  | "sync"
  | "restore";

/** Priority rank: higher number = higher priority. */
export const WRITE_PRIORITY_RANK: Record<WritePriority, number> = {
  restore: 0,
  sync: 1,
  animation: 2,
  "user-interaction": 3,
};

export type WriteToken = {
  readonly sourceId: string;
  readonly timestampMs: number;
  readonly priority: WritePriority;
};

export type WriteResult =
  | { readonly accepted: true; readonly frameId: number }
  | { readonly rejected: true; readonly reason: WriteRejectionReason };

export type WriteRejectionReason =
  | "unregistered-source"
  | "not-controller"
  | "frame-already-written"
  | "stale-timestamp";

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export type ViewAdapterRegistration = {
  readonly id: string;
  readonly engine: string;
};

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export type HistoryEntry = {
  readonly state: ViewState;
  readonly sourceId: string;
  readonly priority: WritePriority;
  readonly timestampMs: number;
  readonly frameId: number;
};

export type HistoryConfig = {
  /** Maximum entries in the ring buffer. Default 120. */
  readonly maxEntries: number;
  /** Minimum interval between stored entries (ms). Default 500. */
  readonly snapshotIntervalMs: number;
};

export type HistoryView = {
  readonly entries: readonly HistoryEntry[];
  readonly length: number;
  readonly oldestTimestampMs: number | null;
  readonly newestTimestampMs: number | null;
  nearest(timestampMs: number): HistoryEntry | null;
  recent(count: number): readonly HistoryEntry[];
  lastFrom(sourceId: string): HistoryEntry | null;
};

// ---------------------------------------------------------------------------
// Provider context value
// ---------------------------------------------------------------------------

export type ViewStateContextValue = {
  getState(): ViewState | null;
  getControllerId(): string | null;
  subscribe(listener: () => void): () => void;
  register(id: string, engine: string): () => void;
  update(next: ViewState, token: WriteToken): WriteResult;
  claimControl(id: string, priority: WritePriority): boolean;
  releaseControl(id: string): void;
  getHistory(): HistoryView;
};

// ---------------------------------------------------------------------------
// Derived view (computed from ViewState, never stored)
// ---------------------------------------------------------------------------

export type DerivedView = {
  readonly longitude: Radians;
  readonly latitude: Radians;
  readonly altitude: Meters;
  readonly bearing: Radians;
  readonly pitch: Radians;
  readonly roll: Radians;
  readonly range: Meters;
  readonly zoom: number;
  readonly fov: Radians;
};

// ---------------------------------------------------------------------------
// Navigation manager
// ---------------------------------------------------------------------------

export type ViewStateHashValues = Record<string, unknown>;

export type ViewStateNavigationCommitReason =
  | "interaction-settled"
  | "transition-complete"
  | "programmatic-settle"
  | "initial-hash-restore"
  | "browser-popstate-restore";

export const VIEW_STATE_NAVIGATION_EVENT = {
  BROWSER_POPSTATE_RESTORE: "browser-popstate-restore",
} as const;

export type ViewStateNavigationEventType =
  (typeof VIEW_STATE_NAVIGATION_EVENT)[keyof typeof VIEW_STATE_NAVIGATION_EVENT];

export type ViewStateHashCodec = {
  encode: (state: ViewState | null | undefined) => ViewStateHashValues | null;
  decode: (hashValues: ViewStateHashValues) => ViewState | null;
};

export type ViewStateNavigationEvent = {
  readonly type: ViewStateNavigationEventType;
  readonly state: ViewState;
};

export type ViewStateNavigationManagerContextValue = {
  readonly restoreState: ViewState | null;
  readonly isRestoreResolved: boolean;
  registerOnNavigationEvent(
    listener: (event: ViewStateNavigationEvent) => void
  ): () => void;
  commitCurrentState(
    reason: ViewStateNavigationCommitReason,
    options?: { replace?: boolean; force?: boolean }
  ): boolean;
  suspendHashWrites(reason?: string): () => void;
};
