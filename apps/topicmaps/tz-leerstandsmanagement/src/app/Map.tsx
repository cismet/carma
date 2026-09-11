import { useCallback, useContext, useEffect, useState } from "react";
import { message } from "antd";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import CismapLayer from "react-cismap/CismapLayer";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import {
  FeatureInfobox,
  TopicMapSelectionContent,
  useSelectionTopicMap,
} from "@carma-appframeworks/portals";
import {
  defaultTypeInference,
  EmptySearchComponent,
  LibFuzzySearch,
} from "@carma-mapping/fuzzy-search";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import {
  FullscreenControl,
  RoutedMapLocateControl,
  ZoomControl,
} from "@carma-mapping/components";
import { TAILWIND_CLASSNAMES_FULLSCREEN_FIXED } from "@carma-commons/utils";
import { SandboxedEvalProvider } from "@carma-commons/sandbox-eval";
import { additionalInfoFactory } from "@carma-collab/wuppertal/geoportal";
import versionData from "../version.json";
import { Menu } from "./Menu";
import SecondaryInfoModal from "./Modal";
import { LeerstandForm, type PlacedPoint } from "./LeerstandForm";
import { useDisplayOptions } from "./DisplayOptionsContext";
import {
  ALKIS_SOURCE,
  LEERSTAND_SOURCE,
  useLeerstandStyle,
} from "./hooks/useLeerstandStyle";
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
 * Leerstand datasheet for a stored point. react-cismap writes the source
 * layer of a hit into properties.carmaInfo.
 */
const InfoModal = (props: any) => {
  const sourceLayer = props.feature?.properties?.carmaInfo?.sourceLayer;
  if (sourceLayer === "building" && AlkisModal) {
    return <AlkisModal {...props} />;
  }
  return <SecondaryInfoModal {...props} />;
};

/** house numbers of the Stadtgrundkarte, the layer react-cismap calls "nrs" */
const HAUSNUMMERN_WMS = {
  url: "https://wunda-geoportal-cache.cismet.de/geoportal",
  layers: "R102%3Astadtgrundkarte_hausnr",
};

// Shape of what react-cismap hands to onSelectionChanged: a MapLibre feature
// plus the click position.
interface SelectionEvent {
  hit?: {
    id?: number | string;
    source?: string;
    properties: Record<string, unknown>;
    geometry?: unknown;
    text?: string;
  };
  latlng: { lat: number; lng: number };
}

export const Map = ({ jwt, user, onAuthError, onConnectionError }: MapProps) => {
  const { markerSymbolSize } = useContext(TopicMapStylingContext) as {
    markerSymbolSize: number;
  };
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  ) as { responsiveState: string; gap: number; windowSize: { width: number } };
  useSelectionTopicMap();
  const { showHausnummern } = useDisplayOptions();

  const [lookups, setLookups] = useState<Lookups>();
  const [featureCollection, setFeatureCollection] =
    useState<LeerstandFeatureCollection>();
  const [selectedFeature, setSelectedFeature] = useState<unknown>();
  const [maplibreMap, setMaplibreMap] = useState<any>(null);
  const [dialogPoint, setDialogPoint] = useState<PlacedPoint>();

  const style = useLeerstandStyle(markerSymbolSize);

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

  // Push the feature collection into the MapLibre source, as tzb does for its
  // trees: CismapLayer does not react to data changes by itself.
  useEffect(() => {
    if (!maplibreMap || !featureCollection || !maplibreMap.style) return;
    const source = maplibreMap.getSource(LEERSTAND_SOURCE);
    if (source) source.setData(featureCollection);
  }, [maplibreMap, featureCollection]);

  const onSelectionChanged = (e: SelectionEvent) => {
    const feature = e.hit;
    if (!feature) {
      setSelectedFeature(undefined);
      return;
    }
    if (feature.source === LEERSTAND_SOURCE) {
      const properties = parseLeerstandProperties(feature.properties);
      const info = createLeerstandInfoBoxControlObject(properties);
      feature.properties.info = info;
      feature.text = info.puretitle;
      setSelectedFeature(feature);
      return;
    }
    if (feature.source === ALKIS_SOURCE) {
      const building = buildingInfoFromProperties(feature.properties);
      if (!building) {
        setSelectedFeature(undefined);
        return;
      }
      const lngLat: LngLat = [e.latlng.lng, e.latlng.lat];
      // Only the state setter may be used here: react-cismap registers the
      // click handler once, so this closure never sees later renders.
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
    <div className={TAILWIND_CLASSNAMES_FULLSCREEN_FIXED}>
      <SandboxedEvalProvider>
        <ControlLayout ifStorybook={false}>
          <Control position="topleft" order={10}>
            <ZoomControl />
          </Control>
          <Control position="topleft" order={50}>
            <FullscreenControl />
          </Control>
          <Control position="topleft" order={60} title="Mein Standort">
            <RoutedMapLocateControl
              tourRefLabels={null}
              disabled={false}
              nativeTooltip={true}
            />
          </Control>
          <Control position="bottomleft" order={10}>
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
          </Control>
          <TopicMapComponent
            modalMenu={<Menu />}
            gazetteerSearchControl={true}
            gazetteerSearchComponent={EmptySearchComponent}
            applicationMenuTooltipString="Einstellungen"
            locatorControl={false}
            fullScreenControl={false}
            zoomControls={false}
            infoBox={
              <FeatureInfobox
                collapsible={responsiveState !== "small"}
                selectedFeature={selectedFeature}
                versionData={versionData}
                bigMobileIconsInsteadOfCollapsing={true}
                Modal={InfoModal}
              />
            }
            contactButtonEnabled={false}
          >
            <TopicMapSelectionContent />
            {showHausnummern && (
              <CismapLayer
                key="hausnummern"
                type="wms"
                url={HAUSNUMMERN_WMS.url}
                layers={HAUSNUMMERN_WMS.layers}
                transparent="true"
                format="image/png"
                pane="oneAboveBackgroundLayers"
                opacity={1}
              />
            )}
            {jwt && (
              <CismapLayer
                key={`leerstand-layer-${markerSymbolSize}`}
                pane="additionalLayers0"
                selectionEnabled={true}
                manualSelectionManagement={false}
                logMapLibreErrors={true}
                onSelectionChanged={onSelectionChanged}
                style={style}
                type="vector"
                onMapLibreCoreMapReady={(map: unknown) => {
                  setMaplibreMap(map);
                }}
              />
            )}
          </TopicMapComponent>
        </ControlLayout>
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
    </div>
  );
};
