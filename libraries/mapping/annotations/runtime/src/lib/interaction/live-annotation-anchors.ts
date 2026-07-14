import type { Cartesian3 } from "@carma-cesium";

export type LiveAnnotationAnchors = {
  set: (nodeId: string, anchor: Cartesian3) => void;
  get: (nodeId: string) => Cartesian3 | undefined;
  delete: (nodeId: string) => void;
  clear: () => void;
  forEach: (callback: (anchor: Cartesian3, nodeId: string) => void) => void;
  readonly size: number;
};

/**
 * Runtime-owned, synchronous positions for annotation nodes currently being
 * dragged. The registry is scoped to one annotations visual host; consumers
 * cannot clear anchors owned by another host or an unrelated overlay feature.
 */
export const createLiveAnnotationAnchors = (
  onChange: () => void
): LiveAnnotationAnchors => {
  const anchors = new Map<string, Cartesian3>();
  return {
    set: (nodeId, anchor) => {
      anchors.set(nodeId, anchor);
      onChange();
    },
    get: (nodeId) => anchors.get(nodeId),
    delete: (nodeId) => {
      if (anchors.delete(nodeId)) {
        onChange();
      }
    },
    clear: () => {
      if (anchors.size === 0) {
        return;
      }
      anchors.clear();
      onChange();
    },
    forEach: (callback) => anchors.forEach(callback),
    get size() {
      return anchors.size;
    },
  };
};
