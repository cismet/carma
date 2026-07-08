/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useReducer, useState } from "react";
import { isEqual } from "lodash";
import { useHandleDrop } from "../hooks/useHandleDrop";
import { useAdditionalConfig } from "../hooks/useAdditionalConfig";
import { useLoadCapabilities } from "../hooks/useLoadCapabilities";
import type { LayerCatalogConfig } from "../config/layerCatalogConfig";
import { wuppLayerCatalogConfig } from "../config/layerCatalogConfig";
import {
  LayerCatalogProvider,
  useCatalogData,
  useCatalogSelection,
} from "../context/LayerCatalogProvider";

import {
  faBook,
  faCubes,
  faList,
  faMap,
  faMapPin,
  faSearch,
  faStar,
  faTriangleExclamation,
  faX,
  IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { LoadingOutlined } from "@ant-design/icons";
import { Button, Input, Modal, Spin } from "antd";
import type {
  BackgroundLayer,
  Item,
  Layer,
  SavedLayerConfig,
} from "../lib/contracts/carma-layers.d";
import { useAuth } from "@carma-providers/auth";
import {
  useFeatureFlags,
  type FeatureFlagConfig,
} from "@carma-providers/feature-flag";

import {
  applyCatalogDrop,
  buildCatalog,
  EMPTY_DROPPED_CATALOG,
} from "../helper/buildCatalog";
import LayerTabs from "./LayerTabs";
import { SidebarItem } from "./SidebarItems";

import ItemGrid from "./ItemGrid";
import { fetchDiscoverItems } from "../helper/discover";

import "./input.css";
import "./modal.css";
import ItemSkeleton from "./ItemSkeleton";
import SystemMessageBanner from "./SystemMessageBanner";
import { useQuery } from "@tanstack/react-query";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import {
  findFirstCategoryIdWithResults,
  useCatalogSearch,
  type CatalogSubCategory,
} from "../hooks/useCatalogSearch";

const { Search } = Input;

const elements: {
  icon: IconDefinition;
  text: string;
  id: string;
  disabledIn3D?: boolean;
}[] = [
  { icon: faStar, text: "Favoriten", id: "favorites" },
  { icon: faList, text: "Entdecken", id: "discover", disabledIn3D: true },
  { icon: faBook, text: "Teilzwillinge", id: "partialTwins" },
  { icon: faMap, text: "Kartenebenen", id: "mapLayers", disabledIn3D: true },
  { icon: faMapPin, text: "Sensoren", id: "sensors", disabledIn3D: true },
  { icon: faCubes, text: "Objekte", id: "objects" },
  { icon: faSearch, text: "Suchergebnisse", id: "searchResults" },
];

type LayerCategories = CatalogSubCategory;

export type ActiveLayers = [BackgroundLayer, ...Layer[]];

export interface LayerCatalogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  setAdditionalLayers: any;
  favorites?: Array<Item | SavedLayerConfig>;
  addFavorite: (layer: Item) => void;
  removeFavorite: (layer: Item) => void;
  updateFavorite?: (layer: Item) => void;
  activeLayers: ActiveLayers;
  customCategories: LayerCategories[];
  updateActiveLayer: (layer: Layer) => void;
  removeLastLayer?: () => void;
  setFeatureFlags?: (flags: FeatureFlagConfig) => void;
  unauthorizedCallback?: () => void;
  appKey?: string;
  config?: LayerCatalogConfig;
}

