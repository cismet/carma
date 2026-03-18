import React, { startTransition } from "react";
import { useLocation } from "react-router-dom";
import { computeHashDiff } from "./utils";
import {
  HASH_CHANGE_SOURCE,
  HASH_CLEAR_KEY_SET,
  HASH_ROUTING_MODE,
  HashStateProviderBase,
  useHashState,
  type HashClearKeySetId,
  type HashChangeEvent,
  type HashChangeSource,
  type HashCodecs,
  type HashCodec,
  type HashKeyAliases,
  type HashRoutingMode,
  type HashStateProviderSharedProps,
} from "./hashStateShared";

export {
  HASH_CHANGE_SOURCE,
  HASH_CLEAR_KEY_SET,
  HASH_ROUTING_MODE,
  useHashState,
  type HashClearKeySetId,
  type HashChangeEvent,
  type HashChangeSource,
  type HashCodecs,
  type HashCodec,
  type HashKeyAliases,
  type HashRoutingMode,
  type HashStateProviderSharedProps,
} from "./hashStateShared";

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
  routingMode = HASH_ROUTING_MODE.ROUTED,
  ...props
}) =>
  routingMode === HASH_ROUTING_MODE.NEUTRAL ? (
    <NeutralHashStateProvider {...props} />
  ) : (
    <RoutedHashStateProvider {...props} />
  );
