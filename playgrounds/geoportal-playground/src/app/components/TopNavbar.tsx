import { Button, Radio, Tooltip, message } from 'antd';
// @ts-ignore
import {
  faB,
  faBars,
  faLandmark,
  faLayerGroup,
  faMap,
  faPrint,
  faRedo,
  faShareNodes,
  faDrawPolygon,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useContext, useState } from 'react';
// @ts-ignore
import { UIDispatchContext } from 'react-cismap/contexts/UIContextProvider';
// @ts-ignore
import StyledWMSTileLayer from 'react-cismap/StyledWMSTileLayer';
import {
  TopicMapStylingContext,
  TopicMapStylingDispatchContext,
  // @ts-ignore
} from 'react-cismap/contexts/TopicMapStylingContextProvider';

import './switch.css';
import { LayerLib } from '@cismet/layer-lib';
import { useDispatch, useSelector } from 'react-redux';
import { getThumbnails, setThumbnail } from '../store/slices/layers';

const TopNavbar = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  // @ts-ignore
  const { setAppMenuVisible } = useContext(UIDispatchContext);
  // @ts-ignore
  const { setAdditionalLayerConfiguration, activateAdditionalLayer } =
    useContext(TopicMapStylingDispatchContext);
  // @ts-ignore
  const { additionalLayerConfiguration } = useContext(TopicMapStylingContext);
  const dispatch = useDispatch();
  const thumbnails = useSelector(getThumbnails);

  const [messageApi, contextHolder] = message.useMessage();

  const updateLayers = (layer: any) => {
    const url = layer.url;
    let newAdditionalLayers;
    let isRemoved = false;
    newAdditionalLayers = { ...additionalLayerConfiguration };
    if (newAdditionalLayers[layer.name]) {
      delete newAdditionalLayers[layer.name];
      isRemoved = true;
    } else {
      newAdditionalLayers[layer.name] = {
        title: layer.title,
        initialActive: true,
        url,
        layer: (
          <StyledWMSTileLayer
            type="wms"
            url={url}
            layers={layer.name}
            format="image/png"
            tiled={true}
            transparent="true"
            opacity={0.7}
          />
        ),
      };
    }
    try {
      setAdditionalLayerConfiguration(newAdditionalLayers);
      if (newAdditionalLayers[layer.name]) {
        activateAdditionalLayer(layer.name);
      }
      messageApi.open({
        type: 'success',
        content: `${layer.title} wurde erfolgreich ${
          isRemoved ? 'entfernt' : 'hinzugefügt'
        }.`,
      });
    } catch {
      messageApi.open({
        type: 'error',
        content: `Es gab einen Fehler beim hinzufügen von ${layer.title}`,
      });
    }
  };

  return (
    <div className="h-16 w-full flex items-center relative justify-between py-2 px-[12px]">
      {contextHolder}
      <LayerLib
        open={isModalOpen}
        setOpen={setIsModalOpen}
        setAdditionalLayers={updateLayers}
        setThumbnail={(thumbnail) => {
          dispatch(setThumbnail(thumbnail));
        }}
        thumbnails={thumbnails}
      />

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <p className="mb-0 font-semibold text-lg">Geoportal</p>
        </div>
      </div>

      <div className="flex items-center gap-6 absolute left-1/2 -ml-60">
        <Tooltip title="Refresh">
          <FontAwesomeIcon icon={faRedo} className="text-xl text-gray-300" />
        </Tooltip>
        <Tooltip title="Legende">
          <FontAwesomeIcon
            icon={faLandmark}
            className="text-xl text-gray-300"
          />
        </Tooltip>
        {/* <FontAwesomeIcon icon={faMap} className="text-xl" /> */}
        <Tooltip title="Layer">
          <FontAwesomeIcon
            icon={faLayerGroup}
            onClick={() => {
              setIsModalOpen(true);
            }}
            className="cursor-pointer text-xl"
          />
        </Tooltip>
        <Tooltip title="Blass">
          <FontAwesomeIcon icon={faB} className="text-xl text-gray-300" />
        </Tooltip>
        <Tooltip title="Drucken">
          <FontAwesomeIcon icon={faPrint} className="text-xl text-gray-300" />
        </Tooltip>
        <Tooltip title="Teilen">
          <FontAwesomeIcon
            icon={faShareNodes}
            className="text-xl text-gray-300"
          />
        </Tooltip>
        <Tooltip title="Messungen">
          <FontAwesomeIcon
            icon={faDrawPolygon}
            className="text-xl text-gray-300"
          />
        </Tooltip>
      </div>

      <div className="flex items-center gap-6">
        <Radio.Group value={'standard'}>
          <Radio.Button value="standard">Standard</Radio.Button>
          <Radio.Button value="hybrid">Hybrid</Radio.Button>
          <Radio.Button value="satellit">Satellit</Radio.Button>
        </Radio.Group>

        <Button
          onClick={() => {
            setAppMenuVisible(true);
          }}
        >
          <FontAwesomeIcon icon={faBars} />
        </Button>
      </div>
    </div>
  );
};

export default TopNavbar;
