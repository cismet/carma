import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";

import type { Layer } from "@carma-mapping/layers";

import { getLayers } from "../../store/slices/mapping";

const styleOf = (layer: Layer): unknown =>
  (layer.props as { style?: unknown } | undefined)?.style;

/**
 * A style draws 3D meshes when one of its layers carries `carmaConf["3d"]`
 * (e.g. einzelbaumX/styleX.json); the map then frees the camera and turns
 * terrain on for it.
 */
const declaresMesh = (style: unknown): boolean =>
  !!(
    style as { layers?: { metadata?: { carmaConf?: { "3d"?: unknown } } }[] }
  )?.layers?.some((layer) => layer.metadata?.carmaConf?.["3d"] !== undefined);

// one fetch per style URL for the whole app; the map fetches it too, so it
// usually comes from the browser cache
const meshByStyleUrl = new Map<string, Promise<boolean>>();
const styleUrlDeclaresMesh = (url: string): Promise<boolean> => {
  let pending = meshByStyleUrl.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((response) => (response.ok ? response.json() : null))
      .then(declaresMesh)
      .catch(() => false);
    meshByStyleUrl.set(url, pending);
  }
  return pending;
};

/** Ids of the layers in the stack whose style draws 3D meshes. */
export const useMeshStyleLayerIds = (): ReadonlySet<string> => {
  const layers = useSelector(getLayers);
  const [meshByUrl, setMeshByUrl] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    for (const layer of layers) {
      const style = styleOf(layer);
      if (typeof style !== "string" || style in meshByUrl) {
        continue;
      }
      styleUrlDeclaresMesh(style).then((mesh) => {
        if (active) {
          setMeshByUrl((previous) => ({ ...previous, [style]: mesh }));
        }
      });
    }
    return () => {
      active = false;
    };
  }, [layers, meshByUrl]);

  return useMemo(
    () =>
      new Set(
        layers
          .filter((layer) => {
            const style = styleOf(layer);
            return typeof style === "string"
              ? meshByUrl[style] === true
              : declaresMesh(style);
          })
          .map((layer) => layer.id)
      ),
    [layers, meshByUrl]
  );
};

/**
 * Adding a visible mesh style while in 2D switches to the maplibre 3D view.
 * Layers already in the stack when the map mounts keep the mode the link or
 * hash opened with, and switching back to 2D afterwards is left alone.
 */
export const useEnterLibre3dForMeshLayers = ({
  enabled,
  libre3d,
  toggle,
}: {
  enabled: boolean;
  libre3d: boolean;
  toggle: () => void;
}) => {
  const layers = useSelector(getLayers);
  const meshLayerIds = useMeshStyleLayerIds();
  const initialLayerIds = useRef(new Set(layers.map((layer) => layer.id)));
  const handledLayerIds = useRef(new Set<string>());

  useEffect(() => {
    const present = new Set(layers.map((layer) => layer.id));
    // a layer removed and added again counts as new
    for (const ids of [handledLayerIds.current, initialLayerIds.current]) {
      for (const id of ids) {
        if (!present.has(id)) {
          ids.delete(id);
        }
      }
    }
    const added = layers.filter(
      (layer) =>
        layer.visible &&
        meshLayerIds.has(layer.id) &&
        !initialLayerIds.current.has(layer.id) &&
        !handledLayerIds.current.has(layer.id)
    );
    added.forEach((layer) => handledLayerIds.current.add(layer.id));
    if (enabled && added.length > 0 && !libre3d) {
      toggle();
    }
  }, [enabled, layers, meshLayerIds, libre3d, toggle]);
};
