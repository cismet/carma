import { useEffect, useRef, useState } from "react";
import {
  CesiumWidget,
  Cesium3DTileset,
  Cartesian3,
  BoundingSphere,
  Color,
  PointPrimitiveCollection,
  DebugModelMatrixPrimitive,
  Transforms,
  ClippingPolygon,
  ClippingPolygonCollection,
  CustomShader,
  PerspectiveFrustum,
  HeadingPitchRange,
  OrthographicFrustum,
  ClippingPlaneCollection,
  Cartographic,
} from "cesium";

import type { FC, ReactNode } from "react";
import { CUSTOM_SHADERS_DEFINITIONS } from "@carma-mapping/engines/cesium";
import { TWO_PI } from "@carma/units/helpers";
import { EARTH_RADIUS } from "@carma/geo/utils";

const unlit = new CustomShader(CUSTOM_SHADERS_DEFINITIONS.UNLIT_ENHANCED_2024);

// Simplified position type using plain numbers
type Position = {
  longitude: number;
  latitude: number;
  altitude?: number;
};

const generateRingFromDegrees = (
  centerDeg: Position,
  radiusInMeters: number,
  samples: number = 24
): Position[] => {
  const center = Cartographic.fromDegrees(
    centerDeg.longitude,
    centerDeg.latitude
  );
  const points: Position[] = [];

  const scaleFactor = {
    latitude: 1 / EARTH_RADIUS,
    longitude: 1 / (EARTH_RADIUS * Math.cos(center.latitude)),
  };

  for (let i = 0; i < samples; i++) {
    const angle = (TWO_PI * i) / samples;
    const dx = radiusInMeters * Math.cos(angle);
    const dy = radiusInMeters * Math.sin(angle);
    const point: Position = {
      longitude: center.longitude + dx * scaleFactor.longitude,
      latitude: center.latitude + dy * scaleFactor.latitude,
    };

    points.push(point);
  }
  points[0] && points.push(points[0]); // Close the loop
  return points;
};

const addDebugPrimitives = (widget: CesiumWidget, cartesian: Cartesian3) => {
  const pointCollection = new PointPrimitiveCollection();

  pointCollection.add({
    position: cartesian,
    color: Color.YELLOW,
    pixelSize: 20,
  });

  const debugPrimitive = new DebugModelMatrixPrimitive({
    modelMatrix: Transforms.eastNorthUpToFixedFrame(cartesian),
    length: 100,
    show: true,
    width: 5,
  });

  widget.scene.primitives.add(pointCollection);

  widget.scene.primitives.add(debugPrimitive);
  return () => {
    if (pointCollection && widget.scene.primitives.contains(pointCollection)) {
      widget.scene.primitives.remove(pointCollection);
    }
    if (debugPrimitive && widget.scene.primitives.contains(debugPrimitive)) {
      widget.scene.primitives.remove(debugPrimitive);
    }
  };
};

