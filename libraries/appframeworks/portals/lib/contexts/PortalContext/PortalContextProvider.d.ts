import { PortalProviderProps } from "../../types/portal";
/**
 * PortalContextProvider - Outer context for config extraction and provider orchestration
 *
 * === RESPONSIBILITIES ===
 * - Extract and validate configuration
 * - Orchestrate provider stack
 * - Pass settled state to inner PortalStateProvider
 * - Wrap children with all portal-level providers:
 *   - AuthProvider (authentication)
 *   - SandboxedEvalProvider (sandboxed evaluation)
 *   - GazDataProvider (gazetteer data)
 *   - SelectionProvider (selection state)
 *   - TransitionContextProvider (2D↔3D transitions)
 *   - CesiumContextProvider (3D scene management)
 *   - CarmaTopicMapContextProvider (topic map context)
 *   - OverlayTourProvider (overlay tours)
 *   - PortalStateProvider (inner state management)
 */
export declare const PortalContextProvider: ({
  children,
  config,
}: PortalProviderProps) => import("react/jsx-runtime").JSX.Element;
export default PortalContextProvider;
