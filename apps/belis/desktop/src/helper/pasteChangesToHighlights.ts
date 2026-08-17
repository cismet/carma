import { fetchFeatureById, type FeatureType } from "./apiMethods";
import { serializeValues } from "./draftSerialize";
import { buildLeuchteFormValues } from "../components/ui/featuresForm/leuchteFormValues";
import {
  setDraft,
  setOriginalValues,
  type Draft,
} from "../store/slices/featuresForms";
import type { RepeatableChangeSet } from "../store/slices/repeatableChanges";

/**
 * Batch "Wiederholfelder einfügen": stamp the copied field values onto every
 * highlighted Fachobjekt of the matching type, creating one draft per feature.
 *
 * The single-feature paste in the Datenblatt header writes into a mounted AntD
 * form. Here no form exists — the target Datenblätter were never opened — so
 * each draft has to be assembled by hand from the server record:
 *
 *   1. fetch the feature (the same by-id query the datasheet uses),
 *   2. project it onto form values with `buildLeuchteFormValues` — the very
 *      mapping `LeuchteFormFields` seeds its form with,
 *   3. store that as the draft's baseline (`originalValues`) so only the pasted
 *      fields read as changed once the Datenblatt is opened,
 *   4. store baseline + pasted fields as the draft's values.
 *
 * Step 2 is what makes the draft saveable: `saveFeatureDraft` sends
 * `draft.values` as the payload, so a draft holding only the pasted fields
 * would save a Leuchte stripped of everything else.
 */

// Which highlighted features a stored change set applies to, and how to fetch
// them. Keyed by the `repeatableChanges` feature type — only Leuchte offers
// copy/paste today; adding a type here plus its form-values builder below is
// what it takes to extend the action.
const BATCH_PASTE_TARGETS: Record<
  string,
  {
    /** MapLibre source-layer of the highlighted features to act on. */
    sourceLayer: string;
    /** Feature type for the by-id GraphQL query. */
    apiFeatureType: FeatureType;
    /** Key holding the record array in that query's response. */
    graphqlKey: string;
    /** Plural label for the confirm dialog and the result message. */
    label: string;
    buildFormValues: (
      record: Record<string, unknown>
    ) => Record<string, unknown>;
  }
> = {
  leuchte: {
    sourceLayer: "leuchten",
    apiFeatureType: "leuchten",
    graphqlKey: "tdta_leuchten",
    label: "Leuchten",
    buildFormValues: buildLeuchteFormValues,
  },
};

export const getBatchPasteTarget = (featureType: string) =>
  BATCH_PASTE_TARGETS[featureType];

/** Feature shape the highlights carry — a MapLibre feature, narrowed. */
interface HighlightFeature {
  id?: string | number;
  type?: string;
  source?: string;
  sourceLayer?: string;
  properties?: Record<string, unknown> | null;
  geometry?: GeoJSON.Geometry;
}

// Which BelIS layer a highlighted feature belongs to. Vector-tile features
// carry it as `sourceLayer`; features from the brandnew GeoJSON source (same-day
// creations) have no tile layer of their own and name it in `_sourceLayer`.
const featureSourceLayer = (feature: HighlightFeature): string =>
  feature.sourceLayer ?? String(feature.properties?._sourceLayer ?? "");

/** The highlighted features the stored change set can be pasted onto. */
export const filterPasteTargets = (
  features: readonly HighlightFeature[] | null | undefined,
  featureType: string
): HighlightFeature[] => {
  const target = BATCH_PASTE_TARGETS[featureType];
  if (!target || !features) return [];
  return features.filter(
    (f) => featureSourceLayer(f) === target.sourceLayer && getDbId(f) != null
  );
};

const getDbId = (feature: HighlightFeature): number | undefined => {
  const raw = feature.properties?.id ?? feature.id;
  const id = Number(raw);
  return Number.isFinite(id) ? id : undefined;
};

// Serializable snapshot of the highlighted feature, in the same shape the
// datasheet path stores on a draft — MapLibre's own feature object carries
// non-serializable members that would not survive redux-persist.
const toDraftFeature = (feature: HighlightFeature, sourceLayer: string) => {
  // The BelIS layer, not the tile layer a brandnew feature happens to ride in —
  // the sidebar's draft rows and the map's hide-the-original logic both key on
  // this, as does the "<sourceLayer>:<dbPK>" draft key.
  const layer = featureSourceLayer(feature) || sourceLayer;
  return {
    type: feature.type ?? "Feature",
    id: feature.id,
    properties: feature.properties ?? {},
    geometry: feature.geometry,
    sourceLayer: layer,
    source: feature.source ?? "",
    layer: {
      id: layer,
      source: feature.source ?? "",
      type: "circle" as const,
    },
    state: {},
  };
};

