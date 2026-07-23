import { getFromWGS84ToUTM32 } from "@carma-geo/proj";

import roadCenterlinesJson from "../data/georadar-road-centerlines.json?raw";
import type { ImagePose } from "./oriented-imagery";

export const SURVEY_CONNECTION_RADIUS_METERS = 20;

type Point2 = [number, number];

type RoadCollection = {
  features: {
    properties: { name: string };
    geometry: { coordinates: [Point2, Point2][] };
  }[];
};

export type GeoradarSurveyTrace = {
  id: string;
  captureId: number;
  sceneManifestUrl: string;
  volumeMetadataUrl: string;
  centerlineUtm: Point2[];
  lengthMeters: number;
};

export type GeoradarSurveyManifest = {
  format: "carma-georadar-survey-v1";
  crs: "EPSG:25832";
  maximumConnectionRadiusMeters: number;
  traces: GeoradarSurveyTrace[];
};

export type SurveyNavigationNode = {
  id: string;
  traceId: string;
  traceIndex: number;
  position: Point2;
  streetName: string;
};

export type SurveyNavigationEdge = {
  from: string;
  to: string;
  kind: "ordered" | "cross-trace";
  distanceMeters: number;
};

export type SurveyNavigationGraph = {
  nodes: Map<string, SurveyNavigationNode>;
  nodesByTrace: Map<string, SurveyNavigationNode[]>;
  edges: SurveyNavigationEdge[];
  crossTraceEdges: SurveyNavigationEdge[];
  adjacency: Map<string, SurveyNavigationEdge[]>;
};

export type PanoramaNavigationTarget = {
  node: SurveyNavigationNode;
  continuation?: SurveyNavigationNode;
};

export const selectPanoramaNavigationTargetForBearing = ({
  targets,
  activePosition,
  bearingRadians,
  maximumDeviationRadians = Math.PI / 2,
}: {
  targets: readonly PanoramaNavigationTarget[];
  activePosition: Point2;
  bearingRadians: number;
  maximumDeviationRadians?: number;
}) => {
  const directionEast = Math.sin(bearingRadians);
  const directionNorth = Math.cos(bearingRadians);
  const minimumScore = Math.cos(maximumDeviationRadians);
  let bestTarget: PanoramaNavigationTarget | undefined;
  let bestScore = minimumScore;
  for (const target of targets) {
    const deltaEast = target.node.position[0] - activePosition[0];
    const deltaNorth = target.node.position[1] - activePosition[1];
    const distance = Math.hypot(deltaEast, deltaNorth);
    if (distance <= Number.EPSILON) continue;
    const score =
      (deltaEast * directionEast + deltaNorth * directionNorth) / distance;
    if (score > bestScore) {
      bestScore = score;
      bestTarget = target;
    }
  }
  return bestTarget;
};

const roadSegments = (
  JSON.parse(roadCenterlinesJson) as RoadCollection
).features.flatMap((feature) =>
  feature.geometry.coordinates.map(([start, end]) => ({
    name: feature.properties.name,
    start: getFromWGS84ToUTM32(
      start as Parameters<typeof getFromWGS84ToUTM32>[0]
    ) as Point2,
    end: getFromWGS84ToUTM32(
      end as Parameters<typeof getFromWGS84ToUTM32>[0]
    ) as Point2,
  }))
);

const pointToSegmentDistanceSquared = (
  point: Point2,
  start: Point2,
  end: Point2
) => {
  const deltaEast = end[0] - start[0];
  const deltaNorth = end[1] - start[1];
  const lengthSquared = deltaEast ** 2 + deltaNorth ** 2;
  const unit =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point[0] - start[0]) * deltaEast +
              (point[1] - start[1]) * deltaNorth) /
              lengthSquared
          )
        );
  const projectedEast = start[0] + unit * deltaEast;
  const projectedNorth = start[1] + unit * deltaNorth;
  return (point[0] - projectedEast) ** 2 + (point[1] - projectedNorth) ** 2;
};

