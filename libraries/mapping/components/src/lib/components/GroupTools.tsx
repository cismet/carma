import type { FC } from "react";

import type {
  GroupToolConfigMap,
  GroupToolDefinition,
  GroupToolEntry,
  GroupToolType,
  LayerGroup,
  LayerStackEntry,
} from "@carma-mapping/layers";

import { GroupLayerVisibilityButtons } from "./GroupLayerVisibilityButtons";

// Local runtime copies of GROUP_TOOL_TYPES.LAYER_VISIBILITY, isLayerGroup and
// normalizeGroupTools: a runtime import would close a module cycle with
// @carma-mapping/layers (which imports this lib) and throw a TDZ error; the
// type imports above are erased and safe.
const LAYER_VISIBILITY = "layerVisibility" satisfies GroupToolType;

const isLayerGroup = (
  entry: LayerStackEntry | undefined
): entry is LayerGroup => entry?.type === "group";

const normalizeGroupTools = (
  tools?: GroupToolEntry[]
): GroupToolDefinition[] =>
  (tools ?? []).map((tool) =>
    typeof tool === "string" ? { type: tool } : tool
  );

export type GroupToolHostApi = {
  changeLayerVisibility: (id: string, visible: boolean) => void;
};

type GroupToolProps<K extends GroupToolType> = {
  group: LayerGroup;
  config?: GroupToolConfigMap[K];
  host: GroupToolHostApi;
};

const GroupLayerVisibilityTool: FC<
  GroupToolProps<typeof LAYER_VISIBILITY>
> = ({ group, config, host }) => (
  <GroupLayerVisibilityButtons
    entries={group.layers.map((member) => ({
      id: member.id,
      title: member.title,
      visible: member.visible !== false,
    }))}
    labels={config?.labels}
    onToggle={host.changeLayerVisibility}
  />
);

const GROUP_TOOL_COMPONENTS: {
  [K in GroupToolType]?: FC<GroupToolProps<K>>;
} = {
  [LAYER_VISIBILITY]: GroupLayerVisibilityTool,
};

export const getRenderableGroupTools = (group: LayerGroup) =>
  normalizeGroupTools(group.tools).filter((definition) =>
    Boolean(GROUP_TOOL_COMPONENTS[definition.type])
  );

export const hasRenderableGroupTools = (
  entry?: LayerStackEntry
): entry is LayerGroup =>
  Boolean(
    entry && isLayerGroup(entry) && getRenderableGroupTools(entry).length > 0
  );

export interface GroupToolsProps {
  group: LayerGroup;
  host: GroupToolHostApi;
  defaultConfigs?: Partial<GroupToolConfigMap>;
}

export const GroupTools = ({
  group,
  host,
  defaultConfigs,
}: GroupToolsProps) => (
  <>
    {getRenderableGroupTools(group).map((definition) => {
      const ToolComponent = GROUP_TOOL_COMPONENTS[definition.type] as FC<
        GroupToolProps<GroupToolType>
      >;
      const config = {
        ...defaultConfigs?.[definition.type],
        ...definition.config,
      };
      return (
        <ToolComponent
          key={definition.type}
          group={group}
          config={config}
          host={host}
        />
      );
    })}
  </>
);
