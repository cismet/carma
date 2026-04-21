import React from "react";

import { useLocation } from "react-router-dom";

import {
  HASH_CLEAR_STATE_KEY_SET,
  HASH_STATE_CHANGE_SOURCE,
  RoutedHashStateProvider,
  useHashState,
  type HashClearStateKeySetId,
  type StateKeyToHashParamValueCodecMap,
  type HashParamValueCodec,
  type HashStateChangeEvent,
  type HashStateChangeSource,
  type HashParamNameToStateKeyMap,
  type HashParams,
  type StateKeyToHashParamNameAliases,
  type StateKeyToHashParamNameMap,
  type HashStateProviderSharedProps,
} from "./hashStateShared";
export {
  HASH_CLEAR_STATE_KEY_SET,
  HASH_STATE_CHANGE_SOURCE,
  useHashState,
  type HashClearStateKeySetId,
  type StateKeyToHashParamValueCodecMap,
  type HashParamValueCodec,
  type HashStateChangeEvent,
  type HashStateChangeSource,
  type HashParamNameToStateKeyMap,
  type HashParams,
  type StateKeyToHashParamNameAliases,
  type StateKeyToHashParamNameMap,
  type HashStateProviderSharedProps,
} from "./hashStateShared";

export const HashStateProvider: React.FC<HashStateProviderSharedProps> = ({
  children,
  ...props
}) => {
  const location = useLocation();

  return (
    <RoutedHashStateProvider {...props} routedPath={location.pathname}>
      {children}
    </RoutedHashStateProvider>
  );
};
