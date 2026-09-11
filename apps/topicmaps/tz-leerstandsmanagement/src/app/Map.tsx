import { useCallback, useEffect, useContext, useMemo, useState } from "react";
import { message } from "antd";
import type maplibregl from "maplibre-gl";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { FeatureInfobox } from "@carma-appframeworks/portals";
import { CarmaMap } from "@carma-mapping/core";
import type { LibreLayer } from "@carma-mapping/engines/maplibre";
import {
  defaultTypeInference,
  LibFuzzySearch,
} from "@carma-mapping/fuzzy-search";
import { SandboxedEvalProvider } from "@carma-commons/sandbox-eval";
import { additionalInfoFactory } from "@carma-collab/wuppertal/geoportal";
import versionData from "../version.json";
import { APP_CONFIG } from "../config/appConfig";
import { Menu } from "./Menu";
import SecondaryInfoModal from "./Modal";
import { LeerstandForm, type PlacedPoint } from "./LeerstandForm";
import { LEERSTAND_SOURCE, useLeerstandStyle } from "./hooks/useLeerstandStyle";
import {
  buildingInfoFromProperties,
  createBuildingInfoBoxControlObject,
  createLeerstandInfoBoxControlObject,
  parseLeerstandProperties,
} from "./helper/leerstandHelper";
import { lngLatToUtm, type LngLat } from "./helper/geo";
import { GraphQLRequestError } from "./helper/graphql";
import { loadLookups, type Lookups } from "./helper/lookups";
import {
  loadLeerstaende,
  type LeerstandFeatureCollection,
} from "./helper/leerstandApi";

interface MapProps {
  jwt?: string;
  user?: string | null;
  onAuthError: () => void;
  onConnectionError: (hasError: boolean) => void;
}

/** ALKIS datasheet of the geoportal (collab AlkisSIM) */
const AlkisModal = additionalInfoFactory("alkisSIM");

/**
 * Datasheet by what was tapped: the ALKIS datasheet for a building, the
 * Leerstand datasheet for a stored point. LibreMap stamps the source layer
 * of a hit into properties.carmaInfo.
 */
const InfoModal = (props: any) => {
  const sourceLayer = props.feature?.properties?.carmaInfo?.sourceLayer;
  if (sourceLayer === "building" && AlkisModal) {
    return <AlkisModal {...props} />;
  }
  return <SecondaryInfoModal {...props} />;
};

/** name of the vector layer; the merged style prefixes source and layer ids with it */
const LEERSTAND_LAYER_NAME = "leerstand";

const GLYPHS_URL = "https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf";

// What LibreMap hands to onSelectionChanged: the filtered click hits (top
// first) and the click position. Fires on empty ground too, with hit undefined.
interface SelectionEvent {
  hits: maplibregl.MapGeoJSONFeature[];
  hit: maplibregl.MapGeoJSONFeature | undefined;
  latlng: maplibregl.LngLat;
}

/** the hit as the info box wants it: control object under properties.info */
type InfoboxFeature = maplibregl.MapGeoJSONFeature & { text?: string };

