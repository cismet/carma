import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useKeyboardListNavigation } from "../../hooks/useKeyboardListNavigation";
import type { MapGeoJSONFeatureWithOriginal as SidebarFeature } from "@carma-mapping/utils";
export type { SidebarFeature };
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSpinner,
  faStar,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import type { Feature } from "geojson";

const IS_LOCAL_DEV =
  typeof window !== "undefined" && window.location.hostname === "localhost";
import { useSelector } from "react-redux";
import toTitleCase from "../../helper/toTitleCase";
import {
  getAllDrafts,
  isCreationDraftKey,
} from "../../store/slices/featuresForms";
import {
  featureLengthMeters,
  formatMeters,
} from "@carma-mapping/measurements";
import AuswahlBlock from "./AuswahlBlock";

export const displayId = (id: unknown): string => {
  if (id == null) return "?";
  const s = String(id);
  // Creation draft keys look like `create:<type>:<timestamp>-<random>`.
  // The real key is kept internally (Redux state, feature properties); for a
  // not-yet-saved draft there is no meaningful id to show, so render "???"
  // instead of leaking the opaque generated key into the UI.
  if (isCreationDraftKey(s)) {
    return "???";
  }
  return s;
};

export const SELECTED_ROW_STYLE =
  "bg-blue-50 hover:bg-blue-50 border-l-2 border-l-blue-500";

export interface ListItemData {
  main: string;
  upperright: string;
  subtitle: string;
}

// Layer-specific extractors for Belis data
const defaultListItemExtractors: Record<
  string,
  (feature: SidebarFeature) => ListItemData
> = {
  leuchten: (feature) => {
    const p = feature.properties || {};
    const typ = p.leuchtentyp || p.leuchttyp || "L";
    const nr = p.leuchtennummer || "0";
    const standort = p.lfd_nummer ? `, ${p.lfd_nummer}` : "";
    return {
      main: `${typ}-${nr}${standort}`,
      upperright: toTitleCase(p.strasse || p.strassenschluessel || ""),
      subtitle: p.fabrikat || p.leuchttyp_fabrikat || "",
    };
  },
  tdta_leuchten: (feature) => {
    const p = feature.properties || {};
    const leuchttyp = p.fk_leuchttyp?.leuchtentyp || "L";
    const nummer = p.leuchtennummer || "0";
    const standort = p.fk_standort?.lfd_nummer
      ? `, ${p.fk_standort.lfd_nummer}`
      : "";
    return {
      main: `${leuchttyp}-${nummer}${standort}`,
      upperright: toTitleCase(p.fk_strassenschluessel?.strasse || ""),
      subtitle: p.fk_leuchttyp?.fabrikat || "-ohne Fabrikat-",
    };
  },
  standorte: (feature) => {
    const p = feature.properties || {};
    return {
      main: `Standort ${p.lfd_nummer || "?"}`,
      upperright: toTitleCase(p.strasse || p.strassenschluessel || ""),
      subtitle: p.mastart || p.masttyp || "",
    };
  },
  tdta_standort_mast: (feature) => {
    const p = feature.properties || {};
    return {
      main: `Mast - ${p.lfd_nummer || "?"}`,
      upperright: toTitleCase(p.fk_strassenschluessel?.strasse || ""),
      subtitle: p.fk_mastart?.mastart || "-ohne Mastart-",
    };
  },
  schaltstelle: (feature) => {
    const p = feature.properties || {};
    const title = p.schaltstellen_nummer
      ? `S ${p.schaltstellen_nummer}`
      : `ID: ${displayId(p.id)}`;
    return {
      main: title,
      upperright: toTitleCase(p.strasse || "") || "-",
      subtitle: p.bezeichnung || p.bauart || "Schaltstelle",
    };
  },
  schaltstellen: (feature) => {
    const p = feature.properties || {};
    const title = p.schaltstellen_nummer
      ? `S ${p.schaltstellen_nummer}`
      : `ID: ${displayId(p.id)}`;
    return {
      main: title,
      upperright: toTitleCase(p.strasse || "") || "-",
      subtitle: p.bezeichnung || p.bauart || "Schaltstelle",
    };
  },
  leitungen: (feature) => {
    const p = feature.properties || {};
    const laenge = p.laenge || p.length || "";
    const laengeStr = laenge ? `${laenge}m` : "";
    return {
      main: `L-${displayId(p.id)}`,
      upperright: laengeStr,
      subtitle: p.bezeichnung || p.leitungstyp || "",
    };
  },
  leitung: (feature) => {
    const p = feature.properties || {};
    const aPart = p.fk_querschnitt?.groesse
      ? `, ${p.fk_querschnitt.groesse}mm`
      : "";
    return {
      main: `L-${displayId(p.id)}`,
      upperright: p.fk_leitungstyp?.bezeichnung || "Leitung",
      subtitle: aPart ? `Querschnitt${aPart}` : "",
    };
  },
  mauerlaschen: (feature) => {
    const p = feature.properties || {};
    return {
      main: `M-${p.laufende_nummer || displayId(p.id)}`,
      upperright: toTitleCase(p.strasse || "") || "-",
      subtitle: p.bezeichnung || p.material || "Mauerlasche",
    };
  },
  mauerlasche: (feature) => {
    const p = feature.properties || {};
    return {
      main: `M-${p.laufende_nummer || displayId(p.id)}`,
      upperright: toTitleCase(p.fk_strassenschluessel?.strasse || "") || "-",
      subtitle: p.fk_material?.bezeichnung || "Mauerlasche",
    };
  },
  abzweigdose: (feature) => {
    const p = feature.properties || {};
    return {
      main: `AZD-${displayId(p.id)}`,
      upperright: "",
      subtitle: "Abzweigdose",
    };
  },
};

