/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { isEqual } from "lodash";

import {
  faBook,
  faList,
  faMap,
  faMapPin,
  faSearch,
  faStar,
  faX,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useDebounce } from "@uidotdev/usehooks";
import { Button, Input, Modal } from "antd";
import Fuse from "fuse.js";
import WMSCapabilities from "wms-capabilities";
import type { Item, Layer, SavedLayerConfig } from "@carma-commons/types";
import {
  FeatureFlagConfig,
  useAuth,
  useFeatureFlags,
  utils,
} from "@carma-apps/portals";

import {
  baseConfig as config,
  partianTwinConfig,
  serviceConfig,
} from "../helper/config";
import {
  flattenLayer,
  getLayerStructure,
  mergeStructures,
  normalizeObject,
  wmsLayerToGenericItem,
} from "../helper/layerHelper";
import LayerTabs from "./LayerTabs";
import { SidebarItem } from "./SidebarItems";

import ItemGrid from "./ItemGrid";
import { discoverConfig } from "../helper/discover";

import "./input.css";
import "./modal.css";
import { md5ActionFetchDAQ } from "@carma-commons/utils/fetching.ts";

const { Search } = Input;

// TODO: fix interface
// @ts-expect-error tbd
const parser = new WMSCapabilities();

type LayerCategories = {
  Title: string;
  layers: SavedLayerConfig[];
  id?: string;
};

type DiscoverResult = {
  time: string | null;
  data: {
    config: string;
    id: number;
    name: string;
  }[];
};

export interface LibModalProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  setAdditionalLayers: any;
  favorites?: Item[];
  addFavorite: (layer: Item) => void;
  removeFavorite: (layer: Item) => void;
  updateFavorite?: (layer: Item) => void;
  activeLayers: any[];
  customCategories: LayerCategories[];
  updateActiveLayer: (layer: Layer) => void;
  removeLastLayer?: () => void;
  discoverProps?: {
    appKey: string;
    apiUrl: string;
    daqKey: string;
  };
  setFeatureFlags?: (flags: FeatureFlagConfig) => void;
}

const sidebarElements = [
  { icon: faStar, text: "Favoriten", id: "favorites" },
  { icon: faList, text: "Entdecken", id: "discover" },
  { icon: faBook, text: "Teilzwillinge", id: "partialTwins" },
  { icon: faMap, text: "Kartenebenen", id: "mapLayers" },
  { icon: faMapPin, text: "Sensoren", id: "sensors" },
  { icon: faSearch, text: "Suchergebnisse", id: "searchResults" },
];

const additionalConfigUrl =
  "https://wupp-digitaltwin-assets.cismet.de/data/additionalLayerConfig.json";

