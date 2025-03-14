// Subscription mechanism for preview visibility changes
type PreviewVisibilityCallback = (isVisible: boolean) => void;
const previewVisibilityCallbacks: PreviewVisibilityCallback[] = [];

export const subscribeToPreviewVisibility = (
  callback: PreviewVisibilityCallback
) => {
  previewVisibilityCallbacks.push(callback);
  return () => {
    const index = previewVisibilityCallbacks.indexOf(callback);
    if (index !== -1) {
      previewVisibilityCallbacks.splice(index, 1);
    }
  };
};

export const notifyPreviewVisibilityChange = (isVisible: boolean) => {
  previewVisibilityCallbacks.forEach((callback) => callback(isVisible));
};
