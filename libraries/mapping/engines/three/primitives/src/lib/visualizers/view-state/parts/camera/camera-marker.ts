import {
  BoxGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Scene,
} from "three";
import type { ViewStateVisualizerImagePlaneGeometry } from "../../derived/camera-view-geometry";
import { createThreePart } from "../../../../common/create-part";
import { disposeMeshObject } from "../../../../common/mesh-helpers";

export type CameraMarkerDisplay = {
  show: boolean;
};

export const createCameraMarker = (
  scene: Scene,
  options: {
    cameraBoxSize: number;
    fillColor: number;
    emissiveColor: number;
    markerEmissiveIntensity: number;
    opacity: number;
  }
) => {
  const markerWidth = options.cameraBoxSize;
  const markerHeight = options.cameraBoxSize;
  const markerDepth = options.cameraBoxSize * 0.5;
  const mesh = new Mesh(
    new BoxGeometry(markerWidth, markerHeight, markerDepth),
    new MeshStandardMaterial({
      color: options.fillColor,
      transparent: options.opacity < 1,
      opacity: options.opacity,
      depthWrite: options.opacity >= 1,
      roughness: 0.82,
      metalness: 0.03,
      emissive: options.emissiveColor,
      emissiveIntensity: options.markerEmissiveIntensity,
    })
  );
  scene.add(mesh);

  const dragMesh = new Mesh(
    new BoxGeometry(markerWidth * 1.9, markerHeight * 1.9, markerDepth * 2.2),
    new MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
  );
  scene.add(dragMesh);

  let currentDisplay: CameraMarkerDisplay = {
    show: true,
  };

  const part = createThreePart<
    ViewStateVisualizerImagePlaneGeometry,
    CameraMarkerDisplay
  >({
    update: (visual) => {
      const cameraRadial = visual.cameraPosition.clone().normalize();
      const markerPosition = visual.cameraPosition
        .clone()
        .add(cameraRadial.multiplyScalar(markerDepth * 0.5));
      mesh.position.copy(markerPosition);
      dragMesh.position.copy(markerPosition);
      const cameraBasisMatrix = new Matrix4().makeBasis(
        visual.right,
        visual.up,
        visual.forward.clone().negate()
      );
      mesh.setRotationFromMatrix(cameraBasisMatrix);
      dragMesh.setRotationFromMatrix(cameraBasisMatrix);
      mesh.visible = currentDisplay.show;
      dragMesh.visible = currentDisplay.show;
    },
    setDisplay: (display) => {
      currentDisplay = display;
      mesh.visible = display.show;
      dragMesh.visible = display.show;
    },
    dispose: () => {
      disposeMeshObject(mesh);
      disposeMeshObject(dragMesh);
    },
  });

  return {
    ...part,
    mesh,
    dragMesh,
  };
};
