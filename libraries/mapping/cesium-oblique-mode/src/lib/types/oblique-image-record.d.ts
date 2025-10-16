export interface BasicObliqueImageRecord {
  id: string;
  x: number;
  y: number;
  z: number;
  m: Matrix3RowMajor;
  cameraId: string;
  photoIndex: number;
  lineIndex: number;
  waypointIndex: number;
  stationId: string;
}

export interface ObliqueImageRecord extends BasicObliqueImageRecord {
  centerWGS84: [number, number, number];
  fallbackHeading: number;
  sector: CardinalDirectionEnum;
  cartesian: Cartesian3;
  derivedExtOri?: DerivedExteriorOrientation;
}

export type NearestObliqueImageRecord = {
  record: ObliqueImageRecord;
  distanceOnGround: number;
  distanceToCamera: number;
  imageCenter: Omit<PointWithSector, "id">;
};

export type ObliqueImageRecordMap = Map<string, ObliqueImageRecord>;

export type SelectedImageRefreshArgs = {
  direction?: CardinalDirectionEnum;
  headingRad?: number;
  immediate?: boolean;
  force?: boolean;
  computeOnly?: boolean;
};

export type SelectedImageRefreshFn = (
  args?: SelectedImageRefreshArgs
) => NearestObliqueImageRecord[] | undefined;
