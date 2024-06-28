import React, { ReactNode } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';

// Cesium Styles
import 'cesium/Build/Cesium/Widgets/widgets.css';
import Navigation from './components/UI/Navigation';
import LocationProvider from './components/LocationProvider';
import { Provider } from 'react-redux';
import store from './store';
import { viewerRoutes, otherRoutes } from './routes';
import CustomViewer from './components/CustomViewer/CustomViewer';

import { routeGenerator } from './utils/routeGenerator';

import 'leaflet/dist/leaflet.css';
import { UIComponentProvider } from './components/UI/UIProvider';

import { TweakpaneProvider } from '@carma/debug-ui';

const ViewerRoutes = routeGenerator(viewerRoutes);
const OtherRoutes = routeGenerator(otherRoutes);

export function App() {
  return (
    <Provider store={store}>
      <TweakpaneProvider>
        <HashRouter>
          <LocationProvider>
            <UIComponentProvider>
              <Navigation
                className="leaflet-bar"
                style={{
                  position: 'absolute',
                  top: 8,
                  left: '50%',
                  width: 'auto',
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
            </UIComponentProvider>
          </LocationProvider>
        </HashRouter>
      </TweakpaneProvider>
    </Provider>
  );
}
export default App;
