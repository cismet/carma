import React, { Children, ReactNode, useEffect, useRef, useState } from 'react';
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
} from 'cesium';
import { WUPP3D } from '../config/dataSources.config';
import { generateRingFromDegrees } from '../utils/cesiumHelpers';
import { LatLngRadians } from '../..';
import { CUSTOM_SHADERS_DEFINITIONS } from '../utils/cesiumShaders';

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

const CustomCesiumWidget: React.FC<{
  pixelSize?: { width: number; height: number };
  position: { longitude: number; latitude: number; height?: number };
  range?: number;
  clip?: boolean;
  clipPolygon?: ClippingPolygon;
  clipRadius?: number;
  tilesetUrl?: string;
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
  tilesetUrl = WUPP3D.url,
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
      position.height
    );
    setCartesian(cartesian3);

    //console.log('HOOK Position changed, setting cartesian3', cartesian3);
  }, [position]);

  useEffect(() => {
    if (!tileset) {
      const loadTilesetAsync = () => {
        (async () => {
          console.log('Loading tileset:', tilesetUrl);
          const newTileset = await Cesium3DTileset.fromUrl(tilesetUrl, {
            maximumScreenSpaceError: 4,
            baseScreenSpaceError: 128,
            foveatedScreenSpaceError: false,
            dynamicScreenSpaceError: false,
            //skipLevels: 1,
            //preferLeaves: true,
            preloadWhenHidden: true,
          });
          newTileset.customShader = unlit;
          setTileset(newTileset);
        })();
      };

      loadTilesetAsync();
    }
    return () => {
      if (tileset) {
        console.log('HOOK: Destroying tileset');
        tileset.destroy();
        setTileset(null);
      }
    };
  }, [tilesetUrl, tileset]);

  useEffect(() => {
    if (tileset && widget) {
      console.log('HOOK: Tileset added to scene:', tileset);
      widget.scene.primitives.add(tileset);
      return () => {
        if (widget) {
          widget.scene.primitives.remove(tileset);
        }
      };
    }
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
            alpha: clip,
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
        console.log('HOOK: Destroying widget');
        widget.destroy();
        setWidget(null);
      }
    };
  }, [widget, clip]);

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
  }, [widget, cartesian, animate, range]);

  useEffect(() => {
    // TODO proper update and removal of the clipping PolygonCollection
    let clippingPolygon: ClippingPolygon | undefined;
    let clippingPolygonCollection: ClippingPolygonCollection | undefined;
    if (widget && tileset) {
      if (clip) {
        //console.log('Creating clipping polygon:', clipRadius);
        const ringCoords = generateRingFromDegrees(
          { longitude: position.longitude, latitude: position.latitude },
          clipRadius ?? 100
        );

        clippingPolygon = new ClippingPolygon({
          positions: ringCoords.map((coord: LatLngRadians) =>
            Cartesian3.fromRadians(coord.lngRad, coord.latRad)
          ),
        });
        if (clippingPolygon) {
          clippingPolygonCollection = new ClippingPolygonCollection({
            polygons: [clippingPolygon],
            inverse: true,
            enabled: true,
          });
          tileset.clippingPolygons = clippingPolygonCollection;
        }
      }
    }
    return () => {
      if (tileset && clippingPolygonCollection) {
        //console.log(          'Removing clipping polygon collection:',          tileset.clippingPolygons        );
        //clippingPolygonCollection.removeAll();
        clippingPolygon && tileset.clippingPolygons.remove(clippingPolygon);
        tileset.clippingPolygons.removeAll();
        tileset.clippingPlanes?.removeAll && tileset.clippingPlanes.removeAll();
        //!clippingPolygonCollection.isDestroyed() && clippingPolygonCollection.destroy();
      }
    };
  }, [clip, clipRadius, position, tileset, widget]);

  useEffect(() => {
    if (debug && widget && cartesian) {
      const removeFn = addDebugPrimitives(widget, cartesian);
      return () => {
        if (widget) {
          removeFn();
        }
      };
    }
  }, [debug, cartesian, widget]);

  console.log('Render CustomCesiumWidget', position, range);

  return (
    <div
      ref={containerRef}
      style={{
        width: `${pixelSize.width}px`,
        height: `${pixelSize.height}px`,
        backgroundColor: 'transparent',
      }}
    >
      {children}
    </div>
  );
};

export default CustomCesiumWidget;
