import type {
  SurveyNavigationGraph,
  SurveyNavigationNode,
} from "./survey-navigation";

export const PANORAMA_CORRECTIONS_STORAGE_KEY =
  "carma.pointcloud-stories.panorama-corrections.v1";

export type PanoramaCorrection = {
  forward: number;
  down: number;
  right: number;
  bearing: number;
  pitch: number;
  roll: number;
};

export type PanoramaCorrectionControlPoint = {
  panoramaId: string;
  correction: PanoramaCorrection;
  updatedAt: string;
};

export type PanoramaCorrectionDatabase = {
  format: "carma-panorama-corrections-v1";
  updatedAt: string;
  controlPoints: Record<string, PanoramaCorrectionControlPoint>;
};

export type ResolvedPanoramaCorrection = {
  correction: PanoramaCorrection;
  mode: "none" | "stored" | "interpolated" | "held";
  fromPanoramaId?: string;
  toPanoramaId?: string;
  fraction?: number;
};

export const ZERO_PANORAMA_CORRECTION: PanoramaCorrection = {
  forward: 0,
  down: 0,
  right: 0,
  bearing: 0,
  pitch: 0,
  roll: 0,
};

const correctionFields = [
  "forward",
  "down",
  "right",
  "bearing",
  "pitch",
  "roll",
] as const;

const sanitizeCorrection = (value: unknown): PanoramaCorrection | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PanoramaCorrection>;
  if (!correctionFields.every((field) => Number.isFinite(candidate[field]))) {
    return null;
  }
  return Object.fromEntries(
    correctionFields.map((field) => [field, candidate[field]])
  ) as PanoramaCorrection;
};

export const createEmptyPanoramaCorrectionDatabase = (
  updatedAt = new Date(0).toISOString()
): PanoramaCorrectionDatabase => ({
  format: "carma-panorama-corrections-v1",
  updatedAt,
  controlPoints: {},
});

export const readPanoramaCorrectionDatabase = (
  storage: Pick<Storage, "getItem"> = window.localStorage
) => {
  try {
    const serialized = storage.getItem(PANORAMA_CORRECTIONS_STORAGE_KEY);
    if (!serialized) return createEmptyPanoramaCorrectionDatabase();
    const candidate = JSON.parse(
      serialized
    ) as Partial<PanoramaCorrectionDatabase>;
    if (
      candidate.format !== "carma-panorama-corrections-v1" ||
      !candidate.controlPoints ||
      typeof candidate.controlPoints !== "object"
    ) {
      return createEmptyPanoramaCorrectionDatabase();
    }
    const controlPoints: Record<string, PanoramaCorrectionControlPoint> = {};
    for (const [panoramaId, value] of Object.entries(candidate.controlPoints)) {
      const correction = sanitizeCorrection(value?.correction);
      if (!correction || value?.panoramaId !== panoramaId) continue;
      controlPoints[panoramaId] = {
        panoramaId,
        correction,
        updatedAt:
          typeof value.updatedAt === "string"
            ? value.updatedAt
            : new Date(0).toISOString(),
      };
    }
    return {
      format: "carma-panorama-corrections-v1",
      updatedAt:
        typeof candidate.updatedAt === "string"
          ? candidate.updatedAt
          : new Date(0).toISOString(),
      controlPoints,
    } satisfies PanoramaCorrectionDatabase;
  } catch {
    return createEmptyPanoramaCorrectionDatabase();
  }
};

export const writePanoramaCorrectionDatabase = (
  database: PanoramaCorrectionDatabase,
  storage: Pick<Storage, "setItem"> = window.localStorage
) => {
  storage.setItem(PANORAMA_CORRECTIONS_STORAGE_KEY, JSON.stringify(database));
};

export const setPanoramaCorrectionControlPoint = (
  database: PanoramaCorrectionDatabase,
  panoramaId: string,
  correction: PanoramaCorrection,
  updatedAt = new Date().toISOString()
): PanoramaCorrectionDatabase => ({
  ...database,
  updatedAt,
  controlPoints: {
    ...database.controlPoints,
    [panoramaId]: { panoramaId, correction, updatedAt },
  },
});

export const deletePanoramaCorrectionControlPoint = (
  database: PanoramaCorrectionDatabase,
  panoramaId: string,
  updatedAt = new Date().toISOString()
) => {
  const controlPoints = { ...database.controlPoints };
  delete controlPoints[panoramaId];
  return { ...database, updatedAt, controlPoints };
};

const cumulativeStations = (nodes: SurveyNavigationNode[]) => {
  const stations = [0];
  for (let index = 1; index < nodes.length; index += 1) {
    stations.push(
      stations[index - 1] +
        Math.hypot(
          nodes[index].position[0] - nodes[index - 1].position[0],
          nodes[index].position[1] - nodes[index - 1].position[1]
        )
    );
  }
  return stations;
};

const interpolateCorrection = (
  from: PanoramaCorrection,
  to: PanoramaCorrection,
  fraction: number
) =>
  Object.fromEntries(
    correctionFields.map((field) => [
      field,
      from[field] + (to[field] - from[field]) * fraction,
    ])
  ) as PanoramaCorrection;

export const resolvePanoramaCorrections = (
  graph: SurveyNavigationGraph,
  database: PanoramaCorrectionDatabase
) => {
  const resolved = new Map<string, ResolvedPanoramaCorrection>();
  for (const nodes of graph.nodesByTrace.values()) {
    const stations = cumulativeStations(nodes);
    const anchors = nodes
      .map((node, index) => ({
        node,
        index,
        controlPoint: database.controlPoints[node.id],
      }))
      .filter(
        (
          anchor
        ): anchor is typeof anchor & {
          controlPoint: PanoramaCorrectionControlPoint;
        } => anchor.controlPoint !== undefined
      );
    if (anchors.length === 0) {
      for (const node of nodes) {
        resolved.set(node.id, {
          correction: { ...ZERO_PANORAMA_CORRECTION },
          mode: "none",
        });
      }
      continue;
    }
    let rightAnchorIndex = 0;
    for (let index = 0; index < nodes.length; index += 1) {
      while (
        rightAnchorIndex < anchors.length &&
        anchors[rightAnchorIndex].index < index
      ) {
        rightAnchorIndex += 1;
      }
      const exact =
        anchors[rightAnchorIndex]?.index === index
          ? anchors[rightAnchorIndex]
          : undefined;
      if (exact) {
        resolved.set(nodes[index].id, {
          correction: { ...exact.controlPoint.correction },
          mode: "stored",
          fromPanoramaId: exact.node.id,
          toPanoramaId: exact.node.id,
          fraction: 0,
        });
        continue;
      }
      const left = anchors[rightAnchorIndex - 1];
      const right = anchors[rightAnchorIndex];
      if (!left || !right) {
        const nearest = left ?? right;
        resolved.set(nodes[index].id, {
          correction: { ...nearest.controlPoint.correction },
          mode: "held",
          fromPanoramaId: nearest.node.id,
          toPanoramaId: nearest.node.id,
          fraction: 0,
        });
        continue;
      }
      const span = stations[right.index] - stations[left.index];
      const fraction =
        span <= Number.EPSILON
          ? 0
          : (stations[index] - stations[left.index]) / span;
      resolved.set(nodes[index].id, {
        correction: interpolateCorrection(
          left.controlPoint.correction,
          right.controlPoint.correction,
          fraction
        ),
        mode: "interpolated",
        fromPanoramaId: left.node.id,
        toPanoramaId: right.node.id,
        fraction,
      });
    }
  }
  return resolved;
};
