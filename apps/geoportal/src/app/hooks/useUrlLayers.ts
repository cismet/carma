import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { message } from "antd";
import {
  buildVectorStyleItem,
  loadVectorStyle,
  styleUrlTitle,
  type Layer,
} from "@carma-mapping/layers";
import { parseToMapLayer } from "@carma-mapping/utils";
import { layerCatalogConfig } from "../constants/discover";
import {
  appendLayer,
  changeVisibility,
  getLayerStack,
} from "../store/slices/mapping";
import type { AppDispatch } from "../store";

/** Launch input only: repeated addLayer values follow URL order, never stack sync. */
export const useUrlLayers = (ready: boolean) => {
  const { search } = useLocation();
  const navigate = useNavigate();
  const [urls] = useState(() => new URLSearchParams(search).getAll("addLayer"));
  const dispatch = useDispatch<AppDispatch>();
  const layers = useSelector(getLayerStack);
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const pending = useRef<Promise<Layer[]> | null>(null);
  const consumed = useRef(false);

  useEffect(() => {
    if (!ready || consumed.current || !urls.length) return;
    let active = true;
    // Reuse the import promise across StrictMode's effect replay. Only its
    // current subscriber may append; a canceled mount cannot alter the stack.
    if (!pending.current) {
      // Consume before normal camera hash writes collapse repeated keys. This
      // is a one-off router replace, never a serialization of the layer stack.
      const remaining = new URLSearchParams(search);
      remaining.delete("addLayer");
      navigate({ search: remaining.toString() }, { replace: true });
      pending.current = (async () => {
        const imported: Layer[] = [];
        const seen = new Set<string>();
        for (const value of urls) {
          try {
            const url = new URL(value, window.location.href);
            if (!value.trim() || !["http:", "https:"].includes(url.protocol))
              throw new Error("Expected an HTTP(S) style URL");
            if (seen.has(url.href)) continue;
            seen.add(url.href);
            const style = await loadVectorStyle(
              url.href,
              layerCatalogConfig.vectorTileServerUrl
            );
            const { item } = buildVectorStyleItem({
              styleRef: url.href,
              style,
              id: `custom:${url.href}`,
              fallbackTitle: styleUrlTitle(url.href),
            });
            const layer = await parseToMapLayer(item, false, true);
            if (layer) imported.push(layer as Layer);
          } catch (error) {
            console.warn("[URL LAYERS] Could not load style", value, error);
          }
        }
        return imported;
      })();
    }
    void pending.current.then((imported) => {
      if (!active) return;
      consumed.current = true;
      const ids = new Set(layersRef.current.map((layer) => layer.id));
      for (const layer of imported) {
        if (ids.has(layer.id))
          dispatch(changeVisibility({ id: layer.id, visible: true }));
        else {
          ids.add(layer.id);
          dispatch(appendLayer(layer));
        }
      }
      if (!imported.length)
        void message.error(
          "Die Layer aus der URL konnten nicht geladen werden."
        );
    });
    return () => {
      active = false;
    };
  }, [dispatch, navigate, ready, search, urls]);
};
