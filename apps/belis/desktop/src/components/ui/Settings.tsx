import { useDispatch, useSelector } from "react-redux";
import { Checkbox, Radio, Slider, Switch } from "antd";

// import {
//   getSyncLandparcel,
//   setSyncLandparcel,
//   getBackgroundLayerOpacities,
//   getActiveBackgroundLayer,
//   getActiveAdditionalLayers,
//   setActiveBackgroundLayer,
//   setBackgroundLayerOpacities,
//   setActiveAdditionaLayers,
//   setAdditionalLayerOpacities,
//   getAdditionalLayerOpacities,
// } from "../../store/slices/ui";
// import { configuration as additionalLayerConfigurations } from "./AdditionalLayers";
// import { configuration as backgroundLayerConfigurations } from "./BackgroundLayers";
// import { Checkbox, Radio, Slider, Switch } from "antd";
// import { drawerTextsHelper } from "@carma-collab/wuppertal/lagis-desktop";

export const backgroundLayerConfigurations = {
  liegenschaftskarteGrau: {
    title: "Liegenschaftskarte (grau)",
    conf: {
      type: "wmts",
      url: "http://s10221.wuppertal-intra.de:7098/alkis/services",
      layers: "alkomgw",
      styles: "default",
      version: "1.1.1",
      tileSize: 256,
      maxZoom: 26,

      transparent: true,
      format: "image/png",
    },
  },
  liegenschaftskarteBunt: {
    title: "Liegenschaftskarte (bunt)",
    conf: {
      type: "wmts",
      url: "http://s10221.wuppertal-intra.de:7098/alkis/services",
      layers: "alkomf",
      styles: "default",
      version: "1.1.1",
      tileSize: 256,
      transparent: true,
      format: "image/png",
    },
  },
  trueOrtho: {
    title: "True Orthofoto",
    conf: {
      type: "wms",
      url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
      layers: "GIS-102:trueortho2024",
      // url: "https://maps.wuppertal.de/karten",
      // layers: "R102:trueortho2024",
      tileSize: 256,
      transparent: true,
      pane: "backgroundLayers",
      maxZoom: 26,
      format: "image/png",
    },
  },
  lbk: {
    title: "Luftbildkarte",
    conf: [
      {
        type: "wmts",
        url: "https://geodaten.metropoleruhr.de/spw2/service",
        layers: "spw2_light_grundriss",
        version: "1.3.0",
        pane: "backgroundvectorLayers",
        transparent: true,
        format: "image/png",
        maxZoom: 26,

        tiled: false,
      },
      {
        type: "wms",
        url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
        layers: "GIS-102:trueortho2024",
        // url: "https://maps.wuppertal.de/karten",
        // layers: "R102:trueortho2024",
        tileSize: 256,
        transparent: true,
        pane: "backgroundLayers",
        maxZoom: 26,
        opacityFunction: (opacity) => opacity * 0.75,
        format: "image/png",
      },
      {
        type: "wmts",
        url: "https://geodaten.metropoleruhr.de/dop/dop_overlay?language=ger",
        layers: "dop_overlay",
        version: "1.3.0",
        tiled: false,
        format: "image/png",
        transparent: true,
        maxZoom: 26,
        pane: "additionalLayers0",
      },
    ],
  },
  stadtplanGrau: {
    title: "Stadtplan (grau)",
    conf: {
      type: "vector",
      style: "https://omt.map-hosting.de/styles/cismet-light/style.json",
      //   offlineAvailable: true,
      //   offlineDataStoreKey: "wuppBasemap",
      pane: "backgroundvectorLayers",
    },
  },
  stadtplan: {
    title: "Stadtplan (bunt)",
    conf: {
      type: "vector",
      style: "https://omt.map-hosting.de/styles/osm-bright-grey/style.json",
      //   offlineAvailable: true,
      //   offlineDataStoreKey: "wuppBasemap",
      pane: "backgroundvectorLayers",
    },
  },
};

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
  //   const backgroundLayerOpacities = useSelector(getBackgroundLayerOpacities);
  //   const additionalLayerOpacities = useSelector(getAdditionalLayerOpacities);
  //   const activebBackgroundLayer = useSelector(getActiveBackgroundLayer);
  //   const activeAdditionalLayers = useSelector(getActiveAdditionalLayers);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-medium">Karte</h2>
        <div className="flex flex-col gap-2">
          <h4 className="text-lg font-medium">Hintergrund</h4>
          <Radio.Group
            onChange={(e) => {
              // dispatch(setActiveBackgroundLayer(e.target.value));
            }}
            //   value={activebBackgroundLayer}
          >
            <div className="flex flex-col gap-2 p-1">
              {Object.keys(backgroundLayerConfigurations).map(
                (layerConfKey, index) => {
                  const layerConf = backgroundLayerConfigurations[layerConfKey];
                  return (
                    <BackgroundLayerRow
                      layerkey={layerConfKey}
                      title={layerConf.title}
                      //   opacity={backgroundLayerOpacities[layerConfKey]}
                      opacity={1}
                      opacityChanged={(layerkey, opacity) => {
                        const opacities = { ...backgroundLayerOpacities };
                        opacities[layerkey] = opacity;
                        //   dispatch(setBackgroundLayerOpacities(opacities));
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
