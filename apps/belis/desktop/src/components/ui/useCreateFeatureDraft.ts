import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { removeMeasurements } from "@carma-mapping/measurements";
import { useMapPage } from "../../contexts/MapPageContext";
import type { CreateFeatureType } from "../../contexts/MapPageContext";
import {
  getAllDrafts,
  setDraft,
  setGlobalEditMode,
} from "../../store/slices/featuresForms";
import {
  getAllCreationDefaults,
  getAllSelectionDefaults,
  pickRememberedValues,
  recordDefaults,
  recordSelectionDefaults,
} from "../../store/slices/creationDefaults";
import { getSelectedFeature } from "../../store/slices/featureCollection";
import {
  getMeasurements,
  MEASUREMENT_FEATUREKIND,
} from "../../store/slices/measurements";
import { getKeyTablesData } from "../../store/slices/keyTables";
import { getJWT } from "../../store/slices/auth";
import { fetchFeatureById } from "../../helper/apiMethods";
import { serializeValues } from "../../helper/draftSerialize";
import {
  buildSyntheticFeature,
  buildSyntheticFetchedData,
  enrichSyntheticProps,
} from "../../helper/buildSyntheticFeature";
import {
  buildMeasurementGeometryOptions,
  buildStandortGeometryOption,
  extractLeitungFeatureInfo,
  leitungLineStringToEpsg25832,
  type MeasurementGeometryOption,
} from "../../helper/geometryOptions";

const STANDORT_SOURCE_LAYERS = new Set([
  "tdta_standort_mast",
  "standort_mast",
  "masten",
  "mast",
  "standorte",
]);

