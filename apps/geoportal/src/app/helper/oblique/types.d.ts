export interface BasicObliqueImageRecord {
  id: string;
  perspectiveCenter: {
    x: number;
    y: number;
    z: number;
  };
  orientation: {
    omega: number; // in radians
    phi: number; // in radians
    kappa: number; // in radians
  };
  __debugRecord?: string;
}

export interface ObliqueImageRecord extends BasicObliqueImageRecord {
  centerWGS84: [number, number, number];
  waypointId: string;
  cameraId: string | null;
  calculatedHeading?: number; // in radians
  sector?: string; // N, E, S, W
}
