/* eslint-disable @typescript-eslint/no-explicit-any */
import { utils } from "@carma-apps/portals";
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
import { useEffect, useState } from "react";
import { InView } from "react-intersection-observer";
import WMSCapabilities from "wms-capabilities";
import { baseConfig as config, serviceConfig } from "../helper/config";
import {
  flattenLayer,
  getLayerStructure,
  mergeStructures,
  wmsLayerToGenericItem,
} from "../helper/layerHelper";
import type { Item, Layer, SavedLayerConfig } from "../helper/types";
import LayerItem from "./LayerItem";
import LayerTabs from "./LayerTabs";
import LibItem from "./LibItem";
import { SidebarItem } from "./SidebarItems";
import "./input.css";
import "./modal.css";
import ItemGrid from "./ItemGrid";
import { isEmpty } from "lodash";
const { Search } = Input;

// @ts-expect-error tbd
const parser = new WMSCapabilities();

type LayerCategories = {
  Title: string;
  layers: SavedLayerConfig[];
  id?: string;
};

export interface LibModalProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  setAdditionalLayers: any;
  setThumbnail: any;
  thumbnails: any;
  favorites?: Item[];
  addFavorite: (layer: Item) => void;
  removeFavorite: (layer: Item) => void;
  activeLayers: any[];
  customCategories: LayerCategories[];
  updateActiveLayer: (layer: Layer) => void;
  removeLastLayer?: () => void;
}

const sidebarElements = [
  { icon: faStar, text: "Favoriten", id: "favorites" },
  { icon: faList, text: "Entdecken", id: "discover" },
  { icon: faBook, text: "Teilzwillinge", id: "partialTwins" },
  { icon: faMap, text: "Kartenebenen", id: "mapLayers" },
  { icon: faMapPin, text: "Sensoren", id: "sensors" },
  { icon: faSearch, text: "Suchergebnisse", id: "searchResults" },
];

