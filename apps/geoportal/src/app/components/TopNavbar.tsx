import { Button, Popover, Radio, Tooltip, message } from "antd";
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
  faBookOpenReader,
  faRotateRight,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useContext, useState } from "react";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";

import { LayerLib, Item, Layer } from "@carma-mapping/layers";
import { useDispatch, useSelector } from "react-redux";

import { getThumbnails, setThumbnail } from "../store/slices/layers";
import {
  appendLayer,
  appendSavedLayerConfig,
  deleteSavedLayerConfig,
  getBackgroundLayer,
  getFocusMode,
  getLayers,
  getLayerState,
  getSavedLayerConfigs,
  getSelectedMapLayer,
  removeLayer,
  setBackgroundLayer,
  setFocusMode,
  setLayers,
} from "../store/slices/mapping";
import "./switch.css";
import {
  getMode,
  getShowLayerButtons,
  setMode,
  setShowLayerButtons,
} from "../store/slices/ui";
import { cn } from "../helper/helper";
import { layerMap } from "../config";
import { Save, Share, extractVectorStyles } from "@carma-apps/portals";
import { useOverlayHelper } from "@carma/libraries/commons/ui/lib-helper-overlay";

const TopNavbar = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { setAppMenuVisible } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const selectedMapLayer = useSelector(getSelectedMapLayer);
  const layerState = useSelector(getLayerState);
  const dispatch = useDispatch();
  const thumbnails = useSelector(getThumbnails);
  const activeLayers = useSelector(getLayers);
  const showLayerButtons = useSelector(getShowLayerButtons);
  const focusMode = useSelector(getFocusMode);
  const savedLayerConfigs = useSelector(getSavedLayerConfigs);
  const mode = useSelector(getMode);
  const [messageApi, contextHolder] = message.useMessage();
  const baseUrl = window.location.origin + window.location.pathname;

  const menuTourRef = useOverlayHelper("Menüleiste");

  const hintergrundTourRef = useOverlayHelper("Hintergrund", {
    containerPos: "left",
    contentPos: "right-center",
  });
  const modalMenuTourRef = useOverlayHelper("Menü");

  const updateLayers = async (
    layer: Item,
    deleteItem: boolean = false,
    forceWMS: boolean = false,
  ) => {
    let newLayer: Layer;

    if (layer.type === "collection") {
      if (deleteItem) {
        dispatch(deleteSavedLayerConfig(layer.id));
      } else {
        try {
          dispatch(setLayers(layer.layers));
          messageApi.open({
            type: "success",
            content: `${layer.title} wurde erfolgreich angewandt.`,
          });
        } catch {
          messageApi.open({
            type: "error",
            content: `Es gab einen Fehler beim anwenden von ${layer.title}`,
          });
        }
      }
      return;
    }

    if (layer.type === "layer") {
      const vectorObject = extractVectorStyles(layer.keywords);
      if (vectorObject && !forceWMS) {
        const zoom = await fetch(vectorObject.vectorStyle)
          .then((response) => {
            return response.json();
          })
          .then((result) => {
            const minZoom =
              result.sources["poi-source"]?.minzoom ||
              result.sources["vector-tiles"]?.minzoom ||
              9;
            return {
              minZoom,
            };
          });
        newLayer = {
          title: layer.title,
          id: layer.id,
          layerType: "vector",
          opacity: 0.7,
          description: layer.description,
          visible: true,
          props: {
            style: vectorObject.vectorStyle,
            minZoom: zoom?.minZoom,
          },
          other: {
            ...layer,
          },
        };
      } else {
        switch (layer.layerType) {
          case "wmts": {
            newLayer = {
              title: layer.title,
              id: layer.id,
              layerType: "wmts",
              opacity: 0.7,
              description: layer.description,
              visible: true,
              props: {
                url: layer.props.url,
                legend: layer.props.Style[0].LegendURL,
                name: layer.props.Name,
                maxZoom: layer.maxZoom,
                minZoom: layer.minZoom,
              },
              other: {
                ...layer,
              },
            };
            break;
          }
          case "vector": {
            newLayer = {
              title: layer.title,
              id: layer.id,
              layerType: "vector",
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
          type: "success",
          content: `${layer.title} wurde erfolgreich entfernt.`,
        });
      } catch {
        messageApi.open({
          type: "error",
          content: `Es gab einen Fehler beim entfernen von ${layer.title}`,
        });
      }
    } else {
      try {
        dispatch(appendLayer(newLayer));
        messageApi.open({
          type: "success",
          content: `${layer.title} wurde erfolgreich hinzugefügt.`,
        });
      } catch {
        messageApi.open({
          type: "error",
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
            Title: "Meine Zusammenstellungen",
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

      <div
        ref={menuTourRef}
        className="flex items-center gap-6 absolute left-1/2 -ml-[140px]"
      >
        <Tooltip title="Aktualisieren">
          <button
            onClick={() => {
              window.location.reload();
            }}
            className="text-xl hover:text-gray-600"
          >
            <FontAwesomeIcon icon={faRotateRight} />
          </button>
        </Tooltip>
        <Tooltip title="Kartenebenen hinzufügen">
          <button
            onClick={() => {
              setIsModalOpen(true);
            }}
            className="h-[24.5px]"
          >
            <img
              src={baseUrl + "icons/add-layers.png"}
              alt="Kartenebenen hinzufügen"
              className="h-5 mb-0.5 cursor-pointer"
            />
          </button>
        </Tooltip>
        <Tooltip
          title={`Hintergrundkarte ${
            focusMode ? "zurücksetzen" : "abschwächen"
          }`}
        >
          <button
            className="h-[24.5px]"
            onClick={() => {
              dispatch(setFocusMode(!focusMode));
            }}
          >
            <img
              src={
                baseUrl +
                `${focusMode ? "icons/focus-on.png" : "icons/focus-off.png"}`
              }
              alt="Kartenebenen hinzufügen"
              className="h-5 mb-0.5 cursor-pointer"
            />
          </button>
        </Tooltip>
        <Tooltip
          title={`Kartensteuerelemente ${
            showLayerButtons ? "ausblenden" : "einblenden"
          }`}
        >
          <button
            className="text-xl hover:text-gray-600"
            onClick={() => {
              dispatch(setShowLayerButtons(!showLayerButtons));
            }}
          >
            <FontAwesomeIcon
              fixedWidth={true}
              icon={showLayerButtons ? faEye : faEyeSlash}
            />
          </button>
        </Tooltip>
        <Tooltip title="Speichern">
          <Popover
            trigger="click"
            placement="bottom"
            content={
              <Save
                layers={activeLayers}
                storeConfigAction={(config) =>
                  dispatch(appendSavedLayerConfig(config))
                }
              />
            }
          >
            <button className="hover:text-gray-600 text-xl">
              <FontAwesomeIcon icon={faFileExport} />
            </button>
          </Popover>
        </Tooltip>
        <Tooltip title="Drucken">
          <FontAwesomeIcon icon={faPrint} className="text-xl text-gray-300" />
        </Tooltip>
        <Tooltip title={`Hilfe ${mode === "tour" ? "ausblenden" : "anzeigen"}`}>
          <Popover trigger="click" placement="bottom">
            <button
              className="hover:text-gray-600 text-xl"
              onClick={() => {
                if (mode === "default") {
                  dispatch(setMode("tour"));
                } else {
                  dispatch(setMode("default"));
                }
              }}
            >
              <FontAwesomeIcon icon={faBookOpenReader} />
            </button>
          </Popover>
        </Tooltip>
        <Tooltip title="Teilen">
          <Popover
            trigger="click"
            placement="bottom"
            content={<Share layerState={layerState} />}
          >
            <button className="hover:text-gray-600 text-xl">
              <FontAwesomeIcon icon={faShareNodes} />
            </button>
          </Popover>
        </Tooltip>
      </div>

      <div className="flex items-center gap-6">
        <div className="lg:flex hidden" ref={hintergrundTourRef}>
          <Radio.Group
            value={backgroundLayer.id}
            onChange={(e) => {
              if (e.target.value === "karte") {
                dispatch(
                  setBackgroundLayer({ ...selectedMapLayer, id: "karte" }),
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
                    layerType: "wmts",
                    visible: true,
                    props: {
                      name: "",
                      url: layerMap[e.target.value].url,
                    },
                    layers: layerMap[e.target.value].layers,
                  }),
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
          ref={modalMenuTourRef}
        >
          <FontAwesomeIcon icon={faBars} />
        </Button>
      </div>
    </div>
  );
};

export default TopNavbar;
