import React, { createContext, useContext, ReactNode, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { createSlicesInterface } from "../utils/createSlicesInterface";

export interface StoreContextValue {
  actions: any;
  selectors: any;
}

/**
 * Context for providing store actions and selectors to child components.
 * This makes any hook store-agnostic by providing a generic interface organized by slices.
 * and enables using the host app store logic
 */
const StoreContext = createContext<StoreContextValue | null>(null);

export interface StoreInterfaceProviderProps {
  children: ReactNode;
  sliceConfigs: any[];
}

/**
 * Generic provider that forwards store actions and selectors.
 * Apps wrap their components with this provider and pass their store actions and selectors organized by slices.
 * This allows any hook to be store-agnostic.
 */
export const StoreInterfaceProvider = ({
  children,
  sliceConfigs,
}: StoreInterfaceProviderProps) => {
  const dispatch = useDispatch();

  const { actions, selectors } = useMemo(
    () => createSlicesInterface(sliceConfigs, dispatch, useSelector),
    [dispatch, sliceConfigs]
  );

  return (
    <StoreContext.Provider value={{ actions, selectors }}>
      {children}
    </StoreContext.Provider>
  );
};

/**
 * Hook to access store actions and selectors from the provider.
 * Throws an error if used outside of StoreActionProvider.
 */
export const useStoreInterface = (): StoreContextValue => {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error(
      "useStoreInterface must be used within a StoreInterfaceProvider"
    );
  }
  return context;
};

// TODO: convenience hook for getting actions and selectors per slice, if specified
