import { HashRouter, Route, Routes } from 'react-router-dom';

// Cesium Styles
import 'cesium/Build/Cesium/Widgets/widgets.css';
import Navigation from './components/Navigation';
import LocationProvider from './components/LocationProvider';
import { Provider } from 'react-redux';
import store from './store';
import { viewerRoutes, otherRoutes } from './routes';
import CustomViewer from './components/CustomViewer';

import { routeGenerator } from './utils/routeGenerator';

import 'leaflet/dist/leaflet.css';

const ViewerRoutes = routeGenerator(viewerRoutes);
const OtherRoutes = routeGenerator(otherRoutes);

export function App() {
  return (
    <Provider store={store}>
      <HashRouter>
        <LocationProvider>
          <Navigation
            className="leaflet-bar"
            style={{
              position: 'absolute',
              bottom: 60,
              left: '50%',
              width: 500,
              display: 'flex',
              justifyContent: 'center',
              transform: 'translate(-50%, 0)',
              zIndex: 10,
            }}
            routes={[...viewerRoutes, ...otherRoutes]}
          />
          <Routes>
            <Route
              path="/*"
              element={
                <CustomViewer>
                  <Routes>{...ViewerRoutes}</Routes>
                </CustomViewer>
              }
            />
            {...OtherRoutes}
          </Routes>
        </LocationProvider>
      </HashRouter>
    </Provider>
  );
}
export default App;
