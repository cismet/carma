export type CesiumTransitionLifecycle = {
  onStarted?: () => void;
  onCompleted?: () => void;
  onCanceled?: () => void;
};

export type CesiumLegacyTransitionCallbacks = {
  onComplete?: () => void;
  onCancel?: () => void;
};
