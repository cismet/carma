import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Checkbox, Radio, Select } from "antd";

import type { Degrees } from "@carma-units";
import type { LatLng, LatLngAlt, Altitude } from "@carma-geo/data-structures";
import {
  BoundingSphere,
  Cartesian3,
  ClippingPlaneCollection,
  ClippingPolygon,
  ClippingPolygonCollection,
  Color,
  DebugModelMatrixPrimitive,
  HeadingPitchRange,
  OrthographicFrustum,
  PerspectiveFrustum,
  PointPrimitiveCollection,
  Transforms,
  type Cesium3DTileset,
  type CesiumWidget,
} from "@carma-cesium";
import {
  CesiumHost,
  generateRingFromDegrees,
  useCesiumContext,
  type CesiumWidgetConstructorOptions,
} from "@carma-mapping/engines/cesium/react/runtime";

import { CESIUM_TILESET_IDS } from "../../../config/store.config";
import { FOOTPRINT_GEOJSON_SOURCES } from "../../../config/dataSources.config";

const { Option } = Select;

type Poi = {
  label: string;
  position: LatLngAlt.deg;
  range?: number;
  clipBy?: {
    radius?: number;
    polygon?: LatLng.deg[];
  };
};

const POI: Record<string, Poi> = {
  TOELLETURM: {
    label: "Toelleturm",
    position: {
      longitude: 7.201578,
      latitude: 51.256565,
      altitude: 335 + 10,
    } as LatLngAlt.deg,
    range: 30,
    clipBy: {
      radius: 15,
    },
  },
  RATHAUS: {
    label: "Rathaus",
    position: {
      longitude: 7.19993,
      latitude: 51.27225,
      altitude: 170,
    } as LatLngAlt.deg,
    range: 150,
    clipBy: {
      radius: 120,
    },
  },
  KUGELGAS: {
    label: "Kugelgasbehälter",
    position: {
      longitude: 7.08586,
      latitude: 51.24584,
      altitude: 190,
    } as LatLngAlt.deg,
    range: 60,
    clipBy: {
      radius: 30,
    },
  },
  STADION: {
    label: "Stadion am Zoo",
    position: {
      longitude: 7.1049,
      latitude: 51.23916,
      altitude: 140,
    } as LatLngAlt.deg,
    range: 185,
    clipBy: {
      radius: 140,
    },
  },
  HBF: {
    label: "Hauptbahnhof",
    position: {
      longitude: 7.1485164,
      latitude: 51.2559275,
      altitude: 150,
    } as LatLngAlt.deg,
    range: 80,
    clipBy: {
      radius: 60,
    },
  },
};

const options = Object.fromEntries(
  Object.entries(POI).map(([key, value]) => [value.label, key])
);

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

  const { primitives } = widget.scene;
  primitives.add(pointCollection);
  primitives.add(debugPrimitive);

  return () => {
    if (!primitives.isDestroyed() && primitives.contains(pointCollection)) {
      primitives.remove(pointCollection);
    }
    if (!primitives.isDestroyed() && primitives.contains(debugPrimitive)) {
      primitives.remove(debugPrimitive);
    }
  };
};

const clearTilesetClipping = (tileset: Cesium3DTileset) => {
  tileset.clippingPolygons?.removeAll();
  tileset.clippingPlanes?.removeAll();
  tileset.clippingPlanes = new ClippingPlaneCollection({
    enabled: false,
  });
  tileset.clippingPolygons = new ClippingPolygonCollection({
    enabled: false,
  });
};

const createClippingPolygon = ({
  clipPolygon,
  clipRadius,
  position,
}: {
  clipPolygon?: LatLng.deg[];
  clipRadius?: number;
  position: LatLngAlt.deg;
}) => {
  if (clipPolygon && clipPolygon.length > 2) {
    return new ClippingPolygon({
      positions: clipPolygon.map((coord) =>
        Cartesian3.fromDegrees(coord.longitude, coord.latitude)
      ),
    });
  }

  if (!clipRadius) {
    return undefined;
  }

  const ringCoords = generateRingFromDegrees(
    { longitude: position.longitude, latitude: position.latitude },
    clipRadius
  );

  return new ClippingPolygon({
    positions: ringCoords.map((coord) =>
      Cartesian3.fromRadians(coord.longitude, coord.latitude)
    ),
  });
};

