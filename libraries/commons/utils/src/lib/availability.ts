import type { DeploymentTarget } from "./react/hooks/useDeployment";

/**
 * Restricts where something (a route, a workflow perspective, a workflow, an
 * addon) is reachable. Every given condition must hold; an omitted condition
 * is not checked, so an omitted `availability` means available everywhere,
 * without any feature flag.
 */
export type Availability = {
  /** only on these deployments; an unresolvable deployment never matches */
  deployments?: DeploymentTarget[];
  /** only while this flag resolves to true */
  featureFlag?: string;
};

export type AvailabilityContext = {
  deployment: DeploymentTarget | null;
  featureFlags: Record<string, boolean | undefined>;
};

export const isAvailable = (
  availability: Availability | undefined,
  { deployment, featureFlags }: AvailabilityContext
): boolean => {
  if (!availability) {
    return true;
  }
  const { deployments, featureFlag } = availability;
  if (
    deployments &&
    (deployment === null || !deployments.includes(deployment))
  ) {
    return false;
  }
  if (featureFlag && featureFlags[featureFlag] !== true) {
    return false;
  }
  return true;
};
