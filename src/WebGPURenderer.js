/**
 * @fileoverview WebGPU-based 3D point cloud renderer with post-processing effects.
 * Implements hardware-accelerated rendering using WebGPU API with support for
 * bloom effects, grid/axes visualization, and interactive camera controls.
 */

/**
 * @fileoverview WebGPU-based 3D point cloud renderer with post-processing effects.
 * 
 * This module implements a hardware-accelerated rendering engine using the WebGPU API.
 * It provides real-time 3D visualization of point clouds with advanced features including:
 * - Instanced rendering for efficient handling of large point clouds
 * - Multi-pass bloom post-processing for visual enhancement
 * - Interactive camera controls (rotation, pan, zoom)
 * - Grid and coordinate axes visualization
 * - Touch gesture support for mobile devices
 * - Customizable aspect ratios and viewport settings
 */

/**
 * WGSL shader for rendering point cloud particles as billboarded quads.
 * Implements perspective-correct sizing and circular point shapes with smooth edges.
 */
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
  
  // Sharper circle to avoid "blur" when bloom is off
  // Using a very narrow smoothstep for minor anti-aliasing without blurring
  var alpha = smoothstep(0.5, 0.48, d);
  
  if (alpha < 0.01) {
     discard;
  }
  
  var c = color;
  c.a = c.a * alpha;
  return c; 
}
`;

/**
 * WGSL shader for rendering grid lines and coordinate axes.
 * Supports opacity control for grid visibility.
 */
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
 * WGSL shader for post-processing effects including bloom extraction,
 * Gaussian blur, and final composition.
 */
const postProcessShader = `
struct PostUniforms {
  bloomIntensity : f32,
  threshold : f32,
  direction : vec2<f32>,
  resolution : vec2<f32>,
};
@group(0) @binding(0) var<uniform> postUniforms : PostUniforms;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var tex : texture_2d<f32>;

struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
fn vert_main(@builtin(vertex_index) vertexIndex : u32) -> VertexOutput {
  var pos = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0)
  );
  var out : VertexOutput;
  out.Position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
  out.uv = pos[vertexIndex] * 0.5 + 0.5;
  out.uv.y = 1.0 - out.uv.y;
  return out;
}

