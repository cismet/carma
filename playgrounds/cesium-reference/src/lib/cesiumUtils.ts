import { Cartographic, Math as CesiumMath } from "cesium";

export const toCartographic = ({
    longitude,
    latitude,
    height,
  }: {
    longitude: number;
    latitude: number;
    height: number;
  }) => {
    return new Cartographic(
      CesiumMath.toRadians(longitude),
      CesiumMath.toRadians(latitude),
      height
    );
  };