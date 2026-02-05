import { CarmaMap } from "@carma-mapping/core";

const AlkisPlayground = () => {
  return (
    <div className="w-full h-screen">
      <CarmaMap
        mapEngine="maplibre"
        embedded
        terrainControl={false}
        backgroundLayers="basemap_grey@60"
        overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
        libreLayers={[
          {
            type: "vector",
            name: "Flurstuecke",
            style:
              "https://tiles.cismet.de/alkis/flurstuecke.str.hsnr.black.style.json",
          },
          // {
          //   type: "cog",
          //   name: "Orthophoto",
          //   url: "https://cog-wupp.cismet.de/output_3857.tif",
          //   opacity: 1,
          // },
        ]}
      />
    </div>
  );
};

export default AlkisPlayground;
