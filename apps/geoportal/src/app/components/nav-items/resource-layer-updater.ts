import type { Dispatch } from "redux";
import { createElement, type ReactNode } from "react";
import type { BackgroundLayer, Item, Layer } from "@carma/types";
import { parseToMapLayer } from "@carma-mapping/utils";
import { DEFAULT_ADHOC_FEATURE_LAYER_ID } from "@carma-appframeworks/portals";

import {
  setTriggerSelectionById,
  updateInfoElementsAfterRemovingFeature,
} from "../../store/slices/features";
import {
  appendLayer,
  deleteSavedLayerConfig,
  removeLayer,
  setBackgroundLayer,
  setLayers,
  setSelectedLuftbildLayer,
  setSelectedMapLayer,
} from "../../store/slices/mapping";
import { layerMap } from "../../config";
import { createBackgroundLayerConfig } from "../../helper/layer";
import { MapStyleKeys } from "../../constants/MapStyleKeys";
import { zoomToStyleFeatures } from "../../helper/gisHelper";
import {
  addAdhocFeatureFromLayer,
  type AddFeatureFn,
} from "../../helper/adhoc-layer-feature";
import { isAdhocVectorLayer } from "../../helper/adhoc-feature-utils";

type MessageType = "success" | "error";

type MessageApiLike = {
  open: (config: { type: MessageType; content: ReactNode }) => void;
  success: (content: string) => void;
  error: (content: string) => void;
};

type RoutedMapRef = Parameters<typeof zoomToStyleFeatures>[1];

type SetSelectedFeatureByIdFn = (
  id: string,
  collectionId: string,
  layerId?: string
) => void;
type SetShouldFocusSelectedFn = (shouldFocus: boolean) => void;
type ClearFeaturesFn = (collectionId?: string, layerId?: string) => void;
type ToggleFrameworkFn = () => Promise<unknown>;
type SetCurrentStyleFn = (style: MapStyleKeys) => void;

type CollectionLayerItem = Item & {
  type: "collection";
  layers: Layer[];
  backgroundLayer?: BackgroundLayer;
  settings?: {
    zoom?: number;
    lat?: number;
    lng?: number;
    minZoomlevel?: number;
    maxZoomlevel?: number;
  };
};

type ResourceLayerUpdaterDeps = {
  dispatch: Dispatch;
  activeLayers: Layer[];
  addFeature: AddFeatureFn;
  setSelectedFeatureById: SetSelectedFeatureByIdFn;
  setShouldFocusSelected: SetShouldFocusSelectedFn;
  clearFeatures: ClearFeaturesFn;
  toggleFramework: ToggleFrameworkFn;
  isLeaflet: boolean;
  routedMap: RoutedMapRef;
  setCurrentStyle: SetCurrentStyleFn;
  messageApi: MessageApiLike;
  maxLayers?: number;
};

const DEFAULT_MAX_LAYERS = 12;

const toLayerId = (layer: Item): string =>
  layer.id.startsWith("fav_") ? layer.id.slice(4) : layer.id;

const getLayerModeSwitch = (layer: Layer): string | undefined => {
  const conf = layer.conf as { modeSwitch?: unknown } | undefined;
  return typeof conf?.modeSwitch === "string" ? conf.modeSwitch : undefined;
};

const shouldToggleFramework = (layer: Layer, isLeaflet: boolean): boolean => {
  const modeSwitch = getLayerModeSwitch(layer);
  return (
    (modeSwitch === "3D" && isLeaflet) || (modeSwitch === "2D" && !isLeaflet)
  );
};

const shouldSelectIn3D = (layer: Layer, isLeaflet: boolean): boolean => {
  const modeSwitch = getLayerModeSwitch(layer);
  return !isLeaflet || modeSwitch === "3D";
};

const toSuccessToastContent = (text: string): ReactNode =>
  createElement("span", { "data-test-id": "toast-success" }, text);

