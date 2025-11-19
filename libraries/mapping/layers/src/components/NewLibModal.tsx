/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { isEqual } from "lodash";
import { useHandleDrop } from "../hooks/useHandleDrop";
import { useAdditionalConfig } from "../hooks/useAdditionalConfig";
import { useLoadCapabilities } from "../hooks/useLoadCapabilities";

import {
  faBook,
  faList,
  faMap,
  faMapPin,
  faSearch,
  faStar,
  faX,
  IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useDebounce } from "@uidotdev/usehooks";
import { Button, Input, Modal } from "antd";
import Fuse from "fuse.js";
import type {
  BackgroundLayer,
  Item,
  Layer,
  SavedLayerConfig,
} from "@carma/types";
import { utils } from "@carma-appframeworks/portals";
import { useAuth } from "@carma-providers/auth";
import {
  useFeatureFlags,
  type FeatureFlagConfig,
} from "@carma-providers/feature-flag";

import { flattenLayer, wmsLayerToGenericItem } from "../helper/layerHelper";
import LayerTabs from "./LayerTabs";
import { SidebarItem } from "./SidebarItems";

import ItemGrid from "./ItemGrid";
import { discoverConfig } from "../helper/discover";

import "./input.css";
import "./modal.css";
import { md5ActionFetchDAQ, md5FetchJSON } from "@carma-commons/utils";
import ItemSkeleton from "./ItemSkeleton";
import {
  addReplaceLayers,
  setSelectedLayer,
  getAllLayers,
} from "../slices/mapLayers";
import { useDispatch, useSelector } from "react-redux";
import type { Store } from "redux";
import { getTriggerRefetch, setTriggerRefetch } from "../slices/ui";

const { Search } = Input;

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

export type ActiveLayers = [BackgroundLayer, ...Layer[]];

