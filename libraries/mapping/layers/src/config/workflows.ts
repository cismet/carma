import { faListCheck } from "@fortawesome/free-solid-svg-icons";

import {
  LAYER_ENTITY_TYPES,
  type GroupToolEntry,
  type Item,
  type LayerGroupInfo,
} from "../lib/contracts/carma-layers.d";
import type { CategoryDefinition } from "./categoryDefinitions";

/**
 * A Workflow is a (currently inert) thematic entry shown as a card
 * (title/description/thumbnail) in the "Workflows" main category. Workflows are
 * grouped into "Perspektiven", which become the subcategories of that category.
 * Workflows are configured per Fachzwilling, so the "Workflows" category only
 * appears on routes that define perspectives.
 */
export type WorkflowDefinition = {
  /** unique within its perspective; used to build the catalog item id */
  id: string;
  title: string;
  description?: string;
  thumbnail?: string;
  layers?: string[];
  legend?: string[];
  metaDataText?: string;
  links?: { url: string; text: string }[];
  tools?: GroupToolEntry[];
};

export type WorkflowPerspective = {
  /** unique perspective id; used to build the subcategory + item ids */
  id: string;
  /** subcategory heading shown in the "Workflows" main category */
  title: string;
  workflows: WorkflowDefinition[];
};

export const WORKFLOWS_CATEGORY_ID = "workflows";
export const WORKFLOWS_CATEGORY_LABEL = "Workflows";

const toWorkflowGroupInfo = (
  workflow: WorkflowDefinition
): LayerGroupInfo | undefined => {
  const groupInfo: LayerGroupInfo = {
    ...(workflow.legend?.length ? { legend: workflow.legend } : {}),
    ...(workflow.metaDataText ? { metaDataText: workflow.metaDataText } : {}),
    ...(workflow.links?.length ? { links: workflow.links } : {}),
  };
  return Object.keys(groupInfo).length > 0 ? groupInfo : undefined;
};

const toWorkflowItem = (
  perspective: WorkflowPerspective,
  workflow: WorkflowDefinition
): Item => {
  const groupInfo = toWorkflowGroupInfo(workflow);
  return {
    id: `workflow_${perspective.id}_${workflow.id}`,
    name: `workflow_${perspective.id}_${workflow.id}`,
    title: workflow.title,
    description: workflow.description ?? "",
    thumbnail: workflow.thumbnail,
    // the subcategory heading the card is grouped under
    path: perspective.title,
    type: LAYER_ENTITY_TYPES.WORKFLOW,
    serviceName: WORKFLOWS_CATEGORY_ID,
    ...(workflow.layers?.length ? { workflowLayers: workflow.layers } : {}),
    ...(groupInfo ? { groupInfo } : {}),
    ...(workflow.tools?.length ? { tools: workflow.tools } : {}),
  };
};

/**
 * The "Workflows" main category: one static subcategory per perspective, each
 * holding its workflows as inert cards.
 */
export const buildWorkflowsCategoryDefinition = (
  perspectives: WorkflowPerspective[]
): CategoryDefinition => ({
  id: WORKFLOWS_CATEGORY_ID,
  label: WORKFLOWS_CATEGORY_LABEL,
  icon: faListCheck,
  source: "static",
  // gray the sidebar entry out while no perspectives are configured
  disableWhenEmpty: true,
  // Fachzwilling routes carry always-active layer filters; the workflow cards
  // are navigation, not layers, so they must stay visible regardless
  ignoreCatalogFilters: true,
  staticCategories: perspectives.map((perspective) => ({
    id: `${WORKFLOWS_CATEGORY_ID}_${perspective.id}`,
    Title: perspective.title,
    layers: perspective.workflows.map((workflow) =>
      toWorkflowItem(perspective, workflow)
    ),
  })),
});
