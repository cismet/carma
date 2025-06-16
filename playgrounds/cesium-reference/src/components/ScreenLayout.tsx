import type { ReactNode } from 'react';
import './ScreenLayout.css'; // Import the CSS file

interface ScreenLayoutProps {
  topLeft?: ReactNode;
  topRight?: ReactNode;
  bottomCenter?: ReactNode; // Added bottomCenter slot
  children?: ReactNode; // For the main content area (e.g., the map)
}

const ScreenLayout = ({
  topLeft,
  topRight,
  bottomCenter, // Added bottomCenter
  children,
}: ScreenLayoutProps) => {
  return (
    <div className="screen-layout-container">
      {/* Main content area (map) - renders behind the UI slots */}
      {children && <div className="screen-layout-main-content">{children}</div>}

      {/* UI Overlay for slots */}
      <div className="screen-layout-ui-overlay">
        {/* Top Row */}
        <div className="screen-layout-top-row">
          <div className="screen-layout-slot screen-layout-top-left">{topLeft}</div>
          <div className="screen-layout-slot screen-layout-top-right">{topRight}</div>
        </div>

        {/* Spacer to push bottom row to the bottom, assuming ui-overlay is flex-col */}
        <div style={{ flexGrow: 1 }} /> 

        {/* Bottom Row - Added */}
        <div className="screen-layout-bottom-row">
          <div className="screen-layout-slot screen-layout-bottom-center">{bottomCenter}</div>
        </div>
      </div>
    </div>
  );
};

export default ScreenLayout;
