/**
 * Preset curve configurations for the Point Cloud Generator.
 * Coordinates are normalized [0, 1].
 * All points MUST have cp1 and cp2 control handles.
 */

const createPoint = (x, y, dx1 = 0, dy1 = 0, dx2 = 0, dy2 = 0) => ({
    x, y,
    cp1: { dx: dx1, dy: dy1 },
    cp2: { dx: dx2, dy: dy2 }
});

// Standard Circle Approximation (Radius 0.5 centered at 0.5,0.5)
// Width 1.0 (0 to 1), Height 1.0 (0 to 1)
// K = 0.5522847498 * radius (0.5) ~= 0.276
const K = 0.276;

const CIRCLE_SHAPE = [
    createPoint(1.0, 0.5, 0, -K, 0, K),     // Right
    createPoint(0.5, 1.0, K, 0, -K, 0),     // Top
    createPoint(0.0, 0.5, 0, K, 0, -K),     // Left
    createPoint(0.5, 0.0, -K, 0, K, 0),     // Bottom
    createPoint(1.0, 0.5, 0, -K, 0, K)      // Right (Close)
];

const SQUARE_SHAPE = [
    createPoint(0.9, 0.1, 0, 0, 0, 0),
    createPoint(0.9, 0.9, 0, 0, 0, 0),
    createPoint(0.1, 0.9, 0, 0, 0, 0),
    createPoint(0.1, 0.1, 0, 0, 0, 0),
    createPoint(0.9, 0.1, 0, 0, 0, 0)
];

export const presets = {
    cylinder: {
        label: "Cylinder",
        vertical: [
            createPoint(1.0, 0.0, 0, 0, 0, 0),
            createPoint(1.0, 1.0, 0, 0, 0, 0)
        ],
        horizontal: CIRCLE_SHAPE
    },
    sphere: {
        label: "Sphere",
        vertical: [
            createPoint(0.0, 0.0, 0, 0, 0.5, 0),    // Bottom center
            createPoint(1.0, 0.5, 0, -0.3, 0, 0.3), // Mid out
            createPoint(0.0, 1.0, 0.5, 0, 0, 0)     // Top center
        ],
        horizontal: CIRCLE_SHAPE
    },
    torus: {
        label: "Torus",
        vertical: [
            createPoint(0.5, 0.0, 0, 0, 0, 0.2),    // Start inner
            createPoint(1.0, 0.5, 0, -0.2, 0, 0.2), // Out
            createPoint(0.5, 1.0, 0, -0.2, 0, 0)    // End inner
        ],
        horizontal: CIRCLE_SHAPE
    },
    vase: {
        label: "Vase",
        vertical: [
            createPoint(0.4, 0.0, 0.1, 0, 0.1, 0),  // Base
            createPoint(0.8, 0.25, -0.1, -0.1, 0, 0.2), // Bulge
            createPoint(0.3, 0.6, 0, -0.1, 0, 0.1), // Neck
            createPoint(0.6, 1.0, -0.1, 0, 0.1, 0)  // Rim
        ],
        horizontal: CIRCLE_SHAPE
    },
    hourglass: {
        label: "Hourglass",
        vertical: [
            createPoint(1.0, 0.0, 0, 0, -0.2, 0.3), // Base
            createPoint(0.2, 0.5, 0, -0.2, 0, 0.2), // Waist
            createPoint(1.0, 1.0, -0.2, -0.3, 0, 0) // Top
        ],
        horizontal: CIRCLE_SHAPE
    }
};
