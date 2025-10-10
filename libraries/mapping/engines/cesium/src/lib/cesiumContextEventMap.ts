import type {
  EmitFn as EmitFnGeneric,
  SubscribeFn as SubscribeFnGeneric,
} from "@carma-providers/event-bus";

export enum CtxEvent {
  Activate = "Activate",
  Suspend = "Suspend",
  AnimationStart = "AnimationStart",
  AnimationEnd = "AnimationEnd",
  GoHome = "GoHome",
  SceneReady = "SceneReady",
  SuspendSSCC = "SuspendSSCC",
  ResumeSSCC = "ResumeSSCC",
  SetMinZoomDistance = "SetMinZoomDistance",
  SetMaxZoomDistance = "SetMaxZoomDistance",
  SetEnableCollisionDetection = "SetEnableCollisionDetection",
  SetSceneStyle = "SetSceneStyle",
  ToggleSceneStyle = "ToggleSceneStyle",
  SetTilesetVisibility = "SetTilesetVisibility",
  SetTilesetOpacity = "SetTilesetOpacity",
  SetHomePosition = "SetHomePosition",
  SetHomeOffset = "SetHomeOffset",
  FovChange = "FovChange",
}

export type CesiumContextEventMap = {
  [CtxEvent.GoHome]: void;
  [CtxEvent.Suspend]: void;
  [CtxEvent.Activate]: void;
  [CtxEvent.AnimationStart]: void;
  [CtxEvent.AnimationEnd]: void;
  [CtxEvent.SceneReady]: void;
  [CtxEvent.SuspendSSCC]: void;
  [CtxEvent.ResumeSSCC]: void;
  [CtxEvent.SetMinZoomDistance]: number;
  [CtxEvent.SetMaxZoomDistance]: number;
  [CtxEvent.SetEnableCollisionDetection]: boolean;
  [CtxEvent.SetSceneStyle]: string;
  [CtxEvent.ToggleSceneStyle]: void;
  [CtxEvent.SetTilesetVisibility]: { id: string; visible: boolean };
  [CtxEvent.SetTilesetOpacity]: { id: string; opacity: number };
  [CtxEvent.SetHomePosition]: { x: number; y: number; z: number };
  [CtxEvent.SetHomeOffset]: { x: number; y: number; z: number };
  [CtxEvent.FovChange]: number;
};

// Helper type aliases bound to the Cesium context event map for ergonomics
export type SubscribeCesiumCtxFn = SubscribeFnGeneric<CesiumContextEventMap>;
export type EmitCesiumCtxFn = EmitFnGeneric<CesiumContextEventMap>;
