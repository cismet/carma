import { useMemo } from "react";

import { isLocalhostHostname } from "../../hostname";

export const Deployment = {
  LOCAL_DEV: "localDev",
  DEV: "dev",
  PR: "pr",
  LIVE: "live",
} as const;

export type DeploymentTarget = (typeof Deployment)[keyof typeof Deployment];

type ResolveDeploymentOptions = {
  hostname?: string | null;
  pathname?: string | null;
};

const PR_HOSTNAMES = "cismet.github.io";
const PR_PATH_PREFIX = "/carma-pr-deployments";
const DEV_HOSTNAMES = [
  "carma-dev-deployments.github.io",
  "carma-dev-playground-deployments.github.io",
];
const LIVE_HOSTNAMES = "digital-twin-wuppertal-live.github.io";

const matchesHostname = (
  hostname: string | null | undefined,
  candidates: string | string[]
): boolean => {
  if (!hostname) {
    return false;
  }
  return Array.isArray(candidates)
    ? candidates.includes(hostname)
    : candidates === hostname;
};

const resolveDeployment = ({
  hostname = typeof window !== "undefined"
    ? window.location.hostname
    : undefined,
  pathname = typeof window !== "undefined"
    ? window.location.pathname
    : undefined,
}: ResolveDeploymentOptions = {}): DeploymentTarget | null => {
  switch (true) {
    case isLocalhostHostname(hostname):
      return Deployment.LOCAL_DEV;
    case matchesHostname(hostname, PR_HOSTNAMES) &&
      (pathname ?? "").startsWith(PR_PATH_PREFIX):
      return Deployment.PR;
    case matchesHostname(hostname, DEV_HOSTNAMES):
      return Deployment.DEV;
    case matchesHostname(hostname, LIVE_HOSTNAMES):
      return Deployment.LIVE;
    default:
      return null;
  }
};

export const useDeployment = (): DeploymentTarget | null => {
  const hostname =
    typeof window !== "undefined" ? window.location.hostname : undefined;
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : undefined;

  return useMemo(
    () => resolveDeployment({ hostname, pathname }),
    [hostname, pathname]
  );
};

export const useLiveDeployment = (): boolean =>
  useDeployment() === Deployment.LIVE;

export const useDevDeployment = (): boolean =>
  useDeployment() === Deployment.DEV;
