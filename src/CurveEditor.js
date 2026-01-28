import { cubicBezier, sampleBezierSpline, TOP_MARGIN, BOTTOM_MARGIN, LEFT_MARGIN, RIGHT_MARGIN } from './math.js';

export class CurveEditor {
    constructor(canvasId, isVertical = false, onChange) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.isVertical = isVertical;
        this.onChange = onChange;
        this.theme = 'dark';
        this.pulse = 0;
        this.animationFrame = null;

        // points: array of {x, y, cp1: {dx, dy}, cp2: {dx, dy}}
        this.points = [];
        this.selectedPoint = -1;
        this.dragHandle = 0; // 0: anchor, 1: cp1, 2: cp2

        // Initialize default shape based on orientation
        if (this.isVertical) {
            this.points = [
                { x: 0.5, y: 0, cp1: { dx: -0.1, dy: 0 }, cp2: { dx: 0.1, dy: 0 } },
                { x: 0.8, y: 0.5, cp1: { dx: 0, dy: -0.1 }, cp2: { dx: 0, dy: 0.1 } },
                { x: 0.5, y: 1, cp1: { dx: 0.1, dy: 0 }, cp2: { dx: -0.1, dy: 0 } }
            ];
        } else {
            this.points = [
                { x: 0, y: 0.5, cp1: { dx: 0, dy: 0.2 }, cp2: { dx: 0, dy: -0.2 } },
                { x: 0.5, y: 0.1, cp1: { dx: -0.2, dy: 0 }, cp2: { dx: 0.2, dy: 0 } },
                { x: 1, y: 0.5, cp1: { dx: 0, dy: -0.2 }, cp2: { dx: 0, dy: 0.2 } }
            ];
        }

        this.dragIndex = -1;
        this.hoverIndex = -1;

        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Event Listeners
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        window.addEventListener('mousemove', this.onMouseMove.bind(this));
        window.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.canvas.addEventListener('dblclick', this.onDoubleClick.bind(this));
        this.canvas.addEventListener('contextmenu', this.onContextMenu.bind(this));

