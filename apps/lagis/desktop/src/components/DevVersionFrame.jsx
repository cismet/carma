import versionData from "../version.json";

// Only live builds are stamped with `triggered: "live"` in version.json.
const isLiveVersion = versionData.triggered === "live";

// Fixed overlay with an inset shadow: sits above everything without
// affecting layout or catching clicks.
const DevVersionFrame = () => {
  if (isLiveVersion) {
    return null;
  }
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 2147483647,
        boxShadow: "inset 0 0 0 4px #f0a830",
      }}
    />
  );
};

export default DevVersionFrame;
