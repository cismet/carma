export {
  // New callback-based API
  CarmaMapAPIProvider,
  useCarmaMapAPIActions,
  useHasLayerById,
  type CarmaMapAPIProviderProps,
  type CarmaMapAPIContextValue,
  type AddLayerOptions,
  // Legacy Redux-based API (backward compatibility)
  useCarmaMapAPISelector,
  useCarmaMapAPIDispatch,
  createLayerSelectors,
  type APIRootState,
} from "./lib/contexts/CarmaMapAPIProvider.tsx";
