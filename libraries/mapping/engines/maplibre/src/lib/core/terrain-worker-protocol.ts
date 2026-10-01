/** The work a terrain worker task asks for; its result repeats the kind. */
export const TERRAIN_WORKER_TASK_KIND = {
  READ_HEIGHT_METADATA: "read-height-metadata",
  WRITE_HEIGHT_METADATA: "write-height-metadata",
  READ_CACHE: "read-cache",
  WRITE_CACHE: "write-cache",
  CACHE_COST: "cache-cost",
  PROTECT_CACHE: "protect-cache",
  MARK_CACHE_USED: "mark-cache-used",
  CALIBRATE_CACHE: "calibrate-cache",
  SELECT: "select",
  PARTITION: "partition",
  STITCH: "stitch",
  DECODE: "decode",
  REMESH: "remesh",
  PROJECT: "project",
  PROJECT_ECEF: "project-ecef",
} as const;

export type TerrainWorkerTaskKind =
  (typeof TERRAIN_WORKER_TASK_KIND)[keyof typeof TERRAIN_WORKER_TASK_KIND];

/** Messages that steer the running task instead of asking for new work. */
export const TERRAIN_WORKER_CONTROL_KIND = {
  CANCEL_CURRENT: "cancel-current",
} as const;

export type TerrainWorkerControlMessage = Readonly<{
  kind: (typeof TERRAIN_WORKER_CONTROL_KIND)[keyof typeof TERRAIN_WORKER_CONTROL_KIND];
}>;
