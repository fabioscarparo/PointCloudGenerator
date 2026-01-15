import { project3D, rotateY, rotateX } from './math.js';

export class Renderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        this.points = [];
        this.angleX = 0;
        this.angleY = 0;
        this.zoom = 1.0;
        this.pointRadius = 2.0;
        this.bgColor = '#000000';
        this.bgTransparent = false;
        this.aspectRatio = 'custom';
        this.theme = 'dark';

        // Interaction state
        this.isDragging = false;
        this.lastX = 0;
        this.lastY = 0;

        // Hover state
        this.mouseX = 0;
        this.mouseY = 0;
        this.hoveredPointIndex = -1;

        // Visual aids
        this.showAxes = true;
        this.showGrid = true;

        this.resize();
        window.addEventListener('resize', () => {
            // small delay to ensure resize completes on mobile
            setTimeout(() => this.resize(), 100);
        });

        // Unified Pointer Events (Mouse, Touch, Pen)
        this.canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));

        // Listen on window for move/up to continue drag even if pointer leaves canvas
        window.addEventListener('pointermove', this.onPointerMove.bind(this));
        window.addEventListener('pointerup', this.onPointerUp.bind(this));
        window.addEventListener('pointercancel', this.onPointerUp.bind(this));

        // CRITICAL: Block all touch gestures at the source before they trigger page scroll
        const blockScroll = (e) => {
            if (e.target === this.canvas) {
                e.preventDefault();
            }
        };

        // Use non-passive listeners on the canvas specifically
        this.canvas.addEventListener('touchstart', blockScroll, { passive: false });
        this.canvas.addEventListener('touchmove', blockScroll, { passive: false });

        // Disable native touch actions
        this.canvas.style.touchAction = 'none';

        // Zoom functionality
        this.canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    }

    onPointerDown(e) {
        if (e.pointerType === 'touch') {
            e.preventDefault();
        }

        this.isDragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;

        if (this.canvas.setPointerCapture) {
            this.canvas.setPointerCapture(e.pointerId);
        }
    }

    onPointerMove(e) {
        // Prevent default browser behavior (scroll/zoom) for pointer movements on canvas
        if (e.pointerType === 'touch' && e.target === this.canvas) {
            e.preventDefault();
        }

        const x = e.clientX;
        const y = e.clientY;

        const rect = this.canvas.getBoundingClientRect();
        this.mouseX = x - rect.left;
        this.mouseY = y - rect.top;

        if (this.isDragging) {
            const dx = x - this.lastX;
            const dy = y - this.lastY;

            this.angleY += dx * 0.01;
            this.angleX += dy * 0.01;

            this.lastX = x;
            this.lastY = y;

            this.render();
        } else if (e.pointerType === 'mouse') {
            this.render(); // Update hover highlights
        }
    }

    onPointerUp(e) {
        this.isDragging = false;
        if (this.canvas.releasePointerCapture) {
            this.canvas.releasePointerCapture(e.pointerId);
        }
    }

    onWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1; // Multiplicative zoom
        this.zoom = Math.max(0.1, Math.min(20, this.zoom * delta));

        // Update UI Zoom slider if exists
        const zoomInput = document.getElementById('param-zoom');
        if (zoomInput) {
            zoomInput.value = this.zoom.toFixed(1);
        }

        this.render();
    }

    resize() {
        const parent = this.canvas.parentElement;
        const parentW = parent.clientWidth;
        const parentH = parent.clientHeight;

        if (this.aspectRatio === 'custom') {
            this.canvas.width = parentW;
            this.canvas.height = parentH;
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.canvas.classList.remove('fixed-aspect');
        } else {
            const [wRatio, hRatio] = this.aspectRatio.split(':').map(Number);
            const targetRatio = wRatio / hRatio;

            let finalW, finalH;
            if (parentW / parentH > targetRatio) {
                // Parent is wider than target
                finalH = parentH * 0.9;
                finalW = finalH * targetRatio;
            } else {
                // Parent is taller than target
                finalW = parentW * 0.9;
                finalH = finalW / targetRatio;
            }

            this.canvas.width = finalW;
            this.canvas.height = finalH;
            this.canvas.style.width = `${finalW}px`;
            this.canvas.style.height = `${finalH}px`;
            this.canvas.classList.add('fixed-aspect');
        }

        this.render();
    }

    setAspectRatio(ratio) {
        this.aspectRatio = ratio;
        this.resize();
    }

    setPoints(points) {
        this.points = points;
        this.render();
    }

    // Replacement of old mouse event methods with pointer event methods is handled in constructor chunk

    render() {
        const { width, height } = this.canvas;
        const cx = width / 2;
        const cy = height / 2;

        if (this.bgTransparent) {
            this.ctx.clearRect(0, 0, width, height);
        } else {
            this.ctx.fillStyle = this.bgColor;
            this.ctx.fillRect(0, 0, width, height);
        }

        if (this.showGrid) this.drawGrid(cx, cy);
        if (this.showAxes) this.drawAxes(cx, cy);

        // Transform Points
        // 1. Rotate
        // 2. Project
        // 3. Sort

        const transformed = this.points.map(p => {
            // 0. Apply Zoom (Uniform scale)
            const zx = p.x * this.zoom;
            const zy = p.y * this.zoom;
            const zz = p.z * this.zoom;

            // 1. Rotate
            let r = rotateY(zx, zy, zz, this.angleY);
            r = rotateX(r.x, r.y, r.z, this.angleX);

            // 2. Project
            const proj = project3D(r.x, r.y, r.z, cx, cy);

            return {
                ...proj, // x, y, scale
                zDepth: r.z,
                color: p.color
            };
        });

        // Check radius logic
        // The visual radius should depend on Z depth
        const baseRadius = this.pointRadius;

        // Sort by depth (far points first)
        // In our coordinate system, usually negative Z is far or positive Z is far depending on implementation.
        // Our project3D: scale = fov / (fov + z). Larger Z -> smaller scale -> further away.
        // So distinct painter's algo: draw large Z first (far) -> small Z (close).
        transformed.sort((a, b) => b.zDepth - a.zDepth);

        // Check hover proximity
        const hoverThreshold = 10;
        let closestIndex = -1;
        let minSqDist = hoverThreshold * hoverThreshold;

        for (let i = 0; i < transformed.length; i++) {
            const p = transformed[i];
            const dx = p.x - this.mouseX;
            const dy = p.y - this.mouseY;
            const sqDist = dx * dx + dy * dy;
            if (sqDist < minSqDist) {
                minSqDist = sqDist;
                closestIndex = i;
            }
        }
        this.hoveredPointIndex = closestIndex;

        for (let i = 0; i < transformed.length; i++) {
            const p = transformed[i];
            if (p.scale <= 0) continue;

            const isHovered = i === this.hoveredPointIndex;
            const r = (this.pointRadius * p.scale) * (isHovered ? 2 : 1);

            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, Math.max(0.5, r), 0, Math.PI * 2);

            if (isHovered) {
                this.ctx.fillStyle = '#fff';
                this.ctx.shadowBlur = 10;
                this.ctx.shadowColor = p.color;
            } else {
                this.ctx.fillStyle = p.color;
                this.ctx.shadowBlur = 0;
            }

            this.ctx.fill();
        }
        this.ctx.shadowBlur = 0;
    }

    drawAxes(cx, cy) {
        const size = 100 * this.zoom;
        const axes = [
            { x: size, y: 0, z: 0, color: '#ff4d4d', label: 'X' },
            { x: 0, y: -size, z: 0, color: '#4dff4d', label: 'Y' },
            { x: 0, y: 0, z: size, color: '#4d4dff', label: 'Z' }
        ];

        this.ctx.lineWidth = 2;
        axes.forEach(a => {
            let r = rotateY(a.x, a.y, a.z, this.angleY);
            r = rotateX(r.x, r.y, r.z, this.angleX);
            const proj = project3D(r.x, r.y, r.z, cx, cy);

            this.ctx.beginPath();
            this.ctx.strokeStyle = a.color;
            this.ctx.moveTo(cx, cy);
            this.ctx.lineTo(proj.x, proj.y);
            this.ctx.stroke();

            this.ctx.fillStyle = a.color;
            this.ctx.font = '10px Outfit';
            this.ctx.fillText(a.label, proj.x + 5, proj.y + 5);
        });
    }

    drawGrid(cx, cy) {
        const size = 200 * this.zoom;
        const steps = 4;
        const isLight = this.theme === 'light';
        this.ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;

        for (let i = -steps; i <= steps; i++) {
            const pos = (i / steps) * size;

            // Lines parallel to Z
            this.drawLine3D(-size, 0, pos, size, 0, pos, cx, cy);
            // Lines parallel to X
            this.drawLine3D(pos, 0, -size, pos, 0, size, cx, cy);
        }
    }

    drawLine3D(x1, y1, z1, x2, y2, z2, cx, cy) {
        let r1 = rotateY(x1, y1, z1, this.angleY);
        r1 = rotateX(r1.x, r1.y, r1.z, this.angleX);
        const p1 = project3D(r1.x, r1.y, r1.z, cx, cy);

        let r2 = rotateY(x2, y2, z2, this.angleY);
        r2 = rotateX(r2.x, r2.y, r2.z, this.angleX);
        const p2 = project3D(r2.x, r2.y, r2.z, cx, cy);

        if (p1.scale > 0 && p2.scale > 0) {
            this.ctx.beginPath();
            this.ctx.moveTo(p1.x, p1.y);
            this.ctx.lineTo(p2.x, p2.y);
            this.ctx.stroke();
        }
    }
}
