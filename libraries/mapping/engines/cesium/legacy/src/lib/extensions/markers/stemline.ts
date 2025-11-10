import {
  Color,
  Material,
  PolylineCollection,
  type Cartesian3,
  type Cartographic,
  type Polyline,
  type Scene,
} from "@carma/cesium";

import type { PolylineConfig } from "../../../";
import type { MarkerPrimitiveData } from "./index.d";

export const createOrUpdateStemline = (
  scene: Scene,
  markerData: MarkerPrimitiveData,
  [pos, groundPos]: Cartographic[],
  options: Partial<PolylineConfig> = {}
) => {
  const topHeight = pos.height - (options.gap ?? 0);
  const baseHeight = groundPos.height + (options.gap ?? 10);

  const posTop = pos.clone();
  posTop.height = topHeight;
  const posBase = groundPos.clone();
  posBase.height = baseHeight;

  const posCenter = pos.clone();
  posCenter.height = baseHeight + (topHeight - baseHeight) * 0.2;

  const baseColor =
    options.color?.length === 4 ? new Color(...options.color) : Color.WHITE;

  const colorMaterial = Material.fromType("Color", { color: baseColor });

  const material = options.glow
    ? Material.fromType("PolylineGlow", {
        color: baseColor,
        glowPower: 1.0,
        taperPower: 0.1,
      })
    : colorMaterial;

  let positions: Cartesian3[] | undefined;

  positions = scene.ellipsoid.cartographicArrayToCartesianArray([
    posTop,
    posCenter,
    posBase,
  ]);

  if (!positions) {
    return;
  }

  const width = options.width ?? 4;

  if (markerData.stemline && !markerData.stemline.isDestroyed()) {
    updatePolyline(markerData.stemline, positions, width, material);
    return;
  }

  const [top, center, base] = positions;
  const polylineTop = {
    positions: [top, center],
    width,
    material,
  };
  const polylineBottom = {
    positions: [base, center],
    width,
    material,
  };

  console.debug(
    "[CESIUM|SCENE|POLYLINE] adding Stemline",
    posTop.height,
    posBase.height
  );

  const stemlineCollection = new PolylineCollection();
  stemlineCollection.add(polylineTop);
  stemlineCollection.add(polylineBottom);

  scene.primitives.add(stemlineCollection);

  markerData.stemline = stemlineCollection;
};

const updatePolyline = (
  collection: PolylineCollection,
  positions: Cartesian3[],
  width: number,
  material: Material
) => {
  const [top, center, base] = positions;

  for (let i = 0; i < collection.length; i += 1) {
    const polyline = collection.get(i) as Polyline | undefined;

    if (!polyline) {
      continue;
    }

    polyline.width = width;
    polyline.material = material;

    if (i === 0) {
      polyline.positions = [top, center];
    } else {
      polyline.positions = [base, center];
    }
  }
};
