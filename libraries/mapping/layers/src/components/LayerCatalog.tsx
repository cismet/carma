import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { faTriangleExclamation, faX } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { LoadingOutlined } from "@ant-design/icons";
import { Button, Spin, type InputRef } from "antd";

import { useAuth } from "@carma-providers/auth";
import { useDeployment } from "@carma-commons/utils";
import {
  useFeatureFlags,
  type FeatureFlagConfig,
} from "@carma-providers/feature-flag";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";

import type {
  ActiveLayers,
  Item,
  Layer,
  SavedLayerConfig,
  SetAdditionalLayers,
} from "../lib/contracts/carma-layers.d";
import type { LayerCatalogConfig } from "../config/layerCatalogConfig";
import { useLayerCatalogConfig } from "../config/LayerCatalogConfigContext";
import {
  LayerCatalogProvider,
  useCatalogData,
  useCatalogSelectionActions,
  useCategoryDefinitions,
  useDiscoverRefetch,
  useIsInsideLayerCatalogProvider,
  useLayerCatalog,
} from "../context/LayerCatalogProvider";
import {
  CatalogInteractionProvider,
  type CatalogInteractionContextValue,
} from "../context/CatalogInteractionContext";
import {
  resolveCustomCategories,
  type CustomCategoryDefinition,
} from "../config/categoryDefinitions";
import {
  applyCatalogDrop,
  buildCatalog,
  EMPTY_DROPPED_CATALOG,
  getDroppedItemIds,
} from "../helper/buildCatalog";
import { fetchDiscoverItems } from "../helper/discover";
import {
  countCategoryLayers,
  getShownCategories,
  mainCategoryHasResults,
} from "../helper/categoryDisplay";
import {
  findFirstCategoryIdWithResults,
  useCatalogSearch,
} from "../hooks/useCatalogSearch";
import { filterCategoriesByFilters } from "../helper/catalogFilter";
import { useAdditionalConfig } from "../hooks/useAdditionalConfig";
import { useLoadCapabilities } from "../hooks/useLoadCapabilities";
import { useSyncActiveLayers } from "../hooks/useSyncActiveLayers";
import { useHandleDrop } from "../hooks/useHandleDrop";
import { useScrollSpy } from "../hooks/useScrollSpy";

import ModalShell from "./ModalShell";
import CategorySidebar, { type SidebarEntry } from "./CategorySidebar";
import CatalogSearch from "./CatalogSearch";
import CategoryTabs from "./CategoryTabs";
import CatalogGrid from "./CatalogGrid";
import ItemSkeleton from "./ItemSkeleton";
import SystemMessageBanner from "./SystemMessageBanner";

export interface LayerCatalogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  setAdditionalLayers: SetAdditionalLayers;
  /** host-owned saved collections, shown as favorited alongside the items */
  savedCollections?: SavedLayerConfig[];
  onAddCollection?: (layer: Item) => void;
  onRemoveCollection?: (layer: Item) => void;
  activeLayers: ActiveLayers;
  /**
   * app-specific subcategories in addition to the registry defaults
   * (`subCategories` of the category definitions); same id overrides a default
   */
  customCategories?: CustomCategoryDefinition[];
  updateActiveLayer: (layer: Layer) => void;
  removeLastLayer?: () => void;
  setFeatureFlags?: (flags: FeatureFlagConfig) => void;
  unauthorizedCallback?: () => void;
  appKey?: string;
  /** only used when no LayerCatalogProvider is mounted above */
  config?: LayerCatalogConfig;
}

