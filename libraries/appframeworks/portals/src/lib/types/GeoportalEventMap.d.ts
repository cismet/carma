export type GeoportalEventMap = {
  "cesium-suspended": void;
  "cesium-active": void;
  "topicmap-suspended": void;
  "topicmap-active": void;
  "layer-visibility-changed": { layerId: string; visible: boolean };
  "feature-selected": { featureId: string | null };
};
