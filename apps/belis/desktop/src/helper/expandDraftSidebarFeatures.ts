import type { MapGeoJSONFeatureWithOriginal as SidebarFeature } from "@carma-mapping/utils";
import type {
  BestandLeuchteEntry,
  Draft,
} from "../store/slices/featuresForms";
import {
  buildSyntheticFeature,
  enrichSyntheticProps,
} from "./buildSyntheticFeature";

// Tab keys used by FeatureFormLayout for the Leuchten creation flow:
//   - the Standort tab is an `additionalTab` with key "standort"
//   - "Leuchte 1" is the general tab, key "general"
//   - every "+"-added Leuchte tab keys on its own `_tabId`
// The sidebar carries the matching key on `_draftTabKey` so a row click can
// focus the right tab (see BelisMapWrapper.handleSidebarFeatureSelect).
const STANDORT_TAB_KEY = "standort";
const LEUCHTE_ONE_TAB_KEY = "general";

// Synthetic id for the Standort parent of a Leuchten creation draft. The same
// id is used as `fk_standort` on each child Leuchte row so BelisSidebar's
// cluster grouping pairs them, and as the feature id for the brandnew map
// source so feature-state can be attached.
const leuchteDraftStandortId = (draftKey: string) => `${draftKey}::standort`;

// Build the Standort synthetic feature for a Leuchten creation draft. Same
// shape on the sidebar and the map: the brandnew `standorte` style reads
// `lfd_nummer` (icon label) and `leuchten_count` (icon variant + dot count),
// so we set both — `leuchten_count = bestand + 1 + extras` mirrors the formula
// used in `enrichSyntheticProps`' leuchte branch and matches what the icon
// will look like after save.
export function buildLeuchteDraftStandortFeature(
  draftKey: string,
  draft: Draft,
  keyTables: Record<string, unknown>
): SidebarFeature {
  const values = (draft.values ?? {}) as Record<string, unknown>;
  const mast = (values.mast ?? {}) as Record<string, unknown>;
  const extras = Array.isArray(values.leuchten)
    ? (values.leuchten as Array<Record<string, unknown>>)
    : [];
  const leuchtenCount = (draft.bestandLeuchtenCount ?? 0) + 1 + extras.length;

  return buildSyntheticFeature(
    "standort",
    leuchteDraftStandortId(draftKey),
    {
      ...enrichSyntheticProps("standort", mast, keyTables),
      leuchten_count: leuchtenCount,
      _draftKey: draftKey,
      _draftTabKey: STANDORT_TAB_KEY,
    },
    draft.geometry
  ) as unknown as SidebarFeature;
}

// A Leuchten creation draft holds one Standort (`values.mast`), "Leuchte 1"
// (`values.leuchte`) and every "+"-added tab (`values.leuchten[]`) in a single
// Redux draft. Expand it into the per-row synthetic features the sidebar's
// Standort/Leuchten clustering expects: one `standorte` parent + one `leuchten`
// child per Leuchte tab, linked via `fk_standort`.
function expandLeuchteCreationDraft(
  draftKey: string,
  draft: Draft,
  keyTables: Record<string, unknown>
): SidebarFeature[] {
  const values = (draft.values ?? {}) as Record<string, unknown>;
  const mast = (values.mast ?? {}) as Record<string, unknown>;
  const leuchteOne = (values.leuchte ?? {}) as Record<string, unknown>;
  const extras = Array.isArray(values.leuchten)
    ? (values.leuchten as Array<Record<string, unknown>>)
    : [];

  const standortId = leuchteDraftStandortId(draftKey);

  const buildLeuchteChild = (
    idSuffix: string,
    tabKey: string,
    leuchteFields: Record<string, unknown>
  ): SidebarFeature =>
    buildSyntheticFeature(
      "leuchte",
      `${draftKey}::leuchte::${idSuffix}`,
      {
        ...enrichSyntheticProps(
          "leuchte",
          { leuchte: leuchteFields, mast },
          keyTables
        ),
        fk_standort: standortId,
        _draftKey: draftKey,
        _draftTabKey: tabKey,
      },
      draft.geometry
    ) as unknown as SidebarFeature;

  const features: SidebarFeature[] = [
    buildLeuchteDraftStandortFeature(draftKey, draft, keyTables),
  ];

  // Read-only rows for each existing Leuchte on the parent Standort. Mirrored
  // from LeuchteForm's mast fetch via `setDraftBestandLeuchten`. They cluster
  // under the same synthetic `standortId` as the draft's own Leuchten rows so
  // BelisSidebar groups them together, and they sit before the editable rows
  // because they're appended first. `_draftTabKey` matches the Bestand tab key
  // that LeuchteForm builds — clicking the row dispatches
  // `requestDraftTabFocus(bestand-...)`, which the form's tab focus listener
  // already routes via FeatureFormLayout. No `_isCreation` flag so the sidebar
  // omits the "[Neu]" badge for these rows.
  const bestand = draft.bestandLeuchten ?? [];
  for (const entry of bestand) {
    features.push(buildBestandRow(draftKey, standortId, entry));
  }

  features.push(buildLeuchteChild("main", LEUCHTE_ONE_TAB_KEY, leuchteOne));

  for (const entry of extras) {
    const tabId = typeof entry._tabId === "string" ? entry._tabId : undefined;
    if (!tabId) continue;
    const { _tabId, ...fields } = entry;
    void _tabId;
    features.push(buildLeuchteChild(tabId, tabId, fields));
  }

  return features;
}

