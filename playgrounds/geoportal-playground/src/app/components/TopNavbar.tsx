import { Button, Popover, Radio, Tooltip, message } from 'antd';
// @ts-ignore
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
// @ts-ignore
import { UIDispatchContext } from 'react-cismap/contexts/UIContextProvider';

import { LayerLib } from '@cismet/layer-lib';
import { Layer } from 'libraries/layer-lib/src/components/LibModal';
import { useDispatch, useSelector } from 'react-redux';
import { getThumbnails, setThumbnail } from '../store/slices/layers';
import {
  appendLayer,
  getBackgroundLayer,
  getFocusMode,
  getLayers,
  removeLayer,
  setBackgroundLayer,
  setFocusMode,
} from '../store/slices/mapping';
import Share from './Share';
import './switch.css';
import { getShowLayerButtons, setShowLayerButtons } from '../store/slices/ui';
import { cn } from '../helper/helper';
import { Item } from 'libraries/layer-lib/src/helper/types';
import Save from './Save';

export const layerMap = {
  amtlich: {
    title: 'Amtlich',
    layers: 'amtlichBasiskarte@90',
    description: ``,

    url: 'https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
  },
  luftbild: {
    title: 'Luftbild',
    layers: 'wupp-plan-live@100|trueOrtho2020@75|rvrSchrift@100',
    description: `Kartendienst (WMS) der Stadt Wuppertal. Datengrundlage
            <strong>True Orthophoto aus Bildflug vom 16.03.2022</strong>, hergestellt durch Aerowest
            GmbH/Dortmund, Bodenauflösung 5 cm.
            (True Orthophoto: Aus Luftbildern mit hoher Längs- und Querüberdeckung
            in einem automatisierten Bildverarbeitungsprozess
            berechnetes Bild in Parallelprojektion, also ohne Gebäudeverkippung und sichttote Bereiche.) © Stadt Wuppertal (
            <a href="https://www.wuppertal.de/geoportal/Nutzungsbedingungen/NB-GDIKOM-C_Geodaten.pdf">
              NB-GDIKOM C
            </a>
            ). (2) Kartendienste (WMS) des Regionalverbandes Ruhr (RVR). Datengrundlagen:
            <strong>Stadtkarte 2.0</strong> und Kartenschrift aus der Stadtkarte 2.0. Details s. Hintergrundkarte Stadtplan).`,
    url: 'https://maps.wuppertal.de/karten?service=WMS&request=GetMap&layers=R102%3Aluftbild2022',
  },
  stadtplan: {
    title: 'Stadtplan',
    layers: 'amtlich@90',
    description: `Kartendienst (WMS) des Regionalverbandes Ruhr (RVR). Datengrundlage:
            <strong>Stadtkarte 2.0</strong>. Wöchentlich in einem automatischen Prozess
            aktualisierte Zusammenführung des Straßennetzes der OpenStreetMap
            mit Amtlichen Geobasisdaten des Landes NRW aus den Fachverfahren
            ALKIS (Gebäude, Flächennutzungen) und ATKIS (Gewässer). © RVR und
            Kooperationspartner (
            <a href="https://www.govdata.de/dl-de/by-2-0">
              Datenlizenz Deutschland - Namensnennung - Version 2.0
            </a>
            ). Lizenzen der Ausgangsprodukte:
            <a href="https://www.govdata.de/dl-de/zero-2-0">
              Datenlizenz Deutschland - Zero - Version 2.0
            </a>
            (Amtliche Geobasisdaten) und
            <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL</a>
            (OpenStreetMap contributors).`,
    url: 'https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
  },
};

const TopNavbar = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  // @ts-ignore
  const { setAppMenuVisible } = useContext(UIDispatchContext);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const dispatch = useDispatch();
  const thumbnails = useSelector(getThumbnails);
  const activeLayers = useSelector(getLayers);
  const showLayerButtons = useSelector(getShowLayerButtons);
  const focusMode = useSelector(getFocusMode);

  const [messageApi, contextHolder] = message.useMessage();

  const updateLayers = (layer: Item) => {
    let newLayer: Layer;

    if (layer.type === 'layer') {
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
          };
          break;
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
      />

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <p className="mb-0 font-semibold text-lg">
            DigiTal Zwilling / Geoportal
          </p>
        </div>
      </div>

      <div className="flex items-center gap-6 absolute left-1/2 -ml-[62px]">
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
        <Tooltip title="Teilen">
          <Popover trigger="click" placement="bottom" content={<Share />}>
            <button className="hover:text-gray-600 text-xl">
              <FontAwesomeIcon icon={faShareNodes} />
            </button>
          </Popover>
        </Tooltip>
        <Tooltip title="Speichern">
          <Popover trigger="click" placement="bottom" content={<Save />}>
            <button className="hover:text-gray-600 text-xl">
              <FontAwesomeIcon icon={faFileExport} />
            </button>
          </Popover>
        </Tooltip>
      </div>

      <div className="flex items-center gap-6">
        <div className="lg:flex hidden">
          <Radio.Group
            value={backgroundLayer.id}
            onChange={(e) => {
              // setSelectedBackground(e.target.value);
              dispatch(
                setBackgroundLayer({
                  id: e.target.value,
                  title: layerMap[e.target.value].title,
                  opacity: 1.0,
                  description: layerMap[e.target.value].description,
                  layerType: 'wmts',
                  visible: true,
                  props: {
                    name: '',
                    url: layerMap[e.target.value].url,
                  },
                  layers: layerMap[e.target.value].layers,
                })
              );
            }}
          >
            <Radio.Button value="stadtplan">Stadtplan</Radio.Button>
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
