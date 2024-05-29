import { useCesium } from 'resium';
import MarkerContainer from '../../components/CesiumMarkerContainer';
import { MODEL_ASSETS as GLB, IMAGE_ASSETS } from '../../config/assets.config';
import { useEffect } from 'react';

function View() {
  const { viewer } = useCesium();
  // start animating scene by starting clock

  useEffect(() => {
    if (viewer) {
      viewer.clock.startTime = viewer.clock.currentTime;
      viewer.clock.shouldAnimate = true;
    }
  }, [viewer]);

  return (
    <MarkerContainer
      markerData={[
        { position: [7.2, 51.273, 170], image: IMAGE_ASSETS.SvgMarker.uri },
        { position: [7.200, 51.2725, 170], model: GLB.Marker3dFromSvg },

        { position: [7.201, 51.274, 200], model: GLB.Marker },

        //{ position: [7.202, 51.268, 200], model: GLB.MarkerRotatingFixed },
        { position: [7.199, 51.273, 200], model: GLB.MarkerFacingFixed },

        { position: [7.202, 51.274, 200], model: GLB.MarkerRotating },
        { position: [7.202, 51.273, 200], model: GLB.MarkerRotatingFast },
        { position: [7.202, 51.272, 200], model: GLB.MarkerRotatingSlow },
        { position: [7.202, 51.271, 200], model: GLB.MarkerRotatingCounter },

        { position: [7.203, 51.274, 200], model: GLB.MarkerFacing },

        { position: [7.137755, 51.223535, 270], model: GLB.Wind },
        { position: [7.20028, 51.27174, 155], model: GLB.Wind },
      ]}
    />
  );
}

export default View;
