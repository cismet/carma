/** Asset types for consumers that do not enable resolveJsonModule. */
type Corridor = {
  coordinates: number[][];
  wayIds: number[];
  connectedWays: number;
  lengthMeters: number;
  maxEdgeMeters: number;
  sourceTag: string;
  completeness: string;
};

declare const cameraCorridors: {
  source: {
    source: string;
    query: string;
    capturedAt: string;
    license: string;
    attribution: string;
  };
  schwebebahn: Corridor & {
    crossSections: {
      nearBank: number[];
      farBank: number[];
      source: string;
    }[];
  };
  street: Corridor;
};

export default cameraCorridors;
