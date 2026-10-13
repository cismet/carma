import { useEffect, useRef } from "react";
import { Vector3 } from "three";

import {
  isValidAnnotationEngine,
  type AnnotationEngine,
  type AnnotationSceneMarkerCollection,
  type AnnotationSceneMarkerHandle,
  type AnnotationSceneMarkerStyle,
} from "@carma-mapping/annotations/core";
import {
  canDrawHandlesInScene,
  type SceneMarkerModel,
} from "./scene-marker-models";

type SceneMarkerEntry = {
  model: SceneMarkerModel;
  handle: AnnotationSceneMarkerHandle;
  styleSignature: string;
  hoverStyleSignature: string;
  appliedSignature: string;
};

const PARKED_POSITION = new Vector3();

export const buildSceneMarkerStyleSignature = (
  style: AnnotationSceneMarkerStyle | undefined
) =>
  style
    ? [
        style.sizePx,
        style.fill,
        style.outline,
        style.outlineWidthPx,
        style.barLengthPx ?? 0,
        style.scale ?? 1,
        style.ring?.widthPx ?? 0,
        style.ring?.color ?? "",
        style.ring?.soft === true,
      ].join("|")
    : "";

const placeSceneMarker = (entry: SceneMarkerEntry) => {
  const placement = entry.model.place();
  if (placement) {
    entry.handle.setPosition(placement.positionECEF, placement.acrossECEF);
  }
  entry.handle.setVisible(placement !== null);
  const hovered = placement?.hovered === true && entry.model.hoverStyle;
  const signature = hovered ? entry.hoverStyleSignature : entry.styleSignature;
  if (signature === entry.appliedSignature) return;
  entry.handle.setStyle(
    hovered ? entry.model.hoverStyle ?? entry.model.style : entry.model.style
  );
  entry.appliedSignature = signature;
};

/**
 * Mirrors marker models into one engine marker collection, like
 * `useScenePrimitives` does for solids: reconciled by id when the models
 * change, restyled only when the look changed, placed before every frame.
 * Engines without markers draw nothing here.
 */
export const useSceneMarkers = (
  engine: AnnotationEngine | null,
  markers: readonly SceneMarkerModel[]
) => {
  const collectionRef = useRef<AnnotationSceneMarkerCollection | null>(null);
  const entriesRef = useRef(new Map<string, SceneMarkerEntry>());

  useEffect(() => {
    if (!isValidAnnotationEngine(engine) || !canDrawHandlesInScene(engine)) {
      return;
    }
    const collection = engine.createMarkerCollection();
    collectionRef.current = collection;
    const entries = entriesRef.current;
    return () => {
      entries.clear();
      collectionRef.current = null;
      if (isValidAnnotationEngine(engine)) collection.destroy();
    };
  }, [engine]);

  useEffect(() => {
    const collection = collectionRef.current;
    const entries = entriesRef.current;
    if (!isValidAnnotationEngine(engine) || !collection) return;
    const nextIds = new Set(markers.map((model) => model.id));
    entries.forEach((entry, id) => {
      if (nextIds.has(id)) return;
      entry.handle.destroy();
      entries.delete(id);
    });
    markers.forEach((model) => {
      const styleSignature = buildSceneMarkerStyleSignature(model.style);
      const hoverStyleSignature = buildSceneMarkerStyleSignature(
        model.hoverStyle
      );
      const existing = entries.get(model.id);
      if (existing) {
        existing.model = model;
        existing.styleSignature = styleSignature;
        existing.hoverStyleSignature = hoverStyleSignature;
        placeSceneMarker(existing);
        return;
      }
      const placement = model.place();
      const entry: SceneMarkerEntry = {
        model,
        handle: collection.addMarker({
          ...model.style,
          id: model.id,
          positionECEF: placement?.positionECEF ?? PARKED_POSITION,
          acrossECEF: placement?.acrossECEF,
          visible: placement !== null,
        }),
        styleSignature,
        hoverStyleSignature,
        appliedSignature: styleSignature,
      };
      entries.set(model.id, entry);
      placeSceneMarker(entry);
    });
    engine.requestRender();
  }, [engine, markers]);

  useEffect(() => {
    if (!isValidAnnotationEngine(engine)) return;
    return engine.subscribePreRender(() => {
      try {
        entriesRef.current.forEach(placeSceneMarker);
      } catch {
        // Frame races during teardown.
      }
    });
  }, [engine]);
};
