import type { SceneViewState as SharedSceneViewState } from "@carma-mapping/engines-interop";

export type SceneViewState = SharedSceneViewState;
export type SceneStateHashSnapshot = SceneViewState;

export type SceneStateHashCodec = {
  decode: (value: string | undefined) => SceneStateHashSnapshot | undefined;
  encode: (value: unknown) => string | undefined;
};
