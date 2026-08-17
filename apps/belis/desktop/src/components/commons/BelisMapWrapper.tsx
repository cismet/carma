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
  getEnabledCategoryFilters,
  isSnappingEnabled,
  setSnappingEnabled,
} from "../../store/slices/mapSettings";
import { getKeyTablesData } from "../../store/slices/keyTables";
import {
  backgroundLayerConfigs,
  additionalLayerConfigs,
  leuchtenDataLayer,
  brandNewDataLayer,
  BELIS_STYLE_URL,
  BELIS_BRAND_NEW_STYLE_URL,
  BELIS_ORIGINAL_SOURCE,
  BELIS_SOURCE_LAYERS,
  ESAVE_STYLE_URL,
  ESAVE_ORIGINAL_SOURCE,
  AA_LAYER_STYLES,
  BELIS_MARKER_SYMBOL_SIZE,
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
import { getJWT, getIsReadOnly } from "../../store/slices/auth";
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
  BELIS_BRAND_NEW_FC_URL,
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
import {
  attachMeasurementsOnTop,
  isMeasurementLayerId,
} from "../../helper/measurementLayerHelper";

const LIST_WIDTH = 300;

/** Above this feature count the sidebar drops the detailed per-item list and
 *  shows only the grouped counts (overview mode). Applies to both the
 *  Fachobjekte (viewport) tab and the Highlights tab. */
const OVERVIEW_FEATURE_LIMIT = 2000;

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
import type { ExpertSortSpec } from "../ui/expert-search/expertSearchUtils";

import {
  getAllDraftFeatures,
  getAllDrafts,
  getBrandnewSuppressedEditIds,
  getDeletedFeatureIds,
  getStandortLeuchtenOverrides,
  getDraftFeaturesCount,
  getDraftFetchedData,
  getEffectiveHiddenOriginalIds,
  getGlobalEditMode,
  isCreationDraftKey,
  clearBrandnewSuppressedEditIds,
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
  buildClusterIndex,
  clusterIdOf,
  clusterMembers,
  clusterSourceIds,
  queryLeuchtenByStandort,
  queryStandortById,
  toSidebarFeature,
} from "../../helper/standortCluster";
import { buildFeatureKey } from "../../helper/featureKeys";
import {
  buildLeuchteDraftStandortFeature,
  expandDraftSidebarFeatures,
} from "../../helper/expandDraftSidebarFeatures";
import {
  buildSyntheticFeature,
  featureTypeToSourceLayer,
  convertGeometryToWgs84,
} from "../../helper/buildSyntheticFeature";
// import { useAaLassoSelection } from "../../hooks/useAaLassoSelection";
import { useBrandnewFcSync } from "../../hooks/useBrandnewFcSync";
import { useFilteredHighlights } from "../../hooks/useFilteredHighlights";
import {
  DrawModeControls,
  MeasurementHost,
  MeasurementsProvider,
  MEASUREMENT_FEATUREKIND,
  featureLengthMeters,
  formatMeters,
  type DrawMode,
  type MeasurementHostHandle,
} from "@carma-mapping/measurements";
import {
  getMeasurements,
  replaceMeasurements,
  selectMeasurement,
} from "../../store/slices/measurements";
import { MapLibrePrintPreview } from "@carma-mapping/print-core/maplibre";
import {
  getPrintActive,
  getOrientation as getPrintOrientation,
  getScale as getPrintScale,
  getDPI as getPrintDPI,
  getPrintName,
  getIsLoading as getPrintLoading,
  getRedrawPreview as getPrintRedraw,
  getIfMapPrinted,
  changePrintActive,
  changeIsLoading as changePrintLoading,
  changePrintError,
  changeIfMapPrinted,
  changeRedrawPreview,
} from "../../store/slices/print";
import {
  buildBelisInlineFachobjekteLayer,
  buildBelisPrintLayers,
} from "../../helper/printLayers";

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

// Stable, globally-unique MapLibre feature id for a SERVER brandnew feature.
// The server FC assigns volatile top-level ids (100001…) that get reassigned on
// every regeneration — and the FC regenerates constantly while the user creates
// / edits brandnew features. Because the brandnew geojson source has no
// promoteId, `feature.id` IS that volatile top-level id, so a highlighted or
// selected feature's `feature-state` and highlight toggle key would silently
// point at a stale id (or a different feature) after any refresh — the
// "shown in the sidebar but gone on the map" desync. Derive the id from the
// feature's own stable identity (source-layer + DB pk) instead, so it survives
// regenerations — mirroring `promoteId: "id"` on the vector layers. The
// source-layer is folded in because the single-layer geojson source keys
// feature-state by id alone, so a Leuchte and a Mauerlasche that happen to
// share a DB integer must not collide. The `bn:` prefix keeps this id space
// disjoint from the draft ids (draftFeatureStateId of a bare properties.id).
const brandnewFeatureStateId = (sourceLayer: string, dbId: unknown): number =>
  draftFeatureStateId(`bn:${sourceLayer}:${String(dbId)}`);

// Re-point SearchModal (expert / funnel) highlight rows that actually belong to
// a same-day BRANDNEW feature so their identity matches the map.
//
// `convertResultsToSidebarFeatures` builds every expert-search row against the
// vector-tile source (`namespacedSource`) with the DB pk as the feature id —
// correct for regular Fachobjekte, wrong for an entity that only exists in the
// brandnew geojson source (created today, not yet baked into the tiles). Both
// the visual selection (`setFeatureState` in applyVisualSelection) and the
// dismiss suppression (`matchesCriteria`'s toggleKey) key on the MAP feature's
// identity — the brandnew SOURCE and its stable stamped id (brandnewFeatureStateId,
// mirroring the map source stamped by useBrandnewFcSync). A vector-source + DB-pk
// row matches neither, so selection paints nothing and dismiss never un-highlights
// the feature on the map (it only leaves the list) — the reported desync.
//
// Detect brandnew entities via the live brandnew FC (keyed by _sourceLayer + DB
// pk) and rewrite only those rows to { source: brandnewSource, id: bnHash },
// leaving properties.id (and everything the info box / row-highlight pk-match /
// counts read) untouched. Regular rows — and rows for entities not in the FC —
// pass through unchanged.
const repointBrandnewHighlightRows = (
  rows: SidebarFeature[] | null,
  brandnewFc: GeoJSON.FeatureCollection,
  brandnewSource: string
): SidebarFeature[] | null => {
  if (!rows || rows.length === 0) return rows;
  const brandnewKeys = new Set<string>();
  for (const f of brandnewFc.features ?? []) {
    const sl = String(f.properties?._sourceLayer ?? "");
    const dbId = f.properties?.id;
    if (sl && dbId != null) brandnewKeys.add(`${sl}::${String(dbId)}`);
  }
  if (brandnewKeys.size === 0) return rows;
  let changed = false;
  const out = rows.map((f) => {
    const sl = f.sourceLayer ?? "";
    const dbId = f.properties?.id ?? f.id;
    if (sl && dbId != null && brandnewKeys.has(`${sl}::${String(dbId)}`)) {
      changed = true;
      return {
        ...f,
        source: brandnewSource,
        id: brandnewFeatureStateId(sl, dbId),
      } as SidebarFeature;
    }
    return f;
  });
  return changed ? out : rows;
};

// Move every brandnew sub-style layer to before `leuchten-selection` (the
// first Leuchten symbol layer in styleY.json) so drafts — and same-day saved
// features that live in the brandnew layer until the overnight tile build —
// render under Leuchten/Standorte/etc. instead of covering them.
// Returns a cleanup that detaches the styledata listener.
const attachBrandnewBelowLeuchten = (
  map: maplibregl.Map,
  brandnewSource: string
): (() => void) => {
  const beforeId = `${slugifyUrl(BELIS_STYLE_URL)}::leuchten-selection`;
  const reorder = () => {
    if (!map.getLayer(beforeId)) return;
    const allLayers = map.getStyle()?.layers ?? [];
    const beforeIdx = allLayers.findIndex((l) => l.id === beforeId);
    if (beforeIdx < 0) return;
    // moveLayer fires styledata; without this guard the handler would loop.
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
};

// Stable default so an absent prop doesn't make a fresh [] each render (which
// would needlessly retrigger the sidebar's memoised sort).
const EMPTY_EXPERT_SORT: ExpertSortSpec = [];

interface BelisMapLibWrapperProps {
  mapSizes: { width: number; height: number };
  activeSourceLayers: Set<string>;
  highlightResults: SidebarFeature[] | null;
  /** Sort list (field + direction) of the expert search behind
   *  `highlightResults`, or empty. The sidebar applies the same ordering to
   *  its rows in both the Highlights and Fachobjekte tabs. */
  highlightExpertSort?: ExpertSortSpec;
  lassoActive: boolean;
  onLassoDeactivate?: () => void;
  sidebarVariant: "fachobjekte" | "arbeitsauftraege";
  onHighlightsChange?: (highlights: SidebarFeature[] | null) => void;
  /** Notified with the filter-aware highlight list (the same one the Highlights
   *  sidebar tab renders): the filtered copy when layer/Leitungstyp toggles drop
   *  something, otherwise the full list. Used by the CSV export so it mirrors the
   *  visible selection. Separate from `onHighlightsChange`, which stays unfiltered
   *  for the Arbeitsauftrag actions. */
  onFilteredHighlightsChange?: (highlights: SidebarFeature[] | null) => void;
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
  highlightExpertSort = EMPTY_EXPERT_SORT,
  lassoActive,
  onLassoDeactivate,
  sidebarVariant,
  onHighlightsChange,
  onFilteredHighlightsChange,
  regularLayerEnabled = true,
  brandnewLayerEnabled = true,
  onBrandnewCountChange,
}: BelisMapLibWrapperProps) => {
  const dispatch: AppDispatch = useDispatch();
  const store = useStore<RootState>();
  const { setOnSelectNextDraft, setOnOpenCreationDraft, setOnDraftsCleared } =
    useMapPage();
  const jwt = useSelector(getJWT);
  const featureDataVersion = useSelector(getFeatureDataVersion);
  const enabledLeitungstypen = useSelector(getEnabledLeitungstypen);
  const enabledCategoryFilters = useSelector(getEnabledCategoryFilters);
  const keyTablesData = useSelector(getKeyTablesData);
  const reduxSelectedFeature = useSelector(getReduxSelectedFeature);
  const measurements = useSelector(getMeasurements);
  // Drafts keyed by feature-id. Used by the measurement InfoBox to expose
  // an "Entwurf öffnen" action when a draft references the selected
  // measurement as its geometry source (geometryKey === "measurement.<id>").
  const allDraftsForMeasurementLink = useSelector(getAllDrafts);
  // Redux measurement ids (single-prefixed `measurement.<uuid>`) currently
  // backing an open creation draft. Drives both the terra-draw re-seed and
  // the sidebar Messungen list so an attached measurement stays hidden
  // exactly where it was before the refresh.
  const attachedMeasurementReduxIds = useMemo(() => {
    const set = new Set<string>();
    for (const d of Object.values(allDraftsForMeasurementLink)) {
      const k = d.geometryKey;
      // draft.geometryKey is double-prefixed (`measurement.measurement.<uuid>`);
      // strip one prefix to match redux feature.id.
      if (k?.startsWith("measurement.measurement.")) {
        set.add(k.slice("measurement.".length));
      }
    }
    return set;
  }, [allDraftsForMeasurementLink]);
  // One-shot snapshot of the redux-persist–rehydrated measurements, with the
  // `measurement.` id prefix stripped back to the raw terra-draw UUID. Passed
  // to MeasurementHost so terra-draw re-renders persisted features after a
  // page refresh (without this, sidebar shows them but the map is blank —
  // terra-draw owns its own internal store). Lazy-initialised so subsequent
  // measurement edits don't churn the prop reference; MeasurementHost only
  // reads this on its first attach anyway. Attached measurements are filtered
  // out so they don't resurrect on top of the draft icons that consumed them.
  const [initialMeasurementFeatures] = useState<Feature[]>(() =>
    measurements
      .filter((f) => !attachedMeasurementReduxIds.has(String(f.id)))
      .map((f) => ({
        ...f,
        id:
          typeof f.id === "string" ? f.id.replace(/^measurement\./, "") : f.id,
      }))
  );
  // Sidebar Messungen list excludes attached measurements — the Fachobjekte >
  // Messungen group should mirror what's actually visible on the map.
  const measurementsForSidebar = useMemo(
    () =>
      measurements.filter(
        (f) => !attachedMeasurementReduxIds.has(String(f.id))
      ),
    [measurements, attachedMeasurementReduxIds]
  );
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
  const snappingEnabled = useSelector(isSnappingEnabled);
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
  const { closeDatasheet, openDatasheet, isDatasheetOpen } = useDatasheet();
  // Rendered row order of the Fachobjekte/Entwürfe list, published by the
  // sidebar. Used to auto-select the first row after the last draft was
  // removed, so the Datenblatt stays open instead of falling back to the map.
  const sidebarOrderedFeaturesRef = useRef<SidebarFeature[]>([]);
  // Armed when a draft removal leaves nothing selected: keep the Datenblatt
  // open and select the first list row as soon as the list has one.
  const [selectFirstAfterDrafts, setSelectFirstAfterDrafts] = useState(false);
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

  // --- Print preview state (see store/slices/print + PrintControl) ---
  const printActive = useSelector(getPrintActive);
  const printOrientation = useSelector(getPrintOrientation);
  const printScale = useSelector(getPrintScale);
  const printDpi = useSelector(getPrintDPI);
  const printName = useSelector(getPrintName);
  const printLoading = useSelector(getPrintLoading);
  const printRedraw = useSelector(getPrintRedraw);
  const printIfMapPrinted = useSelector(getIfMapPrinted);
  // Mirror the on-screen "Blass" (pale) mode in print: when active, dim the
  // active background to 10%, matching the on-screen effectiveOpacity factor
  // (see the `inPaleMode ? bgOpacity * 0.1 : bgOpacity` rule in libreLayers).
  const printBackgroundOpacities = useMemo(() => {
    if (!inPaleMode) return backgroundLayerOpacities;
    const current = backgroundLayerOpacities[activeBackgroundLayer] ?? 1;
    return {
      ...backgroundLayerOpacities,
      [activeBackgroundLayer]: current * 0.1,
    };
  }, [inPaleMode, backgroundLayerOpacities, activeBackgroundLayer]);

  const printLayers = useMemo(
    () =>
      buildBelisPrintLayers({
        activeBackgroundLayer,
        backgroundLayerOpacities: printBackgroundOpacities,
        activeAdditionalLayers,
        additionalLayerOpacities,
        // Print mirrors the on-map filters: only visible categories /
        // Leitungstypen / sources are printed.
        enabledCategoryFilters,
        enabledLeitungstypen,
        leitungstypen: (keyTablesData.leitungstyp || []) as {
          id: number;
          bezeichnung?: string;
        }[],
        regularEnabled: regularLayerEnabled,
        brandnewEnabled: brandnewLayerEnabled,
      }),
    [
      activeBackgroundLayer,
      printBackgroundOpacities,
      activeAdditionalLayers,
      additionalLayerOpacities,
      enabledCategoryFilters,
      enabledLeitungstypen,
      keyTablesData.leitungstyp,
      regularLayerEnabled,
      brandnewLayerEnabled,
    ]
  );

  // Highlighting: compute namespaced source + call useMapHighlighting
  const namespacedSource = `${slugifyUrl(
    BELIS_STYLE_URL
  )}::${BELIS_ORIGINAL_SOURCE}`;
  // Brandnew geojson source uses the same inner source id ("belis-source")
  // but is namespaced by its own style URL.
  const brandnewSource = `${slugifyUrl(
    BELIS_BRAND_NEW_STYLE_URL
  )}::${BELIS_ORIGINAL_SOURCE}`;
  // Optional "esave Daten" layer (Smart-Lighting-Controller sensor points).
  const esaveSource = `${slugifyUrl(
    ESAVE_STYLE_URL
  )}::${ESAVE_ORIGINAL_SOURCE}`;

  const selectedAAId = useSelector(getSelectedAAId);
  const selectedAAData = useSelector(getSelectedAAData);
  const activeAATab = useSelector(getActiveAATab);
  const selectedAPId = useSelector(getSelectedAPId);
  const apOpenedFrom = useSelector(getApOpenedFrom);
  const aaLoading = useSelector(getAALoading);
  const aaGraphqlLoading = useSelector(getGraphqlLoading);
  const globalEditMode = useSelector(getGlobalEditMode);
  const isReadOnly = useSelector(getIsReadOnly);

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
    setHighlightingActive,
    highlightVersion,
    ensureToggledFeatures,
    ensureSuppressedFeatures,
    toggleFeatureHighlight,
    clearHighlights,
    criteria,
  } = useMapHighlight();

  // Print: build the layer stack fresh at print time so it reflects the live map
  // (visible features + current selection/highlight). The Fachobjekte go out as
  // ONE inline-geojson style with the features embedded (see printLayers.ts).
  const resolvePrintLayers = useCallback(
    (m: maplibregl.Map, bbox: [number, number, number, number]) => {
      const inlineFachobjekteLayer = buildBelisInlineFachobjekteLayer({
        map: m,
        namespacedSource,
        brandnewSource,
        enabledCategoryFilters,
        enabledLeitungstypen,
        leitungstypen: (keyTablesData.leitungstyp || []) as {
          id: number;
          bezeichnung?: string;
        }[],
        regularEnabled: regularLayerEnabled,
        brandnewEnabled: brandnewLayerEnabled,
        highlightingActive,
        bbox,
      });
      return buildBelisPrintLayers({
        activeBackgroundLayer,
        backgroundLayerOpacities: printBackgroundOpacities,
        activeAdditionalLayers,
        additionalLayerOpacities,
        enabledCategoryFilters,
        enabledLeitungstypen,
        leitungstypen: (keyTablesData.leitungstyp || []) as {
          id: number;
          bezeichnung?: string;
        }[],
        regularEnabled: regularLayerEnabled,
        brandnewEnabled: brandnewLayerEnabled,
        inlineFachobjekteLayer,
      });
    },
    [
      namespacedSource,
      brandnewSource,
      enabledCategoryFilters,
      enabledLeitungstypen,
      regularLayerEnabled,
      brandnewLayerEnabled,
      highlightingActive,
      activeBackgroundLayer,
      printBackgroundOpacities,
      activeAdditionalLayers,
      additionalLayerOpacities,
      keyTablesData.leitungstyp,
    ]
  );

  // Adjusted highlights: starts from highlightResults, updated by Alt+click toggles
  const [unfilteredHighlights, setUnfilteredHighlights] = useState<
    SidebarFeature[] | null
  >(highlightResults);
  // Latest brandnew FC, read (not depended on) by the highlight-row re-pointer
  // below so a 1s brandnew poll never re-runs the reset and clobbers the user's
  // alt+click / dismiss edits. Assigned from `brandnewFc` once it's declared.
  const brandnewFcRef = useRef<GeoJSON.FeatureCollection>({
    type: "FeatureCollection",
    features: [],
  });
  // Reset when new highlight results arrive. Re-point rows that belong to a
  // brandnew feature onto the brandnew source + stamped id so selection and
  // dismiss land on the map feature (see repointBrandnewHighlightRows).
  useEffect(() => {
    setUnfilteredHighlights(
      repointBrandnewHighlightRows(
        highlightResults,
        brandnewFcRef.current,
        brandnewSource
      )
    );
  }, [highlightResults, brandnewSource]);

  // Clear selection when highlighting activates (e.g. search).
  // When highlighting is deactivated (the "clean" X button), also drop the
  // accumulated sidebar list. The map feature-state is cleared by
  // useMapHighlighting's deactivate effect, but unfilteredHighlights otherwise
  // only resets when the highlightResults prop changes — which is a no-op after
  // a lasso / street search (highlightResults stays null). Without this reset a
  // following lasso is treated as the same session (highlightCriteriaSignature
  // ignores toggledFeatures) and stacks onto the stale old list -> old + new.
  useEffect(() => {
    if (highlightingActive) {
      clearMapSelection();
    } else if (highlightResults == null) {
      // Only drop the accumulated list when there's no externally supplied
      // (funnel/SearchModal) result set to fall back to.
      setUnfilteredHighlights(null);
    }
  }, [highlightingActive, highlightResults]);

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
    onHighlightsChange?.(unfilteredHighlights);
  }, [unfilteredHighlights, onHighlightsChange]);

  const handleHighlightToggle = useCallback(
    (feature: maplibregl.MapGeoJSONFeature) => {
      const featureSource = feature.source ?? namespacedSource;
      const clickedLayer = feature.sourceLayer ?? "";
      const sourceIds = clusterSourceIds(
        namespacedSource,
        brandnewLayerEnabled ? brandnewSource : undefined
      );

      // A Standort and its Leuchten are one unit: Alt+clicking any member
      // toggles the whole cluster, so the Highlights tab shows the same nested
      // block the Fachobjekte tab does. Clicking a Leuchte resolves its parent
      // first, then re-reads the cluster from that parent — otherwise the
      // sibling Leuchten stay out and the row cannot nest (BelisSidebar only
      // indents a Leuchte whose Standort is in the same list).
      const clicked = toSidebarFeature(feature, featureSource, clickedLayer);
      const standortDbId =
        clickedLayer === "standorte"
          ? String(feature.properties?.id ?? "")
          : String(feature.properties?.fk_standort ?? "");

      let standort: SidebarFeature | null = null;
      let leuchten: SidebarFeature[] = [];
      if (
        map &&
        (clickedLayer === "standorte" || clickedLayer === "leuchten")
      ) {
        standort =
          clickedLayer === "standorte"
            ? clicked
            : queryStandortById(map, standortDbId, sourceIds);
        leuchten = queryLeuchtenByStandort(map, standortDbId, sourceIds);
        // A Leuchte outside the loaded tiles still highlights on its own.
        if (leuchten.length === 0 && clickedLayer === "leuchten") {
          leuchten = [clicked];
        }
      }
      // Any other layer (Leitung, Schaltstelle, …) toggles on its own.

      const keyOf = buildFeatureKey;
      // Standort first — the sidebar's flatten expects the parent before its
      // children, and the `!prev` branch seeds the list verbatim.
      const cluster: SidebarFeature[] = standort
        ? [standort, ...leuchten]
        : leuchten.length > 0
        ? leuchten
        : [clicked];

      const clickedKey = keyOf(clicked);

      // Each member carries its own source: a tile Standort can own a brandnew
      // Leuchte, so a single `featureSource` would write the feature-state onto
      // the wrong source. getFeatureState needs the geojson-aware target (no
      // sourceLayer), while toggleFeatureHighlight keys on the logical layer —
      // hence the two shapes.
      const memberOf = (f: SidebarFeature) => ({
        source: (f as unknown as { source?: string }).source ?? featureSource,
        sourceLayer: f.sourceLayer ?? "",
        id: f.id!, // promoted DB id, matching what matchesCriteria uses
      });
      // Pre-click highlight state. useMapHighlighting has toggled the clicked
      // feature in the criteria already, but applyHighlights only runs in an
      // effect afterwards, so every member still reads its state from before
      // the click — including the clicked one.
      const wasHighlighted = (f: SidebarFeature) =>
        map
          ? Boolean(
              map.getFeatureState(buildFeatureStateTarget(map, memberOf(f)))
                .highlighted
            )
          : false;

      // The direction must come from the CLUSTER, not from the clicked member.
      // A Standort and its Leuchte are drawn on the same coordinate, and
      // queryRenderedFeatures returns the topmost hit, so which member a click
      // resolves to varies between clicks on the same symbol. After an expert
      // search the cluster is mixed — Leuchten lit (they matched queryIds),
      // Standort dark (it did not) — so reading the direction off the clicked
      // member made the same click mean "add" or "remove" at random.
      //
      // Any lit member => the click clears the cluster; otherwise it lights it.
      const adding = !cluster.some(wasHighlighted);

      // Drive every member to `adding`, the clicked one included: the hook
      // already XOR-flipped it, which is only correct when its own pre-state
      // happened to agree with the cluster's.
      for (const f of cluster) {
        const pre = wasHighlighted(f);
        const post = keyOf(f) === clickedKey ? !pre : pre;
        if (post !== adding) toggleFeatureHighlight(memberOf(f));
      }

      // Update sidebar content
      setUnfilteredHighlights((prev) => {
        if (!prev) return adding ? cluster : null;

        if (!adding) {
          const removeKeys = new Set(cluster.map(keyOf));
          return prev.filter((f) => !removeKeys.has(keyOf(f)));
        }

        const existing = new Set(prev.map(keyOf));
        const toAdd = cluster.filter((f) => !existing.has(keyOf(f)));
        return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
      });
    },
    [
      map,
      namespacedSource,
      brandnewSource,
      brandnewLayerEnabled,
      toggleFeatureHighlight,
    ]
  );

  // Lasso → sidebar. The lasso only writes map feature-state; the accumulator
  // in `handleHighlightsApplied` is the sidebar's usual feed, and it bails out
  // whenever a SearchModal result set is active — so without this the Highlights
  // tab stayed empty after a lasso on top of a search.
  //
  // Fires once with every hit, so the cluster index is built one time instead of
  // per feature, and this callback OWNS all highlight-state mutation (useLasso-
  // Highlight defers to us instead of toggling the raw hits itself). Like
  // Alt+click, a hit expands to its whole Standort/Leuchten cluster and the whole
  // cluster is driven to one direction.
  const handleLassoMatched = useCallback(
    (matched: maplibregl.MapGeoJSONFeature[]) => {
      if (!map || matched.length === 0) return;
      const sourceIds = clusterSourceIds(
        namespacedSource,
        brandnewLayerEnabled ? brandnewSource : undefined
      );
      const index = buildClusterIndex(map, sourceIds);

      // Expand each hit to its whole cluster, deduped so a Standort and its
      // Leuchten caught by the same lasso are handled once. Standalone layers
      // (Leitung, Schaltstelle, …) are their own cluster.
      const clusters = new Map<string, SidebarFeature[]>();
      for (const raw of matched) {
        const f = toSidebarFeature(raw, raw.source, raw.sourceLayer ?? "");
        const clusterId = clusterIdOf(f);
        const decisionKey = clusterId
          ? `cluster:${clusterId}`
          : buildFeatureKey(f);
        if (clusters.has(decisionKey)) continue;
        const members = clusterId ? clusterMembers(clusterId, index) : [f];
        clusters.set(decisionKey, members.length > 0 ? members : [f]);
      }

      // Each member carries its own source (a tile Standort can own a brandnew
      // Leuchte). getFeatureState needs the geojson-aware target; toggleFeature-
      // Highlight keys on the logical layer — same two shapes as Alt+click.
      const memberOf = (f: SidebarFeature) => ({
        source: (f as unknown as { source?: string }).source ?? namespacedSource,
        sourceLayer: f.sourceLayer ?? "",
        id: f.id!,
      });
      // The member's ACTUAL rendered highlight, not its toggledFeatures
      // membership. On top of an expert search a cluster is mixed — Leuchten lit
      // via queryIds, Standort dark — and only the real feature-state captures
      // that. useLassoHighlight now leaves the raw hits untouched, so this reads
      // the true pre-lasso state for every member.
      const wasHighlighted = (f: SidebarFeature) =>
        Boolean(
          map.getFeatureState(buildFeatureStateTarget(map, memberOf(f)))
            .highlighted
        );

      const addRows: SidebarFeature[] = [];
      const removeKeys = new Set<string>();
      for (const members of clusters.values()) {
        // Direction from the whole cluster, exactly like Alt+click: any lit
        // member clears the cluster, otherwise light it. A uniform
        // ensureToggledFeatures write cannot do this — toggledFeatures is an XOR
        // against queryIds, so on an expert-search cluster it would light the
        // (unmatched) Standort while switching its (matched) Leuchten off,
        // splitting the group instead of toggling it as a unit.
        const adding = !members.some(wasHighlighted);
        for (const f of members) {
          // toggleFeatureHighlight flips toggled-set membership, which flips the
          // visible state; only flip members whose current state disagrees.
          if (wasHighlighted(f) !== adding) toggleFeatureHighlight(memberOf(f));
        }
        if (adding) addRows.push(...members);
        else for (const f of members) removeKeys.add(buildFeatureKey(f));
      }

      setUnfilteredHighlights((prev) => {
        const base = (prev ?? []).filter(
          (f) => !removeKeys.has(buildFeatureKey(f))
        );
        const existing = new Set(base.map(buildFeatureKey));
        const toAdd = addRows.filter((f) => !existing.has(buildFeatureKey(f)));
        const next = toAdd.length > 0 ? [...base, ...toAdd] : base;
        // null (not []) is the "nothing highlighted" signal the tab gate reads.
        return next.length > 0 ? next : null;
      });
    },
    [
      map,
      namespacedSource,
      brandnewSource,
      brandnewLayerEnabled,
      toggleFeatureHighlight,
    ]
  );

  // Orange lasso (Alt+Shift) → narrow the current highlight set. The hook hands
  // over exactly the features that were highlighted AND inside the polygon; we
  // freeze them into an explicit selection.
  //
  // clearHighlights first, on purpose: it drops the street-search matchers /
  // expert-search queryIds that produced the selection, so the highlights
  // outside the polygon can never come back when their tiles reload on pan or
  // zoom. From here on the selection is just this list of features — which is
  // also what makes the gesture repeatable (each orange lasso narrows further).
  const handleLassoRefine = useCallback(
    (survivors: maplibregl.MapGeoJSONFeature[]) => {
      if (!map || survivors.length === 0) return;

      clearHighlights();
      setHighlightingActive(true);
      ensureToggledFeatures(
        survivors.map((f) => ({
          source: f.source,
          sourceLayer: f.sourceLayer ?? "",
          id: f.id!,
        })),
        true
      );

      const keep = new Set(
        survivors.map((f) => buildFeatureKey(f as unknown as SidebarFeature))
      );
      setUnfilteredHighlights((prev) => {
        if (!prev) return prev;
        const next = prev.filter((f) => keep.has(buildFeatureKey(f)));
        // null (not []) is the "nothing highlighted" signal the tab gate reads.
        return next.length > 0 ? next : null;
      });
    },
    [map, clearHighlights, setHighlightingActive, ensureToggledFeatures]
  );

  // Sidebar dismiss: remove a single feature from highlights.
  //
  // Uniform across origination paths (lasso → toggledFeatures, modal search →
  // queryIds, street search → propertyMatchers): mark the feature as suppressed
  // so useMapHighlighting's matchesCriteria treats it as un-highlighted no
  // matter which store originally selected it. Also drop it from toggledFeatures
  // to keep state clean when the feature was lasso-selected.
  //
  // Key by `feature.id` (the map's own feature id) — that's what matchesCriteria
  // hashes into the toggleKey. For MVT sources `promoteId: "id"` makes it equal
  // to the DB pk; for brandnew geojson it's the assigned geojson feature id,
  // which may differ from `properties.id`. Using `properties.id` here would
  // silently miss brandnew features.
  const handleSidebarDismiss = useCallback(
    (feature: SidebarFeature) => {
      const sl = feature.sourceLayer ?? "";
      const mapId = feature.id;
      // Brand-new features have separate id spaces: `f.id` is the geojson
      // feature id, `properties.id` is the DB / synthetic PK. Either identity
      // may appear in unfilteredHighlights depending on which path put it
      // there (accumulator dedup + map-toggle removal both prefer
      // properties.id). Fire suppression and filter on BOTH so the feature is
      // removed regardless of which one matches.
      const dbId = feature.properties?.id;
      if ((mapId == null && dbId == null) || !sl) return;
      const featureSource =
        (feature as unknown as { source?: string }).source ?? namespacedSource;

      const ids = [mapId, dbId].filter(
        (id): id is string | number => id != null && id !== ""
      );
      const suppressList = ids.map((id) => ({
        source: featureSource,
        sourceLayer: sl,
        id,
      }));
      ensureSuppressedFeatures(suppressList, true);
      ensureToggledFeatures(suppressList, false);

      const idStrs = new Set(ids.map((id) => String(id)));
      setUnfilteredHighlights((prev) => {
        if (!prev) return prev;
        return prev.filter((f) => {
          if ((f.sourceLayer ?? "") !== sl) return true;
          const fMapId = f.id != null ? String(f.id) : "";
          const fDbId = f.properties?.id != null ? String(f.properties.id) : "";
          return !idStrs.has(fMapId) && !idStrs.has(fDbId);
        });
      });
    },
    [namespacedSource, ensureToggledFeatures, ensureSuppressedFeatures]
  );

  // Signature of the *match intent* (property/query criteria only — NOT the
  // individually toggled features). Changes when a new street search starts or
  // the highlight is cleared, but stays stable across pans, zooms and
  // alt+click / dismiss toggles.
  const highlightCriteriaSignature = useMemo(() => {
    const pm = criteria.propertyMatchers
      .map((m) => `${m.property}=${m.regex.source}`)
      .join("|");
    const qi = criteria.queryIds
      .map((q) => `${q.sourceLayer}:${q.property}:${q.value}`)
      .join("|");
    return `${pm}##${qi}`;
    // criteria is a stable ref object; highlightVersion is its change signal,
    // so it must stay in the deps even though it isn't read directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criteria, highlightVersion]);

  // Last criteria signature reflected in unfilteredHighlights. A change means a
  // fresh highlight session, so the accumulated list must start empty.
  const appliedCriteriaSigRef = useRef(highlightCriteriaSignature);

  const handleHighlightsApplied = useCallback(
    (matched: maplibregl.GeoJSONFeature[]) => {
      // Only collect when there are no SearchModal results (i.e. street search)
      if (highlightResults != null) return;

      // For vector-tile sources querySourceFeatures (inside applyHighlights)
      // only returns features in the currently loaded tiles — i.e. the
      // viewport. Replacing the list on every callback made the highlight
      // count track the viewport (shrinking on zoom-in, growing on zoom-out).
      // Instead we ACCUMULATE: a feature, once matched, stays in the list as
      // the user pans/zooms and more tiles load, so the count is stable and
      // converges to the true total. The accumulation is reset only when the
      // match criteria themselves change (new / cleared search).
      const isNewSession =
        appliedCriteriaSigRef.current !== highlightCriteriaSignature;
      appliedCriteriaSigRef.current = highlightCriteriaSignature;

      const keyOf = (f: SidebarFeature) =>
        `${f.sourceLayer ?? ""}::${String(f.properties?.id ?? f.id ?? "")}`;

      setUnfilteredHighlights((prev) => {
        const base = isNewSession ? null : prev;
        const converted = matched.map(
          (f) => Object.assign(f, { original: f }) as unknown as SidebarFeature
        );
        if (!base) return converted.length > 0 ? converted : null;
        const seen = new Set(base.map(keyOf));
        const toAdd = converted.filter((f) => {
          const k = keyOf(f);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        return toAdd.length > 0 ? [...base, ...toAdd] : base;
      });
    },
    [highlightResults, highlightCriteriaSignature]
  );

  useMapHighlighting({
    map,
    sources: highlightSources,
    modifierClick: "alt",
    onToggle: handleHighlightToggle,
    onHighlightsApplied: handleHighlightsApplied,
  });

  // Lasso freehand selection — Fachobjekte only. Handing the hook a null map on
  // Arbeitsaufträge is what switches it off: every effect inside bails on
  // `!map`, so neither the explicit manager nor the always-on Alt+drag one is
  // created there. Going back to Fachobjekte re-supplies the map and both come
  // back; the transition to null runs the hooks' cleanup (destroy → deactivate),
  // which clears any leftover lasso outline. Keeps the shared hook untouched.
  useLassoHighlight({
    map: sidebarVariant === "arbeitsauftraege" ? null : map,
    active: lassoActive,
    sources: highlightSources,
    onDeactivate: onLassoDeactivate,
    // NOTE: handleHighlightToggle is intentionally NOT passed as `onToggle`. For
    // the lasso it is pure waste (~10s of the freeze): it fires per feature and
    // each call rescans the whole source. `onMatched` fires once with every hit,
    // so handleLassoMatched builds the cluster index a single time.
    onMatched: handleLassoMatched,
    // Alt+Shift refine lasso: only useful while something is highlighted, so it
    // is armed exactly for the duration of a highlight session.
    refineActive: highlightingActive,
    onRefine: handleLassoRefine,
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
  // Keep the re-pointer's ref current every render (before effects flush) so the
  // reset effect above reads the freshly-fetched FC without depending on it.
  brandnewFcRef.current = brandnewFc;
  // Pin each server brandnew feature to a stable, regeneration-proof id
  // (see brandnewFeatureStateId). Features lacking a source-layer or DB pk keep
  // the server's id untouched.
  const assignBrandnewStableId = useCallback(
    (f: GeoJSON.Feature): number | undefined => {
      const props = f.properties as Record<string, unknown> | null;
      const sl = props?._sourceLayer != null ? String(props._sourceLayer) : "";
      const dbId = props?.id;
      if (!sl || dbId == null) return undefined;
      return brandnewFeatureStateId(sl, dbId);
    },
    []
  );
  useBrandnewFcSync({
    map,
    enabled: brandnewLayerEnabled,
    source: brandnewSource,
    dataUrl: BELIS_BRAND_NEW_FC_URL,
    intervalMs: BRAND_NEW_SYNC_INTERVAL_MS,
    syncVersion: featureDataVersion,
    onCountChange: onBrandnewCountChange,
    onDataChange: setBrandnewFc,
    assignStableId: assignBrandnewStableId,
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
  // Ids whose stale brandnew-FC copy must stay hidden after a geometry-edit
  // save, until the next poll delivers the new geometry (then cleared).
  const brandnewSuppressedEditIds = useSelector(getBrandnewSuppressedEditIds);
  // Source-layer keyed ids of committed soft-deletes. The deleted rows linger
  // in the vector tiles (overnight rebuild) and the brandnew FC (server-side
  // regen) — filter them out of both layers, on both maps, until then.
  const deletedFeatureIds = useSelector(getDeletedFeatureIds);
  // Per-Standort overrides recorded when a child Leuchte's deletion is
  // *committed* (persisted, survive the save → draft-removal gap). The map hides
  // the whole Standort cluster (cascade-hiding its Leuchten on both the vector
  // tiles and the brandnew FC, see below) and renders one synthetic Standort
  // with the decremented dot count.
  const standortLeuchtenOverrides = useSelector(getStandortLeuchtenOverrides);

  // Stable per-Standort base data (count + geometry + street/lfd) for a
  // PENDING-only override. The base is captured opportunistically from whichever
  // open deletion draft happens to carry it — but the very draft that supplied it
  // may be the one the user later undoes. Without retention, undoing that draft
  // (while OTHER deletions for the same Standort are still pending) would leave
  // the remaining drafts unable to reconstruct the base, collapsing the synthetic
  // back to the full original count. Cache the first complete base per Standort
  // and keep it as long as the Standort still has any pending deletion.
  // Written only inside the memo below; idempotent given its inputs (prune + a
  // first-write-wins set) → StrictMode double-invoke yields identical state.
  const pendingStandortBaseRef = useRef<
    Map<
      string,
      {
        count: number;
        geometry: GeoJSON.Geometry;
        lfd?: string | number;
        strasse?: string;
        strassenschluessel?: string | number;
      }
    >
  >(new Map());

  // Effective per-Standort decrement: the committed overrides above PLUS a live
  // preview from every open pending-deletion Leuchte draft. Marking a Leuchte
  // for deletion must shrink its Standort's stacked icon immediately (before
  // "Speichern"), and "zurücksetzen" (draft discard) must restore it — both fall
  // out of reading the open drafts here. Keyed by Standort id (string). The
  // committed override is folded in first so its captured base count (taken
  // before any deletion) wins; the draft only adds the Leuchte to the deleted
  // set. Geometry is the Leuchte position (Leuchten stack on their Standort).
  const effectiveStandortLeuchtenOverrides = useMemo(() => {
    const merged = new Map<
      string,
      {
        baseLeuchtenCount: number;
        deletedLeuchtenIds: Set<number>;
        geometry: GeoJSON.Geometry;
        lfdNummer?: string | number;
        strasse?: string;
        strassenschluessel?: string | number;
      }
    >();
    for (const [standortId, ov] of Object.entries(standortLeuchtenOverrides)) {
      if (!ov.geometry) continue;
      merged.set(String(standortId), {
        baseLeuchtenCount: ov.baseLeuchtenCount,
        deletedLeuchtenIds: new Set(ov.deletedLeuchtenIds),
        geometry: ov.geometry,
        lfdNummer: ov.lfdNummer,
        strasse: (ov as { strasse?: string }).strasse,
        strassenschluessel: (ov as { strassenschluessel?: string | number })
          .strassenschluessel,
      });
    }
    // Group every open pending-deletion Leuchte draft by its Standort first,
    // THEN fold into `merged`. Two passes (not one) make the decrement
    // order-independent and resilient to a draft whose own `feature` lacks
    // geometry or `leuchten_count`: a sibling marked for deletion while its
    // cluster is already cascade-hidden has no rendered geometry, but its
    // Leuchte id must still count. Base count + geometry are taken from
    // whichever source has them (the committed override above, or any one of
    // the Standort's deletion drafts); every draft contributes its id.
    type PendingDeletion = {
      ids: Set<number>;
      geometry?: GeoJSON.Geometry;
      count?: number;
      lfd?: string | number;
      strasse?: string;
      strassenschluessel?: string | number;
    };
    const pending = new Map<string, PendingDeletion>();
    for (const draft of Object.values(allDraftsForMeasurementLink)) {
      if (!draft.pendingDeletion || draft.featureType !== "leuchte") continue;
      const props = (draft.feature?.properties ?? {}) as Record<
        string,
        unknown
      >;
      const standortId = props.fk_standort;
      const leuchteId = draft.featureDbId;
      if (
        standortId == null ||
        leuchteId == null ||
        !Number.isFinite(Number(leuchteId))
      )
        continue;
      const key = String(standortId);
      let p = pending.get(key);
      if (!p) {
        p = { ids: new Set<number>() };
        pending.set(key, p);
      }
      p.ids.add(Number(leuchteId));
      const geometry = draft.feature?.geometry as GeoJSON.Geometry | undefined;
      if (p.geometry == null && geometry != null) p.geometry = geometry;
      if (p.count == null) {
        const rawCount = props.leuchten_count;
        if (rawCount != null && Number.isFinite(Number(rawCount)))
          p.count = Number(rawCount);
      }
      if (p.lfd == null)
        p.lfd = props.lfd_nummer as string | number | undefined;
      // Read off a non-`props` expression to dodge the react/prop-types false
      // positive (member access on a local named `props`).
      const propsRec = draft.feature?.properties as Record<string, unknown>;
      if (p.strasse == null)
        p.strasse = propsRec?.strasse as string | undefined;
      if (p.strassenschluessel == null)
        p.strassenschluessel = propsRec?.strassenschluessel as
          | string
          | number
          | undefined;
    }
    // Drop cached bases for Standorte that no longer have any pending deletion.
    const baseCache = pendingStandortBaseRef.current;
    for (const key of [...baseCache.keys()]) {
      if (!pending.has(key)) baseCache.delete(key);
    }
    for (const [key, p] of pending) {
      // Capture the first complete base supplied by any draft; retained across
      // the undo of whichever individual draft happened to provide it.
      if (p.count != null && p.geometry != null && !baseCache.has(key)) {
        baseCache.set(key, {
          count: p.count,
          geometry: p.geometry,
          lfd: p.lfd,
          strasse: p.strasse,
          strassenschluessel: p.strassenschluessel,
        });
      }
      const entry = merged.get(key);
      if (entry) {
        for (const id of p.ids) entry.deletedLeuchtenIds.add(id);
        continue;
      }
      // A brand-new entry needs a base count + geometry to render its synthetic
      // Standort. Fall back to the cached base so a still-pending Standort keeps
      // its override even after its base-supplying draft is undone.
      const cached = baseCache.get(key);
      const count = p.count ?? cached?.count;
      const geometry = p.geometry ?? cached?.geometry;
      if (geometry == null || count == null) continue;
      merged.set(key, {
        baseLeuchtenCount: count,
        deletedLeuchtenIds: new Set(p.ids),
        geometry,
        lfdNummer: p.lfd ?? cached?.lfd,
        // Carry the street so the synthetic Standort sorts into its block in the
        // sidebar instead of jumping to the top of the list for lack of one.
        strasse: p.strasse ?? cached?.strasse,
        strassenschluessel: p.strassenschluessel ?? cached?.strassenschluessel,
      });
    }
    return merged;
  }, [standortLeuchtenOverrides, allDraftsForMeasurementLink]);

  // Synthetic Standort features carrying the post-deletion `leuchten_count`.
  // One per affected Standort, positioned at the captured Standort geometry.
  // Both maps push these into the brandnew GeoJSON source (below), where the
  // brandnew `standorte` style renders them by `_sourceLayer` + `leuchten_count`
  // — the same path the "+ Leuchte zu Standort N" synthetic Standort uses.
  const leuchtenDeletionStandortFeatures = useMemo<GeoJSON.Feature[]>(() => {
    const out: GeoJSON.Feature[] = [];
    for (const [standortId, ov] of effectiveStandortLeuchtenOverrides) {
      if (!ov.geometry) continue;
      const remaining = Math.max(
        0,
        ov.baseLeuchtenCount - ov.deletedLeuchtenIds.size
      );
      const id = `standort-leuchten-del:${standortId}`;
      out.push({
        type: "Feature",
        id,
        properties: {
          // The *real* Standort DB id, not the prefixed map id above. The
          // sidebar clusters Leuchten under their parent by matching this
          // against `fk_standort`; the original Standort tile is hidden (see
          // `leuchtenDeletionStandortIds`), so this synthetic is the only
          // header left — a prefixed id here orphans it from its Leuchten.
          id: standortId,
          _sourceLayer: "standorte",
          _isLeuchtenDeletionOverride: true,
          leuchten_count: remaining,
          lfd_nummer: ov.lfdNummer,
          strasse: ov.strasse,
          strassenschluessel: ov.strassenschluessel,
        },
        geometry: ov.geometry,
      } as unknown as GeoJSON.Feature);
    }
    return out;
  }, [effectiveStandortLeuchtenOverrides]);

  // Standort DB ids whose original cluster must be hidden so the synthetic
  // override above is the only icon left at that position. Consumed by both the
  // vector-tile filter (`hiddenOriginalIds`, with its leuchten cascade) and the
  // brandnew-FC filter (`visibleBrandnewFeatures`).
  const leuchtenDeletionStandortIds = useMemo<number[]>(
    () =>
      [...effectiveStandortLeuchtenOverrides.keys()]
        .map((k) => Number(k))
        .filter((n) => Number.isFinite(n)),
    [effectiveStandortLeuchtenOverrides]
  );

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
      if (!draft.geometry) continue;

      if (draft.isCreation === true) {
        if (!draft.feature) continue;
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
        continue;
      }

      // Geometry-edit preview: an existing feature whose shape was switched
      // to a measurement. Render the pending position via the brandnew
      // styling (piggy-backs on `_sourceLayer`) while the original tile
      // feature stays visible underneath (it is not hidden). A distinct
      // `edit:` id + `_isGeometryEditPreview` flag keep it apart from real
      // creation drafts.
      const geometryEdited =
        !!draft.geometryKey && !draft.geometryKey.startsWith("current.");
      if (!geometryEdited) continue;
      const wgs84 = convertGeometryToWgs84(draft.geometry);
      if (!wgs84) continue;
      out.push({
        type: "Feature",
        id: `edit:${draftKey}`,
        properties: {
          ...((draft.feature?.properties as Record<string, unknown>) ?? {}),
          _sourceLayer:
            featureTypeToSourceLayer[draft.featureType] ?? draft.featureType,
          _isGeometryEditPreview: true,
        },
        geometry: wgs84,
      } as unknown as GeoJSON.Feature);
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
  //
  // Self-positioned point layers (Mauerlasche, Schaltstelle, Abzweigdose): a
  // geometry-edited feature lands in the brandnew FC at its new position. Its
  // old vector-tile copy must be hidden by id too — and this is the only
  // suppression that survives a private/clean browser, where the draft-driven
  // and persisted hidden sets are empty. Hiding by id is a no-op for freshly
  // created features (their new ids aren't in the tiles).
  const SELF_POSITIONED_EDIT_LAYERS = useMemo(
    () =>
      new Set(["mauerlaschen", "schaltstelle", "abzweigdosen", "leitungen"]),
    []
  );
  const brandnewHiddenOriginalIds = useMemo<HiddenOriginalIds>(() => {
    const standorteIds = new Set<number>();
    const selfPositioned: Record<string, Set<number>> = {};
    for (const f of brandnewFc.features ?? []) {
      const sourceLayer = String(f.properties?._sourceLayer ?? "");
      if (sourceLayer === "leuchten") {
        const fk = Number(f.properties?.fk_standort);
        if (Number.isFinite(fk)) standorteIds.add(fk);
      } else if (sourceLayer === "standorte") {
        const id = Number(f.properties?.id ?? f.id);
        if (Number.isFinite(id)) standorteIds.add(id);
      } else if (SELF_POSITIONED_EDIT_LAYERS.has(sourceLayer)) {
        const id = Number(f.properties?.id ?? f.id);
        if (Number.isFinite(id)) {
          const bucket =
            selfPositioned[sourceLayer] ??
            (selfPositioned[sourceLayer] = new Set());
          bucket.add(id);
        }
      }
    }
    const out: HiddenOriginalIds = {};
    if (standorteIds.size > 0) out.standorte = [...standorteIds];
    for (const [sl, set] of Object.entries(selfPositioned)) {
      if (set.size > 0) out[sl] = [...set];
    }
    return out;
  }, [brandnewFc, SELF_POSITIONED_EDIT_LAYERS]);

  // Geometry-edit drafts move an existing feature to a new position that the
  // brandnew preview renders. Hide the feature's original copy — both its
  // vector tile and, if it was saved same-day, its brandnew FC entry — so only
  // one position shows on the map. Keyed by source-layer (e.g. "mauerlaschen").
  const geometryEditHiddenOriginalIds = useMemo<HiddenOriginalIds>(() => {
    const merged: Record<string, Set<number>> = {};
    for (const [draftKey, draft] of Object.entries(
      allDraftsForMeasurementLink
    )) {
      if (draft.isCreation) continue;
      if (!draft.geometryKey || draft.geometryKey.startsWith("current."))
        continue;
      const sl =
        featureTypeToSourceLayer[draft.featureType] ?? draft.featureType;
      // Draft keys are "<sourceLayer>:<dbPK>"; fall back to that suffix when the
      // featureDbId sync (documents effect) has not landed yet.
      const dbId = draft.featureDbId ?? Number(draftKey.split(":")[1]);
      if (!Number.isFinite(dbId)) continue;
      const bucket = merged[sl] ?? (merged[sl] = new Set());
      bucket.add(Number(dbId));
    }
    const out: HiddenOriginalIds = {};
    for (const [sl, set] of Object.entries(merged)) {
      if (set.size > 0) out[sl] = [...set];
    }
    return out;
  }, [allDraftsForMeasurementLink]);

  // Final hidden-ids map fed to the vector-tile filter — union of draft-driven
  // + brandnew-FC-derived ids, keyed by source-layer.
  const hiddenOriginalIds = useMemo<HiddenOriginalIds>(() => {
    const merged: Record<string, Set<number>> = {};
    const add = (sourceLayer: string, ids?: number[]) => {
      if (!ids || ids.length === 0) return;
      const bucket = merged[sourceLayer] ?? (merged[sourceLayer] = new Set());
      for (const id of ids) bucket.add(id);
    };
    for (const [sl, ids] of Object.entries(draftHiddenOriginalIds))
      add(sl, ids);
    for (const [sl, ids] of Object.entries(brandnewHiddenOriginalIds))
      add(sl, ids);
    for (const [sl, ids] of Object.entries(geometryEditHiddenOriginalIds))
      add(sl, ids);
    // Committed soft-deletes: hide the lingering vector-tile row until the
    // overnight rebuild drops it. Persisted, so it survives reloads.
    for (const [sl, ids] of Object.entries(deletedFeatureIds)) add(sl, ids);
    // Leuchte-deletion overrides: hide each affected Standort. The leuchten
    // cascade in applyHiddenIdsFilter then also hides every Leuchte of that
    // Standort, collapsing the whole stack to the single decremented synthetic
    // Standort rendered via the brandnew source.
    add("standorte", leuchtenDeletionStandortIds);
    const out: HiddenOriginalIds = {};
    for (const [sl, set] of Object.entries(merged)) {
      if (set.size > 0) out[sl] = [...set];
    }
    return out;
  }, [
    draftHiddenOriginalIds,
    brandnewHiddenOriginalIds,
    geometryEditHiddenOriginalIds,
    deletedFeatureIds,
    leuchtenDeletionStandortIds,
  ]);

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
        const bucket = merged[sourceLayer] ?? (merged[sourceLayer] = new Set());
        for (const id of list) bucket.add(id);
      }
    }
    // A geometry-edit draft of a same-day saved feature must also suppress that
    // feature's own brandnew FC entry, or the original icon stays put while the
    // preview renders the moved copy.
    for (const [sl, ids] of Object.entries(geometryEditHiddenOriginalIds)) {
      if (!ids || ids.length === 0) continue;
      const bucket = merged[sl] ?? (merged[sl] = new Set());
      for (const id of ids) bucket.add(id);
    }
    const out: HiddenOriginalIds = {};
    for (const [sl, set] of Object.entries(merged)) {
      if (set.size > 0) out[sl] = [...set];
    }
    return out;
  }, [allDraftsForMeasurementLink, geometryEditHiddenOriginalIds]);

  // Brandnew FC features, minus any that an OPEN draft has flagged as hidden.
  // When a "+ Leuchte zu Standort N" draft is open, the draft layer renders
  // its own synthetic Standort N (with the higher Leuchten count) — so the
  // already-saved brandnew Standort N (and its brandnew Leuchten) must be
  // suppressed to avoid a stacked duplicate icon. Mirrors the source-layer
  // cascade used by applyHiddenIdsFilter for the regular vector tiles.
  // Keyed on `activeDraftHiddenOriginalIds`, NOT the effective set, so the
  // post-save permanent ids never hide the brandnew layer's own features.
  const visibleBrandnewFeatures = useMemo<GeoJSON.Feature[]>(() => {
    // The server's brandnew FC still ships soft-deleted rows, flagged with
    // `is_deleted: true` in their own properties. Drop them up front: this is
    // data-driven, so it hides committed deletions in EVERY browser — unlike
    // the client-side `deletedFeatureIds` set below, which only reflects the
    // local user's own just-committed deletions until the FC next regenerates.
    const all = (brandnewFc.features ?? []).filter(
      (f) => f.properties?.is_deleted !== true
    );
    // Merge the open-draft hidden set with the post-save geometry-edit
    // suppression set: both must hide a brandnew copy. The suppression set
    // bridges the gap between save and the next poll (after which it clears),
    // keeping the moved feature from flashing back at its old position.
    const hidden: Record<string, Set<number>> = {};
    const addHidden = (sl: string, ids?: number[]) => {
      if (!ids || ids.length === 0) return;
      const bucket = hidden[sl] ?? (hidden[sl] = new Set());
      for (const id of ids) bucket.add(id);
    };
    for (const [sl, ids] of Object.entries(activeDraftHiddenOriginalIds))
      addHidden(sl, ids);
    for (const [sl, ids] of Object.entries(brandnewSuppressedEditIds))
      addHidden(sl, ids);
    // Committed soft-deletes: hide the deleted row's brandnew-FC copy until the
    // server regenerates the FC without it. A deleted Leuchte is keyed by its
    // own id (handled below), unlike the Standort-cascade hides above.
    for (const [sl, ids] of Object.entries(deletedFeatureIds))
      addHidden(sl, ids);
    // Leuchte-deletion overrides: hide the affected Standort's brandnew copy
    // (and, via the standorte cascade below, its brandnew Leuchten) so only the
    // decremented synthetic Standort remains. Mirrors the vector-tile hide in
    // `hiddenOriginalIds`.
    addHidden("standorte", leuchtenDeletionStandortIds);
    const hiddenStandorteIds = hidden.standorte ?? new Set<number>();
    const hiddenLeuchtenIds = hidden.leuchten ?? new Set<number>();
    const hasAnyHidden = Object.values(hidden).some((set) => set.size > 0);
    if (!hasAnyHidden) return all;
    return all.filter((f) => {
      const sl = String(f.properties?._sourceLayer ?? "");
      if (sl === "standorte") {
        const id = Number(f.properties?.id ?? f.id);
        return !hiddenStandorteIds.has(id);
      }
      if (sl === "leuchten") {
        // Hide when the parent Standort is hidden (draft cascade) OR when this
        // Leuchte itself is a committed soft-delete.
        const fk = Number(f.properties?.fk_standort);
        const id = Number(f.properties?.id ?? f.id);
        return !hiddenStandorteIds.has(fk) && !hiddenLeuchtenIds.has(id);
      }
      const idsForLayer = hidden[sl];
      if (idsForLayer && idsForLayer.size > 0) {
        const id = Number(f.properties?.id ?? f.id);
        return !idsForLayer.has(id);
      }
      return true;
    });
  }, [
    brandnewFc,
    activeDraftHiddenOriginalIds,
    brandnewSuppressedEditIds,
    deletedFeatureIds,
    leuchtenDeletionStandortIds,
  ]);

  // A fresh brandnew FC has landed (md5 changed — `useBrandnewFcSync` only
  // fires onDataChange on an actual change, never on steady-state polls). It
  // now carries the just-saved geometry, so the post-save suppression that hid
  // the stale OLD-position copy can be lifted. No-op when nothing is suppressed.
  useEffect(() => {
    dispatch(clearBrandnewSuppressedEditIds());
  }, [brandnewFc, dispatch]);

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

  // DB-identity keys ("<sourceLayer>:<dbId>") of every open non-creation draft
  // (e.g. a Mauerlasche being geometry-edited). A feature that was already saved
  // once lives in the brandnew FC and therefore shows up in the viewport list;
  // when it is reopened as a draft, its own row is also spliced in from
  // `draftSidebarFeatures`, so the saved viewport copy must be dropped or the
  // feature appears twice. Keyed the same way as the viewport features below.
  const openDraftDbKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const [draftKey, draft] of Object.entries(
      allDraftsForMeasurementLink
    )) {
      if (draft.isCreation) continue;
      const sl =
        featureTypeToSourceLayer[draft.featureType] ?? draft.featureType;
      const dbId = draft.featureDbId ?? Number(draftKey.split(":")[1]);
      if (!Number.isFinite(dbId)) continue;
      keys.add(`${sl}:${Number(dbId)}`);
    }
    return keys;
  }, [allDraftsForMeasurementLink]);

  // DB ids of Standorte being deleted whole (cascade soft-delete of all their
  // Leuchten). Their expanded rows — the Standort header + one display-only row
  // per captured child — come synchronously from `draftSidebarFeatures`
  // (expandStandortDeletionDraft). But the live viewport still renders the
  // original Standort + its Leuchten until the cascade-hide filter repaints, so
  // those copies must be dropped up front; otherwise every child row doubles for
  // a frame — the flicker. (The Standort header itself is already deduped via
  // `openDraftDbKeys`; this covers its Leuchten children, keyed by fk_standort.)
  const cascadeDeletionStandortIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [draftKey, draft] of Object.entries(
      allDraftsForMeasurementLink
    )) {
      if (draft.featureType !== "standort" || !draft.pendingDeletion) continue;
      const id =
        draft.featureDbId != null
          ? String(draft.featureDbId)
          : draftKey.split(":")[1];
      if (id) ids.add(id);
    }
    return ids;
  }, [allDraftsForMeasurementLink]);

  const mapWidth = mapSizes.width - LIST_WIDTH;

  const { features, totalCount, countsByLayer, isLoading, isOverviewMode } =
    useVisibleMapFeatures({
      maplibreMap: map,
      visibleMapWidth: mapWidth,
      visibleMapHeight: mapSizes.height,
      maxFeatures: OVERVIEW_FEATURE_LIMIT,
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

  // When a Standort has an open Leuchten-deletion override, the map cascade-hides
  // the original Standort header AND all its Leuchten so the single synthetic
  // red icon replaces the whole stacked cluster. But the sidebar list is derived
  // from `useVisibleMapFeatures` (queryRenderedFeatures), so those rows would
  // drop out of the sidebar the moment the hide filter repaints — then a synthetic
  // header + re-captured siblings would settle back in over the following ticks.
  // That multi-tick churn is exactly the flicker the user sees in the sidebar.
  //
  // To decouple the sidebar from the map round-trip, retain the affected rows by
  // DB id in a synchronous sticky registry. At the render the override first
  // appears, the hide filter hasn't repainted yet, so the original header + its
  // Leuchten are still in `features`; we capture them here (keyed
  // "<sourceLayer>:<dbId>") and keep them across the repaint that strips them.
  // The sidebar then recolors the deleted row in place (via `pendingDeletionKeys`)
  // instead of removing and re-adding it. Entries are evicted once the Standort
  // no longer has an override (draft discarded / saved) or a Leuchte becomes an
  // open deletion draft / committed soft-delete (represented elsewhere — its own
  // draft row, or genuinely gone). The synthetic override header is never stickied;
  // it stays a map-only feature and is filtered out of the sidebar list below.
  //
  // The ref is written only inside the memo and every set/delete/emit is
  // idempotent given the inputs, so a StrictMode double-invoke yields identical
  // output. A pure useMemo cannot do selective eviction-on-override-clear without
  // reading its own prior output, so the ref is the minimal honest mechanism.
  const stickyDeletionRegistryRef = useRef<Map<string, SidebarFeature>>(
    new Map()
  );
  const retainedDeletionFeatures = useMemo<SidebarFeature[]>(() => {
    const registry = stickyDeletionRegistryRef.current;
    const standortIdSet = new Set(
      leuchtenDeletionStandortIds.map((n) => String(n))
    );
    if (standortIdSet.size === 0) {
      if (registry.size) registry.clear();
      return [];
    }
    const deletedLeuchtenIds = new Set(
      (deletedFeatureIds.leuchten ?? []).map((n) => String(n))
    );
    const slOf = (f: SidebarFeature) =>
      f.sourceLayer || String(f.properties?._sourceLayer ?? "");
    // The cluster a feature belongs to: a Standort by its own id, a Leuchte by
    // its parent's id. Used both to scope capture/eviction to overridden clusters.
    const clusterIdOf = (f: SidebarFeature) => {
      const sl = slOf(f);
      if (sl === "standorte") return String(f.properties?.id ?? f.id ?? "");
      if (sl === "leuchten") return String(f.properties?.fk_standort ?? "");
      return "";
    };
    const keyOf = (f: SidebarFeature) => {
      const sl = slOf(f);
      const dbId = String(f.properties?.id ?? f.id ?? "");
      return sl && dbId ? `${sl}:${dbId}` : "";
    };
    // Capture/refresh the original header + siblings while still rendered.
    for (const f of features) {
      // Never sticky the synthetic override header — it is a map-only feature.
      if (f.properties?._isLeuchtenDeletionOverride === true) continue;
      const sl = slOf(f);
      if (sl !== "standorte" && sl !== "leuchten") continue;
      if (!standortIdSet.has(clusterIdOf(f))) continue;
      const dbId = String(f.properties?.id ?? f.id ?? "");
      if (!dbId) continue;
      if (
        sl === "leuchten" &&
        (openDraftDbKeys.has(`leuchten:${Number(dbId)}`) ||
          deletedLeuchtenIds.has(dbId))
      )
        continue;
      const key = keyOf(f);
      if (!key) continue;
      registry.set(
        key,
        Object.assign({}, f, {
          source:
            (f as unknown as { source?: string }).source ?? namespacedSource,
          original: f,
        }) as unknown as SidebarFeature
      );
    }
    // Evict stale entries: cluster no longer overridden, or a Leuchte that has
    // since become an open draft / committed soft-delete.
    for (const [key, f] of registry) {
      if (!standortIdSet.has(clusterIdOf(f))) {
        registry.delete(key);
        continue;
      }
      if (slOf(f) === "leuchten") {
        const dbId = String(f.properties?.id ?? f.id ?? "");
        if (
          openDraftDbKeys.has(`leuchten:${Number(dbId)}`) ||
          deletedLeuchtenIds.has(dbId)
        )
          registry.delete(key);
      }
    }
    // Emit, stamping the decremented count on retained Standort headers. The
    // sidebar doesn't render leuchten_count as text (count is implicit from the
    // nested rows + group badge), so this is data honesty, not display-critical.
    const out: SidebarFeature[] = [];
    for (const f of registry.values()) {
      if (slOf(f) === "standorte") {
        const ov = effectiveStandortLeuchtenOverrides.get(
          String(f.properties?.id ?? f.id)
        );
        if (ov) {
          const remaining = Math.max(
            0,
            ov.baseLeuchtenCount - ov.deletedLeuchtenIds.size
          );
          out.push(
            Object.assign({}, f, {
              properties: { ...f.properties, leuchten_count: remaining },
            }) as SidebarFeature
          );
          continue;
        }
      }
      out.push(f);
    }
    return out;
  }, [
    features,
    leuchtenDeletionStandortIds,
    effectiveStandortLeuchtenOverrides,
    openDraftDbKeys,
    deletedFeatureIds,
    namespacedSource,
  ]);

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
      setUnfilteredHighlights(null);
    }
  }, [highlightingActive]);

  // The Entwürfe tab disappears once all drafts are saved/discarded, but
  // `sidebarMode` would otherwise stay "drafts" — gating out the Messungen
  // group (and anything else fachobjekte-only) until the user toggles modes
  // by some other route. Fall back to fachobjekte automatically.
  // Read-only ("Gast") users have no draft workflow at all, so the Entwürfe
  // tab is hidden — never leave them stranded on it.
  useEffect(() => {
    if (
      sidebarMode === "drafts" &&
      (draftSidebarFeatures.length === 0 || isReadOnly)
    ) {
      setSidebarMode("fachobjekte");
    }
  }, [sidebarMode, draftSidebarFeatures.length, isReadOnly]);

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
    (unfilteredHighlights != null && unfilteredHighlights.length > 0);

  // Mirror the map's layer-filter toggles onto the highlight list: when a
  // category (Leuchten / Standorte / … / Mauerlaschen) is toggled off — or a
  // Leitungstyp is switched off in the Leitungen dropdown — drop the matching
  // highlights from the Highlights sidebar tab too. `highlightsForSidebar` is the
  // filtered copy when something was removed, otherwise the original reference.
  const { filteredHighlights, isHighlightFiltered } = useFilteredHighlights(
    unfilteredHighlights,
    activeSourceLayers,
    enabledLeitungstypen,
    (keyTablesData.leitungstyp || []) as {
      id: number;
      bezeichnung?: string;
    }[]
  );
  const highlightsForSidebar = isHighlightFiltered
    ? filteredHighlights
    : unfilteredHighlights;

  // Notify the parent with the filter-aware list (same as the sidebar shows) so
  // the CSV export mirrors the visible selection. Kept separate from
  // `onHighlightsChange` above, which stays unfiltered for the AA actions.
  useEffect(() => {
    onFilteredHighlightsChange?.(highlightsForSidebar);
  }, [highlightsForSidebar, onFilteredHighlightsChange]);

  // Shared derivation: counts per sourceLayer + merged activeSourceLayers.
  // Used by every branch that doesn't get pre-computed counts straight from
  // `useVisibleMapFeatures` (i.e. anything that builds a synthetic list).
  const buildFromFeatures = useCallback(
    (
      list: SidebarFeature[],
      overrides?: { isLoading?: boolean; isOverviewMode?: boolean }
    ) => {
      // The category toggles apply to every row, synthetic draft rows included:
      // a layer the user switched off must not come back through the sidebar.
      // (This used to union the layers present in `list` into the active set,
      // which meant the Standort parent of a Leuchten creation draft silently
      // re-enabled `standorte` for the whole list — flipping the group header
      // from "Leuchten" to "Standorte / Leuchten" with the toggle still off.)
      // Rows whose layer can't be resolved are kept — the toggles have nothing
      // to say about them.
      const visible = list.filter((f) => {
        const sl = f.sourceLayer || String(f.properties?._sourceLayer ?? "");
        return sl === "" || activeSourceLayers.has(sl);
      });
      const counts: Record<string, number> = {};
      for (const f of visible) {
        const sl = f.sourceLayer || "";
        counts[sl] = (counts[sl] || 0) + 1;
      }
      return {
        features: visible,
        countsByLayer: counts,
        totalCount: visible.length,
        isLoading: overrides?.isLoading ?? false,
        isOverviewMode: overrides?.isOverviewMode ?? false,
        activeSourceLayers,
      };
    },
    [activeSourceLayers]
  );

  // The Fachobjekte list, derived independently of the active tab so its
  // badge count stays correct while another tab is open.
  const fachobjekteSidebarData = useMemo(() => {
    // Fachobjekte mode with drafts present: splice the expanded draft rows
    // (Standort parent + Leuchten children, same shape used by the Entwürfe
    // tab) in next to the regular viewport features. The viewport list
    // already carries the synthetic draft Standort from the brandnew GeoJSON
    // layer; drop it so the expanded version from `draftSidebarFeatures`
    // wins (otherwise the Standort row would appear twice).
    // Cascade-hidden header + sibling Leuchten of a deletion-override Standort
    // come from the sticky `retainedDeletionFeatures` registry (kept stable by DB
    // id so the rows don't flicker out and back as the map repaints).
    const retainedKeys = new Set(
      retainedDeletionFeatures.map(
        (f) =>
          `${f.sourceLayer || f.properties?._sourceLayer || ""}:${
            f.properties?.id ?? f.id
          }`
      )
    );
    // Viewport features minus rows represented elsewhere: open creation drafts,
    // open non-creation draft copies, the map-only synthetic override header, and
    // any row already held by the retained registry (dropping the latter here is
    // what prevents the capture-render from doubling a row).
    const filterViewport = (list: typeof features) =>
      list.filter((f) => {
        if (f.properties?._isCreation === true) return false;
        // The synthetic deletion-override header is a map-only feature.
        if (f.properties?._isLeuchtenDeletionOverride === true) return false;
        const sl = f.sourceLayer || String(f.properties?._sourceLayer ?? "");
        const dbId = Number(f.properties?.id ?? f.id);
        // Drop the saved (brandnew-FC) copy of a feature that is currently open
        // as a non-creation draft — its row comes from `draftSidebarFeatures`.
        if (
          openDraftDbKeys.size > 0 &&
          Number.isFinite(dbId) &&
          openDraftDbKeys.has(`${sl}:${dbId}`)
        ) {
          return false;
        }
        if (retainedKeys.has(`${sl}:${f.properties?.id ?? f.id}`)) {
          return false;
        }
        // Drop a live Leuchte whose parent Standort is being deleted whole — its
        // row comes from the cascade rows in `draftSidebarFeatures` instead.
        if (
          sl === "leuchten" &&
          cascadeDeletionStandortIds.has(
            String(f.properties?.fk_standort ?? "")
          )
        ) {
          return false;
        }
        return true;
      });
    if (draftSidebarFeatures.length > 0) {
      return buildFromFeatures(
        [
          ...filterViewport(features),
          ...draftSidebarFeatures,
          ...retainedDeletionFeatures,
        ],
        { isLoading, isOverviewMode }
      );
    }
    // No open drafts, but a committed deletion override may still be hiding the
    // cluster — re-add the retained header + siblings so it stays complete.
    if (retainedDeletionFeatures.length > 0) {
      return buildFromFeatures(
        [...filterViewport(features), ...retainedDeletionFeatures],
        {
          isLoading,
          isOverviewMode,
        }
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
    draftSidebarFeatures,
    openDraftDbKeys,
    cascadeDeletionStandortIds,
    retainedDeletionFeatures,
    features,
    countsByLayer,
    totalCount,
    isLoading,
    isOverviewMode,
    activeSourceLayers,
    buildFromFeatures,
  ]);

  // Compute effective sidebar data based on mode
  const effectiveSidebarData = useMemo(() => {
    if (
      sidebarMode === "highlights" &&
      unfilteredHighlights &&
      unfilteredHighlights.length > 0
    ) {
      // Build from the filter-aware copy so toggled-off categories drop out of
      // the Highlights tab. Gate availability on the raw `unfilteredHighlights`
      // above (the tab stays open even if everything is currently filtered out).
      const highlightsList = highlightsForSidebar ?? unfilteredHighlights;
      // Above the limit, fall back to grouped counts only (overview mode) —
      // same threshold the Fachobjekte viewport list uses. Blank the feature
      // list (keeping counts + totalCount) so the sidebar derives its groups
      // purely from countsByLayer, matching the viewport overview exactly —
      // otherwise the distribution loop would also build a stray merged
      // "Standorte / Leuchten" group with a 0 total.
      if (highlightsList.length > OVERVIEW_FEATURE_LIMIT) {
        const base = buildFromFeatures(highlightsList, {
          isOverviewMode: true,
        });
        return { ...base, features: [] };
      }
      return buildFromFeatures(highlightsList);
    }
    if (sidebarMode === "drafts" && draftSidebarFeatures.length > 0) {
      return buildFromFeatures(draftSidebarFeatures);
    }
    return fachobjekteSidebarData;
  }, [
    sidebarMode,
    unfilteredHighlights,
    highlightsForSidebar,
    draftSidebarFeatures,
    buildFromFeatures,
    fachobjekteSidebarData,
  ]);

  // Count for the "Fachobjekte" tab badge. It used to be the raw
  // `useVisibleMapFeatures` total, which ignores the category toggles: a layer
  // still rendered on the map (or returned by the query for a layer the toggle
  // only visually hid) kept counting even though no row for it appears in the
  // list — e.g. switching Leitungen on brought the Standorte back into the
  // number while the list and the Highlights tab stayed without them.
  // Summing the toggle-gated `countsByLayer` is exactly what the group headers
  // in the list do, and it also survives overview mode (where the feature list
  // is blanked but the counts remain).
  const fachobjekteCount = useMemo(() => {
    let sum = 0;
    for (const [layerKey, count] of Object.entries(
      fachobjekteSidebarData.countsByLayer
    )) {
      if (activeSourceLayers.has(layerKey)) sum += count;
    }
    return sum;
  }, [fachobjekteSidebarData, activeSourceLayers]);

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

      // Creation drafts have synthetic fetchedData — skip API fetch. There is
      // no DB record to fetch by their synthetic key, and the draft already
      // carries its synthetic fetchedData. Without this, the override useEffect
      // short-circuits on `!fetchedFeatureData` and the bottom-right InfoBox
      // stays hidden while a creation draft is open.
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

  // Close the datasheet when the selection is cleared in fachobjekte mode.
  // Suppressed while `selectFirstAfterDrafts` is armed — there the empty
  // selection is a transient step towards selecting the first list row.
  useEffect(() => {
    if (
      sidebarVariant === "fachobjekte" &&
      !selectedFeatureId &&
      !selectFirstAfterDrafts
    ) {
      closeDatasheet();
    }
  }, [
    selectedFeatureId,
    sidebarVariant,
    closeDatasheet,
    selectFirstAfterDrafts,
  ]);

  // Check if selected feature is inside visible map boundary.
  // When not visible, auto-open the datasheet to show NoFeatureSelected.
  // Skipped in "highlights" mode: a highlight is deliberately selected from
  // the sidebar and may sit outside the current viewport — there we keep the
  // map and let the overrideSelectedFeature info box render instead of forcing
  // the empty datasheet.
  const [featureOnMap, setFeatureOnMap] = useState(true);

  useEffect(() => {
    if (
      sidebarVariant === "arbeitsauftraege" ||
      sidebarMode !== "fachobjekte" ||
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

    if (!inside) {
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
          delete flatProps.id;
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
            geometry: rawFeature?.geometry ?? reduxGeometryRef.current,
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

  // NOTE: the on-map visual selection is owned solely by LibreMap's external
  // selection watcher (clearVisualSelection + applyVisualSelection on
  // selectedFeatureId). Now that `belis-source` promotes the DB pk to the
  // feature id (`promoteId: "id"` on leuchtenDataLayer), that native path keys
  // feature-state by the stable DB id and MapLibre applies it even for tiles
  // that load after a fly-to — so no manual override is needed here.
  //
  // A previous override effect re-set `feature-state.selected` via
  // querySourceFeatures because, before promoteId, LibreMap selected the wrong
  // (tile-local MVT) id. With promoteId both paths share the same DB id, so
  // that override only fought LibreMap: its cleanup cleared the real selection
  // ("loses selection at the final moment"), and its stale sets survived
  // LibreMap's clear ("two features selected"). Removed intentionally.

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

  // Filter leitungen layers by sub-type (Freileitung, Erdkabel, etc.).
  // Extracted as a callback so the main map AND the datasheet mini-map can both
  // apply it — the mini map carries its own independent layer style instance.
  const applyLeitungenFilter = useCallback(
    (mapInstance: maplibregl.Map) => {
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

      // A geometry-edited Leitung's original vector-tile copy must be hidden by
      // id (its new shape renders via the brandnew preview/FC). This is the only
      // place that filters the leitungen layers — applyHiddenIdsFilter skips
      // them — so fold the id-exclusion in here, composed with the leitungstyp
      // filter via `["all", …]` rather than clobbering it. Only on the regular
      // vector tiles: the brandnew source holds the draft/preview and must stay
      // visible.
      const hiddenLeitungIds = hiddenOriginalIds.leitungen ?? [];
      const idExclusion: maplibregl.FilterSpecification | null =
        hiddenLeitungIds.length > 0
          ? [
              "!",
              [
                "any",
                ["in", ["id"], ["literal", hiddenLeitungIds]],
                ["in", ["get", "id"], ["literal", hiddenLeitungIds]],
              ],
            ]
          : null;
      const combine = (
        a: maplibregl.FilterSpecification | null,
        b: maplibregl.FilterSpecification | null
      ): maplibregl.FilterSpecification | null =>
        a && b ? (["all", a, b] as maplibregl.FilterSpecification) : a ?? b;

      const sources = new Set([namespacedSource, brandnewSource]);
      for (const layer of mapInstance.getStyle()?.layers ?? []) {
        if (
          "source" in layer &&
          sources.has(layer.source as string) &&
          layer.id.toLowerCase().includes("leitungen")
        ) {
          const layerFilter =
            layer.source === namespacedSource
              ? combine(filter, idExclusion)
              : filter;
          try {
            mapInstance.setFilter(layer.id, layerFilter);
          } catch {
            /* layer may not be ready */
          }
        }
      }
    },
    [
      enabledLeitungstypen,
      keyTablesData,
      namespacedSource,
      brandnewSource,
      hiddenOriginalIds,
    ]
  );
  useEffect(() => {
    if (!map) return;
    applyLeitungenFilter(map);
  }, [map, applyLeitungenFilter]);

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
        // leitungen carry their own leitungstyp sub-type filter (set in the
        // effect above). setFilter is last-writer-wins, so this generic hide-by-
        // id pass would clobber it. The leitungstyp effect is the single owner
        // of the leitungen layer filter and folds the hide-by-id exclusion in
        // itself — skip leitungen here.
        if (sourceLayer === "leitungen") continue;
        // standorte: hide the Standort row itself by feature id.
        // leuchten:  hide every Leuchte whose fk_standort points at one of
        //            the hidden Standorte (their icons are stacked on top
        //            of the new draft at the same coordinates), AND any Leuchte
        //            soft-deleted on its own (hidden by its own feature id).
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
          const leuchtenIds = hiddenOriginalIds[sourceLayer] ?? [];
          const clauses: maplibregl.ExpressionSpecification[] = [];
          if (hiddenStandortIds.length > 0) {
            clauses.push([
              "in",
              ["get", "fk_standort"],
              ["literal", hiddenStandortIds],
            ]);
          }
          if (leuchtenIds.length > 0) {
            clauses.push([
              "any",
              ["in", ["id"], ["literal", leuchtenIds]],
              ["in", ["get", "id"], ["literal", leuchtenIds]],
            ]);
          }
          if (clauses.length > 0) {
            filter = [
              "!",
              clauses.length === 1 ? clauses[0] : ["any", ...clauses],
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

    // Brandnew features are a Fachobjekte-only overlay; in Arbeitsaufträge mode
    // keep the source empty so drafts/server brandnew don't leak onto the AA
    // map. The effect re-populates when switching back to Fachobjekte.
    if (sidebarVariant === "arbeitsauftraege") {
      src.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const features: GeoJSON.Feature[] = [...visibleBrandnewFeatures];
    for (const feature of [
      ...draftBrandnewFeatures,
      ...leuchtenDeletionStandortFeatures,
    ]) {
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
    leuchtenDeletionStandortFeatures,
    visibleBrandnewFeatures,
    sidebarVariant,
  ]);

  // --- Z-order fix: the brandnew sub-style is appended after styleY, so by
  // default every brandnew layer stacks above every regular layer — a draft
  // Leitung ends up covering real Leuchten markers. Both main and mini map
  // are corrected the same way via attachBrandnewBelowLeuchten. ---
  useEffect(() => {
    if (!map || !mapReady) return;
    return attachBrandnewBelowLeuchten(map, brandnewSource);
  }, [map, mapReady, brandnewSource]);

  useEffect(() => {
    if (!miniMap || !miniMapReady) return;
    return attachBrandnewBelowLeuchten(miniMap, brandnewSource);
  }, [miniMap, miniMapReady, brandnewSource]);

  // --- Z-order fix: measurement layers (terra-draw `td-*` geometry +
  // `carma-measurements-*` labels/snap) are appended before the basemap is
  // (re)composed by the imperative style, so an opaque background hides the
  // measurement dots — they only show once "Blass" fades the basemap. Keep the
  // whole measurement group on top of both maps via attachMeasurementsOnTop. ---
  useEffect(() => {
    if (!map || !mapReady) return;
    return attachMeasurementsOnTop(map);
  }, [map, mapReady]);

  useEffect(() => {
    if (!miniMap || !miniMapReady) return;
    return attachMeasurementsOnTop(miniMap);
  }, [miniMap, miniMapReady]);

  // Measurements are a Fachobjekte-only annotation overlay (terra-draw `td-*`
  // geometry + `carma-measurements-*` labels/snap live on the main map). Hide
  // the whole group in Arbeitsaufträge mode so it doesn't leak onto the AA map,
  // and in read-only mode (where measurements persisted from a previous editing
  // session must not show on any page), restoring it otherwise. Re-asserts on
  // every style mutation since attachMeasurementsOnTop re-orders (and re-adds)
  // these layers.
  useEffect(() => {
    if (!map || !mapReady) return;
    const desired =
      isReadOnly || sidebarVariant === "arbeitsauftraege" ? "none" : "visible";
    const apply = () => {
      for (const layer of map.getStyle()?.layers ?? []) {
        if (!isMeasurementLayerId(layer.id)) continue;
        try {
          // Only write when changed — setLayoutProperty itself fires
          // `styledata`, so an unconditional write here would loop.
          const current = map.getLayoutProperty(layer.id, "visibility");
          const effective = current ?? "visible";
          if (effective !== desired) {
            map.setLayoutProperty(layer.id, "visibility", desired);
          }
        } catch {
          /* layer may not be ready */
        }
      }
    };
    apply();
    map.on("styledata", apply);
    return () => {
      map.off("styledata", apply);
    };
  }, [map, mapReady, sidebarVariant, isReadOnly]);

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

    // Brandnew features are a Fachobjekte-only overlay; keep the mini-map's
    // brandnew source empty in Arbeitsaufträge mode (see main-map effect above).
    if (sidebarVariant === "arbeitsauftraege") {
      src.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const features: GeoJSON.Feature[] = [...visibleBrandnewFeatures];
    for (const feature of [
      ...draftBrandnewFeatures,
      ...leuchtenDeletionStandortFeatures,
    ]) {
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
    leuchtenDeletionStandortFeatures,
    visibleBrandnewFeatures,
    sidebarVariant,
  ]);

  // Mini-map counterpart of the main-map hidden-IDs filter effect — keeps the
  // mini map's regular vector-tile layers in sync with hiddenOriginalIds.
  useEffect(() => {
    if (!miniMap || !miniMapReady) return;
    applyHiddenIdsFilter(miniMap, hiddenIdsTouchedMiniRef.current);
  }, [miniMap, miniMapReady, applyHiddenIdsFilter]);

  // Mini-map counterpart of the leitungstyp/leitungen-hide filter effect.
  // applyHiddenIdsFilter skips the leitungen source-layer (the leitungstyp
  // effect owns it), so without this the mini map would never hide a
  // geometry-edited Leitung's original vector-tile copy.
  useEffect(() => {
    if (!miniMap || !miniMapReady) return;
    applyLeitungenFilter(miniMap);
  }, [miniMap, miniMapReady, applyLeitungenFilter]);

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

      // Geometry-edit preview: an existing feature whose shape was switched to
      // a measurement renders its pending position as a brandnew GeoJSON
      // feature, and the original vector tile at the old position is hidden —
      // so the moved point is the only thing the user can click. Selecting the
      // GeoJSON feature directly would carry the brandnew source as its
      // sourceLayer, and the datasheet derives `featureType` from that — which
      // makes FeaturesFormsWrapper build the wrong "<sourceLayer>:<dbPK>" draft
      // key and the "Neue Geometrien" selector fall back to "Momentane
      // Geometrie". Instead resolve the real underlying feature (its tile
      // source layer + DB id) and select it centered on the preview position,
      // mirroring handleSidebarFeatureSelect's edit-draft branch.
      const editPreviewHit = hits.find(
        (h) => h.properties?._isGeometryEditPreview === true
      );
      if (editPreviewHit) {
        const sl = String(editPreviewHit.properties?._sourceLayer ?? "");
        const dbPK = String(editPreviewHit.properties?.id ?? "");
        const editDraft =
          store.getState().featuresForms?.drafts[`${sl}:${dbPK}`];
        const previewWgs84 =
          editDraft && editDraft.geometry
            ? convertGeometryToWgs84(editDraft.geometry)
            : undefined;
        if (map && sl && dbPK) {
          const match = map
            .querySourceFeatures(namespacedSource, { sourceLayer: sl })
            .find((f) => f.properties && String(f.properties.id) === dbPK);
          if (match) {
            // A geometry-edit preview always belongs to an open draft, so show
            // it in its native Entwürfe context (the row also lives in the
            // Fachobjekte tab, but the user is mid-edit and expects the drafts
            // tab). activeDraftRow stays null — an edit draft is a single row,
            // not an expanded Standort/Leuchten cluster.
            setSidebarMode("drafts");
            setActiveDraftRow(null);
            selectFeature(
              { source: namespacedSource, sourceLayer: sl, id: match.id },
              (previewWgs84
                ? { ...match, geometry: previewWgs84 }
                : match) as any
            );
            setFeatureOnMap(true);
          }
        }
        // Selection handled imperatively above (or no match found); either way
        // do not fall through to the basemap/Fachobjekt selection below.
        return undefined;
      }

      // Background/basemap layers are queryable vector features too: the
      // Stadtplan (grau/bunt) and Liegenschaftskarte styles plus the optional
      // "Städtische Flurstücke" / "Straßen" layers all render clickable
      // polygons, lines and labels. A click on such a feature (e.g. a
      // settlement polygon or a street name) lands in `hits` even though no
      // BelIS Fachobjekt was clicked. Restrict selection to genuine BelIS
      // source layers; without this, an empty-looking spot that happens to sit
      // on a basemap polygon would "select" that feature and open an empty
      // Datenblatt ("Kein Objekt selektiert"). Returning undefined makes
      // LibreMap clear the selection (per its selectFromHits contract).
      const belisHits = hits.filter(
        (h) =>
          h.sourceLayer != null &&
          (BELIS_SOURCE_LAYERS as readonly string[]).includes(h.sourceLayer)
      );
      if (belisHits.length === 0) {
        // Exception to the rule above: the optional "esave Daten" layer
        // (Smart-Lighting-Controller) is a genuine data layer, not basemap
        // decoration. Its style ships a `carmaconf://infoBoxMapping` function,
        // so returning the hit lets LibreMap run its generic mapping flow and
        // render the sensor's info box (and the style's own
        // `belis-sensoren-selection` layer paints the selection halo).
        // Fachobjekte keep priority: a sensor sits on top of its Standort /
        // Leuchte and must not shadow it, hence only when no BelIS hit exists.
        const esaveHit = hits.find((h) => h.source === esaveSource);
        if (esaveHit) {
          return esaveHit;
        }
        return undefined;
      }

      // When highlighting is active, prefer highlighted features over non-highlighted ones
      let candidates = belisHits;
      if (map) {
        const highlighted = belisHits.filter((h) => {
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
      // If the clicked Fachobjekt has an open (non-creation) draft, show it in
      // the Entwürfe tab — the user is editing it and expects the drafts
      // context. Otherwise clicking an existing Fachobjekt while the Entwürfe
      // tab is active means the user wants to inspect it (its row lives in the
      // Fachobjekte tab), so flip back. Functional setState keeps `sidebarMode`
      // out of the callback deps.
      if (chosen) {
        const chosenKey = `${chosen.sourceLayer ?? ""}:${Number(
          chosen.properties?.id ?? chosen.id
        )}`;
        if (openDraftDbKeys.has(chosenKey)) {
          setSidebarMode("drafts");
        } else {
          setSidebarMode((prev) => (prev === "drafts" ? "fachobjekte" : prev));
        }
      }
      return chosen;
    },
    [
      map,
      sidebarVariant,
      dispatch,
      handleAAFeatureSelect,
      allDraftFeatures,
      store,
      namespacedSource,
      esaveSource,
      selectFeature,
      openDraftDbKeys,
    ]
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

  // --- Geometry-edit selection highlight: the active style follows the current
  // selection between the feature's two on-map representations — the moved
  // brandnew preview (while a measurement is attached) and the original
  // vector-tile feature (for "Momentane Geometrie"). Only the selected feature's
  // preview is highlighted, so navigating to another feature drops the
  // highlight. When the selected edit draft shows its own geometry, the
  // original's MVT highlight is re-asserted here — a prior re-centering
  // selectFeature(clone) clears LibreMap's own selection (it re-applies with the
  // DB id, which is not the MVT feature id for these tiles). Runs on both maps.
  const geometryEditPreviewStateIds = useMemo<number[]>(
    () =>
      draftBrandnewFeatures
        .filter((f) => f.properties?._isGeometryEditPreview === true)
        .map((f) => draftFeatureStateId(String(f.properties?.id))),
    [draftBrandnewFeatures]
  );

  // The DB primary key of the current selection. selectFeature carries the MVT
  // tile feature id in `selectedFeatureId.id` (≠ DB id for these tiles), while
  // drafts, the brandnew preview feature-state, and the draft store are all
  // keyed by the DB id, which lives on `rawFeature.properties.id`. Use that.
  const selectedDbId = useMemo<string | number | undefined>(() => {
    const propId = (
      rawFeature?.properties as Record<string, unknown> | undefined
    )?.id as string | number | undefined;
    return propId ?? selectedFeatureId?.id;
  }, [rawFeature, selectedFeatureId?.id]);

  // The selected feature's open geometry-edit draft (non-creation), if any.
  // Match by DB id rather than the exact `<sourceLayer>:<id>` key: the
  // selection's sourceLayer differs depending on how the feature was selected
  // (the namespaced tile when picked from the sidebar, the brandnew source when
  // its preview point is clicked on the map), but the DB id is stable.
  const selectedEditDraft = useMemo(() => {
    if (selectedDbId == null) return undefined;
    const target = String(selectedDbId);
    for (const [draftKey, draft] of Object.entries(
      allDraftsForMeasurementLink
    )) {
      if (draft.isCreation) continue;
      const draftDbId = draft.featureDbId ?? draftKey.split(":")[1];
      if (String(draftDbId) === target) return draft;
    }
    return undefined;
  }, [selectedDbId, allDraftsForMeasurementLink]);
  const selectedEditHasPreview =
    !!selectedEditDraft &&
    !!selectedEditDraft.geometry &&
    !!selectedEditDraft.geometryKey &&
    !selectedEditDraft.geometryKey.startsWith("current.");
  const selectedEditPreviewStateId =
    selectedEditHasPreview && selectedDbId != null
      ? draftFeatureStateId(String(selectedDbId))
      : undefined;
  // Selected edit draft that is showing its own ("Momentane") geometry.
  const selectedEditAtCurrent = !!selectedEditDraft && !selectedEditHasPreview;

  const applyEditSelection = useCallback(
    (mapInstance: maplibregl.Map | null): (() => void) | undefined => {
      if (!mapInstance) return undefined;

      // Brandnew previews: keep only the selected feature's preview active.
      for (const id of geometryEditPreviewStateIds) {
        try {
          mapInstance.setFeatureState(
            buildFeatureStateTarget(mapInstance, {
              source: brandnewSource,
              id,
            }),
            { selected: id === selectedEditPreviewStateId }
          );
        } catch {
          // source may not exist yet
        }
      }

      // Original vector-tile feature: re-assert the highlight while the edit
      // draft shows its own geometry. querySourceFeatures resolves the MVT id
      // (≠ DB id); retry on sourcedata until the tile is loaded.
      let matchId: string | number | undefined;
      const sourceLayer = selectedFeatureId?.sourceLayer ?? "";
      let detach: (() => void) | undefined;
      if (selectedEditAtCurrent && selectedDbId != null) {
        const dbId = selectedDbId;
        const trySelect = () => {
          try {
            const match = mapInstance
              .querySourceFeatures(namespacedSource, { sourceLayer })
              .find(
                (f) => f.properties && String(f.properties.id) === String(dbId)
              );
            if (match?.id != null) {
              matchId = match.id;
              mapInstance.setFeatureState(
                { source: namespacedSource, sourceLayer, id: match.id },
                { selected: true }
              );
            }
          } catch {
            // source/layer may not exist yet
          }
        };
        trySelect();
        mapInstance.on("sourcedata", trySelect);
        detach = () => mapInstance.off("sourcedata", trySelect);
      }

      return () => {
        detach?.();
        if (selectedEditPreviewStateId != null) {
          try {
            mapInstance.setFeatureState(
              buildFeatureStateTarget(mapInstance, {
                source: brandnewSource,
                id: selectedEditPreviewStateId,
              }),
              { selected: false }
            );
          } catch {
            // source may not exist yet
          }
        }
        if (matchId != null) {
          try {
            mapInstance.setFeatureState(
              { source: namespacedSource, sourceLayer, id: matchId },
              { selected: false }
            );
          } catch {
            // source may not exist yet
          }
        }
      };
    },
    [
      brandnewSource,
      namespacedSource,
      geometryEditPreviewStateIds,
      selectedEditPreviewStateId,
      selectedEditAtCurrent,
      selectedDbId,
      selectedFeatureId?.sourceLayer,
    ]
  );

  useEffect(() => {
    if (!map || !mapReady) return;
    return applyEditSelection(map);
  }, [map, mapReady, applyEditSelection]);
  useEffect(() => {
    if (!miniMap || !miniMapReady) return;
    return applyEditSelection(miniMap);
  }, [miniMap, miniMapReady, applyEditSelection]);

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

  // MapLibre only auto-resizes on `window` resize events, not when its own
  // container changes size. On first load the map mounts while its container is
  // still 0x0 (the route wrapper in Layout is `display:none` until the map route
  // activates, and the layout has not settled yet), so the canvas locks to that
  // tiny size and only corrects on the next window resize / interaction — the
  // "small map until I touch it" symptom. Observe the map's actual container and
  // resize whenever its box changes (hidden -> visible, sidebar width changes,
  // window resize). A rAF coalesces the burst of callbacks during initial layout
  // into a single resize.
  useEffect(() => {
    if (!map) return;
    const container = map.getContainer();
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => map.resize());
    });
    observer.observe(container);
    // Catch the case where the container already has its final size by the time
    // the map instance is wired up (observer only fires on subsequent changes).
    map.resize();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
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

  // Database primary key of the selected feature, used by the sidebar's
  // pk-match branch to highlight the selected row.
  //
  // Prefer the id carried by the *live* selection: `sidebarSelectedFeatureId`
  // updates synchronously on click and — now that the source promotes the DB
  // pk to the feature id (`promoteId: "id"`) — already IS the database pk.
  // `selectedFeature` / `rawFeature` only catch up after the info-box data
  // resolves; deriving the pk from them alone let the sidebar briefly show TWO
  // selected rows during a switch (the new row matched by id, the old row still
  // matched by this now-stale pk). Fall back to the async sources only when the
  // live id isn't a plain numeric pk (e.g. a creation-draft key).
  const selectedDatabaseId = useMemo(() => {
    const liveId = sidebarSelectedFeatureId?.id;
    if (
      typeof liveId === "number" ||
      (typeof liveId === "string" && /^\d+$/.test(liveId))
    ) {
      return liveId;
    }
    return (
      selectedFeature?.properties?.sourceProps?.id ??
      rawFeature?.properties?.id ??
      null
    );
  }, [sidebarSelectedFeatureId, selectedFeature, rawFeature]);

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
      // them by the same markers `expandDraftSidebarFeatures` stamps — plus a
      // geometry-edit draft, whose Fachobjekte row carries no draft markers but
      // matches an open non-creation draft by "<sourceLayer>:<dbId>". Flip the
      // sidebar into Entwürfe mode so the selected row stays visible in its
      // native context, and route through the existing drafts branch.
      const hasOpenDraft = openDraftDbKeys.has(
        `${feature.sourceLayer ?? ""}:${Number(
          feature.properties?.id ?? feature.id
        )}`
      );
      const isDraftRow =
        feature.properties?._isCreation === true ||
        typeof feature.properties?._draftKey === "string" ||
        hasOpenDraft;
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

        // If this feature has an open geometry-edit draft with a moved preview,
        // center the selection on the preview position rather than the original
        // tile geometry. rawFeature drives the mini-map center, so without this
        // re-selecting the draft (e.g. after visiting another feature) would
        // snap the mini-map back to the now-empty original spot.
        const editDraft =
          store.getState().featuresForms?.drafts[`${sl}:${dbPK}`];
        const previewWgs84 =
          editDraft &&
          !editDraft.isCreation &&
          editDraft.geometry &&
          editDraft.geometryKey &&
          !editDraft.geometryKey.startsWith("current.")
            ? convertGeometryToWgs84(editDraft.geometry)
            : undefined;

        // The regular MVT tiles are server-cached and keep serving a
        // geometry-edited feature at its pre-edit position until the tiles are
        // regenerated. The brandnew source already carries the saved (new)
        // geometry, so prefer it for the mini-map center when re-opening the
        // feature from the Entwürfe tab. An unsaved in-draft move
        // (previewWgs84) still wins over the saved brandnew geometry.
        const brandnewGeom = brandnewFc.features.find(
          (f) =>
            String(f.properties?.id ?? "") === dbPK &&
            String(f.properties?._sourceLayer ?? "") === sl
        )?.geometry;
        const effectiveGeometry = previewWgs84 ?? brandnewGeom;

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
              (effectiveGeometry
                ? { ...match, geometry: effectiveGeometry }
                : match) as any
            );
            return;
          }
        }

        // Feature not in viewport — dispatch stored raw feature to Redux
        // and pass it as rawFeature for the selection context.
        // The draft feature already has the correct MapGeoJSON structure.
        const fallbackFeature = effectiveGeometry
          ? { ...feature, id: dbPK, geometry: effectiveGeometry }
          : { ...feature, id: dbPK };
        dispatch(setSelectedFeature({ ...fallbackFeature, selected: true }));
        selectFeature(identifier, fallbackFeature as any);
        return;
      }

      // Normal flow for fachobjekte/highlights
      setActiveDraftRow(null);

      // `identifier.id` is an MVT tile id in Fachobjekte mode (rows come from
      // queryRenderedFeatures) but a database primary key in Highlights mode
      // (expert / street search rows carry `id: <dbId>`). The `belis-source`
      // vector tiles are served WITHOUT `promoteId`, so `setFeatureState` keys
      // on the tile-local MVT id — passing a DB id there aliases every feature
      // that happens to share that integer in each loaded tile, painting
      // phantom `mauerlaschen-selection` icons across the map (and shifting
      // them as tiles reload on zoom). Resolve the DB id to the real MVT id via
      // the loaded tiles first — exactly like the drafts branch above.
      if (map) {
        const sl = identifier.sourceLayer ?? "";
        const dbPK = String(feature.properties?.id ?? identifier.id);
        const match = map
          .querySourceFeatures(namespacedSource, { sourceLayer: sl })
          .find((f) => f.properties && String(f.properties.id) === dbPK);
        if (match) {
          selectFeature(
            { source: identifier.source, sourceLayer: sl, id: match.id },
            match as any
          );
          return;
        }
      }

      selectFeature(identifier, feature as any);
    },
    [
      selectFeature,
      sidebarMode,
      dispatch,
      map,
      namespacedSource,
      store,
      openDraftDbKeys,
      brandnewFc,
    ]
  );

  // After a draft is cancelled/removed, select the next remaining draft.
  // If no drafts remain, stay in the Datenblatt and fall back to the first row
  // of the list (armed via `selectFirstAfterDrafts`, resolved once the list has
  // re-rendered without the removed draft).
  const handleSelectNextDraft = useCallback(
    (removedFeatureId: string) => {
      if (sidebarMode !== "drafts") {
        clearMapSelection();
        openDatasheet();
        setSelectFirstAfterDrafts(true);
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
        openDatasheet();
        setSelectFirstAfterDrafts(true);
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
      openDatasheet,
    ]
  );

  // Resolve the armed "select the first row" request from a draft removal.
  // Waits for the sidebar to leave the Entwürfe tab (the effect above flips it
  // back to Fachobjekte once the last draft is gone) and for the list to carry
  // a row — until then the Datenblatt shows the "kein Objekt selektiert" hint
  // rather than dropping back to the map.
  useEffect(() => {
    if (!selectFirstAfterDrafts) return;
    // The user left the Datenblatt or picked something themselves — disarm.
    if (!isDatasheetOpen || selectedFeatureId) {
      setSelectFirstAfterDrafts(false);
      return;
    }
    if (sidebarMode === "drafts") return;
    const first = sidebarOrderedFeaturesRef.current[0];
    if (!first) return;
    setSelectFirstAfterDrafts(false);
    handleSidebarFeatureSelect(
      {
        source: first.source ?? "",
        sourceLayer: first.sourceLayer ?? "",
        id: first.id,
      },
      first
    );
  }, [
    selectFirstAfterDrafts,
    isDatasheetOpen,
    selectedFeatureId,
    sidebarMode,
    // Re-run when the rendered list changes; the row order itself is read from
    // the ref the sidebar keeps in sync.
    effectiveSidebarData,
    handleSidebarFeatureSelect,
  ]);

  useEffect(() => {
    setOnSelectNextDraft(() => handleSelectNextDraft);
    return () => setOnSelectNextDraft(undefined);
  }, [handleSelectNextDraft, setOnSelectNextDraft]);

  // Bulk draft actions ("Alle verwerfen" / "Alle speichern") drop every draft
  // in one go, so there is no "next draft" to walk to — they used to close the
  // Datenblatt instead. Stay in it: a creation draft's selection dies with the
  // draft (clear it and fall back to the first list row), while an ordinary
  // feature keeps its selection and just re-reads the server values.
  const handleDraftsCleared = useCallback(() => {
    openDatasheet();
    const selectionWasCreationDraft =
      selectedFeatureId?.id != null &&
      isCreationDraftKey(String(selectedFeatureId.id));
    if (selectionWasCreationDraft) {
      clearMapSelection();
      setSelectFirstAfterDrafts(true);
    }
  }, [selectedFeatureId, clearMapSelection, openDatasheet]);

  useEffect(() => {
    setOnDraftsCleared(() => handleDraftsCleared);
    return () => setOnDraftsCleared(undefined);
  }, [handleDraftsCleared, setOnDraftsCleared]);

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

  const effectiveOverride = measurementOverride ?? overrideSelectedFeature;
  const hideInfoboxZoom =
    (!!effectiveOverride && !effectiveOverride.geometry) ||
    (!!rawFeature && !rawFeature.geometry);

  return (
    <div
      className={
        "relative flex" + (hideInfoboxZoom ? " belis-hide-infobox-zoom" : "")
      }
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
          expertSort={highlightExpertSort}
          // Frozen search results, used as the rank source when expert sort is
          // active. Passing `highlightResults` (shell state) rather than the
          // mutable `unfilteredHighlights` means dismisses don't reshuffle
          // ranks — a dismissed feature keeps its slot instead of dropping to
          // the street-sort tail.
          expertRankFeatures={highlightResults}
          // Highlights list is already in backend expert-sort order — tell the
          // sidebar to keep it as-is instead of re-sorting. Fachobjekte gets
          // the same order via `expertRankFeatures` + `expertSort`.
          preserveOrder={
            sidebarMode === "highlights" && highlightExpertSort.length > 0
          }
          hasHighlights={hasHighlights}
          hasDrafts={!isReadOnly && draftFeaturesCount > 0}
          fachobjekteCount={fachobjekteCount}
          highlightCount={highlightsForSidebar?.length ?? undefined}
          draftsCount={draftFeaturesCount}
          onFeatureDismiss={handleSidebarDismiss}
          orderedFeaturesRef={sidebarOrderedFeaturesRef}
          auswahlActiveSourceLayers={activeSourceLayers}
          namespacedSource={namespacedSource}
          brandnewSource={brandnewSource}
          unfilteredHighlights={unfilteredHighlights}
          setUnfilteredHighlights={setUnfilteredHighlights}
          measurements={isReadOnly ? [] : measurementsForSidebar}
          selectedMeasurementId={selectedMeasurementId}
          onMeasurementSelect={(id) => dispatch(selectMeasurement(id))}
          onMeasurementsDeleteAll={
            isReadOnly
              ? undefined
              : () => {
                  // terra-draw owns its internal store; clearing it fires
                  // onChange → replaceMeasurements([]) which also wipes redux
                  // (and through redux-persist, localForage). Drop any current
                  // selection alongside since the selected feature is gone.
                  measurementHostRef.current?.clearAll();
                  dispatch(selectMeasurement(null));
                }
          }
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
              markerSymbolSize={BELIS_MARKER_SYMBOL_SIZE}
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
                markerSymbolSize={BELIS_MARKER_SYMBOL_SIZE}
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
                  isReadOnly ? undefined : (
                    <DrawModeControls
                      active={drawMode}
                      onSelect={(mode) =>
                        setDrawMode((prev) => (prev === mode ? "none" : mode))
                      }
                      snapping={{
                        enabled: snappingEnabled,
                        onToggle: () =>
                          dispatch(setSnappingEnabled(!snappingEnabled)),
                      }}
                    />
                  )
                }
              />
              {/* Provider wraps the host so descendants can use the new
                  useMeasurements() context. Redux dispatch still happens
                  via the imperative onChange below because replaceMeasurements
                  also re-syncs the shared selectedFeature slot (the simple
                  setMeasurements bridge would lose that). */}
              <MeasurementsProvider>
                <MeasurementHost
                  ref={measurementHostRef}
                  mode={drawMode}
                  snapping={snappingEnabled}
                  // Tighten terra-draw's click-to-finish tolerance (native
                  // default 40px) so short segments drawn along a building edge
                  // near a snapped corner don't terminate the line prematurely
                  // (#691). Kept <= the snap radius (20px).
                  closePointerDistancePx={10}
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
              </MeasurementsProvider>
              <MapLibrePrintPreview
                map={map}
                active={printActive}
                orientation={printOrientation}
                scale={printScale}
                dpi={printDpi}
                name={printName}
                layers={printLayers}
                resolveLayers={resolvePrintLayers}
                redrawTrigger={printRedraw}
                keepRectangle={printIfMapPrinted}
                loading={printLoading}
                onClose={() => dispatch(changePrintActive(false))}
                onLoadingChange={(loading) =>
                  dispatch(changePrintLoading(loading))
                }
                onError={(message) => dispatch(changePrintError(message))}
                onPrintStart={() => dispatch(changeIfMapPrinted(true))}
                onRequestRedraw={() => {
                  dispatch(changeIfMapPrinted(false));
                  dispatch(changeRedrawPreview(!printRedraw));
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
