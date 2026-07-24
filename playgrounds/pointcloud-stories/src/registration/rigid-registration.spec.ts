import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  densityBalancedWeights,
  solveRigidRegistration,
} from "./rigid-registration";

const totalRotationDegrees = (euler: THREE.Euler) => {
  const quaternion = new THREE.Quaternion().setFromEuler(euler);
  return THREE.MathUtils.radToDeg(
    2 * Math.acos(THREE.MathUtils.clamp(Math.abs(quaternion.w), -1, 1))
  );
};

describe("solveRigidRegistration", () => {
  it("maps point-cloud coordinates into mesh coordinates", () => {
    const rotation = new THREE.Euler(0.1, -0.2, 0.3);
    const expected = new THREE.Matrix4().compose(
      new THREE.Vector3(12, -4, 2),
      new THREE.Quaternion().setFromEuler(rotation),
      new THREE.Vector3(1, 1, 1)
    );
    const source = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(10, 0, 0),
      new THREE.Vector3(0, 10, 0),
      new THREE.Vector3(0, 0, 10),
    ];
    const result = solveRigidRegistration(
      source.map((point) => ({ source: point, target: point.clone().applyMatrix4(expected) })),
      // The synthetic transform rotates ~21° in total — far beyond the survey
      // default cap, so this exactness test raises the allowance explicitly.
      { maxRotationDegrees: 45 }
    );
    expect(result.rmsResidualMeters).toBeLessThan(1e-6);
    result.matrix.elements.forEach((value, index) => {
      expect(value).toBeCloseTo(expected.elements[index], 6);
    });
  });

  it("honors locked axes and reports residuals", () => {
    const result = solveRigidRegistration(
      [
        { source: new THREE.Vector3(0, 0, 0), target: new THREE.Vector3(10, 20, 30) },
        { source: new THREE.Vector3(1, 0, 0), target: new THREE.Vector3(11, 20, 30) },
        { source: new THREE.Vector3(0, 1, 0), target: new THREE.Vector3(10, 21, 30) },
      ],
      { allowTranslation: { x: false, y: true, z: false }, allowRotation: { x: false, y: false, z: false } }
    );
    expect(result.translation.x).toBe(0);
    expect(result.translation.z).toBe(0);
    expect(result.residuals).toHaveLength(3);
    expect(result.rmsResidualMeters).toBeGreaterThan(0);
  });

  it("still recovers an exact transform with clustered pairs", () => {
    const rotation = new THREE.Euler(0.05, 0.4, -0.15);
    const expected = new THREE.Matrix4().compose(
      new THREE.Vector3(3, 7, -5),
      new THREE.Quaternion().setFromEuler(rotation),
      new THREE.Vector3(1, 1, 1)
    );
    const source = [
      // Tight cluster in one corner plus far-apart singles.
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.4, 0.1, 0),
      new THREE.Vector3(0.2, 0, 0.3),
      new THREE.Vector3(100, 0, 0),
      new THREE.Vector3(0, 90, 10),
      new THREE.Vector3(20, 5, 110),
    ];
    const result = solveRigidRegistration(
      source.map((point) => ({ source: point, target: point.clone().applyMatrix4(expected) })),
      { maxRotationDegrees: 45 }
    );
    expect(result.rmsResidualMeters).toBeLessThan(1e-6);
  });

  it("gives a cluster of pairs the pull of roughly one pair", () => {
    const cluster = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.5, 0, 0),
      new THREE.Vector3(0, 0.5, 0),
      new THREE.Vector3(0, 0, 0.5),
    ];
    const singles = [
      new THREE.Vector3(100, 0, 0),
      new THREE.Vector3(0, 100, 0),
      new THREE.Vector3(0, 0, 100),
    ];
    const weights = densityBalancedWeights([...cluster, ...singles]);
    const clusterWeights = weights.slice(0, cluster.length);
    const singleWeights = weights.slice(cluster.length);
    for (const clustered of clusterWeights) {
      for (const single of singleWeights) {
        expect(clustered).toBeLessThan(single / 2);
      }
    }
    const clusterTotal = clusterWeights.reduce((sum, value) => sum + value, 0);
    const meanSingle =
      singleWeights.reduce((sum, value) => sum + value, 0) / singleWeights.length;
    expect(clusterTotal).toBeGreaterThan(meanSingle * 0.5);
    expect(clusterTotal).toBeLessThan(meanSingle * 2);
  });

  it("keeps a biased cluster from outvoting well-separated pairs", () => {
    const clusterBias = new THREE.Vector3(0, 2, 0);
    const cluster = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(1, 1, 0),
      new THREE.Vector3(0.5, 0.5, 0),
    ];
    const singles = [
      new THREE.Vector3(120, 0, 0),
      new THREE.Vector3(0, 110, 0),
      new THREE.Vector3(0, 0, 130),
      new THREE.Vector3(90, 80, 70),
    ];
    const pairs = [
      ...cluster.map((point) => ({
        source: point,
        target: point.clone().add(clusterBias),
      })),
      ...singles.map((point) => ({ source: point, target: point.clone() })),
    ];
    const singleResiduals = (weighting: "density" | "uniform") => {
      const { matrix } = solveRigidRegistration(pairs, { weighting });
      return singles.map((point) =>
        point.clone().applyMatrix4(matrix).distanceTo(point)
      );
    };
    const density = singleResiduals("density");
    const uniform = singleResiduals("uniform");
    const rms = (values: number[]) =>
      Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
    // Balanced weighting fits the well-separated pairs clearly better than
    // letting the five redundant clustered picks dominate the solve.
    expect(rms(density)).toBeLessThan(rms(uniform) * 0.75);
  });

  it("recovers rotations within the default 15-degree allowance", () => {
    const tenDegrees = new THREE.Matrix4().makeRotationY(
      THREE.MathUtils.degToRad(10)
    );
    const source = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(50, 0, 0),
      new THREE.Vector3(0, 40, 0),
      new THREE.Vector3(0, 0, 60),
    ];
    const result = solveRigidRegistration(
      source.map((point) => ({ source: point, target: point.clone().applyMatrix4(tenDegrees) }))
    );
    // 10 deg is now inside the allowance, so it recovers exactly.
    expect(totalRotationDegrees(result.rotation)).toBeCloseTo(10, 3);
  });

  it("caps the total rotation angle at the default 15-degree allowance", () => {
    const twentyFiveDegrees = new THREE.Matrix4().makeRotationY(
      THREE.MathUtils.degToRad(25)
    );
    const source = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(50, 0, 0),
      new THREE.Vector3(0, 40, 0),
      new THREE.Vector3(0, 0, 60),
    ];
    const result = solveRigidRegistration(
      source.map((point) => ({ source: point, target: point.clone().applyMatrix4(twentyFiveDegrees) }))
    );
    const angle = totalRotationDegrees(result.rotation);
    expect(angle).toBeLessThanOrEqual(15.001);
    // The data genuinely wants 25°, so the solve should sit at the cap.
    expect(angle).toBeGreaterThan(14.5);
  });

  it("caps the uniform scale at ±0.5% by default", () => {
    const scaled = new THREE.Matrix4().makeScale(1.05, 1.05, 1.05);
    const source = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(100, 0, 0),
      new THREE.Vector3(0, 100, 0),
      new THREE.Vector3(0, 0, 100),
    ];
    const result = solveRigidRegistration(
      source.map((point) => ({ source: point, target: point.clone().applyMatrix4(scaled) })),
      { allowUniformScale: true }
    );
    expect(result.uniformScale).toBeLessThanOrEqual(1.005 + 1e-9);
    expect(result.uniformScale).toBeGreaterThan(1.004);
  });

  it("never rolls around a line of pairs to chase their noise", () => {
    const pairs = Array.from({ length: 8 }, (_, index) => {
      const source = new THREE.Vector3(index * 10, 0, 0);
      // Alternating vertical noise on pairs that all sit on the east axis:
      // no rigid rotation can explain it, and the roll around that axis is
      // completely unobservable from this geometry.
      const target = source.clone().add(
        new THREE.Vector3(0, index % 2 === 0 ? 0.05 : -0.05, 0)
      );
      return { source, target };
    });
    const result = solveRigidRegistration(pairs);
    expect(Math.abs(result.rotation.x)).toBeLessThan(1e-6);
    expect(totalRotationDegrees(result.rotation)).toBeLessThan(0.5);
  });

  it("prioritizes vertical agreement over horizontal agreement", () => {
    const pairs = [
      // Two pairs asking for a tilt (vertical error growing with east).
      { source: new THREE.Vector3(10, 0, 0), target: new THREE.Vector3(10, 0.2, 0) },
      { source: new THREE.Vector3(10, 0, 10), target: new THREE.Vector3(10, 0.2, 10) },
      // Elevated pair that a tilt drags horizontally — the counterweight.
      { source: new THREE.Vector3(0, 10, 0), target: new THREE.Vector3(0, 10, 0) },
      // Neutral anchors.
      { source: new THREE.Vector3(0, 0, 0), target: new THREE.Vector3(0, 0, 0) },
      { source: new THREE.Vector3(0, 0, 10), target: new THREE.Vector3(0, 0, 10) },
    ];
    const verticalRms = (verticalErrorWeight: number) => {
      const { matrix } = solveRigidRegistration(pairs, { verticalErrorWeight });
      const verticalErrors = pairs.map(({ source, target }) =>
        Math.abs(target.y - source.clone().applyMatrix4(matrix).y)
      );
      return Math.sqrt(
        verticalErrors.reduce((sum, value) => sum + value * value, 0) /
          verticalErrors.length
      );
    };
    expect(verticalRms(8)).toBeLessThan(verticalRms(1) * 0.9);
  });

  it("rejects fewer than three pairs", () => {
    expect(() =>
      solveRigidRegistration([
        { source: new THREE.Vector3(), target: new THREE.Vector3() },
        { source: new THREE.Vector3(1, 0, 0), target: new THREE.Vector3(1, 0, 0) },
      ])
    ).toThrow("At least three point pairs");
  });
});
