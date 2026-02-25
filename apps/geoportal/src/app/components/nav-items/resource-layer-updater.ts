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
import { AddLayerOptions } from "@carma-mapping/carma-map-api";

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
type ClearFeatureCollectionsFn = (collectionIds?: string[]) => void;
type ToggleFrameworkFn = () => Promise<unknown>;
type SetCurrentStyleFn = (style: MapStyleKeys) => void;
type GetFrameworkModeFn = () => {
  isLeaflet: boolean;
  isCesium: boolean;
};

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
  clearFeatureCollections: ClearFeatureCollectionsFn;
  toggleFramework: ToggleFrameworkFn;
  getFrameworkMode: GetFrameworkModeFn;
  routedMap: RoutedMapRef;
  setCurrentStyle: SetCurrentStyleFn;
  messageApi: MessageApiLike;
  maxLayers?: number;
  addLayerById?: (
    id: string,
    options?: AddLayerOptions
  ) => Promise<Layer | undefined>;
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

const shouldSelectIn3D = (
  layer: Layer,
  mode: { isLeaflet: boolean; isCesium: boolean }
): boolean => {
  const modeSwitch = getLayerModeSwitch(layer);
  // Keep legacy behavior (select when operating in 3D context) while also
  // allowing explicit 3D layers to auto-select after a framework switch.
  return mode.isCesium || !mode.isLeaflet || modeSwitch === "3D";
};

const toSuccessToastContent = (text: string): ReactNode =>
  createElement("span", { "data-test-id": "toast-success" }, text);

