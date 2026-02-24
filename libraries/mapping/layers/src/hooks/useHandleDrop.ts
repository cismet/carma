import { Dispatch, SetStateAction, useEffect } from "react";
import { message } from "antd";
import WMSCapabilities from "wms-capabilities";
import { SavedLayerConfig } from "@carma/types";
import { useFeatureFlags } from "@carma-providers/feature-flag";
import { ActiveLayers } from "../components/NewLibModal";
import type { Layer } from "@carma/types";
import { useDispatch } from "react-redux";
import { setCustomLayerConfig } from "../slices/mapLayers";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { processCategoryConfig } from "../helper/processCategoryConfig";
import { parseToMapLayer } from "@carma-mapping/utils";

// @ts-expect-error tbd
const parser = new WMSCapabilities();

const TWININDICATOR = ".twin.";

const CONFIG_FILE_LOOKUP: Record<
  string,
  { index: number; categoryId: string }
> = {
  sensor: { index: 4, categoryId: "sensors" },
  object: { index: 5, categoryId: "objects" },
};

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
  setAdditionalLayers: (
    layers: any[],
    deleteItem?: boolean,
    forceWMS?: boolean,
    previewLayer?: boolean,
    updateExisting?: boolean
  ) => void;
  setSidebarElements: Dispatch<
    SetStateAction<
      {
        icon: any;
        text: string;
        id: string;
        disabled?: boolean;
      }[]
    >
  >;
}

