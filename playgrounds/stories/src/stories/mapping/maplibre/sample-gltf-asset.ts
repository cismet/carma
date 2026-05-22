import maplibregl from "maplibre-gl";
import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export type GeographicPosition = {
  longitude: number;
  latitude: number;
  altitude: number;
};

export const BUGA_BRIDGE_POSITION: GeographicPosition = {
  longitude: 7.121277,
  latitude: 51.252545,
  altitude: 245.4,
};

export const BUGA_BRIDGE_HEADING_DEG = 95.45;
export const BUGA_BRIDGE_NAME = "Hängebrücke (Entwurf Stand Juli 2025)";
export const BUGA_BRIDGE_ASSET_URI =
  "https://wupp-3d-data.cismet.de/mesh2024/assets/bridge.glb";
export const BUGA_BRIDGE_STORY_ASSET_URI = BUGA_BRIDGE_ASSET_URI.replace(
  "https://wupp-3d-data.cismet.de",
  "/__wupp_3d__"
);
export const THREE_DRACO_DECODER_PATH = "/__three_draco__/";

export const toBugaBridgeMercatorCoordinate = () =>
  maplibregl.MercatorCoordinate.fromLngLat(
    [BUGA_BRIDGE_POSITION.longitude, BUGA_BRIDGE_POSITION.latitude],
    BUGA_BRIDGE_POSITION.altitude
  );

export const toLocalMercatorVector = (
  coordinate: maplibregl.MercatorCoordinate,
  origin: maplibregl.MercatorCoordinate
) =>
  new THREE.Vector3(
    coordinate.x - origin.x,
    coordinate.y - origin.y,
    coordinate.z - origin.z
  );

export const createHeadingPitchRollMatrix = (
  headingDeg = 0,
  pitchDeg = 0,
  rollDeg = 0
) =>
  new THREE.Matrix4()
    .multiply(
      new THREE.Matrix4().makeRotationZ(-THREE.MathUtils.degToRad(headingDeg))
    )
    .multiply(
      new THREE.Matrix4().makeRotationY(-THREE.MathUtils.degToRad(pitchDeg))
    )
    .multiply(
      new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(rollDeg))
    );

export const createGltfAxisCorrectionMatrix = () =>
  new THREE.Matrix4()
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
    .multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));

export const createModelAnchorToMapLibreMatrix = (
  localPosition: THREE.Vector3,
  metersToMercatorUnits: number
) =>
  new THREE.Matrix4()
    .makeTranslation(localPosition.x, localPosition.y, localPosition.z)
    .scale(
      new THREE.Vector3(
        metersToMercatorUnits,
        -metersToMercatorUnits,
        metersToMercatorUnits
      )
    );

export const createBridgeModelMatrix = (
  localPosition: THREE.Vector3,
  metersToMercatorUnits: number
) =>
  createModelAnchorToMapLibreMatrix(localPosition, metersToMercatorUnits)
    .multiply(createHeadingPitchRollMatrix(BUGA_BRIDGE_HEADING_DEG))
    .multiply(createGltfAxisCorrectionMatrix());

export const getBugaBridgeAnchor = (origin: maplibregl.MercatorCoordinate) => {
  const coordinate = toBugaBridgeMercatorCoordinate();
  return {
    coordinate,
    position: toLocalMercatorVector(coordinate, origin),
    scale: coordinate.meterInMercatorCoordinateUnits(),
  };
};

export const disposeObject = (object: THREE.Object3D) => {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();

    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    } else {
      material?.dispose();
    }
  });
};

export const addModelAxesToScene = ({
  scene,
  name,
  length,
  matrix,
  position,
  quaternion,
}: {
  scene: THREE.Scene;
  name: string;
  length: number;
  matrix?: THREE.Matrix4;
  position?: THREE.Vector3;
  quaternion?: THREE.Quaternion;
}) => {
  const axes = new THREE.AxesHelper(length);
  axes.name = `${name} axes`;

  if (matrix) {
    axes.matrixAutoUpdate = false;
    axes.matrix.copy(matrix);
  } else {
    if (position) {
      axes.position.copy(position);
    }
    if (quaternion) {
      axes.quaternion.copy(quaternion);
    }
  }

  scene.add(axes);
  return axes;
};

export const addBugaBridgeAssetToScene = ({
  scene,
  origin,
  isCancelled,
  onLoaded,
  onError,
}: {
  scene: THREE.Scene;
  origin: maplibregl.MercatorCoordinate;
  isCancelled: () => boolean;
  onLoaded?: (bridge: THREE.Object3D) => void;
  onError?: (error: unknown) => void;
}) => {
  const { position, scale } = getBugaBridgeAnchor(origin);
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(THREE_DRACO_DECODER_PATH);

  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);
  loader.load(
    BUGA_BRIDGE_STORY_ASSET_URI,
    (gltf) => {
      dracoLoader.dispose();
      if (isCancelled()) {
        disposeObject(gltf.scene);
        return;
      }

      const bridge = gltf.scene;
      bridge.name = `${BUGA_BRIDGE_NAME} actual GLB`;
      bridge.matrixAutoUpdate = false;
      bridge.matrix.copy(createBridgeModelMatrix(position, scale));
      scene.add(bridge);
      onLoaded?.(bridge);
    },
    undefined,
    (error) => {
      dracoLoader.dispose();
      onError?.(error);
    }
  );
};
