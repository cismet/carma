import { useDispatch, useSelector } from "react-redux";
import { Radio, Slider } from "antd";
import {
  getActiveBackgroundLayer,
  getBackgroundLayerOpacities,
  setActiveBackgroundLayer,
  setBackgroundLayerOpacities,
} from "../../store/slices/mapSettings";
import { backgroundLayerConfigurations } from "@carma-apps/belis-library";

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

const Settings = () => {
  const dispatch = useDispatch();
  const backgroundLayerOpacities = useSelector(getBackgroundLayerOpacities);
  const activeBackgroundLayer = useSelector(getActiveBackgroundLayer);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-medium">Karte</h2>
        <div className="flex flex-col gap-2">
          <h4 className="text-lg font-medium">Hintergrund</h4>
          <Radio.Group
            onChange={(e) => {
              dispatch(setActiveBackgroundLayer(e.target.value));
            }}
            value={activeBackgroundLayer}
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
    </div>
  );
};

export default Settings;
