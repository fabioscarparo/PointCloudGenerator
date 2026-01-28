# Point Cloud Generator

An interactive **high-performance 3D point cloud generator** powered by **WebGPU**. Create complex geometric shapes with smooth real-time rendering of millions of points.

![Point Cloud Generator](https://img.shields.io/badge/status-active-success.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## Features

- **High-Performance WebGPU Rendering**: 
  - Ultra-fast rendering using modern GPU APIs
  - High DPI (Retina) support for crystal-clear visuals
  - Smoothstep Anti-aliasing for perfectly round points
- **Multiple Geometry Modes**:
  - Sweep Shape: Extrude a shape along a path
  - Revolution: Create solids of revolution
  - Sheet (Depth Map Like): Generate surfaces
- **Advanced Color Modes**:
  - Solid color
  - Height-based gradient
  - Depth-based gradient
- **Comprehensive Interaction**:
  - Rotation: Instinctive mouse-based 3D rotation
  - Panning: Middle mouse button (wheel) drag to reposition the view
  - Zoom: Scroll wheel or slider based zooming
- **Comprehensive Controls**:
  - Adjustable point density
  - Height scaling
  - Point radius
  - Noise intensity
  - Customizable background (color and transparency)
  - Grid & Axes Opacity: Adjustable reference grid transparency
- **Multiple Export Formats**:
  - PNG (raster image)
  - SVG (vector graphics)
  - OBJ (3D model)
- **Themes**: Light and dark mode support

## Live Demo

Visit the live demo: [https://fabioscarparo.github.io/PointCloudGenerator](https://fabioscarparo.github.io/PointCloudGenerator)

## Local Development

### Prerequisites

- Node.js (version 18 or higher)
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/fabioscarparo/PointCloudGenerator.git

# Navigate to the directory
cd PointCloudGenerator

# Install dependencies
npm install

# Start the development server
npm run dev
```

The application will be available at `http://localhost:5173`

### Production Build

```bash
# Create production build
npm run build

# Preview the build
npm run preview
```

## Project Structure

```
Point Cloud Generator/
├── src/
│   ├── main.js           # Application entry point
│   ├── WebGPURenderer.js # High-performance WebGPU rendering engine
│   ├── CurveEditor.js    # Interactive curve editor
│   ├── SurfaceGenerator.js # 3D surface generation
│   ├── Exporter.js       # PNG, SVG, OBJ export
│   ├── math.js           # Mathematical utilities
│   └── style.css         # Global styles
├── index.html            # Main HTML file
├── vite.config.js        # Vite configuration
└── package.json          # Project dependencies
```

## Usage

1. **Edit Vertical Profile**: Use the top editor to control height and scale along the Y-axis
2. **Edit Horizontal Shape**: Use the middle editor to define the shape on the X-Z plane
3. **Navigate 3D View**:
   - **Rotate**: Left-click and drag
   - **Pan**: Middle-click (scroll wheel) and drag
   - **Zoom**: Scroll wheel
4. **Adjust Parameters**: Use the sidebar controls to modify density, colors, grid opacity, etc.
5. **Export**: Save your work as PNG, SVG, or OBJ

## Browser Support

Requires a browser with **WebGPU** support:
- Google Chrome 113+
- Microsoft Edge 113+
- Safari 17.4+ (Experimental)
- Firefox (behind flag `dom.webgpu.enabled`)

## Contributing

Contributions are welcome! Feel free to open issues or pull requests.

## License

This project is licensed under the MIT License.

## Author

Created by Fabio Scarparo