export const NewLibModal = ({
  open,
  setOpen,
  setAdditionalLayers,
  activeLayers,
  customCategories,
  addFavorite,
  removeFavorite,
  favorites,
  updateActiveLayer,
  removeLastLayer,
  updateFavorite,
  discoverProps,
  setFeatureFlags,
}: LibModalProps) => {
  const [preview, setPreview] = useState(false);
  const [layers, setLayers] = useState<any[]>([]);
  const [allLayers, setAllLayers] = useState<any[]>([]);
  const services = serviceConfig;
  const [searchValue, setSearchValue] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showItems, setShowItems] = useState(false);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [selectedNavItemIndex, setSelectedNavItemIndex] = useState(0);
  const [tmpAllCategories, setTmpAllCategories] = useState<
    {
      id: string;
      categories: LayerCategories[];
    }[]
  >([]);
  const [shownCategories, setShownCategories] = useState<
    {
      id: string;
      categories: LayerCategories[];
    }[]
  >([]);
  const [currentShownCategory, setCurrentShownCategory] = useState(
    shownCategories[0]?.id
  );
  const [discoverItems, setDiscoverItems] = useState<any[]>([]);
  const [additionalConfig, setAdditionalConfig] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [triggerRefetch, setTriggerRefetch] = useState(false);
  const debouncedSearchTerm = useDebounce(searchValue, 300);

  const flags = useFeatureFlags();

  const { jwt, setJWT } = useAuth();

  const fetchDiscoverItems = () => {
    if (discoverProps) {
      setLoadingData(true);
      const { appKey, apiUrl, daqKey } = discoverProps;
      md5ActionFetchDAQ(appKey, apiUrl, jwt || "", daqKey)
        .then((result) => {
          const typedResult = result as DiscoverResult;
          setDiscoverItems(typedResult.data);
          setLoadingData(false);
          setTriggerRefetch(false);
        })
        .catch((e) => {
          if (e.status === 401) {
            setJWT("");
          }
          console.error("Error fetching gp_entdecken: ", e);
        });
    }
  };

  const fetchAdditionalConfig = () => {
    fetch(additionalConfigUrl)
      .then((response) => response.json())
      .then((data) => {
        data.forEach((config) => {
          config.layers.forEach((layer) => {
            if (layer.ff as string) {
              setFeatureFlags?.({
                [layer.ff]: {
                  default: false,
                  alias: layer.ff,
                },
              });
            }
          });
        });
        setAdditionalConfig(data);
      })
      .catch((error) => {
        console.error("Error fetching additional config:", error);
      });
  };

  useEffect(() => {
    if (open || triggerRefetch) {
      fetchDiscoverItems();
      fetchAdditionalConfig();
    }
  }, [open, triggerRefetch, jwt]);

  const getNumOfCustomLayers = () => {
    return customCategories.reduce((acc, category) => {
      return acc + category.layers.length;
    }, 0);
  };

  const search = (value: string) => {
    setIsSearching(true);
    if (value) {
      const results = fuse.search(value);

      const copiedCategories = JSON.parse(JSON.stringify(tmpAllCategories));

      const categoriesWithResults = copiedCategories.map((category) => {
        category.categories.map((tmp) => {
          const newLayers: any[] = [];
          results.forEach((result) => {
            const resultItem = result.item;

            if (tmp.id === resultItem.serviceName && tmp.id) {
              newLayers.push({
                ...resultItem,
              });
            }
          });

          tmp.layers = newLayers;

          return tmp;
        });

        return category;
      });

      const selectedCategoryId = sidebarElements[selectedNavItemIndex].id;
      let categoryContainsResults = false;
      categoriesWithResults.forEach((category) => {
        if (category.id === selectedCategoryId) {
          let subCats = category.categories;
          let numOfResults = 0;
          subCats.forEach((subCat) => {
            numOfResults = numOfResults + subCat.layers.length;
          });

          if (numOfResults > 0) {
            categoryContainsResults = true;
          }
        }
      });

      // select first category with results
      if (!categoryContainsResults) {
        let firstCategoryId = "";

        categoriesWithResults.forEach((category) => {
          let subCats = category.categories;
          let numOfResults = 0;
          subCats.forEach((subCat) => {
            numOfResults = numOfResults + subCat.layers.length;
          });
          if (numOfResults > 0) {
            firstCategoryId = category.id;
            return;
          }
        });

        if (firstCategoryId) {
          const categoryIndex = sidebarElements.findIndex(
            (element) => element.id === firstCategoryId
          );

          if (categoryIndex > -1) {
            setSelectedNavItemIndex(categoryIndex);
          }
        }
      }

      setShownCategories(categoriesWithResults);
    } else {
      if (tmpAllCategories.length > 0) {
        setShownCategories(tmpAllCategories);
      }
    }
    setIsSearching(false);
  };

  const flattenedLayers = tmpAllCategories.flatMap((obj) =>
    obj.categories.flatMap((obj) => obj.layers)
  );
  const fuse = new Fuse(flattenedLayers, {
    keys: [
      { name: "title", weight: 2 },
      { name: "description", weight: 1 },
      { name: "keywords", weight: 1 },
      { name: "tags", weight: 1 },
    ],
    shouldSort: false,
    includeMatches: true,
    useExtendedSearch: true,
    ignoreLocation: true,
    threshold: 0.1,
  });

  const getDataFromJson = (data: any) => {
    const flattenedLayers: any[] = [];
    const rootLayer = data.Capability.Layer;
    const getUrl =
      data.Capability.Request.GetMap.DCPType[0].HTTP.Get.OnlineResource;
    flattenedLayers.push(flattenLayer(rootLayer, [], getUrl));

    const tmpLayer = flattenedLayers[0].layers.map((layer) => {
      return wmsLayerToGenericItem(layer, "custom");
    });

    return [
      {
        Title: "Externe Dienste",
        layers: tmpLayer,
      },
    ];
  };

  const getNumberOfLayers = (layerCategories: LayerCategories[]) => {
    let numberOfLayers = 0;
    layerCategories?.forEach((category) => {
      numberOfLayers += category?.layers?.length;
    });
    return numberOfLayers;
  };

  useEffect(() => {
    let newLayers: any[] = [];
    for (let key in services) {
      if (services[key].url) {
        fetch(
          `${services[key].url}?service=WMS&request=GetCapabilities&version=1.1.1`
        )
          .then((response) => {
            return response.text();
          })
          .then((text) => {
            const result = parser.toJSON(text);
            if (result) {
              if (config) {
                const tmpLayer = getLayerStructure({
                  config,
                  wms: result,
                  serviceName: services[key].name,
                  skipTopicMaps: true,
                });

                tmpLayer.forEach((category) => {
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
                const mergedLayer = mergeStructures(tmpLayer, newLayers);

                newLayers = mergedLayer;
                let tmp: Layer[] = [];
                tmp = newLayers;

                setAllLayers(tmp);
              } else {
                getDataFromJson(result);
              }
            }
          });
      } else {
        if (services[key].type === "topicmaps") {
        } else {
          const tmpLayer = getLayerStructure({
            config,
            serviceName: services[key].name,
            skipTopicMaps: true,
          });
          const mergedLayer = mergeStructures(tmpLayer, newLayers);
          newLayers = mergedLayer;
          let tmp: Layer[] = [];

          tmp = newLayers;
          setLayers(tmp);
          setAllLayers(tmp);
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

    setShownCategories((prev) => {
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

    setTmpAllCategories((prev) => {
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
  }, []);

  useEffect(() => {
    if (discoverItems?.length === 0) {
      return;
    }
    const discoverCategories: {
      Title: string;
      id: string;
      layers: SavedLayerConfig[];
    }[] = [];
    for (let key in discoverConfig) {
      let layers: Item[] = [];
      // discoverCategories.push(discoverConfig[key]);
      const filteredItems = discoverItems?.filter((item) => {
        return JSON.parse(item.config).serviceName === discoverConfig[key].id;
      });
      layers.push(
        ...filteredItems?.map((item) => {
          return {
            ...JSON.parse(item.config),
            id: item.id.toString(),
            isDraft: item.draft ? true : false,
          };
        })
      );

      discoverCategories.push({
        ...discoverConfig[key],
        layers,
      });
    }

    setShownCategories((prev) => {
      if (prev.find((item) => item.id === "discover")) {
        prev.splice(
          prev.findIndex((item) => item.id === "discover"),
          1
        );
      }
      return [...prev, { id: "discover", categories: discoverCategories }];
    });

    setTmpAllCategories((prev) => {
      if (prev.find((item) => item.id === "discover")) {
        prev.splice(
          prev.findIndex((item) => item.id === "discover"),
          1
        );
      }
      return [...prev, { id: "discover", categories: discoverCategories }];
    });
  }, [discoverItems]);

  useEffect(() => {
    if (additionalConfig.length > 0) {
      additionalConfig.forEach((config) => {
        let layers = config.layers
          .filter((layer) => {
            if (layer.ff) {
              const ff = layer.ff as string;
              return flags[ff];
            }
            return true;
          })
          .map((layer) => {
            return {
              ...layer,
              serviceName: config.serviceName || layer.serviceName,
            };
          });

        if (layers.length === 0) {
          return;
        }
        if (config.Title) {
          addItemToCategory(
            "mapLayers",
            { id: config.serviceName, Title: config.Title },
            layers
          );
        } else {
          layers.forEach((layer) => {
            addItemToCategory(
              "mapLayers",
              { id: layer.serviceName, Title: layer.path },
              layer
            );
          });
        }
      });
    }
  }, [additionalConfig, flags]);

  useEffect(() => {
    if (getNumOfCustomLayers() === 0 && selectedNavItemIndex === 0) {
      setSelectedNavItemIndex(3);
    }

    if (customCategories) {
      if (!searchValue) {
        setShownCategories((prev) => {
          if (prev.find((item) => item.id === "favorites")) {
            prev.splice(
              prev.findIndex((item) => item.id === "favorites"),
              1
            );
          }
          return [...prev, { id: "favorites", categories: customCategories }];
        });
      }

      setTmpAllCategories((prev) => {
        if (prev.find((item) => item.id === "favorites")) {
          prev.splice(
            prev.findIndex((item) => item.id === "favorites"),
            1
          );
        }
        return [...prev, { id: "favorites", categories: customCategories }];
      });
    }
  }, [customCategories]);

  useEffect(() => {
    search(debouncedSearchTerm);
  }, [debouncedSearchTerm]);

  const checkIfAllLayersAreLoaded = () => {
    let allLayersLoaded = true;
    if (allLayers.length === 0) {
      allLayersLoaded = false;
    }
    allLayers.forEach((category) => {
      if (category.layers.length === 0) {
        allLayersLoaded = false;
      }
    });
    return allLayersLoaded;
  };

  useEffect(() => {
    setLayers(allLayers);

    if (checkIfAllLayersAreLoaded()) {
      const favoriteLayerCategory = customCategories.filter(
        (category) => category.id === "favoriteLayers"
      );
      if (favoriteLayerCategory.length > 0) {
        const favoriteLayers = favoriteLayerCategory[0].layers;
        favoriteLayers.forEach((layer) => {
          const serviceId = (layer as unknown as any)?.service?.name; // TODO: fix type
          const serviceCategory = allLayers.filter(
            (category) => category.id === serviceId
          );
          if (serviceCategory.length > 0) {
            const serviceLayers = serviceCategory[0].layers;
            const foundLayer = serviceLayers.find(
              (serviceLayer) => serviceLayer.id === layer.id.slice(4)
            );
            if (foundLayer) {
              if (!isEqual(foundLayer, layer)) {
                if (updateFavorite) {
                  updateFavorite(foundLayer);
                }
              }
            }
          }
        });
      }
    }

    allLayers.reverse().forEach((layers) => {
      addItemToCategory(
        "mapLayers",
        { id: layers.id, Title: layers.Title },
        layers.layers
      );
    });

    setTmpAllCategories((prev) => {
      if (prev.find((item) => item.id === "mapLayers")) {
        prev.splice(
          prev.findIndex((item) => item.id === "mapLayers"),
          1
        );
      }
      return [
        ...prev,
        {
          id: "mapLayers",
          categories: allLayers.reverse(),
        },
      ];
    });

    if (searchValue) {
      search(debouncedSearchTerm);
    }
  }, [allLayers]);

  useEffect(() => {
    if (searchValue) {
      search(debouncedSearchTerm);
    }
  }, [tmpAllCategories]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowItems(open);
    }, 225);

    return () => clearTimeout(timer);
  }, [open]);

  const addItemToCategory = (
    categoryId: string,
    subCategory: { id: string; Title: string },
    item: SavedLayerConfig | SavedLayerConfig[]
  ) => {
    setShownCategories((prev) => {
      const newCategories = [...prev];
      const categoryExists = newCategories.find((cat) => cat.id === categoryId);
      if (!categoryExists) {
        newCategories.push({
          id: categoryId,
          categories: [],
        });
      }
      newCategories.map((cat) => {
        if (cat.id === categoryId) {
          let subCats = cat.categories;
          let newSubCat: LayerCategories | undefined = undefined;
          subCats.forEach((subCat) => {
            if (subCat.id === subCategory.id) {
              newSubCat = subCat;
              if (Array.isArray(item)) {
                newSubCat.layers.push(...item);
              } else {
                newSubCat.layers.push(item);
              }
              newSubCat.layers = newSubCat.layers.filter(
                (layer, index) =>
                  newSubCat?.layers.findIndex((l) => l.id === layer.id) ===
                  index
              );
            }
          });
          if (!newSubCat) {
            if (Array.isArray(item)) {
              cat.categories.unshift({
                id: subCategory.id,
                Title: subCategory.Title,
                layers: item,
              });
            } else {
              cat.categories.unshift({
                id: subCategory.id,
                Title: subCategory.Title,
                layers: [item],
              });
            }

            cat.categories = cat.categories.filter(
              (layer, index) =>
                cat?.categories.findIndex((l) => l.id === layer.id) === index
            );
          } else {
            return newSubCat;
          }
        }
      });
      return newCategories;
    });
  };

  useEffect(() => {
    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      setOpen(true);
      setSelectedNavItemIndex(3);
      const url = event.dataTransfer?.getData("URL");

      const file = event?.dataTransfer?.files[0];

      if (url && url.endsWith("style.json")) {
        const newItem = {
          description: "",
          id: `custom:${url}`,
          layerType: "vector",
          title: url.slice(0, -5),
          serviceName: "custom",
          type: "layer",
          keywords: [`carmaConf://vectorStyle:${url}`],
          path: "Externe Dienste",
        };

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
  }, []);

  useEffect(() => {
    if (shownCategories) {
      let firstIdWithItems = "";

      const gridItemIDs = categoriesToShownLayers(
        shownCategories,
        sidebarElements[selectedNavItemIndex].id
      )?.map((category) => {
        if (category.layers.length > 0) {
          return category.Title;
        }
      });

      gridItemIDs?.forEach((id) => {
        if (id && !firstIdWithItems) {
          firstIdWithItems = id;
        }
      });

      setCurrentShownCategory(firstIdWithItems);
    }

    const handleScroll = (event) => {
      let firstIdWithItems = "";
      const scrollTop = event.target.scrollTop;

      const gridItemIDs = categoriesToShownLayers(
        shownCategories,
        sidebarElements[selectedNavItemIndex].id
      ).map((category) => {
        if (category.layers.length > 0) {
          return category.Title;
        }
      });

      let items: HTMLElement[] = [];

      gridItemIDs.forEach((id) => {
        const item = document.getElementById(id);
        if (item) {
          items.push(item);
          if (!firstIdWithItems) {
            firstIdWithItems = id;
          }
        }
      });

      let currentItemId = "";
      let currentItemHeight = 0;
      items.forEach((item) => {
        if (item.getBoundingClientRect().top + 200 < window.innerHeight) {
          if (currentItemId) {
            if (item.getBoundingClientRect().top > currentItemHeight) {
              currentItemId = item.id;
              currentItemHeight = item.getBoundingClientRect().top;
            }
          } else {
            currentItemId = item.id;
            currentItemHeight = item.getBoundingClientRect().top;
          }
        }
      });
      if (scrollTop > 0) {
        setCurrentShownCategory(currentItemId);
      } else {
        setCurrentShownCategory(firstIdWithItems);
      }
    };

    const scrollContainer = document.getElementById("scrollContainer");
    scrollContainer?.addEventListener("scroll", handleScroll);

    return () => {
      scrollContainer?.removeEventListener("scroll", handleScroll);
    };
  }, [shownCategories, selectedNavItemIndex, debouncedSearchTerm]);

  const categoriesToShownLayers = (categories, shownId) => {
    if (shownId === "searchResults") {
      if (searchValue) {
        const searchCategories = sidebarElements.map((element) => {
          const matchingCategory = categories.find(
            (category) => category.id === element.id
          );
          const elementLayers =
            matchingCategory?.categories.map((cat) => cat.layers).flat() || [];

          return {
            Title: element.text,
            id: element.id,
            layers: elementLayers,
          };
        });

        return searchCategories.filter((cat) => cat.id !== "searchResults");
      } else {
        return null;
      }
    }

    return categories.filter((category) => category.id === shownId)?.[0]
      ?.categories;
  };

  return (
    <Modal
      open={open}
      classNames={{
        content: "modal-content",
      }}
      onCancel={() => {
        if (preview) {
          setPreview(false);
          if (removeLastLayer) {
            removeLastLayer();
          }
        } else {
          setOpen(false);
        }
      }}
      style={{
        top: preview ? "84%" : undefined,
        transition: "top 400ms linear",
      }}
      mask={!preview}
      footer={<></>}
      width={"100%"}
      closeIcon={false}
      wrapClassName="h-full !overflow-y-hidden"
      className="h-[88%]"
      styles={{
        content: {
          backgroundColor: "#f2f2f2",
        },
      }}
    >
      <div
        className="w-full h-full flex bg-[#f2f2f2]"
        style={{
          maxHeight: "calc(100vh - 200px)",
          minHeight: "calc(100vh - 200px)",
        }}
      >
        <div
          className={`sm:w-40 w-16 h-full flex justify-between items-center flex-col pb-3 bg-gray-600`}
          style={{ height: "calc(100vh - 188px)" }}
        >
          <div className="flex flex-col w-full items-center gap-2 overflow-y-auto overflow-x-hidden">
            <div className="h-8 sm:h-24"></div>
            {sidebarElements.map((element, i) => {
              return (
                <SidebarItem
                  icon={element.icon}
                  text={element.text}
                  active={i === selectedNavItemIndex}
                  onClick={() => {
                    setSelectedNavItemIndex(i);
                  }}
                  key={element.id}
                  numberOfItems={
                    isSearching || !searchValue
                      ? 0
                      : getNumberOfLayers(
                          categoriesToShownLayers(shownCategories, element.id)
                        )
                  }
                  showNumberOfItems={!!searchValue && !!debouncedSearchTerm}
                  disabled={i === sidebarElements.length - 1 && !searchValue}
                />
              );
            })}
          </div>
        </div>

        <div
          className="sm:w-[calc(100vw-160px)] w-[calc(100vw-56px)] h-full flex flex-col bg-[#f2f2f2]"
          style={{
            maxHeight: "calc(100vh - 200px)",
            minHeight: "calc(100vh - 200px)",
          }}
        >
          <div className="sticky top-0 px-6 pt-6">
            <div className="flex flex-col sm:flex-row justify-between md:gap-0 gap-1 items-center">
              <div className="flex w-full sm:w-fit items-center justify-between">
                <h1 className="mb-0 text-3xl font-semibold">Karteninhalte</h1>
                <Button
                  type="text"
                  className="sm:hidden block"
                  onClick={() => {
                    setOpen(false);
                    setPreview(false);
                    setSelectedLayerId(null);
                  }}
                >
                  <FontAwesomeIcon icon={faX} />
                </Button>
              </div>
              <Search
                placeholder="Suchbegriff eingeben"
                className="w-full sm:w-[76%]"
                allowClear
                onChange={(e) => {
                  setIsSearching(true);
                  setSearchValue(e.target.value);

                  const searchResultsIndex = sidebarElements.findIndex(
                    (item) => item.id === "searchResults"
                  );

                  if (
                    selectedNavItemIndex === searchResultsIndex &&
                    !e.target.value
                  ) {
                    setSelectedNavItemIndex(0);
                  }
                }}
                loading={isSearching}
                onSearch={(value) => {
                  search(value);

                  const searchResultsIndex = sidebarElements.findIndex(
                    (item) => item.id === "searchResults"
                  );

                  if (value !== "") {
                    setSelectedNavItemIndex(searchResultsIndex);
                  }
                }}
              />
              <Button
                type="text"
                className="hidden sm:block"
                onClick={() => {
                  setOpen(false);
                  setPreview(false);
                  setSelectedLayerId(null);
                }}
              >
                <FontAwesomeIcon icon={faX} />
              </Button>
            </div>
            <div className="flex w-full gap-2">
              {layers && layers.length > 0 && (
                <>
                  <LayerTabs
                    layers={categoriesToShownLayers(
                      shownCategories,
                      sidebarElements[selectedNavItemIndex].id
                    )}
                    activeId={currentShownCategory}
                    setActiveId={setCurrentShownCategory}
                    numberOfItems={getNumberOfLayers(layers)}
                  />
                  <hr className="h-px bg-gray-300 border-0 mt-0 mb-2" />
                </>
              )}
            </div>
          </div>
          <div
            className="flex w-full gap-4 h-full overflow-auto pt-0.5 px-6"
            id="scrollContainer"
          >
            {!showItems && open && (
              <div className="h-full w-full flex items-center justify-center">
                <div className="grid xl:grid-cols-5 lg:grid-cols-4 sm:grid-cols-2 w-full gap-8 mb-4 px-6 pt-4">
                  {[...Array(10)].map((_, i) => (
                    <div
                      key={i}
                      className="bg-white rounded-lg shadow-sm h-80 w-full flex flex-col gap-2 animate-pulse"
                    >
                      <div className="h-40 p-2 w-full bg-slate-200 rounded-t-lg"></div>
                      <div className="h-2 bg-slate-200 rounded mx-8 w-1/3"></div>
                      <div className="h-20 bg-slate-200 rounded mx-8"></div>
                      <div className="mx-8 flex items-center gap-2">
                        <div className="h-2 bg-slate-200 rounded w-full"></div>
                        <span className="text-slate-200"> · </span>
                        <div className="h-2 bg-slate-200 rounded w-full"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              {showItems && (
                <ItemGrid
                  categories={categoriesToShownLayers(
                    shownCategories,
                    sidebarElements[selectedNavItemIndex].id
                  )}
                  setAdditionalLayers={setAdditionalLayers}
                  activeLayers={activeLayers}
                  favorites={favorites}
                  addFavorite={addFavorite}
                  removeFavorite={removeFavorite}
                  selectedLayerId={selectedLayerId}
                  setSelectedLayerId={setSelectedLayerId}
                  setPreview={setPreview}
                  isSearch={selectedNavItemIndex === 5}
                  setTriggerRefetch={setTriggerRefetch}
                  loadingData={loadingData}
                  discoverProps={discoverProps}
                />
              )}

              {layers &&
                getNumberOfLayers(layers) === 0 &&
                selectedNavItemIndex === 3 && (
                  <h1 className="text-2xl font-normal">
                    Keine Ressourcen gefunden
                  </h1>
                )}
              {selectedNavItemIndex !== 2 &&
                selectedNavItemIndex !== 3 &&
                selectedNavItemIndex !== 1 &&
                selectedNavItemIndex !== 0 &&
                selectedNavItemIndex !== 5 && (
                  <h1 className="text-2xl font-normal">
                    Kategorie noch nicht implementiert
                  </h1>
                )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default NewLibModal;
