import { FC, ReactNode, useEffect, useRef, useState } from "react";
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
} from "cesium";
import { generateRingFromDegrees } from "./utils/cesiumHelpers";
import { LatLngRadians, LatLngRecord } from "..";
import { CUSTOM_SHADERS_DEFINITIONS } from "./shaders";

const unlit = new CustomShader(CUSTOM_SHADERS_DEFINITIONS.UNLIT);

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
    //pointCollection.removeAll();
    //pointCollection.destroy();
    if (debugPrimitive && widget.scene.primitives.contains(debugPrimitive)) {
      widget.scene.primitives.remove(debugPrimitive);
    }
    //debugPrimitive.destroy();
  };
};

export const CustomCesiumWidget: FC<{
  pixelSize?: { width: number; height: number };
  position: { longitude: number; latitude: number; height?: number };
  range?: number;
  clip?: boolean;
  clipPolygon?: LatLngRecord[];
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
  position = { longitude: 7.201578, latitude: 51.256565, height: 335 },
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
      position.height,
    );
    setCartesian(cartesian3);

    //console.log('HOOK Position changed, setting cartesian3', cartesian3);
  }, [position]);

  useEffect(() => {
    if (!tileset) {
      const loadTilesetAsync = () => {
        (async () => {
          console.log("Loading tileset:", tilesetUrl);
          const newTileset = await Cesium3DTileset.fromUrl(tilesetUrl, {
            //maximumScreenSpaceError: 4,
            //baseScreenSpaceError: 128,
            foveatedScreenSpaceError: false,
            dynamicScreenSpaceError: false,
            //skipLevels: 1,
            //preferLeaves: true,
            //preloadWhenHidden: true,
          });
          newTileset.customShader = unlit;
          setTileset(newTileset);
        })();
      };

      loadTilesetAsync();
    }
    return () => {
      if (tileset) {
        console.log("HOOK: Destroying tileset");
        tileset.destroy();
        setTileset(null);
      }
    };
  }, [tilesetUrl, tileset]);

  useEffect(() => {
    if (tileset && widget) {
      console.log("HOOK: Tileset added to scene:", tileset);
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
            //depth: true,
            //stencil: true,
            antialias: true,
            //preserveDrawingBuffer: true,
          },
        },
        //useDefaultRenderLoop: true,
      });

      newWidget.scene.backgroundColor = Color.TRANSPARENT;
      const controller = newWidget.scene.screenSpaceCameraController;

      controller.minimumZoomDistance = 15;
      controller.maximumZoomDistance = 250;
      controller.enableCollisionDetection = false;

      setWidget(newWidget);
      //const gl = widget.canvas.getContext('webgl');
      //gl && gl.clearColor(0.0, 0.0, 0.0, 0.0);
      //change after setting
    }
    return () => {
      if (widget) {
        console.log("HOOK: Destroying widget");
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
      //widget.camera.frustum.far = Math.round(range * 4);
      //console.log('HOOK: Camera position updated:', cartesian);
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
        //widget.camera.frustum.yOffset = 100;
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
            0,
          ),
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
        //console.log('Creating clipping polygon:', clipRadius);

        if (clipPolygon && clipPolygon.length > 2) {
          clippingPolygon = new ClippingPolygon({
            positions: clipPolygon.map((coord: LatLngRecord) =>
              Cartesian3.fromDegrees(coord.longitude, coord.latitude),
            ),
          });
          console.info("Clipping polygon created", clippingPolygon);
        } else if (clipRadius) {
          console.info("Creating clipping circle:", clipRadius);
          const ringCoords = generateRingFromDegrees(
            { longitude: position.longitude, latitude: position.latitude },
            clipRadius ?? 100,
          );

          clippingPolygon = new ClippingPolygon({
            positions: ringCoords.map((coord: LatLngRadians) =>
              Cartesian3.fromRadians(coord.lngRad, coord.latRad),
            ),
          });
        }

        console.info("Clipping polygon created", clippingPolygon);

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
        //console.log(          'Removing clipping polygon collection:',          tileset.clippingPolygons        );
        clippingPolygonCollection.removeAll();
        //clippingPolygon && tileset.clippingPolygons.remove(clippingPolygon);
        tileset.clippingPolygons?.removeAll &&
          tileset.clippingPolygons.removeAll();
        tileset.clippingPlanes?.removeAll && tileset.clippingPlanes.removeAll();
        //!clippingPolygonCollection.isDestroyed() && clippingPolygonCollection.destroy();
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

  console.log("Render CustomCesiumWidget", position, range);

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

export default CustomCesiumWidget;
