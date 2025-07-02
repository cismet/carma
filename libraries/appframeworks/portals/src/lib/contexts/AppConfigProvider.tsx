import React, { createContext, ReactNode, useContext } from "react";
import { useAppConfigSetup } from "../hooks/useAppConfigSetup";

export interface AppConfigProviderProps {
  children: ReactNode;
  configBaseUrl: string;
  layerMap: Record<string, unknown>;
  configKey?: string;
}

type AppConfigContextType = {
  isLoadingConfig: boolean;
};

const AppConfigContext = createContext<AppConfigContextType | undefined>(
  undefined
);

/**
 * Provider that handles app config loading logic.
 * Relies on StoreActionProvider for store actions.
 * Apps must wrap this with StoreActionProvider that provides the required actions.
 */
export const AppConfigProvider: React.FC<AppConfigProviderProps> = ({
  children,
  configBaseUrl,
  layerMap,
  configKey = "config",
}) => {
  const isLoadingConfig = useAppConfigSetup(configBaseUrl, layerMap, configKey);

  console.debug("RENDER xxx: [PORTALS] APP CONFIG PROVIDER", isLoadingConfig);

  return (
    <AppConfigContext.Provider value={{ isLoadingConfig }}>
      {children}
    </AppConfigContext.Provider>
  );
};

export function useAppConfig() {
  const ctx = useContext(AppConfigContext);
  if (!ctx)
    throw new Error("useAppConfig must be used within a AppConfigProvider");
  return ctx;
}

export default AppConfigProvider;
