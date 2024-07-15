import { faX } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useDebounce } from '@uidotdev/usehooks';
import { Button, Input, Modal, Spin } from 'antd';
import Fuse from 'fuse.js';
import { useEffect, useState } from 'react';
import { InView } from 'react-intersection-observer';
import WMSCapabilities from 'wms-capabilities';
import { baseConfig as config, serviceConfig } from '../helper/config';
import {
  findDifferences,
  findLayerAndAddTags,
  flattenLayer,
  getAllLeafLayers,
  getLayerStructure,
  mergeStructures,
} from '../helper/layerHelper';
import LayerTabs from './LayerTabs';
import LibItem from './LibItem';
import './input.css';
import './modal.css';
import { Item, Layer, vectorProps, wmsProps } from '../helper/types';
import { isEqual } from 'lodash';
const { Search } = Input;

// @ts-ignore
const parser = new WMSCapabilities();

export interface LibModalProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  setAdditionalLayers: any;
  setThumbnail: any;
  thumbnails: any;
  activeLayers: Layer[];
  customCategories?: any[];
}

const LibModal = ({
  open,
  setOpen,
  setAdditionalLayers,
  thumbnails,
  setThumbnail,
  activeLayers,
  customCategories,
}: LibModalProps) => {
  const [layers, setLayers] = useState<any[]>([]);
  const [allLayers, setAllLayers] = useState<any[]>([]);
  const services = serviceConfig;
  const [inViewCategory, setInViewCategory] = useState('');
  const [allCategoriesInView, setAllCategoriesInView] = useState<string[]>([]);
  const [searchValue, setSearchValue] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showItems, setShowItems] = useState(false);
  const [tmpCustomCategories, setTmpCustomCategories] = useState<
    any[] | undefined
  >([]);
  const debouncedSearchTerm = useDebounce(searchValue, 300);

  const checkDifferences = (url, configName) => {
    fetch(`${url}?service=WMS&request=GetCapabilities&version=1.1.1`)
      .then((response) => {
        return response.text();
      })
      .then((text) => {
        const result = parser.toJSON(text);
        console.log('xxx result', getAllLeafLayers(result));
        console.log('xxx configName', config[configName]);
        console.log(
          'xxx findDifferences',
          findDifferences(getAllLeafLayers(result), config[configName].layers)
        );
      });
  };

  const search = (value) => {
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
          if (category.Title === result.item.tags[0]) {
            newLayers.push({
              ...result.item,
              highlight: result.matches,
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
      { name: 'title', weight: 2 },
      { name: 'description', weight: 1 },
    ],
    shouldSort: false,
    includeMatches: true,
    useExtendedSearch: true,
    distance: 1000,
    threshold: 0.3,
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

  const getNumberOfLayers = (layers) => {
    let numberOfLayers = 0;
    layers.forEach((category) => {
      numberOfLayers += category.layers.length;
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
                });
                const mergedLayer = mergeStructures(tmpLayer, newLayers);

                newLayers = mergedLayer;
                // @ts-ignore
                setLayers([...customCategories, ...newLayers]);
                setAllLayers([...customCategories, ...newLayers]);
              } else {
                getDataFromJson(result);
              }
            }
          });
      } else {
        if (services[key].type === 'topicmaps') {
          const tmpLayer = getLayerStructure({
            config,
            serviceName: services[key].name,
          });
          const mergedLayer = mergeStructures(tmpLayer, newLayers);
          newLayers = mergedLayer;
          // @ts-ignore
          setLayers([...customCategories, ...newLayers]);
          setAllLayers([...customCategories, ...newLayers]);
        } else {
          const tmpLayer = getLayerStructure({
            config,
            serviceName: services[key].name,
          });
          const mergedLayer = mergeStructures(tmpLayer, newLayers);
          newLayers = mergedLayer;
          setLayers([...customCategories, ...newLayers]);
          setAllLayers([...customCategories, ...newLayers]);
        }
      }
    }
  }, []);

  useEffect(() => {
    search(debouncedSearchTerm);
  }, [debouncedSearchTerm]);

  useEffect(() => {
    if (!isEqual(customCategories, tmpCustomCategories)) {
      setTmpCustomCategories(customCategories);

      let updatedLayers = layers.map((category) => {
        const title = category.Title;
        // @ts-ignore
        customCategories.forEach((customCategory) => {
          if (customCategory.Title === title) {
            category.layers = customCategory.layers;
          }
        });
        return category;
      });
      setLayers(updatedLayers);
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
        setOpen(false);
      }}
      footer={<></>}
      width={'100%'}
      closeIcon={false}
      wrapClassName="h-full"
      className="h-[90%]"
    >
      <div
        className="w-full h-full flex flex-col bg-[#f2f2f2]"
        style={{
          maxHeight: 'calc(100vh - 200px)',
          minHeight: 'calc(100vh - 200px)',
        }}
      >
        <div className="sticky top-0 px-6 pt-6">
          <div className="flex justify-between items-center">
            <h1 className="mb-0 text-2xl font-semibold">Ressourcen</h1>
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
            <Button type="text" onClick={() => setOpen(false)}>
              <FontAwesomeIcon icon={faX} />
            </Button>
          </div>
          {layers.length > 0 && (
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
                      <div className="grid xl:grid-cols-5 lg:grid-cols-4 sm:grid-cols-2 gap-8 mb-4">
                        {category?.layers?.map((layer: any, i) => (
                          <LibItem
                            setAdditionalLayers={setAdditionalLayers}
                            layer={layer}
                            thumbnails={thumbnails}
                            setThumbnail={setThumbnail}
                            activeLayers={activeLayers}
                            key={`${category.Title}_layer_${i}`}
                          />
                        ))}
                      </div>
                    </InView>
                  )}
                </div>
              ))}
            {getNumberOfLayers(layers) === 0 && (
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
