import { useDispatch, useSelector } from "react-redux";
import { Checkbox, Radio, Slider } from "antd";
import {
  getActiveBackgroundLayer,
  getBackgroundLayerOpacities,
  getActiveAdditionalLayers,
  getAdditionalLayerOpacities,
  setActiveBackgroundLayer,
  setBackgroundLayerOpacities,
  setActiveAdditionalLayers,
  setAdditionalLayerOpacities,
} from "../../store/slices/mapSettings";
import {
  backgroundLayerConfigs,
  additionalLayerConfigs,
} from "../../config/mapLayerConfigs";
import versionData from "../../version.json";
import { getApplicationVersion } from "@carma-commons/utils";

interface VersionInfoProps {
  textColor?: string;
  version: string;
  fontSize?: string;
}

const VersionInfo = ({
  textColor = "#888",
  version,
  fontSize = "9px",
}: VersionInfoProps) => {
  return (
    <div style={{ color: textColor, fontSize }}>
      <span>{version}</span>
    </div>
  );
};

const BackgroundLayerRow = ({
  layerkey,
  title,
  opacity = 1,
  opacityChanged = (layerkey: string, value: number) => {},
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

const AdditionalLayerRow = ({
  layerkey,
  title,
  active,
  activeChanged,
  opacity = 1,
  opacityChanged,
}: {
  layerkey: string;
  title: string;
  active: boolean;
  activeChanged: (layerkey: string) => void;
  opacity?: number;
  opacityChanged: (layerkey: string, value: number) => void;
}) => {
  return (
    <div className="flex items-center gap-2 hover:bg-zinc-100 p-1">
      <Checkbox
        checked={active}
        onChange={() => activeChanged(layerkey)}
        className="min-w-[calc(52%-22px)]"
      >
        {title}
      </Checkbox>
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
  const backgroundLayerOpacities = useSelector(getBackgroundLayerOpacities);
  const activeBackgroundLayer = useSelector(getActiveBackgroundLayer);
  const activeAdditionalLayers = useSelector(getActiveAdditionalLayers);
  const additionalLayerOpacities = useSelector(getAdditionalLayerOpacities);

  return (
    <div className="flex flex-col gap-10 h-full">
      <div className="flex flex-col gap-2 flex-1">
        <h2 className="text-2xl font-medium">Karte</h2>

        <div className="flex flex-col gap-2">
          <h4 className="text-lg font-medium">Optionale Layer</h4>
          <div className="flex flex-col gap-2 p-1">
            {Object.keys(additionalLayerConfigs).map((layerConfKey) => {
              const layerConf = additionalLayerConfigs[layerConfKey];
              return (
                <AdditionalLayerRow
                  key={layerConfKey}
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
                    dispatch(setActiveAdditionalLayers(activeLayers));
                  }}
                  opacity={additionalLayerOpacities[layerConfKey]}
                  opacityChanged={(layerkey, opacity) => {
                    const opacities = { ...additionalLayerOpacities };
                    opacities[layerkey] = opacity;
                    dispatch(setAdditionalLayerOpacities(opacities));
                  }}
                />
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h4 className="text-lg font-medium">Hintergrund</h4>
          <Radio.Group
            onChange={(e) => {
              dispatch(setActiveBackgroundLayer(e.target.value));
            }}
            value={activeBackgroundLayer}
          >
            <div className="flex flex-col gap-2 p-1">
              {Object.keys(backgroundLayerConfigs).map((layerConfKey) => {
                const layerConf = backgroundLayerConfigs[layerConfKey];
                return (
                  <BackgroundLayerRow
                    key={layerConfKey}
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
              })}
            </div>
          </Radio.Group>
        </div>
      </div>
      <VersionInfo version={getApplicationVersion(versionData)} />
    </div>
  );
};

export default Settings;
