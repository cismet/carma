import { createContext, type MutableRefObject } from "react";
import type {
  SubscribeTransitionCtxFn,
  EmitTransitionCtxFn,
} from "./transitionContextEventMap";

export enum MapTransitionState {
  mode2d = "mode2d",
  mode3d = "mode3d",
  preTransitionTo2d = "preTransitionTo2d",
  transitionTo2d = "transitionTo2d",
  postTransitionTo2d = "postTransitionTo2d",
  preTransitionTo3d = "preTransitionTo3d",
  transitionTo3d = "transitionTo3d",
  postTransitionTo3d = "postTransitionTo3d",
}

export type MapTransitionLifecycle = {
  [MapTransitionState.preTransitionTo2d]?: () => void | Promise<void>;
  [MapTransitionState.preTransitionTo3d]?: () => void | Promise<void>;
};

export interface TransitionContextType {
  transitionStateRef: MutableRefObject<MapTransitionState>;
  transitionLifecycleRef: MutableRefObject<MapTransitionLifecycle>;
  subscribe: SubscribeTransitionCtxFn;
  emit: EmitTransitionCtxFn;
}

export const TransitionContext = createContext<TransitionContextType | null>(
  null
);
