import { ecefFromGeographicCoordinate } from "@carma-geo/proj";
import { carma } from "@carma-api";
import {
  type AnnotationGeographicCoordinate,
  type AnnotationEngine,
} from "@carma-mapping/annotations/core";

import { MESH_STATUS } from "./measurement-story-scene";

/** Fixture access and the user input the play functions simulate. */

// as the geoportal does in dev: the api on window for the console and tests
if (typeof window !== "undefined") window.carma = carma;

type FixtureFeature = {
  id: string;
  properties: {
    carmaConf: {
      annotationRuntime: {
        nodes: { coordinate: AnnotationGeographicCoordinate }[];
      };
    };
  };
};
export type FixtureCollection = { type: string; features: FixtureFeature[] };

/** The geoportal's test scene measurements: one of every type at the Rathaus Barmen courtyard. */
export const loadMeasurementStoryFixture = async () =>
  (
    await import(
      "../../../../../../apps/geoportal/src/app/test-scenes/rathaus-barmen-measurements.json"
    )
  ).default as FixtureCollection;

export const fixtureSubset = (
  fixture: FixtureCollection,
  annotationIds: readonly string[]
): FixtureCollection => ({
  ...fixture,
  features: fixture.features.filter((feature) =>
    annotationIds.includes(feature.id)
  ),
});

export const fixtureCoordinates = (
  fixture: FixtureCollection,
  annotationId: string
): AnnotationGeographicCoordinate[] =>
  fixture.features
    .find((feature) => feature.id === annotationId)
    ?.properties.carmaConf.annotationRuntime.nodes.map(
      (node) => node.coordinate
    ) ?? [];

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Polls until the check returns a value, or gives up at the deadline. */
const pollFor = async <T>(
  check: () => T | null | undefined,
  { timeoutMs = 60_000, intervalMs = 200 } = {}
): Promise<T | null> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await sleep(intervalMs);
  }
  return null;
};

/** The story's runtime answers carma.annotations and the mesh is in; then a settle pause. */
export const waitForMeasurementStory = async (
  root: HTMLElement,
  settleMs = 1500
) => {
  const ready = await pollFor(
    () =>
      carma.annotations.isAvailable() &&
      root.ownerDocument.querySelector(
        '[data-test-id="measurement-story-status"]'
      )?.textContent === MESH_STATUS.RECEIVED
  );
  if (ready) await sleep(settleMs);
  return Boolean(ready);
};

/** Long-press targets of a node: its marker, or the label of a point or label. */
const nodeMarkerSelector = (annotationId: string, nodeIndex: number) => {
  const label = `[data-label-overlay-id="committed-runtime-point-label-${annotationId}-label"]`;
  return [
    `[data-label-overlay-id="committed-runtime-point-marker-${annotationId}-node-${nodeIndex}"] [data-runtime-point-marker-circle]`,
    ...(nodeIndex === 0
      ? [
          `${label} [data-pillbutton-root]`,
          `${label} [data-point-label-content-root]`,
        ]
      : []),
  ].join(", ");
};

const isPlaced = (element: Element | null): element is HTMLElement => {
  const box = element?.getBoundingClientRect();
  return Boolean(box && (box.left > 0 || box.top > 0));
};

/** Opens the move gizmo on a node as a user does: a long press on its marker. */
export const pressNodeMarker = async (
  root: HTMLElement,
  annotationId: string,
  nodeIndex: number,
  holdMs = 450
) => {
  const marker = await pollFor(() => {
    const element = root.ownerDocument.querySelector(
      nodeMarkerSelector(annotationId, nodeIndex)
    );
    return isPlaced(element) ? element : null;
  });
  if (!marker) return false;
  const box = marker.getBoundingClientRect();
  const init = {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: box.left + box.width / 2,
    clientY: box.top + box.height / 2,
  };
  marker.dispatchEvent(new MouseEvent("mousedown", init));
  await sleep(holdMs);
  marker.dispatchEvent(new MouseEvent("mouseup", init));
  return true;
};

/** Share of the way from the next node toward the centroid: a rim node lets the pick slip. */
const DRAFT_POINTER_INSET = 0.12;

const draftPointerTargets = new WeakMap<
  HTMLCanvasElement,
  {
    engine: AnnotationEngine;
    positionECEF: ReturnType<typeof ecefFromGeographicCoordinate>;
  }
>();

/** Remembers where a draft story's pointer goes: just inside the node after the drafted ones. */
export const aimDraftPointer = (
  engine: AnnotationEngine,
  coordinates: readonly AnnotationGeographicCoordinate[],
  draftedNodes: number
) => {
  const positions = coordinates.map((coordinate) =>
    ecefFromGeographicCoordinate(coordinate)
  );
  const next = positions[draftedNodes] ?? positions.at(-1);
  if (!next) return;
  const centroid = positions
    .reduce((sum, position) => sum.add(position), next.clone().setScalar(0))
    .divideScalar(positions.length);
  draftPointerTargets.set(engine.canvas, {
    engine,
    positionECEF: next.clone().lerp(centroid, DRAFT_POINTER_INSET),
  });
};

/** Moves the pointer onto the aimed spot once the camera holds still, so the rubber band shows. */
export const pointDraftAtNextNode = async (
  root: HTMLElement,
  settleMs = 600
) => {
  let previous: { x: number; y: number } | null = null;
  let stableSince = Date.now();
  const target = await pollFor(
    () => {
      const canvas = root.ownerDocument.querySelector<HTMLCanvasElement>(
        "canvas.maplibregl-canvas"
      );
      const aim = canvas && draftPointerTargets.get(canvas);
      const screen = aim?.engine.worldToScreen(aim.positionECEF);
      if (!canvas || !screen) return null;
      if (
        !previous ||
        Math.hypot(screen.x - previous.x, screen.y - previous.y) > 0.5
      ) {
        stableSince = Date.now();
      }
      previous = { x: screen.x, y: screen.y };
      return Date.now() - stableSince >= settleMs ? { canvas, screen } : null;
    },
    { intervalMs: 100 }
  );
  if (!target) return false;
  const box = target.canvas.getBoundingClientRect();
  target.canvas.dispatchEvent(
    new PointerEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      pointerType: "mouse",
      clientX: box.left + target.screen.x,
      clientY: box.top + target.screen.y,
    })
  );
  return true;
};
