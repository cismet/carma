import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { CarmaMap, DatasheetLayout } from "@carma-mapping/core";
import { useDispatch, useSelector, useStore } from "react-redux";
import {
  setSelectedFeature,
  setFeatureLoading,
  getSelectedFeature as getReduxSelectedFeature,
  getFeatureDataVersion,
} from "../../store/slices/featureCollection";
import {
  getActiveBackgroundLayer,
  getBackgroundLayerOpacities,
  getActiveAdditionalLayers,
  getAdditionalLayerOpacities,
  isInPaleMode,
  getEnabledLeitungstypen,
} from "../../store/slices/mapSettings";
import { getKeyTablesData } from "../../store/slices/keyTables";
import {
  backgroundLayerConfigs,
  additionalLayerConfigs,
  leuchtenDataLayer,
  brandNewDataLayer,
  BELIS_STYLE_URL,
  BELIS_BRAND_NEW_STYLE_URL,
  BELIS_BRAND_NEW_FC_URL,
  BELIS_ORIGINAL_SOURCE,
  BELIS_SOURCE_LAYERS,
  AA_LAYER_STYLES,
} from "../../config/mapLayerConfigs";
import type { LibreLayer } from "@carma-mapping/engines/maplibre";
import { AppDispatch, type RootState } from "../../store";
import { useMapPage } from "../../contexts/MapPageContext";
import BelisSidebar from "../ui/BelisSidebar";
import ArbeitsauftraegeSidebar from "../ui/ArbeitsauftraegeSidebar";
import {
  AA_SORT_BY_NUMMER_ASC,
  AA_SORT_BY_PROTOKOLLE_DESC,
} from "../../helper/aaSortHelpers";
import {
  useVisibleMapFeatures,
  functionToInfo,
  objectToInfo,
} from "@carma-mapping/utils";
import { extractCarmaConfig } from "@carma-commons/utils";
import {
  useMapSelection,
  useLibreContext,
  LibreContextProvider,
  useDatasheet,
  useDatasheetMiniMap,
  useMapHighlighting,
  useMapHighlight,
  useSelectionNeighborhood,
  useLassoHighlight,
  slugifyUrl,
  buildFeatureStateTarget,
} from "@carma-mapping/engines/maplibre";
import type maplibregl from "maplibre-gl";
import BelisDatasheetView from "../ui/BelisDatasheetView";
import ArbeitsauftraegeFormsWrapper from "../ui/featuresForm/ArbeitsauftraegeFormsWrapper";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMap, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import {
  FeatureType,
  fetchFeatureById,
  fetchArbeitsauftragById,
  fetchArbeitsauftraegeByTeam,
  fetchArbeitsauftraegeByIds,
} from "../../helper/apiMethods";
import { getJWT } from "../../store/slices/auth";
import { flattenGqlRecord } from "../../helper/flattenGqlRecord";
import {
  setFeatures as setAAFeatures,
  setSelectedAAId,
  setSelectedAAData,
  setLoading as setAALoading,
  setError as setAAError,
  setGraphqlLoading,
  setGraphqlError,
  getSelectedAAId,
  getSelectedAAData,
  getActiveAATab,
  getSelectedAPId,
  getSelectedTeamId,
  getAAFeatures,
  setSelectedAPId,
  setApOpenedFrom,
  setActiveAATab,
  getApOpenedFrom,
  clearSelection,
  getAALoading,
  getDraftMode,
  getGraphqlLoading,
  getSearchResultsVersion,
} from "../../store/slices/arbeitsauftraege";
import {
  buildApGeoJson,
  extractGeometry,
  getHeaderColorFromStatus,
} from "../../helper/buildApGeoJson";
import {
  debugLayers,
  apInfoboxMapping,
  aaInfoboxMapping,
} from "../../config/debugLayers";
import { protocolsLayers as protocolsLayersNew } from "../../config/protocolsLayers";
import {
  MINI_MAP_TARGET_ZOOM,
  MINI_MAP_TRANSITION_MS,
} from "../../constants/belis";

// Toggle between the preliminary debug layer styles and the new protocols styles.
const USE_DEBUG_LAYERS_FOR_PROTOCOLS_LAYERS = false;
const protocolsLayers = !USE_DEBUG_LAYERS_FOR_PROTOCOLS_LAYERS
  ? protocolsLayersNew
  : debugLayers;
import type { Feature } from "geojson";
import type { ArbeitsauftragTileFeature } from "../../store/slices/arbeitsauftraege";
import { transformGqlToTileFeatures } from "../../helper/transformArbeitsauftraege";
import { fitAABounds } from "../../helper/fitAABounds";

const LIST_WIDTH = 300;

/** Debug flag: translucent main map + red mini-map border, mini-map always visible */
const MINI_MAP_DEBUGGING = false;

// Trash icon for the measurement InfoBox's genericLinks. Created at module
// scope so React.createElement runs with ReactCurrentOwner === null, leaving
// `_owner` null on the element — JSON.stringify(genericLink) in
// @carma-appframeworks/portals helper.tsx then serializes cleanly. Creating
// the element inside a render would attach the rendering fiber as `_owner`,
// whose stateNode → DOM → fiber chain is circular and crashes JSON.stringify.
// Visual size match for the FA4 glyph-rendered loupe icon (rendered via
// react-fa as `<i class="fa fa-search fa-2x">`). The FA5+ SVG `faTrashCan`
// fills its em-box more tightly than the FA4 search glyph does, so a ra
// 2em comes out visibly bigger — 1.5em lines up flush with the loupe.
const MEASUREMENT_DELETE_ICON = (
  <FontAwesomeIcon
    icon={faTrashCan}
    style={{
      color: "grey",
      fontSize: "21px",
      marginLeft: "2px",
      width: "18px",
      textAlign: "center",
    }}
  />
);

import type { SidebarFeature } from "../ui/BelisSidebar";

import {
  getAllDraftFeatures,
  getAllDrafts,
  getDraftFeaturesCount,
  getDraftFetchedData,
  getEffectiveHiddenOriginalIds,
  getGlobalEditMode,
  isCreationDraftKey,
  requestDraftTabFocus,
} from "../../store/slices/featuresForms";
import type { HiddenOriginalIds } from "../../store/slices/featuresForms";
import {
  getAllAADrafts,
  getAllAPDrafts,
  getAPDeletions,
} from "../../store/slices/arbeitsauftraegeDrafts";
import { prepareDraftFeatures } from "../../helper/prepareDraftFeatures";
import {
  buildLeuchteDraftStandortFeature,
  expandDraftSidebarFeatures,
} from "../../helper/expandDraftSidebarFeatures";
import {
  buildSyntheticFeature,
  featureTypeToSourceLayer,
} from "../../helper/buildSyntheticFeature";
// import { useAaLassoSelection } from "../../hooks/useAaLassoSelection";
import { useBrandnewFcSync } from "../../hooks/useBrandnewFcSync";
import {
  DrawModeControls,
  MeasurementHost,
  type DrawMode,
  type MeasurementHostHandle,
} from "@carma-mapping/measurements";
import {
  getMeasurements,
  replaceMeasurements,
  selectMeasurement,
  MEASUREMENT_FEATUREKIND,
} from "../../store/slices/measurements";
import {
  featureLengthMeters,
  formatMeters,
} from "../../utils/measurementGeometry";

function buildAAFeatureCollection(
  features: ArbeitsauftragTileFeature[]
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: features
      .filter((f) => f.geometry != null)
      .map((f) => ({
        type: "Feature" as const,
        id: f.id,
        properties: {
          id: f.id,
          nummer: f.nummer,
          team: f.team,
          angelegt_am: f.angelegt_am,
          angelegt_von: f.angelegt_von,
          total_protokolle: f.total_protokolle,
          pct_offen: f.pct_offen,
          pct_in_bearbeitung: f.pct_in_bearbeitung,
          pct_erledigt: f.pct_erledigt,
          pct_fehlmeldung: f.pct_fehlmeldung,
        },
        geometry: f.geometry!,
      })),
  };
}

type SidebarMode = "fachobjekte" | "highlights" | "drafts";

// Creation-draft keys are strings (`create:...`), but MapLibre geojson
// sources can only attach `feature-state` to integer feature ids. This
// stable djb2 hash maps a draft key to a non-negative 32-bit integer so
// drafts pushed into the brandnew source can carry selection state.
// Hashes land in the billions and never collide with the small integer
// DB ids of real (server) brandnew features.
const draftFeatureStateId = (key: string): number => {
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  }
  return h >>> 0;
};

interface BelisMapLibWrapperProps {
  mapSizes: { width: number; height: number };
  activeSourceLayers: Set<string>;
  highlightResults: SidebarFeature[] | null;
  lassoActive: boolean;
  onLassoDeactivate?: () => void;
  sidebarVariant: "fachobjekte" | "arbeitsauftraege";
  onHighlightsChange?: (highlights: SidebarFeature[] | null) => void;
  /** Local-dev toggle: include the styleY-based Fachobjekte layer (default true). */
  regularLayerEnabled?: boolean;
  /** Local-dev toggle: include the brand.new.features GeoJSON-backed layer (default true). */
  brandnewLayerEnabled?: boolean;
  /** Notified with the live brandnew feature count whenever the FC reloads
   * (incl. transitions to 0 when the source file disappears). */
  onBrandnewCountChange?: (count: number) => void;
}

