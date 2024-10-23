import { useContext, useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import proj4 from "proj4";
import CismapLayer from "react-cismap/CismapLayer";
import { proj4crs25832def } from "react-cismap/constants/gis";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import ExtraMarker from "react-cismap/ExtraMarker";
import { useDispatch, useSelector } from "react-redux";
import { getLeafNodes } from "../helper/featureInfo";
import {
  getLayerMode,
  getVectorStyle,
  setGMLOutput,
  setJSONOutput,
  setOldVariant,
  setVectorOutput,
} from "../store/slices/mapping";
import InfoBox from "react-cismap/topicmaps/InfoBox";
import { getActionLinksForFeature } from "react-cismap/tools/uiHelper";
import { TopicMapDispatchContext } from "react-cismap/contexts/TopicMapContextProvider";
import type { LatLng, Point } from "leaflet";

interface MapProps {
  layer: { name: string; url: string } | null;
  selectedFeature: {
    properties: {
      [key: string]: string;
    };
  } | null;
}

const Map = ({ layer, selectedFeature }: MapProps) => {
  const [height, setHeight] = useState(0);
  const [width, setWidth] = useState(0);
  const [pos, setPos] = useState<[number, number] | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const vectorStyle = useSelector(getVectorStyle);
  const layerMode = useSelector(getLayerMode);
  const dispatch = useDispatch();
  const { zoomToFeature } = useContext<typeof TopicMapDispatchContext>(
    TopicMapDispatchContext,
  );

  useEffect(() => {
    const handleResize = () => {
      if (wrapperRef.current) {
        setHeight(wrapperRef.current.clientHeight);
        setWidth(wrapperRef.current.clientWidth);
      }
    };

    window.addEventListener("resize", handleResize);

    handleResize();

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  let links = [];
  if (selectedFeature) {
    links = getActionLinksForFeature(selectedFeature, {
      displayZoomToFeature: true,
      zoomToFeature: () => {
        if (selectedFeature) {
          const f = JSON.stringify(selectedFeature, null, 2);
          const pf = JSON.parse(f);
          pf.crs = {
            type: "name",
            properties: {
              name: "urn:ogc:def:crs:EPSG::4326",
            },
          };
          console.log("xxx zoomToFeature", pf);

          zoomToFeature(pf);
        }
      },
    });
  }

  return (
    <div className="h-full w-full" ref={wrapperRef}>
      <TopicMapComponent
        hamburgerMenu={false}
        locatorControl={false}
        fullScreenControl={false}
        mapStyle={{ width, height }}
        leafletMapProps={{ editable: true }}
        minZoom={5}
        backgroundlayers="wupp-plan-live"
        gazetteerSearchControl={false}
        infoBox={
          selectedFeature ? (
            <InfoBox
              pixelwidth={350}
              currentFeature={selectedFeature}
              hideNavigator={true}
              header="kjshd"
              headerColor="#ff0000"
              {...selectedFeature?.properties}
              noCurrentFeatureTitle="nix da"
              noCurrentFeatureContent="nix da"
              links={links}
            />
          ) : (
            <></>
          )
        }
        onclick={(e: {
          containerPoint: Point;
          latlng: LatLng;
          layerPoint: Point;
          originalEvent: PointerEvent;
          sourceTarget: HTMLElement;
          target: HTMLElement;
          type: string;
        }) => {
          if (layerMode === "default") {
            // TODO fix type mapping
            const pos = proj4(
              proj4.defs("EPSG:4326") as unknown as string,
              proj4crs25832def,
              [e.latlng.lng, e.latlng.lat],
            );

            setPos([e.latlng.lat, e.latlng.lng]);

            if (layer && pos[0] && pos[1]) {
              const minimalBoxSize = 1;
              const url =
                layer.url +
                `?SERVICE=WMS&request=GetFeatureInfo&format=image%2Fpng&transparent=true&version=1.1.1&tiled=true&width=10&height=10&srs=EPSG%3A25832&` +
                `bbox=` +
                `${pos[0] - minimalBoxSize},` +
                `${pos[1] - minimalBoxSize},` +
                `${pos[0] + minimalBoxSize},` +
                `${pos[1] + minimalBoxSize}&` +
                `x=5&y=5&` +
                `layers=${layer.name}&` +
                `feature_count=100&QUERY_LAYERS=${layer.name}&`;

              const imgUrl =
                layer.url +
                `
            ?&VERSION=1.1.1&REQUEST=GetFeatureInfo&BBOX=` +
                `${pos[0] - minimalBoxSize},` +
                `${pos[1] - minimalBoxSize},` +
                `${pos[0] + minimalBoxSize},` +
                `${pos[1] + minimalBoxSize}` +
                `&WIDTH=10&HEIGHT=10&SRS=EPSG:25832&FORMAT=image/png&TRANSPARENT=TRUE&BGCOLOR=0xF0F0F0&EXCEPTIONS=application/vnd.ogc.se_xml&FEATURE_COUNT=99&LAYERS=${layer.name}&STYLES=default&QUERY_LAYERS=${layer.name}&INFO_FORMAT=text/html&X=5&Y=5
            `;

              fetch(url)
                .then((response) => response.text())
                .then((data) => {
                  const parser = new DOMParser();
                  const xmlDoc = parser.parseFromString(data, "text/xml");
                  const content =
                    xmlDoc.getElementsByTagName("gml:featureMember")[0];
                  dispatch(
                    setGMLOutput(
                      content?.outerHTML
                        ? content.outerHTML
                        : "Nichts gefunden",
                    ),
                  );

                  dispatch(
                    setJSONOutput(
                      content?.outerHTML ? getLeafNodes(content) : "",
                    ),
                  );
                });

              fetch(imgUrl)
                .then((response) => response.text())
                .then((data) => {
                  dispatch(setOldVariant(data));
                });
            }
          }
        }}
      >
        {layer && layerMode === "default" && (
          <CismapLayer
            key={layer.name}
            url={layer.url}
            maxZoom={26}
            layers={layer.name}
            format="image/png"
            tiled={true}
            transparent="true"
            pane="additionalLayers1"
            opacity={0.7}
            type={"wmts"}
          />
        )}
        {vectorStyle && layerMode === "vector" && (
          <CismapLayer
            key={vectorStyle}
            type={"vector"}
            style={vectorStyle}
            pane="additionalLayers2"
            opacity={1}
            maxSelectionCount={1}
            selectionEnabled
            onSelectionChanged={(e: { hits: any[]; hit: any }) => {
              if (e.hits?.length > 0) {
                const selectedFeature = e.hits[0];

                const p = selectedFeature.properties;
                dispatch(setVectorOutput(p));
              }
            }}
          />
        )}
        {pos && (
          <ExtraMarker
            markerOptions={{ markerColor: "cyan", spin: false }}
            position={pos}
          />
        )}
      </TopicMapComponent>
    </div>
  );
};

export default Map;
