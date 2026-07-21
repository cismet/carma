import { message } from "antd";
import { useCallback, useContext, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import {
  useAdhocFeatureDisplay,
  useMapStyle,
} from "@carma-appframeworks/portals";
import { LayerCatalog } from "@carma-mapping/layers";
import type { CustomCategoryDefinition, Item } from "@carma-mapping/layers";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { addCustomFeatureFlags } from "../../store/slices/layers";
import {
  appendSavedLayerConfig,
  deleteSavedLayerConfig,
  getBackgroundLayer,
  getLayers,
  getLayerStack,
  getSavedLayerConfigs,
  removeLastLayer,
  updateLayer,
} from "../../store/slices/mapping";
import { getMeasurements } from "../../store/slices/measurements";
import {
  getUIShowResourceModal,
  setShowLoginModal,
  setShowResourceModal,
} from "../../store/slices/ui";
import store from "../../store";
import { withSavedMeasurementCarrierImport } from "../layers/measurement-import-utils";
import { createResourceLayerUpdater } from "./resource-layer-updater";
import { useCarmaMapAPIActions } from "@carma-mapping/carma-map-api";

const ResourceModal = () => {
  const { setCurrentStyle } = useMapStyle();

  const dispatch = useDispatch();

  const activeLayers = useSelector(getLayers);
  const layerStack = useSelector(getLayerStack);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const measurements = useSelector(getMeasurements);
  const savedLayerConfigs = useSelector(getSavedLayerConfigs);
  const showResourceModal = useSelector(getUIShowResourceModal);

  const [messageApi, contextHolder] = message.useMessage();

  const { routedMapRef: routedMap } =
    useContext<typeof TopicMapContext>(TopicMapContext);

  const {
    addFeature,
    setSelectedFeatureById,
    setShouldFocusSelected,
    clearFeatureCollections,
  } = useAdhocFeatureDisplay();
  const { toggle, getIsLeaflet, getIsCesium } =
    useMapFrameworkSwitcherContext();
  const { addLayerById } = useCarmaMapAPIActions();

  // the favorites-derived subcategories are registry defaults of the lib;
  // only the genuinely app-owned measurements category is added here
  const customCategories = useMemo<CustomCategoryDefinition[]>(
    () => [
      {
        id: "measurements",
        label: "Meine Messungen",
        mainCategoryId: "objects",
        hideWhenEmpty: true,
        keepItemServiceName: true,
        source: { kind: "items", items: measurements as unknown as Item[] },
      },
    ],
    [measurements]
  );

  const getFrameworkMode = useCallback(
    () => ({
      isLeaflet: getIsLeaflet(),
      isCesium: getIsCesium(),
    }),
    [getIsCesium, getIsLeaflet]
  );

  const updateLayers = withSavedMeasurementCarrierImport(
    createResourceLayerUpdater({
      dispatch,
      activeLayers,
      layerStack,
      addFeature,
      setSelectedFeatureById,
      setShouldFocusSelected,
      clearFeatureCollections,
      toggleFramework: toggle,
      getFrameworkMode,
      routedMap,
      setCurrentStyle,
      messageApi,
      addLayerById,
    }),
    { measurements }
  );

  return (
    <>
      {contextHolder}
      <LayerCatalog
        open={showResourceModal}
        setOpen={(show) => dispatch(setShowResourceModal(show))}
        setAdditionalLayers={updateLayers}
        savedCollections={savedLayerConfigs}
        onAddCollection={(layer) => {
          dispatch(appendSavedLayerConfig(layer));
        }}
        onRemoveCollection={(layer) => {
          dispatch(deleteSavedLayerConfig(layer.id));
        }}
        activeLayers={[backgroundLayer, ...activeLayers]}
        customCategories={customCategories}
        updateActiveLayer={(layer) => {
          dispatch(updateLayer(layer));

          if (layer.layerType !== "vector" || !layer.props?.style) {
            return;
          }

          const entry = store
            .getState()
            .mapping.maplibreMaps.find((e) => e.id === layer.id);
          if (!entry?.map) {
            return;
          }

          const raw = layer.props.style;
          let updatedStyle = raw;
          if (typeof raw === "string" && raw.trim().startsWith("{")) {
            try {
              updatedStyle = JSON.parse(raw);
            } catch (err) {
              console.error("parse failed", err);
              throw err;
            }
          }
          try {
            entry.map.setStyle(updatedStyle);
          } catch (err) {
            console.error("setStyle failed", err);
            throw err;
          }
        }}
        removeLastLayer={() => {
          dispatch(removeLastLayer());
        }}
        setFeatureFlags={(flags) => {
          dispatch(addCustomFeatureFlags(flags));
        }}
        unauthorizedCallback={() => {
          dispatch(setShowLoginModal(true));
        }}
        appKey="geoportal"
      />
    </>
  );
};

export default ResourceModal;
