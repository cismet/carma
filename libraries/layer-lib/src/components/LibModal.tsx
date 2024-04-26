import { faX } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Button, Input, Modal } from 'antd';
import WMSCapabilities from 'wms-capabilities';
import { useEffect, useState } from 'react';
import {
  createBaseConfig,
  flattenLayer,
  getLayerStructure,
  mergeStructures,
} from '../helper/layerHelper';
const { Search } = Input;
import './modal.css';
import LayerTabs from './LayerTabs';
import Fuse from 'fuse.js';
import LibItem from './LibItem';
import { baseConfig as config, serviceConfig } from '../helper/config';
import './input.css';

// @ts-ignore
const parser = new WMSCapabilities();

export interface LibModalProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  setAdditionalLayers: any;
}

const LibModal = ({ open, setOpen, setAdditionalLayers }: LibModalProps) => {
  const [layers, setLayers] = useState<any[]>([]);
  const [allLayers, setAllLayers] = useState<any[]>([]);
  const services = serviceConfig;

  const flattenedLayers = allLayers.flatMap((obj) => obj.layers);
  const fuse = new Fuse(flattenedLayers, {
    keys: ['Title'],
    shouldSort: false,
    includeMatches: true,
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

  useEffect(() => {
    let newLayers: any[] = [];
    for (let key in services) {
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
              const tmpLayer = getLayerStructure(
                config,
                result,
                services[key].name
              );
              const mergedLayer = mergeStructures(tmpLayer, newLayers);
              newLayers = mergedLayer;
              setLayers(newLayers);
              setAllLayers(newLayers);
            } else {
              getDataFromJson(result);
            }
          }
        });
    }
  }, []);

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
      <div className="w-full h-full flex flex-col bg-[#f2f2f2]">
        <div className="sticky top-0 px-6 pt-6">
          <div className="flex justify-between items-center">
            <h1 className="mb-0 text-2xl font-semibold">Wuppertal Layer</h1>
            {/* <Button
              onClick={() => {
                createBaseConfig(layers);
              }}
            >
              Create Base Config
            </Button> */}
            <Search
              placeholder="Layer durchsuchen"
              className="w-[76%]"
              onSearch={(value) => {
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
              }}
            />
            <Button type="text" onClick={() => setOpen(false)}>
              <FontAwesomeIcon icon={faX} />
            </Button>
          </div>
          {layers.length > 0 && <LayerTabs layers={layers} />}
          <hr className="h-px bg-gray-300 border-0 mt-0 mb-2" />
        </div>
        <div className="overflow-auto">
          <div className="px-6">
            {layers.map((category) => (
              <>
                {category.layers.length > 0 && (
                  <div id={category?.Title} key={category?.Title}>
                    <p className="mb-4 text-2xl font-semibold">
                      {category?.Title}
                    </p>
                    <div className="grid xl:grid-cols-5 lg:grid-cols-4 sm:grid-cols-2 gap-8">
                      {category?.layers?.map((layer: any, i) => (
                        <LibItem
                          setAdditionalLayers={setAdditionalLayers}
                          layer={layer}
                          key={`${category.Title}_layer_${i}`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default LibModal;
