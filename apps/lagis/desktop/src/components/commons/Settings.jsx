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
} from "../../store/slices/ui";
import { configuration as additionalLayerConfigurations } from "./AdditionalLayers";
import { configuration as backgroundLayerConfigurations } from "./BackgroundLayers";
import { Checkbox, Radio, Slider, Switch } from "antd";
import { drawerTextsHelper } from "@carma-collab/wuppertal/lagis-desktop";

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
        onAfterChange={(value) => opacityChanged(layerkey, value / 100)}
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
  return (
    <div className="flex items-center gap-2 hover:bg-zinc-100 p-1">
      <Radio value={layerkey} className="min-w-[calc(52%-22px)]">
        {title}
      </Radio>
      <Slider
        defaultValue={opacity * 100}
        disabled={false}
        className="w-full"
        onAfterChange={(value) => opacityChanged(layerkey, value / 100)}
      />
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
          },
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
              },
            )}
          </div>
        </Radio.Group>
      </div>
    </div>
  );
};

export default Settings;
