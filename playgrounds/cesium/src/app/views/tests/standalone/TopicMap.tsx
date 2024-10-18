import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import StyledWMSTileLayer from "react-cismap/StyledWMSTileLayer";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "leaflet/dist/leaflet.css";

function View() {
  return (
    <TopicMapContextProvider>
      <TopicMapComponent
        gazData={[]}
        backgroundlayers="empty"
        hamburgerMenu={false}
        fullScreenControlEnabled={false}
        zoomSnap={0.5}
        zoomDelta={0.5}
      >
        {/* <StyledWMSTileLayer
          {...{
            type: 'wmts',
            url: 'https://geodaten.metropoleruhr.de/spw2/service',
            layers: 'spw2_graublau',
            version: '1.3.0',
            tileSize: 512,
            transparent: true,
            opacity: 0.3,
          }}
        ></StyledWMSTileLayer> */}
        <StyledWMSTileLayer
          {...{
            url: "https://maps.wuppertal.de/karten",
            layers: "R102:trueortho2022",
            type: "wms",
            format: "image/png",
            tiled: true,
            maxZoom: 22,
            opacity: 1,
            version: "1.1.1",
            pane: "backgroundLayers",
          }}
        ></StyledWMSTileLayer>
      </TopicMapComponent>
    </TopicMapContextProvider>
  );
}

export default View;
