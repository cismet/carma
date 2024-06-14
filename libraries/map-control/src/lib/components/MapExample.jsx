import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
// import "leaflet-draw/dist/leaflet.draw.css";
import 'leaflet.locatecontrol/dist/L.Control.Locate.css';
import 'leaflet.locatecontrol';
import StyledWMSTileLayer from 'react-cismap/StyledWMSTileLayer';

const LocateControl = ({ startLocate }) => {
  const map = useMap();
  const locateControlRef = useRef(null);

  useEffect(() => {
    const lc = L.control
      .locate({
        position: 'topright',
        strings: {
          title: 'Show me where I am!',
        },
        flyTo: true,
      })
      .addTo(map);
    locateControlRef.current = lc;

    return () => {
      lc.remove();
    };
  }, [map]);

  useEffect(() => {
    if (startLocate && locateControlRef.current) {
      locateControlRef.current.start();
    }
  }, [startLocate]);

  return null;
};

const MapExample = ({ startLocate }) => {
  const position = [51.256, 7.151];
  const mapRef = useRef(null);

  return (
    <div style={{ width: '100wh', height: 'calc(100vh - 80px)' }}>
      <MapContainer
        key={'leaflet-map-map-example'}
        center={position}
        zoom={20}
        style={{ height: 'calc(100vh - 80px)', width: '100wh' }}
        ref={mapRef}
        editable={true}
        zoomControl={false}
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
        <LocateControl startLocate={startLocate} />
      </MapContainer>
    </div>
  );
};

export default MapExample;