export const Map = ({ jwt, user, onAuthError, onConnectionError }: MapProps) => {
  const { markerSymbolSize } = useContext(TopicMapStylingContext) as {
    markerSymbolSize: number;
  };
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  ) as { responsiveState: string; gap: number; windowSize: { width: number } };

  const [lookups, setLookups] = useState<Lookups>();
  const [featureCollection, setFeatureCollection] =
    useState<LeerstandFeatureCollection>();
  const [selectedFeature, setSelectedFeature] = useState<InfoboxFeature>();
  const [libreMap, setLibreMap] = useState<maplibregl.Map | null>(null);
  const [dialogPoint, setDialogPoint] = useState<PlacedPoint>();

  const style = useLeerstandStyle(markerSymbolSize, featureCollection);

  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof GraphQLRequestError && e.status === 401) {
        onAuthError();
        return;
      }
      console.error("[LEERSTAND]", e);
      onConnectionError(true);
    },
    [onAuthError, onConnectionError]
  );

  const reload = useCallback(async () => {
    if (!jwt) return;
    try {
      setFeatureCollection(await loadLeerstaende(jwt));
      onConnectionError(false);
    } catch (e) {
      handleError(e);
    }
  }, [jwt, handleError, onConnectionError]);

  useEffect(() => {
    if (!jwt) {
      setLookups(undefined);
      setFeatureCollection(undefined);
      setSelectedFeature(undefined);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [loadedLookups, loadedFeatures] = await Promise.all([
          loadLookups(jwt),
          loadLeerstaende(jwt),
        ]);
        if (cancelled) return;
        setLookups(loadedLookups);
        setFeatureCollection(loadedFeatures);
        onConnectionError(false);
        console.log(
          `[LEERSTAND] ${loadedFeatures.features.length} Leerstände geladen`
        );
      } catch (e) {
        if (!cancelled) handleError(e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jwt]);

  // The ALKIS buildings and the Leerstand points as one inline vector style.
  const libreLayers = useMemo<LibreLayer[]>(() => {
    const layers: LibreLayer[] = [];
    if (jwt) {
      layers.push({
        type: "vector",
        name: LEERSTAND_LAYER_NAME,
        style,
        carmaLayerId: LEERSTAND_LAYER_NAME,
      });
    }
    return layers;
  }, [jwt, style]);

  const onSelectionChanged = (e: SelectionEvent) => {
    const feature = e.hit as InfoboxFeature | undefined;
    if (!feature) {
      setSelectedFeature(undefined);
      return;
    }
    // the merged style namespaces the source id as "<layer name>::<source>"
    if (feature.source.endsWith(`::${LEERSTAND_SOURCE}`)) {
      const properties = parseLeerstandProperties(feature.properties);
      const info = createLeerstandInfoBoxControlObject(properties);
      feature.properties.info = info;
      feature.text = info.puretitle;
      setSelectedFeature(feature);
      return;
    }
    if (feature.sourceLayer === "building") {
      const building = buildingInfoFromProperties(feature.properties);
      if (!building) {
        setSelectedFeature(undefined);
        return;
      }
      const lngLat: LngLat = [e.latlng.lng, e.latlng.lat];
      const info = createBuildingInfoBoxControlObject(building, () => {
        setDialogPoint({ lngLat, utm: lngLatToUtm(lngLat), building });
      });
      feature.properties.info = info;
      feature.text = info.puretitle;
      // bounds from the tile attributes, so the zoom link fits the whole
      // building even where the tile clips its polygon
      feature.properties.sourceProps = { bounds: feature.properties.bounds };
      setSelectedFeature(feature);
      return;
    }
    setSelectedFeature(undefined);
  };

  return (
    <>
      <SandboxedEvalProvider>
        <CarmaMap
          appKey={APP_CONFIG.appKey}
          mapEngine="maplibre"
          overrideGlyphs={GLYPHS_URL}
          libreLayers={libreLayers}
          setLibreMap={setLibreMap}
          modalMenu={<Menu />}
          applicationMenuTooltipString="Einstellungen"
          gazetteerSearchComponent={
            <div style={{ marginTop: "4px" }}>
              <LibFuzzySearch
                pixelwidth={
                  responsiveState === "normal" ? "300px" : windowSize.width - gap
                }
                placeholder="Adresse | Stadtteil | POI"
                priorityTypes={["adressen", "streets", "pois", "bezirke", "quartiere"]}
                typeInference={defaultTypeInference}
              />
            </div>
          }
          terrainControl={false}
          contactButtonEnabled={false}
          selectionEnabled={true}
          disableInternalSelection={true}
          gazetteerInfoOnClick={false}
          onSelectionChanged={onSelectionChanged}
          extraControls={
            <FeatureInfobox
              collapsible={responsiveState !== "small"}
              selectedFeature={selectedFeature}
              versionData={versionData}
              bigMobileIconsInsteadOfCollapsing={true}
              Modal={InfoModal}
              libreMap={libreMap ?? undefined}
            />
          }
        />
      </SandboxedEvalProvider>

      {jwt && user && dialogPoint && lookups && (
        <LeerstandForm
          jwt={jwt}
          user={user}
          point={dialogPoint}
          lookups={lookups}
          onCancel={() => setDialogPoint(undefined)}
          onSaved={(id) => {
            setDialogPoint(undefined);
            setSelectedFeature(undefined);
            message.success(`Leerstand ${id} gespeichert.`);
            reload();
          }}
        />
      )}
    </>
  );
};