// Generic fallback extractor
const genericExtractor = (feature: SidebarFeature): ListItemData => {
  const props = feature.properties || {};
  const main =
    props.name ||
    props.title ||
    props.label ||
    props.bezeichnung ||
    `ID: ${displayId(feature.id)}`;

  const upperright = toTitleCase(
    props.strasse || props.street || props.typ || props.type || ""
  );

  const subtitle =
    props.beschreibung || props.description || props.info || props.status || "";

  return { main, upperright, subtitle };
};

// Shared entry point so a feature-form's sticky header renders the exact same
// per-type text as that feature's sidebar row — one source of truth, no
// duplicated label logic. `layerKey` is the BELIS source layer (e.g.
// "mauerlaschen"); unknown keys fall through to genericExtractor, just like
// the sidebar list does. Drafts work too: their ids resolve via displayId.
export const extractListItem = (
  layerKey: string,
  feature:
    | { id?: unknown; properties?: Record<string, unknown> | null }
    | null
    | undefined
): ListItemData => {
  if (!feature) return { main: "", upperright: "", subtitle: "" };
  const extractor =
    defaultListItemExtractors[layerKey] ||
    defaultListItemExtractors[layerKey.toLowerCase()] ||
    genericExtractor;
  return extractor(feature as SidebarFeature);
};

export interface BelisSidebarProps {
  features: SidebarFeature[];
  countsByLayer: Record<string, number>;
  totalCount: number;
  isLoading: boolean;
  isOverviewMode: boolean;
  activeSourceLayers: Set<string>;
  selectedFeatureId?: {
    source: string;
    sourceLayer?: string;
    id?: string | number;
  } | null;
  /** Database primary key of the selected feature (from tile properties).
   *  Used as fallback match when MVT feature IDs differ from database PKs. */
  selectedDatabaseId?: string | number | null;
  /** Parent Fachobjekt selection — highlighted in the Fachobjekte list when
   *  the primary selection points at a creation draft (whose id lives in the
   *  Entwürfe tab, not here). Lets the originating Standort stay marked while
   *  a new attached Leuchte is being edited. */
  parentFeatureId?: {
    source: string;
    sourceLayer?: string;
    id?: string | number;
  } | null;
  onFeatureSelect: (
    identifier: {
      source: string;
      sourceLayer?: string;
      id?: string | number;
    },
    feature: SidebarFeature
  ) => void;
  emptyMessage?: string;
  sidebarMode?: "fachobjekte" | "highlights" | "drafts";
  onModeChange?: (mode: "fachobjekte" | "highlights" | "drafts") => void;
  hasHighlights?: boolean;
  hasDrafts?: boolean;
  fachobjekteCount?: number;
  highlightCount?: number;
  draftsCount?: number;
  onFeatureDismiss?: (feature: SidebarFeature) => void;
  /** Optional custom extractors that take priority over the built-in ones.
   *  Used by the drafts tab to display features with database PKs instead of MVT tile IDs. */
  listItemExtractors?: Record<
    string,
    (feature: SidebarFeature) => ListItemData
  >;
  /** Unmerged activeSourceLayers for AuswahlBlock (respects filter toggles). */
  auswahlActiveSourceLayers?: Set<string>;
  /** Namespaced MVT source for querying features (needed by AuswahlBlock). */
  namespacedSource?: string;
  /** Brandnew GeoJSON source — passed through to AuswahlBlock so newly-created
   *  Standorte/Leuchten resolve their siblings. */
  brandnewSource?: string;
  /** Current adjusted highlights list (needed by AuswahlBlock). */
  adjustedHighlights?: SidebarFeature[] | null;
  /** Setter for adjusted highlights (needed by AuswahlBlock). */
  setAdjustedHighlights?: React.Dispatch<
    React.SetStateAction<SidebarFeature[] | null>
  >;
  /** Drawn measurements (Punkte / Linien / Flächen). Rendered as a
   *  collapsible group above the Fachobjekte sections. */
  measurements?: Feature[];
  /** Id of the currently-selected measurement, or null. Sourced from the
   *  shared selectedFeature slot when its featurekind === 'measurement'. */
  selectedMeasurementId?: string | null;
  /** Fired when the user clicks a measurement row. Pass `null` to deselect. */
  onMeasurementSelect?: (id: string | null) => void;
  /** Fired when the user clicks the trash icon on the Messungen header to
   *  wipe every measurement. Host is responsible for clearing both
   *  terra-draw (via MeasurementHostHandle.clearAll) and redux state. */
  onMeasurementsDeleteAll?: () => void;
}

