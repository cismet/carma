import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useMapPage } from "../../contexts/MapPageContext";
import type { CreateFeatureType } from "../../contexts/MapPageContext";
import { setDraft, setGlobalEditMode } from "../../store/slices/featuresForms";
import { getAllCreationDefaults } from "../../store/slices/creationDefaults";
import { getSelectedFeature } from "../../store/slices/featureCollection";
import { getKeyTablesData } from "../../store/slices/keyTables";
import {
  buildSyntheticFeature,
  buildSyntheticFetchedData,
  enrichSyntheticProps,
} from "../../helper/buildSyntheticFeature";
import { buildStandortGeometryOption } from "../../helper/geometryOptions";

const STANDORT_SOURCE_LAYERS = new Set([
  "tdta_standort_mast",
  "standort_mast",
  "masten",
  "mast",
  "standorte",
]);

// The Redux selectedFeature can come through two shapes:
//   - raw MapLibre click: { sourceLayer, id, properties: <flat tile props>, geometry }
//   - processed/override path (sidebar click, fetched record): { carmaInfo: { sourceLayer },
//     properties: { ..., sourceProps: <DB record> }, geometry }
// Normalize both into the input that buildStandortGeometryOption expects.
export const extractStandortFeatureInfo = (
  sf: unknown
): {
  id: number | string;
  geometry: GeoJSON.Geometry;
  properties: Record<string, unknown> | null;
} | null => {
  if (!sf || typeof sf !== "object") return null;
  const f = sf as Record<string, unknown>;
  const carmaInfo = f.carmaInfo as { sourceLayer?: string } | undefined;
  const layer = (carmaInfo?.sourceLayer ?? f.sourceLayer ?? "") as string;
  if (!STANDORT_SOURCE_LAYERS.has(layer)) return null;
  const props = (f.properties ?? null) as Record<string, unknown> | null;
  const sourceProps = props?.sourceProps as
    | Record<string, unknown>
    | null
    | undefined;
  const standortProps =
    sourceProps && typeof sourceProps === "object" ? sourceProps : props;
  const id = (standortProps?.id ?? f.id) as number | string | undefined;
  const geometry = f.geometry as GeoJSON.Geometry | undefined;
  if (id == null || !geometry) return null;
  return { id, geometry, properties: standortProps };
};

/**
 * Creates a new BelIS feature creation draft and opens it.
 *
 * Shared by the toolbar "+" dropdown (CreateFeatureDropdown) and the per-form
 * trailing "+" tab (FeatureFormLayout). A new Leuchte links to the currently
 * selected Standort only when `options.linkToSelectedStandort` is set — that
 * is the dedicated "Leuchte zu Standort … hinzufügen" menu entry. The plain
 * "Leuchte" entry always creates an empty, unlinked draft.
 */
export const useCreateFeatureDraft = () => {
  const { onOpenCreationDraft } = useMapPage();
  const dispatch = useDispatch();
  const selectedFeature = useSelector(getSelectedFeature);
  const allDefaults = useSelector(getAllCreationDefaults);
  const keyTablesData = useSelector(getKeyTablesData);

  return useCallback(
    (
      key: CreateFeatureType & string,
      options?: { linkToSelectedStandort?: boolean }
    ) => {
      const draftKey = `create:${key}:${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 9)}`;

      // For new Leuchten linked via the dedicated menu entry: if a Standort is
      // currently selected, link to it. Capture it now — opening the creation
      // draft replaces selectedFeature in Redux, so the wrapper can no longer
      // recover this association on its own.
      let standortOption = null;
      let standortLeuchtenCount: number | undefined;
      if (key === "leuchte" && options?.linkToSelectedStandort) {
        const info = extractStandortFeatureInfo(selectedFeature);
        if (info) {
          standortOption = buildStandortGeometryOption(info);
          const raw = (info.properties as Record<string, unknown> | null)?.[
            "leuchten_count"
          ];
          const parsed =
            typeof raw === "number"
              ? raw
              : typeof raw === "string"
              ? Number(raw)
              : NaN;
          if (Number.isFinite(parsed)) standortLeuchtenCount = parsed;
        }
      }

      const geomKey: string | undefined = standortOption?.key;
      const geom: GeoJSON.Geometry | undefined = standortOption
        ? (standortOption.geometry as GeoJSON.Geometry)
        : undefined;

      const seededValues: Record<string, unknown> = {
        ...(allDefaults[key] ?? {}),
      };

      // Auto-assign Leuchtennummer: lights on a Mast are 0-indexed, so the next
      // free number equals the parent Standort's existing Leuchten count. Without
      // a linked Standort (a fresh Mast will be created at save), start at 0.
      if (key === "leuchte") {
        const existingLeuchte = (seededValues.leuchte ?? {}) as Record<
          string,
          unknown
        >;
        seededValues.leuchte = {
          ...existingLeuchte,
          leuchtennummer: standortLeuchtenCount ?? 0,
        };
      }

      dispatch(
        setDraft({
          featureId: draftKey,
          featureType: key,
          values: seededValues,
          // Build the initial feature from the seeded/preselected values (not an
          // empty object) so any remembered defaults show in the sidebar right
          // away — matching how handleDraftChange rebuilds it on form edits.
          feature: buildSyntheticFeature(
            key,
            draftKey,
            enrichSyntheticProps(key, seededValues, keyTablesData),
            geom
          ),
          fetchedData: buildSyntheticFetchedData(key, seededValues),
          isCreation: true,
          geometry: geom,
          geometryKey: geomKey,
          geometryWgs84: standortOption?.geometryWgs84,
          prefillGeometryKey: geomKey,
          linkedStandortLabel: standortOption?.label,
        })
      );
      dispatch(setGlobalEditMode(true));
      onOpenCreationDraft?.(key, draftKey);
    },
    [dispatch, selectedFeature, allDefaults, keyTablesData, onOpenCreationDraft]
  );
};
