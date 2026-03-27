import type { Scene } from "three";
import type { ViewStateVisualizerImagePlaneGeometry } from "../../derived/camera-view-geometry";
import type { ViewStateVisualizerSize } from "../../view-state-visualizer-types";
import { createThreePart } from "../../../../common/create-part";
import { createCameraMarker } from "./camera-marker";
import { createFrustum } from "./frustum";
import { createImagePlane } from "./image-plane";
import { createImagePlaneAxes } from "./image-plane-axes";

export type CameraViewDisplay = {
  showImagePlane: boolean;
  showImagePlaneOffset: boolean;
  showAxes: boolean;
  showFrustum: boolean;
  showMarker: boolean;
  axisLineWidthPx: number;
  frustumLineWidthPx: number;
  cueColors: {
    imageX: string;
    imageY: string;
    range: string;
  };
};

export const createCameraView = (
  scene: Scene,
  size: ViewStateVisualizerSize,
  options: {
    cameraBoxSize: number;
    initialEdgeColor: string | number;
    initialImageXColor: string;
    initialImageYColor: string;
    imagePlane: {
      surfaceOpacity: number;
      offsetSurfaceOpacity: number;
      forwardOpacity: number;
      rightOpacity: number;
      upOpacity: number;
      originOpacity: number;
      neutralColor: number;
    };
    camera: {
      fillColor: number;
      emissiveColor: number;
      markerOpacity: number;
      markerEmissiveIntensity: number;
    };
    frustum: {
      color: number;
      opacity: number;
    };
  }
) => {
  const imagePlane = createImagePlane(scene, size, {
    fillColor: options.camera.fillColor,
    emissiveColor: options.camera.emissiveColor,
    surfaceOpacity: options.imagePlane.surfaceOpacity,
    offsetSurfaceOpacity: options.imagePlane.offsetSurfaceOpacity,
  });

  const imagePlaneAxes = createImagePlaneAxes(scene, size, {
    initialColors: {
      edge: options.initialEdgeColor,
      imageX: options.initialImageXColor,
      imageY: options.initialImageYColor,
    },
    cameraBoxSize: options.cameraBoxSize,
    forwardOpacity: options.imagePlane.forwardOpacity,
    rightOpacity: options.imagePlane.rightOpacity,
    upOpacity: options.imagePlane.upOpacity,
    originOpacity: options.imagePlane.originOpacity,
  });

  const frustum = createFrustum(scene, size, {
    color: options.frustum.color,
    opacity: options.frustum.opacity,
  });

  const cameraMarker = createCameraMarker(scene, {
    cameraBoxSize: options.cameraBoxSize,
    fillColor: options.camera.fillColor,
    emissiveColor: options.camera.emissiveColor,
    opacity: options.camera.markerOpacity,
    markerEmissiveIntensity: options.camera.markerEmissiveIntensity,
  });

  const part = createThreePart<
    ViewStateVisualizerImagePlaneGeometry,
    CameraViewDisplay
  >({
    update: (visual) => {
      imagePlane.update(visual);
      imagePlaneAxes.update(visual);
      frustum.update(visual);
      cameraMarker.update(visual);
    },
    setDisplay: (display) => {
      imagePlane.setDisplay({
        show: display.showImagePlane,
        showOffset: display.showImagePlane && display.showImagePlaneOffset,
      });
      imagePlaneAxes.setDisplay({
        showAxes: display.showImagePlane && display.showAxes,
        axisLineWidthPx: display.axisLineWidthPx,
        cueColors: {
          imageX: display.cueColors.imageX,
          imageY: display.cueColors.imageY,
        },
        edgeColor: options.initialEdgeColor,
      });
      frustum.setDisplay({
        show: display.showImagePlane && display.showFrustum,
        lineWidthPx: display.frustumLineWidthPx,
      });
      cameraMarker.setDisplay({
        show: display.showMarker,
      });
    },
    resize: (nextSize) => {
      imagePlane.resize(nextSize);
      imagePlaneAxes.resize(nextSize);
      frustum.resize(nextSize);
    },
    dispose: () => {
      imagePlane.dispose();
      imagePlaneAxes.dispose();
      frustum.dispose();
      cameraMarker.dispose();
    },
  });

  return {
    ...part,
    cameraMarker: cameraMarker.mesh,
  };
};