// Geometry-type compatibility for auto-attaching a measurement to a new
// draft. Leitungen are linestrings; every other Fachobjekt is a point.
const measurementMatchesFeatureType = (
  featureType: string,
  geometryType: string
): boolean =>
  featureType === "leitung"
    ? geometryType === "LineString"
    : geometryType === "Point";

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
 * trailing "+" button (FeatureFormLayout). A new Leuchte links to the currently
 * selected Standort only when `options.linkToSelectedStandort` is set — that
 * is the dedicated "Leuchte zu Standort … hinzufügen" menu entry. The plain
 * "Leuchte" entry always creates an empty, unlinked draft.
 *
 * Seeding source depends on the caller (#645):
 *   - default (toolbar dropdown) and `options.seedFromSelection` (per-form
 *     "+" button) share the same source: the feature last selected in
 *     Fachobjekte / last captured by a green "+" press
 *     (`creationDefaults.selectionDefaults`), falling back to the draft-chain
 *     memory (`creationDefaults.defaults`) when nothing has been captured.
 *     A remembered template wins regardless of which creation path the user
 *     takes.
 */
export const useCreateFeatureDraft = () => {
  const { onOpenCreationDraft } = useMapPage();
  const dispatch = useDispatch();
  const selectedFeature = useSelector(getSelectedFeature);
  const allDefaults = useSelector(getAllCreationDefaults);
  const allSelectionDefaults = useSelector(getAllSelectionDefaults);
  const keyTablesData = useSelector(getKeyTablesData);
  const measurementsFeatures = useSelector(getMeasurements);
  const allDrafts = useSelector(getAllDrafts);

  return useCallback(
    (
      key: CreateFeatureType & string,
      options?: {
        linkToSelectedStandort?: boolean;
        seedFromSelection?: boolean;
        /** Current values of the in-progress draft the "+" button was pressed
         * in. Seeds the new draft from these and overwrites the remembered
         * "last values" so the memory mirrors what's on screen (#645). */
        seedValues?: Record<string, unknown>;
      }
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
      let linkedStandortId: number | undefined;
      if (key === "leuchte" && options?.linkToSelectedStandort) {
        const info = extractStandortFeatureInfo(selectedFeature);
        if (info) {
          standortOption = buildStandortGeometryOption(info);
          if (typeof info.id === "number") linkedStandortId = info.id;
          else if (typeof info.id === "string") {
            const parsedId = Number(info.id);
            if (Number.isFinite(parsedId)) linkedStandortId = parsedId;
          }
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

      // Auto-attach a measurement to the new draft when one is in play.
      // Two paths, in priority order:
      //   1. The user has a measurement currently selected — use it.
      //      Selection is mutually exclusive (Fachobjekt and measurement
      //      share one selectedFeature slot), so this branch only fires
      //      when the standort-link branch above did NOT claim selection.
      //   2. Nothing selected, but exactly one *unclaimed* measurement on
      //      the map matches the geometry type the feature type expects
      //      (Leitung → LineString, everything else → Point). Use it.
      // Either way the measurement is hidden from terra-draw below — its
      // Redux record stays so the dropdown shows it and a later detach
      // can restore it.
      let measurementOption: MeasurementGeometryOption | null = null;
      let measurementSourceFeature: GeoJSON.Feature | null = null;
      if (!standortOption && !options?.linkToSelectedStandort) {
        const sf = selectedFeature as
          | { featurekind?: string; id?: string | number }
          | null
          | undefined;
        if (sf?.featurekind === MEASUREMENT_FEATUREKIND && sf.id != null) {
          const measurementId = String(sf.id);
          const found = measurementsFeatures.find(
            (f) => String(f.id) === measurementId
          );
          if (
            found &&
            measurementMatchesFeatureType(key, found.geometry.type)
          ) {
            const opts = buildMeasurementGeometryOptions([found]);
            if (opts.length > 0) {
              measurementOption = opts[0];
              measurementSourceFeature = found;
            }
          }
        }
        if (!measurementOption) {
          // Skip measurements already attached to another draft — those are
          // hidden from terra-draw and "claimed"; auto-attaching here would
          // steal them and break the owning draft.
          const claimedKeys = new Set<string>();
          for (const d of Object.values(allDrafts)) {
            const gk = d.geometryKey;
            if (gk && gk.startsWith("measurement.")) claimedKeys.add(gk);
          }
          const compatible = measurementsFeatures.filter(
            (f) =>
              measurementMatchesFeatureType(key, f.geometry.type) &&
              !claimedKeys.has(`measurement.${String(f.id)}`)
          );
          if (compatible.length === 1) {
            const opts = buildMeasurementGeometryOptions([compatible[0]]);
            if (opts.length > 0) {
              measurementOption = opts[0];
              measurementSourceFeature = compatible[0];
            }
          }
        }
      }

      const sourceOption = standortOption ?? measurementOption;
      const geomKey: string | undefined = sourceOption?.key;
      const geom: GeoJSON.Geometry | undefined = sourceOption
        ? (sourceOption.geometry as GeoJSON.Geometry)
        : undefined;

      // Pick the seed source for the new draft:
      //   - seedValues: the "+" button was pressed inside an in-progress
      //     draft. Seed straight from that draft's current values and
      //     overwrite the remembered "last values" so the next new draft —
      //     and the clear button — mirror what was just on screen.
      //   - seedFromSelection (per-form "+" button on an existing Fachobjekt)
      //     and the toolbar dropdown share the same fallback chain: the
      //     selection memory first, draft-chain second. A user-captured
      //     template (green "+" press, or opening an existing Fachobjekt)
      //     should pre-fill the next new feature regardless of which path
      //     creates it.
      let seedSource: Record<string, unknown> | undefined;
      if (options?.seedValues) {
        const serialized = serializeValues(options.seedValues);
        seedSource = pickRememberedValues(key, serialized) ?? {};
        dispatch(
          recordSelectionDefaults({ featureType: key, values: serialized })
        );
      } else {
        seedSource = allSelectionDefaults[key] ?? allDefaults[key];
      }
      // Sync the draft-chain memory (`defaults`) to whatever values we just
      // seeded the new draft with. The per-field green/gray highlight diffs
      // against `defaults`; without this sync, a draft seeded purely from
      // `selectionDefaults` (e.g. after opening an existing Fachobjekt that
      // wrote selectionDefaults but never touched defaults) would render
      // every prefilled field gray on first paint, even though those values
      // are exactly the remembered template the user intended.
      if (seedSource && Object.keys(seedSource).length > 0) {
        dispatch(recordDefaults({ featureType: key, values: seedSource }));
      }
      const seededValues: Record<string, unknown> = {
        ...(seedSource ?? {}),
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

      // Hide the parent Standort's vector-tile icon while a "+ Leuchte zu
      // Standort N" draft is open — the draft renders at the same coords on
      // the brandnew layer, so leaving the original visible stacks two icons
      // at one point and produces an unreadable blob.
      const hiddenOriginalIds =
        linkedStandortId !== undefined
          ? { standorte: [linkedStandortId] }
          : undefined;

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
            enrichSyntheticProps(
              key,
              seededValues,
              keyTablesData,
              standortLeuchtenCount ?? 0
            ),
            geom
          ),
          fetchedData: buildSyntheticFetchedData(key, seededValues),
          isCreation: true,
          geometry: geom,
          geometryKey: geomKey,
          geometryWgs84: standortOption?.geometryWgs84,
          prefillGeometryKey: geomKey,
          linkedStandortLabel: standortOption?.label,
          measurementLabel: measurementOption?.label,
          hiddenOriginalIds,
          // Optimistic seed of the linked Standort's existing Leuchten count
          // so the brandnew icon renders the right number of dots before the
          // mast fetch (and setDraftBestandLeuchten) resolves.
          bestandLeuchtenCount: standortLeuchtenCount,
        })
      );
      // Hide the auto-attached measurement from terra-draw — the draft now
      // renders its own styled feature in its place. The Redux record stays
      // so the dropdown still shows it and a later detach can restore it.
      if (measurementSourceFeature) {
        const rawId = String(measurementSourceFeature.id).replace(
          /^measurement\./,
          ""
        );
        removeMeasurements([rawId]);
      }
      dispatch(setGlobalEditMode(true));
      onOpenCreationDraft?.(key, draftKey);
    },
    [
      dispatch,
      selectedFeature,
      allDefaults,
      allSelectionDefaults,
      keyTablesData,
      measurementsFeatures,
      allDrafts,
      onOpenCreationDraft,
    ]
  );
};

