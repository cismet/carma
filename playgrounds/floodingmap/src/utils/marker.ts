import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  CheckerboardMaterialProperty,
  Color,
  ShadowMode,
  Viewer,
} from "cesium";

const interval = 0.1; // 10 cm
const rodHeight = 2.0;
const rodWidth = 0.3;
const repeats = Math.floor(rodHeight / interval);

export const getMarkerConstructorOptions = (position: Cartesian3) => {
  return {
    position,
    box: {
      dimensions: new Cartesian3(rodWidth, rodWidth, rodHeight),
      /*
          material: new StripeMaterialProperty({
            orientation: StripeOrientation.HORIZONTAL,
            offset: 0.05,
            repeat: 20,
            oddColor: Color.YELLOW,
            evenColor: Color.BLACK,
          }),
          */
      material: new CheckerboardMaterialProperty({
        oddColor: Color.ORANGE,
        evenColor: Color.BLACK,
        repeat: new Cartesian2(2, repeats),
      }),
      outline: false,
      shadows: ShadowMode.CAST_ONLY,
    },
  };
};

export const updateMarkerPosition = (
  viewer: Viewer,
  markerEntityRef,
  positionCartographic: Cartographic
) => {
  // Remove existing marker if any
  if (markerEntityRef.current) {
    viewer.entities.remove(markerEntityRef.current);
  }
  const position = Cartographic.toCartesian(positionCartographic);

  const newMarker = viewer.entities.add(getMarkerConstructorOptions(position));
  markerEntityRef.current = newMarker;
};
