export interface NonLiveBorderProps {
  /** show the frame; the app decides what counts as "not live" */
  visible: boolean;
  color?: string;
  widthPx?: number;
}

/**
 * Frame around the whole viewport that marks an app instance which is not
 * the live one (dev, PR or local deployment, or a test database). It never
 * intercepts clicks and sits above modals.
 */
export const NonLiveBorder = ({
  visible,
  color = "#eab308",
  widthPx = 3,
}: NonLiveBorderProps) => {
  if (!visible) {
    return null;
  }
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        border: `${widthPx}px solid ${color}`,
        pointerEvents: "none",
        boxSizing: "border-box",
        zIndex: 999999,
      }}
    />
  );
};
