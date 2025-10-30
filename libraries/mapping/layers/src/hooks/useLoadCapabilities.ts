/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { isEqual } from "lodash";
import WMSCapabilities from "wms-capabilities";
import type { Layer, SavedLayerConfig } from "@carma/types";
import { utils } from "@carma-appframeworks/portals";
import type { Store } from "redux";

import {
  addloadingCapabilitiesIDs,
  removeloadingCapabilitiesIDs,
  setLoadingCapabilities,
  setAllLayers,
  getAllLayers,
} from "../slices/mapLayers";
import {
  baseConfig as config,
  partianTwinConfig,
  serviceConfig,
} from "../helper/config";
import {
  getLayerStructure,
  mergeStructures,
  normalizeObject,
} from "../helper/layerHelper";
import type { ActiveLayers } from "../components/NewLibModal";

// @ts-expect-error
const parser = new WMSCapabilities();

interface UseLoadCapabilitiesProps {
  loadingAdditionalConfig: boolean;
  activeLayers: ActiveLayers;
  updateActiveLayer: (layer: Layer) => void;
  setLayers: (layers: any[]) => void;
  setFilteredCategories: React.Dispatch<
    React.SetStateAction<
      {
        id: string;
        categories: {
          Title: string;
          id?: string;
          layers: SavedLayerConfig[];
        }[];
      }[]
    >
  >;
  setAllCategories: React.Dispatch<
    React.SetStateAction<
      {
        id: string;
        categories: {
          Title: string;
          id?: string;
          layers: SavedLayerConfig[];
        }[];
      }[]
    >
  >;
  getDataFromJson: (data: any) => {
    Title: string;
    layers: any[];
  }[];
  store: Store;
}

export const useLoadCapabilities = ({
  loadingAdditionalConfig,
  activeLayers,
  updateActiveLayer,
  setLayers,
  setFilteredCategories,
  setAllCategories,
  getDataFromJson,
  store,
}: UseLoadCapabilitiesProps) => {
  const dispatch = useDispatch();
  const services = serviceConfig;
  const allLayers = useSelector(getAllLayers);

  useEffect(() => {
    const loadCapabilites = async () => {
      let newLayers: any[] = [];

      // Check if any service needs to load capabilities
      let needsLoading = false;
      for (let key in services) {
        const hasExistingLayers = allLayers.some(
          (layer) => layer.id === services[key].name
        );
        if (!hasExistingLayers) {
          needsLoading = true;
          break;
        }
      }

      dispatch(setLoadingCapabilities(needsLoading));

      for (let key in services) {
        if (services[key].url) {
          const hasExistingLayers = allLayers.some(
            (layer) => layer.id === services[key].name
          );
          if (!hasExistingLayers) {
            dispatch(addloadingCapabilitiesIDs(services[key].name));
          }

          fetch(
            `${services[key].url}?service=WMS&request=GetCapabilities&version=1.1.1`
          )
            .then(async (response) => {
              return response.text();
            })
            .then((text) => {
              const result = parser.toJSON(text);
              if (result) {
                if (config) {
                  const layerStructure = getLayerStructure({
                    config,
                    wms: result,
                    serviceName: services[key].name,
                    skipTopicMaps: true,
                    store: store,
                  });

                  layerStructure.forEach((category) => {
                    if (category.layers.length > 0) {
                      activeLayers.forEach(async (activeLayer) => {
                        const foundLayer = category.layers.find(
                          (layer) => layer.id === activeLayer.id
                        );
                        if (foundLayer) {
                          const updatedLayer = await utils.parseToMapLayer(
                            foundLayer,
                            false,
                            activeLayer.visible,
                            activeLayer.opacity
                          );

                          const normalizedActiveLayer =
                            normalizeObject(activeLayer);
                          const normalizedUpdatedLayer =
                            normalizeObject(updatedLayer);

                          if (
                            !isEqual(
                              normalizedActiveLayer,
                              normalizedUpdatedLayer
                            )
                          ) {
                            updateActiveLayer(updatedLayer);
                          }
                        }
                      });
                    }
                  });
                  const mergedLayer = mergeStructures(
                    layerStructure,
                    newLayers
                  );

                  newLayers = mergedLayer;
                  const updatedLayers: Layer[] = newLayers;

                  dispatch(setAllLayers(updatedLayers));
                  dispatch(setLoadingCapabilities(false));
                  dispatch(removeloadingCapabilitiesIDs(services[key].name));
                } else {
                  getDataFromJson(result);
                  dispatch(setLoadingCapabilities(false));
                  dispatch(removeloadingCapabilitiesIDs(services[key].name));
                }
              }
            })
            .catch((error) => {
              console.error(error);
              dispatch(setLoadingCapabilities(false));
              dispatch(removeloadingCapabilitiesIDs(services[key].name));
            });
        } else {
          if (services[key].type === "topicmaps") {
          } else {
            const layerStructure = getLayerStructure({
              config,
              serviceName: services[key].name,
              skipTopicMaps: true,
              store,
            });
            const mergedLayer = mergeStructures(layerStructure, newLayers);
            newLayers = mergedLayer;
            const updatedLayers: Layer[] = newLayers;

            setLayers(updatedLayers);
            dispatch(setAllLayers(updatedLayers));
          }
        }
      }

      // Partial Twins Category
      const partialTwinsCategories: {
        Title: string;
        id: string;
        layers: SavedLayerConfig[];
      }[] = [];

      for (let key in partianTwinConfig) {
        partialTwinsCategories.push(partianTwinConfig[key]);
      }

      setFilteredCategories((prev) => {
        if (prev.find((item) => item.id === "partialTwins")) {
          prev.splice(
            prev.findIndex((item) => item.id === "partialTwins"),
            1
          );
        }
        return [
          ...prev,
          { id: "partialTwins", categories: partialTwinsCategories },
        ];
      });

      setAllCategories((prev) => {
        if (prev.find((item) => item.id === "partialTwins")) {
          prev.splice(
            prev.findIndex((item) => item.id === "partialTwins"),
            1
          );
        }
        return [
          ...prev,
          { id: "partialTwins", categories: partialTwinsCategories },
        ];
      });
    };

    if (!loadingAdditionalConfig) {
      loadCapabilites();
    }
  }, [loadingAdditionalConfig]);
};