const applyCollectionLayer = ({
  layer,
  dispatch,
  messageApi,
  routedMap,
  setCurrentStyle,
  deleteItem,
}: {
  layer: CollectionLayerItem;
  dispatch: Dispatch;
  messageApi: MessageApiLike;
  routedMap: RoutedMapRef;
  setCurrentStyle: SetCurrentStyleFn;
  deleteItem: boolean;
}) => {
  if (deleteItem) {
    dispatch(deleteSavedLayerConfig(layer.id));
    return;
  }

  try {
    dispatch(setLayers(layer.layers));
    if (layer.backgroundLayer) {
      dispatch(setBackgroundLayer(layer.backgroundLayer));
      const layerKey = Object.keys(layerMap).find(
        (key) => layerMap[key].title === layer.backgroundLayer?.title
      );
      if (layerKey) {
        if (layer.backgroundLayer.id === "karte") {
          dispatch(setSelectedMapLayer(createBackgroundLayerConfig(layerKey)));
          setCurrentStyle(MapStyleKeys.TOPO);
        } else {
          dispatch(
            setSelectedLuftbildLayer(createBackgroundLayerConfig(layerKey))
          );
          setCurrentStyle(MapStyleKeys.AERIAL);
        }
      }
    }
    if (layer.settings) {
      const map = routedMap.leafletMap.leafletElement;
      const currentZoom = map.getZoom();
      const settings = layer.settings;
      const changePosition = settings.zoom || settings.lat || settings.lng;
      const changeZoomLevel =
        settings.zoom || settings.minZoomlevel || settings.maxZoomlevel;

      const zoom =
        layer.settings.zoom ||
        (settings.minZoomlevel > currentZoom && settings.minZoomlevel) ||
        (settings.maxZoomlevel < currentZoom && settings.maxZoomlevel) ||
        currentZoom;
      const lat = layer.settings.lat || map.getCenter().lat;
      const lng = layer.settings.lng || map.getCenter().lng;

      if (changePosition) {
        map.flyTo([lat, lng], zoom);
      }

      if (changeZoomLevel) {
        map.setZoom(zoom);
      }
    }
    messageApi.open({
      type: "success",
      content: toSuccessToastContent(
        `${layer.title} wurde erfolgreich geladen.`
      ),
    });
  } catch {
    messageApi.open({
      type: "error",
      content: `Es gab einen Fehler beim Laden von ${layer.title}`,
    });
  }
};

const maybeAddAdhocFeature = async ({
  layer,
  id,
  existingLayer,
  addFeature,
  isLeaflet,
  routedMap,
  setSelectedFeatureById,
  setShouldFocusSelected,
  dispatch,
  toggleFramework,
}: {
  layer: Layer;
  id: string;
  existingLayer: Layer | undefined;
  addFeature: AddFeatureFn;
  isLeaflet: boolean;
  routedMap: RoutedMapRef;
  setSelectedFeatureById: SetSelectedFeatureByIdFn;
  setShouldFocusSelected: SetShouldFocusSelectedFn;
  dispatch: Dispatch;
  toggleFramework: ToggleFrameworkFn;
}) => {
  if (!isAdhocVectorLayer(layer) || existingLayer) {
    return;
  }

  if (shouldToggleFramework(layer, isLeaflet)) {
    await toggleFramework();
  }

  const addedFeature = await addAdhocFeatureFromLayer({
    layer,
    collectionId: id,
    layerId: DEFAULT_ADHOC_FEATURE_LAYER_ID,
    addFeature,
  });
  if (!addedFeature) {
    return;
  }

  await zoomToStyleFeatures(addedFeature.styleData, routedMap);

  if (shouldSelectIn3D(layer, isLeaflet)) {
    setSelectedFeatureById(
      addedFeature.id,
      addedFeature.collectionId,
      addedFeature.layerId
    );
    setShouldFocusSelected(true);
  }

  // Keep cross-framework auto-selection sync semantics:
  // 2D consumes this directly; 3D can still hand off when switching framework.
  dispatch(setTriggerSelectionById(id));
};

