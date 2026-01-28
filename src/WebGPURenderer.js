
const quadShader = `
struct Uniforms {
  mvpMatrix : mat4x4<f32>,
  pointSize : f32,
  screenSize : vec2<f32>,
  gridOpacity : f32,
};
@group(0) @binding(0) var<uniform> uniforms : Uniforms;

struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  @location(0) color : vec4<f32>,
  @location(1) uv : vec2<f32>,
};

@vertex
fn vert_main(
  @builtin(instance_index) instanceIdx : u32,
  @builtin(vertex_index) vertIdx : u32,
  @location(0) pos : vec3<f32>,  // Instance attribute
  @location(1) color : vec3<f32> // Instance attribute
) -> VertexOutput {
  var output : VertexOutput;
  
  var quadPos = vec2<f32>(0.0, 0.0);
  var uv = vec2<f32>(0.0, 0.0);
  
  // 2 Triangles for a Quad
  if (vertIdx == 0u) { quadPos = vec2<f32>(-1.0, -1.0); uv = vec2<f32>(0.0, 0.0); }
  else if (vertIdx == 1u) { quadPos = vec2<f32>( 1.0, -1.0); uv = vec2<f32>(1.0, 0.0); }
  else if (vertIdx == 2u) { quadPos = vec2<f32>(-1.0,  1.0); uv = vec2<f32>(0.0, 1.0); }
  else if (vertIdx == 3u) { quadPos = vec2<f32>(-1.0,  1.0); uv = vec2<f32>(0.0, 1.0); }
  else if (vertIdx == 4u) { quadPos = vec2<f32>( 1.0, -1.0); uv = vec2<f32>(1.0, 0.0); }
  else if (vertIdx == 5u) { quadPos = vec2<f32>( 1.0,  1.0); uv = vec2<f32>(1.0, 1.0); }
  
  var centerPos = uniforms.mvpMatrix * vec4<f32>(pos, 1.0);
  
  var size = uniforms.pointSize;
  if (centerPos.w > 0.0) {
     size = size * (1000.0 / centerPos.w);
  }
  
  // Correction for aspect ratio to keep points round
  var aspect = uniforms.screenSize.x / uniforms.screenSize.y;
  var offset = quadPos * size; 
  offset = offset * (2.0 / uniforms.screenSize);
  
  output.Position = centerPos + vec4<f32>(offset.x * centerPos.w, offset.y * centerPos.w, 0.0, 0.0);
  output.color = vec4<f32>(color, 1.0);
  output.uv = uv;
  
  return output;
}

@fragment
fn frag_main(@location(0) color : vec4<f32>, @location(1) uv : vec2<f32>) -> @location(0) vec4<f32> {
  var d = distance(uv, vec2<f32>(0.5, 0.5));
  
  // Anti-aliased circle
  // Smoothstep from 0.5 (edge) to 0.4 (inner) to create a soft border
  var alpha = smoothstep(0.5, 0.4, d);
  
  if (alpha < 0.01) {
     discard;
  }
  
  var c = color;
  c.a = c.a * alpha;
  return c; 
}
`;

const lineShader = `
struct Uniforms {
  mvpMatrix : mat4x4<f32>,
  pointSize : f32, 
  screenSize : vec2<f32>, 
  gridOpacity : f32,
};
@group(0) @binding(0) var<uniform> uniforms : Uniforms;

struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  @location(0) color : vec4<f32>,
};

@vertex
fn vert_main(@location(0) position : vec3<f32>,
             @location(1) color : vec3<f32>) -> VertexOutput {
  var output : VertexOutput;
  output.Position = uniforms.mvpMatrix * vec4<f32>(position, 1.0);
  output.color = vec4<f32>(color, 1.0);
  return output;
}

@fragment
fn frag_main(@location(0) color : vec4<f32>) -> @location(0) vec4<f32> {
  var c = color;
  c.a = c.a * uniforms.gridOpacity;
  return c;
}
`;

/**
 * WebGPU Renderer class for rendering 3D point clouds.
 * Handles resizing, matrix transformations, and instanced rendering.
 */
export class WebGPURenderer {
    /**
     * Creates an instance of WebGPURenderer.
     * @param {string} canvasId - The ID of the HTMLCanvasElement to attach to.
     */
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.device = null;
        this.context = null;
        this.format = navigator.gpu ? navigator.gpu.getPreferredCanvasFormat() : 'bgra8unorm';

