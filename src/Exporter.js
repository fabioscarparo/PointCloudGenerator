import { } from './math.js'; // Removing old imports if not needed, or keep for other files? No, Exporter is class.

export class Exporter {

    /**
     * Downloads a Blob object as a file.
     * @param {Blob} blob - The blob to download.
     * @param {string} filename - The filename to save as.
     */
    static downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    /**
     * Exports the canvas content as a PNG image.
     * @param {HTMLCanvasElement} canvas - The canvas to export.
     * @param {string} [filename='point-cloud.png'] - The filename to save as.
     */
    static toPNG(canvas, filename = 'point-cloud.png') {
        canvas.toBlob((blob) => {
            this.downloadBlob(blob, filename);
        }, 'image/png');
    }

    /**
     * Generates and downloads an SVG representation of the current 3D state.
     * Uses the same MVP transformations as the WebGPU renderer for 1:1 matching.
     * @param {Array<{x:number, y:number, z:number, color:string}>} points - The points to export.
     * @param {number} angleX - Rotation around X axis.
     * @param {number} angleY - Rotation around Y axis.
     * @param {number} zoom - Zoom factor.
     * @param {number} offsetX - Pan X offset.
     * @param {number} offsetY - Pan Y offset.
     * @param {number} width - Viewport width.
     * @param {number} height - Viewport height.
     * @param {number} radius - Point radius.
     * @param {string} bgColor - Background color hex.
     * @param {boolean} bgTransparent - Whether background is transparent.
     * @param {string} [filename='point-cloud.svg'] - Filename.
     */
    static toSVG(points, angleX, angleY, zoom, offsetX, offsetY, width, height, radius, bgColor, bgTransparent, filename = 'point-cloud.svg') {
        const aspect = width / height;

        // 1. Calculate Matrices (Replicating WebGPURenderer logic)
        const rotY = this.mat4RotateY(angleY);
        const rotX = this.mat4RotateX(angleX);
        const modelMat = this.mat4Multiply(rotX, rotY); // Match WebGPU renderer

        const offX = isNaN(offsetX) ? 0 : offsetX;
        const offY = isNaN(offsetY) ? 0 : offsetY;

        // WebGPURenderer: mvMat = view * model. model = rotY * rotX.
        // Wait, WebGPURenderer uses: this.mat4Multiply(rotY, rotX).
        // My mat4Multiply(a,b) does A * B.
        // So RotY * RotX.

        const dist = 1000.0 / zoom;
        const viewMat = this.mat4Translate(offX, offY, -dist);

        const fovRad = (60 * Math.PI) / 180;
        const projMat = this.mat4Perspective(fovRad, aspect, 1.0, 5000.0);

        // Combine MVP: Proj * View * Model
        const mvMat = this.mat4Multiply(viewMat, modelMat);
        const mvpMat = this.mat4Multiply(projMat, mvMat);

        const transformed = [];

        for (const p of points) {
            // 2. Project Point
            // vec4(p.x, p.y, p.z, 1.0)
            const v = [p.x, p.y, p.z, 1.0];
            const out = this.vec4TransformMat4(v, mvpMat);

            // 3. Perspective Divide
            if (out[3] === 0) continue; // avoid div by zero
            const ndc = {
                x: out[0] / out[3],
                y: out[1] / out[3],
                z: out[2] / out[3]
            };

            // 4. Clip check (optional but good for SVG purity)
            if (ndc.z < 0 || ndc.z > 1) {
                // Behind camera or too far
                // Actually WebGPU clip is 0..1 Z. If <0, clipped.
                // We can skip these.
                continue;
            }

            // 5. Screen Transform
            // NDC X: -1 to 1 -> 0 to Width
            // NDC Y: -1 to 1 -> 0 to Height.
            // But we need to match WebGPU Y direction.
            // We used -f in projection.
            // So +Y in World -> +Y in NDC (Top).
            // SVG 0 is Top.
            // So +1 NDC -> 0 Screen.
            // -1 NDC -> Height Screen.

            const screenX = (ndc.x * 0.5 + 0.5) * width;
            const screenY = ((-ndc.y) * 0.5 + 0.5) * height;

            // Scale calculation for point size
            // uniforms.pointSize * (1000.0 / w)
            const scale = (1000.0 / out[3]);

            transformed.push({
                x: screenX,
                y: screenY,
                r: radius * scale,
                zDepth: ndc.z, // or out[3]
                color: p.color
            });
        }

        // Sort by depth (Furthest first -> Large Z first?)
        // NDC Z 0 is Near, 1 is Far.
        // We want to paint Far first. So Descending Z.
        transformed.sort((a, b) => b.zDepth - a.zDepth);

        const bgAttr = bgTransparent ? '' : ` style="background: ${bgColor};"`;
        let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"${bgAttr}>\n`;

        if (!bgTransparent) {
            svgContent += `<rect width="100%" height="100%" fill="${bgColor}" />\n`;
        }

        svgContent += `<g id="point-cloud">\n`;

        for (const p of transformed) {
            // Optional: Skip if radius too small
            if (p.r < 0.1) continue;

            const r = Math.max(0.1, p.r).toFixed(2);
            const cx_ = p.x.toFixed(2);
            const cy_ = p.y.toFixed(2);

            svgContent += `  <circle cx="${cx_}" cy="${cy_}" r="${r}" fill="${p.color}" />\n`;
        }

        svgContent += `</g>\n`;
        svgContent += `</svg>`;

        const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        this.downloadBlob(blob, filename);
    }

