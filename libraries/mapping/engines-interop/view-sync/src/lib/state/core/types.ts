import type { Vector3, Quaternion } from "@carma/math";
import type { Meters, Radians } from "@carma/units/types";
import type {
  CameraIntrinsics,
  ObjectCentricCameraAnchor,
} from "@carma-commons/camera/model";

// ---------------------------------------------------------------------------
// Canonical view state — ECEF positions + quaternion orientation.
// All angles (bearing, pitch, roll, zoom) are derived, never stored.
// Composes with @carma-commons/camera/model types where applicable.
// ---------------------------------------------------------------------------

export type CommonViewState = {
  /** Orbit anchor / reference point in ECEF (meters). */
  readonly anchor: Vector3;
  /** Anchor as geodetic coordinates (cached, derived from anchor ECEF). */
  readonly anchorCartographic: ObjectCentricCameraAnchor;
  /** Camera eye position in ECEF (meters). */
  readonly cameraPosition: Vector3;
  /** Camera world-space rotation (Three.js convention). */
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
};

export type ViewStateSource =
  | "user-interaction"
  | "animation"
  | "sync"
  | "restore"
  | "hash";

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
  readonly state: CommonViewState;
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
  /** Force-store interval for sparse history (ms). Default 2000. */
  readonly keyframeIntervalMs: number;
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
  getState(): CommonViewState | null;
  getControllerId(): string | null;
  subscribe(listener: () => void): () => void;
  register(id: string, engine: string): () => void;
  update(next: CommonViewState, token: WriteToken): WriteResult;
  claimControl(id: string, priority: WritePriority): boolean;
  releaseControl(id: string): void;
  getHistory(): HistoryView;
};

// ---------------------------------------------------------------------------
// Derived view (computed from CommonViewState, never stored)
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