export const Widget: FC<{
  pixelSize?: { width: number; height: number };
  position: Position;
  range?: number;
  clip?: boolean;
  clipPolygon?: Position[];
  clipRadius?: number;
  tilesetUrl: string;
  debug?: boolean;
  orthographic?: boolean;
  animate?: boolean;
  children?: ReactNode;
}> = ({
  children,
  clip = false,
  orthographic = false,
  pixelSize = { width: 1024, height: 1024 },
  range = 30,
  clipRadius,
  clipPolygon,
  tilesetUrl,
  position = {
    longitude: 7.201578,
    latitude: 51.256565,
    altitude: 335,
  },
  debug = false,
  animate = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [widget, setWidget] = useState<CesiumWidget | null>(null);
  const [tileset, setTileset] = useState<Cesium3DTileset | null>(null);
  const [cartesian, setCartesian] = useState<Cartesian3 | null>(null);

  useEffect(() => {
    const cartesian3 = Cartesian3.fromDegrees(
      position.longitude,
      position.latitude,
      position.altitude ?? 0
    );
    setCartesian(cartesian3);

    console.debug("HOOK: Position changed, setting cartesian3", cartesian3);
  }, [position]);

  useEffect(() => {
    if (!tileset) {
      const loadTilesetAsync = () => {
        (async () => {
          console.debug("Loading tileset:", tilesetUrl);
          const newTileset = await Cesium3DTileset.fromUrl(tilesetUrl, {
            foveatedScreenSpaceError: false,
            dynamicScreenSpaceError: false,
          });
          newTileset.customShader = unlit;
          setTileset(newTileset);
        })();
      };

      loadTilesetAsync();
    }
    return () => {
      if (tileset) {
        console.debug("HOOK: Destroying tileset");
        tileset.destroy();
        setTileset(null);
      }
    };
  }, [tilesetUrl, tileset]);

  useEffect(() => {
    if (tileset && widget) {
      console.debug("HOOK: Tileset added to scene:", tileset);
      widget.scene.primitives.add(tileset);
      return () => {
        if (widget) {
          widget.scene.primitives.remove(tileset);
        }
      };
    }
    return;
  }, [tileset, widget]);

  useEffect(() => {
    if (containerRef.current && !widget) {
      const newWidget = new CesiumWidget(containerRef.current, {
        scene3DOnly: true,
        baseLayer: false,
        skyBox: false,
        skyAtmosphere: false,
        globe: false,
        msaaSamples: 4,
        useBrowserRecommendedResolution: true,
        contextOptions: {
          webgl: {
            alpha: true,
            antialias: true,
          },
        },
      });

      newWidget.scene.backgroundColor = Color.TRANSPARENT;
      const controller = newWidget.scene.screenSpaceCameraController;

      controller.minimumZoomDistance = 15;
      controller.maximumZoomDistance = 250;
      controller.enableCollisionDetection = false;

      setWidget(newWidget);
    }
    return () => {
      if (widget) {
        console.debug("HOOK: Destroying widget");
        widget.destroy();
        setWidget(null);
      }
    };
  }, [widget]);

  useEffect(() => {
    if (widget && cartesian) {
      widget.scene.screenSpaceCameraController.inertiaZoom = 0;
      widget.scene.screenSpaceCameraController.maximumZoomDistance = range * 5;
      widget.scene.screenSpaceCameraController.minimumZoomDistance = range / 2;
      const boundingSphere = new BoundingSphere(cartesian, range);
      widget.camera.viewBoundingSphere(boundingSphere);
      console.debug("HOOK: Camera position updated:", cartesian);
      if (orthographic) {
        if (widget.camera.frustum instanceof PerspectiveFrustum) {
          widget.camera.switchToOrthographicFrustum();
        }

        // TODO enable proper zoom in orthographic mode
        // currently mousewheel zoom too far out of bounds
        widget.scene.screenSpaceCameraController.enableZoom = false;
      }
      if (!orthographic) {
        if (widget.camera.frustum instanceof OrthographicFrustum) {
          widget.camera.switchToPerspectiveFrustum();
        }
        widget.scene.screenSpaceCameraController.enableZoom = true;
      }
    }
    return;
  }, [widget, orthographic, cartesian, range]);

  useEffect(() => {
    if (widget && cartesian && animate) {
      let animationFrameId: number;
      let lastTime = Date.now();
      const boundingSphere = new BoundingSphere(cartesian, range);

      const updateHeading = () => {
        const now = Date.now();
        const increment = 0.0005 * (now - lastTime);

        widget.scene.camera.viewBoundingSphere(
          boundingSphere,
          new HeadingPitchRange(
            widget.scene.camera.heading + increment,
            widget.scene.camera.pitch,
            0
          )
        );
        lastTime = now;
        animationFrameId = requestAnimationFrame(updateHeading);
      };

      updateHeading();

      return () => {
        cancelAnimationFrame(animationFrameId);
      };
    }
    return;
  }, [widget, cartesian, animate, range]);

  useEffect(() => {
    // TODO proper update and removal of the clipping PolygonCollection
    let clippingPolygon: ClippingPolygon | undefined;
    let clippingPolygonCollection: ClippingPolygonCollection | undefined;
    if (widget && tileset) {
      if (clip) {
        console.debug("Creating clipping polygon:", clipRadius);

        if (clipPolygon && clipPolygon.length > 2) {
          clippingPolygon = new ClippingPolygon({
            positions: clipPolygon.map((coord: Position) =>
              Cartesian3.fromDegrees(coord.longitude, coord.latitude)
            ),
          });
          console.debug("Clipping polygon created", clippingPolygon);
        } else if (clipRadius) {
          console.debug("Creating clipping circle:", clipRadius);
          const ringCoords = generateRingFromDegrees(
            { longitude: position.longitude, latitude: position.latitude },
            clipRadius ?? 100
          );

          clippingPolygon = new ClippingPolygon({
            positions: ringCoords.map((coord: Position) =>
              Cartesian3.fromRadians(coord.longitude, coord.latitude)
            ),
          });
        }

        console.debug("Clipping polygon created", clippingPolygon);

        if (clippingPolygon) {
          clippingPolygonCollection = new ClippingPolygonCollection({
            polygons: [clippingPolygon],
            inverse: true,
            enabled: true,
          });
          tileset.clippingPolygons = clippingPolygonCollection;
        }
      } else {
        tileset.clippingPlanes = new ClippingPlaneCollection({
          enabled: false,
        });
        tileset.clippingPolygons = new ClippingPolygonCollection({
          enabled: false,
        });
      }
    }

    return () => {
      if (tileset && clippingPolygonCollection) {
        console.debug(
          "Removing clipping polygon collection:",
          tileset.clippingPolygons
        );
        clippingPolygonCollection.removeAll();
        tileset.clippingPolygons?.removeAll &&
          tileset.clippingPolygons.removeAll();
        tileset.clippingPlanes?.removeAll && tileset.clippingPlanes.removeAll();
      }
    };
  }, [clip, clipRadius, clipPolygon, position, tileset, widget]);

  useEffect(() => {
    if (debug && widget && cartesian) {
      const removeFn = addDebugPrimitives(widget, cartesian);
      return () => {
        if (widget) {
          removeFn();
        }
      };
    }
    return;
  }, [debug, cartesian, widget]);

  console.debug("Render: CustomCesiumWidget", position, range);

  return (
    <div
      ref={containerRef}
      style={{
        width: `${pixelSize.width}px`,
        height: `${pixelSize.height}px`,
        backgroundColor: "transparent",
      }}
    >
      {children}
    </div>
  );
};

export default Widget;
