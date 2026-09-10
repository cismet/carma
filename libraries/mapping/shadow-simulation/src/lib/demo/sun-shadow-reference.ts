import * as THREE from "three";

import { degToRadNumeric } from "@carma-units";

import {
  ShadowController,
  type ShadowSnapshot,
} from "../runtime/shadow-controller";
import { createShadowVisibilityMaterial } from "../runtime/shadow-visibility-material";

export type SunShadowReferenceOptions = Readonly<{
  distanceMeters: number;
  elevationDegrees: number;
  object: "plate" | "sphere" | "thin-fence";
  view: "overview" | "shadow-edge";
  pointSun: boolean;
  shadowMapSize: number;
  exposure: number;
  sunIntensity: number;
  visibilityOnly: boolean;
  groundTexelFit: boolean;
  rasterJitter?: boolean;
}>;

/** Deterministic metre-scale fixtures, not a second shadow implementation. */
export const createSunShadowReference = (maxShadowMapSize?: number) => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#707980");
  const camera = new THREE.OrthographicCamera(-24, 24, 18, -18, 0.1, 500);
  const receiverMaterial = new THREE.MeshStandardMaterial({
    color: "#e0e0e0",
    roughness: 1,
    metalness: 0,
  });
  const objectMaterial = new THREE.MeshStandardMaterial({
    color: "#bc6e37",
    roughness: 1,
    metalness: 0,
  });
  const receiver = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    receiverMaterial
  );
  receiver.rotation.x = -Math.PI / 2;
  receiver.receiveShadow = true;
  receiver.castShadow = true;
  scene.add(receiver);
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(4, 0.25, 4),
    objectMaterial
  );
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(2, 48, 32),
    objectMaterial
  );
  const fence = new THREE.Group();
  const rodGeometry = new THREE.BoxGeometry(0.04, 1, 4);
  for (let index = 0; index < 9; index += 1) {
    const rod = new THREE.Mesh(rodGeometry, objectMaterial);
    rod.position.x = (index - 4) * 0.45;
    rod.castShadow = true;
    rod.receiveShadow = true;
    fence.add(rod);
  }
  for (const object of [plate, sphere]) {
    object.castShadow = true;
    object.receiveShadow = true;
  }
  scene.add(plate, sphere, fence);
  // Fixed reference illumination makes changes in penumbra geometry comparable.
  // Geoportal supplies atmospheric irradiance to this same controller instead.
  scene.add(new THREE.HemisphereLight(0xdceaff, 0x424047, 0.5));
  const controller = new ShadowController(scene);
  if (maxShadowMapSize !== undefined) {
    controller.setMaxShadowMapSize(maxShadowMapSize);
  }
  const visibilityMaterial = createShadowVisibilityMaterial();
  const lookTarget = new THREE.Vector3();
  const direction = new THREE.Vector3();
  let current: SunShadowReferenceOptions;
  let snapshot: ShadowSnapshot | null = null;

  const update = (options: SunShadowReferenceOptions, aspect: number) => {
    current = options;
    const { distanceMeters, object, view } = options;
    const elevation = degToRadNumeric(options.elevationDegrees);
    direction.set(Math.cos(elevation), Math.sin(elevation), 0);
    plate.visible = object === "plate";
    sphere.visible = object === "sphere";
    fence.visible = object === "thin-fence";
    // Distance is measured from the underside of the reference object.
    plate.position.y = distanceMeters + 0.125;
    sphere.position.y = distanceMeters + 2;
    fence.position.y = distanceMeters + 0.5;
    const shadowX = -distanceMeters / Math.tan(elevation);
    const radius =
      view === "shadow-edge"
        ? 2
        : Math.max(12, (Math.abs(shadowX) + 8) / 2, distanceMeters * 0.65);
    // The far edge is cast by the plate's TOP face, especially relevant at
    // low sun: 25 cm thickness shifts it almost a metre at 15 degrees.
    const detailEdge =
      -2 -
      (distanceMeters + (object === "plate" ? 0.25 : 0)) / Math.tan(elevation);
    lookTarget.set(view === "shadow-edge" ? detailEdge : shadowX / 2, 0, 0);
    camera.left = -radius * aspect;
    camera.right = radius * aspect;
    camera.top = radius;
    camera.bottom = -radius;
    camera.position.copy(lookTarget).add(new THREE.Vector3(10, 32, 24));
    camera.lookAt(lookTarget);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    scene.updateMatrixWorld(true);
    scene.overrideMaterial = options.visibilityOnly ? visibilityMaterial : null;
    controller.setSoftSun(!options.pointSun);
    snapshot = controller.update({
      receiverWorldPoints: [
        new THREE.Vector3(shadowX - 6, 0, -6),
        new THREE.Vector3(shadowX + 6, 0, 6),
        new THREE.Vector3(-6, 0, -6),
        new THREE.Vector3(6, distanceMeters + 4, 6),
      ],
      receiverAnchorWorldPosition: new THREE.Vector3(shadowX / 2, 0, 0),
      minimumElevationMeters: 0,
      maximumElevationMeters: distanceMeters + 4,
      directionToSun: direction,
      color: 0xffffff,
      intensity: options.sunIntensity,
      groundTexelFit: options.groundTexelFit,
      shadowIntensity: 1,
      quality: 64,
      mapTexelBudget: options.shadowMapSize ** 2,
    });
  };

  return {
    scene,
    camera,
    controller,
    get snapshot() {
      return snapshot;
    },
    update,
    sample(round: number, rounds: number) {
      if (current.pointSun) controller.restoreSunDiscCenter();
      else controller.applySunDiscSample(round, rounds, current.rasterJitter);
    },
    dispose() {
      controller.dispose();
      receiver.geometry.dispose();
      plate.geometry.dispose();
      sphere.geometry.dispose();
      rodGeometry.dispose();
      receiverMaterial.dispose();
      objectMaterial.dispose();
      visibilityMaterial.dispose();
      scene.clear();
    },
  };
};