export const getSurveyStreetName = (point: Point2) => {
  let nearestName = "Unbenannte Straße";
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;
  for (const segment of roadSegments) {
    const distanceSquared = pointToSegmentDistanceSquared(
      point,
      segment.start,
      segment.end
    );
    if (distanceSquared < nearestDistanceSquared) {
      nearestDistanceSquared = distanceSquared;
      nearestName = segment.name;
    }
  }
  return nearestName;
};

export const getPanoramaTraceId = (poseId: string) =>
  poseId.match(/^pano_(\d{6})_/)?.[1] ?? poseId;

const addEdge = (
  adjacency: Map<string, SurveyNavigationEdge[]>,
  edges: SurveyNavigationEdge[],
  edge: SurveyNavigationEdge
) => {
  edges.push(edge);
  const adjacent = adjacency.get(edge.from) ?? [];
  adjacent.push(edge);
  adjacency.set(edge.from, adjacent);
};

export const buildSurveyNavigationGraph = (nodes: SurveyNavigationNode[]) => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const nodesByTrace = new Map<string, SurveyNavigationNode[]>();
  for (const node of nodes) {
    const traceNodes = nodesByTrace.get(node.traceId) ?? [];
    traceNodes.push(node);
    nodesByTrace.set(node.traceId, traceNodes);
  }
  const edges: SurveyNavigationEdge[] = [];
  const crossTraceEdges: SurveyNavigationEdge[] = [];
  const adjacency = new Map<string, SurveyNavigationEdge[]>();
  for (const traceNodes of nodesByTrace.values()) {
    traceNodes.sort((left, right) => left.traceIndex - right.traceIndex);
    for (let index = 1; index < traceNodes.length; index += 1) {
      const left = traceNodes[index - 1];
      const right = traceNodes[index];
      const distanceMeters = Math.hypot(
        right.position[0] - left.position[0],
        right.position[1] - left.position[1]
      );
      addEdge(adjacency, edges, {
        from: left.id,
        to: right.id,
        kind: "ordered",
        distanceMeters,
      });
      addEdge(adjacency, edges, {
        from: right.id,
        to: left.id,
        kind: "ordered",
        distanceMeters,
      });
    }
  }

  const bestByTracePair = new Map<
    string,
    {
      left: SurveyNavigationNode;
      right: SurveyNavigationNode;
      distance: number;
    }
  >();
  const cellSize = SURVEY_CONNECTION_RADIUS_METERS;
  const cells = new Map<string, SurveyNavigationNode[]>();
  for (const node of nodes) {
    const cellEast = Math.floor(node.position[0] / cellSize);
    const cellNorth = Math.floor(node.position[1] / cellSize);
    for (let eastOffset = -1; eastOffset <= 1; eastOffset += 1) {
      for (let northOffset = -1; northOffset <= 1; northOffset += 1) {
        for (const candidate of cells.get(
          `${cellEast + eastOffset}:${cellNorth + northOffset}`
        ) ?? []) {
          if (candidate.traceId === node.traceId) continue;
          const distance = Math.hypot(
            node.position[0] - candidate.position[0],
            node.position[1] - candidate.position[1]
          );
          if (distance > SURVEY_CONNECTION_RADIUS_METERS) continue;
          const pair = [node.traceId, candidate.traceId].sort().join(":");
          const previous = bestByTracePair.get(pair);
          if (!previous || distance < previous.distance) {
            bestByTracePair.set(pair, {
              left: node,
              right: candidate,
              distance,
            });
          }
        }
      }
    }
    const key = `${cellEast}:${cellNorth}`;
    const cell = cells.get(key) ?? [];
    cell.push(node);
    cells.set(key, cell);
  }

  for (const { left, right, distance } of bestByTracePair.values()) {
    const forward: SurveyNavigationEdge = {
      from: left.id,
      to: right.id,
      kind: "cross-trace",
      distanceMeters: distance,
    };
    const backward: SurveyNavigationEdge = {
      from: right.id,
      to: left.id,
      kind: "cross-trace",
      distanceMeters: distance,
    };
    addEdge(adjacency, edges, forward);
    addEdge(adjacency, edges, backward);
    crossTraceEdges.push(forward, backward);
  }
  return { nodes: nodeMap, nodesByTrace, edges, crossTraceEdges, adjacency };
};

