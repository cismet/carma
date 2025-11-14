/**
 * Map Measurements Context Types
 * Shared types used by context, provider, and external consumers
 */

export type ActiveShape = null | number | string | any;

export enum MEASUREMENT_MODE {
  DEFAULT = "default",
  MEASUREMENT = "measurement",
}

export type MeasurementMapStatus =
  | "INACTIVE" // not active
  | "WAITING" // moving around not dragging anything and waiting for other stuff
  | "DRAWING" // either lines or polygons but in the process
  | "EDITING" // dragging vertices around
  | "MOVING"; // dragging whole objects around

export interface MeasurementConfig {
  editableTitle: boolean;
  infoBoxHeaderColor: string;
  localStorageKey: string;
  snappingEnabled: boolean;
  snappingOnUpdate: boolean;
  snappingQueryRadius: number;
  snappingMinZoom: number;
  snappingRadiusVisible: boolean;
  debugOutputMapStatus: boolean;
  debugOutputMapStatusPosition: { x: number; y: number };
}

export type PartialMeasurementConfig = Partial<MeasurementConfig>;
