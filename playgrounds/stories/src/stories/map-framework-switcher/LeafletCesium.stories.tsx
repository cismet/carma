import type { Meta, StoryObj } from '@storybook/react';
import { useEffect, useRef, useState } from 'react';
import { Button, Card, Tag } from 'antd';
import { CesiumWidget, CesiumTerrainProvider, Cartesian3 } from '@carma/cesium';
import { degToRadNumeric } from '@carma/units/helpers';
import {
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
  WUPPERTAL,
} from '@carma-commons/resources';
import { TransitionStage } from '@carma-mapping/engines-interop';
import { MapFrameworkSwitcher } from '@carma-mapping/components';
import { useMapFrameworkSwitcher } from './use-map-framework-switcher';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'cesium/Build/Cesium/Widgets/widgets.css';

// Configure Cesium base URL for Storybook
if (typeof window !== 'undefined') {
  (window as any).CESIUM_BASE_URL = '/node_modules/cesium/Build/Cesium/';
}

// Wuppertal aerial imagery WMS layer
const WUPPERTAL_LUFTBILD_WMS = {
  url: 'https://geo.udsp.wuppertal.de/geoserver-cloud/ows',
  layers: 'GIS-102:trueortho2024',
  format: 'image/png',
  transparent: true,
  attribution: '© Stadt Wuppertal',
};

/**
 * Leaflet + Cesium Widget with transition state tracking
 */
