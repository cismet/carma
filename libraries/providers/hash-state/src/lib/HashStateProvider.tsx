import React, { startTransition } from "react";

import { useLocation } from "react-router-dom";

import {
  HASH_CHANGE_SOURCE,
  HASH_CLEAR_KEY_SET,
  HashStateProviderBase,
  useHashState,
  type HashClearKeySetId,
  type HashChangeEvent,
  type HashChangeSource,
  type HashCodecs,
  type HashCodec,
  type HashKeyAliases,
  type HashStateProviderSharedProps,
} from "./hashStateShared";
import { computeHashDiff } from "./utils";
export {
  HASH_CHANGE_SOURCE,
  HASH_CLEAR_KEY_SET,
  useHashState,
  type HashClearKeySetId,
  type HashChangeEvent,
  type HashChangeSource,
  type HashCodecs,
  type HashCodec,
  type HashKeyAliases,
  type HashStateProviderSharedProps,
} from "./hashStateShared";

export const HashStateProvider: React.FC<HashStateProviderSharedProps> = ({
  children,
  ...props
}) => {
  const location = useLocation();

  return (
    <HashStateProviderBase {...props} routedPath={location.pathname}>
      {children}
    </HashStateProviderBase>
  );
};