// Fields the Leitung form edits. Carried from the source Leitung onto the
// extension draft so the user starts with the same attributes — the common
// "verlängern" case keeps them and just adds geometry. Mirror the form's
// own getFieldsValue list (LeitungForm.handleSave) and the explicitFields
// declared in featureFormSaveHelpers so the save payload stays in sync.
const LEITUNG_PREFILL_FIELDS = [
  "fk_leitungstyp",
  "fk_material",
  "fk_querschnitt",
] as const;

/**
 * Opens a "Leitung verlängern" extension draft for the currently selected
 * Leitung. Behaves like a creation draft (re-uses the form panel and the
 * brandnew layer) but carries extension-only metadata so the geometry selector
 * can merge the original line with a freshly picked LineString measurement.
 *
 * Returns a no-op when the selected feature is not a Leitung — callers gate on
 * the same `extractLeitungFeatureInfo` check before showing the menu item, so
 * this branch only fires defensively.
 */
export const useExtendLeitungDraft = () => {
  const { onOpenCreationDraft } = useMapPage();
  const dispatch = useDispatch();
  const selectedFeature = useSelector(getSelectedFeature);
  const keyTablesData = useSelector(getKeyTablesData);
  const jwt = useSelector(getJWT) as string | null;

  return useCallback(async () => {
    const info = extractLeitungFeatureInfo(selectedFeature);
    if (!info) return;

    const original25832 = leitungLineStringToEpsg25832(info.geometryWgs84);
    const draftKey = `extend:leitung:${info.id}:${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 9)}`;

    // Pull the source Leitung's editable fields so the form opens with them
    // pre-selected. The by-id query returns fk_* as plain FK ids, matching the
    // shape the form's Selects expect; on failure we open with empty fields.
    let seedValues: Record<string, unknown> = {};
    if (jwt) {
      try {
        const data = await fetchFeatureById(jwt, info.id, "leitungen");
        const leitungRow = (
          data?.leitung as Array<Record<string, unknown>> | undefined
        )?.[0];
        if (leitungRow) {
          for (const field of LEITUNG_PREFILL_FIELDS) {
            const value = leitungRow[field];
            if (value != null) seedValues[field] = value;
          }
        }
      } catch (e) {
        console.warn("[extend-leitung] could not prefetch source leitung", e);
      }
    }

    dispatch(
      setDraft({
        featureId: draftKey,
        featureType: "leitung",
        values: seedValues,
        feature: buildSyntheticFeature(
          "leitung",
          draftKey,
          {
            ...enrichSyntheticProps("leitung", seedValues, keyTablesData, 0),
            // Original Leitung id, carried on the synthetic feature so the
            // sidebar / sticky header / InfoBox can show the source's id
            // (e.g. "L-13564") in place of the "???" placeholder used for
            // brand-new drafts. Sidebar extractors and the InfoBox override
            // path read this prop directly; the form never sees it as a
            // field, so the save payload stays unchanged.
            _originalId: info.id,
          },
          original25832
        ),
        fetchedData: buildSyntheticFetchedData("leitung", seedValues),
        isCreation: true,
        geometry: original25832,
        // Hide the source Leitung from the regular vector-tile layer while the
        // extension draft is open — the brandnew layer renders the (original
        // or merged) line in its place.
        hiddenOriginalIds: { leitungen: [info.id] },
        isExtension: true,
        extendingLeitungId: info.id,
        originalGeometryEpsg25832: original25832,
      })
    );
    dispatch(setGlobalEditMode(true));
    onOpenCreationDraft?.("leitung", draftKey);
  }, [dispatch, selectedFeature, keyTablesData, onOpenCreationDraft, jwt]);
};
