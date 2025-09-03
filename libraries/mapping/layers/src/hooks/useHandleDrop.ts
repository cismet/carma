import { useEffect } from "react";
import WMSCapabilities from "wms-capabilities";
import { SavedLayerConfig } from "@carma-commons/types";
import { useFeatureFlags } from "@carma-appframeworks/portals";

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
}

export const useHandleDrop = ({
  setOpen,
  setSelectedNavItemIndex,
  addItemToCategory,
  getDataFromJson,
}: UseHandleDropProps) => {
  const flags = useFeatureFlags();
  useEffect(() => {
    const handleDrop = async (event: DragEvent) => {
      event.preventDefault();
      setOpen(true);
      setSelectedNavItemIndex(3);
      const url = event.dataTransfer?.getData("URL");

      const file = event?.dataTransfer?.files[0];

      if (url && url.endsWith(".json")) {
        let newItem = {
          description: "",
          id: `custom:${url}`,
          layerType: "vector",
          title: url.slice(0, -5),
          serviceName: "custom",
          type: "layer",
          keywords: [`carmaConf://vectorStyle:${url}`],
          path: "Externe Dienste",
          unsecure: flags["trustUnsecureObjectMapping"] ? false : true,
        };
        await fetch(url)
          .then((response) => response.json())
          .then((data) => {
            if (data.metadata && data.metadata.carmaConf.layerInfo) {
              newItem = {
                ...newItem,
                ...data.metadata.carmaConf.layerInfo,
              };
            }
          })
          .catch((error) => {
            console.error("Error fetching JSON to check metadata:", error);
          });
        addItemToCategory(
          "mapLayers",
          { id: "custom", Title: "Externe Dienste" },
          newItem as unknown as SavedLayerConfig // TODO: Fix type
        );
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
            }
          })
          .catch((error) => {
            console.log("xxx error", error);
          });
      }

      if (file && file.name.endsWith("style.json")) {
        // Handle file drop

        console.log("File dropped:", file.name, file);

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
              console.log("xxx Parsed JSON from file:", jsonData);

              const newItem = {
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

              addItemToCategory(
                "mapLayers",
                { id: "custom", Title: "Externe Dienste" },
                newItem as unknown as SavedLayerConfig // TODO: Fix type
              );
            }
          } catch (error) {
            console.error("Failed to parse the file as JSON:", error);
          }
        };

        reader.readAsText(file);
      } else if (file) {
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
  }, [setOpen, setSelectedNavItemIndex, addItemToCategory, getDataFromJson]);
};

export default useHandleDrop;
