import type { MutableRefObject } from "react";

import {
  BoxGeometry,
  Cartesian3,
  Cartographic,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  Material,
  PerInstanceColorAppearance,
  PolylineCollection,
  Primitive,
  ShadowMode,
  Transforms,
  type Polyline,
} from "@carma-cesium";
import { debounce } from "lodash";

import type { CesiumRuntime } from "@carma-mapping/engines/cesium/react/runtime";

import {
  FEATUREINFO_MARKER_HIGHLIGHT_HEIGHT,
  FEATUREINFO_MARKER_HIGHLIGHT_MAX_WIDTH,
  FEATUREINFO_MARKER_HIGHLIGHT_MIN_SHOW_DISTANCE,
} from "../config/cesium/cesium.config";
const rodHeight = 2.0;
const rodWidth = 0.3;

type HighlightPolylineCollection = PolylineCollection & {
  cleanupListener?: () => void;
};

export const createMarkerPrimitive = (position: Cartesian3) => {
  const geometry = BoxGeometry.fromDimensions({
    dimensions: new Cartesian3(rodWidth, rodWidth, rodHeight),
    vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
  });

  const geometryInstance = new GeometryInstance({
    geometry,
    modelMatrix: Transforms.eastNorthUpToFixedFrame(position),
    attributes: {
      color: ColorGeometryInstanceAttribute.fromColor(Color.ORANGE),
    },
  });

  return new Primitive({
    geometryInstances: geometryInstance,
    appearance: new PerInstanceColorAppearance({
      closed: true,
      translucent: false,
    }),
    shadows: ShadowMode.CAST_ONLY,
    asynchronous: false,
  });
};

const removePrimitiveIfPresent = (
  runtime: CesiumRuntime,
  primitive: Primitive | PolylineCollection | null
) => {
  if (primitive && runtime.scene.primitives.contains(primitive)) {
    runtime.scene.primitives.remove(primitive);
  }
};

const createHighlightCollection = ({
  position,
  top,
  show,
  width,
}: {
  position: Cartesian3;
  top: Cartesian3;
  show: boolean;
  width: number;
}) => {
  const collection = new PolylineCollection() as HighlightPolylineCollection;
  const polyline = collection.add({
    positions: [position, top],
    show,
    width,
    material: Material.fromType("Color", {
      color: Color.WHITE.withAlpha(0.5),
    }),
  });

  return { collection, polyline };
};

const updateHighlightPolyline = (
  polyline: Polyline,
  show: boolean,
  width: number
) => {
  polyline.show = show;
  if (Math.abs(width - polyline.width) > 0.1 && width > 0.1) {
    polyline.width = width;
  }
};

const getHighlightStyle = (
  runtime: CesiumRuntime,
  position: Cartesian3,
  maxWidth: number,
  minDistance: number
) => {
  const cameraPosition = runtime.camera.position;
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
  runtime: CesiumRuntime,
  markerPrimitiveRef: MutableRefObject<Primitive | null>,
  markerHighlightRef: MutableRefObject<HighlightPolylineCollection | null>,
  positionCartographic: Cartographic
) => {
  if (markerHighlightRef.current?.cleanupListener) {
    markerHighlightRef.current.cleanupListener();
  }
  removePrimitiveIfPresent(runtime, markerPrimitiveRef.current);
  removePrimitiveIfPresent(runtime, markerHighlightRef.current);

  const position = Cartographic.toCartesian(positionCartographic);

  const marker = createMarkerPrimitive(position);
  runtime.scene.primitives.add(marker);
  markerPrimitiveRef.current = marker;

  // highlight
  const positionCartographicTop = positionCartographic.clone();
  positionCartographicTop.height += FEATUREINFO_MARKER_HIGHLIGHT_HEIGHT;
  const top = Cartographic.toCartesian(positionCartographicTop);

  const { show, width } = getHighlightStyle(
    runtime,
    position,
    FEATUREINFO_MARKER_HIGHLIGHT_MAX_WIDTH,
    FEATUREINFO_MARKER_HIGHLIGHT_MIN_SHOW_DISTANCE
  );

  const { collection: highlightCollection, polyline: highlightPolyline } =
    createHighlightCollection({ position, top, show, width });

  runtime.scene.primitives.add(highlightCollection);
  markerHighlightRef.current = highlightCollection;

  const updateHighlightVisibility = debounce(() => {
    const { show, width } = getHighlightStyle(
      runtime,
      position,
      FEATUREINFO_MARKER_HIGHLIGHT_MAX_WIDTH,
      FEATUREINFO_MARKER_HIGHLIGHT_MIN_SHOW_DISTANCE
    );

    console.debug("updateHighlightVisibility", width);
    updateHighlightPolyline(highlightPolyline, show, width);
    runtime.scene.requestRender();
  }, 50);

  // Use a closure to manage the event listener
  const manageListener = (() => {
    runtime.camera.percentageChanged = 0.0001;
    // TODO: still not firing/updating every rendererd frame, but responsive enough.
    // using postRender events is even less responsive
    runtime.camera.changed.addEventListener(updateHighlightVisibility);
    return () => {
      runtime.camera.changed.removeEventListener(updateHighlightVisibility);
    };
  })();

  markerHighlightRef.current.cleanupListener = manageListener;
  runtime.scene.requestRender();
};
