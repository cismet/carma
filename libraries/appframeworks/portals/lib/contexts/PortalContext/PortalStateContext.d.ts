import { ReactNode } from "react";
import { PortalConfig } from "../../types/portal";
export interface PortalStateProviderProps {
  children: ReactNode;
  config: PortalConfig;
}
export declare const PortalStateProvider: ({
  children,
  config,
}: PortalStateProviderProps) => import("react/jsx-runtime").JSX.Element;
