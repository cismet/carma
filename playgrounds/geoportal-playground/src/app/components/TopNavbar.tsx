import { Button, Radio, Tooltip, message } from 'antd';
// @ts-ignore
import {
  faB,
  faBars,
  faLandmark,
  faLayerGroup,
  faPrint,
  faRedo,
  faShareNodes,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useContext, useState } from 'react';
// @ts-ignore
import { UIDispatchContext } from 'react-cismap/contexts/UIContextProvider';
// @ts-ignore
import StyledWMSTileLayer from 'react-cismap/StyledWMSTileLayer';

import './switch.css';
import { LayerLib } from '@cismet/layer-lib';
import { useDispatch, useSelector } from 'react-redux';
import { getThumbnails, setThumbnail } from '../store/slices/layers';
import { appendLayer, getLayers, removeLayer } from '../store/slices/mapping';

const TopNavbar = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  // @ts-ignore
  const { setAppMenuVisible } = useContext(UIDispatchContext);
  const dispatch = useDispatch();
  const thumbnails = useSelector(getThumbnails);
  const activeLayers = useSelector(getLayers);

  const [messageApi, contextHolder] = message.useMessage();

  const updateLayers = (layer: any) => {
    const url = layer.url;

    const newLayer = {
      title: layer.title,
      initialActive: true,
      id: layer.name,
      url,
    };

    if (activeLayers.find((activeLayer) => activeLayer.id === layer.name)) {
      try {
        dispatch(removeLayer(layer.name));
        messageApi.open({
          type: 'success',
          content: `${layer.title} wurde erfolgreich entfernt.`,
        });
      } catch {
        messageApi.open({
          type: 'error',
          content: `Es gab einen Fehler beim entfernen von ${layer.title}`,
        });
      }
    } else {
      try {
        dispatch(appendLayer(newLayer));
        messageApi.open({
          type: 'success',
          content: `${layer.title} wurde erfolgreich hinzugefügt.`,
        });
      } catch {
        messageApi.open({
          type: 'error',
          content: `Es gab einen Fehler beim hinzufügen von ${layer.title}`,
        });
      }
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
        activeLayers={activeLayers}
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
        {/* <Tooltip title="Messungen">
          <FontAwesomeIcon
            icon={faDrawPolygon}
            className="text-xl text-gray-300"
          />
        </Tooltip> */}
      </div>

      <div className="flex items-center gap-6">
        <Radio.Group value={'standard'}>
          <Radio.Button value="standard">Amtlich</Radio.Button>
          <Radio.Button value="hybrid">Topographisch</Radio.Button>
          <Radio.Button value="satellit">Luftbild</Radio.Button>
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
