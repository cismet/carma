import type { FC } from "react";

import type {
  GroupToolConfigMap,
  GroupToolType,
  LayerGroup,
  LayerStackEntry,
} from "@carma-mapping/layers";
import {
  GROUP_TOOL_TYPES,
  isLayerGroup,
  normalizeGroupTools,
} from "@carma-mapping/layers";

import { GroupLayerVisibilityButtons } from "./GroupLayerVisibilityButtons";

export type GroupToolHostApi = {
  changeLayerVisibility: (id: string, visible: boolean) => void;
};

type GroupToolProps<K extends GroupToolType> = {
  group: LayerGroup;
  config?: GroupToolConfigMap[K];
  host: GroupToolHostApi;
};

const GroupLayerVisibilityTool: FC<
  GroupToolProps<typeof GROUP_TOOL_TYPES.LAYER_VISIBILITY>
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
  [GROUP_TOOL_TYPES.LAYER_VISIBILITY]: GroupLayerVisibilityTool,
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
