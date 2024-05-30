import { useContext } from 'react';
import ControlContainer from '../../controls/ControlContainer';
import ControlGroup from '../../controls/ControlGroup';
import DebugInfo from '../../controls/DebugInfo';
import HomeControl from '../../controls/HomeControl';
import LockCenterControl from '../../controls/LockCenterControl';
import OrbitControl from '../../controls/OrbitControl';
import ZoomControls from '../../controls/ZoomControls';
import { UIComponentContext } from '../../UI/UIProvider';
import { useViewerHome } from '../../../store/slices/viewer';

const ControlsUI = ({
  showHome = true,
  showOrbit = true,
  showDebug = false,
  searchComponent,
}) => {
  const UI = useContext(UIComponentContext);
  const home = useViewerHome();

  return (
    <div className={'leaflet-control-container'}>
      <ControlContainer position="topleft">
        <ZoomControls />
        {showHome && home && (
          <ControlGroup>
            <HomeControl />
          </ControlGroup>
        )}
        {showOrbit && (
          <ControlGroup>
            <OrbitControl />
          </ControlGroup>
        )}
        <ControlGroup>
          <LockCenterControl />
        </ControlGroup>
      </ControlContainer>
      <ControlContainer position="bottomleft">
        <ControlGroup useLeafletElements={false}>
          {
            UI.components.bottomLeft.map((component, index) => (
              <div key={index}>{component}</div>
            )) // Workaround to prevent missing key warning
          }
        </ControlGroup>
        <ControlGroup>{searchComponent}</ControlGroup>
      </ControlContainer>
      {showDebug && (
        <ControlContainer position="topright">
          <ControlGroup
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
            }}
          >
            <DebugInfo />
          </ControlGroup>
        </ControlContainer>
      )}
    </div>
  );
};

export default ControlsUI;
