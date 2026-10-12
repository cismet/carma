import { useEffect, useRef } from "react";

import { isValidAnnotationEngine, type AnnotationEngine } from "../../engine";
import type { LiveAnnotationAnchors } from "../../interaction/live-annotation-anchors";
import type { EdgeSceneLine } from "./edge-models";
import {
  applyDragSampleExclusionsToSceneLines,
  applyLiveAnchorsToSceneLines,
  buildSceneLineSignature,
  createSceneLineCollections,
  createSceneLineHandle,
  destroySceneLineCollections,
  destroySceneLineHandles,
  type SceneLineCollections,
  type SceneLineHandle,
} from "./edge-scene-lines";
import { shouldExcludeAnnotationSceneLineFromDragSample } from "../annotation-edge-drag-sample-exclusions";

/** Mirrors the edge scene lines into the engine and keeps them on the live drag anchors. */
export const useEdgeSceneLines = (
  engine: AnnotationEngine | null,
  sceneLines: readonly EdgeSceneLine[],
  activeEditedNodeId: string | null,
  liveAnchors: LiveAnnotationAnchors
) => {
  const sceneLineCollectionsRef = useRef<SceneLineCollections | null>(null);
  const sceneLineHandleByIdRef = useRef<Map<string, SceneLineHandle>>(
    new Map()
  );

  // One pair of engine line collections per engine.
  useEffect(() => {
    if (!isValidAnnotationEngine(engine)) {
      return;
    }

    const collections = createSceneLineCollections(engine);
    sceneLineCollectionsRef.current = collections;

    return () => {
      destroySceneLineHandles(sceneLineHandleByIdRef.current);
      if (sceneLineCollectionsRef.current === collections) {
        sceneLineCollectionsRef.current = null;
      }
      if (isValidAnnotationEngine(engine)) {
        destroySceneLineCollections(collections);
      }
    };
  }, [engine]);

  // Read by the reconcile effect without rebuilding every line when only the edited node changes.
  const activeEditedNodeIdRef = useRef(activeEditedNodeId);
  activeEditedNodeIdRef.current = activeEditedNodeId;

  useEffect(() => {
    const collections = sceneLineCollectionsRef.current;
    if (!isValidAnnotationEngine(engine) || !collections) {
      destroySceneLineHandles(sceneLineHandleByIdRef.current);
      return;
    }

    const reconcileSceneLines = (lines: readonly EdgeSceneLine[]) => {
      const nextIds = new Set(lines.map((line) => line.id));

      sceneLineHandleByIdRef.current.forEach((handle, id) => {
        if (nextIds.has(id)) {
          return;
        }

        handle.destroy();
        sceneLineHandleByIdRef.current.delete(id);
      });

      lines.forEach((line) => {
        const nextSignature = buildSceneLineSignature(line);
        const existingHandle = sceneLineHandleByIdRef.current.get(line.id);
        if (existingHandle?.signature === nextSignature) {
          return;
        }

        existingHandle?.destroy();
        sceneLineHandleByIdRef.current.set(
          line.id,
          createSceneLineHandle(
            engine,
            collections,
            line,
            shouldExcludeAnnotationSceneLineFromDragSample(
              line,
              activeEditedNodeIdRef.current,
              (nodeId) => liveAnchors.get(nodeId) !== undefined
            )
          )
        );
      });

      engine.requestRender();
    };

    reconcileSceneLines(sceneLines);

    return () => {
      destroySceneLineHandles(sceneLineHandleByIdRef.current);
      if (isValidAnnotationEngine(engine)) {
        engine.requestRender();
      }
    };
  }, [engine, liveAnchors, sceneLines]);

  // Every frame before the draw: patch endpoints from the live drag anchors so
  // the lines move with the gizmo, and re-sort lines between the collections.
  useEffect(() => {
    if (!isValidAnnotationEngine(engine)) {
      return;
    }
    const applyDragSampleExclusions = () => {
      const collections = sceneLineCollectionsRef.current;
      if (!collections) {
        return;
      }
      applyDragSampleExclusionsToSceneLines(
        engine,
        collections,
        sceneLineHandleByIdRef.current,
        activeEditedNodeId,
        liveAnchors
      );
    };
    applyDragSampleExclusions();
    const removePreRenderListener = engine.subscribePreRender(() => {
      try {
        applyDragSampleExclusions();
        applyLiveAnchorsToSceneLines(
          sceneLineHandleByIdRef.current,
          liveAnchors
        );
      } catch {
        // Ignore frame races during teardown.
      }
    });
    return () => {
      removePreRenderListener();
    };
  }, [activeEditedNodeId, engine, liveAnchors]);
};
