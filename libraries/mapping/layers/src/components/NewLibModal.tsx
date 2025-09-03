/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { isEqual } from "lodash";
import { useHandleDrop } from "../hooks/useHandleDrop";

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
} from "@carma-appframeworks/portals";

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
import { md5ActionFetchDAQ } from "@carma-commons/utils";
import ItemSkeleton from "./ItemSkeleton";
import {
  addloadingCapabilitiesIDs,
  addReplaceLayers,
  removeloadingCapabilitiesIDs,
  setLoadingCapabilities,
  setSelectedLayer,
} from "../slices/mapLayers";
import { useDispatch, useSelector } from "react-redux";
import type { Store } from "redux";
import { getTriggerRefetch, setTriggerRefetch } from "../slices/ui";

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
  store: Store;
  unauthorizedCallback?: () => void;
}

const sidebarElements = [
  { icon: faStar, text: "Favoriten", id: "favorites" },
  { icon: faList, text: "Entdecken", id: "discover" },
  { icon: faBook, text: "Teilzwillinge", id: "partialTwins" },
  { icon: faMap, text: "Kartenebenen", id: "mapLayers" },
  { icon: faMapPin, text: "Sensoren", id: "sensors", disabled: true },
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
  store,
  unauthorizedCallback,
}: LibModalProps) => {
  const [preview, setPreview] = useState(false);
  const [layers, setLayers] = useState<any[]>([]);
  const [allLayers, setAllLayers] = useState<any[]>([]);
  const services = serviceConfig;
  const [searchValue, setSearchValue] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showItems, setShowItems] = useState(false);
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
  const [loadingAdditionalConfig, setLoadingAdditionalConfig] = useState(true);
  const debouncedSearchTerm = useDebounce(searchValue, 300);

  const triggerRefetch = useSelector(getTriggerRefetch);
  const dispatch = useDispatch();

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
          dispatch(setTriggerRefetch(false));
        })
        .catch((e) => {
          if (e.status === 401) {
            unauthorizedCallback?.();
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
        setLoadingAdditionalConfig(false);
        console.error("Error fetching additional config:", error);
      });
  };

  useEffect(() => {
    if (open || triggerRefetch) {
      fetchDiscoverItems();
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

  const addItemToCategory = (
    categoryId: string,
    subCategory: { id: string; Title: string },
    item: SavedLayerConfig | SavedLayerConfig[]
  ) => {
    const createNewCategories = (prev) => {
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
              if (newSubCat) {
                if (Array.isArray(item)) {
                  newSubCat.layers.unshift(...item);
                } else {
                  newSubCat.layers.unshift(item);
                }
                newSubCat.layers = newSubCat.layers.filter(
                  (layer, index) =>
                    newSubCat?.layers.findIndex((l) => l.id === layer.id) ===
                    index
                );
              }
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
    };

    setShownCategories(createNewCategories);
    setTmpAllCategories(createNewCategories);
  };

  useHandleDrop({
    setOpen,
    setSelectedNavItemIndex,
    addItemToCategory,
    getDataFromJson,
  });

  useEffect(() => {
    fetchAdditionalConfig();
  }, []);

  useEffect(() => {
    const loadCapabilites = async () => {
      let newLayers: any[] = [];
      dispatch(setLoadingCapabilities(true));
      for (let key in services) {
        if (services[key].url) {
          dispatch(addloadingCapabilitiesIDs(services[key].name));
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
                  const tmpLayer = getLayerStructure({
                    config,
                    wms: result,
                    serviceName: services[key].name,
                    skipTopicMaps: true,
                    store: store,
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
            const tmpLayer = getLayerStructure({
              config,
              serviceName: services[key].name,
              skipTopicMaps: true,
              store,
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
    };

    if (!loadingAdditionalConfig) {
      loadCapabilites();
    }
  }, [loadingAdditionalConfig]);

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
      additionalConfig.forEach((config, i) => {
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
            if (layer.replaceId) {
              dispatch(addReplaceLayers(layer));
            } else {
              addItemToCategory(
                "mapLayers",
                { id: layer.serviceName, Title: layer.path },
                layer
              );
            }
          });
        }

        if (i === additionalConfig.length - 1) {
          setLoadingAdditionalConfig(false);
        }
      });
    } else {
      setLoadingAdditionalConfig(false);
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
                  disabled={
                    (i === sidebarElements.length - 1 && !searchValue) ||
                    element.disabled
                  }
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
                    dispatch(setSelectedLayer(null));
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
                  dispatch(setSelectedLayer(null));
                }}
              >
                <FontAwesomeIcon icon={faX} />
              </Button>
            </div>
            <div className="flex w-full gap-2">
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
            </div>
          </div>
          <div
            className="w-full gap-4 h-full overflow-auto pt-0.5 px-6"
            id="scrollContainer"
          >
            {!showItems && open && (
              <div className="w-full">
                <div className="pt-2 grid xl:grid-cols-7 grid-flow-dense lg:grid-cols-5 sm:grid-cols-3 min-[490px]:grid-cols-2 gap-8 mb-4">
                  {[...Array(10)].map((_, i) => (
                    <ItemSkeleton key={`itemSkeleton_${i}`} />
                  ))}
                </div>
              </div>
            )}

            <div className="w-full">
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
                  setPreview={setPreview}
                  isSearch={selectedNavItemIndex === 5}
                  loadingData={loadingData}
                  currentCategoryIndex={selectedNavItemIndex}
                  discoverProps={discoverProps}
                />
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
