import { useEffect } from "react";
import { message } from "antd";
import WMSCapabilities from "wms-capabilities";
import type {
  ActiveLayers,
  Item,
  Layer,
  SetAdditionalLayers,
} from "../lib/contracts/carma-layers.d";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { wmsCapabilitiesToCustomItems } from "../helper/buildCatalog";
import type { CatalogDrop } from "../helper/buildCatalog";
import {
  buildVectorStyleItem,
  loadVectorStyle,
  parseVectorStyle,
  styleUrlTitle,
} from "../helper/vectorStyleItem";
import type { CarmaVectorStyle } from "../helper/vectorStyleItem";
import { parseToMapLayer } from "@carma-mapping/utils";
import { useLiveDeployment } from "@carma-commons/utils";

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
  onDrop: (drop: CatalogDrop) => void;
  activeLayers: ActiveLayers;
  updateActiveLayer: (layer: Layer) => void;
  setAdditionalLayers: SetAdditionalLayers;
  vectorTileServerUrl: string;
}

export const useHandleDrop = ({
  setOpen,
  setSelectedNavItemIndex,
  onDrop,
  activeLayers,
  updateActiveLayer,
  setAdditionalLayers,
  vectorTileServerUrl,
}: UseHandleDropProps) => {
  const { isCesium } = useMapFrameworkSwitcherContext();
  const isLiveDeployment = useLiveDeployment();
  const openModal = (index?: number) => {
    if (!isCesium) {
      setOpen(true);
      setSelectedNavItemIndex(index ?? 3);
    }
  };

  const fetchStyleMetadata = async (
    url: string
  ): Promise<CarmaVectorStyle | null> => {
    try {
      return await loadVectorStyle(url, vectorTileServerUrl);
    } catch (error) {
      console.error("Error fetching JSON to check metadata:", error);
      return null;
    }
  };

  const handleAddToMap = async (newItem: Item, instant = false) => {
    const existingLayer = activeLayers.find((layer) => layer.id === newItem.id);

    if (existingLayer) {
      try {
        const updatedLayer = await parseToMapLayer(newItem, false, true);

        updateActiveLayer(updatedLayer);
        onDrop({ kind: "layers", items: [newItem] });
        message.success("Layer wurde aktualisiert");
      } catch (error) {
        message.error("Fehler beim Aktualisieren des Layers");
        console.error("Error updating layer:", error);
      }
      return;
    }

    // every dropped item joins the catalog; instant ones additionally go
    // straight onto the map instead of opening the catalog
    onDrop({ kind: "layers", items: [newItem] });
    if (instant) {
      setAdditionalLayers(newItem, false, false, false, true);
    } else {
      openModal();
    }
  };

  // outside the live deployment a dropped vector style always goes onto the map
  // directly (and into the catalog) without opening the modal; on live only an
  // explicit carmaConf.instant does that
  const handleJsonStyle = async (file: File | null, url: string | null) => {
    const openInstantly = !isLiveDeployment;
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          // Attempt to parse the file content as JSON
          const fileContent = e.target?.result;
          if (typeof fileContent === "string") {
            const style = parseVectorStyle(fileContent, vectorTileServerUrl);
            const { item, instant } = buildVectorStyleItem({
              styleRef: JSON.stringify(style),
              style,
              id: `custom:${file.name}`,
              fallbackTitle: file.name,
            });

            await handleAddToMap(item, openInstantly || instant);
          }
        } catch (error) {
          console.error("Failed to parse the file as JSON:", error);
        }
      };

      reader.readAsText(file);
    }

    if (url) {
      const style = await fetchStyleMetadata(url);
      const { item, instant } = buildVectorStyleItem({
        styleRef: url,
        style,
        id: `custom:${url}`,
        fallbackTitle: styleUrlTitle(url),
      });

      await handleAddToMap(item, openInstantly || instant);
    }
  };

  // a twin file is the same vector style, filed as a 3d object; unlike a plain
  // style it never goes onto the map by deployment, only by its own `instant`
  const handleTwinFile = async (file: File | null, url: string | null) => {
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          // Attempt to parse the file content as JSON
          const fileContent = e.target?.result;
          if (typeof fileContent === "string") {
            const style = parseVectorStyle(fileContent, vectorTileServerUrl);
            const { item, instant } = buildVectorStyleItem({
              styleRef: JSON.stringify(style),
              style,
              id: file.name,
              fallbackTitle: file.name,
              type: "object",
            });

            handleAddToMap(item, instant);
          }
        } catch (error) {
          console.error("Failed to parse the file as JSON:", error);
        }
      };

      reader.readAsText(file);
    }

    if (url) {
      const style = await fetchStyleMetadata(url);
      const { item, instant } = buildVectorStyleItem({
        styleRef: url,
        style,
        id: url,
        fallbackTitle: styleUrlTitle(url),
        type: "object",
      });

      await handleAddToMap(item, instant);
    }
  };

  const handleWmsCapabilitiesText = (text: string) => {
    const result = parser.toJSON(text);
    const items = wmsCapabilitiesToCustomItems(result);
    if (items.length > 0) {
      onDrop({ kind: "layers", items });
      openModal();
    }
  };

  useEffect(() => {
    const handleDrop = async (event: DragEvent) => {
      event.preventDefault();
      const url = event.dataTransfer?.getData("URL");

      const file = event?.dataTransfer?.files[0];

      if (
        (url && url.includes(TWININDICATOR)) ||
        (file && file.name.includes(TWININDICATOR))
      ) {
        handleTwinFile(file ?? null, url ?? null);
      } else {
        if (url && url.endsWith(".json")) {
          handleJsonStyle(null, url);
        } else if (url) {
          fetch(url)
            .then((response) => {
              return response.text();
            })
            .then((text) => {
              handleWmsCapabilitiesText(text);
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
            file.text().then((content) => {
              const result = JSON.parse(content);
              if (result) {
                const configMatch = Object.entries(CONFIG_FILE_LOOKUP).find(
                  ([key]) => file.name.toLowerCase().includes(key)
                );
                if (configMatch) {
                  onDrop({
                    kind: "categoryConfig",
                    categoryId: configMatch[1].categoryId,
                    configs: result,
                  });
                  openModal(configMatch[1].index);
                } else {
                  onDrop({ kind: "layerConfig", configs: result });
                  openModal();
                }
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
              handleWmsCapabilitiesText(text);
            })
            .catch((error) => {
              console.error("Error handling drop:", error);
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
    onDrop,
    activeLayers,
    updateActiveLayer,
    setAdditionalLayers,
    isCesium,
    isLiveDeployment,
  ]);
};

export default useHandleDrop;