        this.points = [];
        this.angleX = 0;
        this.angleY = 0;
        this.zoom = 1.0;

        this.isDragging = false;
        this.isPanning = false;
        this.lastX = 0;
        this.lastY = 0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.pointRadius = 2.0;
        this.bgColor = '#000000';
        this.bgTransparent = false;
        this._showAxes = true;
        this._showGrid = true;
        this._gridOpacity = 0.5;
        this._theme = 'dark';
        this._aspectRatio = 'custom';

        // WebGPU Objects
        this.pipeline = null;
        this.linePipeline = null;
        this.vertexBuffer = null;
        this.uniformBuffer = null;
        this.gridBuffer = null;
        this.gridVertexCount = 0;
        this.bindGroup = null;
        this.lineBindGroup = null;

        this.initPromise = this.init();

        this.setupEvents();
        this.resize();
        window.addEventListener('resize', () => {
            setTimeout(() => this.resize(), 100);
        });
    }

    /**
     * Initializes the WebGPU device, context, and pipelines.
     * @returns {Promise<void>}
     */
    async init() {
        if (!navigator.gpu) {
            console.error("WebGPU not supported on this browser.");
            alert("WebGPU is not supported by your browser. Please ensure you are using a compatible browser (Chrome, Edge).");
            return;
        }

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            console.error("No WebGPU adapter found.");
            return;
        }

        this.device = await adapter.requestDevice();
        this.context = this.canvas.getContext('webgpu');

        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'premultiplied',
        });

        // 1. Quads Pipeline
        const shaderModule = this.device.createShaderModule({ code: quadShader });
        this.pipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vert_main',
                buffers: [{
                    arrayStride: 24, // 3+3 * 4
                    stepMode: 'instance',
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x3' }, // pos
                        { shaderLocation: 1, offset: 12, format: 'float32x3' } // color
                    ]
                }]
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'frag_main',
                targets: [{
                    format: this.format,
                    blend: {
                        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
                    }
                }]
            },
            primitive: { topology: 'triangle-list' },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus',
            }
        });

        // 2. Line Pipeline
        const lineShaderModule = this.device.createShaderModule({ code: lineShader });
        this.linePipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: lineShaderModule,
                entryPoint: 'vert_main',
                buffers: [{
                    arrayStride: 24,
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x3' },
                        { shaderLocation: 1, offset: 12, format: 'float32x3' }
                    ]
                }]
            },
            fragment: {
                module: lineShaderModule,
                entryPoint: 'frag_main',
                targets: [{
                    format: this.format,
                    blend: {
                        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
                    }
                }]
            },
            primitive: { topology: 'line-list' },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus',
            }
        });

        this.uniformBuffer = this.device.createBuffer({
            size: 96, // aligned to 16 bytes. 24 floats -> 96 bytes? No. 
            // Struct alignment rules:
            // mat4 (64)
            // f32 (4) pointSize
            // vec2 (8) screenSize (needs 8-byte align, so padding after pointSize? No, float is 4, next is 8-align. So 4 bytes pad.)
            // offset 64: pointSize (4)
            // offset 68: pad (4)
            // offset 72: screenSize (8)
            // offset 80: gridOpacity (4)
            // offset 84: pad (12) -> total 96
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.createDepthTexture();

        if (this.points.length > 0) {
            this.setPoints(this.points); // usage of device to create buffer
        } else {
            this.render();
        }
    }

    /**
     * Creates the depth texture for Z-buffering.
     * Should be called on init and resize.
     */
    createDepthTexture() {
        if (!this.device) return;
        this.depthTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
    }

    /**
     * Resizes the canvas to match its parent container.
     */
    resize() {
        const parent = this.canvas.parentElement;
        const parentW = parent.clientWidth;
        const parentH = parent.clientHeight;

        let finalW = parentW, finalH = parentH;

        if (this.aspectRatio !== 'custom') {
            const [wRatio, hRatio] = this.aspectRatio.split(':').map(Number);
            const targetRatio = wRatio / hRatio;
            if (parentW / parentH > targetRatio) {
                finalH = parentH * 0.9;
                finalW = finalH * targetRatio;
            } else {
                finalW = parentW * 0.9;
                finalH = finalW / targetRatio;
            }
        }

        if (this.aspectRatio === 'custom') {
            this.canvas.classList.remove('fixed-aspect');
        } else {
            this.canvas.classList.add('fixed-aspect');
        }

        this.canvas.width = Math.ceil(finalW * window.devicePixelRatio);
        this.canvas.height = Math.ceil(finalH * window.devicePixelRatio);
        this.canvas.style.width = this.aspectRatio === 'custom' ? '100%' : `${finalW}px`;
        this.canvas.style.height = this.aspectRatio === 'custom' ? '100%' : `${finalH}px`;

        if (this.device) {
            this.createDepthTexture();
            this.render();
        }
    }

    /**
     * Set the aspect ratio and trigger a resize.
     * @param {string} val - The aspect ratio (e.g., '16:9', '1:1', or 'custom').
     */
    setAspectRatio(val) {
        this.aspectRatio = val;
    }


    set aspectRatio(val) {
        this._aspectRatio = val;
        this.resize();
    }

    get aspectRatio() { return this._aspectRatio; }

    // Setters for Grid/Axes to trigger updates
    set showGrid(val) {
        if (this._showGrid !== val) {
            this._showGrid = val;
            this.generateGrid();
            this.render();
        }
    }
    get showGrid() { return this._showGrid; }

    set gridOpacity(val) {
        if (this._gridOpacity !== val) {
            this._gridOpacity = val;
            this.render();
        }
    }
    get gridOpacity() { return this._gridOpacity; }

    set showAxes(val) {
        if (this._showAxes !== val) {
            this._showAxes = val;
            this.generateGrid();
            this.render();
        }
    }
    get showAxes() { return this._showAxes; }

    set theme(val) {
        if (this._theme !== val) {
            this._theme = val;
            this.generateGrid();
            this.render();
        }
    }
    get theme() { return this._theme; }

    /**
     * Updates the point cloud data and uploads it to the GPU vertex buffer.
     * @param {Array<{x:number, y:number, z:number, color:string}>} points - The array of points to render.
     */
    setPoints(points) {
        this.points = points;
        if (!this.device) return;

        const data = new Float32Array(points.length * 6);
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const rgb = this.hexToRgb(p.color);
            data[i * 6 + 0] = p.x;
            data[i * 6 + 1] = p.y;
            data[i * 6 + 2] = p.z;
            data[i * 6 + 3] = rgb[0];
            data[i * 6 + 4] = rgb[1];
            data[i * 6 + 5] = rgb[2];
        }

        this.vertexBuffer = this.device.createBuffer({
            size: data.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true
        });
        new Float32Array(this.vertexBuffer.getMappedRange()).set(data);
        this.vertexBuffer.unmap();

        this.pointCount = points.length;
        this.render();
    }

    /**
     * Converts a Hex color string to an RGB array.
     * @param {string} hex - The hex color string (e.g., "#ff0000").
     * @returns {[number, number, number]} Normalized RGB components [0-1].
     */
    hexToRgb(hex) {
        if (!hex) return [1, 1, 1];
        const bigint = parseInt(hex.slice(1), 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return [r / 255, g / 255, b / 255];
    }

    /**
     * Updates the uniform buffer with the current Model-View-Projection matrix.
     * Handles rotation, panning (translation), and zoom.
     */
    updateUniforms() {
        if (!this.device || !this.uniformBuffer) return;

        const aspect = (this.canvas.width / this.canvas.height) || 1.0;

        // Safety checks for NaN
        if (isNaN(this.angleX)) this.angleX = 0;
        if (isNaN(this.angleY)) this.angleY = 0;
        if (isNaN(this.zoom) || this.zoom === 0) this.zoom = 1.0;
        if (isNaN(this.offsetX)) this.offsetX = 0;
        if (isNaN(this.offsetY)) this.offsetY = 0;

        const rotY = this.mat4RotateY(this.angleY);
        const rotX = this.mat4RotateX(this.angleX);
        const modelMat = this.mat4Multiply(rotX, rotY); // Switching back to RotX * RotY as user preferred this interaction.

        const dist = 1000.0 / this.zoom;
        const viewMat = this.mat4Translate(this.offsetX, this.offsetY, -dist); // Apply Pan

        const fovRad = (60 * Math.PI) / 180;
        const projMat = this.mat4Perspective(fovRad, aspect, 1.0, 5000.0);

        const mvMat = this.mat4Multiply(viewMat, modelMat);
        const mvpMat = this.mat4Multiply(projMat, mvMat);

        // Debug Log (throttled locally by logic if needed, but here just dump if needed)
        // Removed as per request

        const uniformData = new Float32Array(24);
        uniformData.set(mvpMat);
        uniformData[16] = this.pointRadius * window.devicePixelRatio; // Scale point size by DPI
        uniformData[17] = 0;
        uniformData[18] = this.canvas.width;
        uniformData[19] = this.canvas.height;
        uniformData[20] = this._gridOpacity;
        // 21, 22, 23 pad

        this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);
    }

    // --- Matrix Helpers ---

    /**
     * Multiplies two 4x4 matrices (Column-Major).
     * @param {Float32Array} a - Matrix A.
     * @param {Float32Array} b - Matrix B.
     * @returns {Float32Array} The result of A * B.
     */
    mat4Multiply(a, b) {
        const out = new Float32Array(16);
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                let sum = 0;
                for (let k = 0; k < 4; k++) {
                    sum += a[k * 4 + i] * b[j * 4 + k]; // Matrix Mult: A[i,k] * B[k,j]
                    // A is Column Major. index = col*4 + row.
                    // A[0] is col0, row0
                    // A[1] is col0, row1
                    // So index X = col*4 + row.
                    // We want A_ik * B_kj.

                    // A_ik -> col=k, row=i -> index = k*4 + i. YES.
                    // B_kj -> col=j, row=k -> index = j*4 + k. YES.
                }
                // Out_ij -> col=j, row=i -> index = j*4 + i.
                out[j * 4 + i] = sum;
            }
        }
        return out;
    }

    /**
     * Creates a rotation matrix around the Y axis.
     * @param {number} angle - The rotation angle in radians.
     * @returns {Float32Array} The rotation matrix.
     */
    mat4RotateY(angle) {
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
     * @param {number} angle - The rotation angle in radians.
     * @returns {Float32Array} The rotation matrix.
     */
    mat4RotateX(angle) {
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
     * @param {number} x - Translation X.
     * @param {number} y - Translation Y.
     * @param {number} z - Translation Z.
     * @returns {Float32Array} The translation matrix.
     */
    mat4Translate(x, y, z) {
        return new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            x, y, z, 1
        ]);
    }

    /**
     * Creates a perspective projection matrix suitable for WebGPU (0-1 Z clip).
     * @param {number} fov - Field of View in radians.
     * @param {number} aspect - Aspect Ratio (width / height).
     * @param {number} near - Near clipping plane.
     * @param {number} far - Far clipping plane.
     * @returns {Float32Array} The projection matrix.
     */
    mat4Perspective(fov, aspect, near, far) {
        const f = 1.0 / Math.tan(fov / 2);
        // WebGPU [0, 1] Z clip
        return new Float32Array([
            f / aspect, 0, 0, 0,
            0, -f, 0, 0,   // Invert Y to match Canvas coordinates (which were Y-down but data was negated)
            0, 0, far / (near - far), -1,
            0, 0, (far * near) / (near - far), 0
        ]);
    }

    /**
     * Generates or regenerates the vertex buffer for the Grid and Axes.
     * @param {boolean} [forceUpdate=false] - Whether to force regeneration.
     */
    generateGrid(forceUpdate = false) {
        const size = 200;
        const steps = 4;
        const vertices = [];
        const color = this._theme === 'light' ? [0, 0, 0] : [1, 1, 1];

        if (!this.device) return;

        // We also might want to check if theme changed, but forcing update from outside is better

        if (this._showGrid) {
            for (let i = -steps; i <= steps; i++) {
                const pos = (i / steps) * size;
                vertices.push(pos, 0, -size, color[0], color[1], color[2]);
                vertices.push(pos, 0, size, color[0], color[1], color[2]);
                vertices.push(-size, 0, pos, color[0], color[1], color[2]);
                vertices.push(size, 0, pos, color[0], color[1], color[2]);
            }
        }

        if (this._showAxes) {
            const axisSize = 100;
            vertices.push(0, 0, 0, 1, 0, 0); vertices.push(axisSize, 0, 0, 1, 0, 0);
            vertices.push(0, 0, 0, 0, 1, 0); vertices.push(0, -axisSize, 0, 0, 1, 0);
            vertices.push(0, 0, 0, 0, 0, 1); vertices.push(0, 0, axisSize, 0, 0, 1);
        }

        this.gridVertexCount = vertices.length / 6;
        if (this.gridVertexCount === 0) {
            this.gridBuffer = null;
            return;
        }

        const data = new Float32Array(vertices);
        this.gridBuffer = this.device.createBuffer({
            size: data.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true
        });
        new Float32Array(this.gridBuffer.getMappedRange()).set(data);
        this.gridBuffer.unmap();
    }

    /**
     * Renders the current scene (Grid + Points) to the canvas.
     */
    render() {
        if (!this.device || !this.context || !this.pipeline) return;

        this.updateUniforms();

        const commandEncoder = this.device.createCommandEncoder();
        const clearC = this.hexToRgb(this.bgColor);

        const renderPassDescriptor = {
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: { r: clearC[0], g: clearC[1], b: clearC[2], a: this.bgTransparent ? 0.0 : 1.0 },
                loadOp: 'clear',
                storeOp: 'store',
            }],
            depthStencilAttachment: {
                view: this.depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            }
        };

        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);

        // Update Grid Buffer if needed (or just assume it exists)
        // Usually generated once or on change. I'll rely on external calls or init.
        if (!this.gridBuffer && (this.showGrid || this.showAxes)) {
            this.generateGrid();
        }

        // Draw Grid
        if ((this.showGrid || this.showAxes) && this.gridBuffer && this.linePipeline) {
            passEncoder.setPipeline(this.linePipeline);
            if (!this.lineBindGroup) {
                this.lineBindGroup = this.device.createBindGroup({
                    layout: this.linePipeline.getBindGroupLayout(0),
                    entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }]
                });
            }
            passEncoder.setBindGroup(0, this.lineBindGroup);
            passEncoder.setVertexBuffer(0, this.gridBuffer);
            passEncoder.draw(this.gridVertexCount);
        }

        // Draw Points
        if (this.vertexBuffer && this.pointCount > 0) {
            passEncoder.setPipeline(this.pipeline);
            if (!this.bindGroup) {
                this.bindGroup = this.device.createBindGroup({
                    layout: this.pipeline.getBindGroupLayout(0),
                    entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }]
                });
            }
            passEncoder.setBindGroup(0, this.bindGroup);
            passEncoder.setVertexBuffer(0, this.vertexBuffer);
            passEncoder.draw(6, this.pointCount);
        }

        passEncoder.end();
        this.device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * Sets up pointer events for interaction (rotation, panning, zoom).
     */
    setupEvents() {
        const onMove = (e) => {
            if (this.isDragging) {
                const dx = e.clientX - this.lastX;
                const dy = e.clientY - this.lastY;
                this.angleY += dx * 0.01;
                this.angleX -= dy * 0.01; // Invert control to match inverted Y view
                this.lastX = e.clientX;
                this.lastY = e.clientY;
                this.render();
            } else if (this.isPanning) {
                const dx = e.clientX - this.lastX;
                const dy = e.clientY - this.lastY;
                // Scale pan speed by zoom level (closer = slower)
                // Actually closer = faster visually? Or constant?
                // Let's keep it 1:1 screen pixels roughly.
                // But view space moves relative to dist.
                // Simple factor for now.
                this.offsetX += dx;
                this.offsetY += dy; // Inverted as per user request (Drag up -> Move Down) 
                // Wait, in previous fix we inverted Projection Y (-f).
                // So +Y in View Space -> +Y in Clip -> -Y in Screen (because +Y NDC is Up, Screen Y is Down).
                // So dragging Mouse Down (+dy) should move Object Down?
                // Move Object Down -> Negative Y translation?
                // Moving Camera UP makes object go DOWN.
                // Translation is World/Model translation usually.
                // viewMat = Translate(x, y, z).
                // If I translate +Y, object moves +Y.
                // If Object moves +Y (Up), it goes towards top of screen.
                // Mouse Down is bottom of screen.
                // So Mouse Down (+dy) -> Object Down (-Y).
                // So offsetY -= dy.

                this.lastX = e.clientX;
                this.lastY = e.clientY;
                this.render();
            }
        };
        const onUp = () => {
            this.isDragging = false;
            this.isPanning = false;
        };

        this.canvas.addEventListener('pointerdown', (e) => {
            this.lastX = e.clientX;
            this.lastY = e.clientY;
            this.canvas.setPointerCapture(e.pointerId);

            if (e.button === 0) { // Left Click
                this.isDragging = true;
            } else if (e.button === 1) { // Middle Click
                this.isPanning = true;
                e.preventDefault(); // Prevent scroll/paste
            }
        });
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);

        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            this.zoom = Math.max(0.1, Math.min(20, this.zoom * delta));
            if (document.getElementById('param-zoom')) document.getElementById('param-zoom').value = this.zoom.toFixed(1);
            this.render();
        }, { passive: false });
    }
}
