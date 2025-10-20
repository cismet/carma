/**
 * Event types for map transition coordination between 2D (Leaflet) and 3D (Cesium)
 */
export enum TransitionCtxEvent {
  /**
   * Emitted when transition from 2D to 3D starts
   */
  TransitionTo3dStart = "TransitionTo3dStart",

  /**
   * Emitted when transition from 2D to 3D completes
   */
  TransitionTo3dComplete = "TransitionTo3dComplete",

  /**
   * Emitted when transition from 3D to 2D starts
   */
  TransitionTo2dStart = "TransitionTo2dStart",

  /**
   * Emitted when transition from 3D to 2D completes
   */
  TransitionTo2dComplete = "TransitionTo2dComplete",

  /**
   * Emitted when any transition is cancelled
   */
  TransitionCancelled = "TransitionCancelled",
}

export type TransitionContextEventMap = {
  [TransitionCtxEvent.TransitionTo3dStart]: void;
  [TransitionCtxEvent.TransitionTo3dComplete]: void;
  [TransitionCtxEvent.TransitionTo2dStart]: void;
  [TransitionCtxEvent.TransitionTo2dComplete]: void;
  [TransitionCtxEvent.TransitionCancelled]: { isTo2d: boolean };
};

export type SubscribeTransitionCtxFn = <
  E extends keyof TransitionContextEventMap
>(
  event: E,
  callback: (data: TransitionContextEventMap[E]) => void
) => () => void;

export type EmitTransitionCtxFn = <E extends keyof TransitionContextEventMap>(
  event: E,
  data: TransitionContextEventMap[E]
) => void;