const removeExistingLayer = ({
  id,
  layer,
  dispatch,
  clearFeatures,
  messageApi,
}: {
  id: string;
  layer: Layer;
  dispatch: Dispatch;
  clearFeatures: ClearFeaturesFn;
  messageApi: MessageApiLike;
}) => {
  try {
    dispatch(removeLayer(id));
    dispatch(updateInfoElementsAfterRemovingFeature(id));
    if (isAdhocVectorLayer(layer)) {
      clearFeatures(id);
    }
    messageApi.open({
      type: "success",
      content: toSuccessToastContent(
        `${layer.title} wurde erfolgreich entfernt.`
      ),
    });
  } catch {
    messageApi.open({
      type: "error",
      content: `Es gab einen Fehler beim Entfernen von ${layer.title}`,
    });
  }
};

const addOrUpdateLayer = ({
  id,
  layer,
  existingLayer,
  updateExisting,
  previewLayer,
  activeLayers,
  dispatch,
  messageApi,
  maxLayers,
}: {
  id: string;
  layer: Layer;
  existingLayer: Layer | undefined;
  updateExisting: boolean;
  previewLayer: boolean;
  activeLayers: Layer[];
  dispatch: Dispatch;
  messageApi: MessageApiLike;
  maxLayers: number;
}) => {
  if (existingLayer && updateExisting) {
    dispatch(removeLayer(id));
    dispatch(updateInfoElementsAfterRemovingFeature(id));
  }

  if (activeLayers.length >= maxLayers) {
    messageApi.open({
      type: "error",
      content: "Zu viele Layer hinzugefügt. Layer entfernen um fortzufahren.",
    });
    return;
  }

  try {
    setTimeout(() => {
      dispatch(appendLayer(layer));
      if (!previewLayer) {
        messageApi.open({
          type: "success",
          content: toSuccessToastContent(
            `${layer.title} wurde erfolgreich hinzugefügt.`
          ),
        });
      }
    }, 1);
  } catch {
    messageApi.open({
      type: "error",
      content: `Es gab einen Fehler beim hinzufügen von ${layer.title}`,
    });
  }
};

export const createResourceLayerUpdater = ({
  dispatch,
  activeLayers,
  addFeature,
  setSelectedFeatureById,
  setShouldFocusSelected,
  clearFeatures,
  toggleFramework,
  isLeaflet,
  routedMap,
  setCurrentStyle,
  messageApi,
  maxLayers = DEFAULT_MAX_LAYERS,
}: ResourceLayerUpdaterDeps) => {
  return async (
    layer: Item,
    deleteItem: boolean = false,
    forceWMS: boolean = false,
    previewLayer: boolean = false,
    updateExisting: boolean = false
  ) => {
    if (layer.type === "collection") {
      applyCollectionLayer({
        layer: layer as CollectionLayerItem,
        dispatch,
        messageApi,
        routedMap,
        setCurrentStyle,
        deleteItem,
      });
      return;
    }

    const id = toLayerId(layer);
    const parsedLayer = await parseToMapLayer(layer, forceWMS, true);
    const existingLayer = activeLayers.find(
      (activeLayer) => activeLayer.id === id
    );

    await maybeAddAdhocFeature({
      layer: parsedLayer,
      id,
      existingLayer,
      addFeature,
      isLeaflet,
      routedMap,
      setSelectedFeatureById,
      setShouldFocusSelected,
      dispatch,
      toggleFramework,
    });

    if (existingLayer && !updateExisting) {
      removeExistingLayer({
        id,
        layer: parsedLayer,
        dispatch,
        clearFeatures,
        messageApi,
      });
      return;
    }

    addOrUpdateLayer({
      id,
      layer: parsedLayer,
      existingLayer,
      updateExisting,
      previewLayer,
      activeLayers,
      dispatch,
      messageApi,
      maxLayers,
    });
  };
};
