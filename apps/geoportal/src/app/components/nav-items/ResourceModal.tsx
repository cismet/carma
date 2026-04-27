import { message } from "antd";
import { useCallback, useContext } from "react";
import { useDispatch, useSelector } from "react-redux";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import {
  useAdhocFeatureDisplay,
  useMapStyle,
} from "@carma-appframeworks/portals";
import { LayerLib } from "@carma-mapping/layers";
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
import {
  getUIShowResourceModal,
  setShowLoginModal,
  setShowResourceModal,
} from "../../store/slices/ui";
import { apiUrl } from "../../constants/discover";
import store from "../../store";
import { createResourceLayerUpdater } from "./resource-layer-updater";
import { useCarmaMapAPIActions } from "@carma-mapping/carma-map-api";

const ResourceModal = () => {
  const { setCurrentStyle } = useMapStyle();

  const dispatch = useDispatch();

  const activeLayers = useSelector(getLayers);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const favorites = useSelector(getFavorites);
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

  const updateLayers = createResourceLayerUpdater({
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
  });

  return (
    <>
      {contextHolder}
      <LayerLib
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
            Title: "Meine Objekte",
            layers: favorites.filter((favorite) => {
              return favorite.type === "object";
            }),

            id: "favoriteObjects",
          },
        ].filter(Boolean)}
        updateActiveLayer={(layer) => {
          dispatch(updateLayer(layer));
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
      />
    </>
  );
};

export default ResourceModal;