const BelisMapLibWrapper = ({
  mapSizes,
  activeSourceLayers,
  highlightResults,
  lassoActive,
  onLassoDeactivate,
  sidebarVariant,
  onHighlightsChange,
  regularLayerEnabled = true,
  brandnewLayerEnabled = true,
  onBrandnewCountChange,
}: BelisMapLibWrapperProps) => {
  const dispatch: AppDispatch = useDispatch();
  const store = useStore<RootState>();
  const { setOnSelectNextDraft, setOnOpenCreationDraft } = useMapPage();
  const jwt = useSelector(getJWT);
  const featureDataVersion = useSelector(getFeatureDataVersion);
  const enabledLeitungstypen = useSelector(getEnabledLeitungstypen);
  const keyTablesData = useSelector(getKeyTablesData);
  const reduxSelectedFeature = useSelector(getReduxSelectedFeature);
  const measurements = useSelector(getMeasurements);
  // One-shot snapshot of the redux-persist–rehydrated measurements, with the
  // `measurement.` id prefix stripped back to the raw terra-draw UUID. Passed
  // to MeasurementHost so terra-draw re-renders persisted features after a
  // page refresh (without this, sidebar shows them but the map is blank —
  // terra-draw owns its own internal store). Lazy-initialised so subsequent
  // measurement edits don't churn the prop reference; MeasurementHost only
  // reads this on its first attach anyway.
  const [initialMeasurementFeatures] = useState<Feature[]>(() =>
    measurements.map((f) => ({
      ...f,
      id: typeof f.id === "string" ? f.id.replace(/^measurement\./, "") : f.id,
    }))
  );
  // Drafts keyed by feature-id. Used by the measurement InfoBox to expose
  // an "Entwurf öffnen" action when a draft references the selected
  // measurement as its geometry source (geometryKey === "measurement.<id>").
  const allDraftsForMeasurementLink = useSelector(getAllDrafts);
  const selectedMeasurementId =
    reduxSelectedFeature?.featurekind === MEASUREMENT_FEATUREKIND
      ? String(reduxSelectedFeature.id)
      : null;
  // Imperative handle into MeasurementHost so the InfoBox trash button can
  // ask terra-draw to remove a measurement.
  const measurementHostRef = useRef<MeasurementHostHandle | null>(null);
  // Ref to handleOpenCreationDraft so the measurement InfoBox's
  // "Entwurf öffnen" genericLink can invoke it. The callback is defined
  // later in the file; the ref breaks the temporal-dead-zone problem.
  const handleOpenCreationDraftRef = useRef<
    ((featureType: string, draftKey: string) => void) | null
  >(null);
  // Ref for geometry fallback in override effect — avoids adding
  // reduxSelectedFeature to deps (which would cause spurious re-fires).
  const reduxGeometryRef = useRef<any>(null);
  reduxGeometryRef.current = reduxSelectedFeature?.geometry ?? null;
  const { map } = useLibreContext();

  // Track whether the map style has finished loading so effects that call
  // addSource / addLayer don't fire too early ("Style is not done loading").
  const [mapReady, setMapReady] = useState(false);
  const [drawMode, setDrawMode] = useState<DrawMode>("none");
  const [snappingEnabled, setSnappingEnabled] = useState<boolean>(false);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setDrawMode((prev) => (prev === "none" ? prev : "none"));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  useEffect(() => {
    if (!map) {
      setMapReady(false);
      return;
    }
    if (map.isStyleLoaded()) {
      setMapReady(true);
      return;
    }
    const onLoad = () => setMapReady(true);
    map.once("load", onLoad);
    return () => {
      map.off("load", onLoad);
    };
  }, [map]);

  const {
    selectedFeature,
    rawFeature,
    selectedFeatureId,
    selectFeature,
    clearSelection: clearMapSelection,
  } = useMapSelection();
  const { closeDatasheet, openDatasheet } = useDatasheet();
  const [fetchedFeatureData, setFetchedFeatureData] = useState<any>(null);
  // Preserve last valid featureType to prevent unmount when selectedFeature briefly becomes undefined
  const [lastFeatureType, setLastFeatureType] = useState<string | undefined>(
    undefined
  );

  // --- Per-route selection persistence ---
  // Save fachobjekte selection when leaving, restore when returning.
  const savedFachobjekteRef = useRef<{
    identifier: { source: string; sourceLayer?: string; id?: string | number };
    rawFeature: any;
  } | null>(null);
  const prevVariantRef = useRef(sidebarVariant);

  // Extract the infoboxMapping code from the style (browser-cached, no extra network cost)
  const [infoboxMappingCode, setInfoboxMappingCode] = useState<string | null>(
    null
  );
  useEffect(() => {
    fetch(BELIS_STYLE_URL)
      .then((r) => r.json())
      .then((styleJson) => {
        const keywords = styleJson.metadata?.carmaConf?.layerInfo?.keywords;
        if (keywords && Array.isArray(keywords)) {
          const config = extractCarmaConfig(keywords);
          if (config?.infoboxMapping && Array.isArray(config.infoboxMapping)) {
            // Join mapping lines; for function-style, there's typically one entry
            const code = config.infoboxMapping.join("\n");
            setInfoboxMappingCode(code);
          }
        }
      })
      .catch((err) =>
        console.warn("[INFOBOX] Failed to extract mapping from style:", err)
      );
  }, []);
  const activeBackgroundLayer = useSelector(getActiveBackgroundLayer);
  const backgroundLayerOpacities = useSelector(getBackgroundLayerOpacities);
  const activeAdditionalLayers = useSelector(getActiveAdditionalLayers);
  const additionalLayerOpacities = useSelector(getAdditionalLayerOpacities);
  const inPaleMode = useSelector(isInPaleMode);

  // Highlighting: compute namespaced source + call useMapHighlighting
  const namespacedSource = `${slugifyUrl(
    BELIS_STYLE_URL
  )}::${BELIS_ORIGINAL_SOURCE}`;
  // Brandnew geojson source uses the same inner source id ("belis-source")
  // but is namespaced by its own style URL.
  const brandnewSource = `${slugifyUrl(
    BELIS_BRAND_NEW_STYLE_URL
  )}::${BELIS_ORIGINAL_SOURCE}`;

  const selectedAAId = useSelector(getSelectedAAId);
  const selectedAAData = useSelector(getSelectedAAData);
  const activeAATab = useSelector(getActiveAATab);
  const selectedAPId = useSelector(getSelectedAPId);
  const apOpenedFrom = useSelector(getApOpenedFrom);
  const aaLoading = useSelector(getAALoading);
  const aaGraphqlLoading = useSelector(getGraphqlLoading);
  const globalEditMode = useSelector(getGlobalEditMode);

  const selectedTeamId = useSelector(getSelectedTeamId);
  const aaFeatures = useSelector(getAAFeatures);
  const searchResultsVersion = useSelector(getSearchResultsVersion);
  const aaDrafts = useSelector(getAllAADrafts);
  const apDrafts = useSelector(getAllAPDrafts);
  const apDeletions = useSelector(getAPDeletions);
  const draftMode = useSelector(getDraftMode);

  const draftAAIdSet = useMemo(() => {
    if (!draftMode) return null;
    const ids = new Set(Object.keys(aaDrafts).map(Number));
    for (const draft of Object.values(apDrafts)) {
      if (draft.aaId) ids.add(Number(draft.aaId));
    }
    for (const aaId of Object.values(apDeletions)) {
      ids.add(Number(aaId));
    }
    return ids;
  }, [draftMode, aaDrafts, apDrafts, apDeletions]);

  const highlightSources = useMemo(() => {
    const list: Array<{ source: string; sourceLayers: string[] }> = [
      { source: namespacedSource, sourceLayers: [...BELIS_SOURCE_LAYERS] },
    ];
    if (brandnewLayerEnabled) {
      list.push({
        source: brandnewSource,
        sourceLayers: [...BELIS_SOURCE_LAYERS],
      });
    }
    return list;
  }, [namespacedSource, brandnewSource, brandnewLayerEnabled]);

  // Highlight context: need ensureToggledFeatures + criteria before handleHighlightToggle
  const {
    highlightingActive,
    highlightVersion,
    ensureToggledFeatures,
    criteria,
  } = useMapHighlight();

  // Adjusted highlights: starts from highlightResults, updated by Alt+click toggles
  const [adjustedHighlights, setAdjustedHighlights] = useState<
    SidebarFeature[] | null
  >(highlightResults);
  // Reset when new highlight results arrive
  useEffect(() => {
    setAdjustedHighlights(highlightResults);
  }, [highlightResults]);

  // Clear selection when highlighting activates (e.g. search)
  useEffect(() => {
    if (highlightingActive) {
      clearMapSelection();
    }
  }, [highlightingActive]);

  // Drop any fachobjekt selection the moment the user enters a measurement
  // draw mode. Otherwise a previously-selected leuchte stays highlighted
  // (and its infobox visible) while the user is busy clicking points or
  // line vertices, which is visually noisy and conceptually unrelated.
  useEffect(() => {
    if (drawMode !== "none") {
      clearMapSelection();
    }
  }, [drawMode]);

  // Notify parent about highlight changes
  useEffect(() => {
    onHighlightsChange?.(adjustedHighlights);
  }, [adjustedHighlights, onHighlightsChange]);

  const handleHighlightToggle = useCallback(
    (feature: maplibregl.MapGeoJSONFeature) => {
      const toSidebarFeature = (f: Record<string, any>): SidebarFeature =>
        Object.assign(f, { original: f }) as unknown as SidebarFeature;

      // Use the feature's own source so brandnew (geojson) and regular
      // (vector) features both resolve siblings against the right source.
      const featureSource = feature.source ?? namespacedSource;
      const isFeatureGeojson =
        map?.getSource(featureSource)?.type === "geojson";

      // Determine if this is a standort with sibling leuchten to expand
      const isStandort = feature.sourceLayer === "standorte";
      let siblingLeuchten: maplibregl.GeoJSONFeature[] = [];
      if (isStandort && map) {
        const standortId = String(feature.properties?.id ?? "");
        if (standortId) {
          // For geojson sources querySourceFeatures ignores sourceLayer;
          // we filter by the stamped _sourceLayer property instead.
          const queryOpts = isFeatureGeojson
            ? undefined
            : { sourceLayer: "leuchten" };
          siblingLeuchten = map
            .querySourceFeatures(featureSource, queryOpts)
            .filter((f) => {
              if (
                isFeatureGeojson &&
                String(f.properties?._sourceLayer ?? "") !== "leuchten"
              )
                return false;
              return String(f.properties?.fk_standort ?? "") === standortId;
            });
        }
      }

      // Sync sibling leuchten in the highlight context BEFORE updating adjustedHighlights.
      // toggleFeatureHighlight already toggled the standort itself (called by useMapHighlighting
      // before onToggle fires), so criteria.toggledFeatures already reflects the standort's state.
      // Read direction from the ref: if standort is now toggled ON, we add siblings; if OFF, remove.
      if (isStandort && siblingLeuchten.length > 0) {
        const standortKey = `${featureSource}::standorte::${feature.id}`;
        const adding = criteria.toggledFeatures.has(standortKey);
        ensureToggledFeatures(
          siblingLeuchten.map((l) => ({
            source: featureSource,
            sourceLayer: "leuchten",
            id: l.id!, // MVT tile ID (or geojson feature id), matching what matchesCriteria uses
          })),
          adding
        );
      }

      // Update sidebar content
      setAdjustedHighlights((prev) => {
        if (!prev) {
          const items = [toSidebarFeature(feature)];
          for (const l of siblingLeuchten) items.push(toSidebarFeature(l));
          return items;
        }

        const dbId = String(feature.properties?.id ?? feature.id ?? "");
        const sl = feature.sourceLayer ?? "";
        const alreadyPresent = prev.some(
          (f) =>
            (f.sourceLayer ?? "") === sl &&
            String(f.properties?.id ?? f.id ?? "") === dbId
        );

        if (alreadyPresent) {
          // Remove standort + all sibling leuchten
          const removeSet = new Set<string>();
          removeSet.add(`${sl}::${dbId}`);
          for (const l of siblingLeuchten) {
            const lid = String(l.properties?.id ?? l.id ?? "");
            removeSet.add(`${(l as any).sourceLayer ?? "leuchten"}::${lid}`);
          }
          return prev.filter((f) => {
            const key = `${f.sourceLayer ?? ""}::${String(
              f.properties?.id ?? f.id ?? ""
            )}`;
            return !removeSet.has(key);
          });
        }

        // Add standort + all sibling leuchten (skip duplicates)
        const existing = new Set(
          prev.map(
            (f) =>
              `${f.sourceLayer ?? ""}::${String(
                f.properties?.id ?? f.id ?? ""
              )}`
          )
        );
        const toAdd: SidebarFeature[] = [];
        if (!existing.has(`${sl}::${dbId}`)) {
          toAdd.push(toSidebarFeature(feature));
        }
        for (const l of siblingLeuchten) {
          const lid = String(l.properties?.id ?? l.id ?? "");
          const key = `${(l as any).sourceLayer ?? "leuchten"}::${lid}`;
          if (!existing.has(key)) {
            toAdd.push(toSidebarFeature(l));
          }
        }
        return [...prev, ...toAdd];
      });
    },
    [map, namespacedSource, ensureToggledFeatures, criteria]
  );

  // Sidebar dismiss: remove a single feature from highlights
  const handleSidebarDismiss = useCallback(
    (feature: SidebarFeature) => {
      const sl = feature.sourceLayer ?? "";
      const dbId = String(feature.properties?.id ?? feature.id ?? "");
      // Use the source the sidebar feature was stamped with (set by
      // useMapHighlighting / handleHighlightToggle) and fall back to the
      // regular source if missing — that way both vector and brandnew
      // (geojson) features get cleared from the right source.
      const featureSource =
        (feature as unknown as { source?: string }).source ?? namespacedSource;
      const isFeatureGeojson =
        map?.getSource(featureSource)?.type === "geojson";

      // Remove from map highlight state
      if (map) {
        const queryOpts = isFeatureGeojson ? undefined : { sourceLayer: sl };
        const sourceFeatures = map.querySourceFeatures(
          featureSource,
          queryOpts
        );
        const match = sourceFeatures.find((f) => {
          if (
            isFeatureGeojson &&
            String(f.properties?._sourceLayer ?? "") !== sl
          )
            return false;
          return String(f.properties?.id ?? "") === dbId;
        });
        if (match?.id != null) {
          ensureToggledFeatures(
            [{ source: featureSource, sourceLayer: sl, id: match.id }],
            false
          );
        }
      }

      // Remove from sidebar list
      setAdjustedHighlights((prev) => {
        if (!prev) return prev;
        return prev.filter((f) => {
          const key = `${f.sourceLayer ?? ""}::${String(
            f.properties?.id ?? f.id ?? ""
          )}`;
          return key !== `${sl}::${dbId}`;
        });
      });
    },
    [map, namespacedSource, ensureToggledFeatures]
  );

  const handleHighlightsApplied = useCallback(
    (matched: maplibregl.GeoJSONFeature[]) => {
      // Only collect when there are no SearchModal results (i.e. street search)
      if (highlightResults != null) return;
      if (matched.length > 0) {
        const converted = matched.map(
          (f) => Object.assign(f, { original: f }) as unknown as SidebarFeature
        );
        setAdjustedHighlights(converted);
      }
    },
    [highlightResults]
  );

  useMapHighlighting({
    map,
    sources: highlightSources,
    modifierClick: "alt",
    onToggle: handleHighlightToggle,
    onHighlightsApplied: handleHighlightsApplied,
  });

  // Lasso freehand selection
  useLassoHighlight({
    map,
    active: lassoActive,
    sources: highlightSources,
    onDeactivate: onLassoDeactivate,
    onToggle: handleHighlightToggle,
  });

  // Brandnew FC poll-and-reload: short cadence in localhost (yellow-border
  // dev scenario), longer otherwise. Triggers setData only when the .md5
  // sidecar changes. `featureDataVersion` is passed as `syncVersion` so a
  // successful save kicks off an immediate 1s-burst — the user's own brandnew
  // feature then appears quickly before the loop returns to the 15s cadence.
  const IS_LOCAL_DEV =
    typeof window !== "undefined" && window.location.hostname === "localhost";
  const BRAND_NEW_SYNC_INTERVAL_MS = IS_LOCAL_DEV ? 1000 : 15000;
  // Latest brandnew FC fetched from the server (kept in state so the mini-map
  // effect below can mirror it into its own brandnew source).
  const [brandnewFc, setBrandnewFc] = useState<GeoJSON.FeatureCollection>({
    type: "FeatureCollection",
    features: [],
  });
  useBrandnewFcSync({
    map,
    enabled: brandnewLayerEnabled,
    source: brandnewSource,
    dataUrl: BELIS_BRAND_NEW_FC_URL,
    intervalMs: BRAND_NEW_SYNC_INTERVAL_MS,
    syncVersion: featureDataVersion,
    onCountChange: onBrandnewCountChange,
    onDataChange: setBrandnewFc,
  });

  // AA lasso selection (disabled – button now only logs "hallo world")
  // useAaLassoSelection({
  //   map,
  //   active: aaLassoActive,
  //   onDeactivate: onAaLassoDeactivate,
  //   onFeaturesSelected: (features) => {
  //     dispatch(setLassoSelectedFeatures(features));
  //   },
  // });

  const showRaw = useMemo(() => {
    const hashQuery = window.location.hash.split("?")[1] || "";
    const param = new URLSearchParams(hashQuery || window.location.search).get(
      "showRaw"
    );
    if (param !== null) return param === "true";
    return window.location.hostname === "localhost";
  }, []);

  // Draft features for "Entwürfe" sidebar tab
  const allDraftFeatures = useSelector(getAllDraftFeatures);
  const draftFeaturesCount = useSelector(getDraftFeaturesCount);

  // Map-ready draft features for the brandnew GeoJSON source. A Leuchten
  // creation draft stores a single `_sourceLayer: "leuchten"` synthetic, but
  // the visible saved icon is the Standort cross + Laufende Nr (a Leuchten
  // save implicitly creates a Mast). Mirror that on the map by pushing the
  // Standort synthetic (built the same way the sidebar expansion builds it)
  // for Leuchten drafts; every other creation draft contributes its own
  // single feature.
  const draftBrandnewFeatures = useMemo(() => {
    const out: GeoJSON.Feature[] = [];
    for (const [draftKey, draft] of Object.entries(
      allDraftsForMeasurementLink
    )) {
      if (draft.isCreation !== true) continue;
      if (!draft.feature) continue;
      if (!draft.geometry) continue;
      if (draft.featureType === "leuchte") {
        out.push(
          buildLeuchteDraftStandortFeature(
            draftKey,
            draft,
            keyTablesData
          ) as unknown as GeoJSON.Feature
        );
      } else {
        out.push(draft.feature as unknown as GeoJSON.Feature);
      }
    }
    return out;
  }, [allDraftsForMeasurementLink, keyTablesData]);

  // Source-layer keyed ids to suppress on the regular Fachobjekte vector
  // tiles — currently the parent Standort of every "+ Leuchte zu Standort N"
  // draft (so its tile icon doesn't sit underneath the brandnew draft icon).
  // Merges live draft entries + the persistent post-save set.
  const draftHiddenOriginalIds = useSelector(getEffectiveHiddenOriginalIds);

  // Hidden ids derived from the server brandnew FC. Saved brandnew features
  // outlive their drafts (and survive a clean browser), so the vector-tile
  // parent Standort of every brandnew Leuchte (and any brandnew Standort) must
  // also be suppressed — otherwise the old tile icon stacks underneath the
  // brandnew icon on reload.
  const brandnewHiddenOriginalIds = useMemo<HiddenOriginalIds>(() => {
    const standorteIds = new Set<number>();
    for (const f of brandnewFc.features ?? []) {
      const sourceLayer = String(f.properties?._sourceLayer ?? "");
      if (sourceLayer === "leuchten") {
        const fk = Number(f.properties?.fk_standort);
        if (Number.isFinite(fk)) standorteIds.add(fk);
      } else if (sourceLayer === "standorte") {
        const id = Number(f.properties?.id ?? f.id);
        if (Number.isFinite(id)) standorteIds.add(id);
      }
    }
    return standorteIds.size > 0 ? { standorte: [...standorteIds] } : {};
  }, [brandnewFc]);

  // Final hidden-ids map fed to the vector-tile filter — union of draft-driven
  // + brandnew-FC-derived ids, keyed by source-layer.
  const hiddenOriginalIds = useMemo<HiddenOriginalIds>(() => {
    const merged: Record<string, Set<number>> = {};
    const add = (sourceLayer: string, ids?: number[]) => {
      if (!ids || ids.length === 0) return;
      const bucket = merged[sourceLayer] ?? (merged[sourceLayer] = new Set());
      for (const id of ids) bucket.add(id);
    };
    for (const [sl, ids] of Object.entries(draftHiddenOriginalIds)) add(sl, ids);
    for (const [sl, ids] of Object.entries(brandnewHiddenOriginalIds))
      add(sl, ids);
    const out: HiddenOriginalIds = {};
    for (const [sl, set] of Object.entries(merged)) {
      if (set.size > 0) out[sl] = [...set];
    }
    return out;
  }, [draftHiddenOriginalIds, brandnewHiddenOriginalIds]);

  // Active-draft-only hidden ids (excludes `permanentlyHiddenOriginalIds`).
  // The permanent set is meant to keep vector tiles hidden during the post-save
  // gap before the brandnew FC refresh delivers the new feature; it must NOT
  // suppress the brandnew layer itself, or the just-saved feature would
  // disappear when its parent Standort sits in the permanent set.
  const activeDraftHiddenOriginalIds = useMemo<HiddenOriginalIds>(() => {
    const merged: Record<string, Set<number>> = {};
    for (const draft of Object.values(allDraftsForMeasurementLink)) {
      const ids = draft.hiddenOriginalIds;
      if (!ids) continue;
      for (const [sourceLayer, list] of Object.entries(ids)) {
        if (!list || list.length === 0) continue;
        const bucket =
          merged[sourceLayer] ?? (merged[sourceLayer] = new Set());
        for (const id of list) bucket.add(id);
      }
    }
    const out: HiddenOriginalIds = {};
    for (const [sl, set] of Object.entries(merged)) {
      if (set.size > 0) out[sl] = [...set];
    }
    return out;
  }, [allDraftsForMeasurementLink]);

  // Brandnew FC features, minus any that an OPEN draft has flagged as hidden.
  // When a "+ Leuchte zu Standort N" draft is open, the draft layer renders
  // its own synthetic Standort N (with the higher Leuchten count) — so the
  // already-saved brandnew Standort N (and its brandnew Leuchten) must be
  // suppressed to avoid a stacked duplicate icon. Mirrors the source-layer
  // cascade used by applyHiddenIdsFilter for the regular vector tiles.
  // Keyed on `activeDraftHiddenOriginalIds`, NOT the effective set, so the
  // post-save permanent ids never hide the brandnew layer's own features.
  const visibleBrandnewFeatures = useMemo<GeoJSON.Feature[]>(() => {
    const all = brandnewFc.features ?? [];
    const hiddenStandorteIds = new Set(
      activeDraftHiddenOriginalIds.standorte ?? []
    );
    const hasAnyHidden =
      hiddenStandorteIds.size > 0 ||
      Object.values(activeDraftHiddenOriginalIds).some(
        (list) => list && list.length > 0
      );
    if (!hasAnyHidden) return all;
    return all.filter((f) => {
      const sl = String(f.properties?._sourceLayer ?? "");
      if (sl === "standorte") {
        const id = Number(f.properties?.id ?? f.id);
        return !hiddenStandorteIds.has(id);
      }
      if (sl === "leuchten") {
        const fk = Number(f.properties?.fk_standort);
        return !hiddenStandorteIds.has(fk);
      }
      const idsForLayer = activeDraftHiddenOriginalIds[sl];
      if (idsForLayer && idsForLayer.length > 0) {
        const id = Number(f.properties?.id ?? f.id);
        return !idsForLayer.includes(id);
      }
      return true;
    });
  }, [brandnewFc, activeDraftHiddenOriginalIds]);

  // Live fetchedData for creation drafts — avoids stale snapshot in fetchedFeatureData
  const creationDraftKey =
    rawFeature?.properties?._isCreation === true
      ? String(rawFeature.properties.id)
      : undefined;
  const liveDraftFetchedData = useSelector((state: RootState) =>
    getDraftFetchedData(state, creationDraftKey)
  );

  // The id under which this draft sits in the brandnew GeoJSON source — used
  // to compute the numeric feature-state id below. Matches what the main-map
  // / mini-map effects push: a Leuchten draft becomes a Standort synthetic
  // with id `${draftKey}::standort` (so the cross + Laufende Nr icon renders
  // at the chosen position); every other draft uses the bare key.
  const creationDraftMapId =
    creationDraftKey && rawFeature?.properties?._featureType === "leuchte"
      ? `${creationDraftKey}::standort`
      : creationDraftKey;

  // Draft features for the "Entwürfe" list. A Leuchten creation draft is
  // expanded into a Standort parent row + one nested Leuchte row per form tab
  // (expandDraftSidebarFeatures); every other draft contributes its single
  // stored feature. prepareDraftFeatures then normalizes fk_standort so
  // BelisSidebar's Standort/Leuchten clustering nests them.
  const draftSidebarFeatures = useMemo(() => {
    return prepareDraftFeatures(
      expandDraftSidebarFeatures(allDraftsForMeasurementLink, keyTablesData)
    );
  }, [allDraftsForMeasurementLink, keyTablesData]);

  const mapWidth = mapSizes.width - LIST_WIDTH;

  const { features, totalCount, countsByLayer, isLoading, isOverviewMode } =
    useVisibleMapFeatures({
      maplibreMap: map,
      visibleMapWidth: mapWidth,
      visibleMapHeight: mapSizes.height,
      maxFeatures: 2000,
      layerFilterExpressions: [
        "Leuchten.*-base",
        "Leuchten.*-icon",
        "Standorte.*-base",
        "Standorte.*-icon",
        "standorte.*",
        // brandnew (GeoJSON-backed) layers — same suffixes, different prefix
        "BrandNewFeatures.*-base",
        "BrandNewFeatures.*-icon",
      ],
      highlightedOnly: highlightingActive,
      refreshTrigger: highlightVersion,
      showDebugBounds: showRaw,
    });

  // Sidebar mode: "karte" shows viewport features, "highlights" shows highlighted features
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("fachobjekte");

  // Parent Fachobjekt selection captured when a creation draft is opened. Keeps
  // the originating Standort highlighted in the Fachobjekte list while the user
  // edits the new draft (which itself becomes the primary selectedFeature).
  // Cleared automatically when the active selection is no longer a draft.
  const [parentFachobjektSelection, setParentFachobjektSelection] = useState<{
    source: string;
    sourceLayer?: string;
    id?: string | number;
  } | null>(null);

  // The expanded "Entwürfe" row to highlight while a Leuchten creation draft is
  // open. That draft renders as several rows (Standort parent + Leuchten
  // children); the primary `selectedFeatureId` only carries the draft key, so
  // this points at the specific row matching the form's current tab.
  const [activeDraftRow, setActiveDraftRow] = useState<{
    sourceLayer?: string;
    id?: string | number;
  } | null>(null);

  // When highlighting is killed, reset to Karte mode and clear highlight collection
  useEffect(() => {
    if (!highlightingActive) {
      setSidebarMode("fachobjekte");
      setAdjustedHighlights(null);
    }
  }, [highlightingActive]);

  // The Entwürfe tab disappears once all drafts are saved/discarded, but
  // `sidebarMode` would otherwise stay "drafts" — gating out the Messungen
  // group (and anything else fachobjekte-only) until the user toggles modes
  // by some other route. Fall back to fachobjekte automatically.
  useEffect(() => {
    if (sidebarMode === "drafts" && draftSidebarFeatures.length === 0) {
      setSidebarMode("fachobjekte");
    }
  }, [sidebarMode, draftSidebarFeatures.length]);

  // Drop the captured parent selection (and the highlighted Entwürfe row) once
  // the active selection is no longer a creation draft — covers draft save
  // (selection switches to the newly persisted feature), discard, and any
  // direct feature reselection.
  useEffect(() => {
    const draftSelected =
      selectedFeatureId != null &&
      selectedFeatureId.id != null &&
      isCreationDraftKey(String(selectedFeatureId.id));
    if (!draftSelected) {
      if (parentFachobjektSelection != null) {
        setParentFachobjektSelection(null);
      }
      if (activeDraftRow != null) {
        setActiveDraftRow(null);
      }
    }
  }, [selectedFeatureId, parentFachobjektSelection, activeDraftRow]);

  const hasHighlights =
    highlightingActive ||
    (adjustedHighlights != null && adjustedHighlights.length > 0);

  // Compute effective sidebar data based on mode
  const effectiveSidebarData = useMemo(() => {
    // Shared derivation: counts per sourceLayer + merged activeSourceLayers.
    // Used by every branch that doesn't get pre-computed counts straight from
    // `useVisibleMapFeatures` (i.e. anything that builds a synthetic list).
    const buildFromFeatures = (
      list: typeof features,
      overrides?: { isLoading?: boolean; isOverviewMode?: boolean }
    ) => {
      const counts: Record<string, number> = {};
      for (const f of list) {
        const sl = f.sourceLayer || "";
        counts[sl] = (counts[sl] || 0) + 1;
      }
      return {
        features: list,
        countsByLayer: counts,
        totalCount: list.length,
        isLoading: overrides?.isLoading ?? false,
        isOverviewMode: overrides?.isOverviewMode ?? false,
        activeSourceLayers: new Set([
          ...activeSourceLayers,
          ...Object.keys(counts),
        ]),
      };
    };

    if (
      sidebarMode === "highlights" &&
      adjustedHighlights &&
      adjustedHighlights.length > 0
    ) {
      return buildFromFeatures(adjustedHighlights);
    }
    if (sidebarMode === "drafts" && draftSidebarFeatures.length > 0) {
      return buildFromFeatures(draftSidebarFeatures);
    }
    // Fachobjekte mode with drafts present: splice the expanded draft rows
    // (Standort parent + Leuchten children, same shape used by the Entwürfe
    // tab) in next to the regular viewport features. The viewport list
    // already carries the synthetic draft Standort from the brandnew GeoJSON
    // layer; drop it so the expanded version from `draftSidebarFeatures`
    // wins (otherwise the Standort row would appear twice).
    if (draftSidebarFeatures.length > 0) {
      const nonDraftViewportFeatures = features.filter(
        (f) => f.properties?._isCreation !== true
      );
      return buildFromFeatures(
        [...nonDraftViewportFeatures, ...draftSidebarFeatures],
        { isLoading, isOverviewMode }
      );
    }
    return {
      features,
      countsByLayer,
      totalCount,
      isLoading,
      isOverviewMode,
      activeSourceLayers,
    };
  }, [
    sidebarMode,
    adjustedHighlights,
    draftSidebarFeatures,
    features,
    countsByLayer,
    totalCount,
    isLoading,
    isOverviewMode,
    activeSourceLayers,
  ]);

  // Neighborhood: mark leuchten sharing the same Standort as the selected feature
  useSelectionNeighborhood({
    map,
    sources: highlightSources,
    isNeighbor: (
      selectedProps,
      candidateProps,
      candidateSourceLayer,
      selectedSourceLayer
    ) => {
      const NEIGHBORHOOD_LAYERS = new Set(["leuchten", "standorte"]);
      if (
        !NEIGHBORHOOD_LAYERS.has(selectedSourceLayer ?? "") ||
        !NEIGHBORHOOD_LAYERS.has(candidateSourceLayer ?? "")
      )
        return false;

      // Resolve the standort ID for selected and candidate
      const selectedStandortId =
        selectedSourceLayer === "standorte"
          ? String(selectedProps.id ?? "")
          : String(selectedProps.fk_standort ?? "");
      const candidateStandortId =
        candidateSourceLayer === "standorte"
          ? String(candidateProps.id ?? "")
          : String(candidateProps.fk_standort ?? "");

      return (
        selectedStandortId !== "" &&
        candidateStandortId !== "" &&
        selectedStandortId === candidateStandortId
      );
    },
  });

  // Sync selection to Redux store when map selection changes
  useEffect(() => {
    if (selectedFeature) {
      dispatch(setSelectedFeature({ ...selectedFeature, selected: true }));
    }
  }, [selectedFeature, dispatch]);

  // Map source layer names to FeatureType for API fetches
  const SOURCE_LAYER_TO_FEATURE_TYPE: Record<string, FeatureType> = {
    leuchten: "leuchten",
    standorte: "mast",
    schaltstelle: "schaltstelle",
    mauerlaschen: "mauerlaschen",
    leitungen: "leitungen",
    abzweigdosen: "abzweigdosen",
  };

  useEffect(() => {
    const fetchData = async () => {
      // Only fetch Fachobjekte details — AA/AP have their own fetch pipeline
      if (!jwt || sidebarVariant !== "fachobjekte") return;

      // Resolve sourceLayer + id from either the processed feature or the raw selection identifier
      let sourceLayer: string | undefined;
      let featureId: string | number | undefined;

      if (selectedFeature) {
        sourceLayer = selectedFeature.carmaInfo?.sourceLayer;
        featureId = selectedFeature.properties?.sourceProps?.id;
      }

      // Fallback to selectedFeatureId when selectedFeature is absent or
      // lacks carmaInfo (e.g. synthetic draft features processed by createFeature
      // that don't produce a valid sourceLayer).
      if (!sourceLayer && selectedFeatureId) {
        sourceLayer = selectedFeatureId.sourceLayer;
        featureId = rawFeature?.properties?.id ?? selectedFeatureId.id;
      }

      if (!sourceLayer && !selectedFeature && !selectedFeatureId) {
        setFetchedFeatureData(null);
        return;
      }

      if (sourceLayer) {
        setLastFeatureType(sourceLayer);
      }

      // console.log("xxx [SELECTION] fetching feature by id:", {
      //   featureId,
      //   sourceLayer,
      //   fallback: !selectedFeature,
      // });

      // Creation drafts have synthetic fetchedData — skip API fetch.
      // Extension drafts (`extend:leitung:…`) follow the same path: there is
      // no DB record to fetch by their synthetic key, and the draft already
      // carries the fetchedData built by useExtendLeitungDraft. Without this,
      // the override useEffect short-circuits on `!fetchedFeatureData` and the
      // bottom-right InfoBox stays hidden while an extension draft is open.
      const featureIdStr = String(featureId ?? "");
      if (isCreationDraftKey(featureIdStr)) {
        const creationDraft =
          store.getState().featuresForms?.drafts[featureIdStr];
        if (creationDraft?.fetchedData) {
          setFetchedFeatureData(creationDraft.fetchedData);
        } else {
          setFetchedFeatureData(null);
        }
        return;
      }

      const apiFeatureType = SOURCE_LAYER_TO_FEATURE_TYPE[sourceLayer ?? ""];
      if (!apiFeatureType || !featureId) {
        // Not a known BeLIS layer (e.g. ALKIS background); clear stale data
        setFetchedFeatureData(null);
        return;
      }

      // Check if the draft already has cached fetched data (avoids redundant API call)
      const draftKey = `${sourceLayer}:${featureId}`;
      const cachedData =
        store.getState().featuresForms?.drafts[draftKey]?.fetchedData;
      if (cachedData) {
        console.log("[SELECTION] using cached draft data for", draftKey);
        setFetchedFeatureData(cachedData);
        return;
      }

      dispatch(setFeatureLoading(true));
      try {
        const fullData = await fetchFeatureById(
          jwt,
          featureId as number,
          apiFeatureType
        );
        setFetchedFeatureData(fullData);
      } catch (error) {
        console.error("[SELECTION] Failed to fetch feature:", error);
        setFetchedFeatureData(null);
      } finally {
        dispatch(setFeatureLoading(false));
      }
    };

    fetchData();
  }, [
    selectedFeature,
    selectedFeatureId,
    jwt,
    featureDataVersion,
    sidebarVariant,
  ]);

  // Close the datasheet when the selection is cleared in fachobjekte mode
  useEffect(() => {
    if (sidebarVariant === "fachobjekte" && !selectedFeatureId) {
      closeDatasheet();
    }
  }, [selectedFeatureId, sidebarVariant, closeDatasheet]);

  // Check if selected feature is inside visible map boundary.
  // When not visible, auto-open the datasheet to show NoFeatureSelected.
  const [featureOnMap, setFeatureOnMap] = useState(true);

  useEffect(() => {
    console.log("[AA-DEBUG] bounds-check effect fired", {
      sidebarMode,
      sidebarVariant,
      selectedFeatureId,
      rawFeature: !!rawFeature,
    });
    if (
      sidebarVariant === "arbeitsauftraege" ||
      (sidebarMode !== "fachobjekte" && sidebarMode !== "highlights") ||
      !selectedFeatureId ||
      !map
    ) {
      setFeatureOnMap(true);
      return;
    }

    if (rawFeature?.properties?._isCreation === true) {
      setFeatureOnMap(true);
      return;
    }

    const geometry = rawFeature?.geometry;
    if (!geometry) {
      console.log("[AA-DEBUG] no geometry, skipping");
      setFeatureOnMap(true);
      return;
    }

    const bounds = map.getBounds();
    let inside: boolean;

    if (geometry.type === "Point") {
      const [lng, lat] = geometry.coordinates;
      inside = bounds.contains([lng, lat]);
    } else {
      const coords =
        geometry.type === "LineString"
          ? geometry.coordinates
          : geometry.type === "Polygon"
          ? geometry.coordinates[0]
          : [];
      inside = coords.some(([lng, lat]: number[]) =>
        bounds.contains([lng, lat])
      );
    }
    setFeatureOnMap(inside);
    console.log("[AA-DEBUG] bounds check result", {
      inside,
      geometryType: geometry.type,
      sourceLayer: selectedFeatureId.sourceLayer,
    });

    if (!inside) {
      console.log("[AA-DEBUG] >>> openDatasheet() called from bounds-check");
      openDatasheet();
    }
  }, [map, selectedFeatureId, rawFeature, sidebarMode, openDatasheet]);

  // Build override feature for the infobox when LibreMap can't process the selection
  // (e.g. search result not visible on map).
  // Flatten the GraphQL by-id record to vector-tile-like props, then run the same
  // createInfoBoxInfo.js (from the style) via sandboxed eval.
  const [overrideSelectedFeature, setOverrideSelectedFeature] =
    useState<any>(null);

  // Measurement-selection override: when the shared selectedFeature slot
  // carries a measurement (sidebar click or terra-draw map click), build an
  // override the FeatureInfobox can render directly — no Fachobjekt mapping
  // needed. Includes a Löschen genericLink wired to terra-draw via the
  // MeasurementHost ref.
  const measurementOverride = useMemo(() => {
    if (reduxSelectedFeature?.featurekind !== MEASUREMENT_FEATUREKIND) {
      return null;
    }
    const feature = reduxSelectedFeature;
    const geomType = feature?.geometry?.type;
    const id = feature?.id != null ? String(feature.id) : "?";
    const rawId = id.startsWith("measurement.") ? id.slice(12) : id;
    const shortId = rawId.slice(0, 8);
    const label =
      typeof feature?.properties?.title === "string"
        ? (feature.properties.title as string)
        : null;
    let title = "Messung";
    let subtitle = "";
    // Trailing identifier next to the type in the InfoBox title. Default is
    // the opaque shortId; lines prefer the on-map label (e.g. "L3").
    let trailing = shortId;
    if (geomType === "Point") {
      title = "Punkt";
      const coords = feature.geometry?.coordinates;
      if (Array.isArray(coords) && typeof coords[0] === "number") {
        subtitle = `${coords[0].toFixed(2)} / ${coords[1].toFixed(2)}`;
      }
      if (label) trailing = label;
    } else if (geomType === "LineString" || geomType === "MultiLineString") {
      title = "Linie";
      const meters = featureLengthMeters(feature);
      if (meters != null) subtitle = formatMeters(meters);
      if (label) trailing = label;
    } else if (geomType === "Polygon" || geomType === "MultiPolygon") {
      title = "Fläche";
      if (label) subtitle = label;
    }
    // If a creation draft uses this measurement as its geometry source, expose
    // a second InfoBox link that opens the draft's Datenblatt directly.
    // Mirror geometryOptions.ts: the dropdown key is `measurement.${f.id}`,
    // and f.id already carries the `measurement.` prefix → the persisted
    // draft.geometryKey is double-prefixed (`measurement.measurement.<uuid>`).
    const geometryKey = `measurement.${String(feature.id)}`;
    let linkedDraft: { draftKey: string; featureType: string } | null = null;
    for (const [draftKey, draft] of Object.entries(
      allDraftsForMeasurementLink
    )) {
      if (draft.geometryKey === geometryKey) {
        linkedDraft = { draftKey, featureType: draft.featureType };
        break;
      }
    }

    // Order in the InfoBox: zoom (rendered by the InfoBox itself before
    // genericLinks), then any links from this array. Keep trash last.
    const genericLinks: {
      tooltip: string;
      iconname: string;
      icon?: ReactNode;
      action: () => void;
    }[] = [];

    if (linkedDraft) {
      genericLinks.push({
        tooltip: "Entwurf öffnen",
        iconname: "info",
        action: () => {
          handleOpenCreationDraftRef.current?.(
            linkedDraft!.featureType,
            linkedDraft!.draftKey
          );
        },
      });
    }

    genericLinks.push({
      tooltip: "Messung löschen",
      iconname: "trash",
      icon: MEASUREMENT_DELETE_ICON,
      action: () => {
        // Selection advancement is handled by replaceMeasurements once
        // the onChange snapshot lands in Redux.
        measurementHostRef.current?.deleteFeature(rawId);
      },
    });

    return {
      properties: {
        header: "Messung",
        title: `${title} ${trailing}`,
        subtitle,
        headerColor: "#0078a8",
        genericLinks,
      },
      geometry: feature.geometry,
    };
  }, [reduxSelectedFeature, dispatch, allDraftsForMeasurementLink]);

  // When a measurement gets selected, drop any lingering Fachobjekt
  // selection in the local useMapSelection state so LibreMap falls back to
  // the override path (which renders our measurement InfoBox).
  useEffect(() => {
    if (reduxSelectedFeature?.featurekind === MEASUREMENT_FEATUREKIND) {
      clearMapSelection();
    }
  }, [reduxSelectedFeature, clearMapSelection]);

  // Mirror redux's measurement selection into terra-draw so the map halo +
  // vertex handles paint regardless of where the click came from (sidebar,
  // InfoBox-trigger, programmatic). Without this, only direct map clicks
  // produced the halo, leaving sidebar clicks visually orphaned. The
  // imperative calls are guarded against the redux→draw→redux echo inside
  // MeasurementHost (suppressSelectionCallbackRef).
  useEffect(() => {
    const handle = measurementHostRef.current;
    if (!handle) return;
    if (reduxSelectedFeature?.featurekind === MEASUREMENT_FEATUREKIND) {
      const id = String(reduxSelectedFeature.id);
      const rawId = id.startsWith("measurement.") ? id.slice(12) : id;
      handle.selectFeature(rawId);
    } else {
      handle.deselectAll();
    }
  }, [reduxSelectedFeature]);
  useEffect(() => {
    // Only run in Fachobjekte mode — AA/AP manage their own overrides
    if (sidebarVariant !== "fachobjekte") return;

    const sourceLayer = selectedFeatureId?.sourceLayer ?? "";
    if (
      selectedFeature ||
      !fetchedFeatureData ||
      !selectedFeatureId ||
      !infoboxMappingCode ||
      !SOURCE_LAYER_TO_FEATURE_TYPE[sourceLayer]
    ) {
      setOverrideSelectedFeature(null);
      return;
    }

    (async () => {
      try {
        // Unwrap GraphQL envelope: { schaltstelle: [{...}] } -> record
        const firstArray = Object.values(fetchedFeatureData).find(
          Array.isArray
        ) as unknown[] | undefined;
        const record = (firstArray?.[0] ?? null) as Record<string, any> | null;
        if (!record) {
          setOverrideSelectedFeature(null);
          return;
        }

        // Flatten to vector-tile-like props so createInfoBoxInfo.js can
        // process them. Creation drafts have no GraphQL by-id record:
        // flattenGqlRecord reads the nested GraphQL shape and can't resolve a
        // draft's flat fk_* form values. The synthetic draft feature already
        // carries enriched, vector-tile-shaped props (via enrichSyntheticProps),
        // so feed those straight in — the info box then renders through the
        // exact same createInfoBoxInfo mapping as a real on-map click, instead
        // of a draft-only layout. The draft-key `id` is dropped so the mapping
        // falls back to "?" rather than printing the opaque "create:…" key.
        let flatProps: Record<string, unknown>;
        if (rawFeature?.properties?._isCreation === true) {
          flatProps = { ...rawFeature.properties };
          // Extension drafts ("Leitung verlängern") stash the source Leitung's
          // id under _originalId. Feed it to the mapping as `id` so the
          // InfoBox title reads as the source's id (e.g. "L-13564") rather
          // than the opaque draft key or the "?" fallback.
          if (flatProps._originalId != null) {
            flatProps.id = flatProps._originalId;
          } else {
            delete flatProps.id;
          }
          delete flatProps._originalId;
        } else {
          flatProps = flattenGqlRecord(record, sourceLayer);
        }

        // Run the same mapping function that LibreMap uses for on-map clicks
        const info = await functionToInfo(
          { ...flatProps, carmaInfo: { sourceLayer } },
          infoboxMappingCode
        );

        if (info) {
          const genericLinks: {
            iconname: string;
            tooltip: string;
            action?: () => void;
          }[] = [];
          if ((info as Record<string, unknown>).datasheet && openDatasheet) {
            genericLinks.push({
              iconname: "info",
              tooltip: "Datenblatt",
              action: openDatasheet,
            });
          }
          setOverrideSelectedFeature({
            properties: {
              ...info,
              sourceProps: fetchedFeatureData,
              genericLinks,
            },
            geometry: rawFeature?.geometry ??
              reduxGeometryRef.current ?? {
                type: "Point",
                coordinates: [0, 0],
              },
            carmaInfo: { sourceLayer },
          });
        } else {
          setOverrideSelectedFeature(null);
        }
      } catch {
        setOverrideSelectedFeature(null);
      }
    })();
  }, [
    selectedFeature,
    fetchedFeatureData,
    selectedFeatureId,
    infoboxMappingCode,
    rawFeature,
    sidebarVariant,
  ]);

  // Visually select the MVT feature on the map when using the override path.
  // The override path means LibreMap didn't handle the selection (no on-map click),
  // so we need to set feature-state { selected: true } ourselves.
  // Retry on sourcedata because the tile may not be loaded yet (e.g. after fly-to).
  useEffect(() => {
    if (!map || !overrideSelectedFeature || !selectedFeatureId) return;

    const sourceLayer = selectedFeatureId.sourceLayer ?? "";
    const dbId = selectedFeatureId.id;
    if (dbId == null) return;

    let prevMvtId: string | number | undefined;

    const trySelect = () => {
      try {
        const features = map.querySourceFeatures(namespacedSource, {
          sourceLayer,
        });
        const match = features.find(
          (f) => f.properties && String(f.properties.id) === String(dbId)
        );
        if (match?.id != null) {
          if (prevMvtId != null && prevMvtId !== match.id) {
            map.setFeatureState(
              { source: namespacedSource, sourceLayer, id: prevMvtId },
              { selected: false }
            );
          }
          map.setFeatureState(
            { source: namespacedSource, sourceLayer, id: match.id },
            { selected: true }
          );
          prevMvtId = match.id;
        }
      } catch {
        // source/layer may not exist yet
      }
    };

    trySelect();
    map.on("sourcedata", trySelect);

    return () => {
      map.off("sourcedata", trySelect);
      if (prevMvtId != null) {
        try {
          map.setFeatureState(
            { source: namespacedSource, sourceLayer, id: prevMvtId },
            { selected: false }
          );
        } catch {
          // ignore
        }
      }
    };
  }, [map, overrideSelectedFeature, selectedFeatureId, namespacedSource]);

  const libreLayers = useMemo(() => {
    const layers: LibreLayer[] = [];

    // Background layer (single active, may be a composite of multiple sub-layers)
    const bgConfig = backgroundLayerConfigs[activeBackgroundLayer];
    if (bgConfig) {
      const bgOpacity = backgroundLayerOpacities[activeBackgroundLayer] ?? 1;
      const effectiveOpacity = inPaleMode ? bgOpacity * 0.1 : bgOpacity;
      const bgLayers = Array.isArray(bgConfig.layer)
        ? bgConfig.layer
        : [bgConfig.layer];
      for (const l of bgLayers) {
        const withOpacity = { ...l, opacity: effectiveOpacity };
        layers.push(withOpacity as LibreLayer);
      }
    }

    // Additional layers (multiple can be active)
    for (const key of activeAdditionalLayers) {
      const addConfig = additionalLayerConfigs[key];
      if (addConfig) {
        const addOpacity = additionalLayerOpacities[key] ?? 1;
        const addLayers = Array.isArray(addConfig.layer)
          ? addConfig.layer
          : [addConfig.layer];
        for (const l of addLayers) {
          const withOpacity = { ...l, opacity: addOpacity };
          layers.push(withOpacity as LibreLayer);
        }
      }
    }

    // Data layers (always loaded — visibility toggled per route)
    if (regularLayerEnabled) {
      layers.push(leuchtenDataLayer);
    }
    if (brandnewLayerEnabled) {
      layers.push(brandNewDataLayer);
    }

    return layers;
  }, [
    activeBackgroundLayer,
    backgroundLayerOpacities,
    activeAdditionalLayers,
    additionalLayerOpacities,
    inPaleMode,
    regularLayerEnabled,
    brandnewLayerEnabled,
  ]);

  // Hide Fachobjekte layers when entering Arbeitsaufträge mode.
  // When returning to Fachobjekte, do nothing: useLayerFilter in MainPage
  // will re-mount and apply the correct per-category visibility.
  useEffect(() => {
    if (!map || sidebarVariant !== "arbeitsauftraege") return;
    const hide = () => {
      for (const layer of map.getStyle()?.layers ?? []) {
        if ("source" in layer && layer.source === namespacedSource) {
          try {
            map.setLayoutProperty(layer.id, "visibility", "none");
          } catch {
            /* layer may not be ready */
          }
        }
      }
    };
    hide();
    map.on("styledata", hide);
    return () => {
      map.off("styledata", hide);
    };
  }, [sidebarVariant, map, namespacedSource]);

  // Filter leitungen layers by sub-type (Freileitung, Erdkabel, etc.)
  useEffect(() => {
    if (!map) return;

    const leitungstypen = (keyTablesData.leitungstyp || []) as {
      id: number;
      bezeichnung?: string;
    }[];

    // Nothing to filter if key tables haven't loaded yet
    if (leitungstypen.length === 0) return;

    const allEnabled = leitungstypen.every(
      (t) => enabledLeitungstypen[t.id] !== false
    );
    const noneExplicitlySet = Object.keys(enabledLeitungstypen).length === 0;

    // Build the filter or clear it
    let filter: maplibregl.FilterSpecification | null = null;
    if (!allEnabled && !noneExplicitlySet) {
      const allowedNames = leitungstypen
        .filter((t) => enabledLeitungstypen[t.id] !== false)
        .map((t) => t.bezeichnung)
        .filter(Boolean);
      filter = ["in", ["get", "bezeichnung"], ["literal", allowedNames]];
    }

    const sources = new Set([namespacedSource, brandnewSource]);
    for (const layer of map.getStyle()?.layers ?? []) {
      if (
        "source" in layer &&
        sources.has(layer.source as string) &&
        layer.id.toLowerCase().includes("leitungen")
      ) {
        try {
          map.setFilter(layer.id, filter);
        } catch {
          /* layer may not be ready */
        }
      }
    }
  }, [
    map,
    enabledLeitungstypen,
    keyTablesData,
    namespacedSource,
    brandnewSource,
  ]);

  // Hide specific original Fachobjekt features from the regular vector-tile
  // layers (NOT the brandnew source — drafts live there). Driven by
  // hiddenOriginalIds: union of every open draft's hiddenOriginalIds plus the
  // persistent post-save set. The map filter excludes vector tile features
  // whose id matches — either via feature `id` (vector-tile primary) or
  // `properties.id` (fallback when the tile encoding stashes it there).
  // We track which source-layers we've previously touched so we can clear
  // the filter when its bucket empties, without ever poking source-layers we
  // don't manage (e.g. the leitungstyp-filtered leitungen). Two refs because
  // the main map and the mini map carry independent layer style instances.
  const hiddenIdsTouchedMainRef = useRef<Set<string>>(new Set());
  const hiddenIdsTouchedMiniRef = useRef<Set<string>>(new Set());
  const applyHiddenIdsFilter = useCallback(
    (mapInstance: maplibregl.Map, touched: Set<string>) => {
      const stillTouched = new Set<string>();
      const hiddenStandortIds = hiddenOriginalIds.standorte ?? [];
      for (const layer of mapInstance.getStyle()?.layers ?? []) {
        if (!("source" in layer)) continue;
        if (layer.source !== namespacedSource) continue;
        const sourceLayer = (layer as { "source-layer"?: string })[
          "source-layer"
        ];
        if (!sourceLayer) continue;
        // standorte: hide the Standort row itself by feature id.
        // leuchten:  hide every Leuchte whose fk_standort points at one of
        //            the hidden Standorte (their icons are stacked on top
        //            of the new draft at the same coordinates).
        let filter: maplibregl.FilterSpecification | null = null;
        if (sourceLayer === "standorte") {
          const ids = hiddenOriginalIds[sourceLayer];
          if (ids && ids.length > 0) {
            filter = [
              "!",
              [
                "any",
                ["in", ["id"], ["literal", ids]],
                ["in", ["get", "id"], ["literal", ids]],
              ],
            ];
          }
        } else if (sourceLayer === "leuchten") {
          if (hiddenStandortIds.length > 0) {
            filter = [
              "!",
              ["in", ["get", "fk_standort"], ["literal", hiddenStandortIds]],
            ];
          }
        } else {
          const ids = hiddenOriginalIds[sourceLayer];
          if (ids && ids.length > 0) {
            filter = [
              "!",
              [
                "any",
                ["in", ["id"], ["literal", ids]],
                ["in", ["get", "id"], ["literal", ids]],
              ],
            ];
          }
        }
        if (filter) {
          try {
            mapInstance.setFilter(layer.id, filter);
            stillTouched.add(sourceLayer);
          } catch {
            /* layer may not be ready */
          }
        } else if (touched.has(sourceLayer)) {
          try {
            mapInstance.setFilter(layer.id, null);
          } catch {
            /* layer may not be ready */
          }
        }
      }
      touched.clear();
      for (const k of stillTouched) touched.add(k);
    },
    [namespacedSource, hiddenOriginalIds]
  );
  useEffect(() => {
    if (!map || !mapReady) return;
    applyHiddenIdsFilter(map, hiddenIdsTouchedMainRef.current);
  }, [map, mapReady, applyHiddenIdsFilter]);

  // --- Save/restore selection when switching between route variants ---
  useEffect(() => {
    const prev = prevVariantRef.current;
    prevVariantRef.current = sidebarVariant;
    if (prev === sidebarVariant) return;

    // Save outgoing fachobjekte selection
    if (prev === "fachobjekte" && selectedFeatureId) {
      savedFachobjekteRef.current = {
        identifier: { ...selectedFeatureId },
        rawFeature: rawFeature ?? null,
      };
    }

    // Clear current selection to prevent stale infobox bleed-through
    clearMapSelection();
    setOverrideSelectedFeature(null);
    setFetchedFeatureData(null);

    // Restore incoming variant's selection
    if (sidebarVariant === "fachobjekte") {
      const saved = savedFachobjekteRef.current;
      if (saved?.identifier) {
        // Re-trigger selection pipeline; the override path handles
        // the infobox when the feature is not visible on the map.
        selectFeature(saved.identifier, saved.rawFeature);
      }
    } else if (sidebarVariant === "arbeitsauftraege") {
      // AA state persists in Redux — re-select on map if present
      const state = store.getState();
      const aaId = state.arbeitsauftraege.selectedAAId;
      const aaTab = state.arbeitsauftraege.activeAATab;
      if (aaId != null && aaTab === "aa") {
        handleAAFeatureSelect(aaId);
      }
    }
  }, [sidebarVariant]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear map selection when the user switches to a different team so the
  // info box doesn't show stale data from the previous team.
  const prevTeamIdRef = useRef(selectedTeamId);
  const teamVersionRef = useRef(0);
  useEffect(() => {
    const prev = prevTeamIdRef.current;
    prevTeamIdRef.current = selectedTeamId;
    // Only clear when switching from one real team to another real team.
    // Skip null ↔ value transitions (draft mode enter/exit).
    if (prev != null && selectedTeamId != null && prev !== selectedTeamId) {
      teamVersionRef.current += 1;
      clearMapSelection();
      setOverrideSelectedFeature(null);
    }
  }, [selectedTeamId]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Arbeitsauftraege: GraphQL fetch when team is selected ---
  useEffect(() => {
    if (sidebarVariant !== "arbeitsauftraege" || selectedTeamId == null || !jwt)
      return;

    let cancelled = false;

    // Clear old features immediately so stale data is not shown on the map
    // while new data is being fetched for the newly selected team.
    dispatch(setAAFeatures([]));

    const fetchData = async () => {
      dispatch(setGraphqlLoading(true));
      dispatch(setGraphqlError(null));
      try {
        const raw = await fetchArbeitsauftraegeByTeam(jwt, selectedTeamId);
        if (cancelled) return;
        const features = transformGqlToTileFeatures(
          raw as Record<string, unknown>[]
        );
        dispatch(setAAFeatures(features));
        if (activeAATab !== "ap") {
          fitAABounds(features, map);
        }
      } catch (err) {
        if (cancelled) return;
        dispatch(
          setGraphqlError(err instanceof Error ? err.message : "Unknown error")
        );
      } finally {
        if (!cancelled) dispatch(setGraphqlLoading(false));
      }
    };

    void fetchData();

    return () => {
      cancelled = true;
    };
  }, [sidebarVariant, selectedTeamId, jwt, dispatch, featureDataVersion]);

  // --- Arbeitsauftraege: fit map bounds after a search returns results ---
  // Keeps a ref to aaFeatures so the effect only fires on a fresh search
  // (bumped version), not on every feature mutation while searchActive is true.
  const aaFeaturesRef = useRef(aaFeatures);
  useEffect(() => {
    aaFeaturesRef.current = aaFeatures;
  }, [aaFeatures]);
  useEffect(() => {
    if (searchResultsVersion === 0) return;
    if (activeAATab === "ap") return;
    fitAABounds(aaFeaturesRef.current, map);
  }, [searchResultsVersion, map, activeAATab]);

  // --- Arbeitsauftraege: GraphQL fetch draft AAs by IDs when in draft mode ---
  useEffect(() => {
    if (
      sidebarVariant !== "arbeitsauftraege" ||
      !draftMode ||
      !draftAAIdSet ||
      !jwt
    )
      return;
    const ids = [...draftAAIdSet];
    if (ids.length === 0) {
      return;
    }

    let cancelled = false;

    const fetchData = async () => {
      dispatch(setGraphqlLoading(true));
      dispatch(setGraphqlError(null));
      try {
        const raw = await fetchArbeitsauftraegeByIds(jwt, ids);
        if (cancelled) return;
        const features = transformGqlToTileFeatures(
          raw as Record<string, unknown>[]
        );
        dispatch(setAAFeatures(features));
      } catch (err) {
        if (cancelled) return;
        dispatch(
          setGraphqlError(err instanceof Error ? err.message : "Unknown error")
        );
      } finally {
        if (!cancelled) dispatch(setGraphqlLoading(false));
      }
    };

    void fetchData();

    return () => {
      cancelled = true;
    };
  }, [sidebarVariant, draftMode, draftAAIdSet, jwt, dispatch]);

  // --- Arbeitsauftraege: selection feature-state on map ---
  const prevAAIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (sidebarVariant !== "arbeitsauftraege" || !map) return;

    const prevId = prevAAIdRef.current;
    if (prevId != null && prevId !== selectedAAId) {
      try {
        map.setFeatureState(
          { source: AA_SOURCE, id: prevId },
          { selected: false }
        );
      } catch {
        // ignore
      }
    }
    if (selectedAAId != null) {
      try {
        map.setFeatureState(
          { source: AA_SOURCE, id: selectedAAId },
          { selected: true }
        );
      } catch {
        // ignore
      }
    }
    prevAAIdRef.current = selectedAAId;
  }, [sidebarVariant, map, selectedAAId]);

  // --- Arbeitsauftraege: clear stale selection when AA disappears from features ---
  useEffect(() => {
    if (
      sidebarVariant !== "arbeitsauftraege" ||
      selectedAAId == null ||
      aaGraphqlLoading // don't clear while features are being fetched (team switch / refetch)
    )
      return;
    if (!aaFeatures.some((f) => f.id === selectedAAId)) {
      dispatch(clearSelection());
    }
  }, [sidebarVariant, aaFeatures, selectedAAId, aaGraphqlLoading, dispatch]);

  // --- Arbeitsauftraege: fetch GraphQL detail on selection ---
  useEffect(() => {
    if (selectedAAId == null || !jwt) {
      dispatch(setSelectedAAData(null));
      return;
    }
    dispatch(setAALoading(true));
    dispatch(setAAError(null));
    fetchArbeitsauftragById(jwt, selectedAAId)
      .then((data) => dispatch(setSelectedAAData(data)))
      .catch((err: Error) => dispatch(setAAError(err.message)))
      .finally(() => dispatch(setAALoading(false)));
  }, [selectedAAId, jwt, dispatch, featureDataVersion]);

  // --- Arbeitsauftraege: clear selection on empty map click ---
  useEffect(() => {
    if (sidebarVariant !== "arbeitsauftraege" || !map) return;

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const hits = map.queryRenderedFeatures(e.point);

      if (activeAATab === "ap") {
        // In AP mode: select clicked AP feature
        const apHit = hits.find((h) => h.source === AP_SOURCE);
        if (apHit) {
          const apId = apHit.properties?.id as number | undefined;
          if (apId != null) dispatch(setSelectedAPId(apId));
        } else {
          dispatch(setSelectedAPId(null));
        }
        return;
      }

      // In AA mode: clear on empty click
      const hasRelevant = hits.some(
        (h) => h.source === AA_SOURCE || h.source === AP_SOURCE
      );
      if (!hasRelevant) {
        dispatch(clearSelection());
        setOverrideSelectedFeature(null);
      }
    };

    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
    };
  }, [sidebarVariant, activeAATab, map, dispatch]);

  // --- Arbeitsauftraege: AA GeoJSON layer constants ---
  const AA_SOURCE = "aa-features-source";
  const AA_FILL_LAYER = "aa-geojson-fill";
  const AA_OUTLINE_LAYER = "aa-geojson-outline";
  const AA_SELECTION_LAYER = "aa-geojson-selection";

  // --- Arbeitsauftraege: render AA convex hull polygons from client-side GeoJSON ---
  useEffect(() => {
    if (!map || !mapReady) return;

    const addedLayerIds: string[] = [];

    const removeLayers = () => {
      try {
        for (const id of addedLayerIds) {
          if (map.getLayer(id)) map.removeLayer(id);
        }
        if (map.getSource(AA_SOURCE)) map.removeSource(AA_SOURCE);
      } catch {
        // layers/source may not exist
      }
    };

    const shouldShow =
      sidebarVariant === "arbeitsauftraege" && activeAATab !== "ap";

    if (!shouldShow) {
      removeLayers();
      return removeLayers;
    }

    const visibleAA = draftAAIdSet
      ? aaFeatures.filter((f) => draftAAIdSet.has(f.id))
      : aaFeatures;
    const geojson = buildAAFeatureCollection(visibleAA);

    const existing = map.getSource(AA_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (existing) {
      existing.setData(geojson);
    } else {
      map.addSource(AA_SOURCE, {
        type: "geojson",
        data: geojson,
        promoteId: "id",
      });
    }

    if (!map.getLayer(AA_FILL_LAYER)) {
      map.addLayer({
        id: AA_FILL_LAYER,
        type: "fill",
        source: AA_SOURCE,
        paint: AA_LAYER_STYLES.fill,
      });
      addedLayerIds.push(AA_FILL_LAYER);
    }

    if (!map.getLayer(AA_OUTLINE_LAYER)) {
      map.addLayer({
        id: AA_OUTLINE_LAYER,
        type: "line",
        source: AA_SOURCE,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: AA_LAYER_STYLES.outline,
      });
      addedLayerIds.push(AA_OUTLINE_LAYER);
    }

    if (!map.getLayer(AA_SELECTION_LAYER)) {
      map.addLayer({
        id: AA_SELECTION_LAYER,
        type: "line",
        source: AA_SOURCE,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: AA_LAYER_STYLES.selection,
      });
      addedLayerIds.push(AA_SELECTION_LAYER);
    }

    return removeLayers;
  }, [map, mapReady, sidebarVariant, activeAATab, aaFeatures, draftAAIdSet]);

  // --- Arbeitsauftraege: show AP Fachobjekte on map when AP tab is active ---
  // Map debug layer source-layer names to featureType property values in AP GeoJSON
  const AP_SOURCE = "ap-features-source";
  const AP_LAYER_PREFIX = "ap-";
  const SOURCE_LAYER_TO_FEATURE_TYPE_AP: Record<string, string> = {
    leuchten: "tdta_leuchten",
    mast: "tdta_standort_mast",
    leitungen: "leitung",
    schaltstelle: "schaltstelle",
    mauerlaschen: "mauerlasche",
    abzweigdosen: "abzweigdose",
  };

  // Build GeoJSON from AP drafts + deletion-marked APs for draft mode map rendering
  const apDraftGeoJson = useMemo((): GeoJSON.FeatureCollection => {
    const currentAAId = selectedAAId != null ? String(selectedAAId) : null;
    if (!currentAAId) return { type: "FeatureCollection", features: [] };

    const features: GeoJSON.Feature[] = [];
    const seenIds = new Set<number>();

    for (const [id, d] of Object.entries(apDrafts)) {
      if (d.aaId !== currentAAId) continue;
      seenIds.add(Number(id));
      let geometry = d.geometry ?? null;
      let featureType = d.featureType ?? "tdta_standort_mast";

      // Fallback: extract geometry from serverData snapshot
      if (!geometry && d.serverData) {
        const extracted = extractGeometry(
          d.serverData as Record<string, unknown>
        );
        if (extracted) {
          geometry = extracted.geometry;
          featureType = extracted.featureType;
        }
      }

      if (!geometry) continue;

      features.push({
        type: "Feature" as const,
        geometry,
        properties: {
          id: Number(id),
          featureType,
          protokollnummer: d.meta?.protokollnummer ?? id,
          shortname: d.meta?.shortname ?? d.meta?.fachobjektType ?? "",
          veranlassung: d.meta?.veranlassung ?? "",
          headerColor: d.meta?.headerColor ?? "#9CA3AF",
          datum: d.meta?.datum ?? "",
        },
      });
    }

    // Add deletion-marked APs not already in apDrafts, using server data
    if (selectedAAData?.ar_protokolleArray) {
      for (const [apId, aaId] of Object.entries(apDeletions)) {
        if (aaId !== currentAAId) continue;
        if (seenIds.has(Number(apId))) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entry = selectedAAData.ar_protokolleArray.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (e: Record<string, any>) => e.arbeitsprotokoll?.id === Number(apId)
        );
        const protokoll = entry?.arbeitsprotokoll;
        if (!protokoll) continue;
        const result = extractGeometry(protokoll);
        if (!result) continue;

        features.push({
          type: "Feature" as const,
          geometry: result.geometry,
          properties: {
            id: Number(apId),
            featureType: result.featureType,
            protokollnummer: protokoll.protokollnummer ?? apId,
            shortname: protokoll.shortname ?? result.featureType,
            veranlassung: protokoll.veranlassung?.bezeichnung ?? "",
            headerColor: getHeaderColorFromStatus(
              protokoll.arbeitsprotokollstatus ?? null
            ),
            datum: protokoll.datum
              ? new Date(protokoll.datum).toLocaleDateString("de-DE", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })
              : "",
          },
        });
      }
    }

    return { type: "FeatureCollection", features };
  }, [apDrafts, apDeletions, selectedAAData, selectedAAId]);

  useEffect(() => {
    if (!map || !mapReady) return;

    const addedLayerIds: string[] = [];

    const removeLayers = () => {
      try {
        for (const id of addedLayerIds) {
          if (map.getLayer(id)) map.removeLayer(id);
        }
        if (map.getSource(AP_SOURCE)) map.removeSource(AP_SOURCE);
      } catch {
        // layers/source may not exist
      }
    };

    // Show AP features when: normal mode with AP tab + selected AA, or draft mode with AP tab
    const shouldShowNormal =
      sidebarVariant === "arbeitsauftraege" &&
      activeAATab === "ap" &&
      !draftMode &&
      selectedAAData != null;
    const shouldShowDraft =
      sidebarVariant === "arbeitsauftraege" &&
      activeAATab === "ap" &&
      draftMode;

    if (!shouldShowNormal && !shouldShowDraft) {
      removeLayers();
      return removeLayers;
    }

    const geojson = shouldShowDraft
      ? apDraftGeoJson
      : buildApGeoJson(selectedAAData);

    // Add or update the GeoJSON source
    const existing = map.getSource(AP_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (existing) {
      existing.setData(geojson);
    } else {
      map.addSource(AP_SOURCE, {
        type: "geojson",
        data: geojson,
        promoteId: "id",
      });
    }

    // Fit map to the bounding box of all AP features
    if (geojson.features.length > 0) {
      let minLng = Infinity;
      let minLat = Infinity;
      let maxLng = -Infinity;
      let maxLat = -Infinity;

      for (const feature of geojson.features) {
        const geom = feature.geometry;
        if (!geom) continue;
        const flatCoords: number[][] =
          geom.type === "Point"
            ? [(geom as GeoJSON.Point).coordinates]
            : geom.type === "LineString"
            ? (geom as GeoJSON.LineString).coordinates
            : geom.type === "MultiLineString"
            ? (geom as GeoJSON.MultiLineString).coordinates.flat()
            : [];
        for (const [lng, lat] of flatCoords) {
          if (lng < minLng) minLng = lng;
          if (lat < minLat) minLat = lat;
          if (lng > maxLng) maxLng = lng;
          if (lat > maxLat) maxLat = lat;
        }
      }

      if (minLng !== Infinity) {
        map.fitBounds(
          [
            [minLng, minLat],
            [maxLng, maxLat],
          ],
          { padding: 60 }
        );
      }
    }

    // Add layers derived from protocolsLayers, rewritten for the AP GeoJSON source
    for (const layer of protocolsLayers) {
      const sourceLayer =
        "source-layer" in layer
          ? ((layer as Record<string, unknown>)["source-layer"] as string)
          : undefined;
      const featureType = sourceLayer
        ? SOURCE_LAYER_TO_FEATURE_TYPE_AP[sourceLayer]
        : undefined;
      if (!featureType) continue;

      const apLayerId = `${AP_LAYER_PREFIX}${layer.id}`;
      if (map.getLayer(apLayerId)) continue;

      // Clone the layer spec, replacing source and adding featureType filter
      const apLayer = {
        ...layer,
        id: apLayerId,
        source: AP_SOURCE,
        filter: ["==", ["get", "featureType"], featureType],
      };
      // Remove source-layer (not applicable for GeoJSON)
      delete (apLayer as Record<string, unknown>)["source-layer"];

      map.addLayer(apLayer as maplibregl.LayerSpecification);
      addedLayerIds.push(apLayerId);
    }

    return removeLayers;
  }, [
    map,
    mapReady,
    sidebarVariant,
    activeAATab,
    selectedAAData,
    draftMode,
    apDraftGeoJson,
  ]);

  // Mini-map state
  const [miniMap, setMiniMap] = useState<maplibregl.Map | null>(null);
  const [miniMapDebugInfo, setMiniMapDebugInfo] = useState<{
    zoom: number;
    center: [number, number];
  } | null>(null);
  useEffect(() => {
    if (!miniMap) {
      setMiniMapDebugInfo(null);
      return;
    }
    const update = () => {
      const c = miniMap.getCenter();
      setMiniMapDebugInfo({
        zoom: miniMap.getZoom(),
        center: [c.lng, c.lat],
      });
    };
    update();
    miniMap.on("moveend", update);
    miniMap.on("zoomend", update);
    return () => {
      miniMap.off("moveend", update);
      miniMap.off("zoomend", update);
    };
  }, [miniMap]);
  const [miniMapReady, setMiniMapReady] = useState(false);
  useEffect(() => {
    if (!miniMap) {
      setMiniMapReady(false);
      return;
    }
    if (miniMap.isStyleLoaded()) {
      setMiniMapReady(true);
      return;
    }
    const onLoad = () => setMiniMapReady(true);
    miniMap.once("load", onLoad);
    return () => {
      miniMap.off("load", onLoad);
    };
  }, [miniMap]);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const {
    containerStyle,
    debugOutlineStyle,
    showCloseButton,
    miniMapContainerRef,
  } = useDatasheetMiniMap({
    mainMap: map,
    // #606: Pass null to disable the hook's center/zoom sync effects in AA mode,
    // so the AP overlay's fitBounds (below) controls the minimap view instead.
    miniMap:
      sidebarVariant === "arbeitsauftraege" && selectedAAData ? null : miniMap,
    containerRef: mapContainerRef,
    debug: MINI_MAP_DEBUGGING,
    // Share the same animation duration as the AA fitBounds calls below.
    transitionMs: MINI_MAP_TRANSITION_MS,
    // Fixed zoom: every feature selection eases to this level; user can
    // adjust temporarily via mousewheel, but the next selection resets.
    targetZoom: MINI_MAP_TARGET_ZOOM,
  });

  const handleMiniMapReady = useCallback((m: maplibregl.Map) => {
    // Disable terrain on the minimap. Terrain causes getZoom() to report
    // incorrect values because MapLibre recalculates zoom from the
    // camera-to-terrain-surface distance instead of the requested zoom.
    const disableTerrain = () => {
      try {
        m.setTerrain(null);
      } catch {
        /* style not ready */
      }
    };
    if (m.isStyleLoaded()) {
      disableTerrain();
    } else {
      m.once("styledata", disableTerrain);
    }
    setMiniMap(m);
  }, []);

  // Hide Fachobjekte layers on the mini map when in Arbeitsaufträge mode,
  // and restore them when switching back.
  useEffect(() => {
    if (!miniMap || !miniMapReady) return;

    const setVisibility = (visible: boolean) => {
      for (const layer of miniMap.getStyle()?.layers ?? []) {
        if ("source" in layer && layer.source === namespacedSource) {
          try {
            miniMap.setLayoutProperty(
              layer.id,
              "visibility",
              visible ? "visible" : "none"
            );
          } catch {
            /* layer may not be ready */
          }
        }
      }
    };

    if (sidebarVariant === "arbeitsauftraege") {
      setVisibility(false);
      const hide = () => setVisibility(false);
      miniMap.on("styledata", hide);
      return () => {
        miniMap.off("styledata", hide);
      };
    } else {
      setVisibility(true);
    }
  }, [sidebarVariant, miniMap, miniMapReady, namespacedSource]);

  // --- Main map: render every open creation draft alongside the server-side
  // brandnew FC in the brandnew GeoJSON source, so in-progress drafts show on
  // the map styled by the brandnew per-type layers (which filter on
  // properties._sourceLayer — stamped by buildSyntheticFeature). Mirrors the
  // mini-map effect below. useBrandnewFcSync feeds `brandnewSource` with the
  // server FC only; this effect re-merges the open drafts on top whenever
  // either side changes. ---
  useEffect(() => {
    if (!map || !mapReady || !brandnewLayerEnabled) return;
    const src = map.getSource(brandnewSource) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!src || typeof src.setData !== "function") return;

    const features: GeoJSON.Feature[] = [...visibleBrandnewFeatures];
    for (const feature of draftBrandnewFeatures) {
      if (!feature.geometry) continue;
      // Numeric feature id so MapLibre can attach selection feature-state
      // (geojson sources reject string ids). properties.id stays the key.
      features.push({
        ...feature,
        id: draftFeatureStateId(String(feature.properties?.id)),
      } as unknown as GeoJSON.Feature);
    }
    src.setData({ type: "FeatureCollection", features });
  }, [
    map,
    mapReady,
    brandnewLayerEnabled,
    brandnewSource,
    draftBrandnewFeatures,
    visibleBrandnewFeatures,
  ]);

  // --- Z-order fix: the brandnew sub-style is added after the styleY (regular)
  // sub-style, so by default every brandnew layer stacks above every regular
  // layer — a draft Leitung ends up covering real Leuchten markers. Move the
  // brandnew content layers to just before `leuchten-selection` (the first
  // Leuchten symbol layer in styleY.json) so drafts sit under all Leuchten/
  // Standorte/etc. but still above regular Leitungen. ---
  useEffect(() => {
    if (!map || !mapReady) return;
    const beforeId = `${slugifyUrl(BELIS_STYLE_URL)}::leuchten-selection`;
    const reorder = () => {
      if (!map.getLayer(beforeId)) return;
      const allLayers = map.getStyle()?.layers ?? [];
      const beforeIdx = allLayers.findIndex((l) => l.id === beforeId);
      if (beforeIdx < 0) return;
      // Skip when nothing is out of place — moveLayer triggers styledata,
      // so without this guard the handler would re-fire forever.
      let needsMove = false;
      for (let i = beforeIdx; i < allLayers.length; i++) {
        const l = allLayers[i];
        if ("source" in l && l.source === brandnewSource) {
          needsMove = true;
          break;
        }
      }
      if (!needsMove) return;
      for (const layer of allLayers) {
        if ("source" in layer && layer.source === brandnewSource) {
          try {
            map.moveLayer(layer.id, beforeId);
          } catch {
            /* layer may have been removed mid-reorder */
          }
        }
      }
    };
    reorder();
    map.on("styledata", reorder);
    return () => {
      map.off("styledata", reorder);
    };
  }, [map, mapReady, brandnewSource]);

  // --- Mini-map: push every open creation draft AND the server-side brandnew
  // FC into the brandnew GeoJSON source so they render together with the
  // brandnew style's per-type layers, matching the main map's brandnew group.
  // The main map's brandnew source is fed by useBrandnewFcSync directly and
  // is untouched by this effect; we mirror its latest payload here via
  // `brandnewFc` so saved brandnew features stay visible on the mini-map
  // after the draft is removed from Redux. ---
  useEffect(() => {
    if (!miniMap || !miniMapReady) return;
    const src = miniMap.getSource(brandnewSource) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!src || typeof src.setData !== "function") return;

    const features: GeoJSON.Feature[] = [...visibleBrandnewFeatures];
    for (const feature of draftBrandnewFeatures) {
      if (!feature.geometry) continue;
      // Numeric feature id so MapLibre can attach selection feature-state
      // (geojson sources reject string ids). properties.id stays the key.
      features.push({
        ...feature,
        id: draftFeatureStateId(String(feature.properties?.id)),
      } as unknown as GeoJSON.Feature);
    }
    src.setData({ type: "FeatureCollection", features });
  }, [
    miniMap,
    miniMapReady,
    brandnewSource,
    draftBrandnewFeatures,
    visibleBrandnewFeatures,
  ]);

  // Mini-map counterpart of the main-map hidden-IDs filter effect — keeps the
  // mini map's regular vector-tile layers in sync with hiddenOriginalIds.
  useEffect(() => {
    if (!miniMap || !miniMapReady) return;
    applyHiddenIdsFilter(miniMap, hiddenIdsTouchedMiniRef.current);
  }, [miniMap, miniMapReady, applyHiddenIdsFilter]);

  // --- Mini-map: render AA convex hull polygons from client-side GeoJSON ---
  // AA convex-hull polygons are no longer shown on the mini map;
  // the AP overlay is displayed instead regardless of the active tab.
  const MINI_AA_FILL = "mini-aa-fill";
  const MINI_AA_OUTLINE = "mini-aa-outline";
  useEffect(() => {
    if (!miniMap || !miniMapReady) return;

    const addedLayerIds: string[] = [];

    const removeLayers = () => {
      try {
        for (const id of addedLayerIds) {
          if (miniMap.getLayer(id)) miniMap.removeLayer(id);
        }
        if (miniMap.getSource(AA_SOURCE)) miniMap.removeSource(AA_SOURCE);
      } catch {
        // ignore
      }
    };

    removeLayers();
    return removeLayers;

    /* AA overlay disabled — keeping dead code below for reference
    const shouldShow =
      sidebarVariant === "arbeitsauftraege" && activeAATab !== "ap";

    if (!shouldShow) {
      removeLayers();
      return removeLayers;
    }
    */

    const visibleAA = draftAAIdSet
      ? aaFeatures.filter((f) => draftAAIdSet.has(f.id))
      : aaFeatures;
    const geojson = buildAAFeatureCollection(visibleAA);

    const existing = miniMap.getSource(AA_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (existing) {
      existing.setData(geojson);
    } else {
      miniMap.addSource(AA_SOURCE, {
        type: "geojson",
        data: geojson,
        promoteId: "id",
      });
    }

    if (!miniMap.getLayer(MINI_AA_FILL)) {
      miniMap.addLayer({
        id: MINI_AA_FILL,
        type: "fill",
        source: AA_SOURCE,
        paint: { "fill-color": "#E74C4C", "fill-opacity": 0.45 },
      });
      addedLayerIds.push(MINI_AA_FILL);
    }

    if (!miniMap.getLayer(MINI_AA_OUTLINE)) {
      miniMap.addLayer({
        id: MINI_AA_OUTLINE,
        type: "line",
        source: AA_SOURCE,
        paint: { "line-color": "#C0392B", "line-width": 1 },
      });
      addedLayerIds.push(MINI_AA_OUTLINE);
    }

    return removeLayers;
  }, [
    miniMap,
    miniMapReady,
    sidebarVariant,
    activeAATab,
    aaFeatures,
    draftAAIdSet,
  ]);

  // --- Mini-map: add AP GeoJSON overlay when in AP tab ---
  const MINI_AP_LAYER_PREFIX = "mini-ap-";
  useEffect(() => {
    if (!miniMap || !miniMapReady) return;

    const addedLayerIds: string[] = [];

    const removeLayers = () => {
      try {
        for (const id of addedLayerIds) {
          if (miniMap.getLayer(id)) miniMap.removeLayer(id);
        }
        if (miniMap.getSource(AP_SOURCE)) miniMap.removeSource(AP_SOURCE);
      } catch {
        // layers/source may not exist
      }
    };

    const shouldShow =
      sidebarVariant === "arbeitsauftraege" && selectedAAData != null;

    if (!shouldShow) {
      removeLayers();
      return removeLayers;
    }

    const geojson = buildApGeoJson(selectedAAData);

    const existing = miniMap.getSource(AP_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (existing) {
      existing.setData(geojson);
    } else {
      miniMap.addSource(AP_SOURCE, {
        type: "geojson",
        data: geojson,
        promoteId: "id",
      });
    }

    for (const layer of protocolsLayers) {
      const sourceLayer =
        "source-layer" in layer
          ? ((layer as Record<string, unknown>)["source-layer"] as string)
          : undefined;
      const featureType = sourceLayer
        ? SOURCE_LAYER_TO_FEATURE_TYPE_AP[sourceLayer]
        : undefined;
      if (!featureType) continue;

      const apLayerId = `${MINI_AP_LAYER_PREFIX}${layer.id}`;
      if (miniMap.getLayer(apLayerId)) continue;

      const apLayer = {
        ...layer,
        id: apLayerId,
        source: AP_SOURCE,
        filter: ["==", ["get", "featureType"], featureType],
      };
      delete (apLayer as Record<string, unknown>)["source-layer"];

      miniMap.addLayer(apLayer as maplibregl.LayerSpecification);
      addedLayerIds.push(apLayerId);
    }

    // Fit mini map to all AP features
    if (geojson.features.length > 0) {
      let minLng = Infinity,
        minLat = Infinity,
        maxLng = -Infinity,
        maxLat = -Infinity;
      for (const feature of geojson.features) {
        const geom = feature.geometry;
        if (!geom) continue;
        const flatCoords: number[][] =
          geom.type === "Point"
            ? [(geom as GeoJSON.Point).coordinates]
            : geom.type === "LineString"
            ? (geom as GeoJSON.LineString).coordinates
            : geom.type === "MultiLineString"
            ? (geom as GeoJSON.MultiLineString).coordinates.flat()
            : [];
        for (const [lng, lat] of flatCoords) {
          if (lng < minLng) minLng = lng;
          if (lat < minLat) minLat = lat;
          if (lng > maxLng) maxLng = lng;
          if (lat > maxLat) maxLat = lat;
        }
      }
      if (minLng !== Infinity) {
        miniMap.fitBounds(
          [
            [minLng, minLat],
            [maxLng, maxLat],
          ],
          // Match the Fachobjekte mini-map's transition so switching AP rows
          // feels as snappy. Without `duration`, MapLibre defaults to 1000ms,
          // which felt sluggish vs. useDatasheetMiniMap's 200ms easeTo.
          {
            padding: 40,
            maxZoom: MINI_MAP_TARGET_ZOOM,
            duration: MINI_MAP_TRANSITION_MS,
          }
        );
      }
    }

    return removeLayers;
  }, [miniMap, miniMapReady, sidebarVariant, activeAATab, selectedAAData]);

  // --- Mini-map: sync AP feature-state selection + fly to selected AP ---
  const prevMiniAPIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!miniMap) return;

    if (
      prevMiniAPIdRef.current != null &&
      prevMiniAPIdRef.current !== selectedAPId
    ) {
      try {
        miniMap.setFeatureState(
          { source: AP_SOURCE, id: prevMiniAPIdRef.current },
          { selected: false }
        );
      } catch {
        // source may not exist
      }
    }
    prevMiniAPIdRef.current = selectedAPId;

    if (selectedAPId == null) return;

    try {
      miniMap.setFeatureState(
        { source: AP_SOURCE, id: selectedAPId },
        { selected: true }
      );
    } catch {
      // source may not exist yet
    }

    // Only fly the mini map when on the AP tab (sidebar or double-click).
    // When on the AA tab (single-click from Protokolle table), just highlight.
    if (activeAATab === "ap") {
      const geojson = draftMode
        ? apDraftGeoJson
        : selectedAAData
        ? buildApGeoJson(selectedAAData)
        : null;
      const feature = geojson?.features.find(
        (f) => f.properties?.id === selectedAPId
      );
      if (feature?.geometry) {
        const geom = feature.geometry;
        const flatCoords: number[][] =
          geom.type === "Point"
            ? [(geom as GeoJSON.Point).coordinates]
            : geom.type === "LineString"
            ? (geom as GeoJSON.LineString).coordinates
            : geom.type === "MultiLineString"
            ? (geom as GeoJSON.MultiLineString).coordinates.flat()
            : [];
        if (flatCoords.length > 0) {
          let minLng = Infinity,
            minLat = Infinity,
            maxLng = -Infinity,
            maxLat = -Infinity;
          for (const [lng, lat] of flatCoords) {
            if (lng < minLng) minLng = lng;
            if (lat < minLat) minLat = lat;
            if (lng > maxLng) maxLng = lng;
            if (lat > maxLat) maxLat = lat;
          }
          miniMap.fitBounds(
            [
              [minLng, minLat],
              [maxLng, maxLat],
            ],
            {
              padding: 40,
              maxZoom: MINI_MAP_TARGET_ZOOM,
              duration: MINI_MAP_TRANSITION_MS,
            }
          );
        }
      }
    }
  }, [
    miniMap,
    selectedAPId,
    selectedAAData,
    draftMode,
    apDraftGeoJson,
    activeAATab,
  ]);

  // --- Mini-map: mousewheel zoom in AA mode ---
  // The useDatasheetMiniMap hook's wheel handler is disabled in AA mode
  // (miniMap is passed as null), so we add our own here.
  useEffect(() => {
    const el = miniMapContainerRef.current;
    if (!el || !miniMap || sidebarVariant !== "arbeitsauftraege") return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY / 300;
      const current = miniMap.getZoom();
      miniMap.jumpTo({ zoom: Math.max(1, Math.min(22, current + delta)) });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, [miniMap, sidebarVariant, miniMapContainerRef]);

  // Build infobox override for AA features.
  // Always uses the override path because the AA GeoJSON source has no
  // createInfoBoxInfo metadata — selectFeature() would produce an empty infobox.
  // Visual highlighting on the map is handled by the feature-state effect (selectedAAId).
  const handleAAFeatureSelect = useCallback(
    (aaId: number) => {
      // Clear any existing map selection so the override takes precedence
      clearMapSelection();

      const aaFeature = aaFeatures.find((f) => f.id === aaId);
      if (!aaFeature) return;

      const mappingCode = aaInfoboxMapping.join("\n");
      const versionAtStart = teamVersionRef.current;
      objectToInfo(aaFeature as unknown as Record<string, unknown>, mappingCode)
        .then((info) => {
          // Team changed while async — discard stale result
          if (teamVersionRef.current !== versionAtStart) return;
          if (info) {
            const genericLinks: {
              iconname: string;
              tooltip: string;
              action?: () => void;
            }[] = [];
            if ((info as Record<string, unknown>).datasheet && openDatasheet) {
              genericLinks.push({
                iconname: "info",
                tooltip: "Datenblatt",
                action: openDatasheet,
              });
            }
            setOverrideSelectedFeature({
              properties: { ...info, genericLinks },
              geometry: aaFeature.geometry,
              carmaInfo: { sourceLayer: "arbeitsauftraege" },
            });
          }
        })
        .catch(() => {
          // ignore
        });
    },
    [aaFeatures, clearMapSelection]
  );

  // #554: Deterministic click selection: prefer standorte over leuchten
  // (Previous logic preferred leuchten, sorted by leuchtennummer:)
  // const leuchten = hits.filter((h) => h.sourceLayer === "leuchten");
  // if (leuchten.length > 0) {
  //   return leuchten.sort(
  //     (a, b) =>
  //       Number(a.properties?.leuchtennummer ?? 0) -
  //       Number(b.properties?.leuchtennummer ?? 0)
  //   )[0];
  // }
  const handleSelectFromHits = useCallback(
    (hits: maplibregl.MapGeoJSONFeature[]) => {
      // Arbeitsauftraege: intercept clicks on AA polygon layers
      if (sidebarVariant === "arbeitsauftraege") {
        const aaHit = hits.find((h) => h.source === AA_SOURCE);
        if (aaHit) {
          const aaId = Number(aaHit.properties?.id ?? aaHit.id);
          if (aaId != null) {
            dispatch(setSelectedAAId(aaId));
            handleAAFeatureSelect(aaId);
          }
          // Return undefined to prevent normal selection flow
          return undefined;
        }
        // Non-AA feature clicked while in AA mode — ignore
        return undefined;
      }

      // Creation drafts (features made via the Fachobjekte "+" menu) are
      // rendered into the brandnew GeoJSON source. Clicking such an icon
      // should select the draft in the Entwürfe sidebar tab — the same
      // outcome as clicking its row there. No Datenblatt is opened.
      // Server brandnew features lack `_isCreation`, so they are unaffected.
      const creationHit = hits.find((h) => h.properties?._isCreation === true);
      if (creationHit) {
        // Leuchten drafts render on the map as a synthetic Standort whose own
        // `properties.id` is `${draftKey}::standort`. The original draft key
        // is stamped on `_draftKey` (see buildLeuchteDraftStandortFeature),
        // so prefer it; for other creation types both fields agree.
        const draftKey = String(
          creationHit.properties?._draftKey ??
            creationHit.properties?.id ??
            creationHit.id
        );
        const draftFeature = allDraftFeatures.find(
          ({ feature }) =>
            feature?.properties?._isCreation === true &&
            String(feature.properties.id) === draftKey
        )?.feature;
        if (draftFeature) {
          // Mirror handleSidebarFeatureSelect's creation-draft branch:
          // open the Entwürfe tab and set the Redux selection. Returning
          // the synthetic draft feature lets LibreMap's generic flow run
          // the map-selection context with the draft's own identifier
          // (source ""), identical to a sidebar-row click.
          setSidebarMode("drafts");
          dispatch(setSelectedFeature({ ...draftFeature, selected: true }));
          setFeatureOnMap(true);
          // Steer the Entwürfe sidebar's row highlight. A Leuchte creation
          // draft is one map icon but several sidebar rows (Standort parent
          // + Leuchte children, see expandDraftSidebarFeatures); the raw
          // `selectedFeatureId` carries the bare draft key and matches none
          // of them. Point at the Standort parent row — a Leuchte draft
          // always has exactly one Standort and ≥1 Leuchte, and the user
          // wants the parent (not a specific child) selected on map click.
          // Other creation types expand to a single row whose id already
          // equals the draft key, so clear any stale value.
          const isLeuchteCreation =
            draftFeature.properties?._featureType === "leuchte" ||
            draftFeature.sourceLayer === "leuchten";
          setActiveDraftRow(
            isLeuchteCreation
              ? {
                  sourceLayer: "standorte",
                  id: `${draftKey}::standort`,
                }
              : null
          );
          return draftFeature as unknown as maplibregl.MapGeoJSONFeature;
        }
      }

      // When highlighting is active, prefer highlighted features over non-highlighted ones
      let candidates = hits;
      if (map) {
        const highlighted = hits.filter((h) => {
          if (h.id == null) return false;
          try {
            const state = map.getFeatureState(
              buildFeatureStateTarget(map, {
                source: h.source,
                sourceLayer: h.sourceLayer,
                id: h.id,
              })
            );
            return state?.highlighted === true;
          } catch {
            return false;
          }
        });
        if (highlighted.length > 0) {
          candidates = highlighted;
        }
      }

      const standorte = candidates.filter((h) => h.sourceLayer === "standorte");
      const chosen = standorte.length > 0 ? standorte[0] : candidates[0];
      // Clicking an existing (non-draft) Fachobjekt while the Entwürfe tab is
      // active means the user wants to inspect that Fachobjekt — the row lives
      // in the Fachobjekte tab. Flip back so the selected row becomes visible.
      // Functional setState keeps `sidebarMode` out of the callback deps.
      if (chosen) {
        setSidebarMode((prev) => (prev === "drafts" ? "fachobjekte" : prev));
      }
      return chosen;
    },
    [map, sidebarVariant, dispatch, handleAAFeatureSelect, allDraftFeatures]
  );

  // --- Arbeitsauftraege: clear/restore map selection when switching tabs ---
  useEffect(() => {
    if (sidebarVariant !== "arbeitsauftraege") return;

    if (activeAATab === "ap") {
      clearMapSelection();
      // AP infobox effect will set the override; only clear if no AP is selected
      if (selectedAPId == null) {
        setOverrideSelectedFeature(null);
      }
    } else if (activeAATab === "aa") {
      fitAABounds(aaFeatures, map);
      if (selectedAAId != null) {
        // handleAAFeatureSelect sets the override — don't clear it first
        handleAAFeatureSelect(selectedAAId);
      } else {
        setOverrideSelectedFeature(null);
      }
    }
  }, [activeAATab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear stale AA info-box override when the AA selection is cleared
  // externally (e.g. ArbeitsauftragSearchModal dispatches clearSelection()).
  useEffect(() => {
    if (sidebarVariant !== "arbeitsauftraege") return;
    if (activeAATab !== "aa") return;
    if (selectedAAId == null) {
      setOverrideSelectedFeature(null);
    }
  }, [sidebarVariant, activeAATab, selectedAAId]);

  // --- Main map: reflect the selected creation draft in the brandnew
  // GeoJSON source's `selected` feature-state, so the brandnew style's
  // *-selection layers render the same highlight a regular feature gets.
  // Creation drafts live only in the brandnew source and their
  // map-selection identifier carries source "" — LibreMap's own
  // applyVisualSelection can't reach them. This effect fully owns the
  // draft's feature-state (clearVisualSelection only clears what it
  // tracked itself). Mirrors the AP feature-state effect below. ---
  const prevDraftSelectionRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!map) return;

    const prev = prevDraftSelectionRef.current;
    if (prev && prev !== creationDraftMapId) {
      try {
        map.setFeatureState(
          buildFeatureStateTarget(map, {
            source: brandnewSource,
            id: draftFeatureStateId(prev),
          }),
          { selected: false }
        );
      } catch {
        // source may not exist yet
      }
    }
    prevDraftSelectionRef.current = creationDraftMapId;

    if (!creationDraftMapId) return;

    try {
      map.setFeatureState(
        buildFeatureStateTarget(map, {
          source: brandnewSource,
          id: draftFeatureStateId(creationDraftMapId),
        }),
        { selected: true }
      );
    } catch {
      // source may not exist yet
    }
  }, [map, brandnewSource, creationDraftMapId]);

  // --- Arbeitsauftraege: AP feature-state selection ---
  const prevAPIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!map) return;

    // Deselect previous
    if (prevAPIdRef.current != null && prevAPIdRef.current !== selectedAPId) {
      try {
        map.setFeatureState(
          { source: AP_SOURCE, id: prevAPIdRef.current },
          { selected: false }
        );
      } catch {
        // source may not exist
      }
    }
    prevAPIdRef.current = selectedAPId;

    if (selectedAPId == null) return;

    // Select current
    try {
      map.setFeatureState(
        { source: AP_SOURCE, id: selectedAPId },
        { selected: true }
      );
    } catch {
      // source may not exist yet
    }
  }, [map, selectedAPId]);

  // --- Arbeitsauftraege: build infobox override for selected AP feature ---
  useEffect(() => {
    // Skip when not in Arbeitsaufträge mode (prevents stale AP overrides in Fachobjekte)
    if (sidebarVariant !== "arbeitsauftraege") return;

    // Not on AP tab — return early without clearing (AA handler manages its own override;
    // stale AP override is cleared in the tab-switching effect above)
    if (activeAATab !== "ap") return;
    if (selectedAPId == null) {
      setOverrideSelectedFeature(null);
      return;
    }

    // In draft mode use local draft GeoJSON; in normal mode require server data
    const geojson = draftMode
      ? apDraftGeoJson
      : selectedAAData
      ? buildApGeoJson(selectedAAData)
      : null;
    if (!geojson) {
      setOverrideSelectedFeature(null);
      return;
    }

    const feature = geojson.features.find(
      (f) => f.properties?.id === selectedAPId
    );
    if (!feature?.properties || !feature.geometry) {
      setOverrideSelectedFeature(null);
      return;
    }

    const mappingCode = apInfoboxMapping.join("\n");
    objectToInfo(feature.properties as Record<string, unknown>, mappingCode)
      .then((info) => {
        if (info) {
          const genericLinks: {
            iconname: string;
            tooltip: string;
            action?: () => void;
          }[] = [];
          if ((info as Record<string, unknown>).datasheet && openDatasheet) {
            genericLinks.push({
              iconname: "info",
              tooltip: "Datenblatt",
              action: openDatasheet,
            });
          }
          setOverrideSelectedFeature({
            properties: { ...info, genericLinks },
            geometry: feature.geometry,
            carmaInfo: { sourceLayer: "ap-features" },
          });
        } else {
          setOverrideSelectedFeature(null);
        }
      })
      .catch(() => setOverrideSelectedFeature(null));
  }, [
    activeAATab,
    selectedAPId,
    selectedAAData,
    sidebarVariant,
    draftMode,
    apDraftGeoJson,
  ]);

  const handleReturnToMap = useCallback(() => {
    map?.resize();
  }, [map]);

  // In the Entwürfe tab a Leuchten creation draft spans several rows (Standort
  // parent + nested Leuchten). The primary `selectedFeatureId` only holds the
  // draft key, so steer the sidebar highlight at the specific expanded row
  // tracked in `activeDraftRow`; everywhere else use the primary selection.
  const sidebarSelectedFeatureId = useMemo(() => {
    if (sidebarMode === "drafts" && activeDraftRow) {
      return {
        source: "",
        sourceLayer: activeDraftRow.sourceLayer,
        id: activeDraftRow.id,
      };
    }
    return selectedFeatureId;
  }, [sidebarMode, activeDraftRow, selectedFeatureId]);

  // Database primary key of the selected feature (from tile properties).
  // MVT feature IDs differ from database PKs; Highlights mode uses database PKs.
  const selectedDatabaseId = useMemo(() => {
    return (
      selectedFeature?.properties?.sourceProps?.id ??
      rawFeature?.properties?.id ??
      null
    );
  }, [selectedFeature, rawFeature]);

  // Always pass the raw feature so the mini-map can center on its geometry.
  // LibreMap's external selection watcher will attempt createFeature() via
  // layer-id metadata or source prefix fallback. If it fails, the override
  // path (overrideSelectedFeature) handles the info box display.
  const handleSidebarFeatureSelect = useCallback(
    (
      identifier: {
        source: string;
        sourceLayer?: string;
        id?: string | number;
      },
      feature: SidebarFeature
    ) => {
      // Draft rows now appear in the Fachobjekte tab too (the expanded
      // `draftSidebarFeatures` are spliced into the viewport list). Detect
      // them by the same markers `expandDraftSidebarFeatures` stamps, flip
      // the sidebar into Entwürfe mode so the selected row stays visible in
      // its native context, and route through the existing drafts branch.
      const isDraftRow =
        feature.properties?._isCreation === true ||
        typeof feature.properties?._draftKey === "string";
      if (isDraftRow && sidebarMode !== "drafts") {
        setSidebarMode("drafts");
      }
      if (sidebarMode === "drafts" || isDraftRow) {
        // Expanded Leuchten-draft row (Standort parent / Leuchte child): the
        // row is synthetic, so select the draft's real stored feature and ask
        // the form to focus the tab this row stands for.
        const expandedDraftKey = feature.properties?._draftKey;
        if (typeof expandedDraftKey === "string") {
          const draftState =
            store.getState().featuresForms?.drafts[expandedDraftKey];
          const realFeature = draftState?.feature;
          if (realFeature) {
            const expandedTabKey = feature.properties?._draftTabKey;
            dispatch(setSelectedFeature({ ...realFeature, selected: true }));
            selectFeature(
              {
                source: realFeature.source ?? "",
                sourceLayer: realFeature.sourceLayer ?? "",
                id: expandedDraftKey,
              },
              realFeature as any
            );
            setFeatureOnMap(true);
            if (typeof expandedTabKey === "string" && expandedTabKey) {
              dispatch(
                requestDraftTabFocus({
                  draftKey: expandedDraftKey,
                  tabKey: expandedTabKey,
                })
              );
            }
            setActiveDraftRow({
              sourceLayer: feature.sourceLayer,
              id: feature.id,
            });
            return;
          }
        }

        // Creation drafts have no MVT tile feature — select directly. A
        // Leuchten creation draft expands into a Standort parent + nested
        // Leuchten; when it's selected as a whole (e.g. by handleSelectNextDraft
        // after a delete) highlight its Standort row, the tab it opens on.
        if (feature.properties?._isCreation) {
          const isLeuchteCreation =
            feature.properties?._featureType === "leuchte" ||
            feature.sourceLayer === "leuchten";
          setActiveDraftRow(
            isLeuchteCreation
              ? { sourceLayer: "standorte", id: `${feature.id}::standort` }
              : null
          );
          dispatch(setSelectedFeature({ ...feature, selected: true }));
          selectFeature(identifier, feature as any);
          setFeatureOnMap(true);
          return;
        }

        setActiveDraftRow(null);
        const sl = identifier.sourceLayer ?? "";
        const dbPK = String(feature.properties?.id ?? identifier.id);

        // Try to find the real MVT feature in loaded tiles.
        // This gives us: correct tile ID for visual selection,
        // flat properties for identical titles/subtitles, and geometry.
        if (map) {
          const sourceFeatures = map.querySourceFeatures(namespacedSource, {
            sourceLayer: sl,
          });
          const match = sourceFeatures.find(
            (f) => f.properties && String(f.properties.id) === dbPK
          );
          if (match) {
            selectFeature(
              { source: identifier.source, sourceLayer: sl, id: match.id },
              match as any
            );
            return;
          }
        }

        // Feature not in viewport — dispatch stored raw feature to Redux
        // and pass it as rawFeature for the selection context.
        // The draft feature already has the correct MapGeoJSON structure.
        dispatch(setSelectedFeature({ ...feature, id: dbPK, selected: true }));
        selectFeature(identifier, feature as any);
        return;
      }

      // Normal flow for fachobjekte/highlights
      setActiveDraftRow(null);
      selectFeature(identifier, feature as any);
    },
    [selectFeature, sidebarMode, dispatch, map, namespacedSource, store]
  );

  // After a draft is cancelled/removed, select the next remaining draft.
  // If no drafts remain, clear the selection and close the datasheet.
  const handleSelectNextDraft = useCallback(
    (removedFeatureId: string) => {
      if (sidebarMode !== "drafts") {
        clearMapSelection();
        closeDatasheet();
        return;
      }
      // allDraftFeatures still contains the removed draft at this point
      // because the selector reads from the store snapshot before the next render.
      // Filter it out to get the remaining drafts.
      const remaining = allDraftFeatures.filter(({ feature }) => {
        if (!feature) return false;
        if (feature.properties?._isCreation) {
          return String(feature.properties.id) !== removedFeatureId;
        }
        const sl = feature.sourceLayer ?? "";
        const pk = String(feature.properties?.id ?? "");
        return `${sl}:${pk}` !== removedFeatureId;
      });
      if (remaining.length === 0) {
        clearMapSelection();
        closeDatasheet();
        return;
      }
      const next = remaining[0];
      const f = next.feature;
      handleSidebarFeatureSelect(
        { source: f.source ?? "", sourceLayer: f.sourceLayer ?? "", id: f.id },
        f
      );
    },
    [
      sidebarMode,
      allDraftFeatures,
      handleSidebarFeatureSelect,
      clearMapSelection,
      closeDatasheet,
    ]
  );

  useEffect(() => {
    setOnSelectNextDraft(() => handleSelectNextDraft);
    return () => setOnSelectNextDraft(undefined);
  }, [handleSelectNextDraft, setOnSelectNextDraft]);

  const handleOpenCreationDraft = useCallback(
    (featureType: string, draftKey: string) => {
      // Capture current Fachobjekt selection as parent context so the
      // originating row (e.g. Standort 17) stays highlighted in the
      // Fachobjekte list while the draft becomes the primary selection.
      // Skip if there is no selection or the current selection is itself
      // a draft — otherwise we'd "promote" a draft id to parent.
      if (
        selectedFeatureId &&
        selectedFeatureId.id != null &&
        !isCreationDraftKey(String(selectedFeatureId.id))
      ) {
        setParentFachobjektSelection({
          source: selectedFeatureId.source,
          sourceLayer: selectedFeatureId.sourceLayer,
          id: selectedFeatureId.id,
        });
      }

      const draft = store.getState().featuresForms?.drafts[draftKey];
      const syntheticFeature =
        draft?.feature ??
        buildSyntheticFeature(featureType, draftKey, {}, draft?.geometry);
      const sourceLayer = featureTypeToSourceLayer[featureType] ?? featureType;
      dispatch(setSelectedFeature({ ...syntheticFeature, selected: true }));
      selectFeature(
        { source: "", sourceLayer, id: draftKey },
        syntheticFeature as any
      );
      setFeatureOnMap(true);
      openDatasheet();
      // Show the new draft on the active sidebar tab.
      setSidebarMode("drafts");
      // A new Leuchten draft renders in the Entwürfe list as a Standort parent
      // with nested Leuchten; it opens on the Standort tab, so highlight that
      // row. Other feature types render as a single self-standing row.
      setActiveDraftRow(
        featureType === "leuchte"
          ? { sourceLayer: "standorte", id: `${draftKey}::standort` }
          : null
      );
    },
    [store, dispatch, selectFeature, openDatasheet, selectedFeatureId]
  );

  useEffect(() => {
    setOnOpenCreationDraft(() => handleOpenCreationDraft);
    return () => setOnOpenCreationDraft(undefined);
  }, [handleOpenCreationDraft, setOnOpenCreationDraft]);

  // Keep the ref in sync so the measurement InfoBox's "Entwurf öffnen"
  // action — built earlier in the render via useMemo — can invoke the
  // latest handler.
  useEffect(() => {
    handleOpenCreationDraftRef.current = handleOpenCreationDraft;
  }, [handleOpenCreationDraft]);

  return (
    <div
      className="relative flex"
      style={{ width: mapSizes.width, height: mapSizes.height }}
    >
      {sidebarVariant === "arbeitsauftraege" ? (
        <ArbeitsauftraegeSidebar
          width={LIST_WIDTH}
          onFeatureSelect={handleAAFeatureSelect}
          // Sort options from ../../helper/aaSortHelpers:
          // AA_SORT_BY_DATE_DESC / AA_SORT_BY_DATE_ASC     — by creation date
          // AA_SORT_BY_NUMMER_ASC / AA_SORT_BY_NUMMER_DESC — by AA number
          // AA_SORT_BY_PROTOKOLLE_DESC / _ASC              — by protocol count
          // AA_SORT_BY_TEAM_ASC                            — by team name
          // AA_SORT_BY_ERLEDIGT_DESC                       — by % completed
          // or use { field: "...", direction: "asc"|"desc" } for custom config
          sort={AA_SORT_BY_NUMMER_ASC}
          onProtokollSelect={() => {
            /* fly-to handled by selectedAPId effect */
          }}
        />
      ) : (
        <BelisSidebar
          features={effectiveSidebarData.features}
          countsByLayer={effectiveSidebarData.countsByLayer}
          totalCount={effectiveSidebarData.totalCount}
          isLoading={effectiveSidebarData.isLoading}
          isOverviewMode={effectiveSidebarData.isOverviewMode}
          activeSourceLayers={effectiveSidebarData.activeSourceLayers}
          selectedFeatureId={sidebarSelectedFeatureId}
          selectedDatabaseId={selectedDatabaseId}
          parentFeatureId={parentFachobjektSelection}
          onFeatureSelect={handleSidebarFeatureSelect}
          emptyMessage={
            map
              ? "Keine Objekte im aktuellen Kartenausschnitt"
              : "Karte wird geladen..."
          }
          sidebarMode={sidebarMode}
          onModeChange={setSidebarMode}
          hasHighlights={hasHighlights}
          hasDrafts={draftFeaturesCount > 0}
          fachobjekteCount={totalCount}
          highlightCount={adjustedHighlights?.length ?? undefined}
          draftsCount={draftFeaturesCount}
          onFeatureDismiss={handleSidebarDismiss}
          auswahlActiveSourceLayers={activeSourceLayers}
          namespacedSource={namespacedSource}
          brandnewSource={brandnewSource}
          adjustedHighlights={adjustedHighlights}
          setAdjustedHighlights={setAdjustedHighlights}
          measurements={measurements}
          selectedMeasurementId={selectedMeasurementId}
          onMeasurementSelect={(id) => dispatch(selectMeasurement(id))}
          onMeasurementsDeleteAll={() => {
            // terra-draw owns its internal store; clearing it fires
            // onChange → replaceMeasurements([]) which also wipes redux
            // (and through redux-persist, localForage). Drop any current
            // selection alongside since the selected feature is gone.
            measurementHostRef.current?.clearAll();
            dispatch(selectMeasurement(null));
          }}
        />
      )}
      <div
        ref={mapContainerRef}
        style={{
          position: "relative",
          width: mapWidth,
          height: mapSizes.height,
          overflow: "hidden",
        }}
      >
        {debugOutlineStyle && <div style={debugOutlineStyle} />}
        <div ref={miniMapContainerRef} style={containerStyle}>
          {showCloseButton && (
            <button
              onClick={closeDatasheet}
              title="Zur Karte"
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                zIndex: 10,
                width: 28,
                height: 28,
                borderRadius: "50%",
                border: "none",
                background: "rgba(0,0,0,0.5)",
                color: "#fff",
                fontSize: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <FontAwesomeIcon icon={faMap} />
            </button>
          )}
          <LibreContextProvider>
            <CarmaMap
              mapEngine="maplibre"
              embedded
              miniMap
              overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
              backgroundLayers="basemap_grey@60"
              layerMode="imperative"
              libreLayers={[leuchtenDataLayer, brandNewDataLayer]}
              setLibreMap={handleMiniMapReady}
            />
          </LibreContextProvider>
          {showRaw && miniMapDebugInfo && (
            <div
              style={{
                position: "absolute",
                top: 4,
                left: 4,
                zIndex: 10,
                background: "rgba(255, 255, 0, 0.85)",
                color: "#000",
                fontSize: 10,
                fontFamily: "monospace",
                padding: "2px 5px",
                borderRadius: 3,
                pointerEvents: "none",
                lineHeight: 1.4,
              }}
            >
              z{miniMapDebugInfo.zoom.toFixed(1)}{" "}
              {miniMapDebugInfo.center[0].toFixed(5)},
              {miniMapDebugInfo.center[1].toFixed(5)}
              {miniMap && (
                <>
                  {" "}
                  {miniMap.getCanvas().width}x{miniMap.getCanvas().height}{" "}
                  {(() => {
                    try {
                      return miniMap.getTerrain() ? "TER" : "";
                    } catch {
                      return "";
                    }
                  })()}
                </>
              )}
            </div>
          )}
        </div>
        <DatasheetLayout
          mainMap={
            <>
              <CarmaMap
                mapEngine="maplibre"
                layerMode="imperative"
                embedded
                debugLog
                logErrors={showRaw}
                exposeMapToWindow
                overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
                backgroundLayers=""
                terrainControl={false}
                fullScreenControl={false}
                libreLayers={libreLayers}
                selectFromHits={handleSelectFromHits}
                overrideSelectedFeature={
                  measurementOverride ?? overrideSelectedFeature
                }
                gazetteerInfoOnClick={false}
                // Suppress carma's vector-feature selection while a draw mode
                // is active so clicks land in terra-draw, not in the
                // fachobjekt selection logic.
                selectionEnabled={drawMode === "none"}
                extraControls={
                  <DrawModeControls
                    active={drawMode}
                    onSelect={(mode) =>
                      setDrawMode((prev) => (prev === mode ? "none" : mode))
                    }
                    snapping={{
                      enabled: snappingEnabled,
                      onToggle: () => setSnappingEnabled((s) => !s),
                    }}
                  />
                }
              />
              <MeasurementHost
                ref={measurementHostRef}
                mode={drawMode}
                snapping={snappingEnabled}
                initialFeatures={initialMeasurementFeatures}
                onChange={(features) => {
                  // Prefix terra-draw's UUIDs to namespace measurement ids
                  // away from any other id space (fachobjekte, brandnew FC,
                  // etc.). Redux state is persisted via redux-persist
                  // (see measurementsConfig in store/index.ts) so the next
                  // refresh re-seeds terra-draw via initialFeatures above.
                  dispatch(
                    replaceMeasurements(
                      features.map((f) => ({
                        ...f,
                        id: `measurement.${f.id}`,
                      }))
                    )
                  );
                }}
                onSelectionChange={(id) => {
                  // terra-draw fires with the raw UUID; redux stores the
                  // prefixed form. Translate before dispatching so the
                  // shared selectedFeature slot lands on the matching item.
                  dispatch(
                    selectMeasurement(id != null ? `measurement.${id}` : null)
                  );
                }}
              />
            </>
          }
          datasheetContent={
            // Draft mode: render AP form directly from persisted draft snapshot
            draftMode &&
            apOpenedFrom != null &&
            selectedAPId != null &&
            apDrafts[String(selectedAPId)]?.serverData ? (
              (() => {
                const draft = apDrafts[String(selectedAPId)];
                return (
                  <ArbeitsauftraegeFormsWrapper
                    mode="ap"
                    id={String(selectedAPId)}
                    data={draft.serverData as Record<string, unknown>}
                    readOnly={!globalEditMode}
                    aaId={draft.aaId}
                    geometry={draft.geometry}
                    fachobjektType={draft.featureType}
                    onBack={() => {
                      dispatch(setApOpenedFrom(null));
                      dispatch(setActiveAATab("aa"));
                    }}
                  />
                );
              })()
            ) : draftMode &&
              sidebarVariant === "arbeitsauftraege" &&
              selectedAPId != null &&
              !selectedAAData &&
              apDrafts[String(selectedAPId)]?.serverData ? (
              (() => {
                const draft = apDrafts[String(selectedAPId)];
                return (
                  <ArbeitsauftraegeFormsWrapper
                    mode="ap"
                    id={String(selectedAPId)}
                    data={draft.serverData as Record<string, unknown>}
                    readOnly={!globalEditMode}
                    aaId={draft.aaId}
                    geometry={draft.geometry}
                    fachobjektType={draft.featureType}
                    onBack={() => {
                      dispatch(setApOpenedFrom(null));
                      dispatch(setActiveAATab("aa"));
                    }}
                  />
                );
              })()
            ) : sidebarVariant === "arbeitsauftraege" && selectedAAData ? (
              (() => {
                const selectedProtokoll =
                  apOpenedFrom != null && selectedAPId != null
                    ? selectedAAData.ar_protokolleArray?.find(
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (entry: Record<string, any>) =>
                          entry.arbeitsprotokoll?.id === selectedAPId
                      )?.arbeitsprotokoll
                    : null;

                if (selectedProtokoll) {
                  // Extract AP geometry and featureType from the AP GeoJSON
                  const apGeo = buildApGeoJson(selectedAAData);
                  const apFeature = apGeo.features.find(
                    (f) => f.properties?.id === selectedAPId
                  );
                  return (
                    <ArbeitsauftraegeFormsWrapper
                      mode="ap"
                      id={
                        selectedAPId != null ? String(selectedAPId) : undefined
                      }
                      data={selectedProtokoll}
                      loading={aaLoading}
                      readOnly={!globalEditMode}
                      aaId={
                        selectedAAId != null ? String(selectedAAId) : undefined
                      }
                      geometry={apFeature?.geometry ?? undefined}
                      fachobjektType={
                        apFeature?.properties?.featureType as string | undefined
                      }
                      onBack={() => {
                        dispatch(setApOpenedFrom(null));
                        dispatch(setActiveAATab("aa"));
                      }}
                    />
                  );
                }

                return (
                  <ArbeitsauftraegeFormsWrapper
                    mode="aa"
                    id={selectedAAId != null ? String(selectedAAId) : undefined}
                    data={selectedAAData}
                    loading={aaLoading}
                    readOnly={!globalEditMode}
                    geometry={
                      aaFeatures.find((f) => f.id === selectedAAId)?.geometry
                    }
                  />
                );
              })()
            ) : (
              <div style={{ height: "100%", overflow: "hidden" }}>
                <BelisDatasheetView
                  feature={selectedFeature}
                  rawFeature={rawFeature}
                  fetchedData={liveDraftFetchedData ?? fetchedFeatureData}
                  featureType={
                    selectedFeature?.carmaInfo?.sourceLayer ||
                    selectedFeatureId?.sourceLayer ||
                    lastFeatureType
                  }
                  readOnly={!globalEditMode}
                  featureOnMap={featureOnMap}
                  onSelectNextDraft={handleSelectNextDraft}
                />
              </div>
            )
          }
          onReturnToMap={handleReturnToMap}
        />
      </div>
    </div>
  );
};

export default BelisMapLibWrapper;
