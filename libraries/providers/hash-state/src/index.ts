export {
  HashStateProvider,
  useHashState,
  type HashChangeEvent,
  type HashChangeSource,
  type HashCodecs,
  type HashCodec,
  type HashKeyAliases,
  type HashRoutingMode,
} from "./lib/HashStateProvider";

export {
  defaultHashCodecs,
  defaultHashKeyAliases,
  defaultHashKeyOrder,
} from "./lib/hashCodecs";

export {
  decodeSceneDescriptorHashSnapshot,
  encodeSceneDescriptorHashSnapshot,
  readMapLibrePlusElevationHashValuesFromSceneDescriptor,
  readObjectCentricRangeFromMapLibreZoom,
  readSceneDescriptorFromMapLibrePlusElevationHashValues,
  sceneDescriptorHashCodec,
  type SceneDescriptorHashSnapshot,
} from "./lib/sceneDescriptorHashCodec";

export {
  readSceneDescriptorHashSnapshotFromSceneState,
} from "./lib/sceneDescriptorHashSceneStateAdapter";

export {
  DEFAULT_SCENE_DESCRIPTOR_HASH_CLEAR_KEYS,
  useSceneDescriptorHashSync,
  type SceneDescriptorHashSyncCameraLike,
  type SceneDescriptorHashSyncSceneLike,
  type UseSceneDescriptorHashSyncOptions,
} from "./lib/useSceneDescriptorHashSync";

export { useInitialSceneDescriptorHashSnapshot } from "./lib/useInitialSceneDescriptorHashSnapshot";
