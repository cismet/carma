import {
  ArcType,
  Cartesian2,
  Cartesian3,
  Cartographic,
  CheckerboardMaterialProperty,
  Color,
  ConstantProperty,
  ShadowMode,
  Viewer,
} from "cesium";
import { debounce } from "lodash";
import {
  FEATUREINFO_MARKER_HIGHLIGHT_HEIGHT,
  FEATUREINFO_MARKER_HIGHLIGHT_MAX_WIDTH,
  FEATUREINFO_MARKER_HIGHLIGHT_MIN_SHOW_DISTANCE,
} from "../config/cesium/cesium.config";

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

const getHighlightStyle = (
  viewer: Viewer,
  position: Cartesian3,
  maxWidth: number,
  minDistance: number
) => {
  const cameraPosition = viewer.camera.position;
  const distance = Cartesian3.distance(cameraPosition, position);
  return {
    show: distance > minDistance,
    width: Math.min(
      maxWidth,
      Math.sqrt(Math.abs(distance - minDistance) + 1) / 5
    ),
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
  positionCartographicTop.height += FEATUREINFO_MARKER_HIGHLIGHT_HEIGHT;
  const top = Cartographic.toCartesian(positionCartographicTop);

  const { show, width } = getHighlightStyle(
    viewer,
    position,
    FEATUREINFO_MARKER_HIGHLIGHT_MAX_WIDTH,
    FEATUREINFO_MARKER_HIGHLIGHT_MIN_SHOW_DISTANCE
  );

  const highlight = viewer.entities.add({
    name: "FeatureInfoHighlight",
    show: show,
    polyline: {
      positions: [position, top],
      arcType: ArcType.NONE,
      width,
      material: Color.WHITE.withAlpha(0.5),
    },
  });

  markerHighlightRef.current = highlight;

  const updateHighlightVisibility = debounce(() => {
    // Update polyline visibility based on distance

    if (highlight.polyline && highlight.polyline.width) {
      const { show, width } = getHighlightStyle(
        viewer,
        position,
        FEATUREINFO_MARKER_HIGHLIGHT_MAX_WIDTH,
        FEATUREINFO_MARKER_HIGHLIGHT_MIN_SHOW_DISTANCE
      );
      highlight.show = show;

      console.debug("updateHighlightVisibility", width);
      const currentWidth = highlight.polyline.width.getValue();
      if (Math.abs(width - currentWidth) > 0.1 && width > 0.1) {
        (highlight.polyline.width as ConstantProperty).setValue(width);
        viewer.scene.requestRender();
      }
    }
  }, 50);

  // Use a closure to manage the event listener
  const manageListener = (() => {
    viewer.camera.percentageChanged = 0.0001;
    // TODO: still not firing/updating every rendererd frame, but responsive enough.
    // using postRender events is even less responsive
    viewer.camera.changed.addEventListener(updateHighlightVisibility);
    return () => {
      viewer.camera.changed.removeEventListener(updateHighlightVisibility);
    };
  })();

  markerEntityRef.current.cleanupListener = manageListener;
  //console.debug("LISTENER: updateHighlightVisibility", viewer.camera.changed.numberOfListeners);
};