export interface LibModalProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  setAdditionalLayers: any;
  favorites?: Item[];
  addFavorite: (layer: Item) => void;
  removeFavorite: (layer: Item) => void;
  updateFavorite?: (layer: Item) => void;
  activeLayers: ActiveLayers;
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
  const [sidebarElements, setSidebarElements] = useState<
    {
      icon: IconDefinition;
      text: string;
      id: string;
      disabled?: boolean;
    }[]
  >([
    { icon: faStar, text: "Favoriten", id: "favorites" },
    { icon: faList, text: "Entdecken", id: "discover" },
    { icon: faBook, text: "Teilzwillinge", id: "partialTwins" },
    { icon: faMap, text: "Kartenebenen", id: "mapLayers" },
    { icon: faMapPin, text: "Sensoren", id: "sensors" },
    { icon: faSearch, text: "Suchergebnisse", id: "searchResults" },
  ]);
  const [preview, setPreview] = useState(false);
  const [layers, setLayers] = useState<any[]>([]);
  const allLayers = useSelector(getAllLayers);
  const [searchValue, setSearchValue] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showItems, setShowItems] = useState(false);
  const [selectedNavItemIndex, setSelectedNavItemIndex] = useState(0);
  const [allCategories, setAllCategories] = useState<
    {
      id: string;
      categories: LayerCategories[];
    }[]
  >([]);
  const [filteredCategories, setFilteredCategories] = useState<
    {
      id: string;
      categories: LayerCategories[];
    }[]
  >([]);
  const [currentShownCategory, setCurrentShownCategory] = useState(
    filteredCategories[0]?.id
  );
  const [discoverItems, setDiscoverItems] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(false);
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
        .catch(async (e) => {
          if (!jwt) {
            const result = await md5FetchJSON(
              "gp_entdecken",
              "https://wupp-topicmaps-data.cismet.de/data/gp_entdecken.json"
            );
            setDiscoverItems(result);
          } else if (e.status === 401) {
            unauthorizedCallback?.();
            setJWT("");
          }
          console.error("Error fetching gp_entdecken: ", e);
        });
    }
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

      const copiedCategories = JSON.parse(JSON.stringify(allCategories));

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
      if (selectedCategoryId === "searchResults") {
        categoryContainsResults = true;
      }
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

      setFilteredCategories(categoriesWithResults);
    } else {
      if (allCategories.length > 0) {
        setFilteredCategories(allCategories);
      }
    }
    setIsSearching(false);
  };

  const flattenedLayers = allCategories.flatMap((obj) =>
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

                // Rearrange layers based on insertAfterId property
                const layersWithInsertAfterId = newSubCat.layers.filter(
                  (layer) => (layer as any).insertAfterId
                );

                if (layersWithInsertAfterId.length > 0) {
                  // Remove layers with insertAfterId from their current positions
                  newSubCat.layers = newSubCat.layers.filter(
                    (layer) => !(layer as any).insertAfterId
                  );

                  layersWithInsertAfterId.forEach((layer) => {
                    const insertAfterId = (layer as any).insertAfterId;
                    const targetIndex = newSubCat!.layers.findIndex(
                      (l) => l.id === insertAfterId
                    );

                    if (targetIndex !== -1) {
                      newSubCat.layers.splice(targetIndex + 1, 0, layer);
                    } else {
                      // If id doesnt exist append to the end
                      newSubCat.layers.push(layer);
                    }
                  });
                }
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

    setFilteredCategories(createNewCategories);
    setAllCategories(createNewCategories);
  };

  useHandleDrop({
    setOpen,
    setSelectedNavItemIndex,
    addItemToCategory,
    getDataFromJson,
    activeLayers,
    updateActiveLayer,
  });

  const { loadingAdditionalConfig } = useAdditionalConfig({
    setFeatureFlags,
    addItemToCategory,
    setSidebarElements,
  });

  useLoadCapabilities({
    loadingAdditionalConfig,
    activeLayers,
    updateActiveLayer,
    setLayers,
    setFilteredCategories,
    setAllCategories,
    getDataFromJson,
    store,
  });

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

    setFilteredCategories((prev) => {
      if (prev.find((item) => item.id === "discover")) {
        prev.splice(
          prev.findIndex((item) => item.id === "discover"),
          1
        );
      }
      return [...prev, { id: "discover", categories: discoverCategories }];
    });

    setAllCategories((prev) => {
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
    if (getNumOfCustomLayers() === 0 && selectedNavItemIndex === 0) {
      setSelectedNavItemIndex(3);
    }

    if (customCategories) {
      if (!searchValue) {
        setFilteredCategories((prev) => {
          if (prev.find((item) => item.id === "favorites")) {
            prev.splice(
              prev.findIndex((item) => item.id === "favorites"),
              1
            );
          }
          return [...prev, { id: "favorites", categories: customCategories }];
        });
      }

      setAllCategories((prev) => {
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

    const allLayersCopy = JSON.parse(JSON.stringify(allLayers));
    allLayersCopy.reverse().forEach((layers) => {
      addItemToCategory(
        "mapLayers",
        { id: layers.id, Title: layers.Title },
        layers.layers
      );
    });

    setAllCategories((prev) => {
      const newCategories = [...prev];
      const currentMapLayers = newCategories.find(
        (item) => item.id === "mapLayers"
      )?.categories;

      const mergedCategories = JSON.parse(JSON.stringify(allLayers));

      if (currentMapLayers) {
        currentMapLayers.forEach((currentCategory) => {
          const mergedCategoryIndex = mergedCategories.findIndex(
            (cat) => cat.id === currentCategory.id
          );

          if (mergedCategoryIndex !== -1) {
            // Category exists in allLayers, check for additional layers
            const mergedCategory = mergedCategories[mergedCategoryIndex];

            currentCategory.layers.forEach((currentLayer) => {
              // Check if this layer exists in the merged category
              const layerExists = mergedCategory.layers.some(
                (layer) => layer.id === currentLayer.id
              );

              if (!layerExists) {
                // Add layer that doesn't exist in allLayers
                mergedCategory.layers.push(currentLayer);
              }
            });
          } else {
            // Category doesn't exist in allLayers, add the entire category
            mergedCategories.push(currentCategory);
          }
        });
      }

      const mapLayersIndex = newCategories.findIndex(
        (item) => item.id === "mapLayers"
      );

      if (mapLayersIndex !== -1) {
        newCategories[mapLayersIndex] = {
          id: "mapLayers",
          categories: mergedCategories,
        };
      } else {
        newCategories.push({
          id: "mapLayers",
          categories: mergedCategories,
        });
      }

      return newCategories;
    });

    if (searchValue) {
      search(debouncedSearchTerm);
    }
  }, [allLayers]);

  useEffect(() => {
    if (searchValue) {
      search(debouncedSearchTerm);
    }
  }, [allCategories]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowItems(open);
    }, 225);

    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (filteredCategories) {
      let firstIdWithItems = "";

      const gridItemIDs = categoriesToShownLayers(
        filteredCategories,
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
        filteredCategories,
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
  }, [filteredCategories, selectedNavItemIndex, debouncedSearchTerm]);

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
      wrapClassName="h-full !overflow-y-hidden hide-tabs"
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
                          categoriesToShownLayers(
                            filteredCategories,
                            element.id
                          )
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
                  filteredCategories,
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
                    filteredCategories,
                    sidebarElements[selectedNavItemIndex].id
                  )}
                  setAdditionalLayers={setAdditionalLayers}
                  activeLayers={activeLayers}
                  favorites={favorites}
                  addFavorite={addFavorite}
                  removeFavorite={removeFavorite}
                  setPreview={setPreview}
                  isSearchCategory={selectedNavItemIndex === 5}
                  loadingData={loadingData}
                  currentCategoryIndex={selectedNavItemIndex}
                  discoverProps={discoverProps}
                  currentlySearching={!!debouncedSearchTerm}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default NewLibModal;
