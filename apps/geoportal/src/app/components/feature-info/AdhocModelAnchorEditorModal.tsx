import { useCallback, useEffect, useMemo, useState } from "react";

import type { AdhocFeature } from "@carma-appframeworks/portals";
import { useAdhocFeatureDisplay } from "@carma-appframeworks/portals";
import type {
  CarmaMapLibreStyleData,
  CarmaMapLibreFeatureProperties,
} from "@carma/types";
import type { Feature, FeatureCollection } from "geojson";
import type { GeoJSONSourceSpecification } from "maplibre-gl";

type Props = {
  isOpen: boolean;
  target?: {
    id: string;
    collectionId: string;
    layerId: string;
  } | null;
};

const isGeoJsonSource = (
  source: unknown
): source is GeoJSONSourceSpecification =>
  typeof source === "object" &&
  source !== null &&
  (source as { type?: unknown }).type === "geojson";

const parseFiniteNumber = (value: string): number | null => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const updateGeoJsonFeatureModelPosition = (
  feature: Feature,
  lon: number,
  lat: number,
  height: number,
  heading: number
): Feature => {
  const rawProps =
    (feature.properties as CarmaMapLibreFeatureProperties | undefined) ?? {};
  const carmaConf3D = rawProps.carmaConf3D ?? {};
  const model = carmaConf3D.model;

  if (!model) {
    return feature;
  }

  return {
    ...feature,
    properties: {
      ...rawProps,
      carmaConf3D: {
        ...carmaConf3D,
        model: {
          ...model,
          position: {
            lon,
            lat,
            height,
          },
          heading,
        },
      },
    },
  };
};

const updateMapLibreStyleFeatureModelPosition = (
  feature: AdhocFeature,
  lon: number,
  lat: number,
  height: number,
  heading: number
): AdhocFeature => {
  if (feature.kind !== "maplibre-style") {
    return feature;
  }

  const baseProperties =
    (feature.properties as CarmaMapLibreFeatureProperties | undefined) ?? {};
  const topLevelCarmaConf3D = baseProperties.carmaConf3D;
  const topLevelModel = topLevelCarmaConf3D?.model;

  const nextProperties = topLevelModel
    ? {
        ...baseProperties,
        carmaConf3D: {
          ...topLevelCarmaConf3D,
          model: {
            ...topLevelModel,
            position: {
              lon,
              lat,
              height,
            },
            heading,
          },
        },
      }
    : baseProperties;

  const styleData = feature.data as CarmaMapLibreStyleData;
  const nextSources = Object.fromEntries(
    Object.entries(styleData.sources ?? {}).map(([sourceKey, sourceValue]) => {
      if (!isGeoJsonSource(sourceValue) || !sourceValue.data) {
        return [sourceKey, sourceValue];
      }

      const geojson = sourceValue.data as Feature | FeatureCollection;
      if (geojson.type === "FeatureCollection") {
        const nextFeatures = geojson.features.map((geojsonFeature, idx) =>
          idx === 0
            ? updateGeoJsonFeatureModelPosition(
                geojsonFeature,
                lon,
                lat,
                height,
                heading
              )
            : geojsonFeature
        );
        return [
          sourceKey,
          {
            ...sourceValue,
            data: {
              ...geojson,
              features: nextFeatures,
            },
          },
        ];
      }

      return [
        sourceKey,
        {
          ...sourceValue,
          data: updateGeoJsonFeatureModelPosition(
            geojson,
            lon,
            lat,
            height,
            heading
          ),
        },
      ];
    })
  );

  return {
    ...feature,
    properties: nextProperties as AdhocFeature["properties"],
    data: {
      ...styleData,
      sources: nextSources,
    },
  };
};

const resolveSelectedAdhocFeature = (
  featureCollections: ReturnType<
    typeof useAdhocFeatureDisplay
  >["featureCollections"],
  selected:
    | ReturnType<typeof useAdhocFeatureDisplay>["selectedFeature"]
    | {
        id: string;
        collectionId: string;
        layerId: string;
      }
    | null
): AdhocFeature | null => {
  if (!selected) {
    return null;
  }
  const collection = featureCollections.find(
    (candidate) => candidate.id === selected.collectionId
  );
  if (!collection) {
    return null;
  }
  return (
    collection.features.find(
      (feature) =>
        feature.id === selected.id &&
        (feature.layerId ?? "adhoc") === selected.layerId
    ) ?? null
  );
};

