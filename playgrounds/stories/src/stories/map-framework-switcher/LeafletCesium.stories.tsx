import type { Meta, StoryObj } from '@storybook/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Tag } from 'antd';
import { CesiumWidget, CesiumTerrainProvider, Cartesian3, Cesium3DTileset, EllipsoidTerrainProvider, Cartographic, sampleTerrainMostDetailedGuardedAsync } from '@carma/cesium';
import { degToRadNumeric } from '@carma/units/helpers';
import {
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
  WUPP_MESH_2024,
  WUPPERTAL,
} from '@carma-commons/resources';
import { TransitionStage } from '@carma-mapping/engines-interop';
import { MapFrameworkSwitcher, useMapFrameworkSwitcher } from '@carma-mapping/components';
import { useControls, button } from 'leva';
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
  const [surfaceHeight, setSurfaceHeight] = useState<number | null>(null);
  const [terrainHeight, setTerrainHeight] = useState<number | null>(null);
  const [pointerEventsEnabled, setPointerEventsEnabled] = useState(false);
  
  const leafletContainerRef = useRef<HTMLDivElement>(null);
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const cesiumWidgetRef = useRef<CesiumWidget | null>(null);
  const tilesetRef = useRef<Cesium3DTileset | null>(null);
  const terrainProvidersRef = useRef<{
    TERRAIN: CesiumTerrainProvider | null;
    SURFACE: CesiumTerrainProvider | null;
  }>({ TERRAIN: null, SURFACE: null });
  
  // Sample terrain height handler
  const handleSampleTerrain = useCallback(async () => {
    if (!leafletMapRef.current) {
      return;
    }
    
    const center = leafletMapRef.current.getCenter();
    const position = Cartographic.fromDegrees(center.lng, center.lat);
    
    // Sample SURFACE provider (DSM - Digital Surface Model)
    if (terrainProvidersRef.current.SURFACE) {
      try {
        const surfaceResults = await sampleTerrainMostDetailedGuardedAsync(
          terrainProvidersRef.current.SURFACE,
          [position],
          true,
          true
        );
        
        if (surfaceResults && surfaceResults[0]?.height !== undefined) {
          setSurfaceHeight(surfaceResults[0].height);
          console.log(`SURFACE height at [${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}]: ${surfaceResults[0].height.toFixed(2)}m`);
        }
      } catch (error) {
        console.error('Failed to sample SURFACE terrain:', error);
      }
    }
    
    // Sample TERRAIN provider (DEM - Digital Elevation Model)
    if (terrainProvidersRef.current.TERRAIN) {
      try {
        const terrainResults = await sampleTerrainMostDetailedGuardedAsync(
          terrainProvidersRef.current.TERRAIN,
          [position],
          true,
          true
        );
        
        if (terrainResults && terrainResults[0]?.height !== undefined) {
          setTerrainHeight(terrainResults[0].height);
          console.log(`TERRAIN height at [${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}]: ${terrainResults[0].height.toFixed(2)}m`);
        }
      } catch (error) {
        console.error('Failed to sample TERRAIN:', error);
      }
    }
  }, []);
  
  // Leva controls for debugging
  const { opacity, clipPercentage } = useControls('Cesium Container', {
    opacity: { value: 1, min: 0, max: 1, step: 0.01 },
    clipPercentage: { value: 30, min: 0, max: 100, step: 1, label: 'Clip %' },
  });
  
  useControls('Actions', {
    'Toggle Pointer Events': button(() => setPointerEventsEnabled(prev => !prev)),
    'Sample Terrain Height': button(handleSampleTerrain),
  });

  // Getter functions for the hook
  const getLeafletMap = useCallback(() => leafletMapRef.current, []);
  
  const getCesiumScene = useCallback(() => cesiumWidgetRef.current?.scene ?? null, []);
  
  const getCesiumContainer = useCallback(() => cesiumContainerRef.current, []);
  
  const getCesiumTerrainProviders = useCallback(() => {
    return {
      TERRAIN: terrainProvidersRef.current.TERRAIN ?? ({} as CesiumTerrainProvider),
      SURFACE: terrainProvidersRef.current.SURFACE ?? ({} as CesiumTerrainProvider),
    };
  }, []);
  
  const getResolutionScale = useCallback(() => 1.0, []);

  const switcherOptions = useMemo(() => ({
    onActiveFrameworkChange: () => {
      // Optional: handle framework changes
    }
  }), []);

  // Map framework switcher hook
  const { activeFramework, isTransitioning, toggle } = useMapFrameworkSwitcher(
    getLeafletMap,
    getCesiumScene,
    getCesiumContainer,
    getCesiumTerrainProviders,
    getResolutionScale,
    switcherOptions
  );

  // Initialize maps
  useEffect(() => {
    if (!leafletContainerRef.current || !cesiumContainerRef.current) return;

    const initMaps = () => {
      if (!leafletContainerRef.current || !cesiumContainerRef.current) return;

      // Initialize terrain providers (ready but not applied to scene yet)
      CesiumTerrainProvider.fromUrl(WUPP_TERRAIN_PROVIDER.url)
        .then((terrain) => {
          terrainProvidersRef.current.TERRAIN = terrain;
        })
        .catch((error) => {
          console.warn('TERRAIN provider failed to initialize:', error);
        });

      CesiumTerrainProvider.fromUrl(WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M.url)
        .then((terrain) => {
          terrainProvidersRef.current.SURFACE = terrain;
        })
        .catch((error) => {
          console.warn('SURFACE provider failed to initialize:', error);
        });

      // Initialize terrain providers (ready but not applied to scene yet)
      CesiumTerrainProvider.fromUrl(WUPP_TERRAIN_PROVIDER.url)
        .then((terrain) => {
          terrainProvidersRef.current.TERRAIN = terrain;
        })
        .catch((error) => {
          console.warn('TERRAIN provider failed to initialize:', error);
        });

      CesiumTerrainProvider.fromUrl(WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M.url)
        .then((terrain) => {
          terrainProvidersRef.current.SURFACE = terrain;
        })
        .catch((error) => {
          console.warn('SURFACE provider failed to initialize:', error);
        });

      try {
        // Create Leaflet map
        const leafletMap = L.map(leafletContainerRef.current, {
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
        
        // Attach moveend event to sample terrain on map move
        leafletMap.on('moveend', handleSampleTerrain);
      } catch (error) {
        console.error('Leaflet initialization error:', error);
      }

      try {
        // Create empty div for credit container
        const creditContainer = document.createElement('div');
        creditContainer.style.display = 'none';
        
        // Create Cesium widget with no default terrain
        const widget = new CesiumWidget(cesiumContainerRef.current, {
          requestRenderMode: true,
          maximumRenderTimeChange: Infinity,
          skyBox: false,
          skyAtmosphere: false,
          terrainProvider: new EllipsoidTerrainProvider(),
          creditContainer: creditContainer,
        });

        cesiumWidgetRef.current = widget;

        // Load 2024 mesh as 3D tileset after widget is ready
        Cesium3DTileset.fromUrl(WUPP_MESH_2024.url)
          .then((tileset) => {
            if (widget.scene && !widget.isDestroyed()) {
              widget.scene.primitives.add(tileset);
              tilesetRef.current = tileset;
              widget.scene.requestRender();
              console.log('Tileset loaded and added to scene');
            }
          })
          .catch((error) => {
            console.warn('3D Tileset failed to load:', error);
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
      } catch (error) {
        console.error('Cesium initialization error:', error);
      }
    };

    initMaps();

    return () => {
      try {
        if (leafletMapRef.current) {
          leafletMapRef.current.off('moveend', handleSampleTerrain);
          leafletMapRef.current.remove();
          leafletMapRef.current = null;
        }
      } catch (error) {
        console.error('Error cleaning up Leaflet:', error);
      }
      
      try {
        if (tilesetRef.current && !tilesetRef.current.isDestroyed()) {
          tilesetRef.current.destroy();
          tilesetRef.current = null;
        }
      } catch (error) {
        console.error('Error cleaning up tileset:', error);
      }
      
      try {
        if (cesiumWidgetRef.current) {
          cesiumWidgetRef.current.destroy();
          cesiumWidgetRef.current = null;
        }
      } catch (error) {
        console.error('Error cleaning up Cesium:', error);
      }
    };
  }, [terrainType, handleSampleTerrain]);

  // Apply Leva controls to Cesium container (removed - now using inline styles)

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
      {/* Leaflet container - base layer */}
      <div
        ref={leafletContainerRef}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 1,
        }}
      />
      
      {/* Cesium container - overlay with debugging background */}
      <div
        ref={cesiumContainerRef}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 2,
          opacity: opacity,
          pointerEvents: pointerEventsEnabled ? 'auto' : 'none',
          background: 'repeating-conic-gradient(#ff6600 0% 25%, transparent 0% 50%) 50% / 20px 20px',
          clipPath: `inset(0 ${100 - clipPercentage}% 0 0)`,
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
          activeFramework={activeFramework}
          isTransitioning={isTransitioning}
          onToggle={toggle}
          nativeTooltip={true}
        />
        <Button onClick={handleTerrainToggle}>
          Terrain: {terrainType}
        </Button>
      </div>
      
      {/* Status Card */}
      <Card
        title="Switcher Status"
        size="small"
        style={{
          position: 'absolute',
          bottom: '16px',
          left: '16px',
          zIndex: 1000,
          width: '250px',
        }}
      >
        <div style={{ marginBottom: '8px' }}>
          <strong>Active Framework:</strong>{' '}
          <Tag color={activeFramework === 'cesium' ? 'blue' : 'green'}>
            {activeFramework.toUpperCase()}
          </Tag>
        </div>
        
        <div style={{ marginBottom: '8px' }}>
          <strong>Transitioning:</strong>{' '}
          <Tag color={isTransitioning ? 'orange' : 'default'}>
            {isTransitioning ? 'YES' : 'NO'}
          </Tag>
        </div>
        
        {surfaceHeight !== null && (
          <div style={{ marginBottom: '8px' }}>
            <strong>Surface (DSM):</strong>{' '}
            <Tag color="purple">
              {surfaceHeight.toFixed(2)}m
            </Tag>
          </div>
        )}
        
        {terrainHeight !== null && (
          <div>
            <strong>Terrain (DEM):</strong>{' '}
            <Tag color="cyan">
              {terrainHeight.toFixed(2)}m
            </Tag>
          </div>
        )}
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
