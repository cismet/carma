import { useEffect, useRef } from "react";
import { Matrix4 } from "three";

import {
  isValidAnnotationEngine,
  type AnnotationEngine,
  type AnnotationScenePrimitiveHandle,
} from "@carma-mapping/annotations/core";
import type { ScenePrimitiveModel } from "./scene-primitive-models";

type ScenePrimitiveEntry = {
  model: ScenePrimitiveModel;
  handle: AnnotationScenePrimitiveHandle;
};

const PARKED_MODEL_MATRIX = new Matrix4();

const placeScenePrimitive = ({ model, handle }: ScenePrimitiveEntry) => {
  const modelMatrix = model.place();
  if (modelMatrix) handle.setModelMatrix(modelMatrix);
  handle.setVisible(modelMatrix !== null);
};

const destroyScenePrimitives = (entries: Map<string, ScenePrimitiveEntry>) => {
  entries.forEach(({ handle }) => handle.destroy());
  entries.clear();
};

/**
 * Mirrors primitive models into the engine like `useEdgeSceneLines` does for
 * lines: reconciled by id and signature when the models change, placed before
 * every frame.
 */
export const useScenePrimitives = (
  engine: AnnotationEngine | null,
  primitives: readonly ScenePrimitiveModel[]
) => {
  const entriesRef = useRef(new Map<string, ScenePrimitiveEntry>());

  useEffect(() => {
    const entries = entriesRef.current;
    return () => {
      if (isValidAnnotationEngine(engine)) {
        destroyScenePrimitives(entries);
        engine.requestRender();
      } else {
        entries.clear();
      }
    };
  }, [engine]);

  useEffect(() => {
    const entries = entriesRef.current;
    if (!isValidAnnotationEngine(engine)) {
      entries.clear();
      return;
    }
    const nextIds = new Set(primitives.map((model) => model.id));
    entries.forEach((entry, id) => {
      if (nextIds.has(id)) return;
      entry.handle.destroy();
      entries.delete(id);
    });
    primitives.forEach((model) => {
      const existing = entries.get(model.id);
      if (existing?.model.signature === model.signature) {
        existing.model = model;
        return;
      }
      existing?.handle.destroy();
      entries.delete(model.id);
      const modelMatrix = model.place();
      const handle = model.create(engine, modelMatrix ?? PARKED_MODEL_MATRIX);
      if (!handle) return;
      handle.setVisible(modelMatrix !== null);
      entries.set(model.id, { model, handle });
    });
    engine.requestRender();
  }, [engine, primitives]);

  useEffect(() => {
    if (!isValidAnnotationEngine(engine)) return;
    return engine.subscribePreRender(() => {
      try {
        entriesRef.current.forEach(placeScenePrimitive);
      } catch {
        // Frame races during teardown.
      }
    });
  }, [engine]);
};
