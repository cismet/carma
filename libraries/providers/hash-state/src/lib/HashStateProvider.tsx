import React, {
  startTransition,
} from "react";
import { useLocation } from "react-router-dom";
import {
  computeHashDiff,
} from "./utils";
import {
  HashStateProviderBase,
  useHashState,
  type HashChangeEvent,
  type HashChangeSource,
  type HashCodecs,
  type HashCodec,
  type HashKeyAliases,
  type HashRoutingMode,
  type HashStateProviderSharedProps,
} from "./hashStateShared";

export {
  useHashState,
  type HashChangeEvent,
  type HashChangeSource,
  type HashCodecs,
  type HashCodec,
  type HashKeyAliases,
  type HashRoutingMode,
};

type HashStateProviderProps = HashStateProviderSharedProps & {
  routingMode?: HashRoutingMode;
  routedPathOverride?: string;
};

const RoutedHashStateProvider: React.FC<HashStateProviderProps> = ({
  routedPathOverride,
  children,
  ...props
}) => {
  const location = useLocation();

  return (
    <HashStateProviderBase
      {...props}
      routedPath={routedPathOverride ?? location.pathname}
    >
      {children}
    </HashStateProviderBase>
  );
};

const NeutralHashStateProvider: React.FC<HashStateProviderProps> = ({
  routedPathOverride,
  children,
  ...props
}) => (
  <HashStateProviderBase {...props} routedPath={routedPathOverride ?? ""}>
    {children}
  </HashStateProviderBase>
);

export const HashStateProvider: React.FC<HashStateProviderProps> = ({
  routingMode = "routed",
  ...props
}) =>
  routingMode === "neutral" ? (
    <NeutralHashStateProvider {...props} />
  ) : (
    <RoutedHashStateProvider {...props} />
  );
