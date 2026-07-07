import { message } from "antd";
import { useCallback, useContext } from "react";
import { useDispatch, useSelector } from "react-redux";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import {
  useAdhocFeatureDisplay,
  useMapStyle,
} from "@carma-appframeworks/portals";
import { LayerCatalog } from "@carma-mapping/layers";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import {
  addCustomFeatureFlags,
  addFavorite,
  getFavorites,
  removeFavorite,
  updateFavorite,
} from "../../store/slices/layers";
import {
  appendSavedLayerConfig,
  deleteSavedLayerConfig,
  getBackgroundLayer,
  getLayers,
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
import { apiUrl } from "../../constants/discover";
import store from "../../store";
import { withSavedMeasurementCarrierImport } from "../layers/measurement-import-utils";
import { createResourceLayerUpdater } from "./resource-layer-updater";
import { useCarmaMapAPIActions } from "@carma-mapping/carma-map-api";

const ResourceModal = () => {
  const { setCurrentStyle } = useMapStyle();

  const dispatch = useDispatch();

  const activeLayers = useSelector(getLayers);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const favorites = useSelector(getFavorites);
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
  const isLeaflet = getIsLeaflet();

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
        favorites={[...favorites, ...savedLayerConfigs]}
        addFavorite={(layer) => {
          if (layer.type !== "collection") {
            dispatch(addFavorite(layer));
          } else {
            dispatch(appendSavedLayerConfig(layer));
          }
        }}
        removeFavorite={(layer) => {
          if (layer.type !== "collection") {
            dispatch(removeFavorite(layer));
          } else {
            dispatch(deleteSavedLayerConfig(layer.id));
          }
        }}
        activeLayers={[backgroundLayer, ...activeLayers]}
        customCategories={[
          {
            Title: "Meine Teilzwillinge",
            layers: favorites
              .filter((favorite) => {
                return (
                  favorite.serviceName === "wuppTopicMaps" ||
                  favorite.serviceName === "wuppArcGisOnline"
                );
              })
              .map((favorite) => {
                return {
                  ...favorite,
                  serviceName: "favoriteDigitalTwins",
                  path: "Meine Teilzwillinge",
                };
              }),
            id: "favoriteDigitalTwins",
          },
          isLeaflet && {
            Title: "Meine Karten",
            layers: savedLayerConfigs.map((layer) => {
              return {
                ...layer,
                serviceName: "collections",
                path: "Meine Karten",
              };
            }),
            id: "collections",
          },
          isLeaflet && {
            Title: "Meine Kartenebenen",
            layers: favorites
              .filter((favorite) => {
                return (
                  favorite.serviceName !== "wuppTopicMaps" &&
                  favorite.serviceName !== "wuppArcGisOnline" &&
                  favorite.type !== "object"
                );
              })
              .map((favorite) => {
                return {
                  ...favorite,
                  serviceName: "favoriteLayers",
                  path: "Meine Kartenebenen",
                };
              }),
            id: "favoriteLayers",
          },
          {
            Title: "Meine Messungen",
            layers: measurements.map((measurement) => {
              return {
                ...measurement,
                path: "Meine Messungen",
              };
            }),
            id: "measurements",
            mainCategoryId: "objects",
            hideWhenEmpty: true,
          },
          {
            Title: "Meine Objekte",
            layers: favorites
              .filter((favorite) => {
                return favorite.type === "object";
              })
              .map((favorite) => {
                return {
                  ...favorite,
                  serviceName: "favoriteObjects",
                  path: "Meine Objekte",
                };
              }),

            id: "favoriteObjects",
          },
        ].filter(Boolean)}
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
        updateFavorite={(layer) => {
          dispatch(updateFavorite(layer));
        }}
        discoverProps={{
          appKey: "Geoportal.Online.Wuppertal",
          apiUrl: apiUrl,
          daqKey: "gp_entdecken",
        }}
        setFeatureFlags={(flags) => {
          dispatch(addCustomFeatureFlags(flags));
        }}
        store={store}
        unauthorizedCallback={() => {
          dispatch(setShowLoginModal(true));
        }}
        appKey="geoportal"
      />
    </>
  );
};

export default ResourceModal;