const LayerCatalogView = ({
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
  setFeatureFlags,
  unauthorizedCallback,
  appKey,
  config,
}: LayerCatalogProps) => {
  const catalogConfig = config ?? wuppLayerCatalogConfig;
  const { isCesium } = useMapFrameworkSwitcherContext();
  const [preview, setPreview] = useState(false);
  const { serviceCategories } = useCatalogData();
  const {
    selectItem,
    discoverRefetchRequested,
    markDiscoverRefetchHandled,
  } = useCatalogSelection();
  const [showItems, setShowItems] = useState(false);
  const [selectedNavItemIndex, setSelectedNavItemIndex] = useState(0);
  const [dropped, applyDrop] = useReducer(
    applyCatalogDrop,
    EMPTY_DROPPED_CATALOG
  );
  const [delayedLoading, setDelayedLoading] = useState(false);

  const flags = useFeatureFlags();

  const { jwt, setJWT } = useAuth();

  const discoverProps = catalogConfig.discoverProps;
  const {
    data: discoverItems,
    isFetching: loadingData,
    isError: discoverHasError,
    error: rawDiscoverError,
    refetch: refetchDiscoverItems,
  } = useQuery({
    queryKey: ["discoverItems", discoverProps?.daqKey ?? "", jwt ?? ""],
    queryFn: () => fetchDiscoverItems(discoverProps!, jwt || undefined),
    enabled: !!discoverProps && (open || discoverRefetchRequested),
    retry: false,
  });
  const discoverError = discoverHasError
    ? "Fehler beim Laden der Inhalte"
    : null;

  const { additionalConfig, sensorConfig, objectConfig, loadingAdditionalConfig } =
    useAdditionalConfig({
      setFeatureFlags,
      assetBaseUrl: catalogConfig.assetBaseUrl,
      droppedLayerConfigs: dropped.layerConfigs,
    });

  useLoadCapabilities({
    loadingAdditionalConfig,
    activeLayers,
    updateActiveLayer,
    services: catalogConfig.services,
  });

  // The complete category tree is a pure derivation over all sources; every
  // source change (fetch result, drop, feature flag, custom categories)
  // triggers exactly one recompute instead of cascading state writes.
  const allCategories = useMemo(
    () =>
      buildCatalog(
        {
          serviceCategories,
          additionalConfig,
          sensorConfig,
          objectConfig,
          discoverItems,
          dropped,
        },
        { featureFlags: flags, customCategories }
      ),
    [
      serviceCategories,
      additionalConfig,
      sensorConfig,
      objectConfig,
      discoverItems,
      dropped,
      flags,
      customCategories,
    ]
  );

  const sidebarElements = useMemo(() => {
    const categoryHasItems = (id: string) =>
      allCategories
        .find((category) => category.id === id)
        ?.categories.some((subCategory) => subCategory.layers.length > 0) ??
      false;
    return elements.map((element) => ({
      ...element,
      disabled:
        (!!element.disabledIn3D && isCesium) ||
        ((element.id === "sensors" || element.id === "objects") &&
          !categoryHasItems(element.id)),
    }));
  }, [allCategories, isCesium]);

  const disabledCategoryIds = useMemo(
    () =>
      new Set(
        sidebarElements
          .filter((element) => element.disabled)
          .map((element) => element.id)
      ),
    [sidebarElements]
  );
  const {
    searchValue,
    setSearchValue,
    debouncedSearchTerm,
    isSearching,
    filteredCategories,
  } = useCatalogSearch({ allCategories, disabledCategoryIds });
  const [currentShownCategory, setCurrentShownCategory] = useState(
    filteredCategories[0]?.id
  );

  useEffect(() => {
    const error = rawDiscoverError as (Error & { status?: number }) | null;
    if (!error) {
      return;
    }
    if (jwt && error.status === 401) {
      unauthorizedCallback?.();
      setJWT("");
    }
    console.error("Error fetching gp_entdecken: ", error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawDiscoverError]);

  useEffect(() => {
    if (discoverRefetchRequested) {
      refetchDiscoverItems().finally(() => {
        markDiscoverRefetchHandled();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discoverRefetchRequested]);

  useEffect(() => {
    if (!loadingData) {
      setDelayedLoading(false);
      return;
    }
    const timer = setTimeout(() => setDelayedLoading(true), 750);
    return () => clearTimeout(timer);
  }, [loadingData]);

  // when the selected sidebar entry becomes disabled (3D switch, category
  // emptied), move the selection to the first sensible entry
  useEffect(() => {
    const currentElement = sidebarElements[selectedNavItemIndex];
    if (!currentElement?.disabled) {
      return;
    }
    const firstValidIndex = sidebarElements.findIndex((element) => {
      if (element.disabled) return false;
      const categoryData = filteredCategories.find(
        (cat) => cat.id === element.id
      );
      if (!categoryData) return false;
      return categoryData.categories.some(
        (subCat) => subCat.layers?.length > 0
      );
    });

    if (firstValidIndex !== -1) {
      setSelectedNavItemIndex(firstValidIndex);
    } else {
      const firstNonDisabled = sidebarElements.findIndex(
        (element) => !element.disabled
      );
      if (firstNonDisabled !== -1) {
        setSelectedNavItemIndex(firstNonDisabled);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarElements]);

  const getNumOfCustomLayers = () => {
    return customCategories.reduce((acc, category) => {
      return acc + category.layers.length;
    }, 0);
  };

  useEffect(() => {
    if (!debouncedSearchTerm) {
      return;
    }
    const selectedCategoryId = sidebarElements[selectedNavItemIndex].id;
    if (selectedCategoryId === "searchResults") {
      return;
    }
    const selectedCategoryHasResults = filteredCategories.some(
      (category) =>
        category.id === selectedCategoryId &&
        category.categories.some((subCategory) => subCategory.layers.length > 0)
    );
    if (selectedCategoryHasResults) {
      return;
    }
    const firstCategoryId = findFirstCategoryIdWithResults(filteredCategories);
    if (firstCategoryId) {
      const categoryIndex = sidebarElements.findIndex(
        (element) => element.id === firstCategoryId
      );
      if (categoryIndex > -1) {
        setSelectedNavItemIndex(categoryIndex);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchTerm, filteredCategories]);

  const getNumberOfLayers = (layerCategories: LayerCategories[]) => {
    let numberOfLayers = 0;
    layerCategories?.forEach((category) => {
      numberOfLayers += category?.layers?.length;
    });
    return numberOfLayers;
  };

  useHandleDrop({
    setOpen,
    setSelectedNavItemIndex,
    onDrop: applyDrop,
    activeLayers,
    updateActiveLayer,
    setAdditionalLayers,
    vectorTileServerUrl: catalogConfig.vectorTileServerUrl,
  });

  // start on the map layers tab as long as there is nothing in the favorites
  useEffect(() => {
    if (
      getNumOfCustomLayers() === 0 &&
      selectedNavItemIndex === 0 &&
      !isCesium
    ) {
      setSelectedNavItemIndex(3);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customCategories]);

  const checkIfAllLayersAreLoaded = () => {
    let allLayersLoaded = true;
    if (serviceCategories.length === 0) {
      allLayersLoaded = false;
    }
    serviceCategories.forEach((category) => {
      if (category.layers.length === 0) {
        allLayersLoaded = false;
      }
    });
    return allLayersLoaded;
  };

  // reconcile stored favorites with the freshly derived layer definitions
  useEffect(() => {
    if (!checkIfAllLayersAreLoaded()) {
      return;
    }
    const favoriteLayerCategory = customCategories.filter(
      (category) => category.id === "favoriteLayers"
    );
    if (favoriteLayerCategory.length > 0) {
      const favoriteLayers = favoriteLayerCategory[0].layers;
      favoriteLayers.forEach((layer) => {
        const serviceId = (layer as unknown as any)?.service?.name; // TODO: fix type
        const serviceCategory = serviceCategories.filter(
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceCategories]);

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

    const subCategories = categories.filter(
      (mainCategory) => mainCategory.id === shownId
    )?.[0]?.categories;
    return subCategories?.filter(
      (subCategory) =>
        !(subCategory.hideWhenEmpty && subCategory.layers.length === 0)
    );
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
                <div className="flex items-center gap-3">
                  <h1 className="mb-0 text-3xl font-semibold">Karteninhalte</h1>
                  {sidebarElements[selectedNavItemIndex].id === "discover" &&
                    (discoverError || delayedLoading) &&
                    (discoverError ? (
                      <FontAwesomeIcon
                        icon={faTriangleExclamation}
                        className="text-red-500"
                        title={discoverError || "Fehler beim Laden der Karten"}
                        role="status"
                        aria-label={
                          discoverError || "Fehler beim Laden der Karten"
                        }
                      />
                    ) : (
                      filteredCategories
                        .find((cat) => cat.id === "discover")
                        ?.categories.some(
                          (subCat) => subCat.layers?.length > 0
                        ) && (
                        <Spin
                          indicator={
                            <LoadingOutlined spin className="text-gray-600" />
                          }
                          size="small"
                          aria-label="Anfrage dauert länger als erwartet"
                        />
                      )
                    ))}
                </div>
                <Button
                  type="text"
                  className="sm:hidden block"
                  onClick={() => {
                    setOpen(false);
                    setPreview(false);
                    selectItem(null);
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
                  selectItem(null);
                }}
              >
                <FontAwesomeIcon icon={faX} />
              </Button>
            </div>
            <SystemMessageBanner
              appKey={appKey}
              slot="karteninhalte"
              className="-mx-6 mt-2"
            />
            <div className="flex w-full gap-2">
              <LayerTabs
                layers={categoriesToShownLayers(
                  filteredCategories,
                  sidebarElements[selectedNavItemIndex].id
                )}
                activeId={currentShownCategory}
                setActiveId={setCurrentShownCategory}
                numberOfItems={getNumberOfLayers(serviceCategories)}
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
                  isSearchCategory={
                    sidebarElements[selectedNavItemIndex].id === "searchResults"
                  }
                  isDiscoverCategory={
                    sidebarElements[selectedNavItemIndex].id === "discover"
                  }
                  loadingData={loadingData}
                  currentCategoryIndex={selectedNavItemIndex}
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

export const LayerCatalog = (props: LayerCatalogProps) => (
  <LayerCatalogProvider config={props.config}>
    <LayerCatalogView {...props} />
  </LayerCatalogProvider>
);

export default LayerCatalog;
