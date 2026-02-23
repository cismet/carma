/* @refresh reset */
import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  BoundingSphere,
  Cartesian3,
  Cartesian4,
  Color,
  ColorGeometryInstanceAttribute,
  CoplanarPolygonGeometry,
  Ellipsoid,
  GeometryInstance,
  Matrix4,
  PerInstanceColorAppearance,
  Primitive,
  PrimitiveCollection,
  SceneTransforms,
  Transforms,
  defined,
  type Cartesian2,
  type Scene,
} from "@carma/cesium";
import {
  createLineVisualizer,
  type LineVisualizer,
} from "@carma-mapping/engines/cesium/legacy";
import {
  createPlacement,
  computePointLabelLayout,
  formatNumberToEnclosed,
  getPerspectiveStemAngleMagnitude,
  PointLabel,
  POINT_LABEL_HOVER_BACKGROUND_COLOR,
  POINT_LABEL_SELECTED_BACKGROUND_COLOR,
  POINT_LABEL_TEXT_BACKGROUND_COLOR,
  resolvePointLabelLayoutConfig,
  useLabelOverlay,
  useLineVisualizers,
  type LayoutPointInput,
  type LineVisualizerData,
  type PointLabelAttach,
  type PointLabelLayoutResult,
} from "@carma-providers/label-overlay";

import {
  type DirectLineLabelMode,
  type PlanarPolygonGroup,
  type PointDistanceRelation,
  type PointMeasurementEntry,
  type ReferenceLineLabelKind,
} from "../types/MeasurementTypes";
import {
  REFERENCE_LINE_EPSILON_METERS,
  computePolygonCentroid2D,
  getArcPointsInSpannedPlane,
  getRoofRoofSharedEdgeRelationIdSet,
  getSplitMarkerRelationIdSetForGroups,
  getSplitMarkerRelationIdSet,
  hasVisibleDistanceRelationComponentLines,
  isDistanceRelationHorizontalLineVisible,
  isDistanceRelationVerticalLineVisible,
  resolveDistanceRelation,
  type ResolvedDistanceRelation,
  type ScreenPoint2D,
} from "../utils/distanceVisualization";
import { formatAreaAdaptive, formatNumber } from "../utils/formatting";
import { getCustomPointMeasurementName } from "../utils/measurementNaming";

export type CesiumDistanceVisualizerOptions = {
  distanceRelations?: PointDistanceRelation[];
  planarPolygonGroups?: PlanarPolygonGroup[];
  facadeRectanglePreviewOppositeByGroupId?: Readonly<
    Record<string, Cartesian3>
  >;
  selectedPlanarPolygonGroupId?: string | null;
  activePlanarPolygonGroupId?: string | null;
  onPlanarPolygonClick?: (polygonGroupId: string) => void;
  onDistanceLineLabelToggle?: (
    relationId: string,
    kind: ReferenceLineLabelKind
  ) => void;
  onDistanceLineClick?: (
    relationId: string,
    kind: ReferenceLineLabelKind
  ) => void;
  onDistanceRelationMidpointClick?: (relationId: string) => void;
  lineLabelMinDistancePx?: number;
  onDistanceRelationCornerClick?: (relationId: string) => void;
  cumulativeDistanceByRelationId?: Readonly<Record<string, number>>;
};

// EN component color: light mix of the standard East (red) and North (green) axis colors.
const REFERENCE_COMPONENT_HORIZONTAL_COLOR = "rgba(188, 194, 102, 0.95)";
// U component color: lighter blue for better readability and a softer look.
const REFERENCE_COMPONENT_VERTICAL_COLOR = "rgba(111, 168, 255, 0.96)";
const REFERENCE_COMPONENT_ARC_COLOR = "rgba(246, 248, 255, 0.95)";
const REFERENCE_COMPONENT_LINE_STROKE_WIDTH_PX = 1.25;
const CORNER_OVERLAY_ID_PREFIX = "distance-right-angle-corner";
const MIDPOINT_OVERLAY_ID_PREFIX = "distance-edge-midpoint";
const POLYGON_PREVIEW_OVERLAY_ID_PREFIX = "distance-polygon-preview";
const FACADE_CORNER_OVERLAY_ID_PREFIX = "distance-facade-corner";
const CORNER_OVERLAY_MIN_BOX_PX = 20;
const CORNER_OVERLAY_PADDING_PX = 6;
const CORNER_OVERLAY_TARGET_RADIUS_PX = 20;
const CORNER_OVERLAY_DOT_RADIUS_PX =
  REFERENCE_COMPONENT_LINE_STROKE_WIDTH_PX / 2;
const CORNER_OVERLAY_SEGMENTS = 20;
const MIDPOINT_MARKER_HIT_TARGET_PX = 14;
const MIDPOINT_MARKER_TICK_LENGTH_PX = 8;
const MIDPOINT_MARKER_TICK_WIDTH_PX = 1.25;
const POLYGON_PREVIEW_PADDING_PX = 6;
const POLYGON_PREVIEW_FILL_ROOF_OPEN = "rgba(239, 223, 145, 0.20)";
const POLYGON_PREVIEW_FILL_ROOF_CLOSED = "rgba(239, 223, 145, 0.30)";
const POLYGON_PREVIEW_FILL_FACADE_OPEN = "rgba(111, 168, 255, 0.20)";
const POLYGON_PREVIEW_FILL_FACADE_CLOSED = "rgba(111, 168, 255, 0.30)";
const POLYGON_PREVIEW_FILL_TERRAIN_OPEN = "rgba(107, 188, 123, 0.20)";
const POLYGON_PREVIEW_FILL_TERRAIN_CLOSED = "rgba(107, 188, 123, 0.30)";
const POLYGON_PREVIEW_FILL_FOOTPRINT_OPEN = "rgba(226, 232, 240, 0.20)";
const POLYGON_PREVIEW_FILL_FOOTPRINT_CLOSED = "rgba(226, 232, 240, 0.32)";
const FACADE_RECTANGLE_COMPONENT_EPSILON_METERS = 0.05;
const POLYGON_FILL_ALPHA = 0.25;
const POLYGON_FILL_SELECTED_ALPHA = 0.35;
const POLYGON_STRIPE_SIZE_PX = 6;
const POLYGON_STRIPE_WIDTH_PX = 1.5;
const POLYGON_PREVIEW_STROKE = "rgba(255, 255, 255, 0.65)";
const POLYGON_PREVIEW_STROKE_WIDTH_PX = 1;
const FACADE_CORNER_MARKER_SIZE_PX = 10;
const FACADE_CORNER_MARKER_STROKE_WIDTH_PX = 1;
const POLYGON_AREA_LABEL_COLOR = "#111111";
const POLYGON_AREA_LABEL_FONT_SIZE_PX = 12;
const POLYGON_AREA_LABEL_FONT_FAMILY = "Arial, sans-serif";
const POLYGON_AREA_LABEL_FONT_WEIGHT = "400";
const POLYGON_OVERLAY_MAX_BOUNDS_SCALE = 2.5;
const LABEL_REFERENCE_MIN_DISTANCE_PX = 24;
const LABEL_REFERENCE_MAX_DISTANCE_PX = 48;
const LABEL_INSIDE_BLEND_FACTOR = 0.35;
const VERTICAL_COMPONENT_LABEL_OFFSET_PX = 8;
const DISTANCE_PAIR_LABEL_OVERLAY_ID_PREFIX = "distance-pair-label";
const DEFAULT_PAIR_LABEL_ATTACH = "bottomLeft";
const LABEL_ATTACH_ORDER_WITH_POINT_LABEL: PointLabelAttach[] = [
  "topLeft",
  "topRight",
  "bottomRight",
  "bottomLeft",
];
const LABEL_ATTACH_ORDER_NO_POINT_LABEL: PointLabelAttach[] = [
  "bottomLeft",
  "bottomRight",
  "topRight",
  "topLeft",
];
const EMPTY_PAIR_LABEL_LAYOUT_RESULT: PointLabelLayoutResult = {
  placements: {},
  hiddenByLayout: new Set<string>(),
};

const clampToRange = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const destroyLineVisualizerMap = (lineRefs: {
  current: Record<string, LineVisualizer>;
}) => {
  Object.values(lineRefs.current).forEach((lineVisualizer) => {
    lineVisualizer.destroy();
  });
  lineRefs.current = {};
};

const getPolygonPreviewFillColor = (
  surfaceType: PlanarPolygonGroup["surfaceType"],
  isClosed: boolean
) => {
  if (surfaceType === "facade") {
    return isClosed
      ? POLYGON_PREVIEW_FILL_FACADE_CLOSED
      : POLYGON_PREVIEW_FILL_FACADE_OPEN;
  }
  if (surfaceType === "terrain") {
    return isClosed
      ? POLYGON_PREVIEW_FILL_TERRAIN_CLOSED
      : POLYGON_PREVIEW_FILL_TERRAIN_OPEN;
  }
  if (surfaceType === "footprint") {
    return isClosed
      ? POLYGON_PREVIEW_FILL_FOOTPRINT_CLOSED
      : POLYGON_PREVIEW_FILL_FOOTPRINT_OPEN;
  }

  return isClosed
    ? POLYGON_PREVIEW_FILL_ROOF_CLOSED
    : POLYGON_PREVIEW_FILL_ROOF_OPEN;
};

