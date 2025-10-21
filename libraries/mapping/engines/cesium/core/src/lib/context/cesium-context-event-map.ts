import type {
  EmitFn as EmitFnGeneric,
  SubscribeFn as SubscribeFnGeneric,
} from "@carma/providers/event-bus";

export enum CtxEvent {
  Suspend = "Suspend",
  Activate = "Activate",
  SceneVisible = "SceneVisible", // Scene ready to be shown (after positioning)
  AnimationStart = "AnimationStart",
  AnimationEnd = "AnimationEnd",
  GoHome = "GoHome",
  SceneReady = "SceneReady",
  SceneResourcesReady = "SceneResourcesReady",
  SuspendSSCC = "SuspendSSCC",
  ResumeSSCC = "ResumeSSCC",
  SetMinZoomDistance = "SetMinZoomDistance",
  SetMaxZoomDistance = "SetMaxZoomDistance",
  SetEnableCollisionDetection = "SetEnableCollisionDetection",
  SetSceneStyle = "SetSceneStyle",
  ToggleSceneStyle = "ToggleSceneStyle",
  SetTilesetVisibility = "SetTilesetVisibility",
  SetTilesetOpacity = "SetTilesetOpacity",
  SetTilesetSplitDirection = "SetTilesetSplitDirection",
  SetSceneSplitPosition = "SetSceneSplitPosition",
  SetImageryVisibility = "SetImageryVisibility",
  SetImageryOpacity = "SetImageryOpacity",
  SetTerrainProvider = "SetTerrainProvider",
  SetHomePosition = "SetHomePosition",
  SetHomeOffset = "SetHomeOffset",
  FovChange = "FovChange",
  CameraChanged = "CameraChanged",
}

export type CesiumContextEventMap = {
  [CtxEvent.GoHome]: void;
  [CtxEvent.Suspend]: void;
  [CtxEvent.Activate]: void;
  [CtxEvent.SceneVisible]: void;
  [CtxEvent.AnimationStart]: void;
  [CtxEvent.AnimationEnd]: void;
  [CtxEvent.SceneReady]: void;
  [CtxEvent.SceneResourcesReady]: void;
  [CtxEvent.SuspendSSCC]: void;
  [CtxEvent.ResumeSSCC]: void;
  [CtxEvent.SetMinZoomDistance]: number;
  [CtxEvent.SetMaxZoomDistance]: number;
  [CtxEvent.SetEnableCollisionDetection]: boolean;
  [CtxEvent.SetSceneStyle]: string;
  [CtxEvent.ToggleSceneStyle]: void;
  [CtxEvent.SetTilesetVisibility]: { id: string; visible: boolean };
  [CtxEvent.SetTilesetOpacity]: { id: string; opacity: number };
  [CtxEvent.SetTilesetSplitDirection]: { id: string; splitDirection: number };
  [CtxEvent.SetSceneSplitPosition]: number;
  [CtxEvent.SetImageryVisibility]: { id: string; visible: boolean };
  [CtxEvent.SetImageryOpacity]: { id: string; opacity: number };
  [CtxEvent.SetTerrainProvider]: { id: string };
  [CtxEvent.SetHomePosition]: { x: number; y: number; z: number };
  [CtxEvent.SetHomeOffset]: { x: number; y: number; z: number };
  [CtxEvent.FovChange]: number;
  [CtxEvent.CameraChanged]: { lat: number; lng: number; alt: number };
};

// Helper type aliases bound to the Cesium context event map for ergonomics
export type SubscribeCesiumCtxFn = SubscribeFnGeneric<CesiumContextEventMap>;
export type EmitCesiumCtxFn = EmitFnGeneric<CesiumContextEventMap>;
