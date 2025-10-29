import { useDispatch, useSelector } from "react-redux";
import {
  getSyncLandparcel,
  setSyncLandparcel,
  getBackgroundLayerOpacities,
  getActiveBackgroundLayer,
  getActiveAdditionalLayers,
  setActiveBackgroundLayer,
  setBackgroundLayerOpacities,
  setActiveAdditionaLayers,
  setAdditionalLayerOpacities,
  getAdditionalLayerOpacities,
  getSelectedTrueOrthoYear,
  setSelectedTrueOrthoYear,
} from "../../store/slices/ui";
import { configuration as additionalLayerConfigurations } from "./AdditionalLayers";
import { configuration as backgroundLayerConfigurations } from "./BackgroundLayers";
import { Checkbox, Radio, Slider, Switch, Tag } from "antd";
import { drawerTextsHelper } from "@carma-collab/wuppertal/lagis-desktop";

export const dynamicOrtho = {
  2018: {
    label: "2018",
    type: "wms",
    url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
    layers: `GIS-102:trueortho2018`,
    tileSize: 256,
    transparent: true,
    pane: "backgroundLayers",
    maxZoom: 26,
    format: "image/png",
  },
  2020: {
    label: "2020",
    type: "wms",
    url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
    layers: `GIS-102:trueortho2020`,
    tileSize: 256,
    transparent: true,
    pane: "backgroundLayers",
    maxZoom: 26,
    format: "image/png",
  },
  2022: {
    label: "2022",
    type: "wms",
    url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
    layers: `GIS-102:trueortho2022`,
    tileSize: 256,
    transparent: true,
    pane: "backgroundLayers",
    maxZoom: 26,
    format: "image/png",
  },
  2024: {
    label: "2024",
    type: "wms",
    url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
    layers: `GIS-102:trueortho2024`,
    tileSize: 256,
    transparent: true,
    pane: "backgroundLayers",
    maxZoom: 26,
    format: "image/png",
  },
};

const trueOrthoYears = Object.keys(dynamicOrtho).map(Number).sort();

const SettingsRow = ({ onClick, title, children }) => {
  return (
    <div
      className="flex items-center justify-between hover:bg-zinc-100 p-1 cursor-pointer"
      onClick={onClick}
    >
      <span>{title}</span>
      {children}
    </div>
  );
};

const AdditionalLayerRow = ({
  layerkey,
  title,
  active,
  opacity = 1,
  activeChanged = (layerkey) => {
    console.log(" activeChanged", layerkey);
  },

  opacityChanged = (key, opacity) => {
    console.log(" opacityChanged", key, opacity);
  },
}) => {
  return (
    <div
      key={"div." + layerkey}
      className="flex items-center gap-2 hover:bg-zinc-100 p-1"
    >
      <Checkbox
        className="w-7"
        checked={active}
        onClick={() => activeChanged(layerkey)}
      />
      <span
        className="w-[calc(90%-10px)] cursor-pointer"
        onClick={() => activeChanged(layerkey)}
      >
        {title}
      </span>

      <Slider
        defaultValue={opacity * 100}
        disabled={false}
        className="w-full"
        onAfterChange={(value) =>
          opacityChanged(layerkey, value === 0 ? 0.001 : value / 100)
        }
      />
    </div>
  );
};

