import type { ViewState as SharedViewState } from "@carma-mapping/engines-interop/view-sync";

export type ViewState = SharedViewState;
export type SceneStateHashSnapshot = ViewState;

export type SceneStateHashCodec = {
  decode: (value: string | undefined) => SceneStateHashSnapshot | undefined;
  encode: (value: unknown) => string | undefined;
};
