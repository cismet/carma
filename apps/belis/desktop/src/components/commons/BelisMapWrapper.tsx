import { CarmaMap } from "@carma-mapping/core";
import { useDispatch } from "react-redux";
import { setSelectedFeature } from "../../store/slices/featureCollection";
import { AppDispatch } from "../../store";
import OnMapList from "../ui/OnMapList";
import { useMapSelection } from "@carma-mapping/engines/maplibre";
import { useEffect } from "react";

const LIST_WIDTH = 300;

const BelisMapLibWrapper = ({ mapSizes }) => {
  const dispatch: AppDispatch = useDispatch();
  const { selectedFeature } = useMapSelection();

  // Sync selection to Redux store when map selection changes
  useEffect(() => {
    if (selectedFeature) {
      dispatch(setSelectedFeature({ ...selectedFeature, selected: true }));
    }
  }, [selectedFeature, dispatch]);

  const mapWidth = mapSizes.width - LIST_WIDTH;

  return (
    <div
      className="relative flex"
      style={{ width: mapSizes.width, height: mapSizes.height }}
    >
      <OnMapList
        visibleMapWidth={mapWidth}
        visibleMapHeight={mapSizes.height}
      />
      <div style={{ width: mapWidth, height: mapSizes.height }}>
        <CarmaMap
          mapEngine="maplibre"
          embedded
          backgroundLayers="" //basemap_grey@60" // "wupp-plan-live-tiles-3857" // "basemap_grey" // "basemap_relief" // "basemap_color"
          // backgroundLayers="basemap_grey@60" //" // "wupp-plan-live-tiles-3857" // "basemap_grey" // "basemap_relief" // "basemap_color"
          terrainControl={false}
          fullScreenControl={false}
          libreLayers={[
            // --- Background layers for testing ---
            // RVR
            {
              type: "wmts",
              url: "https://geodaten.metropoleruhr.de/spw2/service",
              layers: "spw2_light",
              version: "1.3.0",
              transparent: true,
              format: "image/png",
              tileSize: 512,
              maxZoom: 26,
            },
            // Liegenschaftskarte (grau)
            // {
            //   type: "wmts",
            //   url: "http://rpr.s10222.wuppertal-intra.de/forwardingTo/s10221/7098/alkis/services",
            //   //url: "http://s10221.wuppertal-intra.de:7098/alkis/services",
            //   layers: "alkomgw",
            //   styles: "default",
            //   version: "1.1.1",
            //   tileSize: 256,
            //   maxZoom: 26,
            //   transparent: true,
            //   format: "image/png",
            //   opacity: 0.5,
            // },
            // // Liegenschaftskarte (bunt)
            // {
            //   type: "wmts",
            //   url: "http://rpr.s10222.wuppertal-intra.de/forwardingTo/s10221/7098/alkis/services",
            //   //url: "http://s10221.wuppertal-intra.de:7098/alkis/services",
            //   layers: "alkomf",
            //   styles: "default",
            //   version: "1.1.1",
            //   tileSize: 256,
            //   transparent: true,
            //   format: "image/png",
            //   opacity: 0.5,
            // },
            // // True Orthofoto
            // {
            //   type: "wms",
            //   url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
            //   layers: "GIS-102:trueortho2024",
            //   tileSize: 256,
            //   transparent: true,
            //   maxZoom: 26,
            //   format: "image/png",
            // },
            // Luftbildkarte (SPW2 light Grundriss)
            // {
            //   type: "wmts",
            //   url: "https://geodaten.metropoleruhr.de/spw2/service",
            //   layers: "spw2_light_grundriss",
            //   version: "1.3.0",
            //   transparent: true,
            //   format: "image/png",
            //   maxZoom: 26,
            // },
            // // Luftbildkarte (True Ortho underlay)
            // {
            //   type: "wms",
            //   url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
            //   layers: "GIS-102:trueortho2024",
            //   tileSize: 256,
            //   transparent: true,
            //   maxZoom: 26,
            //   format: "image/png",
            // },
            // // Luftbildkarte (DOP Overlay)
            // {
            //   type: "wmts",
            //   url: "https://geodaten.metropoleruhr.de/dop/dop_overlay?language=ger",
            //   layers: "dop_overlay",
            //   version: "1.3.0",
            //   format: "image/png",
            //   transparent: true,
            //   maxZoom: 26,
            // },
            // Stadtplan (grau)
            // {
            //   type: "vector",
            //   name: "Stadtplan grau",
            //   style:
            //     "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_gry.json",
            //   opacity: 0.5,
            // },
            // Stadtplan (bunt)
            // {
            //   type: "vector",
            //   name: "Stadtplan bunt",
            //   style:
            //     "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_top.json",
            //   opacity: 0.5,
            // },
            {
              type: "vector",
              name: "Leuchten",
              style: "https://tiles.cismet.de/belis/style.json",
              opacity: 1,
            },
          ]}
        />
      </div>
    </div>
  );
};

export default BelisMapLibWrapper;
