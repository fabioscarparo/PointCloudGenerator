import './style.css';
import { CurveEditor } from './CurveEditor.js';
import { WebGPURenderer } from './WebGPURenderer.js';
import { SurfaceGenerator } from './SurfaceGenerator.js';
import { Exporter } from './Exporter.js';

// --- State ---
const state = {
  density: 30,
  height: 1,
  radius: 2,
  color: '#7c4dff',
  color2: '#00aaff',
  colorMode: 'solid',
  noise: 0,
  autoRotate: false
};

// --- DOM Elements ---
const verticalCanvasId = 'vertical-editor';
const horizontalCanvasId = 'horizontal-editor';
const mainCanvasId = 'main-viewport';

const elDensity = document.getElementById('param-density');
const elHeight = document.getElementById('param-height');
const elZoom = document.getElementById('param-zoom');
const elRadius = document.getElementById('param-radius');
const elColor = document.getElementById('param-color');
const elColor2 = document.getElementById('param-color2');
const elColorMode = document.getElementById('param-color-mode');
const elNoise = document.getElementById('param-noise');
const elMode = document.getElementById('param-mode');
const elBgColor = document.getElementById('param-bg-color');
const elBgTransparent = document.getElementById('param-bg-transparent');
const elAutoRotate = document.getElementById('param-auto-rotate');
const elShowAxes = document.getElementById('param-show-axes');
const elShowGrid = document.getElementById('param-show-grid');
const elAspect = document.getElementById('param-aspect');

// Value displays
const valDensity = document.getElementById('val-density');
const valHeight = document.getElementById('val-height');
const valRadius = document.getElementById('val-radius');
const valZoom = document.getElementById('val-zoom');
const valNoise = document.getElementById('val-noise');

const btnExportPng = document.getElementById('btn-export-png');
const btnExportSvg = document.getElementById('btn-export-svg');
const btnExportObj = document.getElementById('btn-export-obj');
const btnReset = document.getElementById('btn-reset');

// Sidebar toggle
const sidebar = document.getElementById('sidebar');

// --- Components ---
const generator = new SurfaceGenerator();
const renderer = new WebGPURenderer(mainCanvasId);

// Update Logic
// Update Logic

/**
 * Main update loop.
 * Synchronizes UI components, regenerates geometry, and triggers rendering.
 */
function update() {
  // Sync geometry mode
  window.geometryMode = elMode.value;

  // UI Feedback: Show/Hide editors or labels based on mode
  const hSection = document.getElementById('horizontal-editor').closest('.panel-section');
  const hLabel = hSection.querySelector('.section-title');
  const vLabel = document.getElementById('vertical-editor').closest('.panel-section').querySelector('.section-title');

  if (window.geometryMode === 'revolution') {
    hSection.style.opacity = '0.3';
    hSection.style.pointerEvents = 'none';
    hLabel.textContent = 'Shape (Disabled)';
    vLabel.textContent = 'Profile (Vertical)';
  } else if (window.geometryMode === 'sheet') {
    hSection.style.opacity = '1';
    hSection.style.pointerEvents = 'auto';
    hLabel.textContent = 'X Profile';
    vLabel.textContent = 'Z Profile';
  } else {
    hSection.style.opacity = '1';
    hSection.style.pointerEvents = 'auto';
    hLabel.textContent = 'Shape (Horizontal)';
    vLabel.textContent = 'Profile (Vertical)';
  }

  // Sync Values
  valDensity.textContent = state.density;
  valHeight.textContent = state.height.toFixed(1);
  valRadius.textContent = state.radius.toFixed(1);
  valZoom.textContent = renderer.zoom.toFixed(1);
  valNoise.textContent = state.noise.toFixed(2);

  // 1. Get Curves
  const vCurve = verticalEditor.points;
  const hCurve = horizontalEditor.points;

  // 2. Generate Points
  const points = generator.generate(
    vCurve,
    hCurve,
    state
  );

  // 3. Render
  renderer.pointRadius = state.radius;
  renderer.bgColor = elBgColor.value;
  renderer.bgTransparent = elBgTransparent.checked;

  // Toggle checkerboard class on container
  const panelMain = document.querySelector('.panel-main');
  if (renderer.bgTransparent) {
    panelMain.classList.add('checkerboard');
    renderer.canvas.classList.add('checkerboard-enabled');
  } else {
    panelMain.classList.remove('checkerboard');
    renderer.canvas.classList.remove('checkerboard-enabled');
  }

  renderer.setPoints(points);
}

// Editors
const verticalEditor = new CurveEditor(verticalCanvasId, true, update);
const horizontalEditor = new CurveEditor(horizontalCanvasId, false, update);

// --- Event Listeners ---

// 1. Editors
/**
 * Event handler for curve editor changes.
 * Throttle or debounce could be added here if generation becomes expensive.
 */
function onCurveUpdate() {
  update();
}

verticalEditor.onChange = onCurveUpdate;
horizontalEditor.onChange = onCurveUpdate;

// 2. Parameters
/**
 * Attaches a standard input listener to a UI parameter.
 * @param {HTMLElement} element - The DOM element.
 * @param {Function} handler - The callback function.
 */
function attachListener(element, handler) {
  if (element) {
    element.addEventListener('input', handler);
  }
}

attachListener(elDensity, (e) => {
  state.density = parseInt(e.target.value, 10);
  update();
});

elHeight.addEventListener('input', (e) => {
  state.height = parseFloat(e.target.value);
  update();
});