const getPolygonFillCesiumColor = (
  surfaceType: PlanarPolygonGroup["surfaceType"],
  isSelected: boolean
): Color => {
  const alpha = isSelected ? POLYGON_FILL_SELECTED_ALPHA : POLYGON_FILL_ALPHA;
  if (surfaceType === "facade") return new Color(0.44, 0.66, 1.0, alpha);
  if (surfaceType === "terrain") return new Color(0.42, 0.74, 0.48, alpha);
  if (surfaceType === "footprint") return new Color(0.89, 0.91, 0.94, alpha);
  return new Color(0.94, 0.87, 0.57, alpha); // roof
};

const getPolygonStripeColor = (
  surfaceType: PlanarPolygonGroup["surfaceType"]
): string => {
  if (surfaceType === "facade") return "rgba(111, 168, 255, 0.35)";
  if (surfaceType === "terrain") return "rgba(107, 188, 123, 0.35)";
  if (surfaceType === "footprint") return "rgba(226, 232, 240, 0.35)";
  return "rgba(239, 223, 145, 0.35)"; // roof
};

const buildFacadeRectangleCornerFromDiagonal = (
  firstCorner: Cartesian3,
  oppositeCorner: Cartesian3
) => {
  const up = Cartesian3.normalize(firstCorner, new Cartesian3());
  const diagonal = Cartesian3.subtract(
    oppositeCorner,
    firstCorner,
    new Cartesian3()
  );
  const verticalMeters = Cartesian3.dot(diagonal, up);
  const verticalComponent = Cartesian3.multiplyByScalar(
    up,
    verticalMeters,
    new Cartesian3()
  );
  const horizontalComponent = Cartesian3.subtract(
    diagonal,
    verticalComponent,
    new Cartesian3()
  );
  const horizontalMeters = Cartesian3.magnitude(horizontalComponent);
  const verticalAbsoluteMeters = Math.abs(verticalMeters);

  if (
    horizontalMeters < FACADE_RECTANGLE_COMPONENT_EPSILON_METERS ||
    verticalAbsoluteMeters < FACADE_RECTANGLE_COMPONENT_EPSILON_METERS
  ) {
    return null;
  }

  const adjacentHorizontalCorner = Cartesian3.add(
    firstCorner,
    horizontalComponent,
    new Cartesian3()
  );
  const adjacentVerticalCorner = Cartesian3.add(
    firstCorner,
    verticalComponent,
    new Cartesian3()
  );

  return {
    adjacentHorizontalCorner,
    adjacentVerticalCorner,
  };
};

const getProjectedHorizontalAreaSquareMeters = (vertices: Cartesian3[]) => {
  if (vertices.length < 3) return 0;
  const ellipsoid = Ellipsoid.WGS84;
  const cartographics = vertices
    .map((vertex) => ellipsoid.cartesianToCartographic(vertex))
    .filter((cartographic): cartographic is NonNullable<typeof cartographic> =>
      Boolean(cartographic)
    );
  if (cartographics.length < 3) return 0;

  let lowestIndex = 0;
  for (let index = 1; index < cartographics.length; index += 1) {
    if (
      (cartographics[index]?.height ?? Number.POSITIVE_INFINITY) <
      (cartographics[lowestIndex]?.height ?? Number.POSITIVE_INFINITY)
    ) {
      lowestIndex = index;
    }
  }

  const lowest = cartographics[lowestIndex];
  if (!lowest) return 0;
  const lowestHeight = lowest.height;
  const anchor = Cartesian3.fromRadians(
    lowest.longitude,
    lowest.latitude,
    lowestHeight
  );
  const enuFrame = Transforms.eastNorthUpToFixedFrame(anchor, ellipsoid);
  const east4 = Matrix4.getColumn(enuFrame, 0, new Cartesian4());
  const north4 = Matrix4.getColumn(enuFrame, 1, new Cartesian4());
  const east = Cartesian3.normalize(
    new Cartesian3(east4.x, east4.y, east4.z),
    new Cartesian3()
  );
  const north = Cartesian3.normalize(
    new Cartesian3(north4.x, north4.y, north4.z),
    new Cartesian3()
  );

  const coords = cartographics.map((cartographic) => {
    const auxiliaryPoint = Cartesian3.fromRadians(
      cartographic.longitude,
      cartographic.latitude,
      lowestHeight
    );
    const delta = Cartesian3.subtract(auxiliaryPoint, anchor, new Cartesian3());
    return {
      x: Cartesian3.dot(delta, east),
      y: Cartesian3.dot(delta, north),
    };
  });

  let shoelace = 0;
  for (let index = 0; index < coords.length; index += 1) {
    const current = coords[index];
    const next = coords[(index + 1) % coords.length];
    if (!current || !next) continue;
    shoelace += current.x * next.y - current.y * next.x;
  }
  return Math.abs(shoelace) * 0.5;
};

const getPolygonAreaLabelText = (
  group: PlanarPolygonGroup,
  vertices: Cartesian3[]
) => {
  const planarArea = Math.max(0, group.areaSquareMeters ?? 0);
  const projectedHorizontalArea =
    getProjectedHorizontalAreaSquareMeters(vertices);
  const showProjectedHorizontalArea =
    planarArea > 0 && projectedHorizontalArea < planarArea * 0.99;

  return {
    planarText: formatAreaAdaptive(planarArea),
    projectedHorizontalText: showProjectedHorizontalArea
      ? `(${formatAreaAdaptive(projectedHorizontalArea)})`
      : null,
  };
};

