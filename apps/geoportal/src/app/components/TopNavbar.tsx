import { Button, Popover, Radio, Tooltip, message } from 'antd';
import {
  faB,
  faBars,
  faLandmark,
  faLayerGroup,
  faPrint,
  faRedo,
  faShareNodes,
  faEye,
  faEyeSlash,
  faF,
  faFileExport,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useContext, useState } from 'react';
import { UIDispatchContext } from 'react-cismap/contexts/UIContextProvider';

import { LayerLib, Item, Layer } from '@carma-mapping/layers';
import { useDispatch, useSelector } from 'react-redux';
import { getThumbnails, setThumbnail } from '../store/slices/layers';
import {
  appendLayer,
  deleteSavedLayerConfig,
  getBackgroundLayer,
  getFocusMode,
  getLayers,
  getSavedLayerConfigs,
  getSelectedMapLayer,
  removeLayer,
  setBackgroundLayer,
  setFocusMode,
  setLayers,
} from '../store/slices/mapping';
import Share from './Share';
import './switch.css';
import { getShowLayerButtons, setShowLayerButtons } from '../store/slices/ui';
import { cn } from '../helper/helper';
import Save from './Save';
import { layerMap } from '../helper/layer';

const TopNavbar = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { setAppMenuVisible } = useContext<UIDispatchContext>(UIDispatchContext);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const selectedMapLayer = useSelector(getSelectedMapLayer);
  const dispatch = useDispatch();
  const thumbnails = useSelector(getThumbnails);
  const activeLayers = useSelector(getLayers);
  const showLayerButtons = useSelector(getShowLayerButtons);
  const focusMode = useSelector(getFocusMode);
  const savedLayerConfigs = useSelector(getSavedLayerConfigs);

  const [messageApi, contextHolder] = message.useMessage();

  const extractVectorStyles = (keywords: string[]) => {
    let vectorObject = null;

    if (keywords) {
      keywords.forEach((keyword) => {
        if (keyword.startsWith('carmaConf://')) {
          const objectString = keyword.slice(12);
          let colonIndex = objectString.indexOf(':');
          const property = objectString.split(':')[0];
          let value =
            colonIndex !== -1
              ? objectString.substring(colonIndex + 1).trim()
              : '';
          const object = { [property]: value };
          vectorObject = object;
        }
      });
    }

    return vectorObject;
  };

  const updateLayers = (
    layer: Item,
    deleteItem: boolean = false,
    forceWMS: boolean = false
  ) => {
    let newLayer: Layer;

    if (layer.type === 'collection') {
      if (deleteItem) {
        dispatch(deleteSavedLayerConfig(layer.id));
      } else {
        try {
          dispatch(setLayers(layer.layers));
          messageApi.open({
            type: 'success',
            content: `${layer.title} wurde erfolgreich angewandt.`,
          });
        } catch {
          messageApi.open({
            type: 'error',
            content: `Es gab einen Fehler beim anwenden von ${layer.title}`,
          });
        }
      }
      return;
    }

    if (layer.type === 'layer') {
      const vectorObject = extractVectorStyles(layer.keywords);
      if (vectorObject && !forceWMS) {
        newLayer = {
          title: layer.title,
          id: layer.id,
          layerType: 'vector',
          opacity: 0.7,
          description: layer.description,
          visible: true,
          props: {
            style: vectorObject.vectorStyle,
          },
          other: {
            ...layer,
          },
        };
      } else {
        switch (layer.layerType) {
          case 'wmts': {
            newLayer = {
              title: layer.title,
              id: layer.id,
              layerType: 'wmts',
              opacity: 0.7,
              description: layer.description,
              visible: true,
              props: {
                url: layer.props.url,
                legend: layer.props.Style[0].LegendURL,
                name: layer.props.Name,
              },
              other: {
                ...layer,
              },
            };
            break;
          }
          case 'vector': {
            newLayer = {
              title: layer.title,
              id: layer.id,
              layerType: 'vector',
              opacity: 0.7,
              description: layer.description,
              visible: true,
              props: {
                style: layer.props.style,
              },
              other: {
                ...layer,
              },
            };
            break;
          }
        }
      }
    }

    if (activeLayers.find((activeLayer) => activeLayer.id === layer.id)) {
      try {
        dispatch(removeLayer(layer.id));
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
        customCategories={[
          {
            Title: 'Meine Zusammenstellungen',
            layers: savedLayerConfigs,
          },
        ]}
      />

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <p className="mb-0 font-semibold text-lg">
            DigiTal Zwilling / Geoportal
          </p>
        </div>
      </div>

      <div className="flex items-center gap-6 absolute left-1/2 -ml-[98px]">
        <Tooltip title="Refresh">
          <button
            onClick={() => {
              window.location.reload();
            }}
            className="text-xl hover:text-gray-600"
          >
            <FontAwesomeIcon icon={faRedo} />
          </button>
        </Tooltip>
        <Tooltip title="Layer">
          <FontAwesomeIcon
            icon={faLayerGroup}
            onClick={() => {
              setIsModalOpen(true);
            }}
            className="cursor-pointer text-xl"
          />
        </Tooltip>
        <Tooltip title="Fokus">
          <button
            className={cn('text-xl', focusMode ? 'text-blue-500' : '')}
            onClick={() => {
              dispatch(setFocusMode(!focusMode));
            }}
          >
            <FontAwesomeIcon icon={faF} />
          </button>
        </Tooltip>
        <Tooltip title="Drucken">
          <FontAwesomeIcon icon={faPrint} className="text-xl text-gray-300" />
        </Tooltip>
        <Tooltip
          title={`Layer Buttons ${
            showLayerButtons ? 'ausblenden' : 'anzeigen'
          }`}
        >
          <button
            className="text-xl hover:text-gray-600"
            onClick={() => {
              dispatch(setShowLayerButtons(!showLayerButtons));
            }}
          >
            <FontAwesomeIcon icon={showLayerButtons ? faEye : faEyeSlash} />
          </button>
        </Tooltip>
        <Tooltip title="Speichern">
          <Popover trigger="click" placement="bottom" content={<Save />}>
            <button className="hover:text-gray-600 text-xl">
              <FontAwesomeIcon icon={faFileExport} />
            </button>
          </Popover>
        </Tooltip>
        <Tooltip title="Teilen">
          <Popover trigger="click" placement="bottom" content={<Share />}>
            <button className="hover:text-gray-600 text-xl">
              <FontAwesomeIcon icon={faShareNodes} />
            </button>
          </Popover>
        </Tooltip>
      </div>

      <div className="flex items-center gap-6">
        <div className="lg:flex hidden">
          <Radio.Group
            value={backgroundLayer.id}
            onChange={(e) => {
              if (e.target.value === 'karte') {
                dispatch(
                  setBackgroundLayer({ ...selectedMapLayer, id: 'karte' })
                );
              } else {
                dispatch(
                  setBackgroundLayer({
                    id: e.target.value,
                    title: layerMap[e.target.value].title,
                    opacity: 1.0,
                    description: layerMap[e.target.value].description,
                    inhalt: layerMap[e.target.value].inhalt,
                    eignung: layerMap[e.target.value].eignung,
                    layerType: 'wmts',
                    visible: true,
                    props: {
                      name: '',
                      url: layerMap[e.target.value].url,
                    },
                    layers: layerMap[e.target.value].layers,
                  })
                );
              }
            }}
          >
            <Radio.Button value="karte">Karte</Radio.Button>
            <Radio.Button value="luftbild">Luftbild</Radio.Button>
          </Radio.Group>
        </div>

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