const BackgroundLayerRow = ({
  layerkey,
  title,
  opacity = 1,
  opacityChanged = (e) => {},
}) => {
  const dispatch = useDispatch();
  const selectedYear = useSelector(getSelectedTrueOrthoYear);
  const activeBackgroundLayer = useSelector(getActiveBackgroundLayer);

  return (
    <div>
      <div className="flex items-center gap-2 hover:bg-zinc-100 p-1">
        <Radio value={layerkey} className="min-w-[calc(52%-22px)]">
          {title}
        </Radio>
        <Slider
          defaultValue={opacity * 100}
          disabled={false}
          className="w-full"
          onAfterChange={(value) =>
            opacityChanged(layerkey, value === 0 ? 0.001 : value / 100)
          }
        />
      </div>
      {layerkey === "trueOrtho" && activeBackgroundLayer === "trueOrtho" && (
        <div className="ml-[28px]">
          {trueOrthoYears.map((year) => {
            const isSelected = year === selectedYear;
            return (
              <Tag
                key={year}
                size="small"
                className="mb-2"
                disabled={false}
                // color={isSelected ? "blue" : "default"}
                style={{
                  backgroundColor: isSelected ? "#1777ff" : undefined,
                  borderColor: isSelected ? "#1777ff" : undefined,
                  color: isSelected ? "white" : undefined,
                  cursor: "pointer",
                }}
                onClick={() => dispatch(setSelectedTrueOrthoYear(year))}
              >
                <span className="cursor-pointer">
                  {dynamicOrtho[year].label}
                </span>
              </Tag>
            );
          })}
        </div>
      )}
    </div>
  );
};

const Settings = () => {
  const dispatch = useDispatch();
  const syncKassenzeichen = useSelector(getSyncLandparcel);
  const backgroundLayerOpacities = useSelector(getBackgroundLayerOpacities);
  const additionalLayerOpacities = useSelector(getAdditionalLayerOpacities);
  const activebBackgroundLayer = useSelector(getActiveBackgroundLayer);
  const activeAdditionalLayers = useSelector(getActiveAdditionalLayers);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h3>{drawerTextsHelper.allgemeinTitle}</h3>
        <SettingsRow
          onClick={() => dispatch(setSyncLandparcel(!syncKassenzeichen))}
          title={drawerTextsHelper.synchronisierenText}
        >
          <Switch className="w-fit" checked={syncKassenzeichen} />
        </SettingsRow>
      </div>
      <div className="flex flex-col gap-2">
        <h3>{drawerTextsHelper.karteTitle}</h3>
        <h4>{drawerTextsHelper.optionaleTitle}</h4>
        {Object.keys(additionalLayerConfigurations).map(
          (layerConfKey, index) => {
            const layerConf = additionalLayerConfigurations[layerConfKey];
            return (
              <AdditionalLayerRow
                layerkey={layerConfKey}
                title={layerConf.title}
                active={activeAdditionalLayers.includes(layerConfKey)}
                activeChanged={(layerkey) => {
                  const activeLayers = [...activeAdditionalLayers];
                  if (activeLayers.includes(layerkey)) {
                    activeLayers.splice(activeLayers.indexOf(layerkey), 1);
                  } else {
                    activeLayers.push(layerkey);
                  }
                  dispatch(setActiveAdditionaLayers(activeLayers));
                }}
                opacity={additionalLayerOpacities[layerConfKey]}
                opacityChanged={(layerkey, opacity) => {
                  const opacities = { ...additionalLayerOpacities };
                  opacities[layerkey] = opacity;

                  dispatch(setAdditionalLayerOpacities(opacities));
                }}
              />
            );
          }
        )}

        <h4>{drawerTextsHelper.hintergrundTitle}</h4>
        <Radio.Group
          onChange={(e) => {
            dispatch(setActiveBackgroundLayer(e.target.value));
          }}
          value={activebBackgroundLayer}
        >
          <div className="flex flex-col gap-2 p-1">
            {Object.keys(backgroundLayerConfigurations).map(
              (layerConfKey, index) => {
                const layerConf = backgroundLayerConfigurations[layerConfKey];
                return (
                  <BackgroundLayerRow
                    layerkey={layerConfKey}
                    title={layerConf.title}
                    opacity={backgroundLayerOpacities[layerConfKey]}
                    opacityChanged={(layerkey, opacity) => {
                      const opacities = { ...backgroundLayerOpacities };
                      opacities[layerkey] = opacity;
                      dispatch(setBackgroundLayerOpacities(opacities));
                    }}
                  />
                );
              }
            )}
          </div>
        </Radio.Group>
      </div>
    </div>
  );
};

export default Settings;
