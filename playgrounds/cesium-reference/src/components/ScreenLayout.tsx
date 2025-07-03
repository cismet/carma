import React from "react";

interface ScreenLayoutProps {
  topLeft?: React.ReactNode;
  topRight?: React.ReactNode;
  bottomCenter?: React.ReactNode;
  bottomLeft?: React.ReactNode;
  bottomRight?: React.ReactNode;
}

const ScreenLayout: React.FC<ScreenLayoutProps> = ({
  topLeft,
  topRight,
  bottomCenter,
  bottomLeft,
  bottomRight,
}) => {
  return (
    <>
      {/* Top Left */}
      {topLeft && (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            zIndex: 1000,
          }}
        >
          {topLeft}
        </div>
      )}

      {/* Top Right */}
      {topRight && (
        <div
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 1000,
          }}
        >
          {topRight}
        </div>
      )}

      {/* Bottom Center */}
      {bottomCenter && (
        <div
          style={{
            position: "absolute",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
          }}
        >
          {bottomCenter}
        </div>
      )}

      {/* Bottom Left */}
      {bottomLeft && (
        <div
          style={{
            position: "absolute",
            bottom: 16,
            left: 16,
            zIndex: 1000,
          }}
        >
          {bottomLeft}
        </div>
      )}

      {/* Bottom Right */}
      {bottomRight && (
        <div
          style={{
            position: "absolute",
            bottom: 16,
            right: 16,
            zIndex: 1000,
          }}
        >
          {bottomRight}
        </div>
      )}
    </>
  );
};

export default ScreenLayout;
