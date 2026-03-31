import {
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  type Scene,
  Vector3,
} from "three";

import type { ViewStateVisualizerImagePlaneGeometry } from "../../derived/camera-view-geometry";
import { createThreePart } from "../../../../common/create-part";
import {
  disposeMeshObject,
  setCoplanarConvexPolygonMeshGeometry,
} from "../../../../common/mesh-helpers";
export type ProjectionPlaneDisplay = {
  show: boolean;
};

const PROJECTION_PLANE_LIFT_Y = 0.002;
const PROJECTION_PLANE_NORMAL = new Vector3(0, 1, 0);

export const createProjectionPlane = (
  scene: Scene,
  options: {
    fillColor: number;
    emissiveColor: number;
    opacity: number;
  }
) => {
  const surface = new Mesh(
    new BufferGeometry(),
    new MeshStandardMaterial({
      color: options.fillColor,
      transparent: true,
      opacity: options.opacity,
      depthWrite: false,
      roughness: 0.86,
      metalness: 0.02,
      emissive: options.emissiveColor,
      emissiveIntensity: 0.025,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 3,
      polygonOffsetUnits: 3,
    })
  );
  surface.name = "projectionPlane";
  surface.position.y = PROJECTION_PLANE_LIFT_Y;
  scene.add(surface);

  let currentDisplay: ProjectionPlaneDisplay = {
    show: false,
  };
  let currentVisual: ViewStateVisualizerImagePlaneGeometry | null = null;

  const applyVisibility = () => {
    surface.visible =
      currentDisplay.show &&
      Boolean(currentVisual?.projectionPlanePolygon) &&
      currentVisual.projectionPlanePolygon.length >= 3;
  };

  return createThreePart<
    ViewStateVisualizerImagePlaneGeometry,
    ProjectionPlaneDisplay
  >({
    update: (visual) => {
      currentVisual = visual;
      setCoplanarConvexPolygonMeshGeometry({
        mesh: surface,
        polygon: visual.projectionPlanePolygon,
        planeNormal: PROJECTION_PLANE_NORMAL,
      });
      applyVisibility();
    },
    setDisplay: (display) => {
      currentDisplay = display;
      applyVisibility();
    },
    dispose: () => {
      disposeMeshObject(surface);
    },
  });
};
