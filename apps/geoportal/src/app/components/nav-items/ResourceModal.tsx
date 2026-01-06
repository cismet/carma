import { message } from "antd";
import { useContext, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { useMapStyle, utils } from "@carma-appframeworks/portals";
import type { Item, Layer } from "@carma/types";
import { LayerLib } from "@carma-mapping/layers";
import { useAuth } from "@carma-providers/auth";

import { updateInfoElementsAfterRemovingFeature } from "../../store/slices/features";
import {
  addCustomFeatureFlags,
  addFavorite,
  getFavorites,
  getThumbnails,
  removeFavorite,
  updateFavorite,
} from "../../store/slices/layers";
import {
  appendLayer,
  appendSavedLayerConfig,
  deleteSavedLayerConfig,
  getBackgroundLayer,
  getLayers,
  getSavedLayerConfigs,
  removeLastLayer,
  removeLayer,
  setBackgroundLayer,
  setLayers,
  setSelectedLuftbildLayer,
  setSelectedMapLayer,
  updateLayer,
} from "../../store/slices/mapping";
import {
  getUIShowResourceModal,
  setShowLoginModal,
  setShowResourceModal,
} from "../../store/slices/ui";
import { apiUrl } from "../../constants/discover";
import store from "../../store";
import { layerMap } from "../../config";
import { createBackgroundLayerConfig } from "../../helper/layer";
import { MapStyleKeys } from "../../constants/MapStyleKeys";
const ResourceModal = () => {
  const [discoverItems, setDiscoverItems] = useState([]);

  const { setCurrentStyle } = useMapStyle();

  const dispatch = useDispatch();

  const activeLayers = useSelector(getLayers);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const thumbnails = useSelector(getThumbnails);
  const favorites = useSelector(getFavorites);
  const savedLayerConfigs = useSelector(getSavedLayerConfigs);
  const showResourceModal = useSelector(getUIShowResourceModal);
  // const jwt = useSelector(getJWT);
  const { jwt } = useAuth();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const MAX_NUM_OF_LAYERS = 12;

  const { routedMapRef: routedMap } =
    useContext<typeof TopicMapContext>(TopicMapContext);

  const updateLayers = async (
    layer: Item,
    deleteItem: boolean = false,
    forceWMS: boolean = false,
    previewLayer: boolean = false
  ) => {
    let newLayer: Layer;
    const id = layer.id.startsWith("fav_") ? layer.id.slice(4) : layer.id;

    if (layer.type === "collection") {
      if (deleteItem) {
        dispatch(deleteSavedLayerConfig(layer.id));
      } else {
        try {
          dispatch(setLayers(layer.layers));
          if (layer.backgroundLayer) {
            dispatch(setBackgroundLayer(layer.backgroundLayer));
            const layerKey = Object.keys(layerMap).find(
              (key) => layerMap[key].title === layer.backgroundLayer.title
            );
            if (layerKey) {
              if (layer.backgroundLayer.id === "karte") {
                dispatch(
                  setSelectedMapLayer(createBackgroundLayerConfig(layerKey))
                );
                setCurrentStyle(MapStyleKeys.TOPO);
              } else {
                dispatch(
                  setSelectedLuftbildLayer(
                    createBackgroundLayerConfig(layerKey)
                  )
                );
                setCurrentStyle(MapStyleKeys.AERIAL);
              }
            }
          }
          if (layer.settings) {
            const map = routedMap.leafletMap.leafletElement;
            const currentZoom = map.getZoom();
            const settings = layer.settings;
            const changePosition =
              settings.zoom || settings.lat || settings.lng;
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
            content: `${layer.title} wurde erfolgreich geladen.`,
          });
        } catch {
          messageApi.open({
            type: "error",
            content: `Es gab einen Fehler beim Laden von ${layer.title}`,
          });
        }
      }
      return;
    }

    newLayer = await utils.parseToMapLayer(layer, forceWMS, true);

    if (activeLayers.find((activeLayer) => activeLayer.id === id)) {
      try {
        dispatch(removeLayer(id));
        dispatch(updateInfoElementsAfterRemovingFeature(id));
        messageApi.open({
          type: "success",
          content: `${layer.title} wurde erfolgreich entfernt.`,
        });
      } catch {
        messageApi.open({
          type: "error",
          content: `Es gab einen Fehler beim Entfernen von ${layer.title}`,
        });
      }
    } else {
      if (activeLayers.length >= MAX_NUM_OF_LAYERS) {
        messageApi.open({
          type: "error",
          content: `Zu viele Layer hinzugefügt. Layer entfernen um fortzufahren.`,
        });
        return;
      }
      try {
        dispatch(appendLayer(newLayer));
        if (!previewLayer) {
          messageApi.open({
            type: "success",
            content: `${layer.title} wurde erfolgreich hinzugefügt.`,
          });
        }
      } catch {
        messageApi.open({
          type: "error",
          content: `Es gab einen Fehler beim hinzufügen von ${layer.title}`,
        });
      }
    }
  };

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
          {
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
          {
            Title: "Meine Kartenebenen",
            layers: favorites
              .filter((favorite) => {
                return (
                  favorite.serviceName !== "wuppTopicMaps" &&
                  favorite.serviceName !== "wuppArcGisOnline"
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
        ]}
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
