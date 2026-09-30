/** Conceptual reference-frame diagram; deliberately not a numerical residual plot. */
export const MeshMountDiagram = () => (
  <main
    style={{
      padding: 16,
      maxWidth: 1100,
      margin: "auto",
      font: "14px/1.5 system-ui, sans-serif",
      color: "#17212b",
    }}
  >
    <h2>One curved mesh, different map frames</h2>
    <p>
      Schematic only: curvature, heights and scale differences are exaggerated.
      Drawing coordinates are SVG pixels, not metres. This is not an accuracy
      measurement or a literal Mercator map.
    </p>
    <svg
      viewBox="0 0 1000 460"
      role="img"
      aria-labelledby="mesh-mount-diagram-title mesh-mount-diagram-description"
      style={{ width: "100%", display: "block" }}
    >
      <title id="mesh-mount-diagram-title">
        Tangent plane, curved Earth and changing Mercator scale
      </title>
      <desc id="mesh-mount-diagram-description">
        The mesh follows the ellipsoid below a tangent plane away from the mount
        origin. A local affine fit moves the accurate neighbourhood but does not
        remove curvature. Nonlinear reprojection flattens geographic positions
        into Mercator, whose scale grows towards the poles.
      </desc>
      <g fill="none" strokeWidth="3">
        <path d="M 60 155 H 940" stroke="#1261a0" />
        <path d="M 60 330 Q 500 -20 940 330" stroke="#25834b" />
        <path d="M 630 164 L 900 244" stroke="#9a428f" />
        <path d="M 720 155 V 204" stroke="#ba4b00" />
        <path d="M 712 155 H 728 M 712 204 H 728" stroke="#ba4b00" />
        <path
          d="M 485 147 L 485 125 L 500 115 L 515 125 L 515 147"
          stroke="#17212b"
        />
        <path
          d="M 708 199 L 715 174 L 733 168 L 745 182 L 738 207"
          stroke="#17212b"
        />
      </g>
      <circle cx="500" cy="155" r="5" fill="#17212b" />
      <g fontFamily="system-ui, sans-serif" fontSize="16" fill="currentColor">
        <text x="60" y="130" fill="#1261a0">
          Tangent plane at fixed mount
        </text>
        <text x="500" y="92" textAnchor="middle">
          Mount origin
        </text>
        <text x="500" y="187" textAnchor="middle">
          Local agreement
        </text>
        <text x="745" y="155" fill="#ba4b00">
          Curvature separation
        </text>
        <text x="690" y="270" fill="#9a428f">
          Local fit at another site
        </text>
        <text x="75" y="325" fill="#25834b">
          Curved ECEF / ellipsoid
        </text>
        <text x="60" y="385">
          Mercator scale: k ≈ 1 / cos(latitude)
        </text>
        <text x="60" y="412">
          Moving north near Wuppertal increases map units per ground metre.
        </text>
        <text x="60" y="439">
          Height datum correction and projection correction are separate
          operations.
        </text>
      </g>
    </svg>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: 20,
      }}
    >
      <section>
        <h3>1 · Fixed root mount</h3>
        <p>
          One translation, rotation and scale agrees near the origin. Separation
          from the tangent plane grows approximately as d² / (2R), with distance
          d and local curvature radius R both in metres. This is a
          small-distance estimate, not the measured mesh error.
        </p>
      </section>
      <section>
        <h3>2 · Camera-local affine fit</h3>
        <p>
          Translation, rotation and scale move the best-fit neighbourhood
          towards the camera. They cannot flatten a curved surface over
          arbitrary extent. Two distant cameras cannot both have their own exact
          fit in one common affine scene transform.
        </p>
      </section>
      <section>
        <h3>3 · Nonlinear geographic reprojection</h3>
        <p>
          Convert each ECEF position to longitude, latitude and height, then to
          Mercator. Ground geometry and sampling bounds must use the same
          mapping. Height remains an independent physical coordinate; a terrain
          is not flattened to zero elevation. Precision, pole limits and
          wrapping still require explicit handling.
        </p>
      </section>
    </div>
    <p>
      DHHN2016 normal height H plus GCG2016 height anomaly ζ gives ellipsoidal
      height h. Changing this vertical datum does not remove horizontal Mercator
      distortion. Orthophoto residuals also include source registration and
      relief parallax; these sketches cannot identify their cause.
    </p>
  </main>
);
