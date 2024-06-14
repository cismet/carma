import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
// import "leaflet-draw/dist/leaflet.draw.css";
import StyledWMSTileLayer from 'react-cismap/StyledWMSTileLayer';
const MapExample = () => {
  const position = [51.256, 7.151];
  const mapRef = useRef(null);

  return (
    <div style={{ width: '100wh', height: 'calc(100vh - 16px)' }}>
      <MapContainer
        key={'leaflet-map-map-example'}
        center={position}
        zoom={20}
        style={{ height: 'calc(90vh - 16px)', width: '100wh' }}
        ref={mapRef}
        editable={true}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {/* <StyledWMSTileLayer
          {...{
            type: 'wmts',
            url: 'https://geodaten.metropoleruhr.de/spw2/service',
            layers: 'spw2_light_grundriss',
            version: '1.3.0',
            tileSize: 256,
            transparent: false,
            opacity: 0.6,
          }}
        ></StyledWMSTileLayer> */}
      </MapContainer>
    </div>
  );
};

export default MapExample;
