import {
  Cartesian3,
  Color,
  CoplanarPolygonGeometry,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  Material,
  Matrix4,
  PerInstanceColorAppearance,
  PolylineCollection,
  Primitive,
  defined,
  type Scene,
} from "@carma/cesium";
import { createPrimitiveGroup } from "@carma-mapping/engines/cesium/primitives";

export type CubeEdgeDef = {
  id: string;
  a: number;
  b: number;
};

export type CubeFaceDef = {
  id: string;
  corners: readonly [number, number, number, number];
};

export type CubePickTarget =
  | {
      kind: "corner";
      cornerIndex: number;
    }
  | {
      kind: "edge";
      edgeId: string;
    }
  | {
      kind: "face";
      faceId: string;
    };

export type CubePrimitiveVisuals = {
  setTransform: (modelMatrix: Matrix4) => void;
  setSelection: (selectedTarget: CubePickTarget | null) => void;
  destroy: () => void;
};

export const CUBE_EDGES: readonly CubeEdgeDef[] = [
  { id: "bottom-0", a: 0, b: 1 },
  { id: "bottom-1", a: 1, b: 2 },
  { id: "bottom-2", a: 2, b: 3 },
  { id: "bottom-3", a: 3, b: 0 },
  { id: "top-0", a: 4, b: 5 },
  { id: "top-1", a: 5, b: 6 },
  { id: "top-2", a: 6, b: 7 },
  { id: "top-3", a: 7, b: 4 },
  { id: "vertical-0", a: 0, b: 4 },
  { id: "vertical-1", a: 1, b: 5 },
  { id: "vertical-2", a: 2, b: 6 },
  { id: "vertical-3", a: 3, b: 7 },
] as const;

export const CUBE_FACES: readonly CubeFaceDef[] = [
  { id: "bottom", corners: [0, 1, 2, 3] },
  { id: "top", corners: [4, 5, 6, 7] },
  { id: "south", corners: [0, 1, 5, 4] },
  { id: "east", corners: [1, 2, 6, 5] },
  { id: "north", corners: [2, 3, 7, 6] },
  { id: "west", corners: [3, 0, 4, 7] },
] as const;

const EDGE_COLOR = Color.fromCssColorString("rgba(226, 232, 240, 0.92)");
const EDGE_SELECTED_COLOR = Color.fromCssColorString("rgba(34, 197, 94, 0.98)");
const FACE_COLOR = Color.fromCssColorString("rgba(56, 189, 248, 0.2)");
const FACE_SELECTED_COLOR = Color.fromCssColorString(
  "rgba(56, 189, 248, 0.45)"
);

const EDGE_WIDTH_PX = 2;
const EDGE_SELECTED_WIDTH_PX = 4;

type CubePickId = {
  __carmaCubePick: true;
  target: CubePickTarget;
};

const createCubePickId = (target: CubePickTarget): CubePickId => ({
  __carmaCubePick: true,
  target,
});

const toCubePickTarget = (value: unknown): CubePickTarget | null => {
  if (!value || typeof value !== "object") return null;

  const maybeCubePick = value as Partial<CubePickId>;
  if (maybeCubePick.__carmaCubePick !== true || !maybeCubePick.target) {
    return null;
  }

  const target = maybeCubePick.target as Partial<CubePickTarget>;
  if (target.kind === "corner" && Number.isInteger(target.cornerIndex)) {
    return {
      kind: "corner",
      cornerIndex: Number(target.cornerIndex),
    };
  }

  if (target.kind === "edge" && typeof target.edgeId === "string") {
    return {
      kind: "edge",
      edgeId: target.edgeId,
    };
  }

  if (target.kind === "face" && typeof target.faceId === "string") {
    return {
      kind: "face",
      faceId: target.faceId,
    };
  }

  return null;
};

export const getCubePickTargetFromPickedObject = (
  pickedObject: unknown
): CubePickTarget | null => {
  if (!pickedObject || typeof pickedObject !== "object") return null;

  const maybeId =
    (pickedObject as { id?: unknown }).id ??
    (pickedObject as { primitive?: { id?: unknown } }).primitive?.id;

  return toCubePickTarget(maybeId);
};

export const buildCubeLocalCorners = (halfSizeMeters: number): Cartesian3[] => {
  const h = Math.max(0.1, halfSizeMeters);
  return [
    new Cartesian3(-h, -h, -h),
    new Cartesian3(h, -h, -h),
    new Cartesian3(h, h, -h),
    new Cartesian3(-h, h, -h),
    new Cartesian3(-h, -h, h),
    new Cartesian3(h, -h, h),
    new Cartesian3(h, h, h),
    new Cartesian3(-h, h, h),
  ];
};

