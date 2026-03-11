import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { CarmaMap, DatasheetLayout } from "@carma-mapping/core";
import { useDispatch, useSelector } from "react-redux";
import {
  setSelectedFeature,
  setFeatureLoading,
  getSelectedFeature as getReduxSelectedFeature,
} from "../../store/slices/featureCollection";
import {
  getActiveBackgroundLayer,
  getBackgroundLayerOpacities,
  getActiveAdditionalLayers,
  getAdditionalLayerOpacities,
  isInPaleMode,
} from "../../store/slices/mapSettings";
import {
  backgroundLayerConfigs,
  additionalLayerConfigs,
  leuchtenDataLayer,
  BELIS_STYLE_URL,
  BELIS_ORIGINAL_SOURCE,
  BELIS_SOURCE_LAYERS,
} from "../../config/mapLayerConfigs";
import type { LibreLayer } from "@carma-mapping/engines/maplibre";
import { AppDispatch } from "../../store";
import BelisSidebar from "../ui/BelisSidebar";
import { useVisibleMapFeatures, functionToInfo } from "@carma-mapping/utils";
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
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMap } from "@fortawesome/free-solid-svg-icons";
import { FeatureType, fetchFeatureById } from "../../helper/apiMethods";
import { getJWT } from "../../store/slices/auth";
import { flattenGqlRecord } from "../../helper/flattenGqlRecord";

const LIST_WIDTH = 300;

/** Debug flag: translucent main map + red mini-map border, mini-map always visible */
const MINI_MAP_DEBUGGING = false;

import type { SidebarFeature } from "../ui/BelisSidebar";

import {
  getAllDraftFeatures,
  getDraftFeaturesCount,
} from "../../store/slices/featuresForms";

type SidebarMode = "karte" | "highlights" | "drafts";

interface BelisMapLibWrapperProps {
  mapSizes: { width: number; height: number };
  activeSourceLayers: Set<string>;
  highlightResults: SidebarFeature[] | null;
  lassoActive: boolean;
  onLassoDeactivate?: () => void;
}

