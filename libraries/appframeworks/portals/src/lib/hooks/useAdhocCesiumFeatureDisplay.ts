import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  BoundingSphere,
  Cartesian3,
  Cartographic,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  PerInstanceColorAppearance,
  Primitive,
  PrimitiveCollection,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  WallGeometry,
  flyToBoundingSphereExtent,
  type CesiumTerrainProvider,
  type Scene,
} from "@carma/cesium";
import type { Feature, FeatureCollection, Geometry } from "geojson";

import type { ModelConfig } from "@carma-commons/resources";
import type { FeatureInfo } from "@carma/types";
import { getElevationAsync } from "@carma-mapping/engines/cesium";

import {
  useAdhocFeatureDisplay,
  type AdhocFeature,
  type AdhocGeoJsonPayload,
  type AdhocModelPayload,
} from "../components/AdhocFeatureDisplayProvider";
import { useCesiumModels } from "./useCesiumModels";

const ADHOC_WALL_DEFAULT_HEIGHT = 15;

const isAdhocModelFeature = (
  feature: AdhocFeature
): feature is AdhocFeature & { payload: AdhocModelPayload } =>
  feature.payload.kind === "model";

const isAdhocGeoJsonFeature = (
  feature: AdhocFeature
): feature is AdhocFeature & { payload: AdhocGeoJsonPayload } =>
  feature.payload.kind === "geojson";

const getAdhocWallColor = (
  feature: { metadata?: Record<string, unknown> },
  isSelected: boolean
) => {
  const accent = feature.metadata?.accentColor;
  if (typeof accent === "string") {
    const color = Color.fromCssColorString(accent);
    return color.withAlpha(isSelected ? 0.95 : 0.7);
  }
  return Color.fromCssColorString("#3A7CEB").withAlpha(
    isSelected ? 0.95 : 0.7
  );
};

const getAdhocWallHeight = (
  feature: { metadata?: Record<string, unknown> },
  segmentIndex: number
) => {
  const heights = feature.metadata?.wallHeights;
  if (Array.isArray(heights) && typeof heights[segmentIndex] === "number") {
    return heights[segmentIndex];
  }
  const height = feature.metadata?.wallHeightMeters;
  if (typeof height === "number") {
    return height;
  }
  return ADHOC_WALL_DEFAULT_HEIGHT;
};

const getBoundingSphereFromCoordinates = (
  coordinates: number[][]
): BoundingSphere => {
  const points = coordinates.map((coord) =>
    Cartesian3.fromDegrees(coord[0], coord[1], coord[2] ?? 0)
  );
  return BoundingSphere.fromPoints(points);
};

const createWallPrimitivesFromPolygon = (
  ring: number[][],
  heights: number[],
  feature: AdhocFeature,
  isSelected: boolean
): PrimitiveCollection => {
  const primitives = new PrimitiveCollection();
  const wallColor = getAdhocWallColor(feature, isSelected);
  const appearance = new PerInstanceColorAppearance({
    translucent: true,
    closed: true,
  });

  for (let i = 0; i < ring.length - 1; i++) {
    const start = ring[i];
    const end = ring[i + 1];
    if (!start || !end) continue;

    const startHeight = heights[i] ?? 0;
    const endHeight = heights[i + 1] ?? 0;
    const wallHeight = getAdhocWallHeight(feature, i);

    const geometry = new WallGeometry({
      positions: Cartesian3.fromDegreesArrayHeights([
        start[0],
        start[1],
        startHeight,
        end[0],
        end[1],
        endHeight,
      ]),
      maximumHeights: [startHeight + wallHeight, endHeight + wallHeight],
      minimumHeights: [startHeight, endHeight],
    });

    const instance = new GeometryInstance({
      geometry,
      attributes: {
        color: ColorGeometryInstanceAttribute.fromColor(wallColor),
      },
      id: {
        adhocFeatureId: feature.id,
      },
    });

    primitives.add(
      new Primitive({
        geometryInstances: instance,
        appearance,
        releaseGeometryInstances: false,
      })
    );
  }

  return primitives;
};

