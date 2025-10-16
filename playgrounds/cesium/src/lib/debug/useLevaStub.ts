// Leva hook stub for the cesium playground
// Provides a minimal implementation that matches the tweakpane interface
// but does nothing (debug UI disabled in snapshot)

export const useLevaStub = (_config?: any) => {
  // No-op stub - returns empty paneCallback
  return { paneCallback: null };
};
