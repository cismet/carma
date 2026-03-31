export type Point2 = {
  x: number;
  y: number;
};

export type ConvexPolygonIntersectionRelation2d =
  | "disjoint"
  | "subject-inside-clip"
  | "clip-inside-subject"
  | "overlap";

export const getEquilateralTriangleHeight = (edgeLength: number): number =>
  (edgeLength * Math.sqrt(3)) / 2;

export const getEquilateralTrianglePathD = (edgeLength: number): string => {
  const height = getEquilateralTriangleHeight(edgeLength);
  return `M ${edgeLength / 2} 0 L 0 ${height} L ${edgeLength} ${height} Z`;
};

export const getEquilateralTriangleViewBox = (edgeLength: number): string =>
  `0 0 ${edgeLength} ${getEquilateralTriangleHeight(edgeLength)}`;

export const buildCirclePoints = (
  radiusPx: number,
  segments: number
): Point2[] =>
  Array.from({ length: segments }, (_, index) => {
    const t = (index / segments) * Math.PI * 2;
    return {
      x: Math.cos(t) * radiusPx,
      y: Math.sin(t) * radiusPx,
    };
  });

export const getSupportRadius2d = (points: Point2[]): number => {
  let maxProjectedRadius = 0;
  points.forEach((point) => {
    const d = Math.hypot(point.x, point.y);
    if (Number.isFinite(d) && d > maxProjectedRadius) {
      maxProjectedRadius = d;
    }
  });
  return maxProjectedRadius;
};

export const getSignedPolygonArea2d = (points: readonly Point2[]): number => {
  if (points.length < 3) {
    return 0;
  }

  let areaTwice = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    areaTwice += current.x * next.y - next.x * current.y;
  }

  return areaTwice * 0.5;
};

export const getPolygonArea2d = (points: readonly Point2[]): number =>
  Math.abs(getSignedPolygonArea2d(points));

const normalizeConvexPolygonWinding = (
  points: readonly Point2[]
): readonly Point2[] =>
  getSignedPolygonArea2d(points) < 0 ? [...points].reverse() : [...points];

const cross2d = (left: Point2, right: Point2): number =>
  left.x * right.y - left.y * right.x;

const subtractPoint2 = (left: Point2, right: Point2): Point2 => ({
  x: left.x - right.x,
  y: left.y - right.y,
});

const isPointInsideDirectedEdge = (
  point: Point2,
  edgeStart: Point2,
  edgeEnd: Point2,
  epsilon: number
): boolean =>
  cross2d(
    subtractPoint2(edgeEnd, edgeStart),
    subtractPoint2(point, edgeStart)
  ) >= -epsilon;

const intersectSegmentWithInfiniteLine2d = ({
  segmentStart,
  segmentEnd,
  lineStart,
  lineEnd,
  epsilon,
}: {
  segmentStart: Point2;
  segmentEnd: Point2;
  lineStart: Point2;
  lineEnd: Point2;
  epsilon: number;
}): Point2 | null => {
  const segmentDirection = subtractPoint2(segmentEnd, segmentStart);
  const lineDirection = subtractPoint2(lineEnd, lineStart);
  const denominator = cross2d(segmentDirection, lineDirection);

  if (Math.abs(denominator) <= epsilon) {
    return null;
  }

  const originDelta = subtractPoint2(lineStart, segmentStart);
  const segmentT = cross2d(originDelta, lineDirection) / denominator;

  return {
    x: segmentStart.x + segmentDirection.x * segmentT,
    y: segmentStart.y + segmentDirection.y * segmentT,
  };
};

export const clipConvexPolygonByConvexPolygon2d = ({
  subject,
  clip,
  epsilon = 1e-9,
}: {
  subject: readonly Point2[];
  clip: readonly Point2[];
  epsilon?: number;
}): Point2[] => {
  if (subject.length < 3 || clip.length < 3) {
    return [];
  }

  const normalizedClip = normalizeConvexPolygonWinding(clip);
  let output = [...subject];

  for (
    let clipIndex = 0;
    clipIndex < normalizedClip.length && output.length > 0;
    clipIndex += 1
  ) {
    const edgeStart = normalizedClip[clipIndex]!;
    const edgeEnd = normalizedClip[(clipIndex + 1) % normalizedClip.length]!;
    const input = output;
    output = [];

    for (let inputIndex = 0; inputIndex < input.length; inputIndex += 1) {
      const current = input[inputIndex]!;
      const previous = input[(inputIndex + input.length - 1) % input.length]!;
      const currentInside = isPointInsideDirectedEdge(
        current,
        edgeStart,
        edgeEnd,
        epsilon
      );
      const previousInside = isPointInsideDirectedEdge(
        previous,
        edgeStart,
        edgeEnd,
        epsilon
      );

      if (currentInside) {
        if (!previousInside) {
          const intersection = intersectSegmentWithInfiniteLine2d({
            segmentStart: previous,
            segmentEnd: current,
            lineStart: edgeStart,
            lineEnd: edgeEnd,
            epsilon,
          });
          if (intersection) {
            output.push(intersection);
          }
        }

        output.push(current);
        continue;
      }

      if (previousInside) {
        const intersection = intersectSegmentWithInfiniteLine2d({
          segmentStart: previous,
          segmentEnd: current,
          lineStart: edgeStart,
          lineEnd: edgeEnd,
          epsilon,
        });
        if (intersection) {
          output.push(intersection);
        }
      }
    }
  }

  return output.length >= 3 ? output : [];
};

export const isPointInsideConvexPolygon2d = ({
  point,
  polygon,
  epsilon = 1e-9,
}: {
  point: Point2;
  polygon: readonly Point2[];
  epsilon?: number;
}): boolean => {
  if (polygon.length < 3) {
    return false;
  }

  const normalizedPolygon = normalizeConvexPolygonWinding(polygon);
  return normalizedPolygon.every((edgeStart, index) =>
    isPointInsideDirectedEdge(
      point,
      edgeStart,
      normalizedPolygon[(index + 1) % normalizedPolygon.length]!,
      epsilon
    )
  );
};

export const classifyConvexPolygonIntersection2d = ({
  subject,
  clip,
  epsilon = 1e-9,
}: {
  subject: readonly Point2[];
  clip: readonly Point2[];
  epsilon?: number;
}): ConvexPolygonIntersectionRelation2d => {
  const intersection = clipConvexPolygonByConvexPolygon2d({
    subject,
    clip,
    epsilon,
  });
  const intersectionArea = getPolygonArea2d(intersection);

  if (intersectionArea <= epsilon) {
    return "disjoint";
  }

  const subjectArea = getPolygonArea2d(subject);
  const clipArea = getPolygonArea2d(clip);
  const subjectInsideClip = subject.every((point) =>
    isPointInsideConvexPolygon2d({ point, polygon: clip, epsilon })
  );
  const clipInsideSubject = clip.every((point) =>
    isPointInsideConvexPolygon2d({ point, polygon: subject, epsilon })
  );

  if (
    subjectInsideClip &&
    Math.abs(intersectionArea - subjectArea) <=
      epsilon * Math.max(1, subjectArea)
  ) {
    return "subject-inside-clip";
  }

  if (
    clipInsideSubject &&
    Math.abs(intersectionArea - clipArea) <= epsilon * Math.max(1, clipArea)
  ) {
    return "clip-inside-subject";
  }

  return "overlap";
};