const getPolygonFromGeoJson = (
  geojson: Feature | FeatureCollection
): number[][][] | null => {
  const feature =
    geojson.type === "FeatureCollection" ? geojson.features[0] : geojson;
  const geometry = feature?.geometry as Geometry | null | undefined;
  if (!geometry) return null;

  if (geometry.type === "Polygon") {
    return geometry.coordinates as number[][][];
  }

  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates as number[][][][])[0] ?? null;
  }

  return null;
};

const pickNonEmptyString = (...values: Array<unknown>) => {
  return values.find(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0
  );
};

export type UseAdhocCesiumFeatureDisplayOptions = {
  isCesiumEnabled: boolean;
  getIsCesium: () => boolean;
  getScene: () => Scene | null | undefined;
  getTerrainProvider: () => CesiumTerrainProvider | null | undefined;
  getSurfaceProvider: () => CesiumTerrainProvider | null | undefined;
  baseModels?: ModelConfig[];
  onFeatureInfoChange?: (feature: FeatureInfo | null) => void;
};

export type UseAdhocCesiumFeatureDisplayResult = {
  getAdhocBoundingSphere: (feature: FeatureInfo) => BoundingSphere | null;
};

export const useAdhocCesiumFeatureDisplay = (
  options: UseAdhocCesiumFeatureDisplayOptions
): UseAdhocCesiumFeatureDisplayResult => {
  const {
    baseModels = [],
    getIsCesium,
    getScene,
    getSurfaceProvider,
    getTerrainProvider,
    isCesiumEnabled,
    onFeatureInfoChange,
  } = options;

  const {
    features: adhocFeatures,
    selectedFeature: adhocSelectedFeature,
    selectedFeatureId,
    setSelectedFeatureId,
  } = useAdhocFeatureDisplay();

  const adhocWallPrimitivesRef = useRef<Map<string, PrimitiveCollection>>(
    new Map()
  );
  const adhocFeatureCoordinatesRef = useRef<Map<string, number[][]>>(
    new Map()
  );

  const adhocInfoFeature = useMemo<FeatureInfo | null>(() => {
    if (!adhocSelectedFeature) return null;

    if (adhocSelectedFeature.payload.kind === "geojson") {
      const geojson = adhocSelectedFeature.payload.data;
      const feature =
        geojson.type === "FeatureCollection" ? geojson.features[0] : geojson;

      const metadataTitle =
        typeof adhocSelectedFeature.metadata?.title === "string"
          ? adhocSelectedFeature.metadata?.title
          : undefined;
      const fallbackTitle = metadataTitle ?? adhocSelectedFeature.id;

      const properties =
        adhocSelectedFeature.properties ??
        (feature?.properties as FeatureInfo["properties"] | undefined) ?? {
          title: fallbackTitle,
        };
      const info =
        typeof (properties as { info?: unknown }).info === "object" &&
        (properties as { info?: unknown }).info
          ? (properties as {
              info?: {
                title?: unknown;
                subtitle?: unknown;
                additionalInfo?: unknown;
              };
            }).info
          : undefined;
      const infoTitle = pickNonEmptyString(info?.title);
      const infoSubtitle = pickNonEmptyString(info?.subtitle);
      const infoAdditionalInfo = pickNonEmptyString(info?.additionalInfo);
      const title = pickNonEmptyString(
        metadataTitle,
        properties.title,
        infoTitle,
        fallbackTitle
      );
      const subtitle = pickNonEmptyString(
        properties.subtitle,
        infoSubtitle
      );
      const additionalInfo = pickNonEmptyString(
        properties.additionalInfo,
        infoAdditionalInfo
      );

      return {
        id: adhocSelectedFeature.id,
        properties: {
          ...properties,
          title: title ?? fallbackTitle,
          ...(subtitle ? { subtitle } : {}),
          ...(additionalInfo ? { additionalInfo } : {}),
          adhocFeatureId: adhocSelectedFeature.id,
        },
        geometry: feature?.geometry,
      };
    }

    if (adhocSelectedFeature.payload.kind === "model") {
      const metadataTitle =
        typeof adhocSelectedFeature.metadata?.title === "string"
          ? adhocSelectedFeature.metadata?.title
          : undefined;
      const fallbackTitle = metadataTitle ?? adhocSelectedFeature.id;
      return {
        id: adhocSelectedFeature.id,
        properties: {
          ...(adhocSelectedFeature.properties ?? { title: fallbackTitle }),
          title:
            metadataTitle ??
            adhocSelectedFeature.properties?.title ??
            fallbackTitle,
          adhocFeatureId: adhocSelectedFeature.id,
        },
      };
    }

    return null;
  }, [adhocSelectedFeature]);

  const adhocModelConfigs = useMemo(() => {
    return adhocFeatures.filter(isAdhocModelFeature).map((feature) => {
      const { data } = feature.payload;
      const metadataTitle = feature.metadata?.title;
      const fallbackTitle =
        typeof metadataTitle === "string" ? metadataTitle : feature.id;

      const baseProperties = feature.properties ?? { title: fallbackTitle };

      const modelConfig: ModelConfig = {
        position: {
          longitude: data.position.lon,
          latitude: data.position.lat,
          altitude: data.position.height ?? 0,
        },
        orientation: {
          heading: data.heading,
          pitch: data.pitch,
          roll: data.roll,
        },
        model: {
          uri: data.url,
          ...(data.scale !== undefined ? { scale: data.scale } : {}),
        },
        properties: {
          ...baseProperties,
          adhocFeatureId: feature.id,
        },
        name: typeof metadataTitle === "string" ? metadataTitle : undefined,
      };

      return modelConfig;
    });
  }, [adhocFeatures]);

  const cesiumModelConfigs = useMemo(
    () => [...baseModels, ...adhocModelConfigs],
    [adhocModelConfigs, baseModels]
  );

  const hasCesiumModels = cesiumModelConfigs.length > 0;

  const useCesiumModelOptions = useMemo(() => {
    return {
      models: cesiumModelConfigs,
      enabled: isCesiumEnabled && hasCesiumModels,
      selection: {
        enabled: isCesiumEnabled && hasCesiumModels,
        deselectOnEmptyClick: false,
        onSelect: (feature: FeatureInfo | null) => {
          onFeatureInfoChange?.(feature);
          const adhocFeatureId = feature?.properties?.adhocFeatureId;
          if (typeof adhocFeatureId === "string") {
            setSelectedFeatureId(adhocFeatureId);
          }
        },
      },
    };
  }, [
    cesiumModelConfigs,
    hasCesiumModels,
    isCesiumEnabled,
    onFeatureInfoChange,
    setSelectedFeatureId,
  ]);

  useCesiumModels(useCesiumModelOptions);

  useEffect(() => {
    if (!getIsCesium()) return;
    onFeatureInfoChange?.(adhocInfoFeature ?? null);
  }, [adhocInfoFeature, getIsCesium, onFeatureInfoChange]);

  useEffect(() => {
    if (!getIsCesium()) return;

    const scene = getScene();
    if (!scene || scene.isDestroyed()) return;

    const primitivesByFeature = adhocWallPrimitivesRef.current;
    primitivesByFeature.forEach((collection) => {
      scene.primitives.remove(collection);
    });
    primitivesByFeature.clear();
    adhocFeatureCoordinatesRef.current.clear();

    const geojsonFeatures = adhocFeatures.filter(isAdhocGeoJsonFeature);
    if (geojsonFeatures.length === 0) {
      scene.requestRender();
      return;
    }

    let cancelled = false;

    const addWallsForFeature = async (feature: AdhocFeature) => {
      const polygon = getPolygonFromGeoJson(feature.payload.data);
      if (!polygon) return;

      const ring = polygon[0];
      if (!ring || ring.length < 2) return;

      const terrainProvider = getTerrainProvider();
      const surfaceProvider = getSurfaceProvider();
      if (!terrainProvider || !surfaceProvider) return;

      const positions = ring.map((coord) =>
        Cartographic.fromDegrees(coord[0], coord[1], 0)
      );
      const elevations = await getElevationAsync(
        terrainProvider,
        surfaceProvider,
        positions
      );
      if (cancelled || elevations.length !== positions.length) return;

      const sampledHeights = elevations.map(
        (result) => result.surface?.height ?? result.terrain.height
      );
      const heights = ring.map((coord, index) => {
        const coordHeight = coord[2];
        if (typeof coordHeight === "number") return coordHeight;
        return sampledHeights[index] ?? 0;
      });
      const coordinatesWithHeight = ring.map((coord, index) => [
        coord[0],
        coord[1],
        heights[index] ?? 0,
      ]);

      const primitives = createWallPrimitivesFromPolygon(
        ring,
        heights,
        feature,
        selectedFeatureId === feature.id
      );

      scene.primitives.add(primitives);
      primitivesByFeature.set(feature.id, primitives);
      adhocFeatureCoordinatesRef.current.set(feature.id, coordinatesWithHeight);

      if (feature.id === selectedFeatureId) {
        const sphere = getBoundingSphereFromCoordinates(coordinatesWithHeight);
        flyToBoundingSphereExtent(scene.camera, sphere, {
          minRange: 50,
          paddingFactor: 1.1,
        });
      }
    };

    void Promise.all(geojsonFeatures.map(addWallsForFeature)).then(() => {
      if (!cancelled) {
        scene.requestRender();
      }
    });

    return () => {
      cancelled = true;
      primitivesByFeature.forEach((collection) => {
        scene.primitives.remove(collection);
      });
      primitivesByFeature.clear();
      scene.requestRender();
    };
  }, [
    adhocFeatures,
    getIsCesium,
    getScene,
    getSurfaceProvider,
    getTerrainProvider,
    selectedFeatureId,
  ]);

  useEffect(() => {
    if (!getIsCesium()) return;

    const scene = getScene();
    if (!scene || scene.isDestroyed()) return;

    const handler = new ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction(
      (event: { position: { x: number; y: number } }) => {
        const picked = scene.pick(event.position);
        const pickedId = picked?.id as
          | { adhocFeatureId?: unknown }
          | undefined;

        if (pickedId && typeof pickedId === "object") {
          const adhocFeatureId = pickedId.adhocFeatureId;
          if (typeof adhocFeatureId === "string") {
            setSelectedFeatureId(adhocFeatureId);
            return;
          }
        }

        const isModelPick =
          typeof (picked as { id?: { model?: unknown } } | undefined)?.id
            ?.model !== "undefined";
        if (!isModelPick) {
          setSelectedFeatureId(null);
          onFeatureInfoChange?.(null);
        }
      },
      ScreenSpaceEventType.LEFT_CLICK
    );

    return () => {
      handler.destroy();
    };
  }, [getIsCesium, getScene, onFeatureInfoChange, setSelectedFeatureId]);

  const getAdhocBoundingSphere = useCallback(
    (feature: FeatureInfo) => {
      const adhocFeatureId = feature.properties?.adhocFeatureId;
      if (typeof adhocFeatureId !== "string") return null;
      const storedCoordinates =
        adhocFeatureCoordinatesRef.current.get(adhocFeatureId);
      if (!storedCoordinates) return null;
      return getBoundingSphereFromCoordinates(storedCoordinates);
    },
    []
  );

  return { getAdhocBoundingSphere };
};
