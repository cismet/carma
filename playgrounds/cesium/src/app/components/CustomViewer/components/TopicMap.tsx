import React, { useEffect, useRef, useState } from 'react';
import { Cartesian3 } from 'cesium';
import { useCesium } from 'resium';

import TopicMapComponent from 'react-cismap/topicmaps/TopicMapComponent';
import StyledWMSTileLayer from 'react-cismap/StyledWMSTileLayer';
import { leafletToCesiumElevation } from '../../../utils/cesiumHelpers';
import {
  useShowPrimaryTileset,
  useViewerIsMode2d,
} from '../../../store/slices/viewer';

export const TopicMap = () => {
  const { viewer } = useCesium();
  const isPrimaryStyle = useShowPrimaryTileset();
  const isMode2d = useViewerIsMode2d();

  const [isFocused, setIsFocused] = useState<boolean>(false);
  const componentRef = useRef<null | HTMLDivElement>(null);

  useEffect(() => {
    const node = componentRef.current;

    if (node) {
      const handleFocus = () => setIsFocused(true);
      const handleBlur = () => setIsFocused(false);

      node.addEventListener('focusin', handleFocus);
      node.addEventListener('focusout', handleBlur);

      return () => {
        node.removeEventListener('focusin', handleFocus);
        node.removeEventListener('focusout', handleBlur);
      };
    }
  }, []);

  const handleLeafletLocationChange = (event) => {
    console.log('handleLeafletLocationChange', event, isFocused);
    if (!isFocused) {
      return;
    }
    if (viewer) {
      const { lat, lng, zoom } = event;
      const elevation = leafletToCesiumElevation(
        zoom,
        lat,
        window.devicePixelRatio
      );
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(lng, lat, elevation),
        duration: 0.25,
      });
    }
  };

  console.log('RENDER: TopicMap isMode2d', isMode2d);

  return (
    <div
      ref={componentRef}
      style={{
        animation: isMode2d ? 'fadeInOpacity 1s' : 'fadeOutOpacity 1s',
        animationFillMode: 'both',
        opacity: isMode2d ? 1 : 0,
        pointerEvents: isMode2d ? 'auto' : 'none',
      }}
      //className={isMode2d ? 'fade-in' : 'fade-out'}
    >
      <TopicMapComponent
        gazData={[]}
        backgroundlayers="empty"
        hamburgerMenu={false}
        fullScreenControlEnabled={false}
        zoomSnap={0.01}
        zoomDelta={0.01}
        locationChangedHandler={handleLeafletLocationChange}
      >
        <StyledWMSTileLayer
          {...{
            url: 'https://maps.wuppertal.de/karten',
            layers: 'R102:trueortho2022',
            type: 'wms',
            format: 'image/png',
            tiled: true,
            maxZoom: 22,
            version: '1.1.1',
            pane: 'backgroundLayers',
            opacity: isPrimaryStyle ? 1 : 0,
          }}
        ></StyledWMSTileLayer>
        <StyledWMSTileLayer
          {...{
            type: 'wmts',
            url: 'https://geodaten.metropoleruhr.de/spw2/service',
            layers: 'spw2_graublau',
            version: '1.3.0',
            tileSize: 512,
            transparent: true,
            opacity: isPrimaryStyle ? 0 : 1,
          }}
        ></StyledWMSTileLayer>
      </TopicMapComponent>
    </div>
  );
};

export default TopicMap;
