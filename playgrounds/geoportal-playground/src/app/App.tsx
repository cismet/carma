import 'bootstrap/dist/css/bootstrap.min.css';
import 'leaflet/dist/leaflet.css';
import 'react-bootstrap-typeahead/css/Typeahead.css';
import 'react-cismap/topicMaps.css';
import './App.css';
import './index.css';
// @ts-ignore
import TopicMapContextProvider from 'react-cismap/contexts/TopicMapContextProvider';
// @ts-ignore
import Map from './components/Map';
import TopNavbar from './components/TopNavbar';
import TempMeasure from './components/TempMeasure';
if (typeof global === 'undefined') {
  window.global = window;
}

function App() {
  return (
    <TopicMapContextProvider>
      <div className="flex flex-col h-screen w-full">
        <TopNavbar />
        <TempMeasure />
        <Map />
      </div>
    </TopicMapContextProvider>
  );
}

export default App;
