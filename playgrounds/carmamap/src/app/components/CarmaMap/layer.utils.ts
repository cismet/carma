import { createElement, CSSProperties } from "react";

import CismapLayer from "react-cismap/CismapLayer";

import type { Layer } from "@carma-commons/types";

interface WMTSLayerProps {
  type: "wmts";
  key: string;
  url: string;
  maxZoom: number;
  layers: string;
  format: string;
  opacity: string | number;
  tiled: boolean;
  transparent: string;
  pane: string;
}

interface VectorLayerProps {
  type: "vector";
  key: string;
  style: CSSProperties | string;
  maxZoom: number;
  pane: string;
  opacity: number | string;
  selectionEnabled?: boolean;
  manualSelectionManagement?: boolean;
  maxSelectionCount?: number;
  onSelectionChanged?: (e: { hits: any[]; hit: any }) => void;
}

const MAX_ZOOM = 26;

const createCismapLayer = (props: WMTSLayerProps | VectorLayerProps) => {
  return createElement(CismapLayer, props);
};

export const createCismapLayers = (layers: Layer[], {}) => {
  return layers.map((layer, i) => {
    if (layer.visible) {
      switch (layer.layerType) {
        case "wmts":
          return createCismapLayer({
            key: `${i}_${layer.id}`,
            url: layer.props.url,
            maxZoom: MAX_ZOOM,
            layers: layer.props.name,
            format: "image/png",
            tiled: true,
            transparent: "true",
            pane: `additionalLayers${i + 1}`,
            opacity: layer.opacity.toFixed(1) || 0.7,
            type: "wmts",
          });
        case "vector":
          return createCismapLayer({
            key: `${i}_${layer.id}_${layer.opacity}`,
            style: layer.props.style,
            maxZoom: MAX_ZOOM,
            pane: `additionalLayers${i + 1}`,
            opacity: layer.opacity || 0.7,
            type: "vector",
            selectionEnabled: true,
            manualSelectionManagement: true,
            maxSelectionCount: 10,
            onSelectionChanged: (e) => {
              console.log("onSelectionChanged", e);
            },
          });
      }
    }
  });
};

export const getQueryableLayers = (layers: Layer[], zoom: number) => {
  return layers.filter(
    (layer) =>
      layer.queryable &&
      layer.visible &&
      layer.useInFeatureInfo &&
      zoom < (layer.props.maxZoom ? layer.props.maxZoom : Infinity) &&
      zoom > layer.props.minZoom
  );
};