const BelisMapLibWrapper = ({
  mapSizes,
  activeSourceLayers,
  highlightResults,
  lassoActive,
  onLassoDeactivate,
}: BelisMapLibWrapperProps) => {
  const dispatch: AppDispatch = useDispatch();
  const jwt = useSelector(getJWT);
  const reduxSelectedFeature = useSelector(getReduxSelectedFeature);
  const { map } = useLibreContext();
  const { selectedFeature, rawFeature, selectedFeatureId, selectFeature } =
    useMapSelection();
  const { closeDatasheet, openDatasheet } = useDatasheet();
  const [fetchedFeatureData, setFetchedFeatureData] = useState<any>(null);
  // Preserve last valid featureType to prevent unmount when selectedFeature briefly becomes undefined
  const [lastFeatureType, setLastFeatureType] = useState<string | undefined>(
    undefined
  );

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
        const sourceFeatures = map.querySourceFeatures(namespacedSource, { sourceLayer: sl });
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
          const key = `${f.sourceLayer ?? ""}::${String(f.properties?.id ?? f.id ?? "")}`;
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

  const draftSidebarFeatures = useMemo(() => {
    return allDraftFeatures.map((f: any) => {
      const sourceLayer = f.carmaInfo?.sourceLayer ?? "";
      const props = f.properties?.sourceProps ?? f.properties ?? {};
      return {
        type: "Feature" as const,
        geometry: f.geometry ?? { type: "Point", coordinates: [0, 0] },
        properties: props,
        source: namespacedSource,
        sourceLayer,
        id: props.id,
        layer: f.layer ?? { id: sourceLayer, source: namespacedSource, type: "circle" as const },
        state: {},
        original: f,
      } as unknown as SidebarFeature;
    });
  }, [allDraftFeatures, namespacedSource]);

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
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("karte");

  // When highlighting is killed, reset to Karte mode and clear highlight collection
  useEffect(() => {
    if (!highlightingActive) {
      setSidebarMode("karte");
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

  // Sync selection to Redux store when map selection changes.
  // Skip in drafts mode — handleSidebarFeatureSelect already dispatches the
  // correct feature (with MVT tile ID). Letting createFeature's result through
  // would overwrite it with a database-PK-based ID, breaking draft lookups.
  useEffect(() => {
    if (selectedFeature && sidebarMode !== "drafts") {
      dispatch(setSelectedFeature({ ...selectedFeature, selected: true }));
    }
  }, [selectedFeature, sidebarMode, dispatch]);

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
      } else if (selectedFeatureId) {
        // Fallback: LibreMap couldn't process the feature (e.g. search result not on map)
        // Use database PK from raw feature properties (selectedFeatureId.id is the MVT tile ID)
        sourceLayer = selectedFeatureId.sourceLayer;
        featureId = rawFeature?.properties?.id ?? selectedFeatureId.id;
      } else {
        setFetchedFeatureData(null);
        return;
      }

      if (sourceLayer) {
        setLastFeatureType(sourceLayer);
      }

      console.log("[SELECTION] vector feature:", {
        featureId,
        sourceLayer,
        rawFeature,
        fallback: !selectedFeature,
      });

      const apiFeatureType = SOURCE_LAYER_TO_FEATURE_TYPE[sourceLayer ?? ""];
      if (!apiFeatureType || !featureId) {
        // Not a known BeLIS layer (e.g. ALKIS background); clear stale data
        setFetchedFeatureData(null);
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
  }, [selectedFeature, selectedFeatureId, jwt]);

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
              reduxSelectedFeature?.geometry ?? {
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
    reduxSelectedFeature,
  ]);

  // Visually select the MVT feature on the map by querying tiles for the
  // database PK and applying feature-state with the actual MVT tile ID.
  // Fires for the override path (search results not on map) AND for drafts mode
  // (where LibreMap's createFeature may set context selectedFeature, disabling
  // the override path, but we still need tile-reload-safe selection).
  // Retries on sourcedata because the tile may not be loaded yet (e.g. after fly-to).
  const needsManualSelection =
    !!overrideSelectedFeature || sidebarMode === "drafts";
  useEffect(() => {
    if (!map || !needsManualSelection || !selectedFeatureId) return;

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
  }, [map, needsManualSelection, selectedFeatureId, namespacedSource]);

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

    // Data layer (always on)
    layers.push(leuchtenDataLayer);

    return layers;
  }, [
    activeBackgroundLayer,
    backgroundLayerOpacities,
    activeAdditionalLayers,
    additionalLayerOpacities,
    inPaleMode,
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
    [map]
  );

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

  // For drafts mode, context rawFeature is null (we skip passing it to selectFeature
  // to prevent createFeature from overwriting Redux). Build a fallback from the Redux
  // selectedFeature so form subtitles can derive their data (e.g. strasse, fabrikat).
  const effectiveRawFeature = useMemo(() => {
    if (rawFeature) return rawFeature;
    if (sidebarMode === "drafts" && reduxSelectedFeature) {
      const sourceProps =
        reduxSelectedFeature.properties?.sourceProps ??
        reduxSelectedFeature.properties ??
        {};
      return {
        properties: sourceProps,
        geometry: reduxSelectedFeature.geometry,
        sourceLayer: reduxSelectedFeature.carmaInfo?.sourceLayer,
      };
    }
    return null;
  }, [rawFeature, sidebarMode, reduxSelectedFeature]);

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
      const original = (feature as any).original;
      if (sidebarMode === "drafts" && original?.carmaInfo) {
        // For draft features: dispatch the stored feature directly (has correct MVT tile ID
        // matching the draft key). The sync effect is guarded to skip in drafts mode,
        // so createFeature's result won't overwrite this.
        // Pass original as raw feature so context rawFeature has geometry
        // (needed by minimap centering, zoom-to-feature, etc.).
        dispatch(setSelectedFeature({ ...original, selected: true }));
        selectFeature(identifier, original as any);
      } else {
        // Dispatch raw sidebar feature to Redux immediately so FeaturesFormsWrapper
        // has a valid featureId. If LibreMap's createFeature succeeds later, the
        // sync effect will overwrite with the processed version.
        dispatch(
          setSelectedFeature({
            properties: feature.properties,
            geometry: feature.geometry,
            id: feature.id,
            carmaInfo: {
              sourceLayer: feature.sourceLayer,
              source: feature.source,
            },
            selected: true,
          })
        );
        selectFeature(identifier, feature as any);
      }
    },
    [selectFeature, sidebarMode, dispatch]
  );

  return (
    <div
      className="relative flex"
      style={{ width: mapSizes.width, height: mapSizes.height }}
    >
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
        karteCount={totalCount}
        highlightCount={adjustedHighlights?.length ?? undefined}
        draftsCount={draftFeaturesCount}
        onFeatureDismiss={handleSidebarDismiss}
      />
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
              libreLayers={[leuchtenDataLayer]}
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
            <div style={{ height: "100%", overflow: "hidden" }}>
              <BelisDatasheetView
                feature={selectedFeature}
                rawFeature={effectiveRawFeature}
                fetchedData={fetchedFeatureData}
                featureType={
                  selectedFeature?.carmaInfo?.sourceLayer ||
                  selectedFeatureId?.sourceLayer ||
                  lastFeatureType
                }
              />
            </div>
          }
          onReturnToMap={handleReturnToMap}
        />
      </div>
    </div>
  );
};

export default BelisMapLibWrapper;
