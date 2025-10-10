/**
 * @deprecated This hook relied on Redux state and is now a no-op.
 * Scene styles should be configured via CesiumContext or passed as props.
 *
 * This hook is kept for backward compatibility but does nothing.
 * Components that need scene style management should implement it locally.
 */
export const useSceneStyles = () => {
  // No-op: This hook is deprecated and does nothing
  // Scene styles should be managed via CesiumContext or passed as configuration
  console.warn(
    "useSceneStyles is deprecated and does nothing. " +
      "Please refactor to use CesiumContext for scene style management."
  );
};

export default useSceneStyles;
