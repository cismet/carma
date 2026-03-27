import {
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  type Scene,
} from "three";
import type { ViewStateVisualizerImagePlaneGeometry } from "../../derived/camera-view-geometry";
import type { ViewStateVisualizerSize } from "../../view-state-visualizer-types";
import { createThreePart } from "../../../../common/create-part";
import {
  disposeMeshObject,
  setQuadMeshGeometry,
} from "../../../../common/mesh-helpers";

export type ImagePlaneDisplay = {
  show: boolean;
  showOffset: boolean;
};

const createMeshMaterial = ({
  color,
  opacity,
  emissive,
  emissiveIntensity,
  polygonOffsetFactor,
  polygonOffsetUnits,
}: {
  color: number;
  opacity: number;
  emissive: number;
  emissiveIntensity: number;
  polygonOffsetFactor: number;
  polygonOffsetUnits: number;
}) =>
  new MeshStandardMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    roughness: 0.82,
    metalness: 0.03,
    emissive,
    emissiveIntensity,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor,
    polygonOffsetUnits,
  });

export const createImagePlane = (
  scene: Scene,
  _size: ViewStateVisualizerSize,
  options: {
    fillColor: number;
    emissiveColor: number;
    surfaceOpacity: number;
    offsetSurfaceOpacity: number;
  }
) => {
  const surface = new Mesh(
    new BufferGeometry(),
    createMeshMaterial({
      color: options.fillColor,
      opacity: options.surfaceOpacity,
      emissive: options.emissiveColor,
      emissiveIntensity: 0.03,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2,
    })
  );
  scene.add(surface);

  const offsetSurface = new Mesh(
    new BufferGeometry(),
    createMeshMaterial({
      color: options.fillColor,
      opacity: options.offsetSurfaceOpacity,
      emissive: options.emissiveColor,
      emissiveIntensity: 0.04,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
  );
  scene.add(offsetSurface);

  let currentDisplay: ImagePlaneDisplay = {
    show: true,
    showOffset: true,
  };
  let currentVisual: ViewStateVisualizerImagePlaneGeometry | null = null;

  const applyVisibility = () => {
    surface.visible = currentDisplay.show;
    offsetSurface.visible =
      currentDisplay.showOffset && Boolean(currentVisual?.hasViewOffset);
  };

  return createThreePart<
    ViewStateVisualizerImagePlaneGeometry,
    ImagePlaneDisplay
  >({
    update: (visual) => {
      currentVisual = visual;
      setQuadMeshGeometry(surface, visual.imagePlaneCorners);
      setQuadMeshGeometry(offsetSurface, visual.offsetImagePlaneCorners);
      applyVisibility();
    },
    setDisplay: (display) => {
      currentDisplay = display;
      applyVisibility();
    },
    resize: () => undefined,
    dispose: () => {
      disposeMeshObject(surface);
      disposeMeshObject(offsetSurface);
    },
  });
};
