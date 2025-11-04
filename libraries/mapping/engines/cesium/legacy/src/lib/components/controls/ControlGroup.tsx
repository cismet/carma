import { HTMLAttributes, ReactNode } from "react";

type ControlGroupProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  useLeafletElements?: boolean;
};

const ControlContainer = (props: ControlGroupProps) => {
  const { children, useLeafletElements = true, ...otherProps } = props;
  return (
    <div
      {...otherProps}
      className={
        useLeafletElements
          ? "leaflet-bar leaflet-control"
          : "leafletlike-container leaflet-control"
      }
    >
      {children}
    </div>
  );
};
export default ControlContainer;
