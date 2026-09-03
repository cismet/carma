import { useCallback, useEffect, useRef } from "react";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types/types";

import { writeDrawings, type StoredDrawing } from "./annotation-storage";
import type { AnnotationAnchor, AnnotationGroup } from "./types";

const DEBOUNCE_MS = 800;

type Content = {
  anchor: AnnotationAnchor | null;
  elements: readonly ExcalidrawElement[];
  files: BinaryFiles;
};

export type UseAnnotationStorageOptions = {
  storageKey?: string;
  groups: AnnotationGroup[];
  restored: StoredDrawing[];
  /** the map zoom band 0 begins at; see `annotation-zoom-bands` */
  origin?: number;
};

export const useAnnotationStorage = ({
  storageKey,
  groups,
  restored,
  origin,
}: UseAnnotationStorageOptions) => {
  const contents = useRef(
    new Map<string, Content>(
      restored.map((drawing) => [
        drawing.id,
        {
          anchor: drawing.anchor,
          elements: drawing.elements,
          files: drawing.files ?? {},
        },
      ])
    )
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const originRef = useRef(origin);
  originRef.current = origin;

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!storageKey) {
      return;
    }
    const drawings = groupsRef.current.reduce<StoredDrawing[]>(
      (kept, group) => {
        const content = contents.current.get(group.id);
        if (content?.anchor) {
          kept.push({
            id: group.id,
            locked: group.locked,
            band: group.band,
            anchor: content.anchor,
            elements: content.elements,
            files: content.files,
          });
        }
        return kept;
      },
      []
    );
    writeDrawings(storageKey, drawings, originRef.current);
  }, [storageKey]);

  const schedule = useCallback(() => {
    if (!storageKey) {
      return;
    }
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(flush, DEBOUNCE_MS);
  }, [flush, storageKey]);

  const onSceneEdit = useCallback(
    (
      id: string,
      elements: readonly ExcalidrawElement[],
      files: BinaryFiles,
      anchor: AnnotationAnchor | null
    ) => {
      contents.current.set(id, { anchor, elements, files });
      schedule();
    },
    [schedule]
  );

  useEffect(() => {
    schedule();
  }, [groups, origin, schedule]);

  useEffect(() => {
    if (!storageKey) {
      return;
    }
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush, storageKey]);

  return onSceneEdit;
};
