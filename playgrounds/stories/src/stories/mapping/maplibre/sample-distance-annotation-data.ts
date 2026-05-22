import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import type {
  AnnotationEdge,
  AnnotationNode,
  AnnotationNodeLink,
  CesiumGeographicCoordinate,
  StoredAnnotation,
} from "@carma-mapping/annotations/runtime";
import { RUNTIME_POINT_LABEL_COORDINATE_SELECTION } from "@carma-mapping/annotations/runtime";

import sampleMeasurementsGeoJsonRaw from "./data/sample-measurements.geojson?raw";

const { DISTANCE: ANNOTATION_TYPE_DISTANCE, POINT: ANNOTATION_TYPE_POINT } =
  ANNOTATION_TYPES;

export type MapLibreDistanceAnnotationData = {
  nodes: readonly AnnotationNode[];
  edges: readonly AnnotationEdge[];
  linkedNodeGroups: readonly AnnotationNodeLink[];
  annotationEntries: readonly StoredAnnotation[];
};

export type MapLibreDistanceLinePoint = {
  id: string;
  lng: number;
  lat: number;
  altitudeMeters: number;
};

export type SampleMeasurementPosition = {
  id: string;
  longitude: number;
  latitude: number;
  altitude: number;
};

export type SampleMeasurementLine = {
  id: string;
  label: string;
  displayName?: string;
  points: readonly [SampleMeasurementPosition, SampleMeasurementPosition];
};

export type SampleMeasurementPoint = {
  id: string;
  label: string;
  displayName?: string;
  point: SampleMeasurementPosition;
};

type AnnotationExportToolType =
  | typeof ANNOTATION_TYPE_DISTANCE
  | typeof ANNOTATION_TYPE_POINT;

type AnnotationExportCoordinate = {
  longitude: number;
  latitude: number;
  altitude: number;
};

type AnnotationExportNode = {
  order: number;
  coordinate: AnnotationExportCoordinate;
};

type AnnotationExportProperties = {
  exportVersion: number;
  annotationId: string;
  annotationKind: AnnotationExportToolType;
  annotation: StoredAnnotation;
  nodes: readonly AnnotationExportNode[];
};

type AnnotationExportFeature = GeoJSON.Feature<
  GeoJSON.Point | GeoJSON.LineString,
  AnnotationExportProperties
> & {
  id?: string | number;
};

type AnnotationExportFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point | GeoJSON.LineString,
  AnnotationExportProperties
>;

const SAMPLE_MEASUREMENTS_SOURCE = JSON.parse(
  sampleMeasurementsGeoJsonRaw
) as AnnotationExportFeatureCollection;

const SAMPLE_MEASUREMENT_FEATURES = SAMPLE_MEASUREMENTS_SOURCE.features;

export const SAMPLE_MEASUREMENT_IDS = SAMPLE_MEASUREMENT_FEATURES.map(
  (feature) => feature.properties.annotation.id
);

export const SAMPLE_DISTANCE_MEASUREMENT_IDS =
  SAMPLE_MEASUREMENT_FEATURES.flatMap((feature) =>
    feature.properties.annotation.toolType === ANNOTATION_TYPE_DISTANCE
      ? [feature.properties.annotation.id]
      : []
  );

const selectionValues = new Set<string>(
  Object.values(RUNTIME_POINT_LABEL_COORDINATE_SELECTION)
);

const finiteNumber = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) ? value : fallback;

const toAnnotationCoordinate = ({
  longitude,
  latitude,
  altitude,
}: AnnotationExportCoordinate): CesiumGeographicCoordinate => ({
  longitude,
  latitude,
  altitude,
});

const toPositionCoordinate = (
  position: readonly number[]
): AnnotationExportCoordinate => ({
  longitude: finiteNumber(position[0], 0),
  latitude: finiteNumber(position[1], 0),
  altitude: finiteNumber(position[2], 0),
});

