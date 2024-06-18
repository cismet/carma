import { useEffect, useRef } from 'react';
import L from 'leaflet';

const useLocator = (mapRef) => {
  const lcRef = useRef(null);

  useEffect(() => {
    if (mapRef && mapRef.current) {
      const mapExample = mapRef.current.leafletElement;
      const lc = L.control
        .locate({
          position: 'topright',
          strings: {
            title: 'demo location',
          },
          flyTo: true,
          drawMarker: false,
          icon: 'custom_icon',
        })
        .addTo(mapExample);

      lcRef.current = lc;
    }
  }, [mapRef]);

  const startLocateControl = () => {
    if (lcRef.current) {
      console.log('yyy');
      lcRef.current.start();
    }
  };

  return { startLocateControl };
};

export default useLocator;