    /**
     * Exports the point cloud as an OBJ file (vertex only with colors).
     * @param {Array<{x:number, y:number, z:number, color:string}>} points - The points to export.
     * @param {string} [filename='point-cloud.obj'] - Filename.
     */
    static toOBJ(points, filename = 'point-cloud.obj') {
        let objContent = "# Point Cloud OBJ Export\n";

        for (const p of points) {
            const r = parseInt(p.color.substring(1, 3), 16) / 255;
            const g = parseInt(p.color.substring(3, 5), 16) / 255;
            const b = parseInt(p.color.substring(5, 7), 16) / 255;
            objContent += `v ${p.x.toFixed(4)} ${p.y.toFixed(4)} ${p.z.toFixed(4)} ${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)}\n`;
        }

        const blob = new Blob([objContent], { type: 'text/plain;charset=utf-8' });
        this.downloadBlob(blob, filename);
    }

    // --- Matrix Helpers ---

    /**
     * Multiplies two 4x4 matrices (Column-Major).
     * @param {Float32Array} a - Matrix A.
     * @param {Float32Array} b - Matrix B.
     * @returns {Float32Array} Result matrix.
     */
    static mat4Multiply(a, b) {
        const out = new Float32Array(16);
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                let sum = 0;
                for (let k = 0; k < 4; k++) {
                    sum += a[k * 4 + i] * b[j * 4 + k];
                }
                out[j * 4 + i] = sum;
            }
        }
        return out;
    }

    /**
     * Creates a rotation matrix around the Y axis.
     * @param {number} angle - Angle in radians.
     * @returns {Float32Array} Rotation matrix.
     */
    static mat4RotateY(angle) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        return new Float32Array([
            c, 0, -s, 0,
            0, 1, 0, 0,
            s, 0, c, 0,
            0, 0, 0, 1
        ]);
    }

    /**
     * Creates a rotation matrix around the X axis.
     * @param {number} angle - Angle in radians.
     * @returns {Float32Array} Rotation matrix.
     */
    static mat4RotateX(angle) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        return new Float32Array([
            1, 0, 0, 0,
            0, c, s, 0,
            0, -s, c, 0,
            0, 0, 0, 1
        ]);
    }

    /**
     * Creates a translation matrix.
     * @param {number} x - X offset.
     * @param {number} y - Y offset.
     * @param {number} z - Z offset.
     * @returns {Float32Array} Translation matrix.
     */
    static mat4Translate(x, y, z) {
        return new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            x, y, z, 1
        ]);
    }

    /**
     * Creates a perspective projection matrix.
     * @param {number} fov - Field of view in radians.
     * @param {number} aspect - Aspect ratio.
     * @param {number} near - Near plane.
     * @param {number} far - Far plane.
     * @returns {Float32Array} Projection matrix.
     */
    static mat4Perspective(fov, aspect, near, far) {
        const f = 1.0 / Math.tan(fov / 2);
        // Using -f for Y to match WebGPU Inverted Y
        return new Float32Array([
            f / aspect, 0, 0, 0,
            0, -f, 0, 0,
            0, 0, far / (near - far), -1,
            0, 0, (far * near) / (near - far), 0
        ]);
    }

    /**
     * Transforms a Vec4 by a Mat4.
     * @param {Array<number>} v - Vector [x, y, z, w].
     * @param {Float32Array} m - 4x4 Matrix.
     * @returns {Array<number>} The transformed vector.
     */
    static vec4TransformMat4(v, m) {
        const x = v[0], y = v[1], z = v[2], w = v[3];
        const out = [0, 0, 0, 0];
        // Col-major matrix
        // x = m00*x + m10*y + m20*z + m30*w
        // m[0]*x + m[4]*y + m[8]*z + m[12]*w
        out[0] = m[0] * x + m[4] * y + m[8] * z + m[12] * w;
        out[1] = m[1] * x + m[5] * y + m[9] * z + m[13] * w;
        out[2] = m[2] * x + m[6] * y + m[10] * z + m[14] * w;
        out[3] = m[3] * x + m[7] * y + m[11] * z + m[15] * w;
        return out;
    }
}
