import type {
  CatalogFilter,
  CatalogFilterField,
  CatalogFilters,
  WorkflowPerspective,
} from "@carma-mapping/layers";

/** the FachzwillingRoute fields the playground edits */
export type RouteDraft = {
  path: string;
  title: string;
  description: string;
  thumbnail?: string;
};

/** one workflow card in the builder; `key` keeps the react list stable */
export type WorkflowDraft = {
  key: number;
  id: string;
  title: string;
  description: string;
  thumbnail?: string;
};

/** one perspective (a Workflows subcategory) in the builder */
export type PerspectiveDraft = {
  key: number;
  id: string;
  title: string;
  workflows: WorkflowDraft[];
};

/**
 * Perspectives/workflows only count once they carry an id and a title;
 * incomplete drafts are dropped so both the preview and the export stay valid.
 */
export const toWorkflowPerspectives = (
  drafts: PerspectiveDraft[]
): WorkflowPerspective[] =>
  drafts
    .filter((draft) => draft.id.trim() && draft.title.trim())
    .map((draft) => ({
      id: draft.id.trim(),
      title: draft.title.trim(),
      workflows: draft.workflows
        .filter((workflow) => workflow.id.trim() && workflow.title.trim())
        .map((workflow) => ({
          id: workflow.id.trim(),
          title: workflow.title.trim(),
          ...(workflow.description.trim()
            ? { description: workflow.description.trim() }
            : {}),
          ...(workflow.thumbnail?.trim()
            ? { thumbnail: workflow.thumbnail.trim() }
            : {}),
        })),
    }));

/** one filter row in the builder; `key` keeps the react list stable */
export type FilterDraft = {
  key: number;
  field: CatalogFilterField;
  values: string[];
};

/** one OR-group of AND-combined filter rows */
export type FilterGroupDraft = {
  key: number;
  filters: FilterDraft[];
};

const toActiveGroup = (group: FilterGroupDraft): CatalogFilter[] =>
  group.filters
    .filter((draft) => draft.values.length > 0)
    .map(({ field, values }) => ({ field, values }));

/**
 * Rows without values are drafts and do not restrict the catalog yet; a
 * single active group exports as a flat filter list (today's config style),
 * several active groups export as OR-combined groups.
 */
export const toCatalogFilters = (
  groups: FilterGroupDraft[]
): CatalogFilters => {
  const activeGroups = groups
    .map(toActiveGroup)
    .filter((group) => group.length > 0);
  return activeGroups.length === 1 ? activeGroups[0] : activeGroups;
};
