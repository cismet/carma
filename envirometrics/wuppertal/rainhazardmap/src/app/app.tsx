// eslint-disable-next-line @typescript-eslint/no-unused-vars
import styles from './app.module.css';
// import { getCollabedHelpComponentConfig } from '@cismet-collab/flooding-wupp-texts';
import EnviroMetricMap from '@cismet-dev/react-cismap-envirometrics-maps/EnviroMetricMap';
import TopicMapContextProvider from 'react-cismap/contexts/TopicMapContextProvider';
import TopicMapComponent from 'react-cismap/topicmaps/TopicMapComponent';
import GenericModalApplicationMenu from 'react-cismap/topicmaps/menu/ModalApplicationMenu';

import 'leaflet/dist/leaflet.css';

import 'bootstrap/dist/css/bootstrap.min.css';

export function App() {
  console.log('EnviroMetricMap', EnviroMetricMap);
  const version = '1.0.0';
  const reactCismapRHMVersion = '1.0.0';
  const email = 'openSource@cismet.de';
  return (
    <div>
      <TopicMapContextProvider>
        <TopicMapComponent
          // modalMenu={
          //   <GenericModalApplicationMenu
          //     {...getCollabedHelpComponentConfig({
          //       version,
          //       reactCismapRHMVersion,

          //       email,
          //     })}
          //   />
          // }
          _fullScreenControl={false}
          _zoomControls={false}
          homeZoom={19}
          gazData={undefined}
          gazetteerSearchControl={false}
        ></TopicMapComponent>
      </TopicMapContextProvider>
    </div>
  );
}

export default App;
