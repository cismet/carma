import { useCesium } from 'resium';
import OnMapButton from './OnMapButton';
import { getAll } from '../../lib/position';
import { faInfo, faX } from '@fortawesome/free-solid-svg-icons';
import { Cartesian3, Cartographic, Viewer } from 'cesium';
import { MouseEvent, useEffect, useState } from 'react';
import { getCanvasCenter, toDegFactor } from '../../lib/cesiumHelpers';
import { get } from 'http';

type DebugInfoProps = {
  children?: React.ReactNode;
};

const DebugInfo = (props: DebugInfoProps) => {
  const { viewer } = useCesium();
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [cameraPosition, setCameraPosition] = useState<Cartesian3 | null>(null);
  const [cameraPosCarto, setCameraPosCarto] = useState<Cartographic | null>(
    null
  );
  const [centerPosition, setCenterPosition] = useState<Cartesian3 | null>(null);
  const [centerPosCarto, setCenterPosCarto] = useState<Cartographic | null>(
    null
  );

  useEffect(() => {
    if (viewer && isExpanded) {
      const cameraChangedHandler = () => {
        console.log('cameraChangedHandler');
        setCameraPosition(Cartesian3.clone(viewer.camera.position));
        setCameraPosCarto(
          Cartographic.clone(viewer.camera.positionCartographic)
        );
        const centerPos = getCanvasCenter(viewer);
        setCenterPosition(centerPos);
        setCenterPosCarto(Cartographic.fromCartesian(centerPos));
      };

      viewer.camera.moveEnd.addEventListener(cameraChangedHandler);

      return () => {
        viewer.camera.moveEnd.removeEventListener(cameraChangedHandler);
      };
    }
  }, [viewer, isExpanded]);

  return (
    viewer && (
      <>
        <OnMapButton
          icon={isExpanded ? faX : faInfo}
          title={'debugInfo'}
          {...props}
          style={{
            zIndex: 2,
            borderBottom: isExpanded ? 'none' : undefined,
            backgroundColor: isExpanded ? 'none' : undefined,
          }}
          onClick={async (event: MouseEvent) => {
            event.preventDefault();
            const {
              cameraHeight,
              lat,
              lng,
              center,
              //home,
              windowPosition,
              //transform,
              camera,
            } = await getAll(viewer);
            console.log('xxx info', {
              cameraHeight,
              lat,
              lng,
              center,
              //home,
              windowPosition,
              //transform,
              viewer,
              camera,
            });
            //console.log('xxx info pitch', camera.pitch);
            //console.log('xxx info heading', camera.heading);
            //console.log('xxx info camera.z', camera.position.z);
            //console.log('xxx info cameraHeight', cameraHeight);
            setIsExpanded(!isExpanded);
          }}
        >
          {props.children}
        </OnMapButton>
        {isExpanded && cameraPosition && centerPosition && (
          <div
            className="leaflet-bar"
            style={{
              position: 'absolute',
              zIndex: 1,
              top: '0',
              padding: '5px',
              backgroundColor: 'rgba(255, 255, 255)',
            }}
          >
            <em>
              <pre>Center Position</pre>
            </em>
            <pre>x {centerPosition.x}</pre>
            <pre>y {centerPosition.y}</pre>
            <pre>z {centerPosition.z}</pre>
            {centerPosCarto && 
              <>
                <pre>lat {centerPosCarto.latitude * toDegFactor}</pre>
                <pre>lon {centerPosCarto.longitude * toDegFactor}</pre>
              </>
            }

            <pre>h {centerPosCarto?.height}</pre>

            <em>
              <pre>Camera Position</pre>
            </em>
            <pre>x {cameraPosition.x}</pre>
            <pre>y {cameraPosition.y}</pre>
            <pre>z {cameraPosition.z}</pre>
            {cameraPosCarto && 
              <>
                <pre>lat {cameraPosCarto.latitude * toDegFactor}</pre>
                <pre>lon {cameraPosCarto.longitude * toDegFactor}</pre>
              </>
            }
            <pre>h {cameraPosCarto?.height}</pre>
          </div>
        )}
      </>
    )
  );
};

export default DebugInfo;
