import React from 'react';
import ReactDOM from 'react-dom';

import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

import './index.css';
// import "antd/dist/antd.min.css";
import 'bootstrap/dist/css/bootstrap.min.css';
import 'leaflet/dist/leaflet.css';
import 'react-bootstrap-typeahead/css/Typeahead.css';
import './customTopicMaps.css';
import 'whatwg-fetch';
import { PLAYGROUND } from './constants/belis';

let appOverlayStyle;

if (PLAYGROUND === true) {
  appOverlayStyle = {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    border: '6px solid #46EE57',
    pointerEvents: 'none', // This ensures the overlay doesn't interfere with any interactions
    boxSizing: 'border-box',
    zIndex: 999999, // High z-index to ensure it's on top
  };
} else if (PLAYGROUND === 'unconfigured') {
  appOverlayStyle = {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    border: '6px solid #F62143',
    pointerEvents: 'none', // This ensures the overlay doesn't interfere with any interactions
    boxSizing: 'border-box',
    zIndex: 999999, // High z-index to ensure it's on top
  };
} else {
  appOverlayStyle = {};
}

ReactDOM.render(
  <React.StrictMode>
    <React.StrictMode>
      <App />
      <div style={appOverlayStyle}></div>
    </React.StrictMode>
  </React.StrictMode>,
  document.getElementById('root')
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://cra.link/PWA
serviceWorkerRegistration.register();
