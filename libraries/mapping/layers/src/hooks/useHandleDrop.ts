import { useEffect } from "react";
import { message } from "antd";
import WMSCapabilities from "wms-capabilities";
import { SavedLayerConfig } from "@carma/types";
import { useFeatureFlags } from "@carma-providers/feature-flag";
import { ActiveLayers } from "../components/NewLibModal";
import type { Layer } from "@carma/types";
import { utils } from "@carma-appframeworks/portals";
import { useDispatch } from "react-redux";
import { setCustomLayerConfig } from "../slices/mapLayers";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";

// @ts-expect-error tbd
const parser = new WMSCapabilities();

interface UseHandleDropProps {
  setOpen: (open: boolean) => void;
  setSelectedNavItemIndex: (index: number) => void;
  addItemToCategory: (
    categoryId: string,
    subCategory: { id: string; Title: string },
    item: SavedLayerConfig | SavedLayerConfig[]
  ) => void;
  getDataFromJson: (data: any) => any;
  activeLayers: ActiveLayers;
  updateActiveLayer: (layer: Layer) => void;
  setAdditionalLayers: (layers: any[], deleteItem?: boolean) => void;
}

export const useHandleDrop = ({
  setOpen,
  setSelectedNavItemIndex,
  addItemToCategory,
  getDataFromJson,
  activeLayers,
  updateActiveLayer,
  setAdditionalLayers,
}: UseHandleDropProps) => {
  const flags = useFeatureFlags();
  const dispatch = useDispatch();
  const { isCesium } = useMapFrameworkSwitcherContext();
  const openModal = () => {
    if (!isCesium) {
      setOpen(true);
      setSelectedNavItemIndex(3);
    }
  };

  useEffect(() => {
    const handleDrop = async (event: DragEvent) => {
      event.preventDefault();
      const url = event.dataTransfer?.getData("URL");

      const file = event?.dataTransfer?.files[0];
      let instant = false;

      if (url && url.endsWith(".json")) {
        // Check if this layer is already in active layers
        const layerId = `custom:${url}`;
        const existingLayer = activeLayers.find(
          (layer) => layer.id === layerId
        );

        let newItem: any = {
          description: "",
          id: `custom:${url}`,
          layerType: "vector",
          title: url.slice(0, -5),
          serviceName: "custom",
          type: "layer",
          keywords: [`carmaConf://vectorStyle:${url}`],
          path: "Externe Dienste",
        };
        await fetch(url)
          .then((response) => response.json())
          .then((data) => {
            if (data.metadata && data.metadata.carmaConf.layerInfo) {
              const layerInfo = data.metadata.carmaConf.layerInfo;
              instant = data.metaData.carmaConf.instant ?? false;
              newItem = {
                ...newItem,
                ...layerInfo,
                keywords: [...newItem.keywords, ...(layerInfo.keywords || [])],
              };
            }
          })
          .catch((error) => {
            console.error("Error fetching JSON to check metadata:", error);
          });

        if (existingLayer) {
          try {
            const updatedLayer = await utils.parseToMapLayer(
              newItem,
              false,
              true
            );

            updateActiveLayer(updatedLayer);
            addItemToCategory(
              "mapLayers",
              { id: "custom", Title: "Externe Dienste" },
              newItem as unknown as SavedLayerConfig // TODO: Fix type
            );
            message.success("Layer wurde aktualisiert");
          } catch (error) {
            message.error("Fehler beim Aktualisieren des Layers");
            console.error("Error updating layer:", error);
          }
        } else {
          if (instant) {
            setAdditionalLayers(newItem, false);
          } else {
            openModal();
            addItemToCategory(
              "mapLayers",
              { id: "custom", Title: "Externe Dienste" },
              newItem as unknown as SavedLayerConfig // TODO: Fix type
            );
          }
        }
      } else if (url) {
        openModal();

        fetch(url)
          .then((response) => {
            return response.text();
          })
          .then((text) => {
            const result = parser.toJSON(text);

            const ownLayers = getDataFromJson(result);
            if (ownLayers) {
              addItemToCategory(
                "mapLayers",
                { id: "custom", Title: "Externe Dienste" },
                ownLayers[0].layers.map((layer) => {
                  return {
                    ...layer,
                    path: "Externe Dienste",
                  };
                })
              );
            }
          })
          .catch((error) => {
            console.error("Error handling drop:", error);
          });
      }

      if (file && file.name.endsWith("style.json")) {
        // Handle file drop

        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            // Attempt to parse the file content as JSON
            const fileContent = e.target?.result;
            if (typeof fileContent === "string") {
              const processedContent = fileContent.replace(
                /__SERVER_URL__/g,
                "https://tiles.cismet.de"
              );

              const jsonData = JSON.parse(processedContent);

              let newItem: any = {
                description: "",
                id: `custom:${file.name}`,
                layerType: "vector",
                title: file.name,
                serviceName: "custom",
                type: "layer",
                keywords: [
                  `carmaConf://vectorStyle:${JSON.stringify(jsonData)}`,
                ],
                path: "Externe Dienste",
              };

              if (jsonData.metadata && jsonData.metadata.carmaConf) {
                const carmaConf = jsonData.metadata.carmaConf;
                newItem = {
                  ...newItem,
                  ...carmaConf.layerInfo,
                  keywords: [
                    ...newItem.keywords,
                    ...(carmaConf.layerInfo.keywords || []),
                  ],
                };
                instant = carmaConf.instant ?? false;
              }

              if (instant) {
                setAdditionalLayers(newItem, false);
              } else {
                openModal();
                addItemToCategory(
                  "mapLayers",
                  { id: "custom", Title: "Externe Dienste" },
                  newItem as unknown as SavedLayerConfig // TODO: Fix type
                );
              }
            }
          } catch (error) {
            console.error("Failed to parse the file as JSON:", error);
          }
        };

        reader.readAsText(file);
      } else if (file) {
        if (
          file.name.includes("config") &&
          file.name.endsWith(".json") &&
          window.location.hostname === "localhost"
        ) {
          file.text().then((content) => {
            const result = JSON.parse(content);
            if (result) {
              dispatch(setCustomLayerConfig(result));
            }
          });
          openModal();

          return;
        }
        openModal();

        file
          .text()
          .then((text) => {
            const result = parser.toJSON(text);
            const ownLayers = getDataFromJson(result);
            if (ownLayers) {
              addItemToCategory(
                "mapLayers",
                { id: "custom", Title: "Externe Dienste" },
                ownLayers[0].layers.map((layer) => {
                  return {
                    ...layer,
                    path: "Externe Dienste",
                  };
                })
              );
            }
          })
          .catch((error) => {
            // setError(error.message);
          });
      }
    };

    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
    };

    window.addEventListener("drop", handleDrop);
    window.addEventListener("dragover", handleDragOver);

    return () => {
      window.removeEventListener("drop", handleDrop);
      window.removeEventListener("dragover", handleDragOver);
    };
  }, [
    setOpen,
    setSelectedNavItemIndex,
    addItemToCategory,
    getDataFromJson,
    activeLayers,
    updateActiveLayer,
  ]);
};

export default useHandleDrop;
