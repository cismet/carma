import { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
  arbeitsauftraegeDataLayer,
  BELIS_STYLE_URL,
  BELIS_ORIGINAL_SOURCE,
  BELIS_SOURCE_LAYERS,
  ARBEITSAUFTRAEGE_STYLE_URL,
} from "../../config/mapLayerConfigs";
import type { LibreLayer } from "@carma-mapping/engines/maplibre";
import { AppDispatch, type RootState } from "../../store";
import BelisSidebar from "../ui/BelisSidebar";
import ArbeitsauftraegeSidebar from "../ui/ArbeitsauftraegeSidebar";
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
} from "@carma-mapping/engines/maplibre";
import type maplibregl from "maplibre-gl";
import BelisDatasheetView from "../ui/BelisDatasheetView";
import ArbeitsauftraegeFormsWrapper from "../ui/featuresForm/ArbeitsauftraegeFormsWrapper";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMap } from "@fortawesome/free-solid-svg-icons";
import {
  FeatureType,
  fetchFeatureById,
  fetchArbeitsauftragById,
  fetchArbeitsauftraegeByTeam,
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
  getSearchActive,
  getAAFeatures,
  setSelectedAPId,
  setApOpenedFrom,
  getApOpenedFrom,
  clearSelection,
  getAALoading,
  getDraftMode,
} from "../../store/slices/arbeitsauftraege";
import { getSelectedTeamName } from "../../store/selectors";
import { buildApGeoJson } from "../../helper/buildApGeoJson";
import { debugLayers, apInfoboxMapping } from "../../config/debugLayers";
import type { ArbeitsauftragTileFeature } from "../../store/slices/arbeitsauftraege";
import { transformGqlToTileFeatures } from "../../helper/transformArbeitsauftraege";

const LIST_WIDTH = 300;

/** Debug flag: translucent main map + red mini-map border, mini-map always visible */
const MINI_MAP_DEBUGGING = false;

import type { SidebarFeature } from "../ui/BelisSidebar";

import {
  getAllDraftFeatures,
  getDraftFeaturesCount,
  getGlobalEditMode,
} from "../../store/slices/featuresForms";
import {
  getAllAADrafts,
  getAllAPDrafts,
} from "../../store/slices/arbeitsauftraegeDrafts";
import { prepareDraftFeatures } from "../../helper/prepareDraftFeatures";
import { useApLassoSelection } from "../../hooks/useApLassoSelection";

type SidebarMode = "fachobjekte" | "highlights" | "drafts";

interface BelisMapLibWrapperProps {
  mapSizes: { width: number; height: number };
  activeSourceLayers: Set<string>;
  highlightResults: SidebarFeature[] | null;
  lassoActive: boolean;
  onLassoDeactivate?: () => void;
  apLassoActive: boolean;
  onApLassoDeactivate?: () => void;
  sidebarVariant: "fachobjekte" | "arbeitsauftraege";
}