export const buildPanoramaNavigationGraph = (poses: ImagePose[]) =>
  buildSurveyNavigationGraph(
    poses.map((pose, traceIndex) => ({
      id: pose.id,
      traceId: getPanoramaTraceId(pose.id),
      traceIndex,
      position: [pose.utm[0], pose.utm[1]],
      streetName: getSurveyStreetName([pose.utm[0], pose.utm[1]]),
    }))
  );

const cumulativeDistance = (points: Point2[]) => {
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    distances.push(
      distances.at(-1)! +
        Math.hypot(
          points[index][0] - points[index - 1][0],
          points[index][1] - points[index - 1][1]
        )
    );
  }
  return distances;
};

const sampleTraceNodes = (trace: GeoradarSurveyTrace) => {
  const station = cumulativeDistance(trace.centerlineUtm);
  const nodes: SurveyNavigationNode[] = [];
  let nextStation = 0;
  for (let index = 0; index < trace.centerlineUtm.length; index += 1) {
    if (
      index !== trace.centerlineUtm.length - 1 &&
      station[index] < nextStation
    )
      continue;
    const position = trace.centerlineUtm[index];
    nodes.push({
      id: `radar:${trace.id}:${index}`,
      traceId: trace.id,
      traceIndex: index,
      position,
      streetName: getSurveyStreetName(position),
    });
    nextStation = station[index] + 10;
  }
  return nodes;
};

export const buildGeoradarNavigationGraph = (survey: GeoradarSurveyManifest) =>
  buildSurveyNavigationGraph(survey.traces.flatMap(sampleTraceNodes));

export const getPanoramaNavigationTargets = (
  graph: SurveyNavigationGraph,
  activeNodeId: string
): PanoramaNavigationTarget[] => {
  const active = graph.nodes.get(activeNodeId);
  if (!active) return [];
  const targets = new Map<string, SurveyNavigationNode>();
  for (const edge of graph.adjacency.get(activeNodeId) ?? []) {
    if (edge.kind !== "ordered") continue;
    const target = graph.nodes.get(edge.to);
    if (target) targets.set(target.id, target);
  }
  for (const edge of graph.crossTraceEdges) {
    const source = graph.nodes.get(edge.from);
    const target = graph.nodes.get(edge.to);
    if (
      source?.traceId === active.traceId &&
      target &&
      Math.hypot(
        source.position[0] - active.position[0],
        source.position[1] - active.position[1]
      ) <= SURVEY_CONNECTION_RADIUS_METERS
    ) {
      targets.set(target.id, target);
    }
  }
  return [...targets.values()].map((target) => {
    const incomingEast = target.position[0] - active.position[0];
    const incomingNorth = target.position[1] - active.position[1];
    const continuation = (graph.adjacency.get(target.id) ?? [])
      .filter((edge) => edge.kind === "ordered" && edge.to !== active.id)
      .map((edge) => graph.nodes.get(edge.to))
      .filter((node): node is SurveyNavigationNode => node !== undefined)
      .sort((left, right) => {
        const score = (node: SurveyNavigationNode) => {
          const outgoingEast = node.position[0] - target.position[0];
          const outgoingNorth = node.position[1] - target.position[1];
          const incomingLength = Math.hypot(incomingEast, incomingNorth);
          const outgoingLength = Math.hypot(outgoingEast, outgoingNorth);
          if (incomingLength === 0 || outgoingLength === 0) return -1;
          return (
            (incomingEast * outgoingEast + incomingNorth * outgoingNorth) /
            (incomingLength * outgoingLength)
          );
        };
        return score(right) - score(left);
      })[0];
    return { node: target, continuation };
  });
};