        // Touch support
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.onMouseDown(e.touches[0]);
        }, { passive: false });
        window.addEventListener('touchmove', (e) => {
            // e.preventDefault(); // Prevent scrolling
            this.onMouseMove(e.touches[0]);
        }, { passive: false });
        window.addEventListener('touchend', (e) => this.onMouseUp(e));

        // Start Animation Loop
        this.animate();
    }

    animate() {
        this.pulse += 0.05;
        this.draw();
        this.animationFrame = requestAnimationFrame(this.animate.bind(this));
    }

    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.draw();
    }

    // Convert normalized coordinate (0..1) to canvas pixel
    toCanvas(p) {
        const w = this.canvas.width - LEFT_MARGIN - RIGHT_MARGIN;
        const h = this.canvas.height - TOP_MARGIN - BOTTOM_MARGIN;

        // Flip Y because canvas 0 is top
        return {
            x: LEFT_MARGIN + p.x * w,
            y: this.canvas.height - BOTTOM_MARGIN - p.y * h
        };
    }

    // Convert canvas pixel to normalized coordinate (0..1)
    fromCanvas(x, y) {
        const w = this.canvas.width - LEFT_MARGIN - RIGHT_MARGIN;
        const h = this.canvas.height - TOP_MARGIN - BOTTOM_MARGIN;

        let nx = (x - LEFT_MARGIN) / w;
        let ny = (this.canvas.height - BOTTOM_MARGIN - y) / h;

        // Clamp
        // nx = Math.max(0, Math.min(1, nx));
        // ny = Math.max(0, Math.min(1, ny));

        return { x: nx, y: ny };
    }

    draw() {
        const { width, height } = this.canvas;
        this.ctx.clearRect(0, 0, width, height);

        // Draw grid/axes
        const isLight = this.theme === 'light';
        this.ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();

        // Draw some sub-grid lines
        const gridSteps = 4;
        for (let i = 1; i < gridSteps; i++) {
            const x = LEFT_MARGIN + (i / gridSteps) * (width - LEFT_MARGIN - RIGHT_MARGIN);
            const y = TOP_MARGIN + (i / gridSteps) * (height - TOP_MARGIN - BOTTOM_MARGIN);

            this.ctx.moveTo(x, TOP_MARGIN);
            this.ctx.lineTo(x, height - BOTTOM_MARGIN);
            this.ctx.moveTo(LEFT_MARGIN, y);
            this.ctx.lineTo(width - RIGHT_MARGIN, y);
        }
        this.ctx.stroke();

        // Determine baseline positions (normalized 0..1)
        // Vertical profile: axes are at Left (x=0) and Bottom (y=0)
        // Horizontal shape: axes are at Center (x=0.5) and Center (y=0.5)
        const bx = this.isVertical ? 0 : 0.5;
        const by = this.isVertical ? 0 : 0.5;
        const baseline = this.toCanvas({ x: bx, y: by });

        // Y/Z Axis (Vertical in canvas)
        this.ctx.strokeStyle = this.isVertical ? '#4dff4d' : '#4d4dff';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(baseline.x, TOP_MARGIN);
        this.ctx.lineTo(baseline.x, height - BOTTOM_MARGIN);
        this.ctx.stroke();

        // X Axis (Horizontal in canvas)
        this.ctx.strokeStyle = '#ff4d4d';
        this.ctx.beginPath();
        this.ctx.moveTo(LEFT_MARGIN, baseline.y);
        this.ctx.lineTo(width - RIGHT_MARGIN, baseline.y);
        this.ctx.stroke();

        // Labels
        this.ctx.font = '10px Outfit';
        this.ctx.fillStyle = this.isVertical ? '#4dff4d' : '#4d4dff';
        this.ctx.fillText(this.isVertical ? 'Y (Height)' : 'Z (Depth)', baseline.x - 40, TOP_MARGIN);

        this.ctx.fillStyle = '#ff4d4d';
        this.ctx.fillText(this.isVertical ? 'Radius' : 'X (Width)', width - RIGHT_MARGIN, baseline.y + 20);

        // Origin Glow
        this.ctx.beginPath();
        const pulseFactor = Math.sin(this.pulse) * 5;
        const glowRadius = 20 + pulseFactor;
        const grad = this.ctx.createRadialGradient(baseline.x, baseline.y, 0, baseline.x, baseline.y, glowRadius);
        const accentColor = '#007aff';
        grad.addColorStop(0, `${accentColor}4D`); // 30% alpha
        grad.addColorStop(1, `${accentColor}00`); // 0% alpha
        this.ctx.fillStyle = grad;
        this.ctx.arc(baseline.x, baseline.y, glowRadius, 0, Math.PI * 2);
        this.ctx.fill();

        // Draw Curve
        this.ctx.strokeStyle = accentColor;
        this.ctx.lineWidth = 3;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.beginPath();

        // Glow effect
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = 'rgba(124, 77, 255, 0.4)';

        // We calculate points along the curve for rendering
        const steps = 150;

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = sampleBezierSpline(t, this.points, 'x');
            const y = sampleBezierSpline(t, this.points, 'y');
            const pos = this.toCanvas({ x, y });
            if (i === 0) this.ctx.moveTo(pos.x, pos.y);
            else this.ctx.lineTo(pos.x, pos.y);
        }
        this.ctx.stroke();
        this.ctx.shadowBlur = 0; // Reset glow

        // Draw Handles and Points
        this.points.forEach((p, i) => {
            const pos = this.toCanvas(p);
            const isHovered = i === this.hoverIndex;
            const isDragged = i === this.dragIndex;
            const isSelected = i === this.selectedPoint;
            const isActive = isHovered || isDragged || isSelected;

            // Draw Handles if selected or dragged
            if (isActive) {
                const cp1Pos = this.toCanvas({ x: p.x + p.cp1.dx, y: p.y + p.cp1.dy });
                const cp2Pos = this.toCanvas({ x: p.x + p.cp2.dx, y: p.y + p.cp2.dy });

                this.ctx.setLineDash([2, 4]);
                this.ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)';
                this.ctx.lineWidth = 1;

                this.ctx.beginPath();
                this.ctx.moveTo(cp1Pos.x, cp1Pos.y);
                this.ctx.lineTo(pos.x, pos.y);
                this.ctx.lineTo(cp2Pos.x, cp2Pos.y);
                this.ctx.stroke();
                this.ctx.setLineDash([]);

                // CP1 Circle
                this.ctx.beginPath();
                this.ctx.arc(cp1Pos.x, cp1Pos.y, 4, 0, Math.PI * 2);
                this.ctx.fillStyle = (this.dragIndex === i && this.dragHandle === 1) ? '#ff4d4d' : '#888';
                this.ctx.fill();

                // CP2 Circle
                this.ctx.beginPath();
                this.ctx.arc(cp2Pos.x, cp2Pos.y, 4, 0, Math.PI * 2);
                this.ctx.fillStyle = (this.dragIndex === i && this.dragHandle === 2) ? '#ff4d4d' : '#888';
                this.ctx.fill();
            }

            // Anchor Point
            this.ctx.beginPath();
            const size = (isHovered || isDragged) ? 10 : 8;
            this.ctx.rect(pos.x - size / 2, pos.y - size / 2, size, size);
            this.ctx.fillStyle = isSelected ? (isLight ? '#007aff' : '#fff') : (isLight ? '#666' : '#bbb');

            if (isSelected) {
                this.ctx.shadowBlur = 10;
                this.ctx.shadowColor = 'rgba(0, 122, 255, 0.5)';
            }
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        });
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        let clientX = e.clientX;
        let clientY = e.clientY;

        // For touches
        if (e.clientX === undefined && e.pageX !== undefined) {
            clientX = e.pageX;
            clientY = e.pageY;
        }

        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    onMouseDown(e) {
        if (e.button !== 0) return; // Only left click
        const pos = this.getMousePos(e);

        this.dragIndex = -1;
        this.dragHandle = 0;
        const hitRadiusSq = 225;

        // Check anchors and handles of selected point
        for (let i = 0; i < this.points.length; i++) {
            const p = this.points[i];
            const pCanvas = this.toCanvas(p);

            // Check Anchor
            if (this.distSq(pos, pCanvas) < hitRadiusSq) {
                this.dragIndex = i;
                this.dragHandle = 0;
                this.selectedPoint = i;
                break;
            }

            // Check handles only if point is selected or hovered
            if (i === this.selectedPoint) {
                const cp1 = this.toCanvas({ x: p.x + p.cp1.dx, y: p.y + p.cp1.dy });
                if (this.distSq(pos, cp1) < hitRadiusSq) {
                    this.dragIndex = i;
                    this.dragHandle = 1;
                    break;
                }
                const cp2 = this.toCanvas({ x: p.x + p.cp2.dx, y: p.y + p.cp2.dy });
                if (this.distSq(pos, cp2) < hitRadiusSq) {
                    this.dragIndex = i;
                    this.dragHandle = 2;
                    break;
                }
            }
        }
        this.draw();
    }

    distSq(p1, p2) {
        return (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
    }

    onDoubleClick(e) {
        const pos = this.getMousePos(e);
        const normalized = this.fromCanvas(pos.x, pos.y);

        // Add point with default handles
        this.points.push({
            ...normalized,
            cp1: { dx: -0.1, dy: 0 },
            cp2: { dx: 0.1, dy: 0 }
        });

        this.selectedPoint = this.points.length - 1;
        this.draw();
        if (this.onChange) this.onChange();
    }

    onContextMenu(e) {
        e.preventDefault();
        const pos = this.getMousePos(e);

        let toRemove = -1;
        const hitRadiusSq = 225;
        for (let i = 0; i < this.points.length; i++) {
            const p = this.toCanvas(this.points[i]);
            const dx = pos.x - p.x;
            const dy = pos.y - p.y;
            if (dx * dx + dy * dy < hitRadiusSq) {
                toRemove = i;
                break;
            }
        }

        if (toRemove !== -1 && this.points.length > 2) {
            this.points.splice(toRemove, 1);
            this.draw();
            if (this.onChange) this.onChange();
        }
    }

    onMouseMove(e) {
        const pos = this.getMousePos(e);

        if (this.dragIndex !== -1) {
            const normalized = this.fromCanvas(pos.x, pos.y);
            const p = this.points[this.dragIndex];

            if (this.dragHandle === 0) {
                // Moving Anchor
                p.x = Math.max(0, Math.min(1, normalized.x));
                p.y = Math.max(0, Math.min(1, normalized.y));
            } else if (this.dragHandle === 1) {
                // Moving CP1 (Mirroring CP2)
                p.cp1.dx = normalized.x - p.x;
                p.cp1.dy = normalized.y - p.y;
                p.cp2.dx = -p.cp1.dx;
                p.cp2.dy = -p.cp1.dy;
            } else if (this.dragHandle === 2) {
                // Moving CP2 (Mirroring CP1)
                p.cp2.dx = normalized.x - p.x;
                p.cp2.dy = normalized.y - p.y;
                p.cp1.dx = -p.cp2.dx;
                p.cp1.dy = -p.cp2.dy;
            }

            this.draw();
            if (this.onChange) this.onChange();
        } else {
            // Hover effect for anchors
            this.hoverIndex = -1;
            const hitRadiusSq = 225;
            for (let i = 0; i < this.points.length; i++) {
                const p = this.toCanvas(this.points[i]);
                if (this.distSq(pos, p) < hitRadiusSq) {
                    this.hoverIndex = i;
                    break;
                }
            }
            this.draw();
        }
    }

    onMouseUp() {
        this.dragIndex = -1;
        this.draw();
    }

    reset() {
        if (this.isVertical) {
            this.points = [
                { x: 0.5, y: 0, cp1: { dx: -0.1, dy: 0 }, cp2: { dx: 0.1, dy: 0 } },
                { x: 0.8, y: 0.5, cp1: { dx: 0, dy: -0.1 }, cp2: { dx: 0, dy: 0.1 } },
                { x: 0.5, y: 1, cp1: { dx: 0.1, dy: 0 }, cp2: { dx: -0.1, dy: 0 } }
            ];
        } else {
            this.points = [
                { x: 0, y: 0.5, cp1: { dx: 0, dy: 0.2 }, cp2: { dx: 0, dy: -0.2 } },
                { x: 0.5, y: 0.1, cp1: { dx: -0.2, dy: 0 }, cp2: { dx: 0.2, dy: 0 } },
                { x: 1, y: 0.5, cp1: { dx: 0, dy: -0.2 }, cp2: { dx: 0, dy: 0.2 } }
            ];
        }
        this.selectedPoint = -1;
        this.draw();
    }
}
