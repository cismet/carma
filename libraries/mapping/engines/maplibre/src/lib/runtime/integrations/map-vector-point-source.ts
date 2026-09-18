import type {
  CircleLayerSpecification,
  FilterSpecification,
  LayerSpecification,
  Map as MapLibreMap,
  SourceSpecification,
  StyleSpecification,
} from "maplibre-gl";

export type MapVectorPoint = {
  id: string;
  lngLat: [number, number];
  properties: Record<string, unknown>;
};

export type MapVectorPointSourceOptions = {
  idPrefix: string;
  center: [number, number];
  radiusMeters: number;
  limit: number;
  onPoints: (points: MapVectorPoint[]) => void;
  onError: (error: unknown) => void;
};

type VectorLayerReference = {
  sourceId: string;
  sourceLayer?: string;
  filter?: FilterSpecification;
};

type OwnedSource = { id: string; sourceLayers: Array<string | undefined> };

const EARTH_RADIUS_METERS = 6_371_008.8;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const asStyle = (value: unknown): StyleSpecification => {
  if (
    !isRecord(value) ||
    !isRecord(value.sources) ||
    !Array.isArray(value.layers)
  ) {
    throw new Error("MapLibre style does not contain sources and layers");
  }
  return value as unknown as StyleSpecification;
};

const resolveSource = (
  source: SourceSpecification,
  styleUrl: string
): SourceSpecification => {
  const resolve = (value: string) =>
    new URL(value, styleUrl)
      .toString()
      .replace(/%7B/gi, "{")
      .replace(/%7D/gi, "}");
  if (source.type !== "vector") return source;
  if (source.url) return { ...source, url: resolve(source.url) };
  if (source.tiles) return { ...source, tiles: source.tiles.map(resolve) };
  return source;
};

const pointFromGeometry = (geometry: unknown): Array<[number, number]> => {
  if (!isRecord(geometry)) return [];
  if (geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
    const [lng, lat] = geometry.coordinates;
    return typeof lng === "number" && typeof lat === "number"
      ? [[lng, lat]]
      : [];
  }
  if (geometry.type === "MultiPoint" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.flatMap((coordinate) => {
      if (!Array.isArray(coordinate)) return [];
      const [lng, lat] = coordinate;
      return typeof lng === "number" && typeof lat === "number"
        ? [[lng, lat]]
        : [];
    });
  }
  return [];
};

const haversineMeters = (
  [lngA, latA]: [number, number],
  [lngB, latB]: [number, number]
) => {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(latB - latA);
  const dLng = toRadians(lngB - lngA);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(latA)) *
      Math.cos(toRadians(latB)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, a)));
};

const featureId = (
  feature: unknown,
  sourceLayer: string | undefined,
  coordinate: [number, number]
) => {
  const candidate = isRecord(feature) ? feature.id : undefined;
  const stable =
    typeof candidate === "string" || typeof candidate === "number"
      ? String(candidate)
      : `coord:${coordinate[0]},${coordinate[1]}`;
  return `${sourceLayer ?? "source"}:${stable}:${coordinate[0]},${
    coordinate[1]
  }`;
};

const stableValue = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableValue(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};

/**
 * Loads public MapLibre vector sources referenced by point layers and observes
 * their loaded point features. The returned disposer owns only its prefixed
 * sources/layers and ignores all late asynchronous work.
 */