const LayerCatalogView = ({
  open,
  setOpen,
  setAdditionalLayers,
  activeLayers,
  customCategories,
  savedCollections,
  onAddCollection,
  onRemoveCollection,
  updateActiveLayer,
  removeLastLayer,
  setFeatureFlags,
  unauthorizedCallback,
  appKey,
}: LayerCatalogProps) => {
  const catalogConfig = useLayerCatalogConfig();
  const categoryDefinitions = useCategoryDefinitions();
  const { isCesium } = useMapFrameworkSwitcherContext();
  const [preview, setPreview] = useState(false);
  const { serviceCategories, loadingCapabilities } = useCatalogData();
  const { selectItem } = useCatalogSelectionActions();
  const { discoverRefetchRequested, markDiscoverRefetchHandled } =
    useDiscoverRefetch();
  const { favorites, addFavorite, removeFavorite } = useLayerCatalog();

  // collections stay host-owned (saved layer configs); everything else goes
  // through the provider favorites
  const displayedFavorites = useMemo<Array<Item | SavedLayerConfig>>(
    () => [...favorites, ...(savedCollections ?? [])],
    [favorites, savedCollections]
  );
  const handleAddFavorite = useCallback(
    (layer: Item) => {
      if (layer.type === "collection") {
        onAddCollection?.(layer);
      } else {
        addFavorite(layer);
      }
    },
    [onAddCollection, addFavorite]
  );
  const handleRemoveFavorite = useCallback(
    (layer: Item) => {
      if (layer.type === "collection") {
        onRemoveCollection?.(layer);
      } else {
        removeFavorite(layer);
      }
    },
    [onRemoveCollection, removeFavorite]
  );

  // registry-default subcategories (favorites section etc.) extended by the
  // host's customCategories prop; host entries override defaults by id
  const customCategoryDefinitions = useMemo(() => {
    const registryDefaults = categoryDefinitions.flatMap((definition) =>
      (definition.subCategories ?? []).map((subCategory) => ({
        ...subCategory,
        mainCategoryId: subCategory.mainCategoryId ?? definition.id,
      }))
    );
    const hostDefinitions = customCategories ?? [];
    return [
      ...registryDefaults.map(
        (definition) =>
          hostDefinitions.find((host) => host.id === definition.id) ??
          definition
      ),
      ...hostDefinitions.filter(
        (host) =>
          !registryDefaults.some((definition) => definition.id === host.id)
      ),
    ];
  }, [categoryDefinitions, customCategories]);

  const resolvedCustomCategories = useMemo(
    () =>
      resolveCustomCategories(
        customCategoryDefinitions,
        favorites,
        savedCollections ?? [],
        isCesium
      ),
    [customCategoryDefinitions, favorites, savedCollections, isCesium]
  );
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
    isFetching: discoverIsFetching,
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

  const deployment = useDeployment();

  const {
    additionalConfig,
    sensorConfig,
    objectConfig,
    loadingAdditionalConfig,
  } = useAdditionalConfig({
    setFeatureFlags,
    assetBaseUrl: catalogConfig.assetBaseUrl,
    droppedLayerConfigs: dropped.layerConfigs,
  });

  useLoadCapabilities({
    loadingAdditionalConfig,
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
          categoryConfigs: { sensors: sensorConfig, objects: objectConfig },
          discoverItems,
          dropped,
        },
        {
          featureFlags: flags,
          customCategories: resolvedCustomCategories,
          categoryDefinitions,
          deployment,
        }
      ),
    [
      serviceCategories,
      additionalConfig,
      sensorConfig,
      objectConfig,
      discoverItems,
      dropped,
      flags,
      resolvedCustomCategories,
      categoryDefinitions,
      deployment,
    ]
  );

  const itemsById = useMemo(() => {
    const index = new Map<string, Item>();
    allCategories.forEach((mainCategory) =>
      mainCategory.categories.forEach((subCategory) =>
        subCategory.layers.forEach((item) => {
          // catalog subcategories may also carry saved-collection configs; we
          // only ever resolve real layer ids, so index them as items
          if (item?.id && !index.has(item.id)) {
            index.set(item.id, item as Item);
          }
        })
      )
    );
    return index;
  }, [allCategories]);

  // The custom categories carry host-owned items (favorites, collections, the
  // measurements of the app); those are no catalog definitions, so they must
  // not drive the active-layer sync below.
  const customCategoryItemIds = useMemo(
    () =>
      new Set(
        resolvedCustomCategories.flatMap((category) =>
          category.layers.map((layer) => layer.id)
        )
      ),
    [resolvedCustomCategories]
  );

  const catalogItemsById = useMemo(() => {
    const index = new Map<string, Item>();
    itemsById.forEach((item, id) => {
      if (!customCategoryItemIds.has(id)) {
        index.set(id, item);
      }
    });
    return index;
  }, [itemsById, customCategoryItemIds]);

  // waiting for the capabilities keeps a layer whose service is still loading
  // out of the "not in the catalog" branch of the sync
  useSyncActiveLayers({
    catalogItems: catalogItemsById,
    activeLayers,
    updateActiveLayer,
    enabled: !loadingAdditionalConfig && !loadingCapabilities,
  });

  const resolveWorkflowLayers = useCallback(
    (ids: string[]): Item[] =>
      ids
        .map((id) => itemsById.get(id))
        .filter((item): item is Item => item !== undefined),
    [itemsById]
  );

  const sidebarElements = useMemo(
    () =>
      categoryDefinitions.map((definition) => ({
        ...definition,
        disabled:
          (!!definition.disabledIn3D && isCesium) ||
          (!!definition.disableWhenEmpty &&
            !mainCategoryHasResults(allCategories, definition.id)),
      })),
    [allCategories, categoryDefinitions, isCesium]
  );

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
    filteredCategories: searchedCategories,
  } = useCatalogSearch({ allCategories, disabledCategoryIds });

  const catalogFilters = catalogConfig.filters;
  const filterExemptCategoryIds = useMemo(
    () =>
      new Set(
        categoryDefinitions
          .filter((definition) => definition.ignoreCatalogFilters)
          .map((definition) => definition.id)
      ),
    [categoryDefinitions]
  );
  // layers the user dropped in are never hidden by a curated filter config
  const droppedItemIds = useMemo(() => getDroppedItemIds(dropped), [dropped]);
  const filteredCategories = useMemo(
    () =>
      catalogFilters?.length
        ? filterCategoriesByFilters(searchedCategories, catalogFilters, {
            categoryIds: filterExemptCategoryIds,
            itemIds: droppedItemIds,
          })
        : searchedCategories,
    [
      searchedCategories,
      catalogFilters,
      filterExemptCategoryIds,
      droppedItemIds,
    ]
  );
  // active filters hide empty categories entirely instead of showing them
  // grayed out
  const isFiltering = !!catalogFilters?.length;

  const currentDefinition = sidebarElements[selectedNavItemIndex];
  const isSearchCategory = currentDefinition.source === "searchResults";
  const isDiscoverCategory = currentDefinition.source === "discover";
  const loadingCurrentCategory =
    (currentDefinition.source === "serviceLayers" && loadingCapabilities) ||
    (isDiscoverCategory && discoverIsFetching);

  const shownCategories = useMemo(
    () =>
      getShownCategories(
        filteredCategories,
        currentDefinition.id,
        sidebarElements,
        searchValue,
        isFiltering
      ),
    [
      filteredCategories,
      currentDefinition.id,
      sidebarElements,
      searchValue,
      isFiltering,
    ]
  );

  const sidebarEntries = useMemo<SidebarEntry[]>(
    () =>
      sidebarElements.map((element) => ({
        id: element.id,
        label: element.label,
        icon: element.icon,
        disabled:
          (element.source === "searchResults" && !searchValue) ||
          element.disabled,
        hidden:
          isFiltering &&
          element.source !== "searchResults" &&
          !mainCategoryHasResults(filteredCategories, element.id),
        count:
          isSearching || !searchValue
            ? 0
            : countCategoryLayers(
                getShownCategories(
                  filteredCategories,
                  element.id,
                  sidebarElements,
                  searchValue
                )
              ),
        showCount: !!searchValue && !!debouncedSearchTerm,
      })),
    [
      sidebarElements,
      filteredCategories,
      searchValue,
      isSearching,
      debouncedSearchTerm,
      isFiltering,
    ]
  );

  // the tab highlight follows the section scrolled into view
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sectionIds = useMemo(
    () =>
      (shownCategories ?? [])
        .filter((category) => category.layers.length > 0)
        .map((category) => category.Title),
    [shownCategories]
  );
  const { activeId: currentShownCategory, scrollToSection } = useScrollSpy({
    containerRef: scrollContainerRef,
    sectionIds,
    enabled: open && showItems,
  });

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
    if (!discoverIsFetching) {
      setDelayedLoading(false);
      return;
    }
    const timer = setTimeout(() => setDelayedLoading(true), 750);
    return () => clearTimeout(timer);
  }, [discoverIsFetching]);

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

  // an active search or filter jumps to the first category with results when
  // the selected one has none (filters hide empty sidebar categories)
  useEffect(() => {
    if (!debouncedSearchTerm && !isFiltering) {
      return;
    }
    if (sidebarElements[selectedNavItemIndex].source === "searchResults") {
      return;
    }
    const selectedCategoryId = sidebarElements[selectedNavItemIndex].id;
    if (mainCategoryHasResults(filteredCategories, selectedCategoryId)) {
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
  }, [debouncedSearchTerm, isFiltering, filteredCategories]);

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
    const numOfCustomLayers = resolvedCustomCategories.reduce(
      (acc, category) => acc + category.layers.length,
      0
    );
    if (numOfCustomLayers === 0 && selectedNavItemIndex === 0 && !isCesium) {
      const mapLayersIndex = categoryDefinitions.findIndex(
        (definition) => definition.source === "serviceLayers"
      );
      if (mapLayersIndex !== -1) {
        setSelectedNavItemIndex(mapLayersIndex);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedCustomCategories]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowItems(open);
    }, 225);

    return () => clearTimeout(timer);
  }, [open]);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchValue(value);
      if (
        sidebarElements[selectedNavItemIndex]?.source === "searchResults" &&
        !value
      ) {
        setSelectedNavItemIndex(0);
      }
    },
    [setSearchValue, sidebarElements, selectedNavItemIndex]
  );
  const handleSearchSubmit = useCallback(
    (value: string) => {
      if (value !== "") {
        const searchResultsIndex = sidebarElements.findIndex(
          (element) => element.source === "searchResults"
        );
        if (searchResultsIndex !== -1) {
          setSelectedNavItemIndex(searchResultsIndex);
        }
      }
    },
    [sidebarElements]
  );

  const searchInputRef = useRef<InputRef>(null);
  const focusSearchOnOpen = useCallback((isOpen: boolean) => {
    if (isOpen) {
      searchInputRef.current?.focus();
    }
  }, []);

  const closeCatalog = () => {
    setOpen(false);
    setPreview(false);
    selectItem(null);
  };

  const interactionValue = useMemo<CatalogInteractionContextValue>(
    () => ({
      setAdditionalLayers,
      activeLayers,
      favorites: displayedFavorites,
      addFavorite: handleAddFavorite,
      removeFavorite: handleRemoveFavorite,
      setPreview,
      discoverIsFetching,
      resolveWorkflowLayers,
    }),
    [
      setAdditionalLayers,
      activeLayers,
      displayedFavorites,
      handleAddFavorite,
      handleRemoveFavorite,
      discoverIsFetching,
      resolveWorkflowLayers,
    ]
  );

  return (
    <ModalShell
      open={open}
      preview={preview}
      afterOpenChange={focusSearchOnOpen}
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
    >
      <CatalogInteractionProvider value={interactionValue}>
        <div
          className="w-full h-full flex bg-[#f2f2f2]"
          style={{
            maxHeight: "calc(100vh - 200px)",
            minHeight: "calc(100vh - 200px)",
          }}
        >
          <CategorySidebar
            entries={sidebarEntries}
            selectedIndex={selectedNavItemIndex}
            onSelect={setSelectedNavItemIndex}
          />

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
                    <h1 className="mb-0 text-3xl font-semibold">
                      Karteninhalte
                    </h1>
                    {isDiscoverCategory &&
                      (discoverError || delayedLoading) &&
                      (discoverError ? (
                        <FontAwesomeIcon
                          icon={faTriangleExclamation}
                          className="text-red-500"
                          title={
                            discoverError || "Fehler beim Laden der Karten"
                          }
                          role="status"
                          aria-label={
                            discoverError || "Fehler beim Laden der Karten"
                          }
                        />
                      ) : (
                        filteredCategories
                          .find((cat) => cat.id === currentDefinition.id)
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
                    onClick={closeCatalog}
                  >
                    <FontAwesomeIcon icon={faX} />
                  </Button>
                </div>
                <CatalogSearch
                  inputRef={searchInputRef}
                  onChange={handleSearchChange}
                  onSubmit={handleSearchSubmit}
                  isSearching={isSearching}
                />
                <Button
                  type="text"
                  className="hidden sm:block"
                  onClick={closeCatalog}
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
                <CategoryTabs
                  categories={shownCategories}
                  activeId={currentShownCategory}
                  onTabClick={scrollToSection}
                />
                <hr className="h-px bg-gray-300 border-0 mt-0 mb-2" />
              </div>
            </div>
            <div
              className="w-full gap-4 h-full overflow-auto pt-0.5 px-6"
              id="scrollContainer"
              ref={scrollContainerRef}
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
                  <CatalogGrid
                    categories={shownCategories}
                    loadingCurrentCategory={loadingCurrentCategory}
                    isSearchCategory={isSearchCategory}
                    currentlyNarrowed={!!debouncedSearchTerm || isFiltering}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </CatalogInteractionProvider>
    </ModalShell>
  );
};

export const LayerCatalog = (props: LayerCatalogProps) => {
  const hasProvider = useIsInsideLayerCatalogProvider();
  if (hasProvider) {
    return <LayerCatalogView {...props} />;
  }
  return (
    <LayerCatalogProvider config={props.config} appKey={props.appKey}>
      <LayerCatalogView {...props} />
    </LayerCatalogProvider>
  );
};

export default LayerCatalog;
