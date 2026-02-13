import { CarmaMap } from "@carma-mapping/core";

const AlkisPlayground = () => {
  return (
    <div className="w-full h-screen">
      <CarmaMap
        mapEngine="maplibre"
        embedded
        exposeMapToWindow
        terrainControl={false}
        layerMode="imperative"
        backgroundLayers="basemap_grey@20"
        overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
        libreLayers={[
          {
            type: "vector",
            name: "Flurstuecke",
            style:
              "https://tiles.cismet.de/alkis/flurstuecke.str.hsnr.black.style.json",
          },
          // {
          //   type: "vector",
          //   name: "Flurstuecke",
          //   style:
          //     "https://tiles.cismet.de/alkis/flurstuecke.str.hsnr.yellow.style.json",
          // },
        ]}
      />
    </div>
  );
};

export default AlkisPlayground;