export const useHandleDrop = ({
  setOpen,
  setSelectedNavItemIndex,
  addItemToCategory,
  getDataFromJson,
  activeLayers,
  updateActiveLayer,
  setAdditionalLayers,
  setSidebarElements,
}: UseHandleDropProps) => {
  const flags = useFeatureFlags();
  const dispatch = useDispatch();
  const { isCesium } = useMapFrameworkSwitcherContext();
  const openModal = (index?: number) => {
    if (!isCesium) {
      setOpen(true);
      setSelectedNavItemIndex(index ?? 3);
    }
  };

  const preTransformJson = (input: string) => {
    return input
      .replaceAll("__SERVER_URL__", "https://tiles.cismet.de")
      .replaceAll("__server_url__", "https://tiles.cismet.de");
  };

  const handleAddToMap = (newItem: any, instant = false) => {
    if (instant) {
      setAdditionalLayers(newItem, false, false, false, true);
    } else {
      openModal();
      addItemToCategory(
        "mapLayers",
        { id: "custom", Title: "Externe Dienste" },
        newItem as unknown as SavedLayerConfig // TODO: Fix type
      );
    }
  };

  const handleJsonStyle = async (file, url) => {
    let instant = false;
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          // Attempt to parse the file content as JSON
          const fileContent = e.target?.result;
          if (typeof fileContent === "string") {
            const processedContent = preTransformJson(fileContent);

            const jsonData = JSON.parse(processedContent);

            let newItem: any = {
              description: "",
              id: `custom:${file.name}`,
              layerType: "vector",
              title: file.name,
              serviceName: "custom",
              type: "layer",
              keywords: [`carmaConf://vectorStyle:${JSON.stringify(jsonData)}`],
              path: "Externe Dienste",
            };

            if (jsonData.metadata && jsonData.metadata.carmaConf) {
              const carmaConf = jsonData.metadata.carmaConf;
              newItem = {
                ...newItem,
                ...carmaConf.layerInfo,
                keywords: [
                  ...newItem?.keywords,
                  ...(carmaConf?.layerInfo?.keywords || []),
                ],
              };
              instant = carmaConf?.instant ?? false;
            }

            if (instant) {
              setAdditionalLayers(newItem, false, false, false, true);
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
    }

    if (url) {
      let importedId = `custom:${url}`;

      let newItem: any = {
        description: "",
        id: importedId,
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
            instant = data.metaData?.carmaConf?.instant ?? false;
            newItem = {
              ...newItem,
              id: importedId,
              ...layerInfo,
              keywords: [...newItem?.keywords, ...(layerInfo?.keywords || [])],
            };
          } else {
            newItem = {
              ...newItem,
              id: importedId,
            };
          }
        })
        .catch((error) => {
          console.error("Error fetching JSON to check metadata:", error);
        });

      const existingLayer = activeLayers.find(
        (layer) => layer.id === importedId
      );

      if (existingLayer) {
        try {
          const updatedLayer = await parseToMapLayer(newItem, false, true);

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
          setAdditionalLayers(newItem, false, false, false, true);
        } else {
          openModal();
          addItemToCategory(
            "mapLayers",
            { id: "custom", Title: "Externe Dienste" },
            newItem as unknown as SavedLayerConfig // TODO: Fix type
          );
        }
      }
    }
  };

  const handleTwinFile = async (file, url) => {
    let newItem: any = {
      description: "",
      layerType: "vector",
      serviceName: "custom",
      type: "object",
      path: "Externe Dienste",
    };

    let instant = false;
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          // Attempt to parse the file content as JSON
          const fileContent = e.target?.result;
          if (typeof fileContent === "string") {
            const processedContent = preTransformJson(fileContent);

            const jsonData = JSON.parse(processedContent);
            const id = file.name;
            let keywords = [
              `carmaConf://vectorStyle:${JSON.stringify(jsonData)}`,
            ];
            let title = file.name;

            newItem = {
              ...newItem,
              id,
              keywords,
              title,
            };

            if (jsonData.metadata && jsonData.metadata.carmaConf) {
              const carmaConf = jsonData.metadata.carmaConf;
              newItem = {
                ...newItem,
                ...carmaConf.layerInfo,
                keywords: [
                  ...newItem?.keywords,
                  ...(carmaConf?.layerInfo?.keywords || []),
                ],
              };
              instant = carmaConf?.instant ?? false;
            }

            handleAddToMap(newItem, instant);
          }
        } catch (error) {
          console.error("Failed to parse the file as JSON:", error);
        }
      };

      reader.readAsText(file);
    }

    if (url) {
      let id = url;
      let keywords = [`carmaConf://vectorStyle:${url}`];
      let title = url.slice(0, -5);

      newItem = {
        ...newItem,
        id,
        keywords,
        title,
      };

      await fetch(url)
        .then((response) => response.json())
        .then((data) => {
          newItem = {
            ...newItem,
            id,
          };
          if (data.metadata && data.metadata.carmaConf.layerInfo) {
            const layerInfo = data.metadata.carmaConf.layerInfo;
            instant = data.metaData?.carmaConf?.instant ?? false;
            newItem = {
              ...newItem,
              ...layerInfo,
              keywords: [...newItem?.keywords, ...(layerInfo?.keywords || [])],
            };
          }
        })
        .catch((error) => {
          console.error("Error fetching JSON to check metadata:", error);
        });

      handleAddToMap(newItem, instant);
    }
  };

  useEffect(() => {
    const handleDrop = async (event: DragEvent) => {
      event.preventDefault();
      const url = event.dataTransfer?.getData("URL");

      const file = event?.dataTransfer?.files[0];
      let instant = false;

      if (
        (url && url.includes(TWININDICATOR)) ||
        (file && file.name.includes(TWININDICATOR))
      ) {
        handleTwinFile(file, url);
      } else {
        if (url && url.endsWith(".json")) {
          handleJsonStyle(null, url);
        } else if (url) {
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
                openModal();
              }
            })
            .catch((error) => {
              console.error("Error handling drop:", error);
            });
        }

        if (file && file.name.endsWith("style.json")) {
          handleJsonStyle(file, null);
          return;
        }
        if (file) {
          if (
            file.name.toLowerCase().includes("config") &&
            file.name.toLowerCase().endsWith(".json") &&
            window.location.hostname === "localhost"
          ) {
            let index: number | undefined;
            file.text().then((content) => {
              const result = JSON.parse(content);
              if (result) {
                const configMatch = Object.entries(CONFIG_FILE_LOOKUP).find(
                  ([key]) => file.name.toLowerCase().includes(key)
                );
                if (configMatch) {
                  index = configMatch[1].index;
                  processCategoryConfig({
                    config: result,
                    categoryId: configMatch[1].categoryId,
                    flags,
                    addItemToCategory,
                    setSidebarElements,
                  });
                } else {
                  dispatch(setCustomLayerConfig(result));
                }
                openModal(index);
              }
            });

            return;
          }

          if (file.name.endsWith(".json")) {
            handleTwinFile(file, null);
            return;
          }

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
                openModal();
              }
            })
            .catch((error) => {
              // setError(error.message);
            });
        }
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
    setAdditionalLayers,
    setSidebarElements,
    flags,
    dispatch,
    isCesium,
  ]);
};

export default useHandleDrop;