export const useCesiumDistanceVisualizer = (
  scene: Scene | null,
  points: PointMeasurementEntry[],
  {
    distanceRelations = [],
    planarPolygonGroups = [],
    facadeRectanglePreviewOppositeByGroupId,
    selectedPlanarPolygonGroupId = null,
    activePlanarPolygonGroupId = null,
    onPlanarPolygonClick,
    onDistanceLineLabelToggle,
    onDistanceLineClick,
    onDistanceRelationMidpointClick,
    lineLabelMinDistancePx = 50,
    onDistanceRelationCornerClick,
    cumulativeDistanceByRelationId,
  }: CesiumDistanceVisualizerOptions
) => {
  const directLineRefs = useRef<Record<string, LineVisualizer>>({});
  const facadePreviewEdgeLineRefs = useRef<Record<string, LineVisualizer>>({});
  const verticalLineRefs = useRef<Record<string, LineVisualizer>>({});
  const horizontalLineRefs = useRef<Record<string, LineVisualizer>>({});
  const facadeCornerOverlayIdsRef = useRef<string[]>([]);
  const cornerOverlayIdsRef = useRef<string[]>([]);
  const midpointOverlayIdsRef = useRef<string[]>([]);
  const polygonPreviewOverlayIdsRef = useRef<string[]>([]);
  const distancePairLabelOverlayIdsRef = useRef<string[]>([]);
  const [cameraPitch, setCameraPitch] = useState(-Math.PI / 4);
  const polygonPrimitiveCollectionRef = useRef<PrimitiveCollection | null>(
    null
  );

  const { addLabelOverlayElement, removeLabelOverlayElement } =
    useLabelOverlay();

  const pointsById = useMemo(() => {
    const map = new Map<string, PointMeasurementEntry>();
    points.forEach((point) => {
      map.set(point.id, point);
    });
    return map;
  }, [points]);
  const pointLabelLayoutConfig = useMemo(
    () => resolvePointLabelLayoutConfig(),
    []
  );
  const enclosedPointLabelById = useMemo(() => {
    const labelById: Record<string, string> = {};
    points.forEach((point, index) => {
      labelById[point.id] =
        getCustomPointMeasurementName(point.name) ??
        formatNumberToEnclosed(index + 1);
    });
    return labelById;
  }, [points]);

  const splitMarkerRelationIdSet = useMemo(() => {
    return getSplitMarkerRelationIdSet(planarPolygonGroups);
  }, [planarPolygonGroups]);
  const roofRoofSharedEdgeRelationIdSet = useMemo(() => {
    return getRoofRoofSharedEdgeRelationIdSet(planarPolygonGroups);
  }, [planarPolygonGroups]);
  const midpointTickRelationIdSet = useMemo(() => {
    const activeOrSelectedGroupIds = new Set<string>();
    if (selectedPlanarPolygonGroupId) {
      activeOrSelectedGroupIds.add(selectedPlanarPolygonGroupId);
    }
    if (activePlanarPolygonGroupId) {
      activeOrSelectedGroupIds.add(activePlanarPolygonGroupId);
    }
    return getSplitMarkerRelationIdSetForGroups(
      planarPolygonGroups,
      activeOrSelectedGroupIds
    );
  }, [
    activePlanarPolygonGroupId,
    planarPolygonGroups,
    selectedPlanarPolygonGroupId,
  ]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;
    const camera = scene.camera;

    const updatePitch = () => {
      const nextPitch = camera.pitch;
      setCameraPitch((prev) =>
        Math.abs(nextPitch - prev) > 0.001 ? nextPitch : prev
      );
    };

    updatePitch();
    const removeChangedListener = camera.changed.addEventListener(updatePitch);
    const removeMoveEndListener = camera.moveEnd.addEventListener(updatePitch);

    return () => {
      removeChangedListener?.();
      removeMoveEndListener?.();
    };
  }, [scene]);

  const focusedGroupId =
    selectedPlanarPolygonGroupId ?? activePlanarPolygonGroupId ?? null;
  const edgeRelationOwnerGroupIdSet = useMemo(() => {
    if (!focusedGroupId) return new Set<string>();
    const focusedGroup = planarPolygonGroups.find(
      (group) => group.id === focusedGroupId
    );
    return new Set(focusedGroup?.edgeRelationIds ?? []);
  }, [focusedGroupId, planarPolygonGroups]);

  const resolvedRelations = useMemo(
    () =>
      distanceRelations
        .map((relation) => resolveDistanceRelation(relation, pointsById))
        .filter((relation): relation is ResolvedDistanceRelation =>
          Boolean(relation)
        ),
    [distanceRelations, pointsById]
  );

  const distancePairLabels = useMemo(
    () =>
      resolvedRelations
        .filter(
          ({ relation }) =>
            relation.showDirectLine &&
            !splitMarkerRelationIdSet.has(relation.id)
        )
        .map(({ relation, pointA, pointB }) => {
          const higherPoint =
            pointA.geometryWGS84.height >= pointB.geometryWGS84.height
              ? pointA
              : pointB;
          const lowerPoint = higherPoint.id === pointA.id ? pointB : pointA;
          const higherLabel = enclosedPointLabelById[higherPoint.id];
          const lowerLabel = enclosedPointLabelById[lowerPoint.id];

          return {
            relationId: relation.id,
            higherPoint,
            text: `${higherLabel} ↔ ${lowerLabel}`,
          };
        }),
    [enclosedPointLabelById, resolvedRelations, splitMarkerRelationIdSet]
  );

  const distancePairLabelAttachOverrideByRelationId = useMemo(() => {
    const relationIdsByPointId = new Map<string, string[]>();

    distancePairLabels.forEach(({ relationId, higherPoint }) => {
      const existingRelationIds =
        relationIdsByPointId.get(higherPoint.id) ?? [];
      relationIdsByPointId.set(higherPoint.id, [
        ...existingRelationIds,
        relationId,
      ]);
    });

    return Array.from(relationIdsByPointId.entries()).reduce<
      Record<string, PointLabelAttach>
    >((accumulator, [pointId, relationIds]) => {
      const point = pointsById.get(pointId);
      const hasCompanionPointLabel = Boolean(point && !point.distanceAdhocNode);
      const attachOrder = hasCompanionPointLabel
        ? LABEL_ATTACH_ORDER_WITH_POINT_LABEL
        : LABEL_ATTACH_ORDER_NO_POINT_LABEL;

      relationIds.forEach((relationId, index) => {
        if (!hasCompanionPointLabel && relationIds.length <= 1) {
          return;
        }
        const attach = attachOrder[index % attachOrder.length];
        if (!attach) return;
        accumulator[relationId] = attach;
      });

      return accumulator;
    }, {});
  }, [distancePairLabels, pointsById]);

  const distancePairLabelLayoutResult = useMemo(() => {
    if (!scene || scene.isDestroyed()) {
      return EMPTY_PAIR_LABEL_LAYOUT_RESULT;
    }

    const pointLabelObstacleLayoutPoints: LayoutPointInput[] = points
      .map((point, index) => {
        const anchor = SceneTransforms.worldToWindowCoordinates(
          scene,
          point.geometryECEF
        );
        if (!defined(anchor)) return null;
        return {
          id: `point-label-obstacle-${point.id}`,
          anchor: { x: anchor.x, y: anchor.y },
          text: enclosedPointLabelById[point.id] ?? "",
          index,
          layoutPriority: 1,
        };
      })
      .filter((entry) => entry !== null);

    const pairLabelLayoutPoints: LayoutPointInput[] = distancePairLabels
      .map((entry, index) => {
        const anchor = SceneTransforms.worldToWindowCoordinates(
          scene,
          entry.higherPoint.geometryECEF
        );
        if (!defined(anchor)) return null;
        return {
          id: entry.relationId,
          anchor: { x: anchor.x, y: anchor.y },
          text: entry.text,
          index: points.length + index,
          layoutPriority: 2,
        };
      })
      .filter((entry) => entry !== null);

    const layoutPoints: LayoutPointInput[] = [
      ...pointLabelObstacleLayoutPoints,
      ...pairLabelLayoutPoints,
    ];

    if (layoutPoints.length === 0) {
      return EMPTY_PAIR_LABEL_LAYOUT_RESULT;
    }

    return computePointLabelLayout({
      points: layoutPoints,
      viewportWidth: Math.max(
        1,
        scene.canvas.clientWidth || scene.canvas.width
      ),
      viewportHeight: Math.max(
        1,
        scene.canvas.clientHeight || scene.canvas.height
      ),
      cameraPitch,
      config: pointLabelLayoutConfig,
    });
  }, [
    cameraPitch,
    distancePairLabels,
    enclosedPointLabelById,
    pointLabelLayoutConfig,
    points,
    scene,
  ]);

  useEffect(() => {
    distancePairLabelOverlayIdsRef.current.forEach((overlayId) => {
      removeLabelOverlayElement(overlayId);
    });
    distancePairLabelOverlayIdsRef.current = [];

    if (!scene || scene.isDestroyed()) {
      return;
    }

    const nextOverlayIds: string[] = [];
    const cameraResponsiveAngleMagnitude = getPerspectiveStemAngleMagnitude(
      cameraPitch,
      pointLabelLayoutConfig
    );

    distancePairLabels.forEach(({ relationId, higherPoint, text }) => {
      const overlayId = `${DISTANCE_PAIR_LABEL_OVERLAY_ID_PREFIX}-${relationId}`;
      const layoutPlacement =
        distancePairLabelLayoutResult.placements[relationId] ?? undefined;
      const attachOverride =
        distancePairLabelAttachOverrideByRelationId[relationId] ?? undefined;
      const placement = attachOverride
        ? createPlacement(
            attachOverride,
            layoutPlacement?.distance ?? pointLabelLayoutConfig.stemDistance,
            cameraResponsiveAngleMagnitude
          )
        : layoutPlacement;
      const isHiddenByLayout = attachOverride
        ? false
        : distancePairLabelLayoutResult.hiddenByLayout.has(relationId);

      addLabelOverlayElement({
        id: overlayId,
        zIndex: 18,
        getCanvasPosition: () => {
          if (!scene || scene.isDestroyed()) return null;
          const anchor = SceneTransforms.worldToWindowCoordinates(
            scene,
            higherPoint.geometryECEF
          );
          if (!defined(anchor)) return null;
          return { x: anchor.x, y: anchor.y };
        },
        content: createElement(PointLabel, {
          pointId: relationId,
          text,
          pitch: cameraPitch,
          labelAngleRad: placement?.angleRad,
          labelDistance: placement?.distance,
          labelAttach: placement?.attach ?? DEFAULT_PAIR_LABEL_ATTACH,
          hideMarker: true,
          hideLabelAndStem: false,
          fontSize: "11px",
          fontFamily: "Arial, sans-serif",
          textColor: "#111111",
          textBackgroundColor: POINT_LABEL_TEXT_BACKGROUND_COLOR,
          selectedBackgroundColor: POINT_LABEL_SELECTED_BACKGROUND_COLOR,
          hoverBackgroundColor: POINT_LABEL_HOVER_BACKGROUND_COLOR,
        }),
        visible: true,
        isHidden: isHiddenByLayout,
      });

      nextOverlayIds.push(overlayId);
    });

    distancePairLabelOverlayIdsRef.current = nextOverlayIds;

    return () => {
      nextOverlayIds.forEach((overlayId) => {
        removeLabelOverlayElement(overlayId);
      });
      distancePairLabelOverlayIdsRef.current = [];
    };
  }, [
    addLabelOverlayElement,
    distancePairLabels,
    distancePairLabelAttachOverrideByRelationId,
    distancePairLabelLayoutResult,
    removeLabelOverlayElement,
    cameraPitch,
    pointLabelLayoutConfig,
    scene,
  ]);

  const polygonPreviewGroups = useMemo(
    () =>
      planarPolygonGroups
        .map((group) => {
          if (group.closed && group.vertexPointIds.length >= 3) {
            const vertexPoints = group.vertexPointIds
              .map((pointId) => pointsById.get(pointId)?.geometryECEF)
              .filter((point): point is Cartesian3 => Boolean(point));
            return {
              group,
              vertexPoints,
            };
          }

          if (
            !group.closed &&
            (group.surfaceType ?? "roof") === "facade" &&
            group.vertexPointIds.length === 1
          ) {
            const firstVertexId = group.vertexPointIds[0] ?? null;
            const firstVertex = firstVertexId
              ? pointsById.get(firstVertexId)?.geometryECEF
              : null;
            const previewOppositeCorner =
              facadeRectanglePreviewOppositeByGroupId?.[group.id];
            if (!firstVertex || !previewOppositeCorner) {
              return null;
            }

            const facadeCorners = buildFacadeRectangleCornerFromDiagonal(
              firstVertex,
              previewOppositeCorner
            );
            if (!facadeCorners) {
              return null;
            }

            return {
              group,
              vertexPoints: [
                firstVertex,
                facadeCorners.adjacentHorizontalCorner,
                previewOppositeCorner,
                facadeCorners.adjacentVerticalCorner,
              ],
            };
          }

          return null;
        })
        .filter(
          (
            previewGroup
          ): previewGroup is {
            group: PlanarPolygonGroup;
            vertexPoints: Cartesian3[];
          } => Boolean(previewGroup && previewGroup.vertexPoints.length >= 3)
        ),
    [facadeRectanglePreviewOppositeByGroupId, planarPolygonGroups, pointsById]
  );

  const facadePreviewEdgeSegments = useMemo(
    () =>
      polygonPreviewGroups
        .filter(
          ({ group, vertexPoints }) =>
            !group.closed &&
            (group.surfaceType ?? "roof") === "facade" &&
            vertexPoints.length === 4
        )
        .flatMap(({ group, vertexPoints }) => {
          const segments: Array<{
            id: string;
            start: Cartesian3;
            end: Cartesian3;
          }> = [];
          for (let index = 0; index < vertexPoints.length; index += 1) {
            const start = vertexPoints[index];
            const end = vertexPoints[(index + 1) % vertexPoints.length];
            if (!start || !end) continue;
            segments.push({
              id: `${group.id}:${index}`,
              start,
              end,
            });
          }
          return segments;
        }),
    [polygonPreviewGroups]
  );

  const facadeCornerMarkers = useMemo(
    () =>
      polygonPreviewGroups
        .filter(
          ({ group, vertexPoints }) =>
            !group.closed &&
            (group.surfaceType ?? "roof") === "facade" &&
            vertexPoints.length === 4
        )
        .flatMap(({ group, vertexPoints }) => {
          const horizontalCorner = vertexPoints[1];
          const verticalCorner = vertexPoints[3];
          if (!horizontalCorner || !verticalCorner) return [];
          return [
            {
              id: `${group.id}:horizontal`,
              position: horizontalCorner,
            },
            {
              id: `${group.id}:vertical`,
              position: verticalCorner,
            },
          ];
        }),
    [polygonPreviewGroups]
  );

  const overlayLines = useMemo(() => {
    if (!scene || scene.isDestroyed()) {
      return [];
    }

    const lines: LineVisualizerData[] = [];

    resolvedRelations.forEach(
      ({
        relation,
        pointA,
        pointB,
        anchorPoint,
        targetPoint,
        auxiliaryPoint,
      }) => {
        const getWorldToScreen = (
          position: Cartesian3
        ): ScreenPoint2D | null => {
          if (!scene || scene.isDestroyed()) return null;
          const p = SceneTransforms.worldToWindowCoordinates(scene, position);
          return defined(p) ? { x: p.x, y: p.y } : null;
        };
        const highestPoint =
          pointA.geometryWGS84.height >= pointB.geometryWGS84.height
            ? pointA
            : pointB;

        type ScreenTriangleData = {
          anchor: ScreenPoint2D;
          target: ScreenPoint2D;
          aux: ScreenPoint2D;
          centroid: ScreenPoint2D;
          highest: ScreenPoint2D;
        };

        let cachedTriangleFrameNumber: number | null = null;
        let cachedTriangle: ScreenTriangleData | null = null;

        const getSceneFrameNumber = (): number | null => {
          const frameNumber = (
            scene as unknown as { frameState?: { frameNumber?: number } }
          ).frameState?.frameNumber;
          return typeof frameNumber === "number" ? frameNumber : null;
        };

        const computeScreenTriangle = (): ScreenTriangleData | null => {
          const anchor = getWorldToScreen(anchorPoint.geometryECEF);
          const target = getWorldToScreen(targetPoint.geometryECEF);
          const aux = getWorldToScreen(auxiliaryPoint);
          const highest = getWorldToScreen(highestPoint.geometryECEF);
          if (!anchor || !target || !aux || !highest) return null;
          return {
            anchor,
            target,
            aux,
            highest,
            centroid: {
              x: (anchor.x + target.x + aux.x) / 3,
              y: (anchor.y + target.y + aux.y) / 3,
            },
          };
        };

        const getScreenTriangle = (): ScreenTriangleData | null => {
          const frameNumber = getSceneFrameNumber();
          if (
            frameNumber !== null &&
            frameNumber === cachedTriangleFrameNumber
          ) {
            return cachedTriangle;
          }

          const triangle = computeScreenTriangle();
          if (frameNumber !== null) {
            cachedTriangleFrameNumber = frameNumber;
            cachedTriangle = triangle;
          }
          return triangle;
        };

        const getScreenAnchor = (): ScreenPoint2D | null =>
          getScreenTriangle()?.anchor ?? null;
        const getScreenTarget = (): ScreenPoint2D | null =>
          getScreenTriangle()?.target ?? null;
        const getScreenAux = (): ScreenPoint2D | null =>
          getScreenTriangle()?.aux ?? null;

        const buildStableOutsideReferencePoint = (
          start: ScreenPoint2D,
          end: ScreenPoint2D,
          insidePoint: ScreenPoint2D
        ): ScreenPoint2D | null => {
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const lineLength = Math.hypot(dx, dy);
          if (lineLength <= 1e-3) return null;
          const midX = (start.x + end.x) * 0.5;
          const midY = (start.y + end.y) * 0.5;
          const normalX = -dy / lineLength;
          const normalY = dx / lineLength;
          const dot =
            (insidePoint.x - midX) * normalX + (insidePoint.y - midY) * normalY;
          const insideSign = dot >= 0 ? 1 : -1;
          const refDistancePx = clampToRange(
            lineLength * 0.2,
            LABEL_REFERENCE_MIN_DISTANCE_PX,
            LABEL_REFERENCE_MAX_DISTANCE_PX
          );
          return {
            x: midX + normalX * insideSign * refDistancePx,
            y: midY + normalY * insideSign * refDistancePx,
          };
        };

        const getStableInsidePointForDirectAndHorizontal =
          (): ScreenPoint2D | null => {
            const triangle = getScreenTriangle();
            if (!triangle) return null;
            const auxHeight = targetPoint.geometryWGS84.height;
            const highestHeight = highestPoint.geometryWGS84.height;
            const elevationDriverPoint =
              auxHeight < highestHeight - REFERENCE_LINE_EPSILON_METERS
                ? triangle.highest
                : triangle.aux;
            return {
              x:
                elevationDriverPoint.x +
                (triangle.centroid.x - elevationDriverPoint.x) *
                  LABEL_INSIDE_BLEND_FACTOR,
              y:
                elevationDriverPoint.y +
                (triangle.centroid.y - elevationDriverPoint.y) *
                  LABEL_INSIDE_BLEND_FACTOR,
            };
          };

        const getDirectLabelOutsideReferencePoint =
          (): ScreenPoint2D | null => {
            const triangle = getScreenTriangle();
            const insidePoint = getStableInsidePointForDirectAndHorizontal();
            if (!triangle || !insidePoint) return null;
            return buildStableOutsideReferencePoint(
              triangle.anchor,
              triangle.target,
              insidePoint
            );
          };

        const getHorizontalLabelOutsideReferencePoint =
          (): ScreenPoint2D | null => {
            const triangle = getScreenTriangle();
            const insidePoint = getStableInsidePointForDirectAndHorizontal();
            if (!triangle || !insidePoint) return null;
            return buildStableOutsideReferencePoint(
              triangle.aux,
              triangle.target,
              insidePoint
            );
          };

        const getVerticalLineScreenData = (): {
          start: ScreenPoint2D;
          end: ScreenPoint2D;
          inside: ScreenPoint2D;
          midX: number;
          midY: number;
          normalX: number;
          normalY: number;
          lineLength: number;
        } | null => {
          const triangle = getScreenTriangle();
          if (!triangle) return null;

          let start = triangle.anchor;
          let end = triangle.aux;
          const inside = triangle.target;

          const recompute = (
            s: ScreenPoint2D,
            e: ScreenPoint2D
          ): {
            midX: number;
            midY: number;
            normalX: number;
            normalY: number;
            lineLength: number;
            insideDot: number;
          } | null => {
            const dx = e.x - s.x;
            const dy = e.y - s.y;
            const lineLength = Math.hypot(dx, dy);
            if (lineLength <= 1e-3) return null;
            const midX = (s.x + e.x) * 0.5;
            const midY = (s.y + e.y) * 0.5;
            const normalX = -dy / lineLength;
            const normalY = dx / lineLength;
            const insideDot =
              (inside.x - midX) * normalX + (inside.y - midY) * normalY;
            return {
              midX,
              midY,
              normalX,
              normalY,
              lineLength,
              insideDot,
            };
          };

          let edgeData = recompute(start, end);
          if (!edgeData) return null;

          // Canonical direction for vertical line labels:
          // keep triangle interior on the clockwise/right side of the directed edge.
          if (edgeData.insideDot < 0) {
            start = triangle.aux;
            end = triangle.anchor;
            edgeData = recompute(start, end);
            if (!edgeData) return null;
          }

          return {
            start,
            end,
            inside,
            midX: edgeData.midX,
            midY: edgeData.midY,
            normalX: edgeData.normalX,
            normalY: edgeData.normalY,
            lineLength: edgeData.lineLength,
          };
        };

        const getVerticalLabelOutsideReferencePoint =
          (): ScreenPoint2D | null => {
            const edge = getVerticalLineScreenData();
            if (!edge) return null;

            const insideDot =
              (edge.inside.x - edge.midX) * edge.normalX +
              (edge.inside.y - edge.midY) * edge.normalY;
            const insideSign = insideDot >= 0 ? 1 : -1;
            const refDistancePx = clampToRange(
              edge.lineLength * 0.2,
              LABEL_REFERENCE_MIN_DISTANCE_PX,
              LABEL_REFERENCE_MAX_DISTANCE_PX
            );

            // Use an inside-side reference point; overlay logic places the label on
            // the opposite side, i.e. outside the triangle.
            return {
              x: edge.midX + edge.normalX * insideSign * refDistancePx,
              y: edge.midY + edge.normalY * insideSign * refDistancePx,
            };
          };

        const verticalDistanceMeters = Cartesian3.distance(
          anchorPoint.geometryECEF,
          auxiliaryPoint
        );
        const horizontalDistanceMeters = Cartesian3.distance(
          auxiliaryPoint,
          targetPoint.geometryECEF
        );
        const showVerticalLabel =
          (relation.labelVisibilityByKind?.vertical ?? true) &&
          verticalDistanceMeters > REFERENCE_LINE_EPSILON_METERS;
        const showHorizontalLabel =
          (relation.labelVisibilityByKind?.horizontal ?? true) &&
          horizontalDistanceMeters > REFERENCE_LINE_EPSILON_METERS;

        if (relation.showDirectLine) {
          const isPolygonEdgeRelation = splitMarkerRelationIdSet.has(
            relation.id
          );
          const directLabelMode: DirectLineLabelMode =
            relation.directLabelMode ?? "segment";
          const shouldShowPolygonEdgeLengthLabel =
            !isPolygonEdgeRelation ||
            edgeRelationOwnerGroupIdSet.has(relation.id);
          const segmentDistanceMeters = Cartesian3.distance(
            pointA.geometryECEF,
            pointB.geometryECEF
          );
          const cumulativeDistanceMeters =
            cumulativeDistanceByRelationId?.[relation.id] ??
            segmentDistanceMeters;
          const directLabelDistanceMeters =
            directLabelMode === "cumulative"
              ? cumulativeDistanceMeters
              : segmentDistanceMeters;
          const showDirectLabel =
            (relation.labelVisibilityByKind?.direct ?? true) &&
            directLabelMode !== "none" &&
            !roofRoofSharedEdgeRelationIdSet.has(relation.id) &&
            shouldShowPolygonEdgeLengthLabel;
          lines.push({
            id: `reference-direct-${relation.id}`,
            getCanvasLine: () => {
              const start = getScreenAnchor();
              const end = getScreenTarget();
              if (!start || !end) return null;
              return { start, end };
            },
            getLabelOutsideReferencePoint: getDirectLabelOutsideReferencePoint,
            stroke: "rgba(255, 255, 255, 0.9)",
            strokeWidth: 1.5,
            strokeDasharray: "6 8",
            hitTargetStrokeWidth: 10,
            labelText: showDirectLabel
              ? `${formatNumber(directLabelDistanceMeters)} m`
              : undefined,
            labelColor: "#000000",
            labelStroke: "rgba(255, 255, 255, 0.95)",
            labelFontSize: 12,
            labelFontFamily: "Arial, sans-serif",
            labelFontWeight: "400",
            labelMinLineLengthPx: lineLabelMinDistancePx,
            onLineClick: () => onDistanceLineClick?.(relation.id, "direct"),
            onLabelClick: () =>
              onDistanceLineLabelToggle?.(relation.id, "direct"),
          });
        }

        if (isDistanceRelationVerticalLineVisible(relation)) {
          lines.push({
            id: `reference-vertical-${relation.id}`,
            getCanvasLine: () => {
              const edge = getVerticalLineScreenData();
              if (!edge) return null;
              return { start: edge.start, end: edge.end };
            },
            getLabelOutsideReferencePoint:
              getVerticalLabelOutsideReferencePoint,
            stroke: REFERENCE_COMPONENT_VERTICAL_COLOR,
            strokeWidth: REFERENCE_COMPONENT_LINE_STROKE_WIDTH_PX,
            strokeDasharray: "6 8",
            hitTargetStrokeWidth: 10,
            labelText: showVerticalLabel
              ? `${formatNumber(verticalDistanceMeters)} m`
              : undefined,
            labelColor: "#000000",
            labelStroke: "rgba(255, 255, 255, 0.95)",
            labelFontSize: 12,
            labelFontFamily: "Arial, sans-serif",
            labelFontWeight: "400",
            labelRotationMode: "clockwise",
            labelOffsetPx: VERTICAL_COMPONENT_LABEL_OFFSET_PX,
            labelDominantBaseline: "alphabetic",
            labelMinLineLengthPx: lineLabelMinDistancePx,
            onLineClick: () =>
              onDistanceLineLabelToggle?.(relation.id, "vertical"),
          });
        }

        if (isDistanceRelationHorizontalLineVisible(relation)) {
          lines.push({
            id: `reference-horizontal-${relation.id}`,
            getCanvasLine: () => {
              const start = getScreenAux();
              const end = getScreenTarget();
              if (!start || !end) return null;
              return { start, end };
            },
            getLabelOutsideReferencePoint:
              getHorizontalLabelOutsideReferencePoint,
            stroke: REFERENCE_COMPONENT_HORIZONTAL_COLOR,
            strokeWidth: REFERENCE_COMPONENT_LINE_STROKE_WIDTH_PX,
            strokeDasharray: "6 8",
            hitTargetStrokeWidth: 10,
            labelText: showHorizontalLabel
              ? `${formatNumber(horizontalDistanceMeters)} m`
              : undefined,
            labelColor: "#000000",
            labelStroke: "rgba(255, 255, 255, 0.95)",
            labelFontSize: 12,
            labelFontFamily: "Arial, sans-serif",
            labelFontWeight: "400",
            labelMinLineLengthPx: lineLabelMinDistancePx,
            onLineClick: () =>
              onDistanceLineLabelToggle?.(relation.id, "horizontal"),
          });
        }
      }
    );

    facadePreviewEdgeSegments.forEach((segment) => {
      lines.push({
        id: `polygon-preview-edge-${segment.id}`,
        getCanvasLine: () => {
          if (!scene || scene.isDestroyed()) return null;
          const start = SceneTransforms.worldToWindowCoordinates(
            scene,
            segment.start
          );
          const end = SceneTransforms.worldToWindowCoordinates(
            scene,
            segment.end
          );
          if (!defined(start) || !defined(end)) return null;
          return {
            start: { x: start.x, y: start.y },
            end: { x: end.x, y: end.y },
          };
        },
        stroke: POLYGON_PREVIEW_STROKE,
        strokeWidth: POLYGON_PREVIEW_STROKE_WIDTH_PX,
        hitTargetStrokeWidth: 10,
      });
    });

    return lines;
  }, [
    facadePreviewEdgeSegments,
    lineLabelMinDistancePx,
    onDistanceLineLabelToggle,
    onDistanceLineClick,
    cumulativeDistanceByRelationId,
    roofRoofSharedEdgeRelationIdSet,
    resolvedRelations,
    scene,
    edgeRelationOwnerGroupIdSet,
    splitMarkerRelationIdSet,
  ]);

  useLineVisualizers(overlayLines, overlayLines.length > 0);

  const facadeCornerMarkerContent = useMemo(
    () =>
      createElement("div", {
        style: {
          width: `${FACADE_CORNER_MARKER_SIZE_PX}px`,
          height: `${FACADE_CORNER_MARKER_SIZE_PX}px`,
          borderRadius: "50%",
          border: `${FACADE_CORNER_MARKER_STROKE_WIDTH_PX}px solid rgba(255, 255, 255, 0.95)`,
          background: "transparent",
          boxSizing: "border-box",
          pointerEvents: "none",
        },
      }),
    []
  );

  useEffect(() => {
    facadeCornerOverlayIdsRef.current.forEach((overlayId) => {
      removeLabelOverlayElement(overlayId);
    });
    facadeCornerOverlayIdsRef.current = [];

    if (!scene || scene.isDestroyed()) {
      return;
    }

    const nextOverlayIds: string[] = [];
    facadeCornerMarkers.forEach((marker) => {
      const overlayId = `${FACADE_CORNER_OVERLAY_ID_PREFIX}-${marker.id}`;
      addLabelOverlayElement({
        id: overlayId,
        zIndex: 9,
        content: facadeCornerMarkerContent,
        updatePosition: (elementDiv) => {
          if (!scene || scene.isDestroyed()) return false;
          const screenPosition = SceneTransforms.worldToWindowCoordinates(
            scene,
            marker.position
          );
          if (!defined(screenPosition)) return false;
          elementDiv.style.position = "absolute";
          elementDiv.style.left = `${screenPosition.x}px`;
          elementDiv.style.top = `${screenPosition.y}px`;
          elementDiv.style.transform = "translate(-50%, -50%)";
          elementDiv.style.pointerEvents = "none";
          return true;
        },
      });
      nextOverlayIds.push(overlayId);
    });

    facadeCornerOverlayIdsRef.current = nextOverlayIds;

    return () => {
      nextOverlayIds.forEach((overlayId) => {
        removeLabelOverlayElement(overlayId);
      });
      facadeCornerOverlayIdsRef.current = [];
    };
  }, [
    addLabelOverlayElement,
    facadeCornerMarkerContent,
    facadeCornerMarkers,
    removeLabelOverlayElement,
    scene,
  ]);

  const polygonPreviewContent = useCallback((group: PlanarPolygonGroup) => {
    const patternId = `stripe-${group.id}`;
    const stripeColor = getPolygonStripeColor(group.surfaceType);
    return createElement(
      "div",
      {
        style: {
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "visible",
          pointerEvents: "none",
        },
      },
      createElement(
        "svg",
        {
          width: "100%",
          height: "100%",
          style: {
            position: "absolute",
            left: 0,
            top: 0,
            overflow: "visible",
            pointerEvents: "none",
          },
        },
        createElement(
          "defs",
          null,
          createElement(
            "pattern",
            {
              id: patternId,
              width: POLYGON_STRIPE_SIZE_PX,
              height: POLYGON_STRIPE_SIZE_PX,
              patternUnits: "userSpaceOnUse",
              patternTransform: "rotate(45)",
            },
            createElement("line", {
              x1: 0,
              y1: 0,
              x2: 0,
              y2: POLYGON_STRIPE_SIZE_PX,
              stroke: stripeColor,
              strokeWidth: POLYGON_STRIPE_WIDTH_PX,
            })
          )
        ),
        createElement("polygon", {
          "data-polygon-preview-shape": "true",
          fill: "none",
          stroke: "none",
          style: {
            pointerEvents: "none",
          },
        }),
        createElement("polygon", {
          "data-polygon-preview-stripe": "true",
          fill: `url(#${patternId})`,
          stroke: "none",
          style: {
            pointerEvents: "none",
            mixBlendMode: "multiply",
          },
        }),
        createElement("text", {
          "data-polygon-preview-area-label": "true",
          x: "0",
          y: "0",
          textAnchor: "middle",
          dominantBaseline: "middle",
          fill: POLYGON_AREA_LABEL_COLOR,
          fontSize: POLYGON_AREA_LABEL_FONT_SIZE_PX,
          fontFamily: POLYGON_AREA_LABEL_FONT_FAMILY,
          fontWeight: POLYGON_AREA_LABEL_FONT_WEIGHT,
          style: {
            userSelect: "none",
            pointerEvents: "none",
          },
        }),
        createElement("text", {
          "data-polygon-preview-area-label-secondary": "true",
          x: "0",
          y: "0",
          textAnchor: "middle",
          dominantBaseline: "middle",
          fill: POLYGON_AREA_LABEL_COLOR,
          fontSize: Math.max(10, POLYGON_AREA_LABEL_FONT_SIZE_PX - 1),
          fontFamily: POLYGON_AREA_LABEL_FONT_FAMILY,
          fontWeight: POLYGON_AREA_LABEL_FONT_WEIGHT,
          style: {
            userSelect: "none",
            pointerEvents: "none",
            display: "none",
          },
        })
      )
    );
  }, []);

  useEffect(() => {
    polygonPreviewOverlayIdsRef.current.forEach((overlayId) => {
      removeLabelOverlayElement(overlayId);
    });
    polygonPreviewOverlayIdsRef.current = [];

    if (!scene || scene.isDestroyed()) {
      return;
    }

    const nextOverlayIds: string[] = [];

    polygonPreviewGroups.forEach(({ group, vertexPoints }) => {
      const overlayId = `${POLYGON_PREVIEW_OVERLAY_ID_PREFIX}-${group.id}`;

      addLabelOverlayElement({
        id: overlayId,
        zIndex: 4,
        content: polygonPreviewContent(group),
        updatePosition: (elementDiv) => {
          if (!scene || scene.isDestroyed()) return false;

          const screenPoints = vertexPoints
            .map((point) =>
              SceneTransforms.worldToWindowCoordinates(scene, point)
            )
            .filter(
              (point): point is Cartesian2 =>
                defined(point) &&
                Number.isFinite(point.x) &&
                Number.isFinite(point.y)
            );

          if (screenPoints.length < 3) {
            return false;
          }

          const minX = Math.min(...screenPoints.map((point) => point.x));
          const maxX = Math.max(...screenPoints.map((point) => point.x));
          const minY = Math.min(...screenPoints.map((point) => point.y));
          const maxY = Math.max(...screenPoints.map((point) => point.y));

          const width = Math.max(
            1,
            maxX - minX + POLYGON_PREVIEW_PADDING_PX * 2
          );
          const height = Math.max(
            1,
            maxY - minY + POLYGON_PREVIEW_PADDING_PX * 2
          );
          const canvasWidth = Math.max(
            1,
            scene.canvas.clientWidth || scene.canvas.width || 1
          );
          const canvasHeight = Math.max(
            1,
            scene.canvas.clientHeight || scene.canvas.height || 1
          );
          if (
            !Number.isFinite(width) ||
            !Number.isFinite(height) ||
            width > canvasWidth * POLYGON_OVERLAY_MAX_BOUNDS_SCALE ||
            height > canvasHeight * POLYGON_OVERLAY_MAX_BOUNDS_SCALE
          ) {
            return false;
          }

          const localPoints = screenPoints.map((point) => ({
            x: point.x - minX + POLYGON_PREVIEW_PADDING_PX,
            y: point.y - minY + POLYGON_PREVIEW_PADDING_PX,
          }));
          const pointsAttr = localPoints
            .map((point) => `${point.x},${point.y}`)
            .join(" ");

          const polygonEl = elementDiv.querySelector(
            '[data-polygon-preview-shape="true"]'
          ) as SVGPolygonElement | null;
          if (!polygonEl) {
            return false;
          }
          polygonEl.setAttribute("points", pointsAttr);

          const stripeEl = elementDiv.querySelector(
            '[data-polygon-preview-stripe="true"]'
          ) as SVGPolygonElement | null;
          if (stripeEl) {
            stripeEl.setAttribute("points", pointsAttr);
          }

          const areaLabelEl = elementDiv.querySelector(
            '[data-polygon-preview-area-label="true"]'
          ) as SVGTextElement | null;
          const areaLabelSecondaryEl = elementDiv.querySelector(
            '[data-polygon-preview-area-label-secondary="true"]'
          ) as SVGTextElement | null;
          if (areaLabelEl) {
            const { planarText, projectedHorizontalText } =
              getPolygonAreaLabelText(group, vertexPoints);
            areaLabelEl.textContent = planarText;
            areaLabelEl.setAttribute("transform", "");

            const centroidAnchor = computePolygonCentroid2D(localPoints);
            if (!centroidAnchor) {
              areaLabelEl.style.display = "none";
              if (areaLabelSecondaryEl) {
                areaLabelSecondaryEl.style.display = "none";
              }
            } else {
              const clampedAnchor: ScreenPoint2D = {
                x: clampToRange(centroidAnchor.x, 0, width),
                y: clampToRange(centroidAnchor.y, 0, height),
              };

              areaLabelEl.setAttribute("x", `${clampedAnchor.x}`);
              areaLabelEl.setAttribute(
                "y",
                `${
                  clampedAnchor.y -
                  (projectedHorizontalText
                    ? POLYGON_AREA_LABEL_FONT_SIZE_PX * 0.45
                    : 0)
                }`
              );

              if (areaLabelSecondaryEl) {
                areaLabelSecondaryEl.textContent =
                  projectedHorizontalText ?? "";
                areaLabelSecondaryEl.setAttribute("x", `${clampedAnchor.x}`);
                areaLabelSecondaryEl.setAttribute(
                  "y",
                  `${
                    clampedAnchor.y +
                    (projectedHorizontalText
                      ? POLYGON_AREA_LABEL_FONT_SIZE_PX * 0.55
                      : 0)
                  }`
                );
                areaLabelSecondaryEl.style.display = projectedHorizontalText
                  ? "block"
                  : "none";
              }

              areaLabelEl.style.display = "block";
            }
          }

          elementDiv.style.position = "absolute";
          elementDiv.style.left = `${minX - POLYGON_PREVIEW_PADDING_PX}px`;
          elementDiv.style.top = `${minY - POLYGON_PREVIEW_PADDING_PX}px`;
          elementDiv.style.width = `${width}px`;
          elementDiv.style.height = `${height}px`;
          elementDiv.style.transform = "none";
          elementDiv.style.pointerEvents = "none";
          elementDiv.style.zIndex = "4";

          return true;
        },
      });

      nextOverlayIds.push(overlayId);
    });

    polygonPreviewOverlayIdsRef.current = nextOverlayIds;

    return () => {
      nextOverlayIds.forEach((overlayId) => {
        removeLabelOverlayElement(overlayId);
      });
      polygonPreviewOverlayIdsRef.current = [];
    };
  }, [
    addLabelOverlayElement,
    polygonPreviewContent,
    polygonPreviewGroups,
    removeLabelOverlayElement,
    scene,
  ]);

  // Sync Cesium polygon fill primitives for picking
  const focusedPolygonGroupId =
    selectedPlanarPolygonGroupId ?? activePlanarPolygonGroupId;

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    // Remove previous collection
    if (polygonPrimitiveCollectionRef.current) {
      scene.primitives.remove(polygonPrimitiveCollectionRef.current);
      polygonPrimitiveCollectionRef.current = null;
    }

    if (polygonPreviewGroups.length === 0) return;

    const collection = new PrimitiveCollection();
    polygonPrimitiveCollectionRef.current = collection;

    for (const { group, vertexPoints } of polygonPreviewGroups) {
      if (vertexPoints.length < 3) continue;

      const isSelected = group.id === focusedPolygonGroupId;
      const fillColor = getPolygonFillCesiumColor(
        group.surfaceType,
        isSelected
      );

      const geometry = CoplanarPolygonGeometry.fromPositions({
        positions: vertexPoints,
        vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
      });

      const instance = new GeometryInstance({
        geometry,
        id: { polygonGroupId: group.id },
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(fillColor),
        },
      });

      collection.add(
        new Primitive({
          geometryInstances: [instance],
          appearance: new PerInstanceColorAppearance({
            flat: true,
            translucent: true,
          }),
          asynchronous: false,
        })
      );
    }

    scene.primitives.add(collection);
    scene.requestRender();

    return () => {
      if (polygonPrimitiveCollectionRef.current && !scene.isDestroyed()) {
        scene.primitives.remove(polygonPrimitiveCollectionRef.current);
        polygonPrimitiveCollectionRef.current = null;
        scene.requestRender();
      }
    };
  }, [scene, polygonPreviewGroups, focusedPolygonGroupId]);

  const rightAngleCornerContent = useMemo(
    () =>
      createElement(
        "svg",
        {
          width: "100%",
          height: "100%",
          style: {
            overflow: "visible",
            pointerEvents: "none",
          },
        },
        createElement("path", {
          "data-right-angle-corner-path": "true",
          fill: "none",
          stroke: REFERENCE_COMPONENT_ARC_COLOR,
          strokeWidth: REFERENCE_COMPONENT_LINE_STROKE_WIDTH_PX,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }),
        createElement("circle", {
          "data-right-angle-corner-dot": "true",
          r: CORNER_OVERLAY_DOT_RADIUS_PX,
          fill: REFERENCE_COMPONENT_ARC_COLOR,
        })
      ),
    []
  );

  useEffect(() => {
    cornerOverlayIdsRef.current.forEach((overlayId) => {
      removeLabelOverlayElement(overlayId);
    });
    cornerOverlayIdsRef.current = [];

    if (!scene || scene.isDestroyed()) {
      return;
    }

    const nextCornerOverlayIds: string[] = [];

    resolvedRelations
      .filter(({ relation }) =>
        hasVisibleDistanceRelationComponentLines(relation)
      )
      .forEach(({ relation, anchorPoint, targetPoint, auxiliaryPoint }) => {
        const overlayId = `${CORNER_OVERLAY_ID_PREFIX}-${relation.id}`;

        addLabelOverlayElement({
          id: overlayId,
          content: rightAngleCornerContent,
          onClick: onDistanceRelationCornerClick
            ? () => onDistanceRelationCornerClick(relation.id)
            : undefined,
          updatePosition: (elementDiv) => {
            if (!scene || scene.isDestroyed()) return false;

            const auxiliaryPointScreen =
              SceneTransforms.worldToWindowCoordinates(scene, auxiliaryPoint);
            const verticalPointScreen =
              SceneTransforms.worldToWindowCoordinates(
                scene,
                anchorPoint.geometryECEF
              );
            const horizontalPointScreen =
              SceneTransforms.worldToWindowCoordinates(
                scene,
                targetPoint.geometryECEF
              );

            if (
              !defined(auxiliaryPointScreen) ||
              !defined(verticalPointScreen) ||
              !defined(horizontalPointScreen)
            ) {
              return false;
            }

            const verticalLengthMeters = Cartesian3.distance(
              anchorPoint.geometryECEF,
              auxiliaryPoint
            );
            const horizontalLengthMeters = Cartesian3.distance(
              auxiliaryPoint,
              targetPoint.geometryECEF
            );
            if (
              verticalLengthMeters <= REFERENCE_LINE_EPSILON_METERS ||
              horizontalLengthMeters <= REFERENCE_LINE_EPSILON_METERS
            ) {
              return false;
            }

            const drawingBufferWidth = scene.drawingBufferWidth;
            const drawingBufferHeight = scene.drawingBufferHeight;
            if (drawingBufferWidth <= 0 || drawingBufferHeight <= 0) {
              return false;
            }

            let metersPerPixel = Number.NaN;
            try {
              metersPerPixel = scene.camera.getPixelSize(
                new BoundingSphere(auxiliaryPoint, 1),
                drawingBufferWidth,
                drawingBufferHeight
              );
            } catch {
              metersPerPixel = Number.NaN;
            }

            if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) {
              const cameraDistanceMeters = Math.max(
                Cartesian3.distance(scene.camera.position, auxiliaryPoint),
                1
              );
              const fovRad =
                (scene.camera.frustum as { fov?: number }).fov ?? Math.PI / 3;
              metersPerPixel = Math.max(
                (cameraDistanceMeters * Math.tan(fovRad / 2) * 2) /
                  Math.max(drawingBufferHeight, 1),
                1e-6
              );
            }

            const arcRadiusPx = CORNER_OVERLAY_TARGET_RADIUS_PX;
            const arcRadiusMeters = arcRadiusPx * metersPerPixel;

            const arcPointsWorld = getArcPointsInSpannedPlane(
              auxiliaryPoint,
              anchorPoint.geometryECEF,
              targetPoint.geometryECEF,
              arcRadiusMeters,
              CORNER_OVERLAY_SEGMENTS
            );
            if (!arcPointsWorld || arcPointsWorld.length < 2) {
              return false;
            }

            const arcMidpointWorld =
              arcPointsWorld[Math.floor(arcPointsWorld.length / 2)];
            if (!arcMidpointWorld) return false;
            const dotWorld = Cartesian3.midpoint(
              auxiliaryPoint,
              arcMidpointWorld,
              new Cartesian3()
            );
            const dotScreen = SceneTransforms.worldToWindowCoordinates(
              scene,
              dotWorld
            );
            if (!defined(dotScreen)) return false;

            const arcPointsScreen = arcPointsWorld
              .map((worldPoint) =>
                SceneTransforms.worldToWindowCoordinates(scene, worldPoint)
              )
              .filter(defined);
            if (arcPointsScreen.length < 2) {
              return false;
            }

            const minX = Math.min(...arcPointsScreen.map((point) => point.x));
            const maxX = Math.max(...arcPointsScreen.map((point) => point.x));
            const minY = Math.min(...arcPointsScreen.map((point) => point.y));
            const maxY = Math.max(...arcPointsScreen.map((point) => point.y));
            const width = Math.max(
              CORNER_OVERLAY_MIN_BOX_PX,
              maxX - minX + CORNER_OVERLAY_PADDING_PX * 2
            );
            const height = Math.max(
              CORNER_OVERLAY_MIN_BOX_PX,
              maxY - minY + CORNER_OVERLAY_PADDING_PX * 2
            );

            const pathData = arcPointsScreen
              .map((point, index) => {
                const x = point.x - minX + CORNER_OVERLAY_PADDING_PX;
                const y = point.y - minY + CORNER_OVERLAY_PADDING_PX;
                return `${index === 0 ? "M" : "L"} ${x} ${y}`;
              })
              .join(" ");

            const pathEl = elementDiv.querySelector(
              '[data-right-angle-corner-path="true"]'
            ) as SVGPathElement | null;
            if (pathEl) {
              pathEl.setAttribute("d", pathData);
            }
            const dotEl = elementDiv.querySelector(
              '[data-right-angle-corner-dot="true"]'
            ) as SVGCircleElement | null;
            if (dotEl) {
              dotEl.setAttribute(
                "cx",
                `${dotScreen.x - minX + CORNER_OVERLAY_PADDING_PX}`
              );
              dotEl.setAttribute(
                "cy",
                `${dotScreen.y - minY + CORNER_OVERLAY_PADDING_PX}`
              );
            }

            elementDiv.style.position = "absolute";
            elementDiv.style.left = `${minX - CORNER_OVERLAY_PADDING_PX}px`;
            elementDiv.style.top = `${minY - CORNER_OVERLAY_PADDING_PX}px`;
            elementDiv.style.width = `${width}px`;
            elementDiv.style.height = `${height}px`;
            elementDiv.style.transform = "none";
            elementDiv.style.zIndex = "10";
            const isCornerClickable = Boolean(onDistanceRelationCornerClick);
            elementDiv.style.pointerEvents = isCornerClickable
              ? "auto"
              : "none";
            elementDiv.style.cursor = isCornerClickable ? "pointer" : "default";

            return true;
          },
        });

        nextCornerOverlayIds.push(overlayId);
      });

    cornerOverlayIdsRef.current = nextCornerOverlayIds;

    return () => {
      nextCornerOverlayIds.forEach((overlayId) => {
        removeLabelOverlayElement(overlayId);
      });
      cornerOverlayIdsRef.current = [];
    };
  }, [
    addLabelOverlayElement,
    onDistanceRelationCornerClick,
    removeLabelOverlayElement,
    resolvedRelations,
    rightAngleCornerContent,
    scene,
  ]);

  const midpointMarkerContent = useMemo(
    () =>
      createElement(
        "div",
        {
          style: {
            position: "relative",
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          },
        },
        createElement("div", {
          style: {
            position: "absolute",
            left: "50%",
            top: "50%",
            width: `${MIDPOINT_MARKER_TICK_LENGTH_PX}px`,
            height: `${MIDPOINT_MARKER_TICK_WIDTH_PX}px`,
            borderRadius: "999px",
            background: "rgba(255, 255, 255, 0.95)",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
          },
        })
      ),
    []
  );

  useEffect(() => {
    midpointOverlayIdsRef.current.forEach((overlayId) => {
      removeLabelOverlayElement(overlayId);
    });
    midpointOverlayIdsRef.current = [];

    if (!scene || scene.isDestroyed()) {
      return;
    }

    const nextMidpointOverlayIds: string[] = [];

    resolvedRelations
      .filter(({ relation }) => {
        if (!selectedPlanarPolygonGroupId && !activePlanarPolygonGroupId) {
          return false;
        }
        if (!relation.showDirectLine) return false;
        return midpointTickRelationIdSet.has(relation.id);
      })
      .forEach(({ relation, pointA, pointB }) => {
        const overlayId = `${MIDPOINT_OVERLAY_ID_PREFIX}-${relation.id}`;
        addLabelOverlayElement({
          id: overlayId,
          zIndex: 11,
          content: midpointMarkerContent,
          onClick: onDistanceRelationMidpointClick
            ? () => onDistanceRelationMidpointClick(relation.id)
            : undefined,
          updatePosition: (elementDiv) => {
            if (!scene || scene.isDestroyed()) return false;
            const start = SceneTransforms.worldToWindowCoordinates(
              scene,
              pointA.geometryECEF
            );
            const end = SceneTransforms.worldToWindowCoordinates(
              scene,
              pointB.geometryECEF
            );
            if (!defined(start) || !defined(end)) return false;

            const midpointWorld = Cartesian3.midpoint(
              pointA.geometryECEF,
              pointB.geometryECEF,
              new Cartesian3()
            );
            const center = SceneTransforms.worldToWindowCoordinates(
              scene,
              midpointWorld
            );
            if (!defined(center)) return false;
            const angleDeg =
              (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI +
              90;
            elementDiv.style.position = "absolute";
            elementDiv.style.left = `${center.x}px`;
            elementDiv.style.top = `${center.y}px`;
            elementDiv.style.width = `${MIDPOINT_MARKER_HIT_TARGET_PX}px`;
            elementDiv.style.height = `${MIDPOINT_MARKER_HIT_TARGET_PX}px`;
            elementDiv.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg)`;
            elementDiv.style.transformOrigin = "50% 50%";
            elementDiv.style.pointerEvents = onDistanceRelationMidpointClick
              ? "auto"
              : "none";
            elementDiv.style.cursor = onDistanceRelationMidpointClick
              ? "pointer"
              : "default";
            return true;
          },
        });
        nextMidpointOverlayIds.push(overlayId);
      });

    midpointOverlayIdsRef.current = nextMidpointOverlayIds;

    return () => {
      nextMidpointOverlayIds.forEach((overlayId) => {
        removeLabelOverlayElement(overlayId);
      });
      midpointOverlayIdsRef.current = [];
    };
  }, [
    addLabelOverlayElement,
    midpointMarkerContent,
    onDistanceRelationMidpointClick,
    removeLabelOverlayElement,
    resolvedRelations,
    scene,
    activePlanarPolygonGroupId,
    midpointTickRelationIdSet,
    selectedPlanarPolygonGroupId,
  ]);

  const relationsWithDirectLine = useMemo(
    () => resolvedRelations.filter(({ relation }) => relation.showDirectLine),
    [resolvedRelations]
  );

  const relationsWithVerticalLine = useMemo(
    () =>
      resolvedRelations.filter(({ relation }) =>
        isDistanceRelationVerticalLineVisible(relation)
      ),
    [resolvedRelations]
  );

  const relationsWithHorizontalLine = useMemo(
    () =>
      resolvedRelations.filter(({ relation }) =>
        isDistanceRelationHorizontalLineVisible(relation)
      ),
    [resolvedRelations]
  );

  useEffect(() => {
    if (!scene) return;

    destroyLineVisualizerMap(directLineRefs);

    if (relationsWithDirectLine.length === 0) {
      scene.requestRender();
      return;
    }

    relationsWithDirectLine.forEach(({ relation, pointA, pointB }) => {
      const lineVisualizer = createLineVisualizer(
        `reference-line-${relation.id}`,
        {
          start: pointA.geometryECEF,
          end: pointB.geometryECEF,
          color: Color.WHITE,
          width: 1,
          dashed: false,
        }
      );
      directLineRefs.current[relation.id] = lineVisualizer;
      lineVisualizer.attach(scene, () => scene.requestRender());
    });
    scene.requestRender();

    return () => {
      destroyLineVisualizerMap(directLineRefs);
      if (!scene || scene.isDestroyed()) return;
      scene.requestRender();
    };
  }, [relationsWithDirectLine, scene]);

  useEffect(() => {
    if (!scene) return;

    destroyLineVisualizerMap(facadePreviewEdgeLineRefs);

    if (facadePreviewEdgeSegments.length === 0) {
      scene.requestRender();
      return;
    }

    const facadeEdgeColor = Color.WHITE;
    facadePreviewEdgeSegments.forEach((segment) => {
      const lineVisualizer = createLineVisualizer(
        `polygon-preview-edge-${segment.id}`,
        {
          start: segment.start,
          end: segment.end,
          color: facadeEdgeColor,
          width: POLYGON_PREVIEW_STROKE_WIDTH_PX,
          dashed: false,
        }
      );
      facadePreviewEdgeLineRefs.current[segment.id] = lineVisualizer;
      lineVisualizer.attach(scene, () => scene.requestRender());
    });
    scene.requestRender();

    return () => {
      destroyLineVisualizerMap(facadePreviewEdgeLineRefs);
      if (!scene || scene.isDestroyed()) return;
      scene.requestRender();
    };
  }, [facadePreviewEdgeSegments, scene]);

  useEffect(() => {
    if (!scene) return;

    destroyLineVisualizerMap(verticalLineRefs);
    destroyLineVisualizerMap(horizontalLineRefs);

    if (
      relationsWithVerticalLine.length === 0 &&
      relationsWithHorizontalLine.length === 0
    ) {
      scene.requestRender();
      return;
    }

    relationsWithVerticalLine.forEach(
      ({ relation, anchorPoint, auxiliaryPoint }) => {
        const verticalLineVisualizer = createLineVisualizer(
          `reference-vertical-line-${relation.id}`,
          {
            start: anchorPoint.geometryECEF,
            end: auxiliaryPoint,
            color: Color.fromCssColorString(REFERENCE_COMPONENT_VERTICAL_COLOR),
            width: 1,
            dashed: false,
          }
        );
        verticalLineRefs.current[relation.id] = verticalLineVisualizer;
        verticalLineVisualizer.attach(scene, () => scene.requestRender());
      }
    );

    relationsWithHorizontalLine.forEach(
      ({ relation, targetPoint, auxiliaryPoint }) => {
        const horizontalLineVisualizer = createLineVisualizer(
          `reference-horizontal-line-${relation.id}`,
          {
            start: auxiliaryPoint,
            end: targetPoint.geometryECEF,
            color: Color.fromCssColorString(
              REFERENCE_COMPONENT_HORIZONTAL_COLOR
            ),
            width: 1,
            dashed: false,
          }
        );
        horizontalLineRefs.current[relation.id] = horizontalLineVisualizer;
        horizontalLineVisualizer.attach(scene, () => scene.requestRender());
      }
    );
    scene.requestRender();

    return () => {
      destroyLineVisualizerMap(verticalLineRefs);
      destroyLineVisualizerMap(horizontalLineRefs);
      if (!scene || scene.isDestroyed()) return;
      scene.requestRender();
    };
  }, [relationsWithHorizontalLine, relationsWithVerticalLine, scene]);

  useEffect(() => {
    return () => {
      facadeCornerOverlayIdsRef.current.forEach((overlayId) => {
        removeLabelOverlayElement(overlayId);
      });
      facadeCornerOverlayIdsRef.current = [];
      cornerOverlayIdsRef.current.forEach((overlayId) => {
        removeLabelOverlayElement(overlayId);
      });
      cornerOverlayIdsRef.current = [];
      midpointOverlayIdsRef.current.forEach((overlayId) => {
        removeLabelOverlayElement(overlayId);
      });
      midpointOverlayIdsRef.current = [];
      polygonPreviewOverlayIdsRef.current.forEach((overlayId) => {
        removeLabelOverlayElement(overlayId);
      });
      polygonPreviewOverlayIdsRef.current = [];
      distancePairLabelOverlayIdsRef.current.forEach((overlayId) => {
        removeLabelOverlayElement(overlayId);
      });
      distancePairLabelOverlayIdsRef.current = [];
      destroyLineVisualizerMap(directLineRefs);
      destroyLineVisualizerMap(facadePreviewEdgeLineRefs);
      destroyLineVisualizerMap(verticalLineRefs);
      destroyLineVisualizerMap(horizontalLineRefs);
      // polygon primitives are cleaned up by their own effect
    };
  }, [removeLabelOverlayElement]);
};

export default useCesiumDistanceVisualizer;
