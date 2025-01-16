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
  markerHighlightRef,
  positionCartographic: Cartographic
) => {
  // Remove existing marker if any
  if (markerEntityRef.current) {
    // Cleanup previous listener if exists
    if (markerEntityRef.current.cleanupListener) {
      markerEntityRef.current.cleanupListener();
    }
    viewer.entities.remove(markerEntityRef.current);
    viewer.entities.remove(markerHighlightRef.current);
  }

  const position = Cartographic.toCartesian(positionCartographic);

  const newMarker = viewer.entities.add(getMarkerConstructorOptions(position));
  markerEntityRef.current = newMarker;

  // higlight
  const positionCartographicTop = positionCartographic.clone();
  positionCartographicTop.height += 5000;
  const top = Cartographic.toCartesian(positionCartographicTop);

  const highlight = viewer.entities.add({
    name: "FeatureInfoHighlight",
    polyline: {
      positions: [position, top],
      width: 20,
      material: Color.WHITE.withAlpha(0.5),
    },
  });

  markerHighlightRef.current = highlight;

  const updateHighlightVisibility = () => {
    const cameraPosition = viewer.camera.position;
    const distance = Cartesian3.distance(cameraPosition, position);
    // Update polyline visibility based on distance
    highlight.show = distance >= 100;
    // TODO: update transparency based on distance
    /*
    if (
      highlight.polyline &&
      highlight.polyline.material instanceof ColorMaterialProperty
    ) {
      highlight.polyline.material.color = new ColorMaterialProperty(Color.RED);
    }
    */
  };

  // Use a closure to manage the event listener
  const manageListener = (() => {
    viewer.scene.postRender.addEventListener(updateHighlightVisibility);
    return () => {
      viewer.scene.postRender.removeEventListener(updateHighlightVisibility);
    };
  })();

  markerEntityRef.current.cleanupListener = manageListener;

  // list number of listeners
  console.debug(
    "LISTENER: updateHighlightVisibility",
    viewer.scene.postRender.numberOfListeners
  );
};
