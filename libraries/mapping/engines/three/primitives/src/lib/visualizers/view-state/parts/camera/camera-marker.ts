import {
  BoxGeometry,
  Matrix4,
  Mesh,
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
  const mesh = new Mesh(
    new BoxGeometry(
      options.cameraBoxSize,
      options.cameraBoxSize,
      options.cameraBoxSize
    ),
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

  let currentDisplay: CameraMarkerDisplay = {
    show: true,
  };

  const part = createThreePart<
    ViewStateVisualizerImagePlaneGeometry,
    CameraMarkerDisplay
  >({
    update: (visual) => {
      const cameraRadial = visual.cameraPosition.clone().normalize();
      mesh.position.copy(
        visual.cameraPosition
          .clone()
          .add(cameraRadial.multiplyScalar(options.cameraBoxSize * 0.5))
      );
      const cameraBasisMatrix = new Matrix4().makeBasis(
        visual.right,
        visual.up,
        visual.forward.clone().negate()
      );
      mesh.setRotationFromMatrix(cameraBasisMatrix);
      mesh.visible = currentDisplay.show;
    },
    setDisplay: (display) => {
      currentDisplay = display;
      mesh.visible = display.show;
    },
    dispose: () => {
      disposeMeshObject(mesh);
    },
  });

  return {
    ...part,
    mesh,
  };
};
