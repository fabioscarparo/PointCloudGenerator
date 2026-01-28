export const TOP_MARGIN = 100
export const BOTTOM_MARGIN = 50
export const LEFT_MARGIN = 50
export const RIGHT_MARGIN = 50

/**
 * Calculates a point on a cubic Bezier curve at time t.
 * @param {number} t - Time [0, 1]
 * @param {number} p0 - Start point
 * @param {number} p1 - Control point 1
 * @param {number} p2 - Control point 2
 * @param {number} p3 - End point
 * @returns {number} The calculated value
 */
export function cubicBezier(t, p0, p1, p2, p3) {
  const mt = 1 - t;
  return (
    mt * mt * mt * p0 +
    3 * mt * mt * t * p1 +
    3 * mt * t * t * p2 +
    t * t * t * p3
  );
}

/**
 * Samples a value from a Bezier Spline at time t.
 * @param {number} t - Overall progress [0, 1]
 * @param {Array<object>} points - Sequence of points {x, y, cp1:{dx,dy}, cp2:{dx,dy}}
 * @param {string} axis - 'x' or 'y'
 * @returns {number} The sampled value
 */
export function sampleBezierSpline(t, points, axis) {
  if (points.length < 2) return points[0] ? points[0][axis] : 0;

  const n = points.length - 1;
  const rawT = t * n;
  let idx = Math.floor(rawT);
  const weight = rawT - idx;

  if (idx >= n) {
    idx = n - 1;
    return points[n][axis];
  }

  const pA = points[idx];
  const pB = points[idx + 1];

  // For axis 'x':
  // P0 = pA.x
  // P1 = pA.x + pA.cp2.dx
  // P2 = pB.x + pB.cp1.dx
  // P3 = pB.x

  const v0 = pA[axis];
  const v1 = pA[axis] + (axis === 'x' ? pA.cp2.dx : pA.cp2.dy);
  const v2 = pB[axis] + (axis === 'x' ? pB.cp1.dx : pB.cp1.dy);
  const v3 = pB[axis];

  return cubicBezier(weight, v0, v1, v2, v3);
}

/**
 * Projects a 3D point onto a 2D plane with perspective.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} centerX - Canvas center X
 * @param {number} centerY - Canvas center Y
 * @param {number} fov - Field of view / Perspective scale
 * @returns {{x: number, y: number, scale: number}} Projected point and scale factor for depth sizing
 */
export function project3D(x, y, z, centerX, centerY, fov = 400) {
  const scale = fov / (fov + z);
  const x2d = x * scale + centerX;
  const y2d = y * scale + centerY;
  return { x: x2d, y: y2d, scale };
}

/**
 * Rotates a point around the Y axis
 */
export function rotateY(x, y, z, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: x * cos - z * sin,
    y: y,
    z: x * sin + z * cos
  };
}

/**
 * Rotates a point around the X axis
 */
export function rotateX(x, y, z, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: x,
    y: y * cos - z * sin,
    z: y * sin + z * cos
  };
}
/**
 * Interpolates between two hex colors.
 * @param {string} color1 - Hex color 1
 * @param {string} color2 - Hex color 2
 * @param {number} t - Interpolation factor [0, 1]
 * @returns {string} Interpolated hex color
 */
export function interpolateColor(color1, color2, t) {
  const r1 = parseInt(color1.substring(1, 3), 16);
  const g1 = parseInt(color1.substring(3, 5), 16);
  const b1 = parseInt(color1.substring(5, 7), 16);

  const r2 = parseInt(color2.substring(1, 3), 16);
  const g2 = parseInt(color2.substring(3, 5), 16);
  const b2 = parseInt(color2.substring(5, 7), 16);

  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);

  return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
}