elZoom.addEventListener('input', (e) => {
  renderer.zoom = parseFloat(e.target.value);
  renderer.render();
});

elRadius.addEventListener('input', (e) => {
  state.radius = parseFloat(e.target.value);
  update();
});

elColor.addEventListener('input', (e) => {
  state.color = e.target.value;
  update();
});

elColor2.addEventListener('input', (e) => {
  state.color2 = e.target.value;
  update();
});

elColorMode.addEventListener('change', (e) => {
  state.colorMode = e.target.value;
  update();
});

elNoise.addEventListener('input', (e) => {
  state.noise = parseFloat(e.target.value);
  update();
});

elMode.addEventListener('change', () => {
  update();
});

elBgColor.addEventListener('input', () => {
  update();
});

elBgTransparent.addEventListener('change', () => {
  update();
});

elAutoRotate.addEventListener('change', (e) => {
  state.autoRotate = e.target.checked;
});

elShowAxes.addEventListener('change', (e) => {
  renderer.showAxes = e.target.checked;
  renderer.render();
});

elShowGrid.addEventListener('change', (e) => {
  renderer.showGrid = e.target.checked;
  renderer.render();
});

const elGridOpacity = document.getElementById('param-grid-opacity');
const valGridOpacity = document.getElementById('val-grid-opacity');

if (elGridOpacity) {
  elGridOpacity.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    renderer.gridOpacity = val;
    valGridOpacity.textContent = val.toFixed(1);
  });
}

const elLightMode = document.getElementById('param-light-mode');
elLightMode.addEventListener('change', (e) => {
  const isLight = e.target.checked;
  const theme = isLight ? 'light' : 'dark';

  if (isLight) {
    document.body.classList.add('light-mode');
  } else {
    document.body.classList.remove('light-mode');
  }

  renderer.theme = theme;
  verticalEditor.theme = theme;
  horizontalEditor.theme = theme;

  // Swap default background color if unset
  if (isLight && elBgColor.value === '#000000') {
    elBgColor.value = '#f0f2f5'; // Light mode bg
  } else if (!isLight && elBgColor.value === '#f0f2f5') {
    elBgColor.value = '#000000'; // Dark mode bg
  }

  update();
  verticalEditor.draw();
  horizontalEditor.draw();
});

elAspect.addEventListener('change', (e) => {
  renderer.aspectRatio = e.target.value;
});

// Buttons

/**
 * Exports the current view as a PNG image.
 * Forces a synchronous GPU render to ensure buffer availability.
 */
btnExportPng.addEventListener('click', async () => {
  // 1. Force a fresh render
  renderer.render();

  // 2. Wait for the GPU to finish rendering to the canvas texture
  if (renderer.device) {
    await renderer.device.queue.onSubmittedWorkDone();
  }

  // 3. Immediately capture the canvas
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  Exporter.toPNG(renderer.canvas, `point-cloud-${timestamp}.png`);
});

btnExportSvg.addEventListener('click', () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const { angleX, angleY, zoom, offsetX, offsetY, canvas, bgColor, bgTransparent } = renderer;
  const { width, height } = canvas;

  Exporter.toSVG(
    renderer.points,
    angleX,
    angleY,
    zoom,
    offsetX,
    offsetY,
    width,
    height,
    state.radius,
    bgColor,
    bgTransparent,
    `point-cloud-${timestamp}.svg`
  );
});

btnExportObj.addEventListener('click', () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  Exporter.toOBJ(renderer.points, `point-cloud-${timestamp}.obj`);
});

btnReset.addEventListener('click', () => {
  // Reset State
  Object.assign(state, {
    density: 30,
    height: 1,
    radius: 2,
    color: '#7c4dff',
    color2: '#00aaff',
    colorMode: 'solid',
    noise: 0
  });
  renderer.zoom = 1;

  // Reset UI
  elDensity.value = state.density;
  elHeight.value = state.height;
  elZoom.value = renderer.zoom;
  elRadius.value = state.radius;
  elColor.value = state.color;
  elColor2.value = state.color2;
  elColorMode.value = state.colorMode;
  elNoise.value = state.noise;
  elMode.value = 'sweep';
  elBgColor.value = '#000000';
  elBgTransparent.checked = false;
  elAutoRotate.checked = false;
  renderer.aspectRatio = 'custom';

  verticalEditor.reset();
  horizontalEditor.reset();

  update();
});

// --- Animation Loop ---
function animate() {
  if (state.autoRotate) {
    renderer.angleY += 0.01;
    renderer.render();
  }
  requestAnimationFrame(animate);
}

// --- Mobile Menu Toggle ---
const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const mobileBackdrop = document.createElement('div');
mobileBackdrop.className = 'mobile-backdrop';
document.body.appendChild(mobileBackdrop);

function toggleMobileMenu() {
  sidebar.classList.toggle('mobile-open');
  mobileMenuToggle.classList.toggle('active');
  mobileBackdrop.classList.toggle('active');
}

mobileMenuToggle.addEventListener('click', toggleMobileMenu);
mobileBackdrop.addEventListener('click', toggleMobileMenu);

// Close mobile menu when clicking on a control
if (window.innerWidth <= 768) {
  sidebar.addEventListener('click', (e) => {
    // Close menu when interacting with controls, but not when scrolling
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') {
      setTimeout(() => {
        if (sidebar.classList.contains('mobile-open')) {
          toggleMobileMenu();
        }
      }, 300);
    }
  });
}

// Initial Draw & Start Animation
update();
animate();
console.log('App initialized');

