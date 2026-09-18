import {
  NORDHELLE_LANDMARKS,
  type GeoreferencedLandmark,
} from "@carma-commons/resources";
import type { SharedThreeSceneRuntime } from "@carma-mapping/engines/maplibre";
import * as THREE from "three";
import {
  TERRAIN_HEIGHT_DATUM,
  projectGeodeticToScene,
  sampleGcg2016Field,
  type Gcg2016ShaderField,
  type ReferenceFrame,
  type TerrainGeometryMode,
  type TerrainHeightDatum,
} from "./maplibre-three-reference-surfaces";

/** Render adapter only: all authored model parts, anchors and evidence are resources. */
export const createReferenceLandmarks = (
  frame: ReferenceFrame,
  field: Gcg2016ShaderField,
  geometryMode: TerrainGeometryMode,
  heightDatum: TerrainHeightDatum,
  landmarks: readonly GeoreferencedLandmark[] = NORDHELLE_LANDMARKS
): SharedThreeSceneRuntime => {
  const root = new THREE.Group();
  const localUp = new THREE.Vector3(0, 1, 0);
  for (const landmark of landmarks) {
    const { longitudeDegrees: lon, latitudeDegrees: lat } = landmark;
    const undulation =
      heightDatum === TERRAIN_HEIGHT_DATUM.ELLIPSOIDAL
        ? sampleGcg2016Field(field, frame, lon, lat)
        : 0;
    const ground = landmark.groundNormalHeightMeters + undulation;
    const group = new THREE.Group();
    group.name = landmark.id;
    group.userData.landmark = landmark;
    for (const part of landmark.parts) {
      // Double-precision projection before upload; each tower follows its OWN
      // local vertical. No ECEF-million-metre subtraction in a float shader.
      const bottom = projectGeodeticToScene(
        frame,
        lon,
        lat,
        ground + part.baseHeightMeters,
        geometryMode
      );
      const top = projectGeodeticToScene(
        frame,
        lon,
        lat,
        ground + part.baseHeightMeters + part.heightMeters,
        geometryMode
      );
      const axis = top.clone().sub(bottom);
      const sceneScale = axis.length() / part.heightMeters;
      const geometry = new THREE.CylinderGeometry(
        part.radiusTopMeters * sceneScale,
        part.radiusBottomMeters * sceneScale,
        axis.length(),
        part.radialSegments
      );
      const material = new THREE.MeshBasicMaterial({ color: part.color });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(bottom).add(top).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(localUp, axis.normalize());
      mesh.castShadow = true;
      group.add(mesh);
    }
    root.add(group);
  }
  return {
    id: "reference-landmarks",
    originLngLat: [...frame.originLngLat],
    root,
    update: () => undefined,
    hasRenderableContent: () => true,
    isMainViewReady: () => true,
    getRequestDemand: () => 0,
    dispose: () => {
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          (object.material as THREE.Material).dispose();
        }
      });
      root.clear();
    },
  };
};