// Build a sidebar row for a bestand (existing) Leuchte. Manual construction
// (vs. `buildSyntheticFeature`) keeps `_isCreation` off — bestand entries
// aren't drafts, so the "[Neu]" badge must not appear.
function buildBestandRow(
  draftKey: string,
  standortId: string,
  entry: BestandLeuchteEntry
): SidebarFeature {
  const rowId = `${draftKey}::bestand::${entry.id}`;
  return {
    type: "Feature",
    id: rowId,
    properties: {
      id: rowId,
      _featureType: "leuchte",
      _sourceLayer: "leuchten",
      _draftKey: draftKey,
      _draftTabKey: entry.tabKey,
      // Cluster under the same synthetic Standort as the draft's other rows.
      fk_standort: standortId,
      leuchtennummer: entry.leuchtennummer,
      lfd_nummer: entry.lfd_nummer,
      leuchtentyp: entry.leuchtentyp,
      fabrikat: entry.fabrikat,
      strasse: entry.strasse,
    },
    geometry: null,
    sourceLayer: "leuchten",
    source: "",
    layer: { id: "leuchten", source: "", type: "circle" as const },
    state: {},
  } as unknown as SidebarFeature;
}

// A Standort creation draft holds the Mast flat in `values` plus every
// "+ Leuchte" tab under `values.leuchten[]`. Expand it into its Standort parent
// row (the draft's own stored `feature`, id = `draftKey`) plus one `leuchten`
// child per lamp, clustered under the Standort via `fk_standort = draftKey`
// (BelisSidebar pairs leuchten to their Standort by matching `fk_standort`
// against the Standort row's `properties.id`). Each child carries `_draftKey`
// and `_draftTabKey` so a row click focuses the matching form tab. With no
// lamps the draft contributes its single feature unchanged.
function expandStandortCreationDraft(
  draftKey: string,
  draft: Draft,
  keyTables: Record<string, unknown>
): SidebarFeature[] {
  const parent = draft.feature as SidebarFeature;
  const values = (draft.values ?? {}) as Record<string, unknown>;
  const extras = Array.isArray(values.leuchten)
    ? (values.leuchten as Array<Record<string, unknown>>)
    : [];
  if (extras.length === 0) return [parent];

  // Flat Mast slice = everything on the draft except the leuchten array.
  const { leuchten: _leuchten, ...mast } = values;
  void _leuchten;

  const features: SidebarFeature[] = [parent];
  for (const entry of extras) {
    const tabId = typeof entry._tabId === "string" ? entry._tabId : undefined;
    if (!tabId) continue;
    const { _tabId, ...fields } = entry;
    void _tabId;
    features.push(
      buildSyntheticFeature(
        "leuchte",
        `${draftKey}::leuchte::${tabId}`,
        {
          ...enrichSyntheticProps(
            "leuchte",
            { leuchte: fields, mast },
            keyTables
          ),
          fk_standort: draftKey,
          _draftKey: draftKey,
          _draftTabKey: tabId,
        },
        draft.geometry
      ) as unknown as SidebarFeature
    );
  }
  return features;
}

/**
 * Builds the feature list rendered in the "Entwürfe" sidebar tab.
 *
 * A Leuchten creation draft is expanded into a Standort parent row plus one
 * nested Leuchte row per form tab (see `expandLeuchteCreationDraft`). A Standort
 * creation draft with "+ Leuchte" tabs is likewise expanded into its Standort
 * parent plus one nested Leuchte row per lamp (see
 * `expandStandortCreationDraft`). Every other draft contributes its single
 * stored `feature` unchanged.
 *
 * `keyTables` denormalizes the form's FK ids into the flat label strings the
 * sidebar extractors read (leuchtentyp, fabrikat, mastart, …) — the same data
 * `useCreateFeatureDraft` / FeaturesFormsWrapper feed into a draft's single
 * synthetic `feature`.
 */
export function expandDraftSidebarFeatures(
  drafts: Record<string, Draft>,
  keyTables: Record<string, unknown> = {}
): SidebarFeature[] {
  const out: SidebarFeature[] = [];
  for (const [draftKey, draft] of Object.entries(drafts)) {
    if (
      draft.featureType === "leuchte" &&
      draft.isCreation === true &&
      draft.feature != null
    ) {
      out.push(...expandLeuchteCreationDraft(draftKey, draft, keyTables));
    } else if (
      draft.featureType === "standort" &&
      draft.isCreation === true &&
      draft.feature != null
    ) {
      out.push(...expandStandortCreationDraft(draftKey, draft, keyTables));
    } else if (draft.feature != null) {
      out.push(draft.feature as SidebarFeature);
    }
  }
  return out;
}