const getFeaturePositions = (
  feature: AnnotationExportFeature
): readonly AnnotationExportCoordinate[] => {
  const coordinates = feature.geometry.coordinates;

  if (feature.geometry.type === "Point") {
    return [toPositionCoordinate(coordinates)];
  }

  return coordinates.map(toPositionCoordinate);
};

const getFeatureNodes = (
  feature: AnnotationExportFeature
): readonly AnnotationExportNode[] => {
  const nodes = [...(feature.properties.nodes ?? [])].sort(
    (left, right) => left.order - right.order
  );

  if (nodes.length > 0) {
    return nodes;
  }

  return getFeaturePositions(feature).map((coordinate, order) => ({
    order,
    coordinate,
  }));
};

const getFeatureNodeIds = (
  feature: AnnotationExportFeature
): readonly string[] => {
  const annotationNodeIds = feature.properties.annotation.nodeIds;

  if (annotationNodeIds.length > 0) {
    return annotationNodeIds;
  }

  return getFeatureNodes(feature).map(
    (_, index) => `${feature.properties.annotationId}-node-${index}`
  );
};

const resolveCoordinateSelection = (
  value: StoredAnnotation["distanceAnchorCoordinateSelection"]
): StoredAnnotation["distanceAnchorCoordinateSelection"] =>
  typeof value === "string" && selectionValues.has(value) ? value : undefined;

const createStoredAnnotation = (
  feature: AnnotationExportFeature
): StoredAnnotation => {
  const annotation = feature.properties.annotation;
  const distanceAnchorCoordinateSelection = resolveCoordinateSelection(
    annotation.distanceAnchorCoordinateSelection
  );

  return {
    id: annotation.id,
    toolType: annotation.toolType,
    nodeIds: getFeatureNodeIds(feature),
    edgeIds: annotation.edgeIds,
    ...(annotation.shortLabel ? { shortLabel: annotation.shortLabel } : {}),
    ...(annotation.displayName ? { displayName: annotation.displayName } : {}),
    ...(distanceAnchorCoordinateSelection
      ? { distanceAnchorCoordinateSelection }
      : {}),
  };
};

const createAnnotationNodes = (
  feature: AnnotationExportFeature
): AnnotationNode[] => {
  const nodeIds = getFeatureNodeIds(feature);

  return getFeatureNodes(feature).flatMap((node, index) => {
    const id = nodeIds[index];
    if (!id) return [];

    return [
      {
        id,
        coordinate: toAnnotationCoordinate(node.coordinate),
      },
    ];
  });
};

const createAnnotationEdge = (
  feature: AnnotationExportFeature
): AnnotationEdge[] => {
  if (feature.properties.annotation.toolType !== ANNOTATION_TYPE_DISTANCE) {
    return [];
  }

  const [startNodeId, endNodeId] = getFeatureNodeIds(feature);
  if (!startNodeId || !endNodeId) {
    return [];
  }

  return [
    {
      id:
        feature.properties.annotation.edgeIds[0] ??
        `${feature.properties.annotation.id}-edge`,
      startNodeId,
      endNodeId,
    },
  ];
};

const coordinateKey = (coordinate: CesiumGeographicCoordinate) =>
  [
    coordinate.longitude.toFixed(12),
    coordinate.latitude.toFixed(12),
    coordinate.altitude.toFixed(6),
  ].join(",");

const createLinkedNodeGroups = (
  nodes: readonly AnnotationNode[]
): AnnotationNodeLink[] => {
  const nodeIdsByCoordinate = new Map<string, string[]>();

  for (const node of nodes) {
    const key = coordinateKey(node.coordinate);
    nodeIdsByCoordinate.set(key, [
      ...(nodeIdsByCoordinate.get(key) ?? []),
      node.id,
    ]);
  }

  return [...nodeIdsByCoordinate.values()].flatMap((nodeIds, index) =>
    nodeIds.length > 1
      ? [
          {
            id: `sample-measurement-linked-node-${index + 1}`,
            nodeIds,
          },
        ]
      : []
  );
};

