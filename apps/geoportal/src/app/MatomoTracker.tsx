import { ReactNode } from "react";
import { useMatomo, MatomoContext } from "./useMatomo";

interface MatomoTrackerProps {
  children?: ReactNode;
  siteId?: string;
  trackerUrl?: string;
}

/**
 * Component that initializes Matomo tracking and provides tracking functions to children
 * This component should be rendered inside the FeatureFlagProvider
 */
export const matomo_site_id = import.meta.env.VITE_MATOMO_SITE_ID || "2";

export const MatomoTracker = ({
  children,
  siteId = matomo_site_id,
  trackerUrl = "https://wupptomo.cismet.de/matomo.php",
}: MatomoTrackerProps) => {
  // Initialize Matomo tracking
  const { currentMatomoMode, trackPageView, trackEvent } = useMatomo(
    siteId,
    trackerUrl
  );

  // Provide tracking functions to children via context
  return (
    <MatomoContext.Provider
      value={{ currentMatomoMode, trackPageView, trackEvent }}
    >
      {children}
    </MatomoContext.Provider>
  );
};

export default MatomoTracker;
