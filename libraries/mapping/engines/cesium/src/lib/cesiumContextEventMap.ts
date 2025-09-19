import type {
  EmitFn as EmitFnGeneric,
  SubscribeFn as SubscribeFnGeneric,
} from "@carma-commons/utils";

export enum CtxEvent {
  FovChange,
}

export type CesiumContextEventMap = {
  [CtxEvent.FovChange]: number;
};

// Helper type aliases bound to the Cesium context event map for ergonomics
export type SubscribeCesiumCtxFn = SubscribeFnGeneric<CesiumContextEventMap>;
export type EmitCesiumCtxFn = EmitFnGeneric<CesiumContextEventMap>;
