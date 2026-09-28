import {
  useCallback,
  useEffect,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { message } from "antd";
import { legacy_createStore } from "redux";
import type maplibregl from "maplibre-gl";
import type { Geometry } from "geojson";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { FeatureInfobox } from "@carma-appframeworks/portals";
import { CarmaMap } from "@carma-mapping/core";
import { CarmaMapAPIProvider } from "@carma-mapping/carma-map-api";
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
import {
  BUILDING_MINZOOM,
  LEERSTAND_SOURCE,
  useLeerstandStyle,
} from "./hooks/useLeerstandStyle";
import { useTapMarker } from "./hooks/useTapMarker";
import {
  buildingInfoFromProperties,
  createBuildingInfoBoxControlObject,
  createFreePointInfoBoxControlObject,
  createLeerstandInfoBoxControlObject,
  parseLeerstandProperties,
  type NearestAddress,
} from "./helper/leerstandHelper";
import { lngLatToUtm, type LngLat } from "./helper/geo";
import { fetchLocationInfo } from "./helper/locationInfo";
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

/** id the ALKIS datasheet asks for with addLayerById ("Kartenebene laden") */
const BAUDENKMALE_LAYER_ID = "wuppPlanung:baudenkmale";

/** source layer of the Baudenkmäler points in their vector tiles */
const BAUDENKMALE_SOURCE_LAYER = "baudenkmale";

/** Baudenkmäler as vector layer, the style the geoportal uses for this entry */
const BAUDENKMALE_LAYER: LibreLayer = {
  type: "vector",
  name: "baudenkmale",
  style: "https://tiles.cismet.de/baudenkmale/style.json",
  carmaLayerId: BAUDENKMALE_LAYER_ID,
};

// What LibreMap hands to onSelectionChanged: the filtered click hits (top
// first) and the click position. Fires on empty ground too, with hit undefined.
// A gazetteer selection comes through the same callback; only that one carries
// the semanticIdentifier key (possibly undefined), a tap never does.
interface SelectionEvent {
  hits: maplibregl.MapGeoJSONFeature[];
  hit: maplibregl.MapGeoJSONFeature | undefined;
  latlng: maplibregl.LngLat;
  semanticIdentifier?: string;
}

/**
 * What the info box reads: the control object under properties.info and a
 * geometry for the zoom link. A map hit fits, and so does the point built
 * for a tap on open ground.
 */
interface InfoboxFeature {
  type: "Feature";
  geometry: Geometry;
  properties: Record<string, unknown>;
  text?: string;
}

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
  // position a capture would take its geometry from, drawn as the tap marker
  const [tapPoint, setTapPoint] = useState<LngLat>();
  const [showBaudenkmale, setShowBaudenkmale] = useState(false);
  // counts selections, so the address lookup of an earlier tap cannot
  // overwrite the info box of a later one
  const selectionSeq = useRef(0);

  const style = useLeerstandStyle(markerSymbolSize, featureCollection);
  useTapMarker(libreMap, tapPoint);

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
      setTapPoint(undefined);
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

  // The ALKIS buildings and the Leerstand points as one inline vector style,
  // the Baudenkmäler (optional) on top so the building fill does not hide them.
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
    if (showBaudenkmale) {
      layers.push(BAUDENKMALE_LAYER);
    }
    return layers;
  }, [jwt, style, showBaudenkmale]);

  // The ALKIS datasheet loads its layer through addLayerById and asks whether
  // it is on the map through a Redux-shaped store (state.mapping.layers).
  // This app has no Redux; the store only mirrors the Baudenkmäler flag.
  const addLayerById = useCallback(async (id: string) => {
    if (id === BAUDENKMALE_LAYER_ID) {
      setShowBaudenkmale(true);
    } else {
      console.warn("[LEERSTAND] addLayerById: layer not available here", id);
    }
    return undefined;
  }, []);
  const layerStateStore = useMemo(
    () =>
      legacy_createStore(() => ({
        mapping: {
          layers: showBaudenkmale ? [{ id: BAUDENKMALE_LAYER_ID }] : [],
        },
      })),
    [showBaudenkmale]
  );

  /** info box for a tap on open ground; the nearest address arrives later */
  const selectFreePoint = (lngLat: LngLat, currentJwt: string) => {
    const seq = selectionSeq.current;
    const utm = lngLatToUtm(lngLat);
    const show = (nearest: NearestAddress) => {
      const info = createFreePointInfoBoxControlObject(nearest, () => {
        setDialogPoint({ lngLat, utm });
      });
      setSelectedFeature({
        type: "Feature",
        geometry: { type: "Point", coordinates: lngLat },
        properties: { info },
        text: info.puretitle,
      });
    };
    show("loading");
    setTapPoint(lngLat);
    fetchLocationInfo(currentJwt, utm)
      .then((result): NearestAddress => result.address ?? "none")
      .catch((err): NearestAddress => {
        console.warn("[LEERSTAND] location info failed", err);
        return "failed";
      })
      .then((nearest) => {
        if (selectionSeq.current === seq) show(nearest);
      });
  };

  const onSelectionChanged = (e: SelectionEvent) => {
    selectionSeq.current += 1;
    // Baudenkmäler points lie above the buildings; a tap on one means the
    // building (or ground) below it
    const hit =
      e.hit?.sourceLayer === BAUDENKMALE_SOURCE_LAYER
        ? e.hits?.find((h) => h.sourceLayer !== BAUDENKMALE_SOURCE_LAYER)
        : e.hit;
    const feature = hit as
      | (maplibregl.MapGeoJSONFeature & InfoboxFeature)
      | undefined;
    const lngLat: LngLat = [e.latlng.lng, e.latlng.lat];
    // the merged style namespaces the source id as "<layer name>::<source>"
    if (feature?.source.endsWith(`::${LEERSTAND_SOURCE}`)) {
      const properties = parseLeerstandProperties(feature.properties);
      const info = createLeerstandInfoBoxControlObject(properties);
      feature.properties.info = info;
      feature.text = info.puretitle;
      setSelectedFeature(feature);
      // a stored point is looked at, nothing can be captured on it
      setTapPoint(undefined);
      return;
    }
    if (feature?.sourceLayer === "building") {
      const building = buildingInfoFromProperties(feature.properties);
      if (!building) {
        setSelectedFeature(undefined);
        setTapPoint(undefined);
        return;
      }
      const info = createBuildingInfoBoxControlObject(building, () => {
        setDialogPoint({ lngLat, utm: lngLatToUtm(lngLat), building });
      });
      feature.properties.info = info;
      feature.text = info.puretitle;
      // bounds from the tile attributes, so the zoom link fits the whole
      // building even where the tile clips its polygon
      feature.properties.sourceProps = { bounds: feature.properties.bounds };
      setSelectedFeature(feature);
      setTapPoint(lngLat);
      return;
    }
    // Open ground. Only a tap places a free point, a gazetteer hit on a street
    // or a Stadtteil does not; and only where the buildings are drawn, because
    // below that zoom "no building here" cannot be told.
    const isTap = !("semanticIdentifier" in e);
    if (jwt && isTap && libreMap && libreMap.getZoom() >= BUILDING_MINZOOM) {
      selectFreePoint(lngLat, jwt);
      return;
    }
    setSelectedFeature(undefined);
    setTapPoint(undefined);
  };

  return (
    <>
      <CarmaMapAPIProvider addLayerById={addLayerById} store={layerStateStore}>
        <SandboxedEvalProvider>
          <CarmaMap
            appKey={APP_CONFIG.appKey}
            mapEngine="maplibre"
            overrideGlyphs={GLYPHS_URL}
            libreLayers={libreLayers}
            setLibreMap={setLibreMap}
            modalMenu={
              <Menu
                showBaudenkmale={showBaudenkmale}
                onShowBaudenkmaleChange={setShowBaudenkmale}
              />
            }
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
      </CarmaMapAPIProvider>

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
            // the reload draws the red point where the tap marker was
            setTapPoint(undefined);
            message.success(`Leerstand ${id} gespeichert.`);
            reload();
          }}
        />
      )}
    </>
  );
};
