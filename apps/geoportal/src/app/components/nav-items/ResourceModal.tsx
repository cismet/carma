import { Item, Layer, LayerLib } from "@carma-mapping/layers";
import { message } from "antd";
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  appendLayer,
  deleteSavedLayerConfig,
  getLayers,
  getSavedLayerConfigs,
  removeLastLayer,
  removeLayer,
  setLayers,
  updateLayer,
} from "../../store/slices/mapping";
import { utils } from "@carma-apps/portals";
import { updateInfoElementsAfterRemovingFeature } from "../../store/slices/features";
import {
  addFavorite,
  getFavorites,
  getThumbnails,
  removeFavorite,
  setThumbnail,
} from "../../store/slices/layers";
import {
  getUIShowResourceModal,
  setShowResourceModal,
} from "../../store/slices/ui";

const ResourceModal = () => {
  const dispatch = useDispatch();

  const activeLayers = useSelector(getLayers);
  const thumbnails = useSelector(getThumbnails);
  const favorites = useSelector(getFavorites);
  const savedLayerConfigs = useSelector(getSavedLayerConfigs);
  const showResourceModal = useSelector(getUIShowResourceModal);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

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
          messageApi.open({
            type: "success",
            content: `${layer.title} wurde erfolgreich angewandt.`,
          });
        } catch {
          messageApi.open({
            type: "error",
            content: `Es gab einen Fehler beim Anwenden von ${layer.title}`,
          });
        }
      }
      return;
    }

    newLayer = await utils.parseToMapLayer(layer, forceWMS);

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
        setThumbnail={(thumbnail) => {
          dispatch(setThumbnail(thumbnail));
        }}
        thumbnails={thumbnails}
        favorites={favorites}
        addFavorite={(layer) => {
          dispatch(addFavorite(layer));
        }}
        removeFavorite={(layer) => {
          dispatch(removeFavorite(layer));
        }}
        activeLayers={activeLayers}
        customCategories={[
          {
            Title: "Meine Zusammenstellungen",
            layers: savedLayerConfigs,
          },
          {
            Title: "Favoriten",
            layers: favorites,
          },
        ]}
        updateActiveLayer={(layer) => {
          dispatch(updateLayer(layer));
        }}
        removeLastLayer={() => {
          dispatch(removeLastLayer());
        }}
      />
    </>
  );
};

export default ResourceModal;
