import type { Meta, StoryObj } from '@storybook/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Radio, Tag } from 'antd';
import { createMinimalCesiumWidget, CesiumWidget, CesiumTerrainProvider, Cartesian3, Cesium3DTileset, EllipsoidTerrainProvider, Cartographic, sampleTerrainMostDetailedGuardedAsync } from '@carma/cesium';
import { degToRadNumeric } from '@carma/units/helpers';
import {
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
  WUPP_MESH_2024,
  WUPPERTAL,
} from '@carma-commons/resources';
import { TransitionStage } from '@carma-mapping/engines-interop';
import { MapFrameworkSwitcher, useMapFrameworkSwitcher } from '@carma-mapping/components';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'cesium/Build/Cesium/Widgets/widgets.css';

// Configure Cesium base URL for Storybook
if (typeof window !== 'undefined') {
  (window as any).CESIUM_BASE_URL = '/__cesium__/';
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
  const [leafletDPR, setLeafletDPR] = useState<number>(window.devicePixelRatio || 1);
  const [cesiumResolutionScale, setCesiumResolutionScale] = useState<number>(1);
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
    onActiveFrameworkChange: (direction: any) => {
      console.log('[TRANSITION] Framework changed:', direction);
    },
    onTransitionStart: (direction: any) => {
      console.log('[TRANSITION] Started:', direction);
    },
    onTransitionComplete: (direction: any) => {
      console.log('[TRANSITION] Completed:', direction);
    },
    onTransitionFailed: (direction: any) => {
      console.error('[TRANSITION] Failed:', direction);
    },
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

  // Terrain sampling method - can be called anytime
  const sampleTerrainAtCurrentLocation = useCallback(async () => {
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

  // Initialize maps
  useEffect(() => {
    if (!leafletContainerRef.current || !cesiumContainerRef.current) return;

    const initMaps = () => {
      if (!leafletContainerRef.current || !cesiumContainerRef.current) return;

      // Track terrain provider loading
      let terrainLoaded = false;
      let surfaceLoaded = false;
      
      const checkAndSample = () => {
        if (terrainLoaded && surfaceLoaded && leafletMapRef.current) {
          // Both providers ready - sample immediately
          sampleTerrainAtCurrentLocation();
        }
      };

      // Initialize terrain providers (ready but not applied to scene yet)
      CesiumTerrainProvider.fromUrl(WUPP_TERRAIN_PROVIDER.url)
        .then((terrain) => {
          terrainProvidersRef.current.TERRAIN = terrain;
          terrainLoaded = true;
          checkAndSample();
        })
        .catch((error) => {
          console.warn('TERRAIN provider failed to initialize:', error);
        });

      CesiumTerrainProvider.fromUrl(WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M.url)
        .then((terrain) => {
          terrainProvidersRef.current.SURFACE = terrain;
          surfaceLoaded = true;
          checkAndSample();
        })
        .catch((error) => {
          console.warn('SURFACE provider failed to initialize:', error);
        });

      try {
        // Create Leaflet map
        const leafletMap = L.map(leafletContainerRef.current, {
          center: [WUPPERTAL.position.latitude, WUPPERTAL.position.longitude],
          zoom: 15,
          minZoom: 10, // Fixed: was 23 (too restrictive), should be reasonable minimum
          zoomControl: false,
          attributionControl: false,
        });

        // Add Wuppertal aerial imagery (Luftbild) WMS layer
        const wmsLayer = L.tileLayer.wms(WUPPERTAL_LUFTBILD_WMS.url, {
          layers: WUPPERTAL_LUFTBILD_WMS.layers,
          format: WUPPERTAL_LUFTBILD_WMS.format,
          transparent: WUPPERTAL_LUFTBILD_WMS.transparent,
          attribution: WUPPERTAL_LUFTBILD_WMS.attribution,
          maxZoom: 20,
        }).addTo(leafletMap);
        
        console.log('[LEAFLET] WMS layer added:', {
          url: WUPPERTAL_LUFTBILD_WMS.url,
          layers: WUPPERTAL_LUFTBILD_WMS.layers,
          layerAdded: !!wmsLayer,
        });

        // Force Leaflet to recalculate size
        setTimeout(() => leafletMap.invalidateSize(), 100);

        leafletMapRef.current = leafletMap;
        
        // Attach moveend event to sample terrain on map move
        leafletMap.on('moveend', sampleTerrainAtCurrentLocation);
      } catch (error) {
        console.error('Leaflet initialization error:', error);
      }

      try {
        // Create Cesium widget - enable globe for transitions (depthTestAgainstTerrain requires it)
        const widget = createMinimalCesiumWidget(cesiumContainerRef.current);

        cesiumWidgetRef.current = widget;
        
        // Capture Cesium resolution scale
        setCesiumResolutionScale(widget.resolutionScale);

        // Load 2024 mesh as 3D tileset after widget is ready
        // Using geoportal DEFAULT_MESH_OPTIONS from cesiumTilesetProviders.ts
        Cesium3DTileset.fromUrl(WUPP_MESH_2024.url, {
          preloadWhenHidden: false,
          scene: widget.scene,
          shadows: 0, // ShadowMode.DISABLED
          enableCollision: false,
          maximumScreenSpaceError: 6,
          skipLevelOfDetail: true,
          skipScreenSpaceErrorFactor: 128,
          baseScreenSpaceError: 4096,
        })
          .then((tileset) => {
            if (widget.scene && !widget.isDestroyed()) {
              widget.scene.primitives.add(tileset);
              tilesetRef.current = tileset;
              widget.scene.requestRender();
              console.log('Tileset loaded and added to scene');
              
              // Sample terrain after tileset loads
              sampleTerrainAtCurrentLocation();
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
          leafletMapRef.current.off('moveend', sampleTerrainAtCurrentLocation);
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
        if (cesiumWidgetRef.current && !cesiumWidgetRef.current.isDestroyed()) {
          cesiumWidgetRef.current.destroy();
          cesiumWidgetRef.current = null;
        }
      } catch (error) {
        console.error('Error cleaning up Cesium:', error);
      }
    };
  }, [sampleTerrainAtCurrentLocation]);

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
          opacity: activeFramework === 'cesium' ? 1 : 0,
          pointerEvents: activeFramework === 'cesium' ? 'auto' : 'none',
          transition: 'opacity 600ms ease-in-out',
        }}
      />
      
      {/* Controls */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
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
      </div>
      
      {/* Status Card */}
      <Card
        size="small"
        style={{
          position: 'absolute',
          bottom: '16px',
          left: '16px',
          zIndex: 1000,
        }}
      >
        <div style={{ marginBottom: '8px' }}>
          <strong>Active Framework</strong>{' '}
          <Tag color={activeFramework === 'cesium' ? 'blue' : 'green'}>
            {activeFramework.toUpperCase()}
          </Tag>
        </div>
        
        <div style={{ marginBottom: '12px' }}>
          <strong>Transitioning</strong>{' '}
          <Tag color={isTransitioning ? 'orange' : 'default'}>
            {isTransitioning ? 'YES' : 'NO'}
          </Tag>
        </div>
        
        {/* Cesium Section */}
        <div style={{ marginBottom: '12px', paddingTop: '8px', borderTop: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px', flexWrap: 'wrap' }}>
            <Tag color={cesiumContainerRef.current ? 'green' : 'red'}>
              {cesiumContainerRef.current ? 'Container' : 'No Container'}
            </Tag>
            <Tag color={cesiumWidgetRef.current ? 'green' : 'red'}>
              {cesiumWidgetRef.current ? 'Widget' : 'No Widget'}
            </Tag>
            <Tag color="blue">
              {cesiumWidgetRef.current?.scene?.drawingBufferWidth || 0}×{cesiumWidgetRef.current?.scene?.drawingBufferHeight || 0}
            </Tag>
            <Tag color="geekblue">DPR {leafletDPR % 1 === 0 ? leafletDPR : leafletDPR.toFixed(2)}</Tag>
            <Tag color="magenta">Scale {cesiumResolutionScale % 1 === 0 ? cesiumResolutionScale : cesiumResolutionScale.toFixed(2)}</Tag>
          </div>
        </div>
        
        <div style={{ paddingTop: '8px', borderTop: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <Radio.Group 
              value={terrainType} 
              onChange={(e) => setTerrainType(e.target.value)}
              size="small"
            >
              <Radio.Button value="TERRAIN">DEM</Radio.Button>
              <Radio.Button value="MESH">DSM</Radio.Button>
            </Radio.Group>
            {terrainHeight !== null && (
              <Tag color="cyan">
                DEM {terrainHeight.toFixed(2)}m
              </Tag>
            )}
            {surfaceHeight !== null && (
              <Tag color="purple">
                DSM {surfaceHeight.toFixed(2)}m
              </Tag>
            )}
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
