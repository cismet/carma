import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { Map as MaplibreMap } from "maplibre-gl";

import { useLibreContext } from "@carma-mapping/contexts";
import type { PrintInputLayer } from "@carma-mapping/print-core";
import {
  MapLibrePrintPreview,
  buildInlineVectorStyle,
  layerHasActiveFilter,
} from "@carma-mapping/print-core/maplibre";

import { convertLayerStringToLayers } from "../../config";
import { getUIMode, setUIMode, UIMode } from "../../store/slices/ui";
import {
  changeIfMapPrinted,
  changeIsLoading,
  changePrintError,
  changeRedrawPreview,
  getDPI,
  getIfMapPrinted,
  getIsLoading,
  getOrientation,
  getPrintName,
  getRedrawPreview,
  getScale,
} from "../../store/slices/print";
import { getBackgroundLayer, getLayers } from "../../store/slices/mapping";

// Thin Redux connector for the MapLibre print preview — the libre-map analog
// of PrintPreview.tsx (Leaflet). All rendering/behaviour lives in the library
// component (@carma-mapping/print-core/maplibre); this wrapper maps the
// geoportal store onto its props and builds the print layer stack from the
// background + overlay layers at print time.
const LibrePrintPreview = () => {
  const dispatch = useDispatch();
  const mode = useSelector(getUIMode);
  const orientation = useSelector(getOrientation);
  const dpi = useSelector(getDPI);
  const scale = useSelector(getScale);
  const printName = useSelector(getPrintName);
  const loading = useSelector(getIsLoading);
  const redrawPrev = useSelector(getRedrawPreview);
  const ifMapPrinted = useSelector(getIfMapPrinted);
  const bgLayer = useSelector(getBackgroundLayer);
  const layers = useSelector(getLayers);
  const { map: libreMap } = useLibreContext();

  const resolveLayers = useCallback(
    (
      map: MaplibreMap,
      bbox: [number, number, number, number]
    ): PrintInputLayer[] => {
      const combined = [
        ...convertLayerStringToLayers(
          bgLayer.layers,
          bgLayer.visible,
          bgLayer.opacity
        ),
        ...layers,
      ];
      return combined.map((layer) => {
        // A filtered or selection-carrying vector layer must be inlined from
        // the live map (the hosted print style is unfiltered and stateless).
        // Unlike the Leaflet path (one dedicated MapLibre map per vector
        // layer), the libre map is a composite of every layer, so the inline
        // builder is scoped to this layer's style layers via the
        // metadata["layer-id"] stamp of the style builder. Background layers
        // have no id and keep the hosted-style path.
        if (layer.visible && layer.layerType === "vector" && layer.id) {
          const inlineStyle = buildInlineVectorStyle(
            map,
            layer,
            bbox,
            layerHasActiveFilter(layer),
            {
              styleLayerFilter: (styleLayer) =>
                styleLayer.metadata?.["layer-id"] === layer.id,
            }
          );
          if (inlineStyle) {
            // Opacity is already baked into the composite map's paint by the
            // style builder, so it must not be applied a second time.
            return {
              visible: true,
              layerType: "inline",
              opacity: 1,
              inlineStyle,
            } satisfies PrintInputLayer;
          }
        }
        return layer as PrintInputLayer;
      });
    },
    [bgLayer, layers]
  );

  return (
    <MapLibrePrintPreview
      map={libreMap}
      active={mode === UIMode.PRINT}
      orientation={orientation}
      scale={scale}
      dpi={dpi}
      name={printName}
      resolveLayers={resolveLayers}
      redrawTrigger={redrawPrev}
      keepRectangle={ifMapPrinted}
      loading={loading}
      onClose={() => dispatch(setUIMode(UIMode.DEFAULT))}
      onLoadingChange={(status) => dispatch(changeIsLoading(status))}
      onError={(message) => dispatch(changePrintError(message))}
      onPrintStart={() => dispatch(changeIfMapPrinted(true))}
      onRequestRedraw={() => {
        dispatch(changeIfMapPrinted(false));
        dispatch(changeRedrawPreview(!redrawPrev));
      }}
    />
  );
};

export default LibrePrintPreview;
