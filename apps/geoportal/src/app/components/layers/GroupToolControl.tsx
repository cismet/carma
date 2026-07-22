import { FC, useMemo } from "react";
import { useDispatch } from "react-redux";

import { GroupTools, type GroupToolHostApi } from "@carma-mapping/components";
import type { GroupToolConfigMap, LayerGroup } from "@carma-mapping/layers";

import { changeVisibility } from "../../store/slices/mapping";
import { DEFAULT_LAYER_VISIBILITY_TOGGLE_LABELS } from "./layer-visibility-toggle-props";

const GROUP_TOOL_DEFAULT_CONFIGS = {
  layerVisibility: {
    labels: {
      hide: DEFAULT_LAYER_VISIBILITY_TOGGLE_LABELS.hide,
      show: DEFAULT_LAYER_VISIBILITY_TOGGLE_LABELS.show,
    },
  },
} satisfies Partial<GroupToolConfigMap>;

/**
 * Redux adapter around the generic group tools: provides the host api and the
 * geoportal's default tool configs.
 */
const GroupToolControl: FC<{ group: LayerGroup }> = ({ group }) => {
  const dispatch = useDispatch();

  const host = useMemo<GroupToolHostApi>(
    () => ({
      changeLayerVisibility: (id, visible) =>
        dispatch(changeVisibility({ id, visible })),
    }),
    [dispatch]
  );

  return (
    <GroupTools
      group={group}
      host={host}
      defaultConfigs={GROUP_TOOL_DEFAULT_CONFIGS}
    />
  );
};

export default GroupToolControl;
