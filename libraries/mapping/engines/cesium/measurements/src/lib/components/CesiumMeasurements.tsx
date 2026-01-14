import { ReactNode } from "react";
import { LabelOverlayProvider } from "@carma-providers/label-overlay";
import {
  CesiumMeasurementsProvider,
  MeasurementProviderOptions,
} from "../context/CesiumMeasurementsContext";
import { useCesiumOverlaySync } from "../hooks/useCesiumOverlaySync";

export interface CesiumMeasurementsProps {
  children: ReactNode;
  options?: MeasurementProviderOptions;
}

export const CesiumMeasurements = ({
  children,
  options,
}: CesiumMeasurementsProps) => {
  const requestUpdateCallback = useCesiumOverlaySync();

  return (
    <LabelOverlayProvider requestUpdateCallback={requestUpdateCallback}>
      <CesiumMeasurementsProvider options={options}>
        {children}
      </CesiumMeasurementsProvider>
    </LabelOverlayProvider>
  );
};
