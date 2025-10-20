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

## New / Notable Changes (since initial fork)

- Pack/Kit semantics: when a material is saved as a pack/kit the 'Items per pack' option is the authoritative value. The UI now disables the older single-item pack field while editing packs to prevent mismatched data.
- Accent color setting: change the look-and-feel from Settings -> pick a hex color or CSS color name and Apply.
- Kits: a kit builder in the material editor lets you assemble components by selecting existing materials or entering custom component entries. Kits can be expanded into a project's BOM; missing materials can be auto-created after a review step.
- Inventory backups: snapshot and restore your materials and on-hand counts. Backups are timestamped and previewable.
- McMaster-Carr vendor support: BOMs and materials include McMaster as a vendor option.

## Development Notes

- The app is a single-page application built with vanilla JavaScript and persists data to localStorage under `boManager*` keys. A safe non-destructive migration copies older `bomPlanner*` keys when present.
- Key files edited:
   - `index.html` — main UI and modals
   - `assets/js/app.js` — monolithic runtime and app logic (persistence, rendering, handlers)
   - `assets/css/styles.css` — styles updated to use a CSS variable `--accent-color` that is settable from the Settings UI

## Next improvements planned

- Add an "Undo" action for inventory backup imports (store pre-import snapshot and allow revert).
- Small accessibility improvements: aria-live announcements, modal ARIA attributes, and better keyboard focus management.
- More granular tests and automated validation of imports.


## Contributing

Contributions are welcome! To contribute:

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/your-feature`).
3. Commit your changes (`git commit -m 'Add your feature'`).
4. Push to the branch (`git push origin feature/your-feature`).
5. Open a pull request.

## Recent changes (local edits)

- Automatic thumbnail autoload/embed: the app can now auto-embed remote thumbnails in configurable batches on startup (default: enabled, conservative batch size 4). This can be toggled in Settings.
- Manual hard-refresh: Settings includes a "Hard refresh thumbnails now" action that runs the embed routine immediately and reports results.
- WebP handling: WebP uploads are now accepted (UI updated to show "Thumbnail (PNG/JPEG/WebP)") and — for compatibility — WebP images are converted to PNG upon upload so exports store PNG/JPEG data URLs. PNGs preserve alpha; JPEGs are preserved.
- Thumbnail upload fixes: the Choose Image button opens the file picker once reliably; the Remove button clears the preview and persists removal.

## Quick test checklist

1. Start a local static server and open the app in a modern browser:

```bash
python3 -m http.server 8000
# Open http://localhost:8000
```

2. Verify thumbnail flows:
   - Edit or create a project/material and click "Choose Image" — file dialog should open once.
   - Upload a PNG: preview should be displayed and exported JSON should contain a data URL starting with `data:image/png`.
   - Upload a JPEG: exported data URL should start with `data:image/jpeg`.
   - Upload a WEBP: preview should display and exported data URL should be `data:image/png` (converted for compatibility).
   - Click Remove — thumbnail preview clears and the underlying saved object no longer contains `thumbnailDataUrl` after saving.

3. Verify embedding behavior:
   - If "Auto-embed images on startup" is enabled (Settings), remote thumbnails will be fetched in batches on startup. Watch the DevTools Network tab for batched requests.
   - Use "Hard refresh thumbnails now" in Settings to run embedding on demand.

4. Check network calls locations in code:
   - `fetch()` is used for source JSON fetching and for fetching images when embedding via `resizeImageFromUrl()`; these are triggered only on explicit user actions (fetch/preview, refresh sources, manual embed, or auto-embed when enabled in Settings).
