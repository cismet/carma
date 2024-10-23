/* eslint-disable @typescript-eslint/no-explicit-any */
import { faX } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useDebounce } from "@uidotdev/usehooks";
import { Button, Input, Modal, Spin } from "antd";
import Fuse from "fuse.js";
import { useEffect, useState } from "react";
import { InView } from "react-intersection-observer";
import WMSCapabilities from "wms-capabilities";
import { baseConfig as config, serviceConfig } from "../helper/config";
import {
  findDifferences,
  findLayerAndAddTags,
  flattenLayer,
  getAllLeafLayers,
  getLayerStructure,
  mergeStructures,
} from "../helper/layerHelper";
import LayerTabs from "./LayerTabs";
import LibItem from "./LibItem";
import "./input.css";
import "./modal.css";
import type { Item, Layer, SavedLayerConfig } from "../helper/types";
import { isEqual } from "lodash";
import { utils } from "@carma-apps/portals";
const { Search } = Input;

// @ts-expect-error tbd
const parser = new WMSCapabilities();

type LayerCategories = {
  Title: string;
  layers: SavedLayerConfig[];
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
  customCategories?: LayerCategories[];
  updateActiveLayer: (layer: Layer) => void;
  removeLastLayer?: () => void;
}

export const LibModal = ({
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
  const [tmpCustomCategories, setTmpCustomCategories] = useState<
    any[] | undefined
  >([]);
  const debouncedSearchTerm = useDebounce(searchValue, 300);

  // const checkDifferences = (url, configName) => {
  //   fetch(`${url}?service=WMS&request=GetCapabilities&version=1.1.1`)
  //     .then((response) => {
  //       return response.text();
  //     })
  //     .then((text) => {
  //       const result = parser.toJSON(text);
  //       console.log('xxx result', getAllLeafLayers(result));
  //       console.log('xxx configName', config[configName]);
  //       console.log(
  //         'xxx findDifferences',
  //         findDifferences(getAllLeafLayers(result), config[configName].layers)
  //       );
  //     });
  // };

  const search = (value: string) => {
    setIsSearching(true);
    if (value) {
      const results = fuse.search(value);
      // have to use allLayers.map to create a deep copy so the allLayers state wont change here
      const resultsWithCategories = allLayers.map((item) => {
        return {
          ...item,
        };
      });

      resultsWithCategories.map((category) => {
        const newLayers: any[] = [];

        results.forEach((result) => {
          if (
            category.Title === "Favoriten" &&
            result.item?.id.startsWith("fav_")
          ) {
            newLayers.push({
              ...result.item,
            });
          }
          if (
            category.Title === result.item?.tags?.[0] &&
            !result.item?.id.startsWith("fav_")
          ) {
            newLayers.push({
              ...result.item,
            });
          }
        });

        category.layers = newLayers;
      });

      setLayers(resultsWithCategories);
    } else {
      setLayers(allLayers);
    }
    setIsSearching(false);
  };

  const flattenedLayers = allLayers.flatMap((obj) => obj.layers);
  const fuse = new Fuse(flattenedLayers, {
    keys: [
      { name: "title", weight: 2 },
      { name: "description", weight: 1 },
      { name: "keywords", weight: 1 },
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

    setLayers((prev) => {
      const newLayers = [...prev, flattenedLayers[0]];
      newLayers.sort((a, b) => b.layers.length - a.layers.length);

      return newLayers;
    });
    setAllLayers((prev) => {
      const newLayers = [...prev, flattenedLayers[0]];
      newLayers.sort((a, b) => b.layers.length - a.layers.length);

      return newLayers;
    });
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
          `${services[key].url}?service=WMS&request=GetCapabilities&version=1.1.1`,
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
                });

                tmpLayer.forEach((category) => {
                  if (category.layers.length > 0) {
                    activeLayers.forEach(async (activeLayer) => {
                      const foundLayer = category.layers.find(
                        (layer) => layer.id === activeLayer.id,
                      );
                      if (foundLayer) {
                        const updatedLayer = await utils.parseToMapLayer(
                          foundLayer,
                          false,
                          activeLayer.opacity,
                        );

                        const shouldUpdate = !isEqual(
                          activeLayer,
                          updatedLayer,
                        );

                        updateActiveLayer(updatedLayer);
                      }
                    });
                  }
                });
                const mergedLayer = mergeStructures(tmpLayer, newLayers);

                newLayers = mergedLayer;
                let tmp: Layer[] = [];
                if (customCategories) {
                  tmp = [...customCategories, ...newLayers];
                } else {
                  tmp = newLayers;
                }

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
          const mergedLayer = mergeStructures(tmpLayer, newLayers);
          newLayers = mergedLayer;
          let tmp: Layer[] = [];
          if (customCategories) {
            tmp = [...customCategories, ...newLayers];
          } else {
            tmp = newLayers;
          }
          setLayers(tmp);
          setAllLayers(tmp);
        } else {
          const tmpLayer = getLayerStructure({
            config,
            serviceName: services[key].name,
          });
          const mergedLayer = mergeStructures(tmpLayer, newLayers);
          newLayers = mergedLayer;
          let tmp: Layer[] = [];
          if (customCategories) {
            tmp = [...customCategories, ...newLayers];
          } else {
            tmp = newLayers;
          }
          setLayers(tmp);
          setAllLayers(tmp);
        }
      }
    }
  }, []);

  useEffect(() => {
    search(debouncedSearchTerm);
  }, [debouncedSearchTerm]);

  useEffect(() => {
    if (!searchValue) {
      setLayers(allLayers);
    } else {
      search(debouncedSearchTerm);
    }
  }, [allLayers]);

  useEffect(() => {
    if (!isEqual(customCategories, tmpCustomCategories)) {
      setTmpCustomCategories(customCategories);

      let updatedLayers = allLayers.map((category) => {
        const title = category.Title;
        customCategories?.forEach((customCategory) => {
          if (customCategory.Title === title) {
            category.layers = customCategory.layers;
          }
        });
        return category;
      });
      setAllLayers(updatedLayers);
    }
  }, [customCategories]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowItems(open);
    }, 225);

    return () => clearTimeout(timer);
  }, [open]);

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
        className="w-full h-full flex flex-col bg-[#f2f2f2]"
        style={{
          maxHeight: "calc(100vh - 200px)",
          minHeight: "calc(100vh - 200px)",
        }}
      >
        <div className="sticky top-0 px-6 pt-6">
          <div className="flex justify-between items-center">
            <h1 className="mb-0 text-2xl font-semibold">Kartenebenen</h1>
            {/* <Button
              onClick={() => {
                createBaseConfig(layers);
              }}
            >
              Create Base Config
            </Button> */}
            {/* <Button
              onClick={() =>
                checkDifferences('https://maps.wuppertal.de/umwelt', 'Umwelt')
              }
            >
              Get Config Differences
            </Button> */}
            <Search
              placeholder="Suchbegriff eingeben"
              className="w-[76%]"
              allowClear
              onChange={(e) => {
                setIsSearching(true);
                setSearchValue(e.target.value);
              }}
              loading={isSearching}
              onSearch={(value) => {
                search(value);
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
          {layers && layers.length > 0 && (
            <>
              <LayerTabs
                layers={layers}
                activeId={inViewCategory}
                numberOfItems={getNumberOfLayers(layers)}
              />
              <hr className="h-px bg-gray-300 border-0 mt-0 mb-2" />
            </>
          )}
        </div>
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
        <div className="overflow-auto pt-0.5">
          <div className="px-6">
            {showItems &&
              layers.map((category, i) => (
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
                              (item) => item !== entry.target.id,
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
                          <LibItem
                            setAdditionalLayers={setAdditionalLayers}
                            layer={layer}
                            thumbnails={thumbnails}
                            setThumbnail={setThumbnail}
                            activeLayers={activeLayers}
                            favorites={favorites}
                            addFavorite={addFavorite}
                            removeFavorite={removeFavorite}
                            selectedLayerId={selectedLayerId}
                            setSelectedLayerId={setSelectedLayerId}
                            setPreview={setPreview}
                            key={`${category.Title}_layer_${i}_${layer.id}`}
                          />
                        ))}
                      </div>
                    </InView>
                  )}
                </div>
              ))}
            {layers && getNumberOfLayers(layers) === 0 && (
              <h1 className="text-2xl font-normal">
                Keine Ressourcen gefunden
              </h1>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default LibModal;
