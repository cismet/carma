import { createContext } from "react";
import { FeatureFlags } from "./FeatureFlagProvider";

export const FeatureFlagContext = createContext<FeatureFlags>({});