// The draft key for a feature, "<sourceLayer>:<dbPK>" — matching what
// FeaturesFormsWrapper builds when the Datenblatt is opened. An already-open
// draft for the same DB record is adopted under ITS key rather than duplicated:
// a feature selected through the brandnew GeoJSON source keys its draft on that
// source name instead of the tile source-layer, and two drafts for one record
// would both show up in "Entwürfe" and both be saved.
const resolveDraftKey = (
  drafts: Record<string, Draft>,
  featureType: string,
  sourceLayer: string,
  dbId: number
): string => {
  const strictKey = `${sourceLayer}:${dbId}`;
  if (drafts[strictKey]) return strictKey;
  for (const [key, draft] of Object.entries(drafts)) {
    if (draft.isCreation) continue;
    if (draft.featureType !== featureType) continue;
    const draftDbId = draft.featureDbId ?? Number(key.split(":")[1]);
    if (Number(draftDbId) === dbId) return key;
  }
  return strictKey;
};

export interface BatchPasteResult {
  /** Features whose draft now carries the pasted values. */
  applied: number;
  /** Features already holding exactly these values — no draft was created. */
  unchanged: number;
  /** Features whose record could not be fetched. */
  failed: number;
}

export const pasteChangesToFeatures = async ({
  jwt,
  featureType,
  features,
  changeSet,
  drafts,
  dispatch,
  getDrafts,
}: {
  jwt: string;
  featureType: string;
  features: readonly HighlightFeature[];
  changeSet: RepeatableChangeSet;
  drafts: Record<string, Draft>;
  dispatch: (
    action: ReturnType<typeof setDraft> | ReturnType<typeof setOriginalValues>
  ) => void;
  /** Reads the current drafts back out of the store, so a draft written
   *  earlier in this batch is seen by the features after it — and so the
   *  result can tell "draft written" from "values were already there"
   *  (`setDraft` drops a draft that matches its baseline). */
  getDrafts?: () => Record<string, Draft>;
}): Promise<BatchPasteResult> => {
  const target = BATCH_PASTE_TARGETS[featureType];
  const result: BatchPasteResult = { applied: 0, unchanged: 0, failed: 0 };
  if (!target) return result;

  const pastedSlice = (changeSet.values[featureType] ?? {}) as Record<
    string,
    unknown
  >;
  if (Object.keys(pastedSlice).length === 0) return result;

  // One fetch per feature, a few at a time: sequential round-trips make a
  // large selection crawl, while an unbounded fan-out would fire hundreds of
  // requests at once. The writes stay strictly ordered — `setOriginalValues`
  // prunes baselines whose draft does not exist yet, so each feature's
  // baseline must be followed by its own `setDraft` before the next one runs.
  const FETCH_BATCH_SIZE = 5;

  for (let i = 0; i < features.length; i += FETCH_BATCH_SIZE) {
    const batch = features.slice(i, i + FETCH_BATCH_SIZE);
    const prepared = await Promise.all(
      batch.map(async (feature) => {
        const dbId = getDbId(feature);
        if (dbId == null) return null;
        const featureId = resolveDraftKey(
          getDrafts?.() ?? drafts,
          featureType,
          target.sourceLayer,
          dbId
        );
        // An open draft already holds the full field set (plus any edits the
        // user made in it), so it only needs the pasted keys merged in — no
        // fetch, and no baseline: whatever opened the draft recorded one.
        if ((getDrafts?.() ?? drafts)[featureId]) {
          return { feature, dbId, featureId, data: undefined };
        }
        try {
          const data = (await fetchFeatureById(
            jwt,
            dbId,
            target.apiFeatureType
          )) as Record<string, unknown[]> | undefined;
          if (!data?.[target.graphqlKey]?.[0]) return null;
          return { feature, dbId, featureId, data };
        } catch (error) {
          console.error(
            `[BATCH-PASTE] fetching ${featureType} ${dbId} failed:`,
            error
          );
          return null;
        }
      })
    );

    for (const item of prepared) {
      if (!item) {
        result.failed += 1;
        continue;
      }
      const { feature, dbId, featureId, data } = item;
      const currentDrafts = getDrafts?.() ?? drafts;
      const existing = currentDrafts[featureId];

      if (existing) {
        const existingSlice = (existing.values[featureType] ?? {}) as Record<
          string,
          unknown
        >;
        dispatch(
          setDraft({
            featureId,
            featureType,
            values: {
              ...existing.values,
              [featureType]: { ...existingSlice, ...pastedSlice },
            },
            feature:
              existing.feature ?? toDraftFeature(feature, target.sourceLayer),
            fetchedData: existing.fetchedData,
            featureDbId: existing.featureDbId ?? dbId,
          })
        );
      } else {
        const record = data?.[target.graphqlKey]?.[0] as Record<
          string,
          unknown
        >;
        const baseline = serializeValues(target.buildFormValues(record));
        // Baseline first: `setDraft` drops a draft whose values match it,
        // which is exactly right when the feature already carries the pasted
        // values — nothing changed, so nothing to save.
        dispatch(
          setOriginalValues({
            featureId,
            values: { [featureType]: baseline },
          })
        );
        dispatch(
          setDraft({
            featureId,
            featureType,
            values: { [featureType]: { ...baseline, ...pastedSlice } },
            feature: toDraftFeature(feature, target.sourceLayer),
            fetchedData: data,
            featureDbId: dbId,
          })
        );
      }

      // Without a store reader there is nothing to check against, so the
      // write counts as applied.
      const stored = getDrafts?.();
      if (stored && !stored[featureId]) result.unchanged += 1;
      else result.applied += 1;
    }
  }

  return result;
};
