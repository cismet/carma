// Browser APIs that jsdom does not implement but antd and image handling rely on.
if (typeof window !== "undefined") {
  window.URL.createObjectURL ??= () => "";
  window.URL.revokeObjectURL ??= () => undefined;

  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  })) as any;

  window.ResizeObserver ??= class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  window.IntersectionObserver ??= class IntersectionObserver {
    root = null;
    rootMargin = "";
    thresholds = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}
