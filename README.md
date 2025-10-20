# BOMPlanner - 3D Printing Project Tracker

BOMPlanner is a web-based application designed to help manage 3D printing projects by tracking Bills of Materials (BOMs) across multiple vendors. It allows users to organize projects, manage materials, track costs, and maintain notes, all within a sleek, dark-themed interface optimized for both desktop and mobile use.

## Features

- **Project Management**: Create, edit, and delete projects with metadata like descriptions, tags, and links.
- **Material Management**: Maintain a centralized library of materials with details such as name, vendor, price, and pack size.
- **Material Management**: Maintain a centralized library of materials with details such as name, vendor, price, and pack size. Packs/kits are supported: materials can be marked "Sold as pack/kit" and store their components (name, qty, optional URL and price). When saving a pack, the dedicated "Items per pack" field is used as the canonical pack size and the UI disables the legacy single-item pack size to avoid confusion.
- **BOM Tracking**: Organize BOMs by vendor (Amazon, AliExpress, Temu) with support for quantities, prices, pack sizes, and status tracking (pending, ordered, received).
- **Cost Summaries**: View per-vendor cost breakdowns, including subtotals and shipping costs.
- **Notes System**: Add, edit, and reorder notes with automatic URL linking for quick reference.
- **Import/Export**: Import and export projects and materials in JSON format for easy data management.
- **Accent Color & Theming**: You can customize the app accent color from Settings (enter a hex like #RRGGBB or any valid CSS color) — tip: pick a color at https://htmlcolorcodes.com/ and paste it into Settings.
- **Kits / Packs**: Save materials that represent kits/packs and expand them when adding to a project's BOM. The app can auto-create missing component materials when expanding a kit (user confirmation required and vendor/currency can be tweaked before creation).
- **Inventory Backups**: Create timestamped full inventory backups (materials + on-hand counts) and import them. Import will overwrite on-hand counts for matching materials (undo will be added in a follow-up).
- **Project Credits**: Project metadata supports an array of credits (name + optional URL). Credits are preserved across exports/imports and shown in the project view with clickable domain buttons.
- **Responsive Design**: Fully functional on mobile devices with a collapsible sidebar and optimized layouts.
- **Local Storage**: Persists data in the browser's localStorage for seamless use without a backend.
- Automatic thumbnail autoload/embed: the app can now auto-embed remote thumbnails in configurable batches on startup (default: enabled, conservative batch size 4). This can be toggled in Settings.
- Manual hard-refresh: Settings includes a "Hard refresh thumbnails now" action that runs the embed routine immediately and reports results.
- WebP handling: WebP uploads are now accepted (UI updated to show "Thumbnail (PNG/JPEG/WebP)") and — for compatibility — WebP images are converted to PNG upon upload so exports store PNG/JPEG data URLs. PNGs preserve alpha; JPEGs are preserved.
- Thumbnail upload fixes: the Choose Image button opens the file picker once reliably; the Remove button clears the preview and persists removal.
- Kits: a kit builder in the material editor lets you assemble components by selecting existing materials or entering custom component entries. Kits can be expanded into a project's BOM; missing materials can be auto-created after a review step.
- Inventory backups: snapshot and restore your materials and on-hand counts. Backups are timestamped and previewable.


## Getting Started

### Installation

1. Download and extract the zip file from the releases ()
2. Open `index.html` in a web browser by double clicking it 

Alternatively, you can host the application on a static file server (e.g., GitHub Pages, Netlify) for online access.

### Usage

1. **Create a Project**:
   - Click "+ New Project" in the sidebar to add a new project.
   - Enter a name, optional description, tags, and links in the modal.
   - Save to add the project to the list.

2. **Manage Materials**:
   - Switch to the "Materials" tab in the sidebar.
   - Click "+ Add Material" to input material details (name, URL, price, vendor, etc.).
   - Use the search and vendor filter to find materials quickly.

3. **Build BOMs**:
   - Select a project and add items to its BOM under the desired vendor section (Amazon, AliExpress, Temu).
   - Use the material lookup feature to quickly populate BOM items from the materials library.
   - Track quantities, prices, and statuses, and add optional shipping costs.

4. **Add Notes**:
   - In the project view, click "+ Add Note" to record project-specific notes.
   - URLs in notes are automatically converted to clickable links.

5. **Import/Export Data**:
   - Export individual projects or all projects as JSON files.
   - Import projects or materials from JSON files, with validation to prevent duplicates and invalid data.

5. **Consider sharing your project and materials**:
   - the goal of this repositiry is to have a ready to go material, notes, and projects ready to import and track for quickly starting and researching!



## Contributing

Contributions are welcome! To contribute:

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/your-feature`).
3. Commit your changes (`git commit -m 'Add your feature'`).
4. Push to the branch (`git push origin feature/your-feature`).
5. Open a pull request.