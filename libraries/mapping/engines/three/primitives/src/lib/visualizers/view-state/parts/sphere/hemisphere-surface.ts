import {
  DoubleSide,
  Mesh,
  MeshPhysicalMaterial,
  SphereGeometry,
  type Scene,
  type Vector3,
} from "three";
import { PI, clamp } from "@carma/math";
import { createThreePart } from "../../../../common/create-part";
import { disposeMeshObject } from "../../../../common/mesh-helpers";

const NUMERIC_EPSILON = 1e-6;

const createSphereGeometry = ({
  radius,
  widthSegments,
  heightSegments,
  capRad,
}: {
  radius: number;
  widthSegments: number;
  heightSegments: number;
  capRad: number;
}) =>
  new SphereGeometry(
    radius,
    widthSegments,
    heightSegments,
    0,
    Math.PI * 2,
    0,
    capRad
  );

export type HemisphereSurfaceDisplay = {
  visible: boolean;
  opacity: number;
  sphereCapRad: number;
  rotateWithPose: boolean;
};

export const createHemisphereSurface = (
  scene: Scene,
  options: {
    radius: number;
    widthSegments: number;
    heightSegments: number;
    minCapRad: number;
    initialCapRad: number;
    initialOpacity: number;
    material: {
      color: number;
      roughness: number;
      metalness: number;
      clearcoat: number;
      clearcoatRoughness: number;
      emissive: number;
      emissiveIntensity: number;
    };
  }
) => {
  const mesh = new Mesh(
    createSphereGeometry({
      radius: options.radius,
      widthSegments: options.widthSegments,
      heightSegments: options.heightSegments,
      capRad: options.initialCapRad,
    }),
    new MeshPhysicalMaterial({
      color: options.material.color,
      transparent: options.initialOpacity < 1,
      opacity: options.initialOpacity,
      depthWrite: options.initialOpacity >= 1,
      roughness: options.material.roughness,
      metalness: options.material.metalness,
      clearcoat: options.material.clearcoat,
      clearcoatRoughness: options.material.clearcoatRoughness,
      emissive: options.material.emissive,
      emissiveIntensity: options.material.emissiveIntensity,
      side: DoubleSide,
    })
  );
  scene.add(mesh);

  const material = mesh.material as MeshPhysicalMaterial;
  let currentCapRad = options.initialCapRad;
  let referenceCameraVector: Vector3 | null = null;
  let rotateWithPose = false;

  const part = createThreePart<Vector3, HemisphereSurfaceDisplay>({
    update: (cameraPosition) => {
      mesh.position.set(0, 0, 0);
      if (rotateWithPose) {
        const currentCameraVector = cameraPosition.clone().normalize();
        if (!referenceCameraVector) {
          referenceCameraVector = currentCameraVector.clone();
        }
        mesh.quaternion.setFromUnitVectors(
          referenceCameraVector,
          currentCameraVector
        );
        return;
      }

      referenceCameraVector = null;
      mesh.quaternion.identity();
    },
    setDisplay: (display) => {
      mesh.visible = display.visible;
      material.opacity = clamp(display.opacity, 0, 1);
      material.transparent = material.opacity < 1;
      material.depthWrite = material.opacity >= 1;
      material.needsUpdate = true;
      rotateWithPose = display.rotateWithPose;

      const nextCapRad = clamp(
        display.sphereCapRad,
        options.minCapRad,
        PI - NUMERIC_EPSILON
      );
      if (Math.abs(nextCapRad - currentCapRad) > NUMERIC_EPSILON) {
        mesh.geometry.dispose();
        mesh.geometry = createSphereGeometry({
          radius: options.radius,
          widthSegments: options.widthSegments,
          heightSegments: options.heightSegments,
          capRad: nextCapRad,
        });
        currentCapRad = nextCapRad;
      }
    },
    dispose: () => disposeMeshObject(mesh),
  });

  return {
    ...part,
    mesh,
  };
};
