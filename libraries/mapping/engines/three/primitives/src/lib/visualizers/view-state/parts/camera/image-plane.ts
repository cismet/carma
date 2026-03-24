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
  disposeWideLine,
  setWideLineColor,
  setWideLineLoopGeometry,
  setWideLineResolution,
  setWideLineWidth,
} from "../../../../common/wide-lines";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

export type ImagePlaneDisplay = {
  show: boolean;
  showOffset: boolean;
  frameLineWidthPx: number;
  edgeColor: string | number;
  offsetColor: string | number;
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
  size: ViewStateVisualizerSize,
  options: {
    edgeColor: string | number;
    fillColor: number;
    emissiveColor: number;
    outlineOpacity: number;
    surfaceOpacity: number;
    offsetSurfaceOpacity: number;
    offsetOutlineOpacity: number;
    neutralColor: number;
  }
) => {
  const outline = new Line2(
    new LineGeometry(),
    new LineMaterial({
      color: options.edgeColor,
      transparent: true,
      opacity: options.outlineOpacity,
    })
  );
  setWideLineResolution(outline, size);
  scene.add(outline);

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

  const offsetOutline = new Line2(
    new LineGeometry(),
    new LineMaterial({
      color: options.neutralColor,
      transparent: true,
      opacity: options.offsetOutlineOpacity,
    })
  );
  setWideLineResolution(offsetOutline, size);
  scene.add(offsetOutline);

  let currentDisplay: ImagePlaneDisplay = {
    show: true,
    showOffset: true,
    frameLineWidthPx: 1,
    edgeColor: options.edgeColor,
    offsetColor: options.neutralColor,
  };
  let currentVisual: ViewStateVisualizerImagePlaneGeometry | null = null;

  const applyVisibility = () => {
    surface.visible = currentDisplay.show;
    offsetSurface.visible =
      currentDisplay.showOffset && Boolean(currentVisual?.hasViewOffset);
    offsetOutline.visible = false;
  };

  return createThreePart<
    ViewStateVisualizerImagePlaneGeometry,
    ImagePlaneDisplay
  >({
    update: (visual) => {
      currentVisual = visual;
      setWideLineLoopGeometry(outline, visual.imagePlaneCorners);
      setQuadMeshGeometry(surface, visual.imagePlaneCorners);
      setQuadMeshGeometry(offsetSurface, visual.offsetImagePlaneCorners);
      setWideLineLoopGeometry(
        offsetOutline,
        visual.offsetImagePlaneCorners ?? []
      );
      applyVisibility();
    },
    setDisplay: (display) => {
      currentDisplay = display;
      setWideLineWidth(outline, display.frameLineWidthPx);
      setWideLineWidth(offsetOutline, display.frameLineWidthPx);
      setWideLineColor(outline, display.edgeColor);
      setWideLineColor(offsetOutline, display.offsetColor);
      applyVisibility();
    },
    resize: (nextSize) => {
      setWideLineResolution(outline, nextSize);
      setWideLineResolution(offsetOutline, nextSize);
    },
    dispose: () => {
      disposeWideLine(outline);
      disposeMeshObject(surface);
      disposeMeshObject(offsetSurface);
      disposeWideLine(offsetOutline);
    },
  });
};
