import {
  LAYER_ENTITY_TYPES,
  type Layer,
  type LayerGroup,
  type LayerStackEntry,
} from "../lib/contracts/carma-layers.d";

export const isLayerGroup = (
  entry: LayerStackEntry | undefined
): entry is LayerGroup => entry?.type === LAYER_ENTITY_TYPES.GROUP;

export const layerGroupHasInfoView = (group: LayerGroup): boolean =>
  !!(group.description || group.groupInfo);

const maskMemberWithGroup = (member: Layer, group: LayerGroup): Layer => {
  const visible = group.visible !== false && member.visible !== false;
  const opacity =
    group.opacity === undefined
      ? member.opacity
      : group.opacity * (member.opacity ?? 1);
  const masked: Layer = {
    ...member,
    visible,
    group: {
      id: group.id,
      title: group.title,
      ...(group.icon ? { icon: group.icon } : {}),
      ...(group.thumbnail ? { thumbnail: group.thumbnail } : {}),
    },
  };
  if (opacity !== undefined) {
    masked.opacity = opacity;
  }
  return masked;
};

export const flattenLayerStack = (stack: LayerStackEntry[]): Layer[] => {
  const flat: Layer[] = [];
  stack.forEach((entry) => {
    if (isLayerGroup(entry)) {
      entry.layers.forEach((member) => {
        flat.push(maskMemberWithGroup(member, entry));
      });
    } else {
      flat.push(entry);
    }
  });
  return flat;
};

export const getStackLayers = (stack: LayerStackEntry[]): Layer[] =>
  stack.flatMap((entry) => (isLayerGroup(entry) ? entry.layers : [entry]));

export const findStackEntryByLayerId = (
  stack: LayerStackEntry[],
  id: string
): { entry: LayerStackEntry; index: number; member?: Layer } | undefined => {
  for (let index = 0; index < stack.length; index++) {
    const entry = stack[index];
    if (entry.id === id) {
      return { entry, index };
    }
    if (isLayerGroup(entry)) {
      const member = entry.layers.find((layer) => layer.id === id);
      if (member) {
        return { entry, index, member };
      }
    }
  }
  return undefined;
};
