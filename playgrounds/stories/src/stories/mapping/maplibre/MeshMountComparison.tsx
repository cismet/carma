import { MeshMountDemo, type MeshMountDemoOptions } from "./MeshMountDemo";
import { MESH_MOUNT_COMPARISON_VIEWS } from "./mesh-mount-presets";

/** Independent map contexts are intentional: this compares geographic sites. */
export const MeshMountComparison = (options: MeshMountDemoOptions) => (
  <section
    style={{
      height: "100vh",
      display: "grid",
      gridTemplateRows: "auto minmax(0, 1fr)",
    }}
  >
    <header style={{ padding: "2px 6px", font: "12px system-ui" }}>
      Center / North · Stoffelsberg / South — {options.verticalFovDegrees}° narrow
      perspective, not true orthography · shared zoom and mount controls · cross
      marks view center.
    </header>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gridTemplateRows: "repeat(2, minmax(0, 1fr))",
        gap: 1,
        minHeight: 0,
      }}
    >
      {MESH_MOUNT_COMPARISON_VIEWS.map((view) => (
        <MeshMountDemo
          key={view}
          {...options}
          view={view}
          compact
          viewportWidth={100}
          viewportHeight={100}
          animateViewport={false}
        />
      ))}
    </div>
  </section>
);
