import maplibregl from "maplibre-gl";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

import { getFromWebMercatorToWGS84 } from "@carma-geo/proj";

import { disposeObject, toLocalMercatorVector } from "./sample-gltf-asset";

export const DZ_B_PRM_EPSG3857_CENTER = {
  x: 791706.051,
  y: 6664825.628,
} as const;

const [DZ_B_PRM_LONGITUDE, DZ_B_PRM_LATITUDE] = getFromWebMercatorToWGS84([
  DZ_B_PRM_EPSG3857_CENTER.x,
  DZ_B_PRM_EPSG3857_CENTER.y,
]);

export const DZ_B_PRM_POSITION = {
  longitude: DZ_B_PRM_LONGITUDE,
  latitude: DZ_B_PRM_LATITUDE,
  altitude: 0,
} as const;

export const DZ_B_PRM_STL_BASE_URI = "/__dz_b_prm__";

export const DZ_B_PRM_STL_PARTS = [
  {
    id: "environment",
    label: "Umgebung",
    filename: "umgebung.stl",
    color: 0x8f9aa3,
  },
  {
    id: "zoo",
    label: "Zoo",
    filename: "zoo.stl",
    color: 0xd8b07a,
  },
  {
    id: "bridge",
    label: "Brücke",
    filename: "bruecke.stl",
    color: 0x72a9c4,
  },
  {
    id: "bridgeExisting",
    label: "Brücke Bestand",
    filename: "bruecke-bestand.stl",
    color: 0x5f7fa8,
  },
  {
    id: "station",
    label: "Bergstation",
    filename: "bergstation.stl",
    color: 0xb8c17c,
  },
] as const;

export type DzbPrmStlPartId = (typeof DZ_B_PRM_STL_PARTS)[number]["id"];
export type DzbPrmStlQuality = "2m" | "5m" | "original";
export type DzbPrmStlVisibility = Record<DzbPrmStlPartId, boolean>;

const getDzbPrmVariantDirectory = (quality: DzbPrmStlQuality) =>
  quality === "original" ? "full" : quality;

export const createDzbPrmStlUrl = (
  quality: DzbPrmStlQuality,
  filename: string
) =>
  `${DZ_B_PRM_STL_BASE_URI}/${getDzbPrmVariantDirectory(quality)}/${filename}`;

/**
 * The source STL uses millimetres in a local plate-centred frame. Its scale
 * is anisotropic: x/y are derived from the EPSG:3857 bounds, while z is
 * explicitly documented as z_mm = height_m_NHN * 0.5.
 */
export const createDzbPrmStlModelMatrix = ({
  localPosition,
  metersToMercatorUnits,
}: {
  localPosition: THREE.Vector3;
  metersToMercatorUnits: number;
}) =>
  new THREE.Matrix4()
    .makeTranslation(localPosition.x, localPosition.y, localPosition.z)
    .scale(
      new THREE.Vector3(
        metersToMercatorUnits * 3.19203,
        -metersToMercatorUnits * 3.19241,
        metersToMercatorUnits * 2
      )
    );

export const getDzbPrmStlAnchor = () =>
  maplibregl.MercatorCoordinate.fromLngLat(
    [DZ_B_PRM_POSITION.longitude, DZ_B_PRM_POSITION.latitude],
    DZ_B_PRM_POSITION.altitude
  );

export const getDzbPrmStlLocalPosition = (
  origin: maplibregl.MercatorCoordinate
) => toLocalMercatorVector(getDzbPrmStlAnchor(), origin);

export const addDzbPrmStlAssetsToScene = async ({
  scene,
  origin,
  metersToMercatorUnits,
  quality,
  visibility,
  isCancelled,
}: {
  scene: THREE.Scene;
  origin: maplibregl.MercatorCoordinate;
  metersToMercatorUnits: number;
  quality: DzbPrmStlQuality;
  visibility: DzbPrmStlVisibility;
  isCancelled: () => boolean;
}) => {
  const loader = new STLLoader();
  const root = new THREE.Group();
  root.name = `DZ_B_PRM STL (${quality})`;
  root.matrixAutoUpdate = false;
  root.matrix.copy(
    createDzbPrmStlModelMatrix({
      localPosition: getDzbPrmStlLocalPosition(origin),
      metersToMercatorUnits,
    })
  );

  const visibleParts = DZ_B_PRM_STL_PARTS.filter(({ id }) => visibility[id]);

  try {
    const loadedParts = await Promise.all(
      visibleParts.map(async (part) => ({
        part,
        geometry: await loader.loadAsync(
          createDzbPrmStlUrl(quality, part.filename)
        ),
      }))
    );

    if (isCancelled()) {
      loadedParts.forEach(({ geometry }) => geometry.dispose());
      return;
    }

    loadedParts.forEach(({ part, geometry }) => {
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color: part.color,
          side: THREE.DoubleSide,
        })
      );
      mesh.name = `DZ_B_PRM ${part.label}`;
      mesh.visible = visibility[part.id];
      root.add(mesh);
    });

    scene.add(root);
    return root;
  } catch (error) {
    disposeObject(root);
    throw error;
  }
};