const LeafletCesium = () => {
  const [terrainType, setTerrainType] = useState<'TERRAIN' | 'MESH'>('MESH');
  
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const cesiumWidgetRef = useRef<CesiumWidget | null>(null);
  const cesiumContainerRef = useRef<HTMLDivElement | null>(null);

  // Map framework switcher hook
  const switcher = useMapFrameworkSwitcher({
    initialFramework: 'leaflet',
    leafletMapRef,
    cesiumWidgetRef,
    cesiumContainerRef,
  });

  // Initialize maps
  useEffect(() => {
    if (!containerRef.current) return;

    const initMaps = () => {
      if (!containerRef.current) return;

      try {
        // Create Leaflet map
        const leafletContainer = document.createElement('div');
        leafletContainer.style.width = '100%';
        leafletContainer.style.height = '100%';
        leafletContainer.style.position = 'absolute';
        leafletContainer.style.top = '0';
        leafletContainer.style.left = '0';
        containerRef.current.appendChild(leafletContainer);

        const leafletMap = L.map(leafletContainer, {
          center: [WUPPERTAL.position.latitude, WUPPERTAL.position.longitude],
          zoom: 15,
          zoomControl: true,
        });

        // Add Wuppertal aerial imagery (Luftbild) WMS layer
        L.tileLayer.wms(WUPPERTAL_LUFTBILD_WMS.url, {
          layers: WUPPERTAL_LUFTBILD_WMS.layers,
          format: WUPPERTAL_LUFTBILD_WMS.format,
          transparent: WUPPERTAL_LUFTBILD_WMS.transparent,
          attribution: WUPPERTAL_LUFTBILD_WMS.attribution,
          maxZoom: 20,
        }).addTo(leafletMap);

        // Force Leaflet to recalculate size
        setTimeout(() => leafletMap.invalidateSize(), 100);

        leafletMapRef.current = leafletMap;
      } catch (error) {
        console.error('Leaflet initialization error:', error);
      }

      try {
        // Create Cesium widget
        const cesiumContainer = document.createElement('div');
        cesiumContainer.style.width = '100%';
        cesiumContainer.style.height = '100%';
        cesiumContainer.style.position = 'absolute';
        cesiumContainer.style.top = '0';
        cesiumContainer.style.left = '0';
        cesiumContainer.style.opacity = '0';
        cesiumContainer.style.pointerEvents = 'none';
        containerRef.current.appendChild(cesiumContainer);
        cesiumContainerRef.current = cesiumContainer;

        const widget = new CesiumWidget(cesiumContainer, {
          requestRenderMode: false,
          maximumRenderTimeChange: Infinity,
        });

        // Set initial terrain provider
        const terrainUrl = terrainType === 'MESH' 
          ? WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M.url 
          : WUPP_TERRAIN_PROVIDER.url;
        
        CesiumTerrainProvider.fromUrl(terrainUrl)
          .then((terrain) => {
            if (widget.scene) {
              widget.scene.terrainProvider = terrain;
              widget.scene.requestRender();
            }
          })
          .catch((error) => {
            console.warn('Terrain provider failed to load:', error);
          });

        // Position camera over Wuppertal
        const position = Cartesian3.fromDegrees(
          WUPPERTAL.position.longitude,
          WUPPERTAL.position.latitude,
          500
        );
        widget.camera.setView({
          destination: position,
          orientation: {
            heading: degToRadNumeric(0),
            pitch: degToRadNumeric(-45),
            roll: 0,
          },
        });

        cesiumWidgetRef.current = widget;
      } catch (error) {
        console.error('Cesium initialization error:', error);
      }
    };

    initMaps();

    return () => {
      try {
        if (leafletMapRef.current) {
          leafletMapRef.current.remove();
          leafletMapRef.current = null;
        }
      } catch (error) {
        console.error('Error cleaning up Leaflet:', error);
      }
      
      try {
        if (cesiumWidgetRef.current) {
          cesiumWidgetRef.current.destroy();
          cesiumWidgetRef.current = null;
        }
      } catch (error) {
        console.error('Error cleaning up Cesium:', error);
      }
      
      try {
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
        }
      } catch (error) {
        console.error('Error cleaning up container:', error);
      }
    };
  }, [terrainType]);

  // Update terrain provider
  const handleTerrainToggle = () => {
    const newTerrain = terrainType === 'MESH' ? 'TERRAIN' : 'MESH';
    setTerrainType(newTerrain);
    
    if (!cesiumWidgetRef.current) return;

    const terrainUrl = newTerrain === 'MESH' 
      ? WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M.url 
      : WUPP_TERRAIN_PROVIDER.url;
    
    CesiumTerrainProvider.fromUrl(terrainUrl)
      .then((terrain) => {
        if (cesiumWidgetRef.current?.scene) {
          cesiumWidgetRef.current.scene.terrainProvider = terrain;
          cesiumWidgetRef.current.scene.requestRender();
        }
      })
      .catch((error) => {
        console.warn('Terrain provider failed to load:', error);
      });
  };

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      />
      
      {/* Controls */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          zIndex: 1000,
          display: 'flex',
          gap: '8px',
        }}
      >
        <MapFrameworkSwitcher
          activeFramework={switcher.activeFramework}
          isTransitioning={switcher.isTransitioning}
          onToggle={switcher.toggle}
          nativeTooltip={true}
        />
        <Button onClick={handleTerrainToggle}>
          Terrain: {terrainType}
        </Button>
      </div>
      
      {/* Transition State Watcher */}
      <Card
        title="Transition State"
        size="small"
        style={{
          position: 'absolute',
          bottom: '16px',
          right: '16px',
          zIndex: 1000,
          width: '350px',
          maxHeight: '400px',
          overflow: 'auto',
        }}
      >
        <div style={{ marginBottom: '12px' }}>
          <strong>Current Stage:</strong>{' '}
          <Tag color={
            switcher.currentStage === TransitionStage.ERROR ? 'red' :
            switcher.currentStage === TransitionStage.COMPLETE ? 'green' :
            switcher.isTransitioning ? 'blue' : 'default'
          }>
            {switcher.currentStage}
          </Tag>
        </div>
        
        <div>
          <strong>Recent Logs:</strong>
          <div style={{ 
            maxHeight: '250px', 
            overflow: 'auto',
            marginTop: '8px',
            fontSize: '12px',
          }}>
            {switcher.transitionLogs.slice().reverse().map((log, idx) => (
              <div key={idx} style={{ 
                padding: '4px 0', 
                borderBottom: idx < switcher.transitionLogs.length - 1 ? '1px solid #f0f0f0' : 'none' 
              }}>
                <div style={{ color: '#999' }}>
                  {log.timestamp.toLocaleTimeString()}
                </div>
                <div>
                  <Tag color={
                    log.stage === TransitionStage.ERROR ? 'red' :
                    log.stage === TransitionStage.COMPLETE ? 'green' :
                    'blue'
                  }>
                    {log.stage}
                  </Tag>
                  {log.message}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
};

const meta: Meta<typeof LeafletCesium> = {
  title: 'MapFrameworkSwitcher/Leaflet <-> Cesium',
  component: LeafletCesium,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
Leaflet + Cesium Widget with Leva controls for interactive exploration.

**Interactive Controls (via Leva):**
- **Terrain Provider**: Toggle between Terrain 2020 and 2024 Mesh (1m DSM)
- **Cesium Opacity**: Smooth blend slider between Leaflet (2D) and Cesium (3D) views

**Features:**
- Leaflet map with Wuppertal aerial imagery (Luftbild 2024) WMS layer
- Cesium widget overlaid with high-resolution terrain
- Real-time opacity transition between 2D/3D
- Both maps centered on Wuppertal city center
- Using terrain providers from @carma-commons/resources
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof LeafletCesium>;

export const Default: Story = {};