const BelisMapLibWrapper = ({
  mapSizes,
  activeSourceLayers,
  highlightResults,
  lassoActive,
  onLassoDeactivate,
  apLassoActive,
  onApLassoDeactivate,
  sidebarVariant,
}: BelisMapLibWrapperProps) => {
  const dispatch: AppDispatch = useDispatch();
  const store = useStore<RootState>();
  const jwt = useSelector(getJWT);
  const featureDataVersion = useSelector(getFeatureDataVersion);
  const enabledLeitungstypen = useSelector(getEnabledLeitungstypen);
  const keyTablesData = useSelector(getKeyTablesData);
  const reduxSelectedFeature = useSelector(getReduxSelectedFeature);
  // Ref for geometry fallback in override effect — avoids adding
  // reduxSelectedFeature to deps (which would cause spurious re-fires).
  const reduxGeometryRef = useRef<any>(null);
  reduxGeometryRef.current = reduxSelectedFeature?.geometry ?? null;
  const { map } = useLibreContext();
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

  // Arbeitsauftraege: separate namespaced source (same tile set, different style URL)
  const arbeitsauftraegeNamespacedSource = `${slugifyUrl(
    ARBEITSAUFTRAEGE_STYLE_URL
  )}::${BELIS_ORIGINAL_SOURCE}`;
  const selectedAAId = useSelector(getSelectedAAId);
  const selectedAAData = useSelector(getSelectedAAData);
  const activeAATab = useSelector(getActiveAATab);
  const selectedAPId = useSelector(getSelectedAPId);
  const apOpenedFrom = useSelector(getApOpenedFrom);
  const aaLoading = useSelector(getAALoading);
  const globalEditMode = useSelector(getGlobalEditMode);

  // Team filter: resolve selectedTeamId → team name for map layer filtering
  const selectedTeamId = useSelector(getSelectedTeamId);
  const selectedTeamName = useSelector(getSelectedTeamName);
  const searchActive = useSelector(getSearchActive);
  const aaFeatures = useSelector(getAAFeatures);
  const aaDrafts = useSelector(getAllAADrafts);
  const apDrafts = useSelector(getAllAPDrafts);
  const draftMode = useSelector(getDraftMode);

  // Stable list of IDs for map filtering when search is active
  const searchFilterIds = useMemo(
    () => (searchActive ? aaFeatures.map((f) => f.id) : null),
    [searchActive, aaFeatures]
  );

  const highlightSources = useMemo(
    () => [
      { source: namespacedSource, sourceLayers: [...BELIS_SOURCE_LAYERS] },
    ],
    [namespacedSource]
  );

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

  const handleHighlightToggle = useCallback(
    (feature: maplibregl.MapGeoJSONFeature) => {
      const toSidebarFeature = (f: Record<string, any>): SidebarFeature =>
        Object.assign(f, { original: f }) as unknown as SidebarFeature;

      // Determine if this is a standort with sibling leuchten to expand
      const isStandort = feature.sourceLayer === "standorte";
      let siblingLeuchten: maplibregl.GeoJSONFeature[] = [];
      if (isStandort && map) {
        const standortId = String(feature.properties?.id ?? "");
        if (standortId) {
          siblingLeuchten = map
            .querySourceFeatures(namespacedSource, { sourceLayer: "leuchten" })
            .filter(
              (f) => String(f.properties?.fk_standort ?? "") === standortId
            );
        }
      }

      // Sync sibling leuchten in the highlight context BEFORE updating adjustedHighlights.
      // toggleFeatureHighlight already toggled the standort itself (called by useMapHighlighting
      // before onToggle fires), so criteria.toggledFeatures already reflects the standort's state.
      // Read direction from the ref: if standort is now toggled ON, we add siblings; if OFF, remove.
      if (isStandort && siblingLeuchten.length > 0) {
        const standortKey = `${feature.source}::standorte::${feature.id}`;
        const adding = criteria.toggledFeatures.has(standortKey);
        ensureToggledFeatures(
          siblingLeuchten.map((l) => ({
            source: namespacedSource,
            sourceLayer: "leuchten",
            id: l.id!, // MVT tile ID, matching what matchesCriteria uses
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

      // Remove from map highlight state
      if (map) {
        const sourceFeatures = map.querySourceFeatures(namespacedSource, {
          sourceLayer: sl,
        });
        const match = sourceFeatures.find(
          (f) => String(f.properties?.id ?? "") === dbId
        );
        if (match?.id != null) {
          ensureToggledFeatures(
            [{ source: namespacedSource, sourceLayer: sl, id: match.id }],
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

  // AP lasso selection (Arbeitsaufträge mode)
  // useApLassoSelection({
  //   map,
  //   active: apLassoActive,
  //   onDeactivate: onApLassoDeactivate,
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

  // Draft features are stored as raw MapGeoJSON features (same structure as
  // sidebar features from the map). No reconstruction needed — just extract
  // and pass through prepareDraftFeatures for fk_standort normalization.
  const draftSidebarFeatures = useMemo(() => {
    const raw = allDraftFeatures
      .filter(({ feature }) => feature != null)
      .map(({ feature }) => feature as SidebarFeature);
    return prepareDraftFeatures(raw);
  }, [allDraftFeatures]);

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
      ],
      highlightedOnly: highlightingActive,
      refreshTrigger: highlightVersion,
      showDebugBounds: showRaw,
    });

  // Sidebar mode: "karte" shows viewport features, "highlights" shows highlighted features
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("fachobjekte");

  // When highlighting is killed, reset to Karte mode and clear highlight collection
  useEffect(() => {
    if (!highlightingActive) {
      setSidebarMode("fachobjekte");
      setAdjustedHighlights(null);
    }
  }, [highlightingActive]);

  const hasHighlights =
    highlightingActive ||
    (adjustedHighlights != null && adjustedHighlights.length > 0);

  // Compute effective sidebar data based on mode
  const effectiveSidebarData = useMemo(() => {
    if (
      sidebarMode === "highlights" &&
      adjustedHighlights &&
      adjustedHighlights.length > 0
    ) {
      // Derive countsByLayer from search results
      const counts: Record<string, number> = {};
      for (const f of adjustedHighlights) {
        const sl = f.sourceLayer || "";
        counts[sl] = (counts[sl] || 0) + 1;
      }
      const total = adjustedHighlights.length;
      // Include all layers present in results
      const layers = new Set([...activeSourceLayers, ...Object.keys(counts)]);
      return {
        features: adjustedHighlights,
        countsByLayer: counts,
        totalCount: total,
        isLoading: false,
        isOverviewMode: false,
        activeSourceLayers: layers,
      };
    }
    if (sidebarMode === "drafts" && draftSidebarFeatures.length > 0) {
      const counts: Record<string, number> = {};
      for (const f of draftSidebarFeatures) {
        const sl = f.sourceLayer || "";
        counts[sl] = (counts[sl] || 0) + 1;
      }
      const layers = new Set([...activeSourceLayers, ...Object.keys(counts)]);
      return {
        features: draftSidebarFeatures,
        countsByLayer: counts,
        totalCount: draftSidebarFeatures.length,
        isLoading: false,
        isOverviewMode: false,
        activeSourceLayers: layers,
      };
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
      if (!jwt) return;

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
  }, [selectedFeature, selectedFeatureId, jwt, featureDataVersion]);

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
  useEffect(() => {
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

        // Flatten to vector-tile-like props so createInfoBoxInfo.js can process them
        const flatProps = flattenGqlRecord(record, sourceLayer);

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
    layers.push(leuchtenDataLayer);
    layers.push(arbeitsauftraegeDataLayer);

    return layers;
  }, [
    activeBackgroundLayer,
    backgroundLayerOpacities,
    activeAdditionalLayers,
    additionalLayerOpacities,
    inPaleMode,
  ]);

  // Toggle AA layer visibility based on active route (hide when AP tab is active)
  useEffect(() => {
    if (!map) return;
    const toggle = () => {
      const visible =
        sidebarVariant === "arbeitsauftraege" && activeAATab !== "ap";
      for (const layer of map.getStyle()?.layers ?? []) {
        if (
          "source" in layer &&
          layer.source === arbeitsauftraegeNamespacedSource
        ) {
          try {
            map.setLayoutProperty(
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
    toggle();
    map.on("styledata", toggle);
    return () => {
      map.off("styledata", toggle);
    };
  }, [sidebarVariant, activeAATab, map, arbeitsauftraegeNamespacedSource]);

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

    for (const layer of map.getStyle()?.layers ?? []) {
      if (
        "source" in layer &&
        layer.source === namespacedSource &&
        layer.id.toLowerCase().includes("leitungen")
      ) {
        try {
          map.setFilter(layer.id, filter);
        } catch {
          /* layer may not be ready */
        }
      }
    }
  }, [map, enabledLeitungstypen, keyTablesData, namespacedSource]);

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

  // --- Arbeitsauftraege: GraphQL fetch when team is selected ---
  useEffect(() => {
    if (sidebarVariant !== "arbeitsauftraege" || selectedTeamId == null || !jwt)
      return;

    let cancelled = false;

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
  }, [sidebarVariant, selectedTeamId, jwt, dispatch]);

  // --- Arbeitsauftraege: extract tile features into Redux (fallback when no team and no search) ---
  useEffect(() => {
    if (sidebarVariant !== "arbeitsauftraege" || !map) return;
    // When a team is selected, GraphQL handles sidebar data
    if (selectedTeamId != null) return;
    // When search is active, don't overwrite search results with tile extraction
    if (searchActive) return;

    const extractFeatures = () => {
      try {
        const raw = map.querySourceFeatures(arbeitsauftraegeNamespacedSource, {
          sourceLayer: "arbeitsauftraege",
        });
        const seen = new Map<number, ArbeitsauftragTileFeature>();
        for (const f of raw) {
          const id = Number(f.properties?.id);
          if (id != null && !seen.has(id)) {
            seen.set(id, {
              id,
              nummer: (f.properties?.nummer as string) ?? "",
              team: (f.properties?.team as string) ?? "",
              angelegt_am: (f.properties?.angelegt_am as string) ?? "",
              angelegt_von: (f.properties?.angelegt_von as string) ?? "",
              total_protokolle: Number(f.properties?.total_protokolle) || 0,
              pct_offen: Number(f.properties?.pct_offen) || 0,
              pct_in_bearbeitung: Number(f.properties?.pct_in_bearbeitung) || 0,
              pct_erledigt: Number(f.properties?.pct_erledigt) || 0,
              pct_fehlmeldung: Number(f.properties?.pct_fehlmeldung) || 0,
              geometry: f.geometry,
            });
          }
        }
        dispatch(setAAFeatures([...seen.values()]));
      } catch {
        // source may not be loaded yet
      }
    };

    map.on("sourcedata", extractFeatures);
    map.on("moveend", extractFeatures);
    // Initial extraction
    extractFeatures();

    return () => {
      map.off("sourcedata", extractFeatures);
      map.off("moveend", extractFeatures);
    };
  }, [
    sidebarVariant,
    map,
    selectedTeamId,
    searchActive,
    arbeitsauftraegeNamespacedSource,
    dispatch,
  ]);

  // --- Arbeitsauftraege: filter map layers by selected team, search results, or draft mode ---
  const aaDraftIds = useMemo(
    () => Object.keys(aaDrafts).map(Number),
    [aaDrafts]
  );

  useEffect(() => {
    if (sidebarVariant !== "arbeitsauftraege" || !map) return;

    const applyFilter = () => {
      const style = map.getStyle();
      if (!style?.layers) return;
      for (const layer of style.layers) {
        if (
          "source" in layer &&
          layer.source === arbeitsauftraegeNamespacedSource
        ) {
          try {
            if (draftMode && aaDraftIds.length > 0) {
              // Draft mode: show only AA features with drafts
              map.setFilter(layer.id, [
                "in",
                ["get", "id"],
                ["literal", aaDraftIds],
              ]);
            } else if (draftMode) {
              // Draft mode but no AA drafts: hide all
              map.setFilter(layer.id, ["==", ["get", "id"], -1]);
            } else if (searchFilterIds) {
              // Search active: show only matching AA polygons by id
              map.setFilter(layer.id, [
                "in",
                ["get", "id"],
                ["literal", searchFilterIds],
              ]);
            } else if (selectedTeamName) {
              map.setFilter(layer.id, [
                "==",
                ["get", "team"],
                selectedTeamName,
              ]);
            } else {
              map.setFilter(layer.id, null);
            }
          } catch {
            // layer may not be ready yet
          }
        }
      }
    };

    applyFilter();
    map.on("styledata", applyFilter);

    return () => {
      map.off("styledata", applyFilter);
    };
  }, [
    sidebarVariant,
    map,
    selectedTeamName,
    searchFilterIds,
    arbeitsauftraegeNamespacedSource,
    draftMode,
    aaDraftIds,
  ]);

  // --- Arbeitsauftraege: selection feature-state on map ---
  const prevAAIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (sidebarVariant !== "arbeitsauftraege" || !map) return;

    const prevId = prevAAIdRef.current;
    if (prevId != null && prevId !== selectedAAId) {
      try {
        map.setFeatureState(
          {
            source: arbeitsauftraegeNamespacedSource,
            sourceLayer: "arbeitsauftraege",
            id: prevId,
          },
          { selected: false }
        );
      } catch {
        // ignore
      }
    }
    if (selectedAAId != null) {
      try {
        map.setFeatureState(
          {
            source: arbeitsauftraegeNamespacedSource,
            sourceLayer: "arbeitsauftraege",
            id: selectedAAId,
          },
          { selected: true }
        );
      } catch {
        // ignore
      }
    }
    prevAAIdRef.current = selectedAAId;
  }, [sidebarVariant, map, selectedAAId, arbeitsauftraegeNamespacedSource]);

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
  }, [selectedAAId, jwt, dispatch]);

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
        (h) =>
          h.sourceLayer === "arbeitsauftraege" ||
          h.layer?.id === "arbeitsauftraege_fill" ||
          h.layer?.id === "arbeitsauftraege_outline" ||
          h.source === AP_SOURCE
      );
      if (!hasRelevant) {
        dispatch(clearSelection());
      }
    };

    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
    };
  }, [sidebarVariant, activeAATab, map, dispatch]);

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

  // Build GeoJSON from AP drafts for draft mode map rendering
  const apDraftGeoJson = useMemo((): GeoJSON.FeatureCollection => {
    const features: GeoJSON.Feature[] = Object.entries(apDrafts)
      .filter(([, d]) => d.geometry != null)
      .map(([id, d]) => ({
        type: "Feature" as const,
        geometry: d.geometry!,
        properties: {
          id: Number(id),
          featureType: d.featureType ?? "tdta_standort_mast",
          protokollnummer: d.meta?.protokollnummer ?? id,
          shortname: d.meta?.shortname ?? d.meta?.fachobjektType ?? "",
          veranlassung: d.meta?.veranlassung ?? "",
          headerColor: d.meta?.headerColor ?? "#9CA3AF",
          datum: d.meta?.datum ?? "",
        },
      }));
    return { type: "FeatureCollection", features };
  }, [apDrafts]);

  useEffect(() => {
    if (!map) return;

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

    // Add layers derived from debugLayers, rewritten for the AP GeoJSON source
    for (const layer of debugLayers) {
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
    sidebarVariant,
    activeAATab,
    selectedAAData,
    draftMode,
    apDraftGeoJson,
  ]);

  // Mini-map state
  const [miniMap, setMiniMap] = useState<maplibregl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const {
    containerStyle,
    debugOutlineStyle,
    showCloseButton,
    miniMapContainerRef,
  } = useDatasheetMiniMap({
    mainMap: map,
    miniMap,
    containerRef: mapContainerRef,
    debug: MINI_MAP_DEBUGGING,
  });

  const handleMiniMapReady = useCallback((m: maplibregl.Map) => {
    setMiniMap(m);
  }, []);

  // --- Mini-map: toggle AA vector-tile layer visibility (hide when AP tab) ---
  useEffect(() => {
    if (!miniMap || sidebarVariant !== "arbeitsauftraege") return;
    const toggle = () => {
      const visible = activeAATab !== "ap";
      for (const layer of miniMap.getStyle()?.layers ?? []) {
        if (
          "source" in layer &&
          layer.source === arbeitsauftraegeNamespacedSource
        ) {
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
    toggle();
    miniMap.on("styledata", toggle);
    return () => {
      miniMap.off("styledata", toggle);
    };
  }, [sidebarVariant, activeAATab, miniMap, arbeitsauftraegeNamespacedSource]);

  // --- Mini-map: add AP GeoJSON overlay when in AP tab ---
  const MINI_AP_LAYER_PREFIX = "mini-ap-";
  useEffect(() => {
    if (!miniMap) return;

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
      sidebarVariant === "arbeitsauftraege" &&
      activeAATab === "ap" &&
      selectedAAData != null;

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

    for (const layer of debugLayers) {
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

    return removeLayers;
  }, [miniMap, sidebarVariant, activeAATab, selectedAAData]);

  // --- Mini-map: sync AP feature-state selection ---
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
  }, [miniMap, selectedAPId]);

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
        const aaHit = hits.find(
          (h) =>
            h.sourceLayer === "arbeitsauftraege" ||
            h.layer?.id === "arbeitsauftraege_fill" ||
            h.layer?.id === "arbeitsauftraege_outline"
        );
        if (aaHit) {
          const aaId = Number(aaHit.properties?.id ?? aaHit.id);
          if (aaId != null) {
            dispatch(setSelectedAAId(aaId));
          }
          // Return undefined to prevent normal selection flow
          return undefined;
        }
        // Non-AA feature clicked while in AA mode — ignore
        return undefined;
      }

      // When highlighting is active, prefer highlighted features over non-highlighted ones
      let candidates = hits;
      if (map) {
        const highlighted = hits.filter((h) => {
          if (h.id == null) return false;
          try {
            const state = map.getFeatureState({
              source: h.source,
              sourceLayer: h.sourceLayer,
              id: h.id,
            });
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
      if (standorte.length > 0) {
        return standorte[0];
      }
      return candidates[0];
    },
    [map, sidebarVariant, dispatch]
  );

  // Sidebar click → trigger the same LibreMap selection pipeline that map clicks use.
  // Finds the MVT feature in loaded tiles and calls selectFeature() so the infobox appears.
  const handleAAFeatureSelect = useCallback(
    (aaId: number) => {
      if (!map) return;
      const sourceFeatures = map.querySourceFeatures(
        arbeitsauftraegeNamespacedSource,
        { sourceLayer: "arbeitsauftraege" }
      );
      const match = sourceFeatures.find(
        (f) => f.id === aaId || f.properties?.id === aaId
      );
      if (match) {
        selectFeature(
          {
            source: arbeitsauftraegeNamespacedSource,
            sourceLayer: "arbeitsauftraege",
            id: match.id,
          },
          match as any
        );
      }
    },
    [map, arbeitsauftraegeNamespacedSource, selectFeature]
  );

  // --- Arbeitsauftraege: clear/restore map selection when switching tabs ---
  useEffect(() => {
    if (sidebarVariant !== "arbeitsauftraege") return;

    if (activeAATab === "ap") {
      clearMapSelection();
    } else if (activeAATab === "aa" && selectedAAId != null) {
      handleAAFeatureSelect(selectedAAId);
    }
  }, [activeAATab]); // eslint-disable-line react-hooks/exhaustive-deps

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

    if (activeAATab !== "ap" || selectedAPId == null) {
      // Only clear if we're leaving AP mode (don't clobber fachobjekte overrides)
      if (activeAATab === "ap") setOverrideSelectedFeature(null);
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
  }, [activeAATab, selectedAPId, selectedAAData, sidebarVariant, draftMode, apDraftGeoJson]);

  const handleReturnToMap = useCallback(() => {
    map?.resize();
  }, [map]);

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
      if (sidebarMode === "drafts") {
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
      selectFeature(identifier, feature as any);
    },
    [selectFeature, sidebarMode, dispatch, map, namespacedSource]
  );

  // After a draft is cancelled/removed, select the next remaining draft.
  const handleSelectNextDraft = useCallback(
    (removedFeatureId: string) => {
      if (sidebarMode !== "drafts") return;
      // allDraftFeatures still contains the removed draft at this point
      // because the selector reads from the store snapshot before the next render.
      // Filter it out to get the remaining drafts.
      const remaining = allDraftFeatures.filter(({ feature }) => {
        if (!feature) return false;
        const sl = feature.sourceLayer ?? "";
        const pk = String(feature.properties?.id ?? "");
        return `${sl}:${pk}` !== removedFeatureId;
      });
      if (remaining.length === 0) return;
      const next = remaining[0];
      const f = next.feature;
      handleSidebarFeatureSelect(
        { source: f.source ?? "", sourceLayer: f.sourceLayer ?? "", id: f.id },
        f
      );
    },
    [sidebarMode, allDraftFeatures, handleSidebarFeatureSelect]
  );

  return (
    <div
      className="relative flex"
      style={{ width: mapSizes.width, height: mapSizes.height }}
    >
      {sidebarVariant === "arbeitsauftraege" ? (
        <ArbeitsauftraegeSidebar
          width={LIST_WIDTH}
          onFeatureSelect={handleAAFeatureSelect}
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
          selectedFeatureId={selectedFeatureId}
          selectedDatabaseId={selectedDatabaseId}
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
              libreLayers={[
                sidebarVariant === "arbeitsauftraege"
                  ? arbeitsauftraegeDataLayer
                  : leuchtenDataLayer,
              ]}
              setLibreMap={handleMiniMapReady}
            />
          </LibreContextProvider>
        </div>
        <DatasheetLayout
          mainMap={
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
              overrideSelectedFeature={overrideSelectedFeature}
              gazetteerInfoOnClick={false}
            />
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
                    data={
                      draft.serverData as Record<string, unknown>
                    }
                    readOnly={!globalEditMode}
                    aaId={draft.aaId}
                    geometry={draft.geometry}
                    fachobjektType={draft.featureType}
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
                      onBack={
                        apOpenedFrom === "auTable"
                          ? () => dispatch(setApOpenedFrom(null))
                          : undefined
                      }
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
                  fetchedData={fetchedFeatureData}
                  featureType={
                    selectedFeature?.carmaInfo?.sourceLayer ||
                    selectedFeatureId?.sourceLayer ||
                    lastFeatureType
                  }
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
