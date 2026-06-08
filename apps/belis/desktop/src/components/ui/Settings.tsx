import { useDispatch, useSelector } from "react-redux";
import { Button, Checkbox, Popconfirm, Radio, Slider, Switch, message } from "antd";
import { clearAllDefaults } from "../../store/slices/creationDefaults";
import {
  getActiveBackgroundLayer,
  getBackgroundLayerOpacities,
  getActiveAdditionalLayers,
  getAdditionalLayerOpacities,
  setActiveBackgroundLayer,
  setBackgroundLayerOpacities,
  setActiveAdditionalLayers,
  setAdditionalLayerOpacities,
  isInPaleMode,
  setPaleModeActive,
  isDangerousDeleteModeActive,
  setDangerousDeleteMode,
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
  const inPaleMode = useSelector(isInPaleMode);
  const dangerousDeleteMode = useSelector(isDangerousDeleteModeActive);

  return (
    <div className="flex flex-col gap-10 min-h-full">
      <div className="flex flex-col gap-2 flex-1">
        <h2 className="text-2xl font-medium">Karte</h2>

        <div className="flex items-center justify-between">
          <span className="text-[18px]">Blass</span>
          <Switch
            checked={inPaleMode}
            onChange={(checked) => dispatch(setPaleModeActive(checked))}
            style={{ transform: "scale(1.2)", transformOrigin: "right center" }}
          />
        </div>

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
      <div className="flex flex-col gap-2">
        <h4 className="text-lg font-medium">Gemerkte Vorbelegung</h4>
        <Popconfirm
          title="Gemerkte Felder zurücksetzen"
          description="Alle gemerkten Vorbelegungen werden gelöscht. Fortfahren?"
          okText="Zurücksetzen"
          cancelText="Abbrechen"
          onConfirm={() => {
            dispatch(clearAllDefaults());
            message.success("Gemerkte Felder zurückgesetzt");
          }}
        >
          <Button block>Gemerkte Felder zurücksetzen</Button>
        </Popconfirm>
      </div>
      <div className="flex flex-col gap-2 rounded-md border border-[#f5c2c7] overflow-hidden">
        <div className="bg-[#fff5f5] px-3 py-2 border-b border-[#f5c2c7]">
          <span className="text-[#cf222e] font-semibold text-sm">
            Gefahrenzone
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-1">
          <div className="flex flex-col">
            <span className="text-[15px] font-medium">Löschmodus</span>
            <span className="text-[12px] text-gray-500">
              Blendet im Fachobjekt einen Button zum Löschen ein. Vorsicht: nicht
              umkehrbar.
            </span>
          </div>
          <Switch
            checked={dangerousDeleteMode}
            onChange={(checked) =>
              dispatch(setDangerousDeleteMode(checked))
            }
            style={{ transform: "scale(1.2)", transformOrigin: "right center" }}
          />
        </div>
      </div>
      <VersionInfo version={getApplicationVersion(versionData)} />
    </div>
  );
};

export default Settings;
