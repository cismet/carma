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
import {
  createWideLineSet,
  setWideLineWidth,
} from "../../../../common/wide-lines";
export type ImagePlaneDisplay = {
  show: boolean;
  showOffset: boolean;
  outlineLineWidthPx: number;
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
    outlineColor: string | number;
    outlineOpacity: number;
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

  const tangentOutline = createWideLineSet(scene, _size, [
    {
      key: "tangentPlane",
      color: options.outlineColor,
      opacity: options.outlineOpacity,
    },
  ]);

  let currentDisplay: ImagePlaneDisplay = {
    show: true,
    showOffset: true,
    outlineLineWidthPx: 1,
  };
  let currentVisual: ViewStateVisualizerImagePlaneGeometry | null = null;

  const applyVisibility = () => {
    surface.visible = currentDisplay.show;
    offsetSurface.visible =
      currentDisplay.showOffset && Boolean(currentVisual?.hasViewOffset);
    tangentOutline.setVisible("tangentPlane", false);
  };

  const part = createThreePart<
    ViewStateVisualizerImagePlaneGeometry,
    ImagePlaneDisplay
  >({
    update: (visual) => {
      currentVisual = visual;
      setQuadMeshGeometry(
        surface,
        visual.orthographicTangentPlaneCorners ?? visual.imagePlaneCorners
      );
      setQuadMeshGeometry(offsetSurface, visual.offsetImagePlaneCorners);
      tangentOutline.setLoop("tangentPlane", []);
      applyVisibility();
    },
    setDisplay: (display) => {
      currentDisplay = display;
      setWideLineWidth(
        tangentOutline.lines.tangentPlane,
        display.outlineLineWidthPx
      );
      applyVisibility();
    },
    resize: (nextSize) => {
      tangentOutline.resize(nextSize);
    },
    dispose: () => {
      disposeMeshObject(surface);
      disposeMeshObject(offsetSurface);
      tangentOutline.dispose();
    },
  });

  return {
    ...part,
    surface,
  };
};
