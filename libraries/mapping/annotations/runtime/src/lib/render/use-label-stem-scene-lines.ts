import { useEffect, useRef } from "react";
import type { Vector3 } from "three";

import {
  isValidAnnotationEngine,
  type AnnotationEngine,
  type AnnotationSceneLineCollection,
  type AnnotationSceneLineHandle,
} from "@carma-mapping/annotations/core";
import type { RuntimePointLabelRenderModel } from "./annotation-render-models";
import {
  resolveLabelStemPositionsECEF,
  resolveLabelStemSceneStyle,
  type LabelStemLayout,
} from "./label-stem-scene-lines";
import { pointLabelVisualizerDefaults } from "./point-label-overlay-state";

type StemLine = {
  line: AnnotationSceneLineHandle;
  color: string;
  /** The occlusion and opacity the line's style was last set for. */
  styleKey: string;
};

const HIDDEN: readonly Vector3[] = [];

/** One scene line per label stem, laid onto the label's layout before every frame. */
export const useLabelStemSceneLines = (
  engine: AnnotationEngine | null,
  labels: readonly RuntimePointLabelRenderModel[],
  readStem: (labelId: string) => LabelStemLayout | null
) => {
  const readStemRef = useRef(readStem);
  readStemRef.current = readStem;
  const collectionRef = useRef<AnnotationSceneLineCollection | null>(null);
  const stemsRef = useRef(new Map<string, StemLine>());

  useEffect(() => {
    if (!isValidAnnotationEngine(engine)) return;
    const collection = engine.createLineCollection();
    collectionRef.current = collection;
    const stems = stemsRef.current;
    const removePreRenderListener = engine.subscribePreRender(() => {
      stems.forEach((stem, labelId) => {
        const layout = readStemRef.current(labelId);
        const positions = layout
          ? resolveLabelStemPositionsECEF(
              engine,
              layout.anchorECEF,
              layout.segment
            )
          : null;
        if (!layout || !positions) {
          stem.line.setPositions(HIDDEN);
          return;
        }
        const styleKey = `${layout.isOccluded}:${layout.opacity}`;
        if (styleKey !== stem.styleKey) {
          stem.line.setStyle(resolveLabelStemSceneStyle(stem.color, layout));
          stem.styleKey = styleKey;
        }
        stem.line.setPositions(positions);
      });
    });
    return () => {
      removePreRenderListener();
      if (isValidAnnotationEngine(engine)) {
        stems.forEach((stem) => stem.line.destroy());
        collection.destroy();
      }
      stems.clear();
      collectionRef.current = null;
    };
  }, [engine]);

  useEffect(() => {
    const collection = collectionRef.current;
    if (!collection || !isValidAnnotationEngine(engine)) return;
    const stems = stemsRef.current;
    const nextColorById = new Map(
      labels.map((label) => [
        label.id,
        label.lineColor ?? pointLabelVisualizerDefaults.stemColor,
      ])
    );
    stems.forEach((stem, labelId) => {
      if (nextColorById.get(labelId) === stem.color) return;
      stem.line.destroy();
      stems.delete(labelId);
    });
    nextColorById.forEach((color, labelId) => {
      if (stems.has(labelId)) return;
      stems.set(labelId, {
        line: collection.addLine({
          id: `${labelId}-stem`,
          positions: HIDDEN,
          ...resolveLabelStemSceneStyle(color, {
            isOccluded: false,
            opacity: 1,
          }),
        }),
        color,
        styleKey: "false:1",
      });
    });
    engine.requestRender();
  }, [engine, labels]);
};