export const AdhocModelAnchorEditorModal = ({
  isOpen,
  target = null,
}: Props) => {
  const { featureCollections, selectedFeature, addFeature } =
    useAdhocFeatureDisplay();
  const effectiveTarget = target ?? selectedFeature;

  const adhocFeature = useMemo(
    () => resolveSelectedAdhocFeature(featureCollections, effectiveTarget),
    [effectiveTarget, featureCollections]
  );

  const modelPosition = useMemo(() => {
    if (!adhocFeature) return null;

    const properties = adhocFeature.properties as
      | CarmaMapLibreFeatureProperties
      | undefined;
    const topLevelPosition = properties?.carmaConf3D?.model?.position;
    const topLevelHeading = properties?.carmaConf3D?.model?.heading;
    if (topLevelPosition) {
      return {
        lon: topLevelPosition.lon,
        lat: topLevelPosition.lat,
        height: topLevelPosition.height ?? 0,
        heading: topLevelHeading ?? 0,
      };
    }

    if (adhocFeature.kind !== "maplibre-style") {
      return null;
    }

    const geojsonSourceCandidate = Object.values(
      adhocFeature.data.sources ?? {}
    ).find((source) => isGeoJsonSource(source) && !!source.data);
    if (!geojsonSourceCandidate) {
      return null;
    }
    const geojsonSource = geojsonSourceCandidate as GeoJSONSourceSpecification;

    const geojson = geojsonSource.data as Feature | FeatureCollection;
    const firstFeature =
      geojson.type === "FeatureCollection" ? geojson.features[0] : geojson;
    const geojsonProps = firstFeature?.properties as
      | CarmaMapLibreFeatureProperties
      | undefined;
    const position = geojsonProps?.carmaConf3D?.model?.position;
    const heading = geojsonProps?.carmaConf3D?.model?.heading;
    if (!position) {
      return null;
    }

    return {
      lon: position.lon,
      lat: position.lat,
      height: position.height ?? 0,
      heading: heading ?? 0,
    };
  }, [adhocFeature]);

  const [lonInput, setLonInput] = useState("");
  const [latInput, setLatInput] = useState("");
  const [heightInput, setHeightInput] = useState("");
  const [headingInput, setHeadingInput] = useState("");
  const [activeField, setActiveField] = useState<
    "lon" | "lat" | "height" | "heading" | null
  >(null);

  useEffect(() => {
    if (!modelPosition) {
      if (activeField === null) {
        setLonInput("");
        setLatInput("");
        setHeightInput("");
        setHeadingInput("");
      }
      return;
    }

    // Keep field focus/caret stable while typing. We only sync from model state
    // when no input is currently active.
    if (activeField === null) {
      setLonInput(modelPosition.lon.toString());
      setLatInput(modelPosition.lat.toString());
      setHeightInput(modelPosition.height.toString());
      setHeadingInput(modelPosition.heading.toFixed(2));
    }
  }, [activeField, modelPosition]);

  const applyLiveUpdate = useCallback(
    (
      nextLon: string,
      nextLat: string,
      nextHeight: string,
      nextHeading: string
    ) => {
      if (!adhocFeature || !effectiveTarget) {
        return;
      }

      const lon = parseFiniteNumber(nextLon);
      const lat = parseFiniteNumber(nextLat);
      const height = parseFiniteNumber(nextHeight);
      const heading = parseFiniteNumber(nextHeading);
      if (lon === null || lat === null || height === null || heading === null) {
        return;
      }

      const updatedFeature = updateMapLibreStyleFeatureModelPosition(
        adhocFeature,
        lon,
        lat,
        height,
        heading
      );
      addFeature(updatedFeature, {
        collectionId: effectiveTarget.collectionId,
        layerId: effectiveTarget.layerId,
      });
    },
    [addFeature, adhocFeature, effectiveTarget]
  );

  if (!isOpen || !modelPosition || !adhocFeature || !effectiveTarget) {
    return null;
  }

  const handleLonChange = (value: string) => {
    setLonInput(value);
    applyLiveUpdate(value, latInput, heightInput, headingInput);
  };

  const handleLatChange = (value: string) => {
    setLatInput(value);
    applyLiveUpdate(lonInput, value, heightInput, headingInput);
  };

  const handleHeightChange = (value: string) => {
    setHeightInput(value);
    applyLiveUpdate(lonInput, latInput, value, headingInput);
  };

  const handleHeadingChange = (value: string) => {
    setHeadingInput(value);
    applyLiveUpdate(lonInput, latInput, heightInput, value);
  };

  const handleHeadingBlur = () => {
    setActiveField(null);
    const heading = parseFiniteNumber(headingInput);
    if (heading === null) return;
    setHeadingInput(heading.toFixed(2));
  };

  const copySnippetToClipboard = async () => {
    const lon = parseFiniteNumber(lonInput);
    const lat = parseFiniteNumber(latInput);
    const height = parseFiniteNumber(heightInput);
    const heading = parseFiniteNumber(headingInput);
    if (lon === null || lat === null || height === null || heading === null) {
      return;
    }
    const snippet = `  "position": {\n                      "lon": ${lon},\n                      "lat": ${lat},\n                      "height": ${height}\n                    },\n                    "heading": ${heading},`;
    await navigator.clipboard.writeText(snippet);
  };

  return (
    <div
      data-anchor-editor-modal="true"
      onMouseDown={(event) => event.stopPropagation()}
      role="dialog"
      aria-label="Model anchor editor"
      style={{
        position: "fixed",
        right: 24,
        top: 88,
        zIndex: 1500,
        width: 280,
        background: "rgba(255,255,255,0.97)",
        border: "1px solid #c8d0d8",
        borderRadius: 8,
        padding: "10px 12px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Model Anchor</div>
      <div style={{ marginBottom: 6 }}>
        <label htmlFor="model-anchor-lon">Lon</label>
        <input
          id="model-anchor-lon"
          type="number"
          step="0.000001"
          value={lonInput}
          onFocus={() => setActiveField("lon")}
          onBlur={() => setActiveField(null)}
          onChange={(event) => handleLonChange(event.target.value)}
          style={{ width: "100%" }}
        />
      </div>
      <div style={{ marginBottom: 6 }}>
        <label htmlFor="model-anchor-lat">Lat</label>
        <input
          id="model-anchor-lat"
          type="number"
          step="0.000001"
          value={latInput}
          onFocus={() => setActiveField("lat")}
          onBlur={() => setActiveField(null)}
          onChange={(event) => handleLatChange(event.target.value)}
          style={{ width: "100%" }}
        />
      </div>
      <div>
        <label htmlFor="model-anchor-height">Elevation (m)</label>
        <input
          id="model-anchor-height"
          type="number"
          step="0.1"
          value={heightInput}
          onFocus={() => setActiveField("height")}
          onBlur={() => setActiveField(null)}
          onChange={(event) => handleHeightChange(event.target.value)}
          style={{ width: "100%" }}
        />
      </div>
      <div style={{ marginTop: 6 }}>
        <label htmlFor="model-anchor-heading">Rotation (heading)</label>
        <input
          id="model-anchor-heading"
          type="number"
          min={0}
          max={360}
          step={0.01}
          value={headingInput}
          onFocus={() => setActiveField("heading")}
          onBlur={handleHeadingBlur}
          onChange={(event) => handleHeadingChange(event.target.value)}
          style={{ width: "100%" }}
        />
      </div>
      <button
        type="button"
        onClick={() => {
          void copySnippetToClipboard();
        }}
        style={{ marginTop: 8, width: "100%" }}
      >
        Copy JSON Snippet
      </button>
    </div>
  );
};

export default AdhocModelAnchorEditorModal;
