import { message } from "antd";
import { useContext, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { useAuth, utils } from "@carma-apps/portals";
import type { Item, Layer } from "@carma-commons/types";
import { LayerLib } from "@carma-mapping/layers";

import { updateInfoElementsAfterRemovingFeature } from "../../store/slices/features";
import {
  addFavorite,
  getFavorites,
  getThumbnails,
  removeFavorite,
  setCustomFeatureFlags,
  updateFavorite,
} from "../../store/slices/layers";
import {
  appendLayer,
  appendSavedLayerConfig,
  deleteSavedLayerConfig,
  getLayers,
  getSavedLayerConfigs,
  removeLastLayer,
  removeLayer,
  setBackgroundLayer,
  setLayers,
  updateLayer,
} from "../../store/slices/mapping";
import {
  getUIShowResourceModal,
  setShowResourceModal,
} from "../../store/slices/ui";
import { apiUrl } from "../../constants/discover";
const ResourceModal = () => {
  const [discoverItems, setDiscoverItems] = useState([]);

  const dispatch = useDispatch();

  const activeLayers = useSelector(getLayers);
  const thumbnails = useSelector(getThumbnails);
  const favorites = useSelector(getFavorites);
  const savedLayerConfigs = useSelector(getSavedLayerConfigs);
  const showResourceModal = useSelector(getUIShowResourceModal);
  // const jwt = useSelector(getJWT);
  const { jwt } = useAuth();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

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
        activeLayers={activeLayers}
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
          dispatch(setCustomFeatureFlags(flags));
        }}
      />
    </>
  );
};

export default ResourceModal;
