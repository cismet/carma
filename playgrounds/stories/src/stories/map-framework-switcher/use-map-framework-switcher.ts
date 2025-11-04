import { useCallback, useState } from 'react';
import { TransitionStage } from '@carma-mapping/engines-interop';
import type { TransitionToCesiumOptions, TransitionToLeafletOptions } from '@carma-mapping/engines-interop';
import { transitionToCesium } from '@carma-mapping/engines-interop';
import type { CesiumWidget } from '@carma/cesium';
import type L from 'leaflet';

type MapFramework = 'leaflet' | 'cesium';

type TransitionLog = {
  timestamp: Date;
  stage: TransitionStage;
  message: string;
};

type UseMapFrameworkSwitcherParams = {
  initialFramework?: MapFramework;
  leafletMapRef: React.MutableRefObject<L.Map | null>;
  cesiumWidgetRef: React.MutableRefObject<CesiumWidget | null>;
  cesiumContainerRef: React.MutableRefObject<HTMLDivElement | null>;
  onTransitionComplete?: () => void;
  /** Transition options passed to pure transition functions */
  transitionOptions?: {
    toCesium?: TransitionToCesiumOptions;
    toLeaflet?: TransitionToLeafletOptions;
  };
};

type UseMapFrameworkSwitcherReturn = {
  activeFramework: MapFramework;
  isTransitioning: boolean;
  currentStage: TransitionStage;
  transitionLogs: TransitionLog[];
  toggle: () => void;
};

export type { MapFramework, TransitionLog, UseMapFrameworkSwitcherReturn };

/**
 * Hook for managing map framework switching between Leaflet and Cesium
 * Tracks active framework, transition state, and provides toggle function
 */
export const useMapFrameworkSwitcher = ({
  initialFramework = 'leaflet',
  leafletMapRef,
  cesiumWidgetRef,
  cesiumContainerRef,
  onTransitionComplete,
  transitionOptions,
}: UseMapFrameworkSwitcherParams): UseMapFrameworkSwitcherReturn => {
  const [activeFramework, setActiveFramework] = useState<MapFramework>(initialFramework);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [currentStage, setCurrentStage] = useState<TransitionStage>(TransitionStage.IDLE);
  const [transitionLogs, setTransitionLogs] = useState<TransitionLog[]>([]);

  // Stage tracking callback
  const onTransitionStage = useCallback((stage: TransitionStage, message: string) => {
    setCurrentStage(stage);
    setTransitionLogs(prev => [
      ...prev,
      { timestamp: new Date(), stage, message }
    ].slice(-10)); // Keep last 10 logs
  }, []);

  // Toggle between frameworks
  const toggle = useCallback(async () => {
    if (isTransitioning) return;
    
    const targetFramework = activeFramework === 'leaflet' ? 'cesium' : 'leaflet';
    
    // Validate refs before transition
    const leafletMap = leafletMapRef.current;
    const cesiumWidget = cesiumWidgetRef.current;
    const cesiumContainer = cesiumContainerRef.current;
    
    if (!leafletMap) {
      console.error('Leaflet map ref is null');
      return;
    }
    
    if (!cesiumWidget || !cesiumWidget.scene) {
      console.error('Cesium widget or scene ref is null');
      return;
    }
    
    if (!cesiumContainer) {
      console.error('Cesium container ref is null');
      return;
    }
    
    setIsTransitioning(true);
    
    try {
      if (targetFramework === 'cesium') {
        // Transition from Leaflet to Cesium
        await transitionToCesium({
          scene: cesiumWidget.scene,
          leaflet: leafletMap,
          cesiumContainer,
          resolutionScale: 1.0,
          onTransitionStage,
          ...(transitionOptions?.toCesium && { options: transitionOptions.toCesium }),
        });
        
        // Update visibility
        cesiumContainer.style.opacity = '1';
        cesiumContainer.style.pointerEvents = 'auto';
        setActiveFramework('cesium');
      } else {
        // Transition from Cesium to Leaflet
        // TODO: Call transitionToLeaflet when implemented
        onTransitionStage(TransitionStage.PREPARE_2D, 'Transitioning to 2D...');
        
        // Update visibility
        cesiumContainer.style.opacity = '0';
        cesiumContainer.style.pointerEvents = 'none';
        setActiveFramework('leaflet');
        
        onTransitionStage(TransitionStage.COMPLETE, 'Transition to 2D complete');
      }
      
      onTransitionComplete?.();
    } catch (error) {
      console.error('Transition error:', error);
      onTransitionStage(TransitionStage.ERROR, `Transition failed: ${error}`);
    } finally {
      setIsTransitioning(false);
    }
  }, [activeFramework, isTransitioning, leafletMapRef, cesiumWidgetRef, cesiumContainerRef, onTransitionStage, onTransitionComplete, transitionOptions]);

  return {
    activeFramework,
    isTransitioning,
    currentStage,
    transitionLogs,
    toggle,
  };
};