const toSamplePosition = ({
  id,
  coordinate,
}: {
  id: string;
  coordinate: CesiumGeographicCoordinate;
}): SampleMeasurementPosition => ({
  id,
  longitude: coordinate.longitude,
  latitude: coordinate.latitude,
  altitude: coordinate.altitude,
});

const createSampleMeasurementLine = (
  feature: AnnotationExportFeature
): SampleMeasurementLine[] => {
  if (feature.properties.annotation.toolType !== ANNOTATION_TYPE_DISTANCE) {
    return [];
  }

  const nodes = createAnnotationNodes(feature);
  const [startNode, endNode] = nodes;
  if (!startNode || !endNode) {
    return [];
  }

  const annotation = feature.properties.annotation;

  return [
    {
      id: annotation.id,
      label: annotation.shortLabel?.trim() || annotation.id,
      ...(annotation.displayName
        ? { displayName: annotation.displayName }
        : {}),
      points: [
        toSamplePosition({
          id: startNode.id,
          coordinate: startNode.coordinate,
        }),
        toSamplePosition({
          id: endNode.id,
          coordinate: endNode.coordinate,
        }),
      ],
    },
  ];
};

const createSampleMeasurementPoint = (
  feature: AnnotationExportFeature
): SampleMeasurementPoint[] => {
  if (feature.properties.annotation.toolType !== ANNOTATION_TYPE_POINT) {
    return [];
  }

  const node = createAnnotationNodes(feature)[0];
  if (!node) {
    return [];
  }

  const annotation = feature.properties.annotation;

  return [
    {
      id: annotation.id,
      label: annotation.shortLabel?.trim() || annotation.id,
      ...(annotation.displayName
        ? { displayName: annotation.displayName }
        : {}),
      point: toSamplePosition({
        id: node.id,
        coordinate: node.coordinate,
      }),
    },
  ];
};

const allSamplePositions =
  SAMPLE_MEASUREMENT_FEATURES.flatMap(getFeaturePositions);
const longitudeValues = allSamplePositions.map((point) => point.longitude);
const latitudeValues = allSamplePositions.map((point) => point.latitude);

export const SAMPLE_MEASUREMENTS_STORY_CENTER: [number, number] = [
  (Math.min(...longitudeValues) + Math.max(...longitudeValues)) / 2,
  (Math.min(...latitudeValues) + Math.max(...latitudeValues)) / 2,
];

export const SAMPLE_MEASUREMENT_LINES = SAMPLE_MEASUREMENT_FEATURES.flatMap(
  createSampleMeasurementLine
);

export const SAMPLE_MEASUREMENT_POINTS = SAMPLE_MEASUREMENT_FEATURES.flatMap(
  createSampleMeasurementPoint
);

export const createSampleMeasurementAnnotationData =
  (): MapLibreDistanceAnnotationData => {
    const nodes = SAMPLE_MEASUREMENT_FEATURES.flatMap(createAnnotationNodes);

    return {
      nodes,
      edges: SAMPLE_MEASUREMENT_FEATURES.flatMap(createAnnotationEdge),
      linkedNodeGroups: createLinkedNodeGroups(nodes),
      annotationEntries: SAMPLE_MEASUREMENT_FEATURES.map(
        createStoredAnnotation
      ),
    };
  };

export const getDistanceLinePointsFromAnnotationData = (
  data: MapLibreDistanceAnnotationData
): MapLibreDistanceLinePoint[] => {
  const nodeById = new Map(data.nodes.map((node) => [node.id, node] as const));

  return data.edges.flatMap((edge) =>
    [edge.startNodeId, edge.endNodeId].flatMap((nodeId) => {
      const node = nodeById.get(nodeId);
      if (!node) return [];

      return [
        {
          id: node.id,
          lng: node.coordinate.longitude,
          lat: node.coordinate.latitude,
          altitudeMeters: node.coordinate.altitude,
        },
      ];
    })
  );
};
