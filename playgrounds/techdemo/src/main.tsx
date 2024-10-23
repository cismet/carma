import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';

import * as serviceWorkerRegistration from './app/serviceWorkerRegistration';
import App from './app/App';
import Landing from './app/Landing';
import LibreMap from './app/LibreMap';
import Klima from './app/klima/App';
import SensorMap from './app/SensorMap';
// xx
const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <StrictMode>
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Landing></Landing>}></Route>

          <Route path="/turnableTopicMap" element={<LibreMap />}></Route>

          <Route path="/topicmapWithNewLocator" element={<App />}></Route>

          <Route path="/sensorDemo" element={<SensorMap />}></Route>
          <Route path="/qrklima" element={<Klima />}></Route>
        </Routes>
      </div>
    </Router>
  </StrictMode>
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://cra.link/PWA
serviceWorkerRegistration.unregister();
