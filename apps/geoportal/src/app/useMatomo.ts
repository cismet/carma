import { useEffect, useCallback, useContext, createContext } from "react";
import { useFeatureFlags } from "@carma-apps/portals";
import { useLocation } from "react-router-dom";

// Matomo tracking modes
export const MATOMO_MODE = {
  DISABLED: "DISABLED",
  ONLINE: "ONLINE",
  CONSOLE: "CONSOLE",
} as const;

export type MatomoModeType = (typeof MATOMO_MODE)[keyof typeof MATOMO_MODE];

// Create a context to expose tracking functions to other components
interface MatomoContextType {
  trackPageView: () => void;
  trackEvent: (
    category: string,
    action: string,
    name?: string,
    value?: number
  ) => void;
  currentMatomoMode: MatomoModeType;
}

export const MatomoContext = createContext<MatomoContextType | null>(null);

// Ensure the global _paq array is properly typed
declare global {
  interface Window {
    _paq?: Array<unknown>;
  }
}

/**
 * Custom hook for Matomo tracking integration
 * @param siteId - The Matomo site ID (defaults to "2")
 * @param trackerUrl - The Matomo tracker URL (defaults to "https://wupptomo.cismet.de/matomo.php")
 * @returns An object containing tracking functions and the current tracking mode
 */
export const useMatomo = (
  siteId: string = "2",
  trackerUrl: string = "https://wupptomo.cismet.de/matomo.php"
) => {
  const flags = useFeatureFlags();
  const location = useLocation();

  // Determine tracking mode based on feature flags
  const trackingEnabled = flags.featureFlagTracking;
  let currentMatomoMode: MatomoModeType = trackingEnabled
    ? MATOMO_MODE.ONLINE
    : MATOMO_MODE.CONSOLE;

  // Function to track page views in Matomo
  const trackPageView = useCallback(() => {
    // We only need to check for CONSOLE or ONLINE modes since those are the only ones we use
    // DISABLED mode is kept in the enum for future extensibility

    const currentUrl = window.location.href;
    const currentTitle = document.title;

    if (currentMatomoMode === MATOMO_MODE.CONSOLE) {
      console.log("📈 CONSOLE MODE - Would track URL:", currentUrl);
      console.log("📈 CONSOLE MODE - With title:", currentTitle);
      return;
    }

    if (window._paq) {
      console.log("📈 ONLINE MODE - Tracking URL:", currentUrl);

      // These 3 commands must be called in this exact order
      window._paq.push(["setReferrerUrl", currentUrl]);
      window._paq.push(["setCustomUrl", currentUrl]);
      window._paq.push(["setDocumentTitle", currentTitle]);

      // Remove all previously assigned custom variables
      window._paq.push(["deleteCustomVariables", "page"]);
      window._paq.push(["trackPageView"]);

      // Make Matomo aware that the page has changed
      window._paq.push(["enableLinkTracking"]);
    }
  }, [currentMatomoMode]);

  // Function to track events in Matomo
  const trackEvent = useCallback(
    (category: string, action: string, name?: string, value?: number) => {
      // We only need to check for CONSOLE or ONLINE modes since those are the only ones we use
      // DISABLED mode is kept in the enum for future extensibility

      if (currentMatomoMode === MATOMO_MODE.CONSOLE) {
        console.log(
          `📈 CONSOLE MODE - Would track event: category=${category}, action=${action}, name=${name}, value=${value}`
        );
        return;
      }

      if (window._paq) {
        console.log(
          `📈 ONLINE MODE - Tracking event: category=${category}, action=${action}, name=${name}, value=${value}`
        );
        window._paq.push(["trackEvent", category, action, name, value]);
      }
    },
    [currentMatomoMode]
  );

  // Initialize Matomo
  useEffect(() => {
    // Always initialize since we're only using CONSOLE or ONLINE modes

    // Initialize _paq array if it doesn't exist
    window._paq = window._paq || [];

    // CRITICAL: These must be set BEFORE loading the Matomo script
    window._paq.push(["enableLinkTracking"]);
    window._paq.push(["setTrackerUrl", trackerUrl]);
    window._paq.push(["setSiteId", siteId]); // TODO: später mit ENV ersetzen

    // Enable heartbeat timer to better track visit time
    window._paq.push(["enableHeartBeatTimer"]);

    // Disable cookies for GDPR compliance
    window._paq.push(["disableCookies"]);

    // Create a script element to load the Matomo tracking code
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.defer = true;
    script.src = "https://wupptomo.cismet.de/matomo.js";

    // Append the script to the document
    const firstScript = document.getElementsByTagName("script")[0];
    firstScript.parentNode?.insertBefore(script, firstScript);

    // Track the initial page view after script is loaded
    script.onload = () => {
      console.log("📈 Matomo script loaded");
      trackPageView();
    };

    // Cleanup
    return () => {
      // Remove the script when the component unmounts
      const existingScript = document.querySelector(
        'script[src="https://wupptomo.cismet.de/matomo.js"]'
      );
      if (existingScript && existingScript.parentNode) {
        existingScript.parentNode.removeChild(existingScript);
      }
    };
  }, [currentMatomoMode, trackPageView, siteId, trackerUrl]);

  // Track URL changes via hashchange event
  useEffect(() => {
    // Always track URL changes since we're only using CONSOLE or ONLINE modes

    // Keep track of the last URL to avoid duplicate tracking
    let lastUrl = window.location.href;

    // Function to check if the URL has changed
    const checkUrlChange = () => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        console.log("📈 URL changed from:", lastUrl);
        console.log("📈 URL changed to:", currentUrl);
        lastUrl = currentUrl;
        trackPageView();
      }
    };

    // Listen for hashchange events
    window.addEventListener("hashchange", checkUrlChange);

    // Also poll for URL changes that don't trigger hashchange
    const urlCheckInterval = setInterval(checkUrlChange, 500);

    // Cleanup
    return () => {
      window.removeEventListener("hashchange", checkUrlChange);
      clearInterval(urlCheckInterval);
    };
  }, [currentMatomoMode, trackPageView]);

  // Track React Router location changes
  useEffect(() => {
    if (location) {
      console.log("📈 React Router location changed");
      trackPageView();
    }
  }, [location, trackPageView]);

  return {
    currentMatomoMode,
    trackPageView,
    trackEvent,
  };
};

/**
 * Hook to access Matomo tracking functions from any component
 * Must be used within a component that's a child of MatomoProvider
 */
export const useMatomoTracking = () => {
  const context = useContext(MatomoContext);
  if (!context) {
    throw new Error("useMatomoTracking must be used within a MatomoProvider");
  }
  return context;
};

export default useMatomo;
