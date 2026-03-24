import type { Scene } from "three";
import type { ViewStateVisualizerImagePlaneGeometry } from "../../derived/camera-view-geometry";
import type { ViewStateVisualizerSize } from "../../view-state-visualizer-types";
import { createThreePart } from "../../../../common/create-part";
import { createCameraLink } from "./camera-link";
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
  showLink: boolean;
  frameLineWidthPx: number;
  axisLineWidthPx: number;
  frustumLineWidthPx: number;
  linkLineWidthPx: number;
  cueColors: {
    imageX: string;
    imageY: string;
    range: string;
  };
  edgeColor: string | number;
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
      outlineOpacity: number;
      surfaceOpacity: number;
      offsetSurfaceOpacity: number;
      offsetOutlineOpacity: number;
      forwardOpacity: number;
      rightOpacity: number;
      upOpacity: number;
      originOpacity: number;
      neutralColor: number;
    };
    camera: {
      fillColor: number;
      edgeColor: number;
      emissiveColor: number;
      linkOpacity: number;
      markerEmissiveIntensity: number;
    };
    frustum: {
      color: number;
      opacity: number;
    };
  }
) => {
  const imagePlane = createImagePlane(scene, size, {
    edgeColor: options.initialEdgeColor,
    fillColor: options.camera.fillColor,
    emissiveColor: options.camera.emissiveColor,
    outlineOpacity: options.imagePlane.outlineOpacity,
    surfaceOpacity: options.imagePlane.surfaceOpacity,
    offsetSurfaceOpacity: options.imagePlane.offsetSurfaceOpacity,
    offsetOutlineOpacity: options.imagePlane.offsetOutlineOpacity,
    neutralColor: options.imagePlane.neutralColor,
  });

  const imagePlaneAxes = createImagePlaneAxes(scene, size, {
    initialColors: {
      edge: options.initialEdgeColor,
      imageX: options.initialImageXColor,
      imageY: options.initialImageYColor,
    },
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
    markerEmissiveIntensity: options.camera.markerEmissiveIntensity,
  });

  const cameraLink = createCameraLink(scene, size, {
    color: options.camera.edgeColor,
    opacity: options.camera.linkOpacity,
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
      cameraLink.update(visual);
    },
    setDisplay: (display) => {
      imagePlane.setDisplay({
        show: display.showImagePlane,
        showOffset: display.showImagePlane && display.showImagePlaneOffset,
        frameLineWidthPx: display.frameLineWidthPx,
        edgeColor: display.edgeColor,
        offsetColor: display.cueColors.imageX,
      });
      imagePlaneAxes.setDisplay({
        showImagePlane: display.showImagePlane,
        showAxes: display.showImagePlane && display.showAxes,
        axisLineWidthPx: display.axisLineWidthPx,
        frustumLineWidthPx: display.frustumLineWidthPx,
        cueColors: {
          imageX: display.cueColors.imageX,
          imageY: display.cueColors.imageY,
        },
        edgeColor: display.edgeColor,
      });
      frustum.setDisplay({
        show: display.showImagePlane && display.showFrustum,
        lineWidthPx: display.frustumLineWidthPx,
      });
      cameraMarker.setDisplay({
        show: display.showMarker,
      });
      cameraLink.setDisplay({
        show: display.showLink,
        lineWidthPx: display.linkLineWidthPx,
        color: display.cueColors.range,
      });
    },
    resize: (nextSize) => {
      imagePlane.resize(nextSize);
      imagePlaneAxes.resize(nextSize);
      frustum.resize(nextSize);
      cameraLink.resize(nextSize);
    },
    dispose: () => {
      imagePlane.dispose();
      imagePlaneAxes.dispose();
      frustum.dispose();
      cameraMarker.dispose();
      cameraLink.dispose();
    },
  });

  return {
    ...part,
    cameraMarker: cameraMarker.mesh,
  };
};
