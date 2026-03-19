import * as THREE from "three";

// ─────────────────────────────────────────────────────────────
//  Tree type definitions
// ─────────────────────────────────────────────────────────────

export interface TreePrototype {
  trunk: THREE.BufferGeometry;
  crown: THREE.BufferGeometry;
  name: string;
  baseHeight: number;
  baseRadius: number;
}

export const TREE_TYPES = [
  "conical",
  "parabolic",
  "spherical",
  "gaussian",
  "hyperbolic",
] as const;

export type TreeTypeName = (typeof TREE_TYPES)[number];

// Per-type crown colors from the Einzelbaum legend (farbe values)
export const TYPE_COLORS: Record<TreeTypeName, string> = {
  conical: "#1f5f3a",
  parabolic: "#5e7f3a",
  spherical: "#4e8f3d",
  gaussian: "#6fae6a",
  hyperbolic: "#8bbf3d",
};

export const TRUNK_COLORS = ["#5c3a1e", "#4a2e15", "#6b4528"];

// Map templ_typ feature property values to internal type names
export const TYPE_MAP: Record<string, TreeTypeName> = {
  CONICAL: "conical",
  PARABOLIC: "parabolic",
  SPHERICAL: "spherical",
  GAUSSIAN: "gaussian",
  HYPERBOLIC: "hyperbolic",
};

// ─────────────────────────────────────────────────────────────
//  Geometry factory
//  Each tree: trunk (CylinderGeometry) + crown (LatheGeometry)
//  All in meters, Y-up, origin at ground level.
// ─────────────────────────────────────────────────────────────

function makeCrown(
  profileFn: (t: number) => number,
  R: number,
  H: number,
  segments: number,
  latheSegs = 8
): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    pts.push(new THREE.Vector2(profileFn(t) * R, t * H));
  }
  pts.push(new THREE.Vector2(0, H));
  return new THREE.LatheGeometry(pts, latheSegs);
}

function conical(): TreePrototype {
  const trunk = new THREE.CylinderGeometry(0.12, 0.18, 2.0, 6);
  trunk.translate(0, 1.0, 0);

  const crown = makeCrown((t) => 1 - t, 2.0, 5.5, 12, 8);
  crown.translate(0, 2.0, 0);
  crown.computeVertexNormals();

  return { trunk, crown, name: "Conical", baseHeight: 7.5, baseRadius: 2.0 };
}

function parabolic(): TreePrototype {
  const trunk = new THREE.CylinderGeometry(0.15, 0.22, 2.5, 6);
  trunk.translate(0, 1.25, 0);

  const crown = makeCrown((t) => Math.sqrt(1 - t), 2.5, 5.0, 16, 8);
  crown.translate(0, 2.5, 0);
  crown.computeVertexNormals();

  return {
    trunk,
    crown,
    name: "Parabolic",
    baseHeight: 7.5,
    baseRadius: 2.5,
  };
}

function spherical(): TreePrototype {
  const trunk = new THREE.CylinderGeometry(0.15, 0.22, 3.0, 6);
  trunk.translate(0, 1.5, 0);

  const crown = makeCrown(
    (t) => {
      const u = 2 * t - 1;
      return Math.sqrt(Math.max(0, 1 - u * u));
    },
    2.5,
    4.5,
    20,
    10
  );
  crown.translate(0, 3.0, 0);
  crown.computeVertexNormals();

  return {
    trunk,
    crown,
    name: "Spherical",
    baseHeight: 7.5,
    baseRadius: 2.5,
  };
}

function gaussian(): TreePrototype {
  const trunk = new THREE.CylinderGeometry(0.14, 0.2, 2.5, 6);
  trunk.translate(0, 1.25, 0);

  const k = 5.0;
  const crown = makeCrown(
    (t) => Math.exp(-k * (t - 0.35) * (t - 0.35)),
    2.8,
    5.5,
    20,
    10
  );
  crown.translate(0, 2.5, 0);
  crown.computeVertexNormals();

  return { trunk, crown, name: "Gaussian", baseHeight: 8.0, baseRadius: 2.8 };
}

function hyperbolic(): TreePrototype {
  const trunk = new THREE.CylinderGeometry(0.14, 0.2, 3.0, 6);
  trunk.translate(0, 1.5, 0);

  // TODO: temporarily uses parabolic profile (sqrt(1-t)) instead of the
  // original cosh curve because the hyperbolic shape was visually
  // indistinguishable from parabolic. Replace with a distinct profile
  // once a better shape is agreed on. Color is kept as-is (#8bbf3d).
  const crown = makeCrown((t) => Math.sqrt(1 - t), 2.2, 5.0, 16, 8);
  crown.translate(0, 3.0, 0);
  crown.computeVertexNormals();

  return {
    trunk,
    crown,
    name: "Hyperbolic",
    baseHeight: 8.0,
    baseRadius: 2.2,
  };
}

const FACTORY: Record<TreeTypeName, () => TreePrototype> = {
  conical,
  parabolic,
  spherical,
  gaussian,
  hyperbolic,
};

export function buildPrototype(type: TreeTypeName): TreePrototype {
  return FACTORY[type]();
}

// Pre-computed base dimensions for scaling calculations
export const BASE_DIMS: Record<TreeTypeName, { h: number; r: number }> =
  Object.fromEntries(
    TREE_TYPES.map((t) => {
      const proto = FACTORY[t]();
      proto.trunk.dispose();
      proto.crown.dispose();
      return [t, { h: proto.baseHeight, r: proto.baseRadius }];
    })
  ) as Record<TreeTypeName, { h: number; r: number }>;
