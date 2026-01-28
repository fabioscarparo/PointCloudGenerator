import { cubicBezier, interpolateColor } from './math.js';

export class SurfaceGenerator {
    constructor() {
        this.points = [];
    }

    /**
     * Generates a 3D point cloud based on two Bezier curves.
     * 
     * @param {Array} verticalCurve Points [p0, p1, p2, p3] for the vertical profile.
     * @param {Array} horizontalCurve Points [p0, p1, p2, p3] for the horizontal shape.
     * @param {object} params Configuration parameters.
     */
    generate(verticalCurve, horizontalCurve, params) {
        const { density, height: heightScale, color, color2, colorMode, noise, gridWidth = 400, gridDepth = 400 } = params;
        this.points = [];
        const steps = density;

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;

            // Vertical Curve attributes
            const vRadius = cubicBezier(t, verticalCurve[0].x, verticalCurve[1].x, verticalCurve[2].x, verticalCurve[3].x);
            const vHeight = cubicBezier(t, verticalCurve[0].y, verticalCurve[1].y, verticalCurve[2].y, verticalCurve[3].y);

            const yRaw = vHeight * heightScale * 400;

            for (let j = 0; j <= steps; j++) {
                const u = j / steps;

                let finalX, finalY, finalZ;

                if (window.geometryMode === 'revolution') {
                    const angle = u * Math.PI * 2;
                    const rBase = (gridWidth / 2) * vRadius;
                    finalX = Math.cos(angle) * rBase;
                    finalZ = Math.sin(angle) * rBase;
                    finalY = -yRaw;
                } else if (window.geometryMode === 'sheet') {
                    finalX = (u - 0.5) * gridWidth;
                    finalZ = (t - 0.5) * gridDepth;
                    const hHeight = cubicBezier(u, horizontalCurve[0].y, horizontalCurve[1].y, horizontalCurve[2].y, horizontalCurve[3].y);
                    const combinedY = (vHeight + hHeight) * heightScale * (gridWidth / 2); // Using X-scale for height normalization
                    finalY = -combinedY;
                } else {
                    const rawX = cubicBezier(u, horizontalCurve[0].x, horizontalCurve[1].x, horizontalCurve[2].x, horizontalCurve[3].x);
                    const rawZ = cubicBezier(u, horizontalCurve[0].y, horizontalCurve[1].y, horizontalCurve[2].y, horizontalCurve[3].y);

                    const baseX = (rawX - 0.5) * gridWidth;
                    const baseZ = (rawZ - 0.5) * gridDepth;

                    finalX = baseX * vRadius;
                    finalZ = baseZ * vRadius;
                    finalY = -yRaw;
                }

                // Apply Noise Jitter
                if (noise > 0) {
                    const jitter = noise * 20;
                    finalX += (Math.random() - 0.5) * jitter;
                    finalY += (Math.random() - 0.5) * jitter;
                    finalZ += (Math.random() - 0.5) * jitter;
                }

                // Determine Color
                let finalColor = color;
                if (colorMode === 'height') {
                    // Height gradient based on normalized vHeight
                    finalColor = interpolateColor(color, color2, vHeight);
                } else if (colorMode === 'depth') {
                    // Depth gradient based on Z
                    const factor = Math.max(0, Math.min(1, (finalZ + (gridDepth / 2)) / gridDepth));
                    finalColor = interpolateColor(color, color2, factor);
                }

                this.points.push({
                    x: finalX,
                    y: finalY,
                    z: finalZ,
                    color: finalColor
                });
            }
        }

        return this.points;
    }
}