export const getCubeEdgeLocalMidpoint = (
  localCorners: readonly Cartesian3[],
  edge: CubeEdgeDef
): Cartesian3 => {
  const a = localCorners[edge.a];
  const b = localCorners[edge.b];
  if (!a || !b) return new Cartesian3(0, 0, 0);

  return Cartesian3.multiplyByScalar(
    Cartesian3.add(a, b, new Cartesian3()),
    0.5,
    new Cartesian3()
  );
};

export const resolveCubeAnchorLocalForPickTarget = (
  target: CubePickTarget,
  localCorners: readonly Cartesian3[]
): Cartesian3 => {
  if (target.kind === "corner") {
    return Cartesian3.clone(
      localCorners[target.cornerIndex] ?? Cartesian3.ZERO
    );
  }

  if (target.kind === "edge") {
    const edge = CUBE_EDGES.find((candidate) => candidate.id === target.edgeId);
    if (!edge) return new Cartesian3(0, 0, 0);
    return getCubeEdgeLocalMidpoint(localCorners, edge);
  }

  // Face click anchors at cube centroid by spec.
  return new Cartesian3(0, 0, 0);
};

const applyPolylineColor = (polyline: { material?: unknown }, color: Color) => {
  const currentMaterial = polyline.material as
    | {
        uniforms?: { color?: Color };
      }
    | undefined;

  if (currentMaterial?.uniforms) {
    currentMaterial.uniforms.color = Color.clone(color, new Color());
    return;
  }

  polyline.material = Material.fromType("Color", {
    color: Color.clone(color, new Color()),
  });
};

const createCubeFacesPrimitive = (
  localCorners: readonly Cartesian3[],
  selectedTarget: CubePickTarget | null
): Primitive => {
  const instances = CUBE_FACES.map((face) => {
    const isSelectedFace =
      selectedTarget?.kind === "face" && selectedTarget.faceId === face.id;

    const positions = face.corners
      .map((cornerIndex) => localCorners[cornerIndex])
      .filter(defined);

    return new GeometryInstance({
      id: createCubePickId({ kind: "face", faceId: face.id }),
      geometry: CoplanarPolygonGeometry.fromPositions({
        positions,
        vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      attributes: {
        color: ColorGeometryInstanceAttribute.fromColor(
          isSelectedFace ? FACE_SELECTED_COLOR : FACE_COLOR
        ),
      },
    });
  });

  return new Primitive({
    geometryInstances: instances,
    appearance: new PerInstanceColorAppearance({
      translucent: true,
      closed: false,
      flat: true,
    }),
    asynchronous: false,
  });
};

export const createCubePrimitiveVisuals = (
  scene: Scene,
  localCorners: readonly Cartesian3[]
): CubePrimitiveVisuals => {
  const primitiveGroup = createPrimitiveGroup(scene.primitives);
  const edgeCollection = primitiveGroup.add(new PolylineCollection());

  const edgePolylines = CUBE_EDGES.map((edge) => {
    const edgePolyline = edgeCollection.add({
      positions: [
        localCorners[edge.a] ?? Cartesian3.ZERO,
        localCorners[edge.b] ?? Cartesian3.ZERO,
      ],
      width: EDGE_WIDTH_PX,
      id: createCubePickId({
        kind: "edge",
        edgeId: edge.id,
      }),
    });
    applyPolylineColor(edgePolyline, EDGE_COLOR);
    return edgePolyline;
  });

  let selectedTarget: CubePickTarget | null = null;
  let facesPrimitive: Primitive | null = null;

  const rebuildFaces = () => {
    const nextFacesPrimitive = createCubeFacesPrimitive(
      localCorners,
      selectedTarget
    );
    if (facesPrimitive) {
      primitiveGroup.remove(facesPrimitive);
    }
    facesPrimitive = primitiveGroup.add(nextFacesPrimitive);
  };

  const setTransform = (nextModelMatrix: Matrix4) => {
    primitiveGroup.setModelMatrix(nextModelMatrix);
  };

  const setSelection = (nextSelectedTarget: CubePickTarget | null) => {
    selectedTarget = nextSelectedTarget;

    edgePolylines.forEach((edgePolyline, edgeIndex) => {
      const edge = CUBE_EDGES[edgeIndex];
      const isSelectedEdge =
        selectedTarget?.kind === "edge" && selectedTarget.edgeId === edge.id;

      edgePolyline.width = isSelectedEdge
        ? EDGE_SELECTED_WIDTH_PX
        : EDGE_WIDTH_PX;
      applyPolylineColor(
        edgePolyline,
        isSelectedEdge ? EDGE_SELECTED_COLOR : EDGE_COLOR
      );
    });

    rebuildFaces();
  };

  setTransform(Matrix4.IDENTITY);
  setSelection(null);

  const destroy = () => {
    primitiveGroup.destroy();
    facesPrimitive = null;
  };

  return {
    setTransform,
    setSelection,
    destroy,
  };
};