const RuntimeWidgetDemo = ({
  children,
  clip = false,
  orthographic = false,
  pixelSize = { width: 1024, height: 1024 },
  range = 30,
  clipRadius,
  clipPolygon,
  position,
  debug = false,
  animate = false,
}: {
  pixelSize?: { width: number; height: number };
  position: LatLngAlt.deg;
  range?: number;
  clip?: boolean;
  clipPolygon?: LatLng.deg[];
  clipRadius?: number;
  debug?: boolean;
  orthographic?: boolean;
  animate?: boolean;
  children?: ReactNode;
}) => {
  const { isRuntimeReady, requestRender, withRuntime, withTileset } =
    useCesiumContext();

  const cartesian = useMemo(
    () =>
      Cartesian3.fromDegrees(
        position.longitude,
        position.latitude,
        position.altitude
      ),
    [position.altitude, position.latitude, position.longitude]
  );

  const constructorOptions = useMemo<CesiumWidgetConstructorOptions>(
    () => ({
      scene3DOnly: true,
      baseLayer: false,
      skyBox: false,
      skyAtmosphere: false,
      msaaSamples: 4,
      useBrowserRecommendedResolution: true,
      contextOptions: {
        webgl: {
          alpha: true,
          antialias: true,
        },
      },
    }),
    []
  );

  useEffect(() => {
    if (!isRuntimeReady) {
      return;
    }

    withRuntime((widget) => {
      const { scene, camera } = widget;
      scene.backgroundColor = Color.TRANSPARENT;
      if (scene.globe) {
        scene.globe.show = false;
      }

      scene.screenSpaceCameraController.inertiaZoom = 0;
      scene.screenSpaceCameraController.maximumZoomDistance = range * 5;
      scene.screenSpaceCameraController.minimumZoomDistance = range / 2;

      camera.viewBoundingSphere(new BoundingSphere(cartesian, range));

      if (orthographic) {
        if (camera.frustum instanceof PerspectiveFrustum) {
          camera.switchToOrthographicFrustum();
        }
        scene.screenSpaceCameraController.enableZoom = false;
      } else {
        if (camera.frustum instanceof OrthographicFrustum) {
          camera.switchToPerspectiveFrustum();
        }
        scene.screenSpaceCameraController.enableZoom = true;
      }

      scene.requestRender();
    });
  }, [cartesian, isRuntimeReady, orthographic, range, withRuntime]);

  useEffect(() => {
    if (!isRuntimeReady || !animate) {
      return;
    }

    let animationFrameId: number | null = null;
    let lastTime = Date.now();
    const boundingSphere = new BoundingSphere(cartesian, range);

    withRuntime((widget) => {
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
        widget.scene.requestRender();
        lastTime = now;
        animationFrameId = requestAnimationFrame(updateHeading);
      };

      updateHeading();
    });

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [animate, cartesian, isRuntimeReady, range, withRuntime]);

  useEffect(() => {
    if (!isRuntimeReady) {
      return;
    }

    let cancelled = false;
    let cleanup = () => {};

    const applyClipping = () => {
      if (cancelled) {
        return;
      }

      const applied = withTileset(CESIUM_TILESET_IDS.PRIMARY, (tileset) => {
        cleanup();

        if (!clip) {
          clearTilesetClipping(tileset);
          requestRender();
          cleanup = () => {};
          return true;
        }

        const clippingPolygon = createClippingPolygon({
          clipPolygon,
          clipRadius,
          position,
        });

        if (!clippingPolygon) {
          clearTilesetClipping(tileset);
          requestRender();
          cleanup = () => {};
          return true;
        }

        const clippingPolygonCollection = new ClippingPolygonCollection({
          polygons: [clippingPolygon],
          inverse: true,
          enabled: true,
        });
        tileset.clippingPolygons = clippingPolygonCollection;
        requestRender();

        cleanup = () => {
          if (!tileset.isDestroyed()) {
            clippingPolygonCollection.removeAll();
            clearTilesetClipping(tileset);
            requestRender();
          }
        };
        return true;
      });

      if (!applied) {
        requestAnimationFrame(applyClipping);
      }
    };

    applyClipping();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [
    clip,
    clipPolygon,
    clipRadius,
    isRuntimeReady,
    position,
    requestRender,
    withTileset,
  ]);

  useEffect(() => {
    if (!isRuntimeReady || !debug) {
      return;
    }

    let cleanup = () => {};
    withRuntime((widget) => {
      cleanup = addDebugPrimitives(widget, cartesian);
      widget.scene.requestRender();
    });

    return () => {
      cleanup();
      requestRender();
    };
  }, [cartesian, debug, isRuntimeReady, requestRender, withRuntime]);

  return (
    <div
      style={{
        position: "relative",
        width: `${pixelSize.width}px`,
        height: `${pixelSize.height}px`,
        backgroundColor: "transparent",
      }}
    >
      <CesiumHost
        constructorOptions={constructorOptions}
        style={{ position: "absolute", inset: 0 }}
      />
      <div
        style={{
          position: "absolute",
          left: 8,
          bottom: 8,
          color: "white",
          textShadow: "0 1px 2px black",
          pointerEvents: "none",
        }}
      >
        {children}
      </div>
    </div>
  );
};

function View() {
  const [poiKey, setPoiKey] = useState<string>("TOELLETURM");
  const [orthographic, setOrthographic] = useState<boolean>(true);

  const [poi, setPoi] = useState<Poi | null>(POI[poiKey]);
  const [debug, setDebug] = useState<boolean>(false);
  const [animate, setAnimate] = useState<boolean>(false);
  const [clip, setClip] = useState<boolean>(false);

  console.log("RENDER Widget Test View", { poi, debug });

  const ViewToggle = () => (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Radio.Group
        value={orthographic ? "orthographic" : "perspective"}
        onChange={(e) => setOrthographic(e.target.value === "orthographic")}
      >
        <Radio.Button value="perspective">Perspektivisch</Radio.Button>
        <Radio.Button value="orthographic">Orthografisch</Radio.Button>
      </Radio.Group>
      <hr />
      <Checkbox
        checked={animate}
        onChange={(e) => setAnimate(e.target.checked)}
        style={{ marginLeft: "20px" }}
      >
        Animation
      </Checkbox>
      <Checkbox
        checked={clip}
        onChange={(e) => setClip(e.target.checked)}
        style={{ marginLeft: "20px" }}
      >
        Clipping
      </Checkbox>
    </div>
  );

  const LocationToggle = () => (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Radio.Group
        value={poiKey}
        onChange={(e) => {
          const nextPoiKey = e.target.value;
          setPoiKey(nextPoiKey);
          setPoi(POI[nextPoiKey]);
        }}
      >
        {Object.entries(options).map(([key, value]) => (
          <Radio.Button key={value} value={value}>
            {key}
          </Radio.Button>
        ))}
      </Radio.Group>
    </div>
  );

  const GeoJSONDropdown = () => {
    const [features, setFeatures] = useState<
      GeoJSON.Feature<GeoJSON.MultiPolygon>[]
    >([]);
    const key = FOOTPRINT_GEOJSON_SOURCES.VORONOI.idProperty;
    const labelProperty = "GEB_NAME";

    useEffect(() => {
      fetch(FOOTPRINT_GEOJSON_SOURCES.VORONOI.url)
        .then((response) => response.json())
        .then((data) => {
          const namedFeatures = data.features.filter((feature) => {
            const test = feature.properties[labelProperty] !== null;
            return test;
          });
          const sortedFeatures = namedFeatures.sort((a, b) =>
            a.properties[labelProperty].localeCompare(
              b.properties[labelProperty]
            )
          );
          setFeatures(sortedFeatures);
        });
    }, []);

    console.log("RENDER GeoJSONDropdown", features);

    return (
      <Select
        style={{ width: 400 }}
        onSelect={(value) => {
          const feature = features.find(
            (candidate) => candidate.properties?.[key] === value
          );
          if (feature && feature.geometry.type === "MultiPolygon") {
            const ring = Object.freeze(feature.geometry.coordinates[0][0]);
            const [longitude, latitude, height] = ring[0] ?? [];

            const latitudeSort = ring
              .map(([, lat]) => lat)
              .sort((a, b) => a - b);
            const longitudeSort = ring
              .map(([lng]) => lng)
              .sort((a, b) => a - b);

            const latMin = latitudeSort[0];
            const lngMin = longitudeSort[0];
            const latMax = latitudeSort[latitudeSort.length - 1];
            const lngMax = longitudeSort[longitudeSort.length - 1];

            const latCenter = (latMin + latMax) / 2;
            const lngCenter = (lngMin + lngMax) / 2;

            const position = {
              longitude: (lngCenter ?? longitude) as Degrees,
              latitude: (latCenter ?? latitude) as Degrees,
              altitude: (height ?? 170) as Altitude.EllipsoidalWGS84Meters,
            };

            setPoi({
              label: String(feature.properties?.[labelProperty]),
              position,
              range: 50,
              clipBy: {
                polygon: ring.map(([longitude, latitude]) => ({
                  longitude: longitude as Degrees,
                  latitude: latitude as Degrees,
                })),
              },
            });
          }
        }}
      >
        {features.map((feature) => (
          <Option
            key={String(feature.properties?.[key])}
            value={feature.properties?.[key]}
          >
            {`${feature.properties?.[labelProperty]} - ${feature.properties?.["STRNAME"]} ${feature.properties?.["HAUSNR"]}`}
          </Option>
        ))}
      </Select>
    );
  };

  return (
    poi && (
      <div
        style={{
          paddingTop: "100px",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          flexDirection: "column",
          alignItems: "center",
          gap: "50px",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "100%",
            flexDirection: "row",
            justifyContent: "center",
            gap: "20px",
            marginBottom: "10px",
          }}
        >
          <RuntimeWidgetDemo
            position={poi.position}
            range={poi.range}
            clip={clip}
            clipRadius={poi.clipBy?.radius}
            clipPolygon={poi.clipBy?.polygon}
            orthographic={orthographic}
            pixelSize={{ width: 512, height: 512 }}
            debug={debug}
            animate={animate}
          >
            {poi.label} {orthographic ? "orthografisch" : "perspektive"}
          </RuntimeWidgetDemo>
        </div>
        <ViewToggle />
        <LocationToggle />
        Benannte Gebäude aus Sample-GeoJson mit gebufferten Umrissen:
        <GeoJSONDropdown />
        <div
          style={{
            display: "flex",
            width: "100%",
            justifyContent: "center",
            justifyItems: "flex-start",
            flexGrow: 1,
            marginBottom: "10px",
          }}
        ></div>
      </div>
    )
  );
}

export default View;