export const NewLibModal = ({
  open,
  setOpen,
  setAdditionalLayers,
  thumbnails,
  setThumbnail,
  activeLayers,
  customCategories,
  addFavorite,
  removeFavorite,
  favorites,
  updateActiveLayer,
  removeLastLayer,
}: LibModalProps) => {
  const [preview, setPreview] = useState(false);
  const [layers, setLayers] = useState<any[]>([]);
  const [allLayers, setAllLayers] = useState<any[]>([]);
  const services = serviceConfig;
  const [inViewCategory, setInViewCategory] = useState("");
  const [allCategoriesInView, setAllCategoriesInView] = useState<string[]>([]);
  const [searchValue, setSearchValue] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showItems, setShowItems] = useState(false);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [selectedNavItemIndex, setSelectedNavItemIndex] = useState(0);
  const [testCategory, setTestCategory] = useState<any[]>([]);
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
  const debouncedSearchTerm = useDebounce(searchValue, 300);

  const search = (value: string) => {
    setIsSearching(true);
    if (value) {
      const results = fuse.search(value);

      const testTmp = JSON.parse(JSON.stringify(tmpAllCategories));

      const testCategories = testTmp.map((category) => {
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

      setShownCategories(testCategories);
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
        Title: "Eigene Daten",
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

                        updateActiveLayer(updatedLayer);
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
          const tmpLayer = getLayerStructure({
            config,
            serviceName: services[key].name,
          });
          // @ts-expect-error
          setShownCategories((prev) => {
            if (prev.find((item) => item.id === "partialTwins")) {
              prev.splice(
                prev.findIndex((item) => item.id === "partialTwins"),
                1
              );
            }
            return [
              ...prev,
              {
                id: "partialTwins",
                categories: tmpLayer.filter(
                  (category) => category.layers.length > 0
                ),
              },
            ];
          });

          // @ts-expect-error
          setTmpAllCategories((prev) => {
            if (prev.find((item) => item.id === "partialTwins")) {
              prev.splice(
                prev.findIndex((item) => item.id === "partialTwins"),
                1
              );
            }
            return [
              ...prev,
              {
                id: "partialTwins",
                categories: tmpLayer.filter(
                  (category) => category.layers.length > 0
                ),
              },
            ];
          });
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
  }, []);

  useEffect(() => {
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

  useEffect(() => {
    if (!searchValue) {
      setLayers(allLayers);

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
            categories: allLayers,
          },
        ];
      });

      setShownCategories((prev) => {
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
            categories: allLayers,
          },
        ];
      });
    } else {
      search(debouncedSearchTerm);
    }
  }, [allLayers]);

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
      newCategories.map((cat) => {
        if (cat.id === categoryId) {
          let subCats = cat.categories;
          let newSubCat = {};
          subCats.forEach((subCat) => {
            if (subCat.id === subCategory.id) {
              newSubCat = subCat;
              if (Array.isArray(item)) {
                // @ts-expect-error
                newSubCat.layers.push(...item);
              } else {
                // @ts-expect-error
                newSubCat.layers.push(item);
              }
            }
          });
          if (isEmpty(newSubCat)) {
            if (Array.isArray(item)) {
              cat.categories.push({
                id: subCategory.id,
                Title: subCategory.Title,
                layers: item,
              });
            } else {
              cat.categories.push({
                id: subCategory.id,
                Title: subCategory.Title,
                layers: [item],
              });
            }
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
        };

        addItemToCategory(
          "mapLayers",
          { id: "custom", Title: "Eigene Daten" },
          // @ts-expect-error
          newItem
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
                { id: "custom", Title: "Eigene Daten" },
                ownLayers[0].layers
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
              };

              addItemToCategory(
                "mapLayers",
                { id: "custom", Title: "Eigene Daten" },
                // @ts-expect-error
                newItem
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
                { id: "custom", Title: "Eigene Daten" },
                ownLayers[0].layers
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

  const categoriesToShownLayers = (categories, shownId) => {
    if (shownId === "searchResults") {
      if (searchValue) {
        return categories.map((category) => category.categories).flat();
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
          className={`w-40 h-full flex justify-between items-center flex-col pb-3 bg-gray-600`}
          style={{ height: "calc(100vh - 188px)" }}
        >
          <div className="flex flex-col w-full items-center gap-2 overflow-y-auto overflow-x-hidden">
            <div className="h-24"></div>
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
          className="w-full h-full flex flex-col bg-[#f2f2f2]"
          style={{
            maxHeight: "calc(100vh - 200px)",
            minHeight: "calc(100vh - 200px)",
          }}
        >
          <div className="sticky top-0 px-6 pt-6">
            <div className="flex justify-between items-center">
              <h1 className="mb-0 text-2xl font-semibold">Karteninhalte</h1>
              <Search
                placeholder="Suchbegriff eingeben"
                className="w-[76%]"
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
                    activeId={inViewCategory}
                    numberOfItems={getNumberOfLayers(layers)}
                  />
                  <hr className="h-px bg-gray-300 border-0 mt-0 mb-2" />
                </>
              )}
            </div>
          </div>
          <div className="flex w-full gap-4 h-full overflow-auto pt-0.5 px-6">
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
                />
              )}
              {selectedNavItemIndex === 3 &&
                showItems &&
                testCategory.length > 0 &&
                testCategory.map((category, i) => (
                  <div key={category.Title}>
                    {category.layers.length > 0 && (
                      <InView
                        rootMargin="20px 0px 20px 0px"
                        as="div"
                        onChange={(inView, entry) => {
                          if (inView) {
                            setInViewCategory(entry.target.id);

                            setAllCategoriesInView((prev) => {
                              return [...prev, entry.target.id];
                            });
                          } else {
                            const updatedCategoriesInView =
                              allCategoriesInView.filter(
                                (item) => item !== entry.target.id
                              );
                            setAllCategoriesInView(updatedCategoriesInView);
                            if (inViewCategory === entry.target.id && i > 0) {
                              for (let j = i - 1; j >= 0; j--) {
                                if (layers[j].layers.length > 0) {
                                  setInViewCategory(layers[j].Title);
                                }
                              }
                            }
                          }
                        }}
                        id={category?.Title}
                        key={category?.Title}
                      >
                        <p className="mb-4 text-2xl font-semibold">
                          {category?.Title}
                        </p>
                        <div className="grid xl:grid-cols-7 grid-flow-dense lg:grid-cols-5 sm:grid-cols-4 gap-8 mb-4">
                          {category?.layers?.map((layer: any, i: number) => (
                            <LayerItem
                              setAdditionalLayers={setAdditionalLayers}
                              layer={layer}
                              activeLayers={activeLayers}
                              favorites={favorites}
                              addFavorite={addFavorite}
                              removeFavorite={removeFavorite}
                              selectedLayerId={selectedLayerId}
                              setSelectedLayerId={setSelectedLayerId}
                              setPreview={setPreview}
                              key={`${category.Title}_layer_${i}_${layer.id}`}
                              showWithoutThumbnail
                            />
                          ))}
                        </div>
                      </InView>
                    )}
                  </div>
                ))}

              {layers &&
                getNumberOfLayers(layers) === 0 &&
                selectedNavItemIndex === 3 && (
                  <h1 className="text-2xl font-normal">
                    Keine Ressourcen gefunden
                  </h1>
                )}
              {selectedNavItemIndex !== 2 &&
                selectedNavItemIndex !== 3 &&
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
