/**
 * @deprecated This hook is now empty and no longer needed.
 * 
 * All event subscriptions have been removed in favor of:
 * - Animation state: Use getIsAnimating() / setIsAnimating() from CesiumContext
 * - Suspension state: Managed by PortalContext
 * - Transition state: Managed by TransitionContext
 * - Style changes: Handled by scene-level hooks
 * 
 * This export is kept for backwards compatibility but does nothing.
 * It will be removed in a future version.
 */
export const useContextSetupSubscriptions = () => {
  // Empty - all logic moved to appropriate contexts
};