const applyCollectionLayer = async ({
  layer,
  dispatch,
  messageApi,
  routedMap,
  setCurrentStyle,
  deleteItem,
  addLayerById,
}: {
  layer: CollectionLayerItem;
  dispatch: Dispatch;
  messageApi: MessageApiLike;
  routedMap: RoutedMapRef;
  setCurrentStyle: SetCurrentStyleFn;
  deleteItem: boolean;
  addLayerById?: (
    id: string,
    options?: AddLayerOptions
  ) => Promise<Layer | undefined>;
}) => {
  if (deleteItem) {
    dispatch(deleteSavedLayerConfig(layer.id));
    return;
  }

  try {
    let useSetLayersFallback = false;

    if (addLayerById) {
      dispatch(setLayers([]));
      for (const l of layer.layers) {
        const result = await addLayerById(l.id);
        if (!result) {
          dispatch(appendLayer(l));
        }
      }
    } else {
      useSetLayersFallback = true;
    }

    if (useSetLayersFallback) {
      dispatch(setLayers(layer.layers));
    }

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

const addAdhocFeatureIfApplicable = async ({
  layer,
  id,
  addFeature,
  getFrameworkMode,
  routedMap,
  setSelectedFeatureById,
  setShouldFocusSelected,
  dispatch,
  toggleFramework,
}: {
  layer: Layer;
  id: string;
  addFeature: AddFeatureFn;
  getFrameworkMode: GetFrameworkModeFn;
  routedMap: RoutedMapRef;
  setSelectedFeatureById: SetSelectedFeatureByIdFn;
  setShouldFocusSelected: SetShouldFocusSelectedFn;
  dispatch: Dispatch;
  toggleFramework: ToggleFrameworkFn;
}) => {
  if (!isAdhocVectorLayer(layer)) {
    return;
  }

  const initialMode = getFrameworkMode();
  const { isLeaflet: startedInLeaflet, isCesium: startedInCesium } =
    initialMode;
  console.debug("[ADHOC|ADD] addAdhocFeatureIfApplicable:start", {
    id,
    modeSwitch: getLayerModeSwitch(layer),
    startedInLeaflet,
    startedInCesium,
  });

  if (shouldToggleFramework(layer, startedInLeaflet)) {
    console.debug("[ADHOC|ADD] toggling framework before add", { id });
    await toggleFramework();
  }

  const addedFeature = await addAdhocFeatureFromLayer({
    layer,
    collectionId: id,
    layerId: DEFAULT_ADHOC_FEATURE_LAYER_ID,
    addFeature,
  });
  if (!addedFeature) {
    console.debug("[ADHOC|ADD] no adhoc feature added", { id });
    return;
  }
  console.debug("[ADHOC|ADD] feature added", {
    id,
    featureId: addedFeature.id,
    collectionId: addedFeature.collectionId,
    layerId: addedFeature.layerId,
  });

  const mutableLayer = layer as Layer & {
    props?: { style?: string | object };
  };
  mutableLayer.props = {
    ...(mutableLayer.props ?? {}),
    style: addedFeature.styleData,
  };

  await zoomToStyleFeatures(addedFeature.styleData, routedMap);

  const modeAfterAdd = getFrameworkMode();
  const shouldAutoSelectIn3D = shouldSelectIn3D(layer, modeAfterAdd);
  console.debug("[ADHOC|ADD] selection gate", {
    id,
    shouldAutoSelectIn3D,
    modeAfterAdd,
  });
  if (shouldAutoSelectIn3D) {
    setSelectedFeatureById(
      addedFeature.id,
      addedFeature.collectionId,
      addedFeature.layerId
    );
    setShouldFocusSelected(true);
    console.debug("[ADHOC|ADD] selected + focus requested", {
      id,
      featureId: addedFeature.id,
    });
  }

  // Keep cross-framework auto-selection sync semantics:
  // 2D consumes this directly; 3D can still hand off when switching framework.
  dispatch(setTriggerSelectionById(id));
  console.debug("[ADHOC|ADD] triggerSelectionById dispatched", { id });
};

const removeExistingLayer = ({
  id,
  layer,
  existingLayer,
  dispatch,
  clearFeatureCollections,
  messageApi,
}: {
  id: string;
  layer: Layer;
  existingLayer: Layer;
  dispatch: Dispatch;
  clearFeatureCollections: ClearFeatureCollectionsFn;
  messageApi: MessageApiLike;
}) => {
  try {
    dispatch(removeLayer(id));
    dispatch(updateInfoElementsAfterRemovingFeature(id));
    const shouldClearAdhocCollection =
      isAdhocVectorLayer(existingLayer) || isAdhocVectorLayer(layer);
    console.debug("[ADHOC|REMOVE] removeExistingLayer", {
      id,
      shouldClearAdhocCollection,
      existingLayerType: existingLayer.type,
      existingLayerLayerType: existingLayer.layerType,
      parsedLayerType: layer.type,
      parsedLayerLayerType: layer.layerType,
    });
    if (shouldClearAdhocCollection) {
      clearFeatureCollections([id]);
      console.debug("[ADHOC|REMOVE] clearFeatureCollections called", {
        collectionId: id,
      });
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
  clearFeatureCollections,
  toggleFramework,
  getFrameworkMode,
  routedMap,
  setCurrentStyle,
  messageApi,
  maxLayers = DEFAULT_MAX_LAYERS,
  addLayerById,
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
        addLayerById,
      });
      return;
    }

    const id = toLayerId(layer);
    let parsedLayer = null;
    try {
      parsedLayer = await parseToMapLayer(layer, forceWMS, true);
    } catch {
      messageApi.open({
        type: "error",
        content: `Es gab einen Fehler beim hinzufügen von ${layer.title}`,
      });
      return;
    }
    const existingLayer = activeLayers.find(
      (activeLayer) => activeLayer.id === id
    );

    if (existingLayer && !updateExisting) {
      removeExistingLayer({
        id,
        layer: parsedLayer,
        existingLayer,
        dispatch,
        clearFeatureCollections,
        messageApi,
      });
      return;
    }

    await addAdhocFeatureIfApplicable({
      layer: parsedLayer,
      id,
      addFeature,
      getFrameworkMode,
      routedMap,
      setSelectedFeatureById,
      setShouldFocusSelected,
      dispatch,
      toggleFramework,
    });

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