const BelisSidebar = ({
  features,
  countsByLayer,
  totalCount,
  isLoading,
  isOverviewMode,
  activeSourceLayers,
  selectedFeatureId,
  selectedDatabaseId,
  parentFeatureId,
  onFeatureSelect,
  emptyMessage = "Keine Objekte im aktuellen Kartenausschnitt",
  sidebarMode = "fachobjekte",
  onModeChange,
  hasHighlights = false,
  hasDrafts = false,
  fachobjekteCount,
  highlightCount,
  draftsCount,
  onFeatureDismiss,
  listItemExtractors,
  auswahlActiveSourceLayers,
  namespacedSource,
  brandnewSource,
  adjustedHighlights,
  setAdjustedHighlights,
  measurements,
  selectedMeasurementId,
  onMeasurementSelect,
  onMeasurementsDeleteAll,
}: BelisSidebarProps) => {
  // Filter features by active source layers
  const filteredFeatures = useMemo(() => {
    return features.filter((f) => {
      const sl = f.sourceLayer || "";
      return activeSourceLayers.has(sl);
    });
  }, [features, activeSourceLayers]);

  // Track Alt key for dismiss button visibility
  const [altHeld, setAltHeld] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Alt") setAltHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Alt") setAltHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", () => setAltHeld(false));
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", () => setAltHeld(false));
    };
  }, []);

  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({});
  const selectedItemRef = useRef<HTMLDivElement>(null);
  // Store the feature ID that was selected from the list (not just a boolean)
  // This prevents scroll even if the effect runs multiple times due to filteredFeatures changing
  const selectionFromListRef = useRef<{
    source: string;
    sourceLayer?: string;
    id?: string | number;
  } | null>(null);
  // Tracks the last sidebar tab so a tab switch can re-reveal the selection.
  const prevSidebarModeRef = useRef(sidebarMode);

  // Scroll selected item into view only when selection comes from map (not list)

  useEffect(() => {
    if (!selectedFeatureId) return;

    // A tab switch (e.g. Entwürfe → Fachobjekte) must re-reveal the active
    // selection even though it didn't change — the user navigated back to this
    // list expecting to see the edited feature. Bypass the list-click guard on
    // any mode transition; otherwise the row would stay scrolled off the top.
    const modeChanged = prevSidebarModeRef.current !== sidebarMode;
    prevSidebarModeRef.current = sidebarMode;

    // Skip scroll if this selection was triggered from list click
    const listSelection = selectionFromListRef.current;
    if (
      !modeChanged &&
      listSelection &&
      listSelection.source === selectedFeatureId.source &&
      listSelection.sourceLayer === selectedFeatureId.sourceLayer &&
      listSelection.id === selectedFeatureId.id
    ) {
      // Don't reset here - keep skipping until a different feature is selected
      return;
    }
    // Clear the ref since a different feature was selected (from map)
    selectionFromListRef.current = null;

    // Match the same way the row highlight does (see `isFeatureSelected`):
    // an MVT triple match, OR a DB-pk match that ignores `source`. The latter
    // is what locates a draft/brandnew row — it carries a different `source`
    // and MVT id than the selection but the same DB pk on `properties.id`, so
    // a source-bound find would miss it and the list would never scroll.
    const selectedFeature = filteredFeatures.find((f) => {
      if (
        f.source === selectedFeatureId.source &&
        f.sourceLayer === selectedFeatureId.sourceLayer &&
        selectedFeatureId.id != null &&
        String(f.id) === String(selectedFeatureId.id)
      ) {
        return true;
      }
      if (
        selectedFeatureId.sourceLayer === f.sourceLayer &&
        selectedDatabaseId != null
      ) {
        const dbPk = f.properties?.id;
        return dbPk != null && String(selectedDatabaseId) === String(dbPk);
      }
      return false;
    });

    if (selectedFeature) {
      const sl =
        selectedFeature.sourceLayer || selectedFeature.source || "Sonstige";
      const groupKey = MERGED_LAYERS.has(sl) ? MERGED_GROUP_KEY : sl;

      // Expand group if collapsed
      if (collapsedGroups[groupKey]) {
        setCollapsedGroups((prev) => ({
          ...prev,
          [groupKey]: false,
        }));
      }

      setTimeout(() => {
        const el = selectedItemRef.current;
        const container = listRef.current;
        if (!el || !container) return;

        // Only scroll if the item is not fully visible in the list
        const elRect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const isVisible =
          elRect.top >= containerRect.top &&
          elRect.bottom <= containerRect.bottom;

        if (!isVisible) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 100);
    }
  }, [
    selectedFeatureId,
    selectedDatabaseId,
    filteredFeatures,
    collapsedGroups,
    sidebarMode,
  ]);

  // Layers that are merged into a single "Standorte / Leuchten" group
  const MERGED_LAYERS = new Set(["standorte", "leuchten"]);
  const MERGED_GROUP_KEY = "Standorte / Leuchten";

  // Stable group display order (unlisted groups go last, alphabetically)
  const GROUP_ORDER: Record<string, number> = {
    [MERGED_GROUP_KEY]: 0,
    leitungen: 1,
    schaltstelle: 2,
    abzweigdosen: 3,
    mauerlaschen: 4,
  };

  // Group features by sourceLayer, merging standorte + leuchten into one group
  const groupedFeatures = useMemo(() => {
    const groups: Record<
      string,
      {
        items: SidebarFeature[];
        total: number;
        label?: string;
        indentLeuchten?: boolean;
        // fk_standort keys whose Standort parent is actually present in this
        // list. A Leuchte only indents when its cluster has a parent here — so
        // an edited Leuchte draft (parent comes from the viewport) nests, while
        // a genuinely orphaned Leuchte stays flush.
        pairedStandortKeys?: Set<string>;
      }
    > = {};

    // Track which merged layers are active
    const activeMergedLayers = new Set<string>();

    // Initialize groups from countsByLayer
    // In overview mode, keep each layer separate (just showing counts)
    for (const [layerKey, count] of Object.entries(countsByLayer)) {
      if (!activeSourceLayers.has(layerKey)) continue;
      if (!isOverviewMode && MERGED_LAYERS.has(layerKey)) {
        activeMergedLayers.add(layerKey);
        if (!groups[MERGED_GROUP_KEY]) {
          groups[MERGED_GROUP_KEY] = { items: [], total: 0 };
        }
        groups[MERGED_GROUP_KEY].total += count;
      } else {
        groups[layerKey] = { items: [], total: count };
      }
    }

    // Set dynamic label based on which merged layers have data
    if (groups[MERGED_GROUP_KEY]) {
      const hasStandorte = activeMergedLayers.has("standorte");
      const hasLeuchten = activeMergedLayers.has("leuchten");
      if (hasStandorte && hasLeuchten) {
        groups[MERGED_GROUP_KEY].label = "Standorte / Leuchten";
        groups[MERGED_GROUP_KEY].indentLeuchten = true;
      } else if (hasStandorte) {
        groups[MERGED_GROUP_KEY].label = "Standorte";
      } else {
        groups[MERGED_GROUP_KEY].label = "Leuchten";
      }
    }

    // Distribute features into groups
    filteredFeatures.forEach((feature) => {
      const sl = feature.sourceLayer || feature.source || "Sonstige";
      const groupKey = MERGED_LAYERS.has(sl) ? MERGED_GROUP_KEY : sl;
      if (!groups[groupKey]) {
        groups[groupKey] = { items: [], total: 0 };
      }
      groups[groupKey].items.push(feature);
    });

    // Sort the merged group: group by fk_standort, standort feature first, then its leuchten by leuchtennummer
    const merged = groups[MERGED_GROUP_KEY];
    if (merged) {
      // Build standort clusters: standort ID -> { standort?, leuchten[] }
      const clusters = new Map<
        string,
        { standort: SidebarFeature | null; leuchten: SidebarFeature[] }
      >();
      for (const f of merged.items) {
        const sl = f.sourceLayer || "";
        if (sl === "standorte") {
          const key = String(f.properties?.id ?? f.id ?? "?");
          const cluster = clusters.get(key) ?? { standort: null, leuchten: [] };
          cluster.standort = f;
          clusters.set(key, cluster);
        } else {
          // leuchten: group by fk_standort
          const key = String(f.properties?.fk_standort ?? "unknown");
          const cluster = clusters.get(key) ?? { standort: null, leuchten: [] };
          cluster.leuchten.push(f);
          clusters.set(key, cluster);
        }
      }

      // Remember which clusters actually have a Standort parent in this list.
      // Drives indentation: a Leuchte nests only under a present parent.
      const pairedStandortKeys = new Set<string>();
      for (const [key, cluster] of clusters) {
        if (cluster.standort) pairedStandortKeys.add(key);
      }
      merged.pairedStandortKeys = pairedStandortKeys;

      // Sort clusters by street, then lfd_nummer. Read each field from the
      // Standort, falling back to its first Leuchte — a synthetic Standort
      // (e.g. the Leuchten-deletion override) may carry no street, which would
      // otherwise sort its whole cluster to the top instead of into its block.
      const clusterStreet = (c: {
        standort: SidebarFeature | null;
        leuchten: SidebarFeature[];
      }) =>
        (
          c.standort?.properties?.strasse ||
          c.standort?.properties?.strassenschluessel ||
          c.leuchten[0]?.properties?.strasse ||
          c.leuchten[0]?.properties?.strassenschluessel ||
          ""
        ).toLowerCase();
      const clusterNr = (c: {
        standort: SidebarFeature | null;
        leuchten: SidebarFeature[];
      }) =>
        Number(
          c.standort?.properties?.lfd_nummer ??
            c.leuchten[0]?.properties?.lfd_nummer
        ) || 0;
      const sortedClusters = [...clusters.entries()].sort(([, a], [, b]) => {
        const streetA = clusterStreet(a);
        const streetB = clusterStreet(b);
        if (streetA !== streetB) return streetA.localeCompare(streetB);
        return clusterNr(a) - clusterNr(b);
      });

      // Flatten: standort first, then leuchten sorted by leuchtennummer
      const sorted: SidebarFeature[] = [];
      for (const [, cluster] of sortedClusters) {
        if (cluster.standort) sorted.push(cluster.standort);
        cluster.leuchten.sort(
          (a, b) =>
            (Number(a.properties?.leuchtennummer) || 0) -
            (Number(b.properties?.leuchtennummer) || 0)
        );
        sorted.push(...cluster.leuchten);
      }
      merged.items = sorted;
    }

    // Sort other groups by street, standort nr, leuchtennummer
    for (const [key, group] of Object.entries(groups)) {
      if (key === MERGED_GROUP_KEY) continue;
      group.items.sort((a, b) => {
        const aStreet = (
          a.properties?.strasse ||
          a.properties?.strassenschluessel ||
          ""
        ).toLowerCase();
        const bStreet = (
          b.properties?.strasse ||
          b.properties?.strassenschluessel ||
          ""
        ).toLowerCase();
        if (aStreet !== bStreet) return aStreet.localeCompare(bStreet);
        const aStandort = Number(a.properties?.lfd_nummer) || 0;
        const bStandort = Number(b.properties?.lfd_nummer) || 0;
        if (aStandort !== bStandort) return aStandort - bStandort;
        const aLeuchte = Number(a.properties?.leuchtennummer) || 0;
        const bLeuchte = Number(b.properties?.leuchtennummer) || 0;
        return aLeuchte - bLeuchte;
      });
    }
    return groups;
  }, [filteredFeatures, countsByLayer, activeSourceLayers, isOverviewMode]);

  // Stable-ordered group entries
  const sortedGroupEntries = useMemo(() => {
    const max = Object.keys(GROUP_ORDER).length;
    return Object.entries(groupedFeatures).sort(
      ([a], [b]) => (GROUP_ORDER[a] ?? max) - (GROUP_ORDER[b] ?? max)
    );
  }, [groupedFeatures]);

  // Flat ordered list matching render order (for keyboard navigation)
  const flatFeatures = useMemo(() => {
    const flat: SidebarFeature[] = [];
    for (const [groupKey, group] of sortedGroupEntries) {
      if (!isOverviewMode && !collapsedGroups[groupKey]) {
        flat.push(...group.items);
      }
    }
    return flat;
  }, [sortedGroupEntries, isOverviewMode, collapsedGroups]);

  const isFeatureSelected = useCallback(
    (feature: SidebarFeature): boolean => {
      if (feature.id == null) return false;

      // MVT feature-ID match (Karte mode). MVT ids are only unique within a
      // tile, so require the full source + sourceLayer + id triple.
      if (
        selectedFeatureId &&
        selectedFeatureId.source === feature.source &&
        selectedFeatureId.sourceLayer === feature.sourceLayer &&
        selectedFeatureId.id != null &&
        String(selectedFeatureId.id) === String(feature.id)
      ) {
        return true;
      }

      // Database-PK match (Highlights mode; also geometry-edit drafts whose
      // sidebar row carries a different `source` than the canonical tile
      // selection a map click resolves to). Compare DB-pk to DB-pk
      // (properties.id), never to feature.id (MVT id) — consecutive records can
      // have an MVT id that aliases another's DB pk. DB pks are unique per
      // sourceLayer, so match on sourceLayer + pk WITHOUT requiring the source
      // to agree: a feature's tile copy and its brandnew/draft copy share
      // neither source nor MVT id but are the same entity.
      if (
        selectedFeatureId &&
        selectedFeatureId.sourceLayer === feature.sourceLayer &&
        selectedDatabaseId != null
      ) {
        const dbPk = feature.properties?.id;
        if (dbPk != null && String(selectedDatabaseId) === String(dbPk)) {
          return true;
        }
      }

      // Parent-context fallback: when the primary selection is a creation
      // draft (lives in the Entwürfe tab), keep the originating Fachobjekt
      // row highlighted here so the user can see what the draft is attached
      // to. Scoped to the fachobjekte tab to avoid bleeding into highlights.
      if (
        sidebarMode === "fachobjekte" &&
        parentFeatureId &&
        parentFeatureId.id != null &&
        parentFeatureId.source === feature.source &&
        parentFeatureId.sourceLayer === feature.sourceLayer &&
        String(parentFeatureId.id) === String(feature.id)
      ) {
        return true;
      }

      return false;
    },
    [selectedFeatureId, selectedDatabaseId, parentFeatureId, sidebarMode]
  );

  // Identity keys ("<sourceLayer>:<dbId>") of all Fachobjekte currently marked
  // for deletion via the DangerZone, so their sidebar rows can be rendered in
  // the danger red. Drafts are keyed "<sourceLayer>:<dbPK>" (see
  // FeaturesFormsWrapper); featureDbId is the authoritative DB id when present.
  const allDrafts = useSelector(getAllDrafts);
  const pendingDeletionKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const [draftKey, draft] of Object.entries(allDrafts)) {
      if (!draft?.pendingDeletion) continue;
      const sourceLayer = draftKey.split(":")[0];
      const dbId = draft.featureDbId ?? draftKey.split(":")[1];
      if (sourceLayer && dbId != null) keys.add(`${sourceLayer}:${dbId}`);
      // A Standort marked for deletion takes its Leuchten with it (cascade
      // soft-delete). Flag each captured child — keyed by its real DB id — so
      // its expanded sidebar row also renders in the danger red, in both the
      // Fachobjekte and Entwürfe lists.
      for (const leuchte of draft.cascadeDeleteLeuchten ?? []) {
        keys.add(`leuchten:${leuchte.id}`);
      }
    }
    return keys;
  }, [allDrafts]);

  const isFeaturePendingDeletion = useCallback(
    (feature: SidebarFeature): boolean => {
      const dbId = feature.properties?.id;
      if (dbId == null || !feature.sourceLayer) return false;
      return pendingDeletionKeys.has(`${feature.sourceLayer}:${dbId}`);
    },
    [pendingDeletionKeys]
  );

  const listRef = useRef<HTMLDivElement>(null);

  const selectedIdx = useMemo(
    () => flatFeatures.findIndex((f) => isFeatureSelected(f)),
    [flatFeatures, isFeatureSelected]
  );

  // Arrows walk the measurement list when a measurement is the active
  // selection — otherwise the fachobjekte handler keeps its current scope.
  const measurementNavEnabled =
    sidebarMode === "fachobjekte" &&
    selectedMeasurementId != null &&
    !collapsedGroups["messungen"];

  const { onKeyDown: handleFachobjekteKeyDown } = useKeyboardListNavigation({
    items: flatFeatures,
    selectedIndex: selectedIdx,
    onSelect: (next) => {
      selectionFromListRef.current = {
        source: next.source,
        sourceLayer: next.sourceLayer,
        id: next.id,
      };
      onFeatureSelect(
        { source: next.source, sourceLayer: next.sourceLayer, id: next.id },
        next
      );
    },
    enabled: !measurementNavEnabled,
  });

  const getListItem = (feature: SidebarFeature): ListItemData => {
    // Drafts and real features share the same per-type extractors — no
    // draft-specific text. The green "Neu" badge (rendered separately off
    // `_isCreation`) is the only draft indicator in the list.
    const layerKey = feature.sourceLayer || feature.source || "";
    const extractor =
      listItemExtractors?.[layerKey] ||
      listItemExtractors?.[layerKey.toLowerCase()] ||
      defaultListItemExtractors[layerKey] ||
      defaultListItemExtractors[layerKey.toLowerCase()] ||
      genericExtractor;
    return extractor(feature);
  };

  const handleFeatureClick = (feature: SidebarFeature) => {
    selectionFromListRef.current = {
      source: feature.source,
      sourceLayer: feature.sourceLayer,
      id: feature.id,
    };
    onFeatureSelect(
      {
        source: feature.source,
        sourceLayer: feature.sourceLayer,
        id: feature.id,
      },
      feature
    );
  };

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  // Single "Messungen" group holding all measurement types. Indexing stays
  // per-type so labels read "Punkt 1, Punkt 2, Linie 1, Fläche 1" even
  // though they share one collapsible block.
  const measurementListItems = useMemo(() => {
    const list = measurements ?? [];
    const counters = { Point: 0, LineString: 0, Polygon: 0 };
    return list.map((f) => {
      const t = f.geometry?.type;
      const id = f.id != null ? String(f.id) : "";
      const shortId = id.startsWith("measurement.") ? id.slice(12, 20) : id;
      const label =
        typeof (f.properties as any)?.title === "string"
          ? ((f.properties as any).title as string)
          : null;
      let main = "Messung";
      let subtitle = "";
      let upperright = shortId;
      if (t === "Point") {
        counters.Point += 1;
        main = `Punkt ${counters.Point}`;
        // Show WGS84 coords as the subtitle. Use the on-map label
        // (e.g. "P2") in place of the opaque short id.
        const coords = (f.geometry as any)?.coordinates;
        if (Array.isArray(coords) && typeof coords[0] === "number") {
          subtitle = `${coords[0].toFixed(2)} / ${coords[1].toFixed(2)}`;
        }
        if (label) upperright = label;
      } else if (t === "LineString" || t === "MultiLineString") {
        counters.LineString += 1;
        main = `Linie ${counters.LineString}`;
        const meters = featureLengthMeters(f);
        if (meters != null) subtitle = formatMeters(meters);
        // Use the on-map label (e.g. "L3") in place of the opaque short id.
        if (label) upperright = label;
      } else if (t === "Polygon" || t === "MultiPolygon") {
        counters.Polygon += 1;
        main = `Fläche ${counters.Polygon}`;
      }
      return { feature: f, id, main, upperright, subtitle };
    });
  }, [measurements]);

  const selectedMeasurementIdx = useMemo(
    () =>
      selectedMeasurementId == null
        ? -1
        : measurementListItems.findIndex(
            (m) => m.id === selectedMeasurementId
          ),
    [measurementListItems, selectedMeasurementId]
  );

  const { onKeyDown: handleMeasurementKeyDown } = useKeyboardListNavigation({
    items: measurementListItems,
    selectedIndex: selectedMeasurementIdx,
    onSelect: (next) => {
      onMeasurementSelect?.(next.id);
    },
    enabled: measurementNavEnabled,
  });

  const handleKeyDown = (e: ReactKeyboardEvent) => {
    handleMeasurementKeyDown(e);
    if (e.defaultPrevented) return;
    handleFachobjekteKeyDown(e);
  };

  return (
    <div
      ref={listRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="w-[300px] h-full bg-white border-r border-gray-300 flex flex-col overflow-hidden z-[1000] shrink-0 outline-none"
    >
      <div
        className="px-3 py-2 border-b border-gray-300 bg-gray-50 text-sm flex justify-between items-center"
        style={{ minHeight: 36 }}
      >
        <div className="flex gap-1">
          <button
            onClick={() => onModeChange?.("fachobjekte")}
            className={`px-2 py-0.5 text-xs rounded ${
              sidebarMode === "fachobjekte"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-600 hover:bg-gray-300"
            }`}
          >
            Fachobjekte
            {fachobjekteCount != null ? ` (${fachobjekteCount})` : ""}
          </button>
          {hasHighlights && highlightCount != null && highlightCount < 2000 && (
            <button
              onClick={() => onModeChange?.("highlights")}
              className={`px-2 py-0.5 text-xs rounded ${
                sidebarMode === "highlights"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-600 hover:bg-gray-300"
              }`}
            >
              Highlights{highlightCount != null ? ` (${highlightCount})` : ""}
            </button>
          )}
          {hasDrafts && (
            <button
              onClick={() => onModeChange?.("drafts")}
              className={`px-2 py-0.5 text-xs rounded ${
                sidebarMode === "drafts"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-600 hover:bg-gray-300"
              }`}
            >
              Entwürfe{draftsCount != null ? ` (${draftsCount})` : ""}
            </button>
          )}
        </div>
        {isLoading && (
          <FontAwesomeIcon icon={faSpinner} spin className="text-gray-400" />
        )}
      </div>
      {namespacedSource &&
        setAdjustedHighlights &&
        sidebarMode !== "drafts" && (
          <AuswahlBlock
            namespacedSource={namespacedSource}
            brandnewSource={brandnewSource}
            adjustedHighlights={adjustedHighlights ?? null}
            setAdjustedHighlights={setAdjustedHighlights}
            getListItem={getListItem}
            onFeatureSelect={onFeatureSelect}
            activeSourceLayers={auswahlActiveSourceLayers ?? activeSourceLayers}
          />
        )}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {sidebarMode === "fachobjekte" && measurementListItems.length > 0 && (
          <div key="messungen">
            <div
              onClick={() => toggleGroup("messungen")}
              className="text-left px-3 py-2 bg-gray-50 cursor-pointer flex justify-between items-center border-b border-gray-200 hover:bg-gray-100"
            >
              <b className="text-sm">Messungen</b>
              <div className="flex items-center gap-2">
                <span className="bg-gray-500 text-white rounded-full px-2 py-0.5 text-xs font-bold">
                  {measurementListItems.length}
                </span>
                {onMeasurementsDeleteAll && (
                  <button
                    type="button"
                    title="Alle Messungen löschen"
                    aria-label="Alle Messungen löschen"
                    onClick={(e) => {
                      // Stop propagation so we don't toggle the group
                      // collapse alongside the destructive action.
                      e.stopPropagation();
                      onMeasurementsDeleteAll();
                    }}
                    className="text-gray-500 hover:text-gray-400"
                  >
                    <FontAwesomeIcon icon={faTrashCan} className="text-sm" />
                  </button>
                )}
              </div>
            </div>
            {!collapsedGroups["messungen"] &&
              measurementListItems.map((item, index) => {
                const selected = selectedMeasurementId === item.id;
                return (
                  <div
                    key={`messungen-${item.id}-${index}`}
                    onClick={() => onMeasurementSelect?.(item.id)}
                    className={`group relative px-3 py-2 cursor-pointer border-b border-gray-100 pl-4 ${
                      selected ? SELECTED_ROW_STYLE : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex justify-between gap-2 overflow-hidden">
                      <span className="shrink-0 whitespace-nowrap text-sm">
                        <b>{item.main}</b>
                      </span>
                      <span className="grow text-right whitespace-nowrap text-ellipsis overflow-hidden text-xs text-gray-500">
                        {item.upperright}
                      </span>
                    </div>
                    {item.subtitle && (
                      <div className="text-left text-xs text-gray-500 whitespace-nowrap text-ellipsis overflow-hidden mt-0.5">
                        {item.subtitle}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
        {totalCount === 0 && !isLoading ? (
          <div className="p-4 text-gray-500 text-center text-sm">
            {emptyMessage}
          </div>
        ) : (
          <div>
            {sortedGroupEntries.map(([groupKey, group]) => (
              <div key={groupKey}>
                <div
                  onClick={() => toggleGroup(groupKey)}
                  className="text-left px-3 py-2 bg-gray-50 cursor-pointer flex justify-between items-center border-b border-gray-200 hover:bg-gray-100"
                >
                  <b className="text-sm">
                    {group.label ?? toTitleCase(groupKey)}
                  </b>
                  <span className="bg-gray-500 text-white rounded-full px-2 py-0.5 text-xs font-bold">
                    {group.total}
                  </span>
                </div>

                {!isOverviewMode &&
                  !collapsedGroups[groupKey] &&
                  group.items.map((feature, index) => {
                    const listItem = getListItem(feature);
                    const selected = isFeatureSelected(feature);
                    const pendingDeletion = isFeaturePendingDeletion(feature);
                    return (
                      <div
                        key={`${feature.source}-${feature.sourceLayer}-${feature.id}-${index}`}
                        ref={selected ? selectedItemRef : null}
                        onClick={() => handleFeatureClick(feature)}
                        className={`group relative px-3 py-2 cursor-pointer border-b border-gray-100 ${
                          group.indentLeuchten &&
                          feature.sourceLayer === "leuchten" &&
                          group.pairedStandortKeys?.has(
                            String(feature.properties?.fk_standort)
                          )
                            ? "pl-8"
                            : "pl-4"
                        } ${
                          selected ? SELECTED_ROW_STYLE : "hover:bg-gray-50"
                        }`}
                      >
                        <div
                          className={`transition-opacity ${
                            highlightCount != null &&
                            highlightCount > 0 &&
                            altHeld &&
                            onFeatureDismiss
                              ? "group-hover:opacity-30"
                              : ""
                          }`}
                        >
                          <div className="flex justify-between gap-2 overflow-hidden">
                            <span
                              className={`shrink-0 whitespace-nowrap text-sm ${
                                pendingDeletion ? "text-[#cf222e]" : ""
                              }`}
                            >
                              <b>{listItem.main}</b>
                              {feature.properties?._isCreation && (
                                <span className="bg-green-500 text-white text-[10px] px-1 rounded ml-1 font-normal">
                                  Neu
                                </span>
                              )}
                              {IS_LOCAL_DEV && feature.properties?.brandnew && (
                                <FontAwesomeIcon
                                  icon={faStar}
                                  className="ml-1 text-yellow-500"
                                  title="brand new feature"
                                />
                              )}
                            </span>
                            <span
                              className={`grow text-right whitespace-nowrap text-ellipsis overflow-hidden text-sm ${
                                pendingDeletion
                                  ? "text-[#cf222e]"
                                  : "text-gray-700"
                              }`}
                            >
                              {listItem.upperright}
                            </span>
                          </div>
                          {listItem.subtitle && (
                            <div
                              className={`text-left text-xs whitespace-nowrap text-ellipsis overflow-hidden mt-0.5 ${
                                pendingDeletion
                                  ? "text-[#c08a8e]"
                                  : "text-gray-500"
                              }`}
                            >
                              {listItem.subtitle}
                            </div>
                          )}
                        </div>
                        {highlightCount != null &&
                          highlightCount > 0 &&
                          altHeld &&
                          onFeatureDismiss && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onFeatureDismiss(feature);
                              }}
                              // Hidden base state via inline opacity, NOT the
                              // `opacity-0` utility: with `important: true`,
                              // Tailwind keeps `opacity-0` inside `@layer tw` but
                              // hoists `group-hover:opacity-100` out unlayered, and
                              // a layered !important wins over an unlayered one — so
                              // `opacity-0` would always beat the hover reveal and
                              // the ✕ never shows. Inline opacity is a normal
                              // declaration the !important hover rule can override.
                              style={{ opacity: 0 }}
                              className="absolute inset-0 flex items-center justify-center text-black group-hover:opacity-100 text-lg font-bold"
                              title="Hervorhebung entfernen"
                            >
                              ✕
                            </button>
                          )}
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BelisSidebar;
