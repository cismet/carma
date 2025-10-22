import { type GazDataConfig } from "@carma-commons/gazetteer";
import { defaultGazDataConfig } from "@carma/resources";
import { AuthProvider } from "@carma/providers/auth";

import { GazDataProvider } from "./GazDataProvider";
import { PortalProvider, type PortalConfig } from "../contexts/PortalProvider";
import { HashStateProvider } from "../contexts/HashStateProvider";
import { SandboxedEvalProvider } from "./SandboxedEvalProvider";

type CarmaMapProviderWrapperProps = {
  children: React.ReactNode;
  gazDataConfig?: GazDataConfig;

  // Single config object for all map/portal state
  portalConfig: PortalConfig;
};

export const CarmaMapProviderWrapper = ({
  children,
  gazDataConfig = defaultGazDataConfig,
  portalConfig,
}: CarmaMapProviderWrapperProps) => {
  const { hashConfig } = portalConfig.portalConfig;

  if (gazDataConfig.crs !== "3857") {
    console.warn(
      "Gazetteer data CRS is not supported, it should be 3857, Spherical Mercator"
    );
  }

  return (
    <HashStateProvider config={hashConfig}>
      <AuthProvider>
        <SandboxedEvalProvider>
          <GazDataProvider config={gazDataConfig}>
            <PortalProvider config={portalConfig}>{children}</PortalProvider>
          </GazDataProvider>
        </SandboxedEvalProvider>
      </AuthProvider>
    </HashStateProvider>
  );
};

export default CarmaMapProviderWrapper;