@fragment
fn frag_extract(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
  let color = textureSample(tex, samp, uv);
  let brightness = dot(color.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
  if (brightness > postUniforms.threshold) {
    return color;
  }
  return vec4<f32>(0.0, 0.0, 0.0, 1.0);
}

@fragment
fn frag_blur(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
  var result = vec4<f32>(0.0);
  // 9-tap Gaussian weights (sigma ~ 2)
  let weight = array<f32, 5>(0.20236, 0.179044, 0.124009, 0.067234, 0.028532);
  let texOffset = 1.0 / postUniforms.resolution;
  let spread = 2.0;
  
  result += textureSample(tex, samp, uv) * weight[0];
  for(var i = 1; i < 5; i++) {
     let offset = f32(i) * texOffset * postUniforms.direction * spread;
     result += textureSample(tex, samp, uv + offset) * weight[i];
     result += textureSample(tex, samp, uv - offset) * weight[i];
  }
  return result;
}

@group(1) @binding(0) var sceneTex : texture_2d<f32>;
@fragment
fn frag_composite(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
  let scene = textureSample(sceneTex, samp, uv);
  let bloom = textureSample(tex, samp, uv);
  return scene + bloom * postUniforms.bloomIntensity;
}
`;

/**
 * WebGPU-based renderer for 3D point cloud visualization.
 * 
 * Features:
 * - Hardware-accelerated instanced rendering
 * - Multi-pass bloom post-processing
 * - Interactive camera controls (rotation, pan, zoom)
 * - Grid and axes visualization
 * - Touch gesture support for mobile devices
 * 
 * @class
 * @example
 * const renderer = new WebGPURenderer('canvas-id');
 * await renderer.init();
 * renderer.updatePoints(pointCloudData);
 * renderer.render();
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
        this._gridWidth = 400;
        this._gridDepth = 400;
        this._bloomIntensity = 0;
        this._bloomThreshold = 0.1;

        // WebGPU Objects
        this.pipeline = null;
        this.linePipeline = null;
        this.postPipelines = {};
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
            size: 96,
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

        // Axes Gizmo Uniform (separate to handle rotation-only view)
        this.axesUniformBuffer = this.device.createBuffer({
            size: 96, // Must match Uniforms struct size in lineShader (including padding)
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.createDepthTexture();
        this.createPostProcessingResources();
        this.createAxesGizmo(); // Init gizmo geometry

        if (this.points.length > 0) {
            this.setPoints(this.points);
        } else {
            this.render();
        }
    }

    async createPostProcessingResources() {
        if (!this.device) return;

        const postShaderModule = this.device.createShaderModule({ code: postProcessShader });

        const passes = ['extract', 'blur', 'composite'];
        for (const p of passes) {
            this.postPipelines[p] = this.device.createRenderPipeline({
                layout: 'auto',
                vertex: { module: postShaderModule, entryPoint: 'vert_main' },
                fragment: {
                    module: postShaderModule,
                    entryPoint: `frag_${p}`,
                    targets: [{ format: this.format }]
                },
                primitive: { topology: 'triangle-list' }
            });
        }

        this.postUniformBuffer = this.device.createBuffer({
            size: 64,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.sampler = this.device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

        this.createTextures();
    }

    createTextures() {
        if (!this.device) return;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;

        this.sceneTexture = this.device.createTexture({ size: [w, h], format: this.format, usage });
        this.brightTexture = this.device.createTexture({ size: [w, h], format: this.format, usage });
        this.blurTextureA = this.device.createTexture({ size: [w, h], format: this.format, usage });
        this.blurTextureB = this.device.createTexture({ size: [w, h], format: this.format, usage });
    }

    createAxesGizmo() {
        if (!this.device) return;
        // Simple RGB axes of length 1 + Labels
        const offset = 1.2;
        const s = 0.1; // Letter size half-width

        const vertices = [
            // X Axis (Red)
            0, 0, 0, 1, 0, 0,
            1, 0, 0, 1, 0, 0,
            // Letter X at (1.2, 0, 0)
            offset, s, s, 1, 0, 0,
            offset, -s, -s, 1, 0, 0,
            offset, -s, s, 1, 0, 0,
            offset, s, -s, 1, 0, 0,

            // Y Axis (Green)
            0, 0, 0, 0, 1, 0,
            0, 1, 0, 0, 1, 0,
            // Letter Y at (0, 1.2, 0)
            -s, offset + s, 0, 0, 1, 0,
            0, offset, 0, 0, 1, 0,
            s, offset + s, 0, 0, 1, 0,
            0, offset, 0, 0, 1, 0,
            0, offset, 0, 0, 1, 0,
            0, offset - s, 0, 0, 1, 0,

            // Z Axis (Blue)
            0, 0, 0, 0, 0, 1,
            0, 0, 1, 0, 0, 1,
            // Letter Z at (0, 0, 1.2)
            -s, s, offset + s, 0, 0, 1,
            s, s, offset + s, 0, 0, 1,
            s, s, offset + s, 0, 0, 1,
            -s, -s, offset + s, 0, 0, 1,
            -s, -s, offset + s, 0, 0, 1,
            s, -s, offset + s, 0, 0, 1,
        ];

        const data = new Float32Array(vertices);
        this.axesVertexBuffer = this.device.createBuffer({
            size: data.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true
        });
        new Float32Array(this.axesVertexBuffer.getMappedRange()).set(data);
        this.axesVertexBuffer.unmap();
        this.axesVertexCount = vertices.length / 6;
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
            this.createTextures();
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

    set gridWidth(val) {
        if (this._gridWidth !== val) {
            this._gridWidth = val;
            this.generateGrid();
            this.render();
        }
    }
    get gridWidth() { return this._gridWidth; }

    set gridDepth(val) {
        if (this._gridDepth !== val) {
            this._gridDepth = val;
            this.generateGrid();
            this.render();
        }
    }
    get gridDepth() { return this._gridDepth; }

    set bloomIntensity(val) {
        this._bloomIntensity = val;
        this.render();
    }
    get bloomIntensity() { return this._bloomIntensity; }

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
        const modelMat = this.mat4Multiply(rotX, rotY);

        const dist = 1000.0 / this.zoom;
        const viewMat = this.mat4Translate(this.offsetX, this.offsetY, -dist); // Apply Pan

        const fovRad = (60 * Math.PI) / 180;
        const projMat = this.mat4Perspective(fovRad, aspect, 1.0, 5000.0);

        const mvMat = this.mat4Multiply(viewMat, modelMat);
        const mvpMat = this.mat4Multiply(projMat, mvMat);

        const uniformData = new Float32Array(24);
        uniformData.set(mvpMat);
        uniformData[16] = this.pointRadius * window.devicePixelRatio; // Scale point size by DPI
        uniformData[17] = 0;
        uniformData[18] = this.canvas.width;
        uniformData[19] = this.canvas.height;
        uniformData[20] = this._gridOpacity;

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
        const widthHalf = this._gridWidth / 2;
        const depthHalf = this._gridDepth / 2;
        const steps = 4;
        const vertices = [];
        const color = this._theme === 'light' ? [0, 0, 0] : [1, 1, 1];

        if (!this.device) return;

        if (this._showGrid) {
            for (let i = -steps; i <= steps; i++) {
                // Lines parallel to Z
                const xPos = (i / steps) * widthHalf;
                vertices.push(xPos, 0, -depthHalf, color[0], color[1], color[2]);
                vertices.push(xPos, 0, depthHalf, color[0], color[1], color[2]);

                // Lines parallel to X
                const zPos = (i / steps) * depthHalf;
                vertices.push(-widthHalf, 0, zPos, color[0], color[1], color[2]);
                vertices.push(widthHalf, 0, zPos, color[0], color[1], color[2]);
            }
        }

        if (this._showAxes) {
            // Axes are now drawn as a separate gizmo, removing from main grid buffer
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

        // Update Post-Process Uniforms
        const postData = new Float32Array(16);
        postData[0] = this._bloomIntensity;
        postData[1] = this._bloomThreshold;
        postData[2] = 0; // Direction X (init)
        postData[3] = 0; // Direction Y (init)
        postData[4] = this.canvas.width;
        postData[5] = this.canvas.height;
        this.device.queue.writeBuffer(this.postUniformBuffer, 0, postData);

        const commandEncoder = this.device.createCommandEncoder();
        const clearC = this.hexToRgb(this.bgColor);

        // 1. Scene Pass
        const sceneDescriptor = {
            colorAttachments: [{
                view: this.sceneTexture.createView(),
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

        const pass = commandEncoder.beginRenderPass(sceneDescriptor);
        if (!this.gridBuffer && (this.showGrid || this.showAxes)) this.generateGrid();

        if ((this.showGrid || this.showAxes) && this.gridBuffer && this.linePipeline) {
            pass.setPipeline(this.linePipeline);
            if (!this.lineBindGroup) {
                this.lineBindGroup = this.device.createBindGroup({
                    layout: this.linePipeline.getBindGroupLayout(0),
                    entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }]
                });
            }
            pass.setBindGroup(0, this.lineBindGroup);
            pass.setVertexBuffer(0, this.gridBuffer);
            pass.draw(this.gridVertexCount);
        }

        if (this.vertexBuffer && this.pointCount > 0) {
            pass.setPipeline(this.pipeline);
            if (!this.bindGroup) {
                this.bindGroup = this.device.createBindGroup({
                    layout: this.pipeline.getBindGroupLayout(0),
                    entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }]
                });
            }
            pass.setBindGroup(0, this.bindGroup);
            pass.setVertexBuffer(0, this.vertexBuffer);
            pass.draw(6, this.pointCount);
        }

        // --- Axes Gizmo Pass (Bottom-Left Corner) ---
        if (this.showAxes && this.axesVertexBuffer) {
            // 1. Calculate Gizmo MVP
            // Use same rotation as camera, but no translation (centered)
            // Fixed viewport size for gizmo (e.g. 100x100)
            const gizmoSize = 100;
            const aspect = 1.0;
            const rotY = this.mat4RotateY(this.angleY);
            const rotX = this.mat4RotateX(this.angleX);
            const modelMat = this.mat4Multiply(rotX, rotY);

            // Camera at fixed distance looking at origin
            const viewMat = this.mat4Translate(0, 0, -2.5);
            const projMat = this.mat4Perspective((60 * Math.PI) / 180, aspect, 0.1, 100.0);

            const mvMat = this.mat4Multiply(viewMat, modelMat);
            const gizmoMVP = this.mat4Multiply(projMat, mvMat);

            // Create full uniform data (96 bytes / 24 floats)
            const uniformData = new Float32Array(24);
            uniformData.set(gizmoMVP, 0); // Matrix (0-15)
            // 16: pointSize (unused)
            // 17: Padding
            uniformData[18] = gizmoSize; // screenSize.x (used for aspect correction or disregarded)
            uniformData[19] = gizmoSize; // screenSize.y
            uniformData[20] = 1.0; // gridOpacity = 1.0 (fully visible)

            this.device.queue.writeBuffer(this.axesUniformBuffer, 0, uniformData);

            // 2. Set Viewport & Draw
            // WebGPU viewport Y is top-left, so calculate bottom Y (height - size - margin)
            const gizmoY = this.canvas.height - gizmoSize - 20;
            pass.setViewport(20, gizmoY, gizmoSize, gizmoSize, 0, 1);

            pass.setPipeline(this.linePipeline);
            // Create bind group for gizmo if needed (or reuse if layout matches and buffer different? No, need new BG for new buffer)
            // We can't reuse the bindgroup because it points to 'uniformBuffer', we need 'axesUniformBuffer'
            // We need to create a temporary bindgroup or cache it. Given it changes rarely (viewport doesn't affect binding), let's just create one.
            const axesBindGroup = this.device.createBindGroup({
                layout: this.linePipeline.getBindGroupLayout(0),
                entries: [{ binding: 0, resource: { buffer: this.axesUniformBuffer } }]
            });

            pass.setBindGroup(0, axesBindGroup);
            pass.setVertexBuffer(0, this.axesVertexBuffer);
            pass.draw(this.axesVertexCount);
        }

        pass.end();

        // 2. Extraction Pass
        const extractPass = commandEncoder.beginRenderPass({
            colorAttachments: [{ view: this.brightTexture.createView(), loadOp: 'clear', storeOp: 'store' }]
        });
        extractPass.setPipeline(this.postPipelines.extract);
        extractPass.setBindGroup(0, this.device.createBindGroup({
            layout: this.postPipelines.extract.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.postUniformBuffer } },
                { binding: 1, resource: this.sampler },
                { binding: 2, resource: this.sceneTexture.createView() }
            ]
        }));
        extractPass.draw(3);
        extractPass.end();

        // 3. Blur Passes (Horizontal)
        postData[2] = 1.0; postData[3] = 0.0;
        this.device.queue.writeBuffer(this.postUniformBuffer, 0, postData);
        const blurH = commandEncoder.beginRenderPass({
            colorAttachments: [{ view: this.blurTextureA.createView(), loadOp: 'clear', storeOp: 'store' }]
        });
        blurH.setPipeline(this.postPipelines.blur);
        blurH.setBindGroup(0, this.device.createBindGroup({
            layout: this.postPipelines.blur.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.postUniformBuffer } },
                { binding: 1, resource: this.sampler },
                { binding: 2, resource: this.brightTexture.createView() }
            ]
        }));
        blurH.draw(3);
        blurH.end();

        // 4. Blur Passes (Vertical)
        postData[2] = 0.0; postData[3] = 1.0;
        this.device.queue.writeBuffer(this.postUniformBuffer, 0, postData);
        const blurV = commandEncoder.beginRenderPass({
            colorAttachments: [{ view: this.blurTextureB.createView(), loadOp: 'clear', storeOp: 'store' }]
        });
        blurV.setPipeline(this.postPipelines.blur);
        blurV.setBindGroup(0, this.device.createBindGroup({
            layout: this.postPipelines.blur.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.postUniformBuffer } },
                { binding: 1, resource: this.sampler },
                { binding: 2, resource: this.blurTextureA.createView() }
            ]
        }));
        blurV.draw(3);
        blurV.end();

        // 5. Composite Pass
        const compositePass = commandEncoder.beginRenderPass({
            colorAttachments: [{ view: this.context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store' }]
        });
        compositePass.setPipeline(this.postPipelines.composite);
        compositePass.setBindGroup(0, this.device.createBindGroup({
            layout: this.postPipelines.composite.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.postUniformBuffer } },
                { binding: 1, resource: this.sampler },
                { binding: 2, resource: this.blurTextureB.createView() }
            ]
        }));
        compositePass.setBindGroup(1, this.device.createBindGroup({
            layout: this.postPipelines.composite.getBindGroupLayout(1),
            entries: [
                { binding: 0, resource: this.sceneTexture.createView() }
            ]
        }));
        compositePass.draw(3);
        compositePass.end();

        this.device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * Sets up pointer events for interaction (rotation, panning, zoom).
     */
    setupEvents() {
        // Touch state tracking
        this.touches = new Map();
        this.lastPinchDistance = 0;
        this.lastTouchCenter = { x: 0, y: 0 };

        const onMove = (e) => {
            if (this.isDragging) {
                const dx = e.clientX - this.lastX;
                const dy = e.clientY - this.lastY;
                this.angleY += dx * 0.01;
                this.angleX -= dy * 0.01;
                this.lastX = e.clientX;
                this.lastY = e.clientY;
                this.render();
            } else if (this.isPanning) {
                const dx = e.clientX - this.lastX;
                const dy = e.clientY - this.lastY;
                this.offsetX += dx;
                this.offsetY += dy;
                this.lastX = e.clientX;
                this.lastY = e.clientY;
                this.render();
            }
        };

        const onUp = () => {
            this.isDragging = false;
            this.isPanning = false;
        };

        // Mouse/Pointer events
        this.canvas.addEventListener('pointerdown', (e) => {
            this.lastX = e.clientX;
            this.lastY = e.clientY;
            this.canvas.setPointerCapture(e.pointerId);

            if (e.button === 0) { // Left Click
                this.isDragging = true;
            } else if (e.button === 1) { // Middle Click
                this.isPanning = true;
                e.preventDefault();
            }
        });
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);

        // Wheel zoom
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            this.zoom = Math.max(0.1, Math.min(20, this.zoom * delta));
            if (document.getElementById('param-zoom')) {
                document.getElementById('param-zoom').value = this.zoom.toFixed(1);
            }
            this.render();
        }, { passive: false });

        // Touch events for mobile gestures
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();

            // Update touch tracking
            for (let i = 0; i < e.touches.length; i++) {
                const touch = e.touches[i];
                this.touches.set(touch.identifier, {
                    x: touch.clientX,
                    y: touch.clientY
                });
            }

            if (e.touches.length === 1) {
                // Single touch - rotation
                const touch = e.touches[0];
                this.lastX = touch.clientX;
                this.lastY = touch.clientY;
                this.isDragging = true;
            } else if (e.touches.length === 2) {
                // Two fingers - prepare for pinch/pan
                this.isDragging = false;
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];

                // Calculate initial pinch distance
                const dx = touch2.clientX - touch1.clientX;
                const dy = touch2.clientY - touch1.clientY;
                this.lastPinchDistance = Math.sqrt(dx * dx + dy * dy);

                // Calculate center point for panning
                this.lastTouchCenter = {
                    x: (touch1.clientX + touch2.clientX) / 2,
                    y: (touch1.clientY + touch2.clientY) / 2
                };
            }
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();

            if (e.touches.length === 1 && this.isDragging) {
                // Single touch rotation
                const touch = e.touches[0];
                const dx = touch.clientX - this.lastX;
                const dy = touch.clientY - this.lastY;
                this.angleY += dx * 0.01;
                this.angleX -= dy * 0.01;
                this.lastX = touch.clientX;
                this.lastY = touch.clientY;
                this.render();
            } else if (e.touches.length === 2) {
                // Two finger gestures
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];

                // Calculate current pinch distance
                const dx = touch2.clientX - touch1.clientX;
                const dy = touch2.clientY - touch1.clientY;
                const currentDistance = Math.sqrt(dx * dx + dy * dy);

                // Pinch to zoom
                if (this.lastPinchDistance > 0) {
                    const scale = currentDistance / this.lastPinchDistance;
                    this.zoom = Math.max(0.1, Math.min(20, this.zoom * scale));
                    if (document.getElementById('param-zoom')) {
                        document.getElementById('param-zoom').value = this.zoom.toFixed(1);
                    }
                }
                this.lastPinchDistance = currentDistance;

                // Two-finger pan
                const currentCenter = {
                    x: (touch1.clientX + touch2.clientX) / 2,
                    y: (touch1.clientY + touch2.clientY) / 2
                };

                const panDx = currentCenter.x - this.lastTouchCenter.x;
                const panDy = currentCenter.y - this.lastTouchCenter.y;
                this.offsetX += panDx;
                this.offsetY += panDy;
                this.lastTouchCenter = currentCenter;

                this.render();
            }
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();

            // Remove ended touches from tracking
            const remainingTouches = new Set();
            for (let i = 0; i < e.touches.length; i++) {
                remainingTouches.add(e.touches[i].identifier);
            }

            for (const id of this.touches.keys()) {
                if (!remainingTouches.has(id)) {
                    this.touches.delete(id);
                }
            }

            if (e.touches.length === 0) {
                // All touches ended
                this.isDragging = false;
                this.isPanning = false;
                this.lastPinchDistance = 0;
            } else if (e.touches.length === 1) {
                // Back to single touch - resume rotation
                const touch = e.touches[0];
                this.lastX = touch.clientX;
                this.lastY = touch.clientY;
                this.isDragging = true;
                this.lastPinchDistance = 0;
            }
        }, { passive: false });

        this.canvas.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            this.touches.clear();
            this.isDragging = false;
            this.isPanning = false;
            this.lastPinchDistance = 0;
        }, { passive: false });
    }
}