export function observeMapVectorPoints(
  map: MapLibreMap,
  styleUrl: string,
  options: MapVectorPointSourceOptions
): () => void {
  const controller = new AbortController();
  const ownedSources: OwnedSource[] = [];
  const ownedLayers: string[] = [];
  const retainedPoints = new Map<string, MapVectorPoint>();
  let lastSignature: string | null = null;
  let disposed = false;
  let sequence = 0;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    controller.abort();
    try {
      map.off("sourcedata", handleSourceData);
    } catch {
      /* map may already be removed */
    }
    let hasStyle = true;
    try {
      if (typeof map.getStyle === "function")
        hasStyle = Boolean(map.getStyle());
    } catch {
      hasStyle = false;
    }
    if (!hasStyle) return;
    for (const layerId of ownedLayers) {
      try {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      } catch {
        /* map teardown */
      }
    }
    for (const source of ownedSources) {
      try {
        if (map.getSource(source.id)) map.removeSource(source.id);
      } catch {
        /* map teardown */
      }
    }
  };

  const emitPoints = () => {
    if (disposed) return;
    const seen = new Set<string>();
    const center = options.center;
    for (const source of ownedSources)
      for (const sourceLayer of source.sourceLayers) {
        let features: readonly unknown[];
        try {
          features = map.querySourceFeatures(
            source.id,
            sourceLayer ? { sourceLayer } : undefined
          );
        } catch {
          continue;
        }
        features.forEach((feature) => {
          const record = isRecord(feature) ? feature : {};
          const geometry = record.geometry;
          for (const coordinate of pointFromGeometry(geometry)) {
            if (
              !Number.isFinite(coordinate[0]) ||
              !Number.isFinite(coordinate[1]) ||
              coordinate[0] < -180 ||
              coordinate[0] > 180 ||
              coordinate[1] < -90 ||
              coordinate[1] > 90 ||
              haversineMeters(center, coordinate) > options.radiusMeters
            )
              continue;
            const id = featureId(feature, sourceLayer, coordinate);
            if (seen.has(id)) continue;
            seen.add(id);
            retainedPoints.set(id, {
              id,
              lngLat: coordinate,
              properties: isRecord(record.properties) ? record.properties : {},
            });
          }
        });
      }
    const points = [...retainedPoints.values()];
    points.sort((a, b) => {
      const distance =
        haversineMeters(center, a.lngLat) - haversineMeters(center, b.lngLat);
      return distance || a.id.localeCompare(b.id);
    });
    const retainedLimit = Math.max(256, options.limit);
    if (points.length > retainedLimit) {
      for (const point of points.slice(retainedLimit))
        retainedPoints.delete(point.id);
    }
    const visiblePoints = points.slice(0, Math.max(0, options.limit));
    const signature = visiblePoints
      .map(
        (point) =>
          `${point.id}|${point.lngLat.join(",")}|${stableValue(
            point.properties
          )}`
      )
      .join("\u0001");
    if (signature !== lastSignature) {
      lastSignature = signature;
      options.onPoints(visiblePoints);
    }
  };

  function handleSourceData(event: {
    sourceId?: string;
    isSourceLoaded?: boolean;
  }) {
    if (
      !disposed &&
      event.isSourceLoaded &&
      ownedSources.some((source) => source.id === event.sourceId)
    ) {
      emitPoints();
    }
  }

  map.on("sourcedata", handleSourceData);

  void fetch(styleUrl, { signal: controller.signal })
    .then((response) => {
      if (!response.ok)
        throw new Error(`Failed to load MapLibre style (${response.status})`);
      return response.json();
    })
    .then((rawStyle) => {
      if (disposed) return;
      const style = asStyle(rawStyle);
      const sources = style.sources as Record<string, SourceSpecification>;
      const references = new Map<string, VectorLayerReference[]>();
      for (const layer of style.layers as LayerSpecification[]) {
        if (
          (layer.type !== "circle" && layer.type !== "symbol") ||
          !layer.source
        )
          continue;
        const source = sources[layer.source];
        if (!source || source.type !== "vector") continue;
        const sourceLayer =
          "source-layer" in layer ? layer["source-layer"] : undefined;
        const key = `${layer.source}\u0000${sourceLayer ?? ""}`;
        const list = references.get(key) ?? [];
        list.push({
          sourceId: layer.source,
          sourceLayer,
          filter: layer.filter,
        });
        references.set(key, list);
      }
      const sourceReferences = new Map<string, VectorLayerReference[]>();
      for (const list of references.values()) {
        const first = list[0];
        const sourceList = sourceReferences.get(first.sourceId) ?? [];
        sourceList.push(first);
        sourceReferences.set(first.sourceId, sourceList);
      }
      for (const [sourceReferenceId, sourceList] of sourceReferences) {
        if (disposed) return;
        const id = `${options.idPrefix}-source-${sequence++}`;
        map.addSource(id, resolveSource(sources[sourceReferenceId], styleUrl));
        const sourceLayers = sourceList.map(
          (reference) => reference.sourceLayer
        );
        ownedSources.push({ id, sourceLayers });
        const sourceLayerIds: string[] = [];
        for (const reference of sourceList) {
          const layerId = `${options.idPrefix}-layer-${sequence++}`;
          const layer: CircleLayerSpecification = {
            id: layerId,
            type: "circle",
            source: id,
            ...(reference.sourceLayer
              ? { "source-layer": reference.sourceLayer }
              : {}),
            ...(reference.filter ? { filter: reference.filter } : {}),
            paint: { "circle-opacity": 0, "circle-radius": 1 },
          };
          try {
            map.addLayer(layer);
            ownedLayers.push(layerId);
            sourceLayerIds.push(layerId);
          } catch (error) {
            for (const sourceLayerId of sourceLayerIds) {
              try {
                map.removeLayer(sourceLayerId);
              } catch {
                /* partial setup */
              }
              const index = ownedLayers.indexOf(sourceLayerId);
              if (index >= 0) ownedLayers.splice(index, 1);
            }
            try {
              map.removeSource(id);
            } catch {
              /* partial setup */
            }
            const sourceIndex = ownedSources.findIndex(
              (source) => source.id === id
            );
            if (sourceIndex >= 0) ownedSources.splice(sourceIndex, 1);
            throw error;
          }
        }
      }
      emitPoints();
    })
    .catch((error: unknown) => {
      if (
        !disposed &&
        !(error instanceof DOMException && error.name === "AbortError")
      )
        options.onError(error);
    });

  return dispose;
}
