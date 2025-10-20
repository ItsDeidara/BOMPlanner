/* Extracted and modularized runtime from oldIndex.html
   - Wrapped in an IIFE
   - Exposes UI handlers on window for inline onclicks
   - Keeps data persistence in localStorage under 'bomPlannerData'
*/
(function(){
  'use strict';

  // App state
  var appData = { materials: [], projects: [], currentProjectId: null };
  var currentBOMVendor = null;
  var editingMaterialId = null;
  var editingProjectId = null;
  var editingNoteIndex = null;
  var importModeProjects = 'merge';
  var importModeMaterials = 'merge';
  var tempProjectTags = [];
  var tempProjectLinks = [];
  var tempProjectCredits = [];
  var editingProjectCreditIndex = -1; // index of credit being edited in the modal, -1 when none
  var editingProjectCreditIndex = -1; // index of credit being edited in the modal, -1 when none
  var tempMaterialTags = [];
  var tempMaterialComponents = []; // components when building a kit/pack
  var expandedKits = {}; // map materialId -> bool for inventory expand/collapse
  var _pendingKitExpansion = null; // temporary storage when confirming creation of missing materials during expansion

  // Import preview helpers
  var _pendingImport = { type: null, items: null, details: null };
  var _lastImportSnapshot = null;
  // fingerprint of last import preview shown (to avoid reopening the same preview multiple times)
  var _lastImportPreviewFingerprint = null;
  // Sources (remote JSON providers)
  var _sources = []; // { name, subtitle, description, iconURL, headerURL, website, patreonURL, url }

  // currency locale map
  var _currencyLocaleMap = {
    USD: 'en-US',
    EUR: 'de-DE',
    GBP: 'en-GB',
    CAD: 'en-CA',
    AUD: 'en-AU'
  };

  // Initialize app
  function init() {
    // safe one-time migration for localStorage keys (non-destructive)
    migrateLocalStorageKeysIfNeeded();
    loadData();
    // Ensure existing items have stable UUIDs (assign only when missing) 
  try {
    var assignedCount = migrateMissingIds();
    if (assignedCount && assignedCount > 0) {
      try {
        var banner = document.getElementById('migrationBanner'); var text = document.getElementById('migrationBannerText'); if (banner && text) { text.textContent = 'Migration: assigned ' + assignedCount + ' missing IDs to local items.'; banner.style.display = 'block'; setTimeout(function(){ try { banner.style.display = 'none'; } catch(e){} }, 8000); }
      } catch(e) { console.warn('Failed to show migration banner', e); }
    }
  } catch(e) { console.warn('migrateMissingIds failed during init', e); }
    loadImageSettings();
    loadEmbedSettings();
    loadSources();
  loadAppSettings();
  // Apply saved accent color (if any) at startup so UI uses the user's chosen color
  try { loadAccentColor(); } catch (e) { /* ignore if not available yet */ }
  // ensure inventoryBackups array exists
  appData.inventoryBackups = appData.inventoryBackups || [];
    // automatic embedding is disabled by default to avoid outbound network calls on startup
    // (embedding should only run when the user explicitly requests it)
    setupEventListeners();
    renderProjects();
    renderMaterials();

    if (appData.projects.length > 0) {
      selectProject(appData.projects[0].id);
    }
  // Ensure a simple always-visible hamburger button exists (replaces chevron + hover-zone)
    // Hamburger/collapse UX disabled: keep sidebar static by default
    console.info('hamburger setup skipped: collapsing is disabled in this build');
    // Ensure vendor sections are expanded by default
    ['amazon','aliexpress','temu','mcmaster'].forEach(function(v){
      var body = document.getElementById(v + 'Body');
      var btn = document.getElementById(v + 'Toggle');
      if (body) body.style.display = 'block';
      if (btn) btn.textContent = 'Collapse';
    });
    // If auto-embed is enabled, start embedding saved thumbnails in batches after a short delay
    try {
      if (embedSettings && embedSettings.autoEmbedOnStartup) {
        // Run a little later so the UI has painted and event listeners are bound
        setTimeout(function(){
          try { embedAllSavedThumbnails(Number(embedSettings.batchSize) || 4).then(function(res){ console.info('Auto-embed finished', res); }).catch(function(err){ console.warn('Auto-embed error', err); }); } catch(e) { console.warn('Failed to start auto-embed', e); }
        }, 500);
      }
    } catch(e) {}
    // Hosted content loading removed — app remains local-only by default and will not fetch remote manifests.
  // Apply persisted sidebar collapsed state if present
  try { if (appSettings && appSettings.sidebarCollapsed) { var sb = document.getElementById('sidebar'); if (sb) sb.classList.add('collapsed'); } } catch(e){}

  // Responsive sidebar: auto-collapse when window is below threshold unless the user manually overrides
  try { window.addEventListener('resize', handleResponsiveSidebar); handleResponsiveSidebar(); } catch(e) { console.warn('Failed to setup responsive sidebar listener', e); }


  // Sidebar collapse toggling disabled to avoid broken collapsing UX.
  function toggleSidebarCollapse() {
    // no-op: preserve for legacy inline handlers but do not change UI state
    console.info('toggleSidebarCollapse called but collapsing is disabled in this build');
  }

  // Expose no-op toggleSidebarCollapse for legacy inline onclick handlers
  try { if (typeof window !== 'undefined') { window.toggleSidebarCollapse = toggleSidebarCollapse; } } catch(e) {}

  // Auto-collapse/expand sidebar based on window width and saved manual override
  function handleResponsiveSidebar() {
    try {
      var threshold = 700; // px: when window.innerWidth <= threshold, collapse
      var sb = document.getElementById('sidebar'); if (!sb) return;
      // If user manually toggled the sidebar, do not auto-change it
      if (appSettings && appSettings.sidebarManualOverride) return;
      if (window.innerWidth <= threshold) {
        if (!sb.classList.contains('collapsed')) {
          sb.classList.add('collapsed');
          appSettings.sidebarCollapsed = true; saveAppSettings();
        }
      } else {
        if (sb.classList.contains('collapsed')) {
          sb.classList.remove('collapsed');
          appSettings.sidebarCollapsed = false; saveAppSettings();
        }
      }
  // hamburger repositioning disabled
    } catch(e) { console.warn('handleResponsiveSidebar failed', e); }
  }

  // Backward-compatible shim (no-op)
  function positionChevron() { /* no-op */ }

  // --- Hamburger button helpers (replacement for the chevron + hover-zone) ---
  function ensureHamburgerButton() { /* removed: hamburger disabled */ }

  function positionHamburger() { /* removed: hamburger disabled */ }

  function startEditProjectCredit(idx) {
    if (typeof idx !== 'number' || idx < 0 || idx >= (tempProjectCredits||[]).length) return;
    editingProjectCreditIndex = idx;
    var c = tempProjectCredits[idx] || { name: '', url: '' };
    var row = document.getElementById('projectCreditRow_' + idx);
    if (!row) return;
    row.innerHTML = '<div style="flex:1; display:flex; gap:8px; align-items:center;">' +
      '<input id="_editCreditName_' + idx + '" class="form-input" style="flex:1;" value="' + escapeHtml(c.name || '') + '">' +
      '<input id="_editCreditUrl_' + idx + '" class="form-input" style="flex:1;" value="' + escapeHtml(c.url || '') + '">' +
      '</div>' +
      '<div style="display:flex; gap:8px; align-items:center;">' +
      '<button class="btn btn-small" onclick="updateProjectCredit(' + idx + ')">Update</button>' +
      '<button class="btn btn-secondary btn-small" onclick="cancelEditProjectCredit(' + idx + ')">Cancel</button>' +
      '</div>';
  }

  function updateProjectCredit(idx) {
    if (typeof idx !== 'number' || idx < 0 || idx >= (tempProjectCredits||[]).length) return;
    var nameEl = document.getElementById('_editCreditName_' + idx);
    var urlEl = document.getElementById('_editCreditUrl_' + idx);
    if (!nameEl || !nameEl.value.trim()) return alert('Credit name is required');
    var name = nameEl.value.trim();
    var url = urlEl && urlEl.value.trim();
    if (url && !isValidUrl(url)) return alert('Credit URL is invalid (must start with http:// or https://)');
    tempProjectCredits[idx] = { name: name, url: url || null };
    editingProjectCreditIndex = -1;
    renderProjectCreditsUI();
  }

  function cancelEditProjectCredit(idx) {
    editingProjectCreditIndex = -1;
    renderProjectCreditsUI();
  }
  }

  // App settings (persisted separately)
  var appSettings = { alwaysExpandKits: false };
  // Preference: when true, app will only use localStorage and not attempt to load hosted Projects/Materials
  appSettings.localStorageOnly = (typeof appSettings.localStorageOnly === 'undefined') ? true : !!appSettings.localStorageOnly;
  // ensure currency default and dismissed warnings exist
  appSettings.currencyDefault = appSettings.currencyDefault || 'USD';
  appSettings.dismissedCurrencyWarnings = appSettings.dismissedCurrencyWarnings || [];
  function loadAppSettings() { try { var s = getStorageItem('boManagerSettings'); if (s) { appSettings = JSON.parse(s); } } catch(e) { appSettings = { alwaysExpandKits:false }; } // reflect settings UI if present
    try { var el = document.getElementById('settingAlwaysExpandKits'); if (el) el.checked = !!appSettings.alwaysExpandKits; } catch(e){}
    try { var curEl = document.getElementById('appDefaultCurrency'); if (curEl) curEl.value = appSettings.currencyDefault || 'USD'; } catch(e){}
  }
  function saveAppSettings() { try { setStorageItem('boManagerSettings', JSON.stringify(appSettings)); } catch(e) { console.warn('Failed to save settings', e); } }
  function changeDefaultCurrency(cur) { if (!cur) return; appSettings.currencyDefault = cur; saveAppSettings(); // re-render lists to reflect default currency usage where applicable
    try { renderMaterials(); renderProjects(); renderInventory(); } catch(e){} }
  function toggleAlwaysExpandKits(el) { appSettings.alwaysExpandKits = !!el.checked; saveAppSettings(); }

  // Image settings persistence
  var imageSettings = { maxDimension: 800, jpegQuality: 0.85 };
  // Compatibility setting: force non-WebP output (defaults to true for compatibility)
  var compatibilitySettings = { forceNonWebpOutput: true };
  function loadImageSettings() { try { var s = localStorage.getItem('bomPlannerImageSettings'); if (s) imageSettings = JSON.parse(s); } catch(e){} // ensure defaults
    try { var s = getStorageItem('boManagerImageSettings'); if (s) imageSettings = JSON.parse(s); } catch(e){} // ensure defaults
    // reflect UI if present
    try { var elMax = document.getElementById('imageMaxDimension'); if (elMax) elMax.value = imageSettings.maxDimension || 800; var elQ = document.getElementById('imageJpegQuality'); if (elQ) elQ.value = imageSettings.jpegQuality || 0.85; } catch(e){}
  }
  function saveImageSettings() { try { setStorageItem('boManagerImageSettings', JSON.stringify(imageSettings)); } catch(e){ console.warn('Failed to save image settings', e); } }

  // Embed settings persistence (auto-embed on startup, batch size)
  // Default to disabled to avoid any automatic network requests on startup.
  var embedSettings = { autoEmbedOnStartup: false, batchSize: 4 };
  function loadEmbedSettings() { try { var s = localStorage.getItem('bomPlannerEmbedSettings'); if (s) embedSettings = JSON.parse(s); } catch(e){} // ensure defaults
    try { var s = getStorageItem('boManagerEmbedSettings'); if (s) embedSettings = JSON.parse(s); } catch(e){} // ensure defaults
    try { var autoEl = document.getElementById('autoEmbedOnStartup'); if (autoEl) autoEl.checked = !!embedSettings.autoEmbedOnStartup; var batchEl = document.getElementById('embedBatchSize'); if (batchEl) batchEl.value = embedSettings.batchSize || 4; } catch(e){}
  }
  function loadCompatibilitySettings() { try { var s = localStorage.getItem('bomPlannerCompatibilitySettings'); if (s) compatibilitySettings = JSON.parse(s); } catch(e){} try { var s = getStorageItem('boManagerCompatibilitySettings'); if (s) compatibilitySettings = JSON.parse(s); } catch(e){} try { var el = document.getElementById('forceNonWebpOutput'); if (el) el.checked = !!compatibilitySettings.forceNonWebpOutput; } catch(e){} }
  function saveCompatibilitySettings() { try { setStorageItem('boManagerCompatibilitySettings', JSON.stringify(compatibilitySettings)); } catch(e){ console.warn('Failed to save compatibility settings', e); } }
  function saveEmbedSettings() { try { setStorageItem('boManagerEmbedSettings', JSON.stringify(embedSettings)); } catch(e){ console.warn('Failed to save embed settings', e); } }

  // --- Sources management ---
  function loadSources() {
    try { var s = getStorageItem('boManagerSources'); if (s) _sources = JSON.parse(s); else _sources = []; } catch(e) { _sources = []; }
  }

  function saveSources() { try { setStorageItem('boManagerSources', JSON.stringify(_sources)); } catch(e) { console.error('Failed to save sources', e); } }

  function showSettingsModal() {
    loadSources();
    renderSourcesList();
    // populate accent color input if available
    try { loadAccentColor(); var accentEl = document.getElementById('accentColorInput'); if (accentEl && appSettings && appSettings.accentColor) accentEl.value = appSettings.accentColor; } catch(e){}
    try { var curEl = document.getElementById('appDefaultCurrency'); if (curEl) curEl.value = appSettings.currencyDefault || 'USD'; } catch(e){}
    // reflect embed settings & compatibility into the modal
    try {
      var autoEl = document.getElementById('autoEmbedOnStartup'); if (autoEl) autoEl.checked = !!(embedSettings && embedSettings.autoEmbedOnStartup);
      var batchEl = document.getElementById('embedBatchSize'); if (batchEl) batchEl.value = (embedSettings && embedSettings.batchSize) || 4;
      // compatibility
      loadCompatibilitySettings();
      var forceEl = document.getElementById('forceNonWebpOutput'); if (forceEl) forceEl.checked = !!(compatibilitySettings && compatibilitySettings.forceNonWebpOutput);
      if (autoEl) {
        autoEl.onchange = function(){ embedSettings.autoEmbedOnStartup = !!autoEl.checked; saveEmbedSettings(); };
      }
      if (batchEl) {
        batchEl.onchange = function(){ var v = parseInt(batchEl.value) || 4; embedSettings.batchSize = v; saveEmbedSettings(); };
      }
      if (forceEl) {
        forceEl.onchange = function(){ compatibilitySettings.forceNonWebpOutput = !!forceEl.checked; saveCompatibilitySettings(); };
      }
  // localStorage-only UI removed — app avoids any automatic network requests by default
    } catch(e){}
    openModal('settingsModal');
  }

  // Hosted-loading code removed per user request

  function renderSourcesList() {
    var el = document.getElementById('sourcesList'); if (!el) return; if (!_sources || _sources.length === 0) { el.innerHTML = '<div style="color:#999; padding:8px;">No sources saved</div>'; return; }
      el.innerHTML = _sources.map(function(s, i){ return '<div style="border-bottom:1px solid #222; padding:8px; display:flex; align-items:center; justify-content:space-between;">' +
      '<div style="display:flex; gap:10px; align-items:center;">' +
        '<img src="' + escapeHtml(s.iconURL || '') + '" alt="" style="width:36px;height:36px;border-radius:6px;object-fit:cover;display:' + (s.iconURL ? 'block' : 'none') + ';">' +
        '<div><div style="font-weight:600;">' + escapeHtml(s.name || s.url) + '</div><div style="font-size:12px;color:#999;">' + escapeHtml(s.subtitle || s.website || '') + (s.fetchedAt ? (' &nbsp; <span style="font-size:11px;color:#666;">(fetched ' + escapeHtml((s.fetchedAt||'').split('T')[0]) + ')</span>') : '') + '</div></div>' +
      '</div>' +
      '<div style="display:flex; gap:8px;">' +
        '<button class="btn btn-secondary btn-small" onclick="refreshSourceMetadata(' + i + ')">Refresh</button>' +
        '<button class="btn btn-secondary btn-small" onclick="fetchSourceAndPreview(' + i + ')">Fetch & Preview</button>' +
        '<button class="btn btn-secondary btn-small" onclick="removeSource(' + i + ')">Remove</button>' +
      '</div>' +
    '</div>'; }).join('');
  }

  function addSourceFromInput() {
    var url = (document.getElementById('sourceUrlInput') && document.getElementById('sourceUrlInput').value.trim()) || '';
    if (!url) { alert('Enter a source URL'); return; }
    if (!/^https?:\/\//i.test(url)) { alert('Source URL must be http(s)'); return; }
    // Add placeholder entry; fetch will populate metadata
    _sources = _sources || [];
    if (_sources.find(function(s){ return s.url === url; })) { alert('Source already added'); return; }
    _sources.push({ url: url, name: url });
    saveSources(); renderSourcesList(); document.getElementById('sourceUrlInput') && (document.getElementById('sourceUrlInput').value = '');
  }

  function removeSource(index) { if (!confirm('Remove this source?')) return; _sources.splice(index,1); saveSources(); renderSourcesList(); }

  function fetchSourceAndPreview(index) {
    var src = _sources[index]; if (!src) return; fetchSourceAndPreviewUrl(src.url);
  }

  function fetchAndPreviewSource() {
    var url = (document.getElementById('sourceUrlInput') && document.getElementById('sourceUrlInput').value.trim()) || '';
    if (!url) { alert('Enter a source URL'); return; }
    fetchSourceAndPreviewUrl(url);
  }

  function fetchSourceAndPreviewUrl(url) {
    // fetch remote JSON and attempt to extract projects/materials arrays for preview
    fetch(url).then(function(resp){ if (!resp.ok) throw new Error('Network error ' + resp.status); return resp.json(); }).then(function(data){
      // extract candidate arrays
      var projects = Array.isArray(data.projects) ? data.projects : [];
      var materials = Array.isArray(data.materials) ? data.materials : [];
      // if the source uses 'apps' like altstore, try to map
      if ((!projects || projects.length === 0) && Array.isArray(data.apps) && data.apps.length) {
        // map apps to materials (best-effort)
        materials = data.apps.map(function(a){ return { name: a.name || a.title || a.id || 'Untitled', url: a.url || a.link || '', pricePer: a.pricePer || 0, vendor: a.vendor || 'amazon', currency: a.currency || 'USD', description: a.description || '' }; });
      }

      // helper to find an image field on an item
      function findImageField(item){ if (!item) return null; return item.thumbnail || item.icon || item.iconURL || item.logo || item.image || null; }

      // Build embedding promises for all detected remote images (projects + materials)
      var embedPromises = [];
      [ { arr: projects, type: 'projects' }, { arr: materials, type: 'materials' } ].forEach(function(group){ if (!Array.isArray(group.arr)) return; group.arr.forEach(function(item){ var imgUrl = findImageField(item); if (!imgUrl) return; // attempt to download & resize/convert; on success set thumbnailDataUrl to embedded dataURL; on failure preserve original URL
          var p = resizeImageFromUrl(imgUrl, 800).then(function(dataUrl){ item.thumbnailDataUrl = dataUrl; }).catch(function(err){ console.warn('Failed to embed remote image', imgUrl, err); item.thumbnailDataUrl = imgUrl; }); embedPromises.push(p); }); });

      // wait for all embedding attempts to finish (they may fail due to CORS), then preview
      Promise.all(embedPromises).then(function(){ if (projects && projects.length > 0) { showImportPreview('projects', projects); } else if (materials && materials.length > 0) { showImportPreview('materials', materials); } else { alert('Source did not contain recognizable "projects" or "materials" arrays'); } }).catch(function(){ // even if some embedding rejected, still show preview
        if (projects && projects.length > 0) { showImportPreview('projects', projects); } else if (materials && materials.length > 0) { showImportPreview('materials', materials); } else { alert('Source did not contain recognizable "projects" or "materials" arrays'); } });
    }).catch(function(err){ alert('Failed to fetch source: ' + (err && err.message ? err.message : String(err))); });
  }

  // Refresh metadata for a single saved source (fetch and store name/subtitle/iconURL)
  function refreshSourceMetadata(index) {
    loadSources();
    var src = _sources && _sources[index];
    if (!src || !src.url) { alert('Source not found'); return; }
    fetch(src.url).then(function(resp){ if (!resp.ok) throw new Error('Network error ' + resp.status); return resp.json(); }).then(function(data){
      // Best-effort metadata mapping
      var name = data.name || data.title || data.label || data.manifestName || src.url;
      var subtitle = data.subtitle || data.description || data.summary || '';
      var icon = data.icon || data.iconURL || data.logo || data.image || '';
      src.name = name;
      src.subtitle = subtitle;
      src.fetchedAt = new Date().toISOString();
      src.lastError = null;
      // Attempt to download & embed icon/logo into a data URL (overwrite previous icon if successful)
      if (icon) {
        resizeImageFromUrl(icon, 800).then(function(dataUrl){ src.iconURL = dataUrl; saveSources(); renderSourcesList(); alert('Source metadata refreshed and icon embedded: ' + name); }).catch(function(err){ console.warn('Failed to embed source icon', icon, err); src.iconURL = icon; saveSources(); renderSourcesList(); alert('Source metadata refreshed (icon could not be embedded): ' + name); });
      } else {
        saveSources(); renderSourcesList(); alert('Source metadata refreshed: ' + name);
      }
    }).catch(function(err){ src.lastError = err && err.message ? err.message : String(err); saveSources(); renderSourcesList(); alert('Failed to refresh source metadata: ' + (err && err.message ? err.message : String(err))); });
  }

  // Refresh metadata for all saved sources (runs in parallel)
  function refreshAllSources() {
    loadSources();
    if (!_sources || _sources.length === 0) { alert('No saved sources to refresh'); return; }
    var promises = _sources.map(function(s, idx){ return fetch(s.url).then(function(resp){ if (!resp.ok) throw new Error('Network error ' + resp.status); return resp.json(); }).then(function(data){ s.name = data.name || data.title || data.label || s.url; s.subtitle = data.subtitle || data.description || data.summary || ''; s.iconURL = s.iconURL || data.icon || data.iconURL || data.logo || data.image || ''; s.fetchedAt = new Date().toISOString(); }).catch(function(err){ console.warn('Failed to refresh', s.url, err); }); });
    Promise.all(promises).then(function(){ saveSources(); renderSourcesList(); alert('Refreshed metadata for saved sources (errors ignored)'); }).catch(function(){ saveSources(); renderSourcesList(); alert('Completed refresh (some sources may have failed)'); });
  }

  function setupEventListeners() {
    document.querySelectorAll('.sidebar-tab').forEach(function(tab){
      tab.addEventListener('click', function(){ switchTab(tab.dataset.tab); });
    });

    document.addEventListener('keydown', function(e){
      var tagInput = document.getElementById('projectTagInput');
      if (!tagInput) return;
      if (document.getElementById('projectModal') && document.getElementById('projectModal').classList.contains('active') && document.activeElement === tagInput) {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          addProjectTagFromInput();
        }
      }
    });

    // Defensive bindings for thumbnail file inputs and labels
    try {
      // Ensure change listeners are attached for project thumbnail
      var projFile = document.getElementById('projectThumbnailFile');
      if (projFile && !projFile._hasBoundChange) {
        projFile.addEventListener('change', function(e){ var f = e.target.files[0]; if (!f) return; resizeImageFile(f, 800).then(function(dataUrl){ var preview = document.getElementById('projectThumbnailPreview'); if (preview) { preview.src = dataUrl; preview.style.display = 'block'; } }).catch(function(err){ console.warn('Thumbnail resize failed', err); var reader = new FileReader(); reader.onload = function(ev){ var url = ev.target.result; var preview = document.getElementById('projectThumbnailPreview'); if (preview) { preview.src = url; preview.style.display = 'block'; } }; reader.readAsDataURL(f); }); });
        projFile._hasBoundChange = true;
      }
      // Ensure change listeners are attached for material thumbnail
      var matFile = document.getElementById('materialThumbnailFile');
      if (matFile && !matFile._hasBoundChange) {
        matFile.addEventListener('change', function(e){ var f = e.target.files[0]; if (!f) return; resizeImageFile(f, 800).then(function(dataUrl){ var preview = document.getElementById('materialThumbnailPreview'); if (preview) { preview.src = dataUrl; preview.style.display = 'block'; } }).catch(function(err){ console.warn('Thumbnail resize failed', err); var reader = new FileReader(); reader.onload = function(ev){ var url = ev.target.result; var preview = document.getElementById('materialThumbnailPreview'); if (preview) { preview.src = url; preview.style.display = 'block'; } }; reader.readAsDataURL(f); }); });
        matFile._hasBoundChange = true;
      }
      // Also ensure label elements (Choose Image) act as clickable fallbacks
  // Rely on native <label for="..."> behavior to trigger file inputs; avoid programmatic .click() which can open dialogs twice
  var projLabel = document.querySelector('label[for="projectThumbnailFile"]');
  if (projLabel) projLabel._hasBoundClick = true;
  var matLabel = document.querySelector('label[for="materialThumbnailFile"]');
  if (matLabel) matLabel._hasBoundClick = true;
    } catch (e) { console.warn('Failed to bind thumbnail inputs/labels', e); }

    var mobileMenuToggle = document.getElementById('mobileMenuToggle');
    if (mobileMenuToggle) mobileMenuToggle.addEventListener('click', toggleSidebar);
    var menuToggle = document.getElementById('menuToggle');
    if (menuToggle) menuToggle.addEventListener('click', toggleSidebar);
    var hamburgerOverlay = document.getElementById('hamburgerOverlay');
    if (hamburgerOverlay) hamburgerOverlay.addEventListener('click', toggleSidebar);

    // Import hidden inputs
    if (!document.getElementById('importFile')) {
      var importInput = document.createElement('input');
      importInput.type = 'file';
      importInput.accept = '.json';
      importInput.style.display = 'none';
      importInput.id = 'importFile';
      importInput.addEventListener('change', handleImport);
      document.body.appendChild(importInput);
    }

  // image settings inputs
  var imgMaxEl = document.getElementById('imageMaxDimension'); if (imgMaxEl) { imgMaxEl.addEventListener('change', function(e){ var v = parseInt(e.target.value) || 800; imageSettings.maxDimension = Math.max(64, Math.min(4096, v)); saveImageSettings(); }); }
  var imgQEl = document.getElementById('imageJpegQuality'); if (imgQEl) { imgQEl.addEventListener('change', function(e){ var v = parseFloat(e.target.value); if (isNaN(v) || v < 0.5) v = 0.5; if (v > 1) v = 1; imageSettings.jpegQuality = v; saveImageSettings(); }); }

  // embed settings inputs
  var autoEmbedEl = document.getElementById('autoEmbedOnStartup'); if (autoEmbedEl) { autoEmbedEl.addEventListener('change', function(e){ embedSettings.autoEmbedOnStartup = !!e.target.checked; saveEmbedSettings(); }); }
  var batchSizeEl = document.getElementById('embedBatchSize'); if (batchSizeEl) { batchSizeEl.addEventListener('change', function(e){ var n = parseInt(e.target.value) || 6; embedSettings.batchSize = Math.max(1, Math.min(50, n)); saveEmbedSettings(); }); }

    if (!document.getElementById('importMaterialsFile')) {
      var importMaterialsInput = document.createElement('input');
      importMaterialsInput.type = 'file';
      importMaterialsInput.accept = '.json';
      importMaterialsInput.style.display = 'none';
      importMaterialsInput.id = 'importMaterialsFile';
      importMaterialsInput.addEventListener('change', handleMaterialsImport);
      document.body.appendChild(importMaterialsInput);
    }

    var materialIsPackEl = document.getElementById('materialIsPack');
    if (materialIsPackEl) {
      materialIsPackEl.addEventListener('change', function(e){
        // delegate actual UI state changes to updateMaterialPackUI so other code paths can reuse it
        try { updateMaterialPackUI(); } catch (err) { console.warn('updateMaterialPackUI error', err); }
      });
    }

    // BOM lookup handlers (delegated inputs below)
    document.addEventListener('input', function(e){
      if (e.target && e.target.id === 'bomMaterialLookup') {
        var q = e.target.value.trim().toLowerCase();
        var vendor = e.target.dataset.vendor || null;
        if (!q) { renderBomLookupDropdown([]); return; }
        var results = appData.materials.filter(function(m){
          if (vendor && m.vendor !== vendor) return false;
          return m.name.toLowerCase().includes(q) || (m.description && m.description.toLowerCase().includes(q));
        }).slice(0,50);
        renderBomLookupDropdown(results);
      }
    });

    // BOM keyboard navigation
    document.addEventListener('keydown', function(e){
      var dropdown = document.getElementById('bomMaterialDropdown');
      if (!dropdown || dropdown.style.display === 'none') return;
      if (document.activeElement && document.activeElement.id === 'bomMaterialLookup') {
        if (e.key === 'ArrowDown') { e.preventDefault(); bomLookupIndex = Math.min(bomLookupIndex + 1, bomLookupResults.length - 1); highlightBomLookup(bomLookupIndex); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); bomLookupIndex = Math.max(bomLookupIndex - 1, 0); highlightBomLookup(bomLookupIndex); }
        else if (e.key === 'Enter') { e.preventDefault(); if (bomLookupIndex >= 0) selectBomLookup(bomLookupIndex); }
        else if (e.key === 'Escape') { renderBomLookupDropdown([]); }
      }
    });

    // Delegated click handler for BOM lookup dropdown
    try {
      var bomDropdown = document.getElementById('bomMaterialDropdown');
      if (bomDropdown && !bomDropdown._hasClick) {
        bomDropdown.addEventListener('click', function(ev){
          var el = ev.target;
          while (el && el !== bomDropdown && !el.classList.contains('lookup-item')) el = el.parentNode;
          if (!el || el === bomDropdown) return;
          var idx = el.getAttribute('data-idx'); if (!idx) return; try { selectBomLookup(parseInt(idx)); } catch(e) { console.warn('selectBomLookup failed', e); }
        });
        bomDropdown._hasClick = true;
      }
    } catch(e) { console.warn('Failed to attach bom dropdown click handler', e); }

    // Tag autocomplete: attach input listener for materialTagsInput
    var materialTagsInput = document.getElementById('materialTagsInput');
    if (materialTagsInput) {
      // create dropdown container
      var tagDropdown = document.createElement('div'); tagDropdown.id = 'materialTagDropdown'; tagDropdown.className = 'lookup-dropdown'; tagDropdown.style.display = 'none'; tagDropdown.style.position = 'absolute'; tagDropdown.style.zIndex = 9999; tagDropdown.style.background = '#0f0f0f'; tagDropdown.style.border = '1px solid #222'; tagDropdown.style.padding = '6px'; tagDropdown.style.borderRadius = '6px';
      document.body.appendChild(tagDropdown);
      materialTagsInput.addEventListener('input', function(e){ renderTagSuggestions(e.target.value); });
      materialTagsInput.addEventListener('keydown', function(e){ if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') e.stopPropagation(); });
      materialTagsInput.addEventListener('blur', function(){ setTimeout(function(){ var dd = document.getElementById('materialTagDropdown'); if (dd) dd.style.display = 'none'; }, 200); });
    }

    // Delegated click handler for Project Needs actions (Add as Material / Add to BOM)
    try {
      var projectNeedsList = document.getElementById('projectNeedsList');
      if (projectNeedsList && !projectNeedsList._hasNeedsHandler) {
        projectNeedsList.addEventListener('click', function(e){
          var btn = e.target;
          // walk up to button if inner text element clicked
          while (btn && btn !== projectNeedsList && btn.tagName !== 'BUTTON') btn = btn.parentNode;
          if (!btn || btn === projectNeedsList) return;
          var action = btn.getAttribute('data-action');
          if (!action) return;
          if (action === 'addToBOM') {
            var id = btn.getAttribute('data-id'); if (!id) return; try { window.addInventoryToCurrentProject(id); } catch(err){ console.warn('addInventoryToCurrentProject failed', err); }
          } else if (action === 'removeFromBOM') {
            var vendor = btn.getAttribute('data-vendor'); var vIdx = parseInt(btn.getAttribute('data-vendor-index')); if (!vendor || isNaN(vIdx)) return; try { 
              var proj = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; }); if (!proj || !proj.boms || !proj.boms[vendor]) return; proj.boms[vendor].splice(vIdx,1); saveData(); try { renderBOMs(); } catch(e){} try { renderInventory(); } catch(e){} try { renderMaterials(); } catch(e){} } catch(err){ console.warn('removeFromBOM failed', err); }
          } else if (action === 'prefillMissing') {
            var idx = parseInt(btn.getAttribute('data-idx')); if (isNaN(idx)) return; try { window.prefillMaterialFromMissing(idx); } catch(err){ console.warn('prefillMaterialFromMissing failed', err); }
          } else if (action === 'showSettings') {
            try { showSettingsModal(); } catch(e) { console.warn('showSettingsModal not available', e); }
          }
        });
        projectNeedsList._hasNeedsHandler = true;
      }
    } catch(e) { console.warn('Failed to attach delegated project needs handler', e); }

    // Attach thumbnail file inputs (project and material) change handlers if not already attached elsewhere
    var projectFileInp = document.getElementById('projectThumbnailFile');
    if (projectFileInp && !projectFileInp._attached) {
      projectFileInp.addEventListener('change', function(e){ var f = e.target.files[0]; if (!f) return; resizeImageFile(f, imageSettings.maxDimension).then(function(dataUrl){ var preview = document.getElementById('projectThumbnailPreview'); if (preview) { preview.src = dataUrl; preview.style.display = 'block'; } }).catch(function(err){ console.warn('Project thumbnail resize failed', err); var reader = new FileReader(); reader.onload = function(ev){ var url = ev.target.result; var preview = document.getElementById('projectThumbnailPreview'); if (preview) { preview.src = url; preview.style.display = 'block'; } }; reader.readAsDataURL(f); }); });
      projectFileInp._attached = true;
    }

    var materialFileInp = document.getElementById('materialThumbnailFile');
    if (materialFileInp && !materialFileInp._attached) {
      materialFileInp.addEventListener('change', function(e){ var f = e.target.files[0]; if (!f) return; resizeImageFile(f, imageSettings.maxDimension).then(function(dataUrl){ var preview = document.getElementById('materialThumbnailPreview'); if (preview) { preview.src = dataUrl; preview.style.display = 'block'; } }).catch(function(err){ console.warn('Material thumbnail resize failed', err); var reader = new FileReader(); reader.onload = function(ev){ var url = ev.target.result; var preview = document.getElementById('materialThumbnailPreview'); if (preview) { preview.src = url; preview.style.display = 'block'; } }; reader.readAsDataURL(f); }); });
      materialFileInp._attached = true;
    }
  }

  // Vendor collapse/expand toggles used by project BOM sections
  function toggleVendor(vendor) {
    var body = document.getElementById(vendor + 'Body');
    var btn = document.getElementById(vendor + 'Toggle');
    if (!body || !btn) return;
    if (body.style.display === 'none' || body.style.display === '') {
      body.style.display = 'block';
      btn.textContent = 'Collapse';
    } else {
      body.style.display = 'none';
      btn.textContent = 'Expand';
    }
  }

  // Shipping editor toggles: show/hide inline shipping editor for a vendor
  function toggleShippingEditor(vendor) {
    var editor = document.getElementById(vendor + 'ShippingEditor');
    var toggleBtn = document.getElementById(vendor + 'ShippingToggleBtn');
    if (!editor) {
      // fallback: the inline editor uses id like amazonShippingEditor (without vendor prefix)
      editor = document.getElementById(vendor + 'ShippingEditor') || document.getElementById(vendor + 'ShippingEditor');
    }
    // in our markup the editor ID is e.g. amazonShippingEditor (lowercase)
    editor = document.getElementById(vendor + 'ShippingEditor') || document.getElementById(vendor + 'ShippingEditor');
    var inline = document.getElementById(vendor + 'ShippingEditor') || document.getElementById(vendor + 'ShippingEditor');
    var inlineAlt = document.getElementById(vendor + 'ShippingEditor');
    var inlineId = vendor + 'ShippingEditor';
    // Actual inline element in index.html is id like 'amazonShippingEditor' (we also have amazonShippingInline input)
    var editorEl = document.getElementById(vendor + 'ShippingEditor');
    if (!editorEl) {
      // try older id pattern used in markup: vendorShippingEditor may not exist, instead we have vendorShippingInline and vendorShippingToggleBtn; so toggle the container with id like 'amazonShippingEditor' (already tried)
      // Fallback: find element by id vendor + 'ShippingEditor' or vendor + 'ShippingEditor'
      // If not found, try vendor + 'ShippingInline' container
      editorEl = document.getElementById(vendor + 'ShippingEditor') || document.getElementById(vendor + 'ShippingEditor');
    }
    // Simpler: toggle the visible block with id vendor + 'ShippingEditor' or the block with id vendor + 'ShippingEditor' isn't present in markup; we have vendor + 'ShippingEditor' as 'amazonShippingEditor' in markup? Actually markup uses 'amazonShippingEditor' element id 'amazonShippingEditor' does not exist; the inline block is 'amazonShippingEditor' absent, but there is 'amazonShippingEditor' comment.
    // Instead we will toggle the small inline editor with id vendor + 'ShippingEditor' or if missing toggle vendor + 'ShippingEditor' (no-op safe)
    var shippingEditor = document.getElementById(vendor + 'ShippingEditor') || document.getElementById(vendor + 'ShippingEditor');
    // Fallback: use the specific inline container id from markup which is vendor + 'ShippingEditor' (not present) — so instead toggle the element with id vendor + 'ShippingEditor' spelled exactly as in HTML: vendor + 'ShippingEditor' isn't present; but the markup defines e.g. id="amazonShippingEditor" — so use that.
    shippingEditor = document.getElementById(vendor + 'ShippingEditor') || document.getElementById(vendor + 'ShippingEditor') || document.getElementById(vendor + 'ShippingEditor');
    // Bruteforce: try known inline id patterns
    shippingEditor = shippingEditor || document.getElementById(vendor + 'ShippingEditor') || document.getElementById(vendor + 'ShippingEditor');
    // Finally, try the inline id used in markup: vendor + 'ShippingEditor' (we tried many times)
    shippingEditor = document.getElementById(vendor + 'ShippingEditor') || document.getElementById(vendor + 'ShippingEditor');
    // If we still don't have it, try the specific id with vendor + 'ShippingEditor' exact
    if (!shippingEditor) {
      // attempt to locate the input by id vendor + 'ShippingInline' and toggle its parent
      var inlineInput = document.getElementById(vendor + 'ShippingInline');
      if (inlineInput && inlineInput.parentElement) {
        inlineInput.parentElement.style.display = inlineInput.parentElement.style.display === 'none' ? 'block' : 'none';
        return;
      }
      return; // nothing to toggle
    }
    shippingEditor.style.display = (shippingEditor.style.display === 'none' || shippingEditor.style.display === '') ? 'block' : 'none';
  }

  function saveShipping(vendor) {
    var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; }); if (!project) return; project.shipping = project.shipping || {};
    var input = document.getElementById(vendor + 'ShippingInline');
    if (!input) return alert('Shipping input not found');
    var v = parseFloat(input.value) || 0; project.shipping[vendor] = v; saveData(); renderBOMs();
    // hide editor after save
    var editor = document.getElementById(vendor + 'ShippingEditor'); if (editor) editor.style.display = 'none';
  }

  function cancelShipping(vendor) { var editor = document.getElementById(vendor + 'ShippingEditor'); if (editor) editor.style.display = 'none'; }

  // Ensure new handlers are available on window for inline onclicks
  try { if (typeof window !== 'undefined') { window.toggleVendor = toggleVendor; window.toggleShippingEditor = toggleShippingEditor; window.saveShipping = saveShipping; window.cancelShipping = cancelShipping; } } catch(e) {}

  // Helper: show/hide pack options and disable single-item fields when pack-mode is active
  function updateMaterialPackUI() {
    var isPackEl = document.getElementById('materialIsPack');
    var opts = document.getElementById('materialPackOptions');
    var singlePackSize = document.getElementById('materialPackSize');
    if (!isPackEl) return;
    var checked = !!isPackEl.checked;
    if (opts) opts.style.display = checked ? 'block' : 'none';
    // Disable the top-level single-item pack size field when pack-mode is enabled to avoid confusion
    if (singlePackSize) {
      singlePackSize.disabled = checked;
      if (checked) {
        singlePackSize.classList && singlePackSize.classList.add('disabled');
      } else {
        singlePackSize.classList && singlePackSize.classList.remove('disabled');
      }
    }
  }

  // Copy example JSON blocks to clipboard
  function copyExampleJson(which) {
    try {
      var el = which === 'materials' ? document.getElementById('exampleMaterialsJson') : document.getElementById('exampleProjectsJson');
      if (!el) return alert('Example not found');
      var text = el.textContent || el.innerText || '';
      navigator.clipboard.writeText(text).then(function(){ alert('Example JSON copied to clipboard'); }).catch(function(){ prompt('Copy the JSON below and press Ctrl/Cmd+C', text); });
    } catch (e) { prompt('Copy the JSON below', el ? el.textContent : ''); }
  }

  // Gather existing tags from materials and show suggestions based on current input
  function gatherMaterialTags() {
    var all = {};
    (appData.materials || []).forEach(function(m){ if (Array.isArray(m.tags)) m.tags.forEach(function(t){ all[t] = true; }); });
    return Object.keys(all).sort();
  }

  function renderTagSuggestions(currentValue) {
    var input = document.getElementById('materialTagsInput'); if (!input) return;
    var dropdown = document.getElementById('materialTagDropdown'); if (!dropdown) return;
    var caret = input.getBoundingClientRect(); dropdown.style.left = (caret.left) + 'px'; dropdown.style.top = (caret.bottom + 6) + 'px'; dropdown.style.minWidth = (caret.width) + 'px';
    var lastFragment = (currentValue || '').split(',').pop().trim().toLowerCase();
    var candidates = gatherMaterialTags().filter(function(t){ return lastFragment === '' || t.toLowerCase().indexOf(lastFragment) === 0; }).slice(0,10);
    if (!candidates || candidates.length === 0) { dropdown.style.display = 'none'; dropdown.innerHTML = ''; return; }
    dropdown.innerHTML = candidates.map(function(t){ return '<div class="lookup-item" style="padding:6px; cursor:pointer;" onclick="applyTagSuggestion(\'' + escapeHtml(t).replace(/'/g, "\\'") + '\')">' + escapeHtml(t) + '</div>'; }).join('');
    dropdown.style.display = 'block';
  }

  function applyTagSuggestion(tag) {
    var input = document.getElementById('materialTagsInput'); if (!input) return;
    var parts = input.value.split(','); parts[parts.length - 1] = ' ' + tag; // replace last fragment
    input.value = parts.map(function(p){ return p.trim(); }).filter(function(p){ return p; }).join(',');
    var dd = document.getElementById('materialTagDropdown'); if (dd) dd.style.display = 'none';
  }

  // Sidebar/tab helpers
  function switchTab(tabName) {
    document.querySelectorAll('.sidebar-tab').forEach(function(t){ t.classList.remove('active'); });
    var sel = document.querySelector('[data-tab="' + tabName + '"]');
    if (sel) sel.classList.add('active');
    var projectsTab = document.getElementById('projectsTab');
    var materialsTab = document.getElementById('materialsTab');
    if (projectsTab) projectsTab.style.display = tabName === 'projects' ? 'block' : 'none';
    if (materialsTab) materialsTab.style.display = tabName === 'materials' ? 'block' : 'none';
  }

  // Main content view switcher (project view vs inventory moved to main)
  function switchMainView(view) {
    var projectView = document.getElementById('projectView');
    var inventoryMain = document.getElementById('inventoryMain');
    var mainTabProject = document.getElementById('mainTabProject');
    var mainTabInventory = document.getElementById('mainTabInventory');
    var galleryView = document.getElementById('galleryView');
    var mainTabGallery = document.getElementById('mainTabGallery');

    // small helper to animate between panes while respecting reduced-motion
    function animateSwitch(fromEl, toEl) {
      var reduced = (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      var dur = reduced ? 0 : 220;
      if (fromEl && fromEl !== toEl) {
        try {
          fromEl.style.transition = 'opacity ' + dur + 'ms ease, transform ' + dur + 'ms ease';
          fromEl.style.opacity = '0';
          fromEl.style.transform = 'translateY(6px)';
          setTimeout(function() { try { fromEl.style.display = 'none'; fromEl.style.transition = ''; fromEl.style.transform = ''; } catch(e){} }, dur + 30);
        } catch (e) { fromEl.style.display = 'none'; }
      }
      if (toEl) {
        try {
          toEl.style.display = 'block';
          // prepare for animate in
          toEl.style.opacity = '0';
          toEl.style.transform = 'translateY(6px)';
          // force reflow
          void toEl.offsetWidth;
          toEl.style.transition = 'opacity ' + dur + 'ms ease, transform ' + dur + 'ms ease';
          toEl.style.opacity = '1';
          toEl.style.transform = 'translateY(0)';
          setTimeout(function() { try { toEl.style.transition = ''; toEl.style.transform = ''; } catch(e){} }, dur + 30);
        } catch (e) { toEl.style.display = 'block'; }
      }
    }

    // Animate between project, inventory and gallery panes
    if (view === 'project') {
      // prefer the currently visible pane as the 'from' element
      var fromEl = (inventoryMain && inventoryMain.style.display !== 'none') ? inventoryMain : (galleryView && galleryView.style.display !== 'none' ? galleryView : inventoryMain);
      animateSwitch(fromEl, projectView);
    } else if (view === 'inventory') {
      var fromEl = (projectView && projectView.style.display !== 'none') ? projectView : (galleryView && galleryView.style.display !== 'none' ? galleryView : projectView);
      animateSwitch(fromEl, inventoryMain);
    } else if (view === 'gallery') {
      var fromEl = (projectView && projectView.style.display !== 'none') ? projectView : inventoryMain;
      animateSwitch(fromEl, galleryView);
    }

    if (mainTabProject) mainTabProject.classList.toggle('active', view === 'project');
    if (mainTabInventory) mainTabInventory.classList.toggle('active', view === 'inventory');
  if (mainTabGallery) mainTabGallery.classList.toggle('active', view === 'gallery');
    if (mainTabProject) mainTabProject.setAttribute('aria-selected', view === 'project' ? 'true' : 'false');
    if (mainTabInventory) mainTabInventory.setAttribute('aria-selected', view === 'inventory' ? 'true' : 'false');
  if (mainTabGallery) mainTabGallery.setAttribute('aria-selected', view === 'gallery' ? 'true' : 'false');

    if (view === 'inventory') {
      // ensure inventory list rendered when shown
      renderInventory();
      // also render any inventory notes
      if (typeof renderInventoryNotes === 'function') renderInventoryNotes();
      // render printed parts inventory as well
      try { renderPrintedPartsInventory(); } catch (e) { console.warn('renderPrintedPartsInventory failed', e); }
    }
    if (view === 'gallery') {
      // ensure gallery is rendered when shown
      try { renderGallery(); } catch (e) { console.warn('renderGallery failed', e); }
    }
  }

  function toggleSidebar() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('hamburgerOverlay');
    if (!sidebar) return;
    sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active');
  }

  // Persistence
  // Safe non-destructive migration: copy old bomPlanner* keys to boManager* keys if the latter do not exist.
  function migrateLocalStorageKeysIfNeeded() {
    try {
      // mapping of oldKey -> newKey
      var mapping = {
        'bomPlannerData': 'boManagerData',
        'bomPlannerSources': 'boManagerSources',
        'bomPlannerImageSettings': 'boManagerImageSettings',
        'bomPlannerEmbedSettings': 'boManagerEmbedSettings'
      };
      Object.keys(mapping).forEach(function(oldKey){ var newKey = mapping[oldKey]; try { var existing = localStorage.getItem(newKey); if (!existing) { var val = localStorage.getItem(oldKey); if (val !== null) { localStorage.setItem(newKey, val); console.info('Migrated', oldKey, '->', newKey); } } } catch(e){} });
    } catch (e) { console.warn('Migration helper failed', e); }
  }

  // Generate RFC4122 v4 UUID (returns string)
  function generateUUID() {
    // From https://stackoverflow.com/a/2117523/ many browsers
    try {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    } catch (e) {
      // Fallback simple unique id
      return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
    }
  }

  // Migration: assign UUIDs to any existing projects or materials that lack a stable id.
  // This runs once at startup and will persist changes if any were made.
  function migrateMissingIds() {
    try {
      var assigned = 0;
      if (appData.projects && Array.isArray(appData.projects)) {
        appData.projects.forEach(function(p){ if (!p) return; if (!p.id) { p.id = generateUUID(); assigned++; } });
      }
      if (appData.materials && Array.isArray(appData.materials)) {
        appData.materials.forEach(function(m){ if (!m) return; if (!m.id) { m.id = generateUUID(); assigned++; } });
      }
      if (assigned > 0) { saveData(); console.info('Assigned missing UUIDs to existing items:', assigned); }
      return assigned;
    } catch (e) { console.warn('migrateMissingIds failed', e); return 0; }
  }

  function saveData() {
    try { setStorageItem('boManagerData', JSON.stringify(appData)); } catch (e) { console.error('Failed to save data', e); }
  }

  function loadData() {
    try { var saved = getStorageItem('boManagerData'); if (saved) { appData = JSON.parse(saved); } } catch (e) { console.error('Failed to load data', e); }
    try { // Eager migration: normalize gallery image entries into objects { src, note }
      migrateGalleryImageShapes();
    } catch(e) { /* ignore migration errors */ }
  }

  // Eager migration: convert legacy gallery image entries (strings or legacy objects)
  // into consistent objects { src: <dataUrlOrUrl>, note: '' }
  function migrateGalleryImageShapes() {
    try {
      var changed = false;
      (appData.projects || []).forEach(function(p){ if (!p || !Array.isArray(p.gallery)) return; p.gallery.forEach(function(entry){ if (!entry || !Array.isArray(entry.images)) return; for (var i=0;i<entry.images.length;i++){ var img = entry.images[i]; if (!img) continue; if (typeof img === 'string') { entry.images[i] = { src: img, note: '' }; changed = true; } else if (typeof img === 'object') { var src = img.src || img.image || img.data || img.dataUrl || img.thumbnail || ''; var note = img.note || img.caption || img.title || ''; if (!img.src && src) { img.src = src; changed = true; } if (typeof img.note === 'undefined') { img.note = note || ''; changed = true; } } } }); });
      if (changed) { saveData(); console.info('Migrated gallery image shapes for projects'); }
    } catch (e) { console.warn('migrateGalleryImageShapes failed', e); }
  }

  // wrapper helpers to prefer boManager keys but fallback to older bomPlanner keys
  function getStorageItem(preferredKey) {
    try {
      // if preferred exists, return it
      var v = localStorage.getItem(preferredKey); if (v !== null) return v;
      // fallback: map boManagerData -> bomPlannerData, boManagerSources -> bomPlannerSources, etc.
      var fallbackMap = { 'boManagerData':'bomPlannerData', 'boManagerSources':'bomPlannerSources', 'boManagerImageSettings':'bomPlannerImageSettings', 'boManagerEmbedSettings':'bomPlannerEmbedSettings' };
      var fb = fallbackMap[preferredKey]; if (fb) { var fv = localStorage.getItem(fb); if (fv !== null) return fv; }
    } catch (e) { console.warn('getStorageItem failed for', preferredKey, e); }
    return null;
  }

  function setStorageItem(preferredKey, value) {
    try {
      // always write to preferredKey (boManager*). Keep old keys untouched.
      localStorage.setItem(preferredKey, value);
    } catch (e) { console.warn('setStorageItem failed for', preferredKey, e); }
  }

  // Projects
  function renderProjects() {
    var list = document.getElementById('projectsList');
    if (!list) return;
    if (!appData.projects || appData.projects.length === 0) { list.innerHTML = '<div style="color: #666; text-align: center; padding: 20px;">No projects yet</div>'; return; }

    var sortBy = (document.getElementById('projectSortBy') && document.getElementById('projectSortBy').value) || 'date-desc';
    var sortedProjects = appData.projects.slice().sort(function(a,b){
      switch(sortBy){
        case 'date-desc': return (b.metadata.creationDate||'').localeCompare(a.metadata.creationDate||'');
        case 'date-asc': return (a.metadata.creationDate||'').localeCompare(b.metadata.creationDate||'');
        case 'name-asc': return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        case 'name-desc': return b.name.toLowerCase().localeCompare(a.name.toLowerCase());
        default: return 0;
      }
    });

    var missingCount = 0;
  // project search and mode
  var projectSearch = (document.getElementById('projectSearch') && document.getElementById('projectSearch').value.trim().toLowerCase()) || '';
  // Default search mode should be 'name' (user requested name-by-default). The UI no longer contains a combined 'both' option.
  var projectSearchMode = (document.getElementById('projectSearchMode') && document.getElementById('projectSearchMode').value) || 'name';
    var projectCurrencyFilter = (document.getElementById('projectCurrencyFilter') && document.getElementById('projectCurrencyFilter').value) || '';

    var filteredProjects = sortedProjects.filter(function(p){
      // currency filter: consider project.currency or fallback to app default
      var pCurrency = p.currency || (p.metadata && p.metadata.currency) || null;
      var matchesCurrency = !projectCurrencyFilter || (pCurrency && pCurrency === projectCurrencyFilter) || (!pCurrency && appSettings.currencyDefault === projectCurrencyFilter);
      if (!matchesCurrency) return false;
      if (!projectSearch) return true;
  var byName = p.name && p.name.toLowerCase().includes(projectSearch);
  var byTags = p.metadata && Array.isArray(p.metadata.tags) && p.metadata.tags.join(' ').toLowerCase().includes(projectSearch);
  if (projectSearchMode === 'tags') return byTags; // 'name' is the default; anything else falls back to name-first behavior
  return byName;
      return byName || byTags;
    });

    list.innerHTML = filteredProjects.map(function(p){
      var thumbHtml = '';
      if (p.thumbnailDataUrl) {
        // render image with onerror to hide broken images
        thumbHtml = '<img src="' + escapeHtml(p.thumbnailDataUrl) + '" onerror="this.style.display=\'none\';" style="width:36px;height:36px;border-radius:6px;object-fit:cover;margin-right:8px;">';
      } else {
        missingCount++;
      }
      // build meta html
      var meta = '<div class="project-meta">' + (p.metadata.creationDate || 'No date') + ' ' + ((p.metadata && p.metadata.tags) ? p.metadata.tags.map(function(t){ return '<span class="tag">' + escapeHtml(t) + '</span>'; }).join('') : '') + (p.currency ? (' • ' + escapeHtml(p.currency)) : '') + '</div>';
      return '<div class="project-item ' + (p.id === appData.currentProjectId ? 'active' : '') + '" onclick="selectProject(\'' + p.id + '\')">' +
        '<div style="display:flex; align-items:center; gap:8px;">' + thumbHtml + '<div>' +
        '<div class="project-name">' + escapeHtml(p.name) + '</div>' + meta + '</div></div>' +
      '</div>';
    }).join('');
    // append footer with missing thumbnails info and refresh button
    var footer = '<div style="padding:8px; font-size:12px; color:#999; display:flex; justify-content:space-between; align-items:center;">' +
      '<div>Missing thumbnails: <strong>' + missingCount + '</strong></div>' +
      '<div><button class="btn btn-secondary btn-small" onclick="embedMissingProjectThumbnails()">Embed missing thumbnails</button></div>' +
      '</div>';
    list.innerHTML = list.innerHTML + footer;
  }

  function embedMissingProjectThumbnails() {
    // Attempt to fetch and embed thumbnails for projects that have remote URLs but no embedded data URL yet
    var projects = appData.projects || [];
    var promises = [];
    projects.forEach(function(p){ if (p.thumbnailDataUrl && p.thumbnailDataUrl.indexOf('data:') === 0) return; // already embedded
      // attempt to find candidate image fields in metadata.links or a thumbnail url in p.thumbnailDataUrl that is remote
      var candidate = null;
      if (p.thumbnailDataUrl && typeof p.thumbnailDataUrl === 'string' && p.thumbnailDataUrl.indexOf('http') === 0) candidate = p.thumbnailDataUrl;
      // try common fields on the project object
      if (!candidate && p.metadata) { if (p.metadata.icon) candidate = p.metadata.icon; if (!candidate && p.metadata.image) candidate = p.metadata.image; }
      if (!candidate) return;
      var pr = resizeImageFromUrl(candidate, imageSettings.maxDimension).then(function(dataUrl){ p.thumbnailDataUrl = dataUrl; }).catch(function(err){ console.warn('embedMissingProjectThumbnails failed for', candidate, err); });
      promises.push(pr);
    });
    if (promises.length === 0) { alert('No candidate thumbnails found to embed'); return; }
    Promise.all(promises).then(function(){ saveData(); renderProjects(); alert('Attempted to embed missing project thumbnails (successes updated)'); }).catch(function(){ saveData(); renderProjects(); alert('Completed embedding attempts (some may have failed)'); });
  }

  function selectProject(id) {
    appData.currentProjectId = id;
    var project = (appData.projects || []).find(function(p){ return p.id === id; });
    if (!project) return;
    var emptyState = document.getElementById('emptyState'); if (emptyState) emptyState.style.display = 'none';
    var pv = document.getElementById('projectView'); if (pv) pv.style.display = 'block';
    var title = document.getElementById('projectTitle'); if (title) title.textContent = project.name;
    var metaHtml = [];
    if (project.metadata.description) metaHtml.push('<p>' + escapeHtml(project.metadata.description) + '</p>');
    if (project.metadata.tags && project.metadata.tags.length) metaHtml.push(project.metadata.tags.map(function(t){ return '<span class="tag">' + escapeHtml(t) + '</span>'; }).join(''));
  if (project.metadata.links && project.metadata.links.length) metaHtml.push('<div style="margin-top:8px;">' + project.metadata.links.map(function(l){ return '<a href="' + escapeHtml(l) + '" target="_blank" style="display:inline-block; color:var(--accent-color); margin-right:8px;">' + escapeHtml(l) + '</a>'; }).join('') + '</div>');
    var pm = document.getElementById('projectMeta'); if (pm) pm.innerHTML = metaHtml.join('');

    // Render project credits (read-only view under Notes). Editable via Edit Project modal only.
  var creditsDisplay = document.getElementById('projectCreditsDisplay'); if (creditsDisplay) {
      var credits = (project.metadata && Array.isArray(project.metadata.credits)) ? project.metadata.credits.slice() : [];
      if (!credits || credits.length === 0) {
        creditsDisplay.innerHTML = '<div style="color:#999; font-size:13px;">No credits added for this project.</div>';
      } else {
        // Render each credit as a row: name on left, domain-button(s) on the right
        creditsDisplay.innerHTML = credits.map(function(c, i){
          var name = escapeHtml(c.name || '');
          var url = c.url || '';
          var domain = url ? escapeHtml(extractDomain(url)) : '';
          var domainButton = domain ? ('<button class="btn btn-small" onclick="window.open(\'' + escapeHtml(url) + '\', \"_blank\")">' + domain + '</button>') : '';
          return '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">' +
                   '<div style="flex:1; color:#ddd; font-size:13px;">' + name + '</div>' +
                   '<div style="margin-left:12px;">' + domainButton + '</div>' +
                 '</div>';
        }).join('');
      }
    }

    // Load shipping inline editors
  var aIn = document.getElementById('amazonShippingInline'); if (aIn) aIn.value = project.shipping && project.shipping.amazon ? project.shipping.amazon : '';
  var alIn = document.getElementById('aliexpressShippingInline'); if (alIn) alIn.value = project.shipping && project.shipping.aliexpress ? project.shipping.aliexpress : '';
  var tIn = document.getElementById('temuShippingInline'); if (tIn) tIn.value = project.shipping && project.shipping.temu ? project.shipping.temu : '';
  var mIn = document.getElementById('mcmasterShippingInline'); if (mIn) mIn.value = project.shipping && project.shipping.mcmaster ? project.shipping.mcmaster : '';

  renderBOMs();
  renderNotes();
  // Render printed parts for the selected project (user requested above Notes)
  try { renderPrintedParts(); } catch (e) { console.warn('renderPrintedParts failed', e); }
    renderProjects();
    if (window.innerWidth <= 768) toggleSidebar();
    // default main pane
    switchMainView('project');
  }

  function showNewProjectModal() {
    editingProjectId = null;
    var n = document.getElementById('projectName'); if (n) n.value = '';
    var d = document.getElementById('projectDescription'); if (d) d.value = '';
  tempProjectTags = [];
  tempProjectLinks = [];
  tempProjectCredits = [];
    renderProjectTagsUI(); renderProjectLinksUI();
  renderProjectCreditsUI();
    // default project currency to app default
    try { var curEl = document.getElementById('projectCurrency'); if (curEl) curEl.value = appSettings.currencyDefault || 'USD'; } catch(e){}
    var tagInput = document.getElementById('projectTagInput'); if (tagInput) tagInput.value = '';
    var linkInput = document.getElementById('projectLinkInput'); if (linkInput) linkInput.value = '';
    var hdr = document.querySelector('#projectModal .modal-header'); if (hdr) hdr.textContent = 'New Project';
    openModal('projectModal');
    // clear thumbnail preview for new project
    var preview = document.getElementById('projectThumbnailPreview'); if (preview) { preview.src = ''; preview.style.display = 'none'; }
  // clear credits
  var creditsContainer = document.getElementById('projectCreditsContainer'); if (creditsContainer) creditsContainer.innerHTML = '';
    var creditName = document.getElementById('projectCreditName'); if (creditName) creditName.value = '';
    var creditUrl = document.getElementById('projectCreditUrl'); if (creditUrl) creditUrl.value = '';
    // hide project id display for new projects
    try { var idGroup = document.getElementById('projectIdFormGroup'); if (idGroup) idGroup.style.display = 'none'; var idDisplay = document.getElementById('projectIdDisplay'); if (idDisplay) idDisplay.value = ''; } catch(e){}
  }

  function editProjectMetadata() {
    var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; });
    if (!project) return;
    editingProjectId = project.id;
    var n = document.getElementById('projectName'); if (n) n.value = project.name;
    var d = document.getElementById('projectDescription'); if (d) d.value = project.metadata.description || '';
  tempProjectTags = Array.isArray(project.metadata.tags) ? project.metadata.tags.slice() : [];
  tempProjectLinks = Array.isArray(project.metadata.links) ? project.metadata.links.slice() : [];
  tempProjectCredits = Array.isArray(project.metadata.credits) ? project.metadata.credits.slice() : [];
  renderProjectTagsUI(); renderProjectLinksUI(); renderProjectCreditsUI();
    // populate currency select if project has currency
    try { var curEl = document.getElementById('projectCurrency'); if (curEl) curEl.value = project.currency || (project.metadata && project.metadata.currency) || appSettings.currencyDefault || 'USD'; } catch(e){}
    var hdr = document.querySelector('#projectModal .modal-header'); if (hdr) hdr.textContent = 'Edit Project';
    openModal('projectModal');
    // show thumbnail preview if present
    var preview = document.getElementById('projectThumbnailPreview'); if (preview) { if (project.thumbnailDataUrl) { preview.src = project.thumbnailDataUrl; preview.style.display = 'block'; } else { preview.src = ''; preview.style.display = 'none'; } }
  // show read-only project id
  try { var idGroup = document.getElementById('projectIdFormGroup'); var idDisplay = document.getElementById('projectIdDisplay'); if (idGroup && idDisplay) { idGroup.style.display = 'block'; idDisplay.value = project.id || ''; } } catch(e){}
  // populate credits
  var creditsContainer = document.getElementById('projectCreditsContainer'); if (creditsContainer) { creditsContainer.innerHTML = ''; var credits = (project.metadata && Array.isArray(project.metadata.credits)) ? project.metadata.credits.slice() : []; credits.forEach(function(c, i){ var name = escapeHtml(c.name || ''); var url = c.url ? escapeHtml(c.url) : ''; var domain = c.url ? escapeHtml(extractDomain(c.url)) : ''; var domainBtn = url ? ('<button class="btn btn-small" onclick="window.open(\'' + url + '\', \"_blank\")">' + domain + '</button>') : ''; creditsContainer.innerHTML += '<div style="margin-bottom:6px; display:flex; align-items:center; gap:8px; justify-content:space-between;">' + '<div style="flex:1;">' + name + '</div>' + '<div style="display:flex; gap:8px; align-items:center;">' + domainBtn + '<button class="remove-chip" onclick="removeProjectCredit(' + i + ')">✕</button></div>' + '</div>'; }); }
  }

  function saveProject() {
    _debugSaveAttempt('saveProject:start');
    var nameEl = document.getElementById('projectName');
    var name = nameEl ? nameEl.value.trim() : '';
    if (!name) { alert('Project name is required'); return; }
    var tags = tempProjectTags.slice();
    var links = tempProjectLinks.slice();
    var selectedCurrencyEl = document.getElementById('projectCurrency'); var selectedCurrency = selectedCurrencyEl ? (selectedCurrencyEl.value || '') : '';
    if (editingProjectId) {
      var proj = (appData.projects || []).find(function(p){ return p.id === editingProjectId; });
      if (!proj) return;
      proj.name = name;
      proj.metadata.description = document.getElementById('projectDescription') ? document.getElementById('projectDescription').value.trim() : '';
  proj.metadata.tags = tags;
  proj.metadata.links = links;
  proj.metadata.credits = Array.isArray(tempProjectCredits) ? tempProjectCredits.slice() : [];
      // persist selected currency on project
      try { if (selectedCurrency) { proj.currency = selectedCurrency; } else { delete proj.currency; } } catch(e){}
      // persist thumbnail preview for edits as well
      var preview = document.getElementById('projectThumbnailPreview'); if (preview) { proj.thumbnailDataUrl = preview.src || proj.thumbnailDataUrl || null; }
    } else {
      var newProject = {
        id: generateUUID(),
        name: name,
        metadata: { description: document.getElementById('projectDescription') ? document.getElementById('projectDescription').value.trim() : '', tags: tags, links: links, creationDate: new Date().toISOString().split('T')[0] },
        currency: selectedCurrency || (appSettings.currencyDefault || 'USD'),
        boms: { amazon:[], aliexpress:[], temu:[], mcmaster:[] },
        shipping: {},
        notes: [],
        thumbnailDataUrl: (document.getElementById('projectThumbnailPreview') && document.getElementById('projectThumbnailPreview').src) || null
      };
      // gather credits from tempProjectCredits
      if (Array.isArray(tempProjectCredits) && tempProjectCredits.length) newProject.metadata.credits = tempProjectCredits.slice();
  appData.projects.push(newProject);
      selectProject(newProject.id);
    }
    saveData(); renderProjects(); if (editingProjectId) selectProject(editingProjectId);
    closeModal('projectModal');
  }

  // Credits helpers
  function addProjectCreditFromInput() {
    var nameEl = document.getElementById('projectCreditName'); var urlEl = document.getElementById('projectCreditUrl');
    if (!nameEl || !nameEl.value.trim()) return alert('Credit name is required');
    var name = nameEl.value.trim(); var url = urlEl && urlEl.value.trim(); if (url && !isValidUrl(url)) return alert('Credit URL is invalid (must start with http:// or https://)');
    // Keep modal state in tempProjectCredits so saveProject can persist it
    tempProjectCredits = tempProjectCredits || [];
    tempProjectCredits.push({ name: name, url: url || null });
    // refresh modal UI
    renderProjectCreditsUI();
    nameEl.value = ''; if (urlEl) urlEl.value = '';
  }

  function removeProjectCredit(idx) { tempProjectCredits = tempProjectCredits || []; if (idx < 0 || idx >= tempProjectCredits.length) return; tempProjectCredits.splice(idx,1); renderProjectCreditsUI(); }

  // Project thumbnail helpers
  // No-op: avoid programmatic .click() which can open the file dialog twice in some browsers/environments.
  function triggerProjectThumbnailSelect() { try { console.info('triggerProjectThumbnailSelect suppressed to avoid duplicate file dialog'); } catch(e){} }
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function(){ var fileInp = document.getElementById('projectThumbnailFile'); if (fileInp) fileInp.addEventListener('change', function(e){ var f = e.target.files[0]; if (!f) return; // resize/compress then set preview
        resizeImageFile(f, 800).then(function(dataUrl){ var preview = document.getElementById('projectThumbnailPreview'); if (preview) { preview.src = dataUrl; preview.style.display = 'block'; } }).catch(function(err){ console.warn('Thumbnail resize failed', err); var reader = new FileReader(); reader.onload = function(ev){ var url = ev.target.result; var preview = document.getElementById('projectThumbnailPreview'); if (preview) { preview.src = url; preview.style.display = 'block'; } }; reader.readAsDataURL(f); }); }); });
  }
  function removeProjectThumbnail() {
    var preview = document.getElementById('projectThumbnailPreview'); if (preview) { preview.src = ''; preview.style.display = 'none'; }
    var fileInp = document.getElementById('projectThumbnailFile'); if (fileInp) fileInp.value = '';
    try {
      if (editingProjectId) {
        var proj = (appData.projects || []).find(function(p){ return p.id === editingProjectId; });
        if (proj) { proj.thumbnailDataUrl = null; saveData(); renderProjects(); }
      }
    } catch(e) { console.warn('removeProjectThumbnail persistence failed', e); }
  }

  function deleteProject() {
    if (!confirm('Are you sure you want to delete this project?')) return;
    appData.projects = (appData.projects || []).filter(function(p){ return p.id !== appData.currentProjectId; });
    appData.currentProjectId = null;
    saveData(); renderProjects();
    var pv = document.getElementById('projectView'); if (pv) pv.style.display = 'none';
    var es = document.getElementById('emptyState'); if (es) es.style.display = 'block';
    if (appData.projects.length > 0) selectProject(appData.projects[0].id);
  }

  function exportProject() {
    // Keep legacy behavior (export single project object) but also provide
    // an export that produces a single-element array compatible with the import system.
    var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; });
    if (!project) return;
    // Default: export as a single-element array so the import flow accepts it directly
    var exportObj = [ sanitizeProject(project) ];
    var data = JSON.stringify(exportObj, null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    // filename: sanitized project name
    var filename = ((project.name || 'project').replace(/[^a-z0-9]/gi, '_') || 'project') + '.json';
    var a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  }

  function importProject() {
    // Trigger file selection first; preview (Merge/Replace) is shown after parsing
    importModeProjects = 'merge';
    var inp = document.getElementById('importFile'); if (inp) inp.click();
  }

  function handleImport(e) {
    try {
      console.debug('[DEBUG] handleImport called', { processing: (e && e.target && e.target._processing) });
      if (e && e.target && e.target._processing) return; // ignore duplicate change events
      if (e && e.target) e.target._processing = true;
    } catch(e){}
    var file = e.target.files[0]; if (!file) { try { if (e && e.target) e.target._processing = false; } catch(e){} return; }
    var reader = new FileReader();
    reader.onload = function(event){
      try {
        var parsed = JSON.parse(event.target.result);
        var projectsToImport = Array.isArray(parsed) ? parsed : [parsed];
        // Ensure each imported project has a stable id (assign when missing)
        projectsToImport.forEach(function(p){ if (!p || typeof p !== 'object') return; if (!p.id) p.id = generateUUID(); });
        // Show the same import preview modal as materials so user can choose Merge or Replace
        showImportPreview('projects', projectsToImport);
      console.debug('[DEBUG] handleImport parsed and requested preview', { count: projectsToImport.length });
      } catch(err) { alert('Failed to import project: Invalid file format'); }
      try { if (e && e.target) e.target._processing = false; } catch(e){}
    };
    reader.readAsText(file);
    e.target.value = '';
    importModeProjects = 'merge';
  }

  function exportAllProjects() {
    if (!appData.projects || appData.projects.length === 0) { alert('No projects to export'); return; }
    // Export a sanitized array of projects to ensure metadata (including credits) is preserved
    var sanitized = (appData.projects || []).map(function(p){ return sanitizeProject(p); });
    var data = JSON.stringify(sanitized, null, 2);
    var blob = new Blob([data], { type: 'application/json' });
  var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = 'BOManager_AllProjects_' + Date.now() + '.json'; a.click(); URL.revokeObjectURL(url);
  }

  function exportAllMaterials() {
    if (!appData.materials || appData.materials.length === 0) { alert('No materials to export'); return; }
    var sanitized = (appData.materials || []).map(function(m){ return sanitizeMaterial(m); });
    var data = JSON.stringify(sanitized, null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = 'BOManager_AllMaterials_' + Date.now() + '.json'; a.click(); URL.revokeObjectURL(url);
  }

  // Create a sanitized export-friendly representation of a project
  function sanitizeProject(proj) {
    if (!proj || typeof proj !== 'object') return proj;
    var out = {};
    // Keep a stable id when exporting so imports that check ids can use it; but avoid functions
  out.id = proj.id || generateUUID();
    out.name = proj.name || '';
    // Ensure metadata exists and include credits explicitly when present
    out.metadata = proj.metadata || {};
    if (Array.isArray(out.metadata.credits)) {
      // copy credits to avoid accidental mutation
      out.metadata.credits = out.metadata.credits.map(function(c){ return { name: c.name || '', url: c.url || null }; });
    }
    // Preserve tags and links if present
    if (out.metadata.tags && !Array.isArray(out.metadata.tags)) out.metadata.tags = [];
    if (out.metadata.links && !Array.isArray(out.metadata.links)) out.metadata.links = [];
    // BOMs: preserve vendor arrays; include known vendors
    out.boms = out.boms || {};
    ['amazon','aliexpress','temu','mcmaster'].forEach(function(v){ out.boms[v] = (proj.boms && Array.isArray(proj.boms[v])) ? proj.boms[v].map(function(it){ return Object.assign({}, it); }) : []; });
    // shipping, notes, thumbnail, currency
    out.shipping = proj.shipping || {};
    out.notes = Array.isArray(proj.notes) ? proj.notes.map(function(n){ return Object.assign({}, n); }) : [];
    out.currency = proj.currency || (appSettings.currencyDefault || 'USD');
    // Prefer explicit embedded thumbnailDataUrl. If missing, include metadata.icon/metadata.image only when
    // they are already embedded data URLs (do not auto-fetch remote URLs to avoid outbound network calls).
    if (proj.thumbnailDataUrl) {
      out.thumbnailDataUrl = proj.thumbnailDataUrl;
    } else if (proj.metadata) {
      var candidate = proj.metadata.icon || proj.metadata.image || null;
      if (candidate && typeof candidate === 'string' && candidate.indexOf('data:') === 0) {
        out.thumbnailDataUrl = candidate;
      }
    }
    // preserve printedParts if present (per-project printed parts list)
    if (Array.isArray(proj.printedParts)) {
      out.printedParts = proj.printedParts.map(function(pp){ return { id: pp.id || null, fileName: pp.fileName || '', url: pp.url || '', quantity: pp.quantity || 1 }; });
    }
    // preserve project-specific gallery (standalone images grouped per-project)
    if (Array.isArray(proj.gallery) && proj.gallery.length) {
      out.gallery = proj.gallery.map(function(g){ return { id: g.id || generateUUID(), title: g.title || '', images: Array.isArray(g.images) ? g.images.slice() : [], createdAt: g.createdAt || new Date().toISOString() }; });
    }
    // Ensure BOM item currencies and ids are preserved
    ['amazon','aliexpress','temu','mcmaster'].forEach(function(v){ if (Array.isArray(out.boms[v])) { out.boms[v] = out.boms[v].map(function(it){ var copy = Object.assign({}, it); if (it && it.id) copy.id = it.id; if (!copy.currency && it && it.currency) copy.currency = it.currency; return copy; }); } });
    return out;
  }

  // Create a sanitized export-friendly representation of a material
  function sanitizeMaterial(mat) {
    if (!mat || typeof mat !== 'object') return mat;
    var out = {};
    out.id = mat.id || generateUUID();
    out.name = mat.name || '';
    out.description = mat.description || '';
    out.url = mat.url || '';
    out.pricePer = mat.pricePer || 0;
    out.currency = mat.currency || 'USD';
    if (mat.thumbnailDataUrl) out.thumbnailDataUrl = mat.thumbnailDataUrl;
    out.vendor = mat.vendor || '';
    out.tags = Array.isArray(mat.tags) ? mat.tags.slice() : [];
    return out;
  }

  // Legacy export: export the project as a single JSON object (not an array)
  function exportProjectLegacy() {
    var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; });
    if (!project) return;
    // Use sanitized project shape to keep metadata (credits, tags, links) consistent
    var data = JSON.stringify(sanitizeProject(project), null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var filename = ((project.name || 'project').replace(/[^a-z0-9]/gi, '_') || 'project') + '_legacy.json';
    var a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  }

  // Materials
  function renderMaterials() {
    var searchTerm = (document.getElementById('materialSearch') && document.getElementById('materialSearch').value.toLowerCase()) || '';
    var vendorFilter = (document.getElementById('materialVendorFilter') && document.getElementById('materialVendorFilter').value) || '';
    var currencyFilter = (document.getElementById('materialCurrencyFilter') && document.getElementById('materialCurrencyFilter').value) || '';
    var filteredMaterials = (appData.materials || []).filter(function(m){
      var matchesSearch = !searchTerm || m.name.toLowerCase().includes(searchTerm) || (m.description && m.description.toLowerCase().includes(searchTerm));
      var matchesVendor = !vendorFilter || m.vendor === vendorFilter;
      var matchesCurrency = !currencyFilter || (m.currency && m.currency === currencyFilter) || (!m.currency && appSettings.currencyDefault === currencyFilter);
      return matchesSearch && matchesVendor && matchesCurrency;
    });
    var list = document.getElementById('materialsList');
    if (!list) return;
  if (!appData.materials || appData.materials.length === 0) { list.innerHTML = '<div style="color: #666; text-align:center; padding:20px;">No materials yet</div>'; return; }
    if (filteredMaterials.length === 0) { list.innerHTML = '<div style="color:#666; text-align:center; padding:20px;">No materials match your search</div>'; return; }
  list.innerHTML = filteredMaterials.map(function(m){
  var tagsHtml = (m.tags && m.tags.length) ? '<div style="margin-top:6px;">' + m.tags.map(function(t){ return '<span class="chip" style="margin-right:6px;">' + escapeHtml(t) + '</span>'; }).join('') + '</div>' : '';
  var thumb = m.thumbnailDataUrl ? '<img src="' + escapeHtml(m.thumbnailDataUrl) + '" style="width:36px;height:36px;border-radius:6px;object-fit:cover;margin-right:8px;">' : '';
  var packBadge = m.isPack ? '<span class="pack-badge">Pack of <strong>' + (m.packSizeOption || m.packSize || 1) + '</strong></span>' : '';
  var includedBadge = m.isIncluded ? '<span class="included-badge">Included</span>' : '';
  var desc = m.description ? '<div style="font-size:13px; color:#ccc; margin-top:6px;">' + escapeHtml(m.description) + '</div>' : '';
      return '<div class="material-item" style="padding:10px; border-bottom:1px solid #222;">' +
        '<div style="display:flex; align-items:center; gap:8px;"><div>' + thumb + '</div><div style="flex:1">' +
  '<div style="font-weight:500;margin-bottom:4px;">' + escapeHtml(m.name) + ' ' + packBadge + includedBadge + '</div>' +
  '<div style="font-size:12px;color:#999;margin-bottom:8px;">' + (m.vendor && m.vendor.toUpperCase ? escapeHtml(m.vendor.toUpperCase()) : '') + ' • ' + formatCurrency(m.pricePer, m.currency) + '</div>' +
        desc + tagsHtml +
        '</div></div>' +
        '<div style="display:flex; gap:8px; margin-top:8px; justify-content:flex-end;">' +
          '<button class="btn btn-secondary btn-small" onclick="editMaterial(\'' + m.id + '\')">Edit</button>' +
          '<button class="btn btn-secondary btn-small" onclick="deleteMaterial(\'' + m.id + '\')">Delete</button>' +
          (m.url ? '<a href="' + escapeHtml(m.url) + '" target="_blank" style="color:var(--accent-color);font-size:12px;line-height:28px;">View</a>' : '') +
          '<button class="btn btn-small" onclick="addMaterialToCurrentProject(\'' + m.id + '\')">Add to Current Project</button>' +
        '</div></div>';
    }).join('');
  }

  // Helper: add a material to the currently selected project's BOM under its vendor
  function addMaterialToCurrentProject(materialId) {
    try {
      if (!materialId) return alert('No material specified');
      addInventoryToCurrentProject(materialId);
    } catch (e) { console.warn('addMaterialToCurrentProject failed', e); alert('Failed to add material to project'); }
  }

  try { if (typeof window !== 'undefined') window.addMaterialToCurrentProject = addMaterialToCurrentProject; } catch(e) {}

  function filterMaterials(){ renderMaterials(); }

  function showNewMaterialModal(){
    editingMaterialId = null;
    var fields = ['materialName','materialDescription','materialUrl','materialPrice','materialPackSize'];
    fields.forEach(function(id){ var el = document.getElementById(id); if (el) el.value = ''; });
    var vendorEl = document.getElementById('materialVendor'); if (vendorEl) vendorEl.value = 'amazon';
    var currencyEl = document.getElementById('materialCurrency'); if (currencyEl) currencyEl.value = 'USD';
  var isPackEl = document.getElementById('materialIsPack'); if (isPackEl) isPackEl.checked = false;
  var packOpts = document.getElementById('materialPackOptions'); if (packOpts) packOpts.style.display = 'none';
  // ensure UI state for disabled/enabled fields is consistent
  try { updateMaterialPackUI(); } catch(e) {}
    var packSizeOptionEl = document.getElementById('materialPackSizeOption'); if (packSizeOptionEl) packSizeOptionEl.value = '';
    // reset kit builder state
    tempMaterialComponents = [];
    populateKitComponentSelect();
    var compList = document.getElementById('materialComponentsList'); if (compList) compList.innerHTML = '';
    // reset Included-with-printer fields and populate printer/project options
    try { populateIncludedWithOptions(); var incChk = document.getElementById('materialIncluded'); if (incChk) { incChk.checked = false; } var incOpts = document.getElementById('materialIncludedOptions'); if (incOpts) incOpts.style.display = 'none'; var incWith = document.getElementById('materialIncludedWith'); if (incWith) incWith.value = ''; var incQty = document.getElementById('materialIncludedQty'); if (incQty) incQty.value = 1; } catch(e){}
    openModal('materialModal');
  }

  function editMaterial(id) {
    var material = (appData.materials || []).find(function(m){ return m.id === id; }); if (!material) return;
    editingMaterialId = id;
    var set = function(id, val){ var el = document.getElementById(id); if (el) el.value = val; };
    set('materialName', material.name);
    set('materialDescription', material.description || '');
    set('materialUrl', material.url || '');
    set('materialPrice', material.pricePer || '');
    set('materialPackSize', material.packSize || '');
    set('materialVendor', material.vendor || 'amazon');
    var currencyEl = document.getElementById('materialCurrency'); if (currencyEl) currencyEl.value = material.currency || 'USD';
  var isPackEl = document.getElementById('materialIsPack'); if (isPackEl) isPackEl.checked = !!material.isPack;
  var packOpts = document.getElementById('materialPackOptions'); if (packOpts) packOpts.style.display = material.isPack ? 'block' : 'none';
  try { updateMaterialPackUI(); } catch(e) {}
    var packSizeOptionEl = document.getElementById('materialPackSizeOption'); if (packSizeOptionEl) packSizeOptionEl.value = material.packSizeOption || '';
    // populate kit builder with existing components
    tempMaterialComponents = Array.isArray(material.components) ? material.components.slice() : [];
    populateKitComponentSelect();
    var compList = document.getElementById('materialComponentsList'); if (compList) compList.innerHTML = tempMaterialComponents.map(function(c,i){ return '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;"><div>' + escapeHtml(c.name) + ' x' + (c.quantity || 1) + '</div><div><button class="btn btn-small" onclick="removeMaterialComponent(' + i + ')">Remove</button></div></div>'; }).join('');
    openModal('materialModal');
    // show thumbnail preview
    var preview = document.getElementById('materialThumbnailPreview'); if (preview) { if (material.thumbnailDataUrl) { preview.src = material.thumbnailDataUrl; preview.style.display = 'block'; } else { preview.src = ''; preview.style.display = 'none'; } }
    // populate Included-with-printer fields
    try {
      var incChk = document.getElementById('materialIncluded'); if (incChk) { incChk.checked = !!material.isIncluded; }
      var incOpts = document.getElementById('materialIncludedOptions'); if (incOpts) incOpts.style.display = material.isIncluded ? 'block' : 'none';
      var incWith = document.getElementById('materialIncludedWith'); if (incWith) incWith.value = material.includedWith || '';
      var incQty = document.getElementById('materialIncludedQty'); if (incQty) incQty.value = material.includedQty != null ? material.includedQty : 1;
      // disable unrelated fields when included
      toggleFieldsForIncluded(!!material.isIncluded);
    } catch(e){}
  }

  function saveMaterial() {
    _debugSaveAttempt('saveMaterial:start');
    var name = (document.getElementById('materialName') && document.getElementById('materialName').value.trim()) || '';
    var isIncluded = !!(document.getElementById('materialIncluded') && document.getElementById('materialIncluded').checked);
    var url = (document.getElementById('materialUrl') && document.getElementById('materialUrl').value.trim()) || '';
    var price = parseFloat(document.getElementById('materialPrice') ? document.getElementById('materialPrice').value : NaN);
    // Validation: if included, only name is required (and included qty). Otherwise require name, url, price
    if (!name) { alert('Name is required'); return; }
    if (isIncluded) {
      // included materials don't require URL/price
      var incWith = document.getElementById('materialIncludedWith') ? document.getElementById('materialIncludedWith').value : '';
      var incQty = parseInt(document.getElementById('materialIncludedQty') ? document.getElementById('materialIncludedQty').value : '') || 1;
    } else {
      if (!url || isNaN(price)) { alert('Name, URL, and Price are required'); return; }
      if (!isValidUrl(url)) { alert('Please enter a valid URL (must start with http:// or https://)'); return; }
    }
    var vendor = document.getElementById('materialVendor') ? document.getElementById('materialVendor').value : 'amazon';
    var currency = document.getElementById('materialCurrency') ? document.getElementById('materialCurrency').value : 'USD';
    var isPack = !!(document.getElementById('materialIsPack') && document.getElementById('materialIsPack').checked);
    // For packs, prefer the dedicated pack size option field. The top-level materialPackSize is considered legacy and disabled when pack-mode is active.
    var packSizeOptionRaw = document.getElementById('materialPackSizeOption') ? document.getElementById('materialPackSizeOption').value : '';
    var packSizeOption = parseInt(packSizeOptionRaw) || null;
    var singlePackSize = parseInt(document.getElementById('materialPackSize') ? document.getElementById('materialPackSize').value : '') || 1;
    var duplicate = (appData.materials || []).find(function(m){ return m.id !== editingMaterialId && m.name === name && m.vendor === vendor && m.url === url; });
    if (duplicate) { alert('A material with this name, vendor, and URL already exists'); return; }
    // collect tags input if present
    var tagsInput = (document.getElementById('materialTagsInput') && document.getElementById('materialTagsInput').value.trim()) || '';
    var tags = tagsInput ? tagsInput.split(',').map(function(s){ return s.trim(); }).filter(function(s){ return s; }) : [];
    // Interpret pricePer: if material is a pack, pricePer represents the price for the pack (not per-item). Keep property name pricePer but document behavior in README.
    var materialData = { name: name, description: document.getElementById('materialDescription') ? document.getElementById('materialDescription').value.trim() : '', url: url, pricePer: price, currency: currency, packSize: isPack ? (packSizeOption || singlePackSize || 1) : (singlePackSize || 1), vendor: vendor, isPack: isPack, packSizeOption: isPack ? (packSizeOption || singlePackSize || 1) : null, tags: tags, isIncluded: isIncluded };
    if (isIncluded) {
      materialData.includedWith = document.getElementById('materialIncludedWith') ? document.getElementById('materialIncludedWith').value : '';
      materialData.includedQty = parseInt(document.getElementById('materialIncludedQty') ? document.getElementById('materialIncludedQty').value : '') || 1;
    } else {
      materialData.includedWith = null; materialData.includedQty = null;
    }
    // attach thumbnail if preview exists
    var matThumb = (document.getElementById('materialThumbnailPreview') && document.getElementById('materialThumbnailPreview').src) || null;
    if (matThumb) materialData.thumbnailDataUrl = matThumb;
  // attach kit components when saving a pack/kit (store quantities and optional URLs/prices)
  if (isPack && tempMaterialComponents && tempMaterialComponents.length) materialData.components = tempMaterialComponents.map(function(c){ return { name: c.name, quantity: c.quantity || 1, url: c.url || null, pricePer: c.pricePer || 0 }; });
    if (editingMaterialId) { var existing = (appData.materials || []).find(function(m){ return m.id === editingMaterialId; }); if (existing) Object.assign(existing, materialData); }
    else { materialData.id = generateUUID(); appData.materials = appData.materials || []; appData.materials.push(materialData); }
    saveData(); renderMaterials(); closeModal('materialModal');
  }

  // Toggle disabling unrelated fields when Included-with-printer is checked
  function toggleFieldsForIncluded(isIncluded) {
    var fieldsToDisable = ['materialUrl','materialPrice','materialVendor','materialCurrency','materialIsPack','materialPackSize','materialPackSizeOption','materialTagsInput','materialThumbnailFile','kitComponentSelect','kitComponentName','kitComponentUrl','kitComponentPrice'];
    fieldsToDisable.forEach(function(id){ var el = document.getElementById(id); if (!el) return; if (isIncluded) { el.setAttribute('disabled','disabled'); el.classList.add('disabled-when-included'); } else { el.removeAttribute('disabled'); el.classList.remove('disabled-when-included'); } });
  }

  // Setup listener to populate printers select and toggle included options
  try {
    document.addEventListener('DOMContentLoaded', function(){
      var incChk = document.getElementById('materialIncluded');
      var incOpts = document.getElementById('materialIncludedOptions');
      var incWith = document.getElementById('materialIncludedWith');
      if (incWith) populateIncludedWithOptions();
      if (incChk) { incChk.addEventListener('change', function(e){ try { if (incOpts) incOpts.style.display = incChk.checked ? 'block' : 'none'; toggleFieldsForIncluded(incChk.checked); } catch(ex){} }); }
    });
  } catch(e) {}

  function populateIncludedWithOptions() {
    try {
      var incWith = document.getElementById('materialIncludedWith'); if (!incWith) return;
      incWith.innerHTML = '<option value="">-- Select printer/project --</option>';
      (appData.projects || []).forEach(function(p){ incWith.innerHTML += '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name) + '</option>'; });
    } catch(e) { console.warn('populateIncludedWithOptions failed', e); }
  }

  // expose ability to change accent color from settings
  function setAccentColor(hex) {
    if (!hex || typeof hex !== 'string') return;
    // basic validation: allow #RRGGBB or CSS color names — rely on browser to interpret
    try {
      document.documentElement.style.setProperty('--accent-color', hex);
      appSettings.accentColor = hex;
      saveAppSettings();
    } catch (e) { console.warn('Failed to set accent color', e); }
  }
  function loadAccentColor() { try { if (appSettings && appSettings.accentColor) document.documentElement.style.setProperty('--accent-color', appSettings.accentColor); } catch(e){} }

  // Ensure accent helpers are available for inline onclicks in the HTML
  try { if (typeof window !== 'undefined') { window.setAccentColor = setAccentColor; window.loadAccentColor = loadAccentColor; } } catch(e) {}

  try { if (typeof window !== 'undefined') { window.proceedImportDespiteCurrency = proceedImportDespiteCurrency; } } catch(e) {}
  try { if (typeof window !== 'undefined') { window.saveProject = saveProject; window.saveMaterial = saveMaterial; window._debugSaveAttempt = _debugSaveAttempt; } } catch(e) {}

  // Kit builder helpers
  function populateKitComponentSelect() {
    var sel = document.getElementById('kitComponentSelect'); if (!sel) return;
    sel.innerHTML = '<option value="">-- Select existing material (optional) --</option>';
    (appData.materials || []).forEach(function(m){ sel.innerHTML += '<option value="' + escapeHtml(m.id) + '">' + escapeHtml(m.name) + ' (' + (m.vendor||'') + ')</option>'; });
  }

  function addMaterialComponentFromInputs() {
    var sel = document.getElementById('kitComponentSelect'); var qtyEl = document.getElementById('kitComponentQty'); if (!sel || !qtyEl) return;
    var qty = parseInt(qtyEl.value) || 1;
    // prefer an existing material selection if present
    if (sel.value) {
      var matId = sel.value;
      var mat = (appData.materials || []).find(function(m){ return m.id === matId; });
      if (!mat) return alert('Selected material not found');
      tempMaterialComponents.push({ name: mat.name, url: mat.url || null, quantity: qty, pricePer: mat.pricePer || 0 });
    } else {
      // add custom component — require a name
      var name = (document.getElementById('kitComponentName') && document.getElementById('kitComponentName').value.trim()) || '';
      var url = (document.getElementById('kitComponentUrl') && document.getElementById('kitComponentUrl').value.trim()) || '';
      var price = parseFloat(document.getElementById('kitComponentPrice') ? document.getElementById('kitComponentPrice').value : 0) || 0;
      if (!name) { alert('Component name is required for a custom component'); return; }
      tempMaterialComponents.push({ name: name, url: url || null, quantity: qty, pricePer: price });
    }
    // refresh component list UI
    var compList = document.getElementById('materialComponentsList'); if (compList) compList.innerHTML = tempMaterialComponents.map(function(c,i){ return '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;"><div>' + escapeHtml(c.name) + ' x' + (c.quantity || 1) + '</div><div><button class="btn btn-small" onclick="removeMaterialComponent(' + i + ')">Remove</button></div></div>'; }).join('');
    // clear inputs and reset qty to 1 for convenience
    qtyEl.value = '1';
    var nameEl = document.getElementById('kitComponentName'); if (nameEl) nameEl.value = '';
    var urlEl = document.getElementById('kitComponentUrl'); if (urlEl) urlEl.value = '';
    var priceEl = document.getElementById('kitComponentPrice'); if (priceEl) priceEl.value = '';
    // reset select to default
    sel.value = '';
  }

  function removeMaterialComponent(idx) { if (!tempMaterialComponents || idx < 0 || idx >= tempMaterialComponents.length) return; tempMaterialComponents.splice(idx,1); var compList = document.getElementById('materialComponentsList'); if (compList) compList.innerHTML = tempMaterialComponents.map(function(c,i){ return '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;"><div>' + escapeHtml(c.name) + ' x' + (c.quantity || 1) + '</div><div><button class="btn btn-small" onclick="removeMaterialComponent(' + i + ')">Remove</button></div></div>'; }).join(''); }

  // Material thumbnail helpers
  // No-op: avoid programmatic .click() which can open the file dialog twice in some browsers/environments.
  function triggerMaterialThumbnailSelect() { try { console.info('triggerMaterialThumbnailSelect suppressed to avoid duplicate file dialog'); } catch(e){} }
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function(){ var fileInp = document.getElementById('materialThumbnailFile'); if (fileInp) fileInp.addEventListener('change', function(e){ var f = e.target.files[0]; if (!f) return; resizeImageFile(f, 800).then(function(dataUrl){ var preview = document.getElementById('materialThumbnailPreview'); if (preview) { preview.src = dataUrl; preview.style.display = 'block'; } }).catch(function(err){ console.warn('Thumbnail resize failed', err); var reader = new FileReader(); reader.onload = function(ev){ var url = ev.target.result; var preview = document.getElementById('materialThumbnailPreview'); if (preview) { preview.src = url; preview.style.display = 'block'; } }; reader.readAsDataURL(f); }); }); });
  }
  function removeMaterialThumbnail() {
    var preview = document.getElementById('materialThumbnailPreview'); if (preview) { preview.src = ''; preview.style.display = 'none'; }
    var fileInp = document.getElementById('materialThumbnailFile'); if (fileInp) fileInp.value = '';
    try {
      if (editingMaterialId) {
        var mat = (appData.materials || []).find(function(m){ return m.id === editingMaterialId; });
        if (mat) { mat.thumbnailDataUrl = null; saveData(); renderMaterials(); }
      }
    } catch(e) { console.warn('removeMaterialThumbnail persistence failed', e); }
  }

  // Image resize/convert utilities
  function resizeImageFile(file, maxDim) {
    // use configured maxDim if not provided
    maxDim = maxDim || imageSettings.maxDimension || 800;
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onload = function(e){ resizeImageFromDataUrl(e.target.result, file.type, maxDim).then(resolve).catch(reject); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function resizeImageFromDataUrl(dataUrl, originalType, maxDim) {
    return new Promise(function(resolve, reject){
      var img = new Image();
      img.onload = function(){
        var w = img.width, h = img.height; var scale = 1;
        if (w > maxDim || h > maxDim) scale = Math.min(maxDim / w, maxDim / h);
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h * scale));
        var canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch;
        var ctx = canvas.getContext('2d');
        // Determine strict output rules:
        // - If original is PNG -> output PNG (preserve alpha)
        // - If original is JPEG/JPG -> output JPEG
        // - If original is WEBP -> convert to PNG (preserve any transparency)
        // - Else -> output JPEG
        var orig = (originalType || '').toLowerCase();
        var quality = (typeof imageSettings.jpegQuality === 'number' ? imageSettings.jpegQuality : 0.85);
        var outMime;
        if (orig.indexOf('png') !== -1) outMime = 'image/png';
        else if (orig.indexOf('jpeg') !== -1 || orig.indexOf('jpg') !== -1) outMime = 'image/jpeg';
        else if (orig.indexOf('webp') !== -1) outMime = 'image/png';
        else outMime = 'image/jpeg';

        // For JPEG outputs, paint a white background to avoid transparent backgrounds turning black.
        if (outMime === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,cw,ch); }
        // Draw the image onto the canvas
        ctx.drawImage(img, 0, 0, cw, ch);

        try {
          if (outMime === 'image/png') {
            var outPng = canvas.toDataURL('image/png');
            resolve(outPng);
          } else {
            var outJpeg = canvas.toDataURL('image/jpeg', quality);
            resolve(outJpeg);
          }
        } catch (e) { try { var out2 = canvas.toDataURL(); resolve(out2); } catch (e2) { reject(e2); } }
      };
      img.onerror = function(err){ reject(err); };
      img.src = dataUrl;
    });
  }

  function resizeImageFromUrl(url, maxDim) {
    maxDim = maxDim || imageSettings.maxDimension || 800;
    return fetch(url, { mode: 'cors' }).then(function(resp){ if (!resp.ok) throw new Error('Network error ' + resp.status); return resp.blob(); }).then(function(blob){ var type = blob.type || 'image/jpeg'; return new Promise(function(resolve, reject){ var reader = new FileReader(); reader.onload = function(e){ resizeImageFromDataUrl(e.target.result, type, maxDim).then(resolve).catch(reject); }; reader.onerror = reject; reader.readAsDataURL(blob); }); }).catch(function(err){ return Promise.reject(err); });
  }

  // Source icon embedding removed from automatic startup to avoid any network activity without explicit user action.
  // If you want to embed source icons, call a manual helper (not provided by default) which will run when invoked.

  // Manual embedding helper: attempt to embed all saved remote thumbnails for materials and projects.
  // This function does NOT run automatically and must be explicitly invoked by the user or UI.
  function embedAllSavedThumbnails(batchSizeParam) {
    try {
      var candidates = [];
      (appData.materials || []).forEach(function(m){ if (!m) return; if (m.thumbnailDataUrl && m.thumbnailDataUrl.indexOf('data:') === 0) return; var candidate = m.thumbnailDataUrl || m.url || null; if (candidate && typeof candidate === 'string' && candidate.indexOf('http') === 0) candidates.push({ type: 'material', item: m, url: candidate }); });
      (appData.projects || []).forEach(function(p){ if (!p) return; if (p.thumbnailDataUrl && p.thumbnailDataUrl.indexOf('data:') === 0) return; var candidate = p.thumbnailDataUrl || (p.metadata && (p.metadata.icon || p.metadata.image)) || null; if (candidate && typeof candidate === 'string' && candidate.indexOf('http') === 0) candidates.push({ type: 'project', item: p, url: candidate }); });
      if (!candidates.length) return Promise.resolve({ count: 0 });
      var batchSize = Math.max(1, Math.min(50, Number(batchSizeParam || embedSettings.batchSize) || 6));
      var idx = 0;
      var successCount = 0;
      return new Promise(function(resolve){
        function runBatch() {
          var end = Math.min(idx + batchSize, candidates.length);
          var batch = candidates.slice(idx, end);
          var ps = batch.map(function(c){ return resizeImageFromUrl(c.url, imageSettings.maxDimension).then(function(dataUrl){ if (dataUrl) { try { c.item.thumbnailDataUrl = dataUrl; successCount++; } catch(e){} } }).catch(function(err){ console.warn('batched embedding failed for', c.url, err); }); });
          Promise.all(ps).then(function(){ idx = end; saveData(); renderMaterials(); renderProjects(); if (idx < candidates.length) { setTimeout(runBatch, 150); } else { resolve({ count: successCount }); } }).catch(function(){ idx = end; saveData(); renderMaterials(); renderProjects(); if (idx < candidates.length) { setTimeout(runBatch, 150); } else { resolve({ count: successCount }); } });
        }
        runBatch();
      });
    } catch (e) { console.warn('embedAllSavedThumbnails failed', e); return Promise.resolve({ count: 0 }); }
  }

  function deleteMaterial(id) { if (!confirm('Are you sure you want to delete this material?')) return; appData.materials = (appData.materials || []).filter(function(m){ return m.id !== id; }); saveData(); renderMaterials(); }

  // Inventory view: render materials with editable on-hand counts and Add to BOM
  function renderInventory() {
    var q = (document.getElementById('inventorySearch') && document.getElementById('inventorySearch').value.trim().toLowerCase()) || '';
    var list = document.getElementById('inventoryList'); if (!list) return;
    var projectNeedsEl = document.getElementById('projectNeedsList'); if (!projectNeedsEl) return;

    // Build project needs from current project's BOMs
    var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; });
    var needs = [];
    if (project && project.boms) {
      // push canonical BOM entry objects (not clones) so render reflects persisted markers like __linkedMaterialId
      ['amazon','aliexpress','temu','mcmaster'].forEach(function(v){
        (project.boms[v] || []).forEach(function(entry, vendorIdx){
          try { entry._vendor = v; entry._vendorIndex = vendorIdx; } catch(e){}
          needs.push(entry);
        });
      });
    }

    // render project needs
    if (!needs || needs.length === 0) {
      projectNeedsEl.innerHTML = '<div style="color:#999; padding:8px;">No BOM items for the selected project.</div>';
    } else {
      projectNeedsEl.innerHTML = needs.map(function(item, idx){
        // Prefer checking the canonical BOM entry for an explicit linked marker so UI reflects current project state
        var matchedHtml = '';
        var canonicalEntry = null;
        try {
          if (project && project.boms && item && (item._vendor || item.vendor) && (item._vendorIndex != null)) {
            var v = item._vendor || item.vendor;
            canonicalEntry = (project.boms[v] || [])[item._vendorIndex];
          }
        } catch (e) { canonicalEntry = null; }

        var linkedMat = null;
        try {
          if (canonicalEntry && canonicalEntry.__linkedMaterialId) {
            linkedMat = (appData.materials || []).find(function(m){ return m && m.id === canonicalEntry.__linkedMaterialId; });
          }
        } catch (e) { linkedMat = null; }

        if (linkedMat) {
          matchedHtml = '<div style="font-size:13px; color:#ddd;">Found in Materials: <strong>' + escapeHtml(linkedMat.name) + '</strong> <button class="btn btn-small" style="margin-left:8px;" data-action="removeFromBOM" data-vendor="' + escapeHtml(item._vendor || item.vendor || '') + '" data-vendor-index="' + (item._vendorIndex != null ? item._vendorIndex : idx) + '">Remove from BOM</button></div>';
        } else {
          // Fallback: attempt to match by url/name/vendor to show Add option
          var match = (appData.materials || []).find(function(m){ if (!m) return false; if (item.url && m.url && m.url === item.url) return true; if (m.name && item.name && m.name.toLowerCase() === item.name.toLowerCase() && m.vendor === (item.vendor || item._vendor)) return true; return false; });
          if (!match && canonicalEntry && canonicalEntry.__linkedMaterialId) {
            match = (appData.materials || []).find(function(m){ return m && m.id === canonicalEntry.__linkedMaterialId; });
          }
          if (match) {
            matchedHtml = '<div style="font-size:13px; color:#ddd;">Found in Materials: <strong>' + escapeHtml(match.name) + '</strong> <button class="btn btn-small" style="margin-left:8px;" data-action="addToBOM" data-id="' + escapeHtml(match.id) + '">Add to BOM</button></div>';
          } else {
            matchedHtml = '<div style="font-size:13px; color:#f88;">Missing in Materials. <button class="btn btn-small" data-action="prefillMissing" data-idx="' + idx + '">Add as Material</button> <button class="btn btn-secondary btn-small" data-action="showSettings" style="margin-left:8px;">Check Sources / Imports</button></div>';
          }
        }
        return '<div style="padding:8px; border-bottom:1px solid #222; display:flex; justify-content:space-between; align-items:center;">' +
          '<div style="flex:1;">' + '<div style="font-weight:600;">' + escapeHtml(item.name) + '</div>' + '<div style="font-size:12px;color:#999;">Vendor: ' + escapeHtml((item.vendor||item._vendor||'').toUpperCase()) + ' • Qty: ' + (item.quantity || 1) + '</div>' + '</div>' +
          '<div style="margin-left:12px; text-align:right;">' + matchedHtml + '</div>' +
        '</div>';
      }).join('');
    }

    // render local inventory below (filter by search q)
    var mats = (appData.materials || []).filter(function(m){ if (!m) return false; if (!q) return true; return (m.name && m.name.toLowerCase().includes(q)) || (m.vendor && m.vendor.toLowerCase().includes(q)) || (m.tags && m.tags.join(' ').toLowerCase().includes(q)); });
    if (!mats || mats.length === 0) { list.innerHTML = '<div style="color:#666; text-align:center; padding:20px;">No inventory items</div>'; } else {
      list.innerHTML = mats.map(function(m){
        var thumb = m.thumbnailDataUrl ? '<img src="' + escapeHtml(m.thumbnailDataUrl) + '" style="width:48px;height:48px;border-radius:6px;object-fit:cover;margin-right:8px;">' : '';
        var onHand = (typeof m.onHand === 'number') ? m.onHand : 0;
  var packBadgeInv = m.isPack ? '<span class="pack-badge" style="margin-left:8px;">Pack of <strong>' + (m.packSizeOption || m.packSize || 1) + '</strong></span>' : '';
  var includedBadgeInv = m.isIncluded ? '<span class="included-badge" style="margin-left:8px;">Included</span>' : '';
        // kit expansion UI: if material is pack, allow expand/collapse to show components and per-component availability
        var kitToggle = '';
        var kitDetailsHtml = '';
        if (m.isPack && Array.isArray(m.components) && m.components.length) {
            var expanded = !!expandedKits[m.id] || !!appSettings.alwaysExpandKits;
          kitToggle = '<button class="btn btn-small" onclick="toggleKitExpand(\'' + m.id + '\')">' + (expanded ? 'Collapse' : 'Expand') + '</button>';
          if (expanded) {
            // render component rows
            kitDetailsHtml = '<div class="kit-container">' + m.components.map(function(c,ci){
              // try to find matching material globally
              var match = (appData.materials || []).find(function(mm){ return mm.url && c.url && mm.url === c.url || (mm.name && c.name && mm.name.toLowerCase() === c.name.toLowerCase()); });
              var have = match ? (typeof match.onHand === 'number' ? match.onHand : 0) : 0;
              var need = c.quantity || 1;
              var status = (match && have >= need) ? 'satisfied' : (match ? 'partial' : 'missing');
              return '<div class="kit-row">' +
                '<div class="kit-name">' + escapeHtml(c.name) + ' <span style="font-size:12px;color:#999;">x' + need + '</span></div>' +
                '<div class="kit-actions">' + (match ? '<div style="font-size:13px;color:#ddd;">On-hand: <strong>' + have + '</strong></div>' : '<div style="font-size:13px;color:#f88;">Not in Materials</div>') +
                (match ? '<button class="btn btn-small" onclick="editMaterial(\'' + match.id + '\')">Edit</button>' : '<button class="btn btn-small" onclick="prefillMaterialFromComponent(\'' + m.id + '\',' + ci + ')">Add as Material</button>') +
                '</div></div>';
            }).join('') + '</div>';
          }
        }

        return '<div class="inventory-item" style="display:flex; align-items:center; justify-content:space-between; padding:8px; border-bottom:1px solid #222;">' +
          '<div style="display:flex; align-items:center; gap:8px; flex:1;">' + thumb + '<div style="flex:1;">' + '<div style="font-weight:600;">' + escapeHtml(m.name) + packBadgeInv + includedBadgeInv + '</div>' + '<div style="font-size:12px;color:#999;">' + escapeHtml((m.vendor||'').toUpperCase()) + ' • ' + formatCurrency(m.pricePer, m.currency) + '</div>' + kitDetailsHtml + '</div></div>' +
          '<div style="display:flex; gap:8px; align-items:center;">' +
            '<input type="number" min="0" value="' + onHand + '" style="width:84px; padding:6px; background:#0f0f0f; border:1px solid #222; color:#fff;" onchange="updateInventoryOnHand(\'' + m.id + '\', this.value)">' +
            '<button class="btn btn-small" onclick="window.addInventoryToCurrentProject(\'' + m.id + '\')">Add to BOM</button>' + kitToggle +
          '</div></div>';
      }).join('');
    }
  }

  // Gallery view: show project/material thumbnails and a standalone gallery of images stored in appData.gallery
  function renderGallery() {
    try {
      var q = (document.getElementById('gallerySearch') && document.getElementById('gallerySearch').value.trim().toLowerCase()) || '';
      var container = document.getElementById('galleryList'); if (!container) return;
      var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; });
      if (!project) {
        container.innerHTML = '<div style="color:#999; padding:12px;">Select a project to view its gallery.</div>';
        return;
      }

      project.gallery = project.gallery || [];
      var standalone = (project.gallery || []).filter(function(g){ return !q || (g.title && g.title.toLowerCase().indexOf(q) !== -1) || (Array.isArray(g.images) && g.images.some(function(i){ var t = (i && i.title) || ''; return t.toLowerCase().indexOf(q) !== -1; })); });

      var html = '';
      html += '<div style="margin-bottom:6px; color:#999; font-size:13px;">Project: <strong>' + escapeHtml(project.name || 'Unnamed') + '</strong></div>';
      html += '<div style="display:flex; gap:8px; align-items:center; margin-bottom:10px;">';
      html += '<div style="flex:1; color:#999;">Use "+ Add Standalone Image" to add images specific to the selected project.</div>';
      html += '<div style="display:flex; gap:8px;">' +
                '<button class="btn" onclick="triggerGalleryImageSelect()">+ Add Standalone Image</button>' +
              '</div>' +
             '</div>';

      // Project thumbnail area (compact)
      html += '<div style="display:flex; gap:12px; align-items:center; margin-bottom:10px;">';
      var thumbSrc = project.thumbnailDataUrl || '';
      if (thumbSrc) {
        html += '<div style="width:120px;height:80px;border-radius:6px;overflow:hidden;background:#050505;"><img src="' + escapeHtml(thumbSrc) + '" style="width:100%;height:100%;object-fit:cover;display:block;"></div>';
      } else {
        html += '<div style="width:120px;height:80px;border-radius:6px;display:flex;align-items:center;justify-content:center;background:#050505;color:#666;">No thumbnail</div>';
      }
      html += '<div style="display:flex; flex-direction:column; gap:6px;">' +
              '<div style="font-size:13px;color:#ddd;">Project Thumbnail</div>' +
              '<div style="display:flex; gap:8px;">' +
                '<label for="projectThumbnailFile" class="btn btn-secondary btn-small" style="cursor:pointer;">Change</label>' +
                '<button class="btn btn-secondary btn-small" onclick="removeProjectThumbnail()">Remove</button>' +
              '</div>' +
            '</div>';
      html += '</div>';

      // Standalone images
      html += '<h3 style="font-size:14px; color:#bbb; margin-top:12px;">Standalone Images</h3>';
      if (!standalone || standalone.length === 0) {
        html += '<div style="color:#999; padding:8px;">No standalone images for this project</div>';
      } else {
        html += '<div style="display:flex; flex-direction:column; gap:12px;">';
        standalone.forEach(function(g){
          html += '<div style="background:#0b0b0b;padding:8px;border-radius:6px;">';
          // entry title (editable)
          html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">' +
                    '<input id="gallery_title_' + g.id + '" class="form-input" style="flex:1; margin-right:12px; background:transparent; border:1px solid #222; color:#ddd; padding:6px;" value="' + escapeHtml(g.title || '') + '" placeholder="Entry title (optional)" onchange="updateGalleryEntryTitle(\'' + g.id + '\', this.value)">' +
                    '<div style="display:flex; gap:8px;">' +
                      '<button class="btn btn-small" onclick="triggerGalleryImageSelect(\'' + g.id + '\')">Add Image</button>' +
                      '<button class="btn btn-small" onclick="saveGalleryEntry(\'' + g.id + '\')">Save Entry</button>' +
                      '<button class="btn btn-secondary btn-small" onclick="deleteStandaloneEntry(\'' + g.id + '\')">Delete Entry</button>' +
                    '</div>' +
                  '</div>';

          // images list
          html += '<div style="display:flex; flex-direction:column; gap:12px;">';
          if (Array.isArray(g.images) && g.images.length) {
            g.images.forEach(function(imgObj, idx){
              var src = (typeof imgObj === 'string') ? imgObj : (imgObj && (imgObj.src || imgObj.image || imgObj.data)) || '';
              var note = (imgObj && imgObj.note) ? imgObj.note : '';
              var title = (imgObj && imgObj.title) ? imgObj.title : '';
              html += '<div style="width:100%; max-width:760px; text-align:left; margin-bottom:12px;">' +
                        '<div style="position:relative;">' +
                          '<img src="' + escapeHtml(src) + '" onclick="openFullscreenImage(\'' + g.id + '\',' + idx + ')" style="width:100%;max-height:320px;object-fit:cover;border-radius:6px;display:block;margin-bottom:6px;cursor:zoom-in;">' +
                          '<button class="btn btn-small" style="position:absolute; top:8px; right:8px;" onclick="removeStandaloneImage(\'' + g.id + '\',' + idx + ')">Remove</button>' +
                        '</div>' +
                        '<div style="margin-bottom:6px;"><input id="gallery_img_title_' + g.id + '_' + idx + '" class="form-input" style="width:100%; background:transparent; border:1px solid #222; color:#ddd; padding:6px;" value="' + escapeHtml(title) + '" placeholder="Image title (optional)" onchange="updateGalleryImageTitle(\'' + g.id + '\',' + idx + ', this.value)"></div>' +
                        '<div><textarea id="gallery_note_' + g.id + '_' + idx + '" placeholder="Add note..." onchange="updateGalleryImageNote(\'' + g.id + '\',' + idx + ', this.value)" style="width:100%; height:120px; background:#050505; color:#ddd; border:1px solid #222; padding:8px;">' + escapeHtml(note) + '</textarea></div>' +
                      '</div>';
            });
          } else {
            html += '<div style="color:#999; padding:8px;">No images in this entry</div>';
          }
          html += '</div>'; // end images list
          html += '</div>'; // end entry card
        });
        html += '</div>'; // end standalone container
      }

      container.innerHTML = html;
    } catch (e) { console.warn('renderGallery failed', e); }
  }

  function handleGalleryImageAdd(e, galleryId) {
    if (!e || !e.target || !e.target.files || e.target.files.length === 0) return;
    var f = e.target.files[0]; if (!f) return; e.target.value = '';
    var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; });
    if (!project) { alert('Select a project before adding gallery images'); return; }
    project.gallery = project.gallery || [];
    resizeImageFile(f, imageSettings.maxDimension).then(function(dataUrl){
      if (galleryId) {
        var g = project.gallery.find(function(x){ return x.id === galleryId; });
        if (g) { g.images = g.images || []; g.images.push({ src: dataUrl, note: '', title: '', createdAt: new Date().toISOString() }); g.createdAt = g.createdAt || new Date().toISOString(); }
      } else {
        var id = generateUUID();
        project.gallery.push({ id: id, title: 'Image ' + (project.gallery.length + 1), images: [{ src: dataUrl, note: '', title: '' }], createdAt: new Date().toISOString() });
      }
      saveData(); renderGallery();
  }).catch(function(err){ console.warn('Failed to add gallery image', err); var reader = new FileReader(); reader.onload = function(ev){ var dataUrl = ev.target.result; project.gallery = project.gallery || []; if (galleryId) { var g = project.gallery.find(function(x){ return x.id === galleryId; }); if (g) { g.images = g.images || []; g.images.push({ src: dataUrl, note: '', title: '', createdAt: new Date().toISOString() }); g.createdAt = g.createdAt || new Date().toISOString(); } } else { project.gallery.push({ id: generateUUID(), title: 'Image ' + (project.gallery.length + 1), images: [{ src: dataUrl, note: '', title: '', createdAt: new Date().toISOString() }], createdAt: new Date().toISOString() }); } saveData(); renderGallery(); }; reader.readAsDataURL(f); });
  }

  // Programmatic safe trigger for gallery image file input. If galleryId is provided,
  // the selected file will be added to that gallery entry; otherwise it creates a new entry for the project.
  function triggerGalleryImageSelect(galleryId) {
    if (!appData.currentProjectId) { alert('Select a project before adding images.'); return; }
    var inp = document.getElementById('galleryImageFile');
    if (!inp) {
      inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/png,image/jpeg,image/webp';
      inp.id = 'galleryImageFile';
      inp.style.display = 'none';
      inp.addEventListener('change', function(e){ handleGalleryImageAdd(e, galleryId); });
      document.body.appendChild(inp);
    } else {
      // rebind listener to ensure galleryId captured
      inp.removeEventListener && inp.removeEventListener('change', inp._boundChange);
      inp._boundChange = function(e){ handleGalleryImageAdd(e, galleryId); };
      inp.addEventListener('change', inp._boundChange);
    }
    inp.click();
  }

  function updateGalleryImageNote(entryId, imgIndex, note) {
    try {
      var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; });
      if (!project) return;
      project.gallery = project.gallery || [];
      var g = project.gallery.find(function(x){ return x.id === entryId; });
      if (!g || !Array.isArray(g.images) || imgIndex < 0 || imgIndex >= g.images.length) return;
      var imgObj = g.images[imgIndex];
      if (typeof imgObj === 'string') {
        imgObj = { src: imgObj, note: note || '' };
        g.images[imgIndex] = imgObj;
      } else {
        imgObj.note = note || '';
      }
      saveData();
    } catch (e) { console.warn('updateGalleryImageNote failed', e); }
  }

  function removeStandaloneImage(entryId, imgIndex) {
    var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; });
    if (!project) return;
    project.gallery = project.gallery || [];
    var gIdx = project.gallery.findIndex(function(x){ return x.id === entryId; }); if (gIdx === -1) return;
    var g = project.gallery[gIdx]; if (!g.images || imgIndex < 0 || imgIndex >= g.images.length) return;
    // normalize any string-image entries into objects to avoid unexpected behavior
    g.images = g.images.map(function(it){ if (!it) return null; if (typeof it === 'string') return { src: it, note: '', title: '' }; return { src: it.src || it.data || it.image || '', note: it.note || '', title: it.title || '' }; }).filter(Boolean);
    // remove only the targeted image by index
    g.images.splice(imgIndex,1);
    // if no images remain, remove the entire gallery entry
    if (!g.images || g.images.length === 0) { project.gallery.splice(gIdx,1); }
    saveData(); renderGallery();
  }

  function deleteStandaloneEntry(entryId) { if (!confirm('Delete this gallery entry?')) return; var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; }); if (!project) return; project.gallery = project.gallery || []; project.gallery = project.gallery.filter(function(x){ return x.id !== entryId; }); saveData(); renderGallery(); }

  // Save edited gallery entry: persist title and image notes
  function saveGalleryEntry(entryId, imgIndex) {
    try {
      var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; });
      if (!project) return alert('No project selected');
      project.gallery = project.gallery || [];
      var g = project.gallery.find(function(x){ return x.id === entryId; });
      if (!g) return alert('Gallery entry not found');
      // Save title
      try { var titleEl = document.getElementById('gallery_title_' + entryId); if (titleEl) g.title = titleEl.value.trim(); } catch(e) {}
      // If an imgIndex is provided, save just that note; otherwise save all notes
      if (Array.isArray(g.images)) {
        if (typeof imgIndex === 'number' && imgIndex >= 0 && imgIndex < g.images.length) {
          try {
            var noteElSingle = document.getElementById('gallery_note_' + entryId + '_' + imgIndex);
            var titleElSingle = document.getElementById('gallery_img_title_' + entryId + '_' + imgIndex);
            if (noteElSingle) { var val2 = noteElSingle.value; if (typeof g.images[imgIndex] === 'string') { g.images[imgIndex] = { src: g.images[imgIndex], note: val2, title: (titleElSingle ? titleElSingle.value.trim() : '') }; } else { g.images[imgIndex].note = val2; if (titleElSingle) g.images[imgIndex].title = titleElSingle.value.trim(); } }
          } catch(e) { console.warn('Failed to save note for image', imgIndex, e); }
        } else {
          g.images.forEach(function(imgObj, idx){ try { var noteEl = document.getElementById('gallery_note_' + entryId + '_' + idx); var titleEl = document.getElementById('gallery_img_title_' + entryId + '_' + idx); if (noteEl) { var val = noteEl.value; if (typeof imgObj === 'string') { g.images[idx] = { src: imgObj, note: val, title: (titleEl ? titleEl.value.trim() : '') }; } else { imgObj.note = val; if (titleEl) imgObj.title = titleEl.value.trim(); } } } catch(e) { console.warn('Failed to save note for image', idx, e); } });
        }
      }
      saveData(); renderGallery();
      // small feedback
      try { alert('Gallery entry saved'); } catch(e) {}
    } catch (e) { console.warn('saveGalleryEntry failed', e); alert('Failed to save gallery entry'); }
  }

  // Fullscreen image viewer
  var _fsState = { open: false, entryId: null, imgIndex: 0 };

  function ensureFullscreenModal() {
    var modal = document.getElementById('galleryFullscreenModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'galleryFullscreenModal';
    modal.className = 'fullscreen-modal';
    modal.innerHTML = '<div class="fs-backdrop" id="fsBackdrop"></div><div class="fs-toolbar">' +
                       '<button class="icon-btn" id="fsPrev">◀</button>' +
                       '<button class="icon-btn" id="fsNext">▶</button>' +
                       '<button class="icon-btn" id="fsClose">✕</button>' +
                       '</div>' +
                       '<div class="fs-content" id="fsContent"></div>';
    document.body.appendChild(modal);
    // bind buttons
    document.getElementById('fsClose').addEventListener('click', closeFullscreenImage);
    document.getElementById('fsPrev').addEventListener('click', function(){ navigateFullscreen(-1); });
    document.getElementById('fsNext').addEventListener('click', function(){ navigateFullscreen(1); });
    document.getElementById('fsBackdrop').addEventListener('click', closeFullscreenImage);
    // keyboard navigation
    document.addEventListener('keydown', function(e){ if (!_fsState.open) return; if (e.key === 'Escape') closeFullscreenImage(); else if (e.key === 'ArrowLeft') navigateFullscreen(-1); else if (e.key === 'ArrowRight') navigateFullscreen(1); });
    return modal;
  }

  function openFullscreenImage(entryId, imgIndex) {
    try {
      var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; });
      if (!project) return;
      project.gallery = project.gallery || [];
      var g = project.gallery.find(function(x){ return x.id === entryId; });
      if (!g || !Array.isArray(g.images) || imgIndex < 0 || imgIndex >= g.images.length) return;
      _fsState.open = true; _fsState.entryId = entryId; _fsState.imgIndex = imgIndex;
      var modal = ensureFullscreenModal();
      modal.classList.add('active');
      renderFullscreenContent();
    } catch (e) { console.warn('openFullscreenImage failed', e); }
  }

  function renderFullscreenContent() {
    var modal = ensureFullscreenModal();
    var content = document.getElementById('fsContent'); if (!content) return;
    var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; }); if (!project) return;
    var g = project.gallery.find(function(x){ return x.id === _fsState.entryId; }); if (!g) return;
    var imgObj = g.images[_fsState.imgIndex]; if (!imgObj) return;
    var src = (typeof imgObj === 'string') ? imgObj : (imgObj.src || imgObj.image || imgObj.data || '');
    var title = (imgObj && (imgObj.title || '')) || '';
    var note = (imgObj && (imgObj.note || '')) || '';
    content.innerHTML = '<div class="fs-inner">' +
                         '<img src="' + escapeHtml(src) + '" class="fs-image" alt="">' +
                         '<div class="fs-meta">' +
                           '<div class="fs-title">' + escapeHtml(title) + '</div>' +
                           '<div class="fs-note">' + escapeHtml(note) + '</div>' +
                         '</div>' +
                       '</div>';
  }

  function closeFullscreenImage() { try { _fsState.open = false; var modal = document.getElementById('galleryFullscreenModal'); if (modal) modal.classList.remove('active'); } catch(e){ console.warn('closeFullscreenImage failed', e); } }

  function navigateFullscreen(delta) {
    try {
      var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; }); if (!project) return;
      var g = project.gallery.find(function(x){ return x.id === _fsState.entryId; }); if (!g || !Array.isArray(g.images)) return;
      var next = _fsState.imgIndex + delta;
      if (next < 0) next = g.images.length - 1; else if (next >= g.images.length) next = 0;
      _fsState.imgIndex = next;
      renderFullscreenContent();
    } catch (e) { console.warn('navigateFullscreen failed', e); }
  }

  try { if (typeof window !== 'undefined') { window.openFullscreenImage = openFullscreenImage; window.closeFullscreenImage = closeFullscreenImage; window.navigateFullscreen = navigateFullscreen; } } catch(e) {}

  // Update gallery entry title (persist immediately)
  function updateGalleryEntryTitle(entryId, title) {
    try {
      var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; });
      if (!project) return;
      project.gallery = project.gallery || [];
      var g = project.gallery.find(function(x){ return x.id === entryId; });
      if (!g) return;
      g.title = (title || '').trim();
      saveData();
      // keep editing area visible by only re-rendering gallery
      renderGallery();
    } catch (e) { console.warn('updateGalleryEntryTitle failed', e); }
  }

  // Update individual image title (persist immediately)
  function updateGalleryImageTitle(entryId, imgIndex, title) {
    try {
      var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; });
      if (!project) return;
      project.gallery = project.gallery || [];
      var g = project.gallery.find(function(x){ return x.id === entryId; });
      if (!g || !Array.isArray(g.images) || imgIndex < 0 || imgIndex >= g.images.length) return;
      var imgObj = g.images[imgIndex];
      if (typeof imgObj === 'string') {
        g.images[imgIndex] = { src: imgObj, note: (imgObj && imgObj.note) || '', title: (title || '').trim() };
      } else {
        imgObj.title = (title || '').trim();
      }
      saveData();
      renderGallery();
    } catch (e) { console.warn('updateGalleryImageTitle failed', e); }
  }

  // expose gallery helpers
  try { if (typeof window !== 'undefined') { window.updateGalleryEntryTitle = updateGalleryEntryTitle; window.updateGalleryImageTitle = updateGalleryImageTitle; } } catch(e) {}

  function removeProjectThumbnailById(projectId) { var p = (appData.projects || []).find(function(x){ return x.id === projectId; }); if (!p) return; p.thumbnailDataUrl = null; saveData(); renderProjects(); renderGallery(); }
  function removeMaterialThumbnailById(materialId) { var m = (appData.materials || []).find(function(x){ return x.id === materialId; }); if (!m) return; m.thumbnailDataUrl = null; saveData(); renderMaterials(); renderGallery(); }

  function exportGallery() { var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; }); if (!project || !project.gallery || project.gallery.length === 0) { alert('No gallery items to export for the selected project'); return; } var sanitized = (project.gallery || []).map(function(g){ return { id: g.id, title: g.title, images: Array.isArray(g.images) ? g.images.slice() : [], createdAt: g.createdAt || null }; }); var data = JSON.stringify(sanitized, null, 2); var blob = new Blob([data], { type: 'application/json' }); var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = 'BOManager_Gallery_' + (project.name ? project.name.replace(/[^a-z0-9]/gi,'_') + '_' : '') + Date.now() + '.json'; a.click(); URL.revokeObjectURL(url); }

  function importGallery() { var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; }); if (!project) { alert('Select a project before importing gallery items'); return; } var inp = document.getElementById('importGalleryFile'); if (!inp) { inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json'; inp.id = 'importGalleryFile'; inp.style.display = 'none'; inp.addEventListener('change', handleGalleryImport); document.body.appendChild(inp); } inp.click(); }

  function handleGalleryImport(e) {
    if (!e || !e.target || !e.target.files || e.target.files.length === 0) return; var f = e.target.files[0]; if (!f) return; var reader = new FileReader(); reader.onload = function(ev){ try { var parsed = JSON.parse(ev.target.result); if (!Array.isArray(parsed)) return alert('Invalid gallery file format (expected array)'); var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; }); if (!project) { return alert('Select a project before importing gallery items'); } project.gallery = project.gallery || []; parsed.forEach(function(item){ if (!item || !item.images) return; var id = item.id || generateUUID(); var existing = project.gallery.find(function(x){ return x.id === id; }); // normalize incoming images to {src,note}
  var normalized = (item.images || []).map(function(img){ if (!img) return null; if (typeof img === 'string') return { src: img, note: '', title: '', createdAt: null }; if (typeof img === 'object') return { src: img.src || img.image || img.data || '', note: img.note || '', title: img.title || '', createdAt: img.createdAt || null }; return null; }).filter(function(x){ return x && x.src; });
        if (existing) { existing.images = existing.images || []; // merge by src; preserve title if present on incoming images
          normalized.forEach(function(img){ var found = existing.images.find(function(e){ var s = (typeof e === 'string') ? e : (e && e.src) || ''; return s === img.src; }); if (!found) existing.images.push({ src: img.src, note: img.note || '', title: img.title || '', createdAt: img.createdAt || null }); });
  } else { project.gallery.push({ id: id, title: item.title || ('Image ' + (project.gallery.length + 1)), images: normalized.map(function(i){ return { src: i.src, note: i.note || '', title: i.title || '', createdAt: i.createdAt || new Date().toISOString() }; }), createdAt: item.createdAt || new Date().toISOString() }); } }); saveData(); renderGallery(); alert('Gallery imported for project ' + (project.name || '')); } catch(err) { alert('Failed to import gallery: Invalid file'); } }; reader.readAsText(f); e.target.value = ''; }


  // Toggle kit expand/collapse in inventory view
  function toggleKitExpand(materialId) {
    expandedKits[materialId] = !expandedKits[materialId];
    renderInventory();
  }

  // Prefill a material modal for a kit component (by kitId + component index)
  function prefillMaterialFromComponent(kitId, compIndex) {
    var kit = (appData.materials || []).find(function(m){ return m.id === kitId; }); if (!kit) return alert('Kit not found'); var comp = (kit.components || [])[compIndex]; if (!comp) return alert('Component not found'); // open material modal prefilled
    editingMaterialId = null;
    var set = function(id, val){ var el = document.getElementById(id); if (el) el.value = val; };
    set('materialName', comp.name || '');
    set('materialDescription', comp.description || '');
    set('materialUrl', comp.url || '');
    set('materialPrice', comp.pricePer != null ? comp.pricePer : '');
    set('materialPackSize', 1);
    set('materialVendor', kit.vendor || 'amazon');
    var currencyEl = document.getElementById('materialCurrency'); if (currencyEl) currencyEl.value = kit.currency || 'USD';
  var isPackEl = document.getElementById('materialIsPack'); if (isPackEl) isPackEl.checked = false;
  var packOpts = document.getElementById('materialPackOptions'); if (packOpts) packOpts.style.display = 'none';
  try { updateMaterialPackUI(); } catch(e) {}
    openModal('materialModal');
  }

  // Render the kit expansion modal body with editable vendor/currency for each proposed material
  function renderKitExpansionModal(pending) {
    var body = document.getElementById('kitExpansionBody'); if (!body) return;
    if (!pending || !pending.proposed || !pending.proposed.length) { body.innerHTML = '<div style="color:#999; padding:8px;">No missing components detected — nothing to create.</div>'; return; }
    // build rows for each proposed creation
    body.innerHTML = pending.proposed.map(function(p, i){ return '<div style="padding:8px; border-bottom:1px solid #222; display:flex; gap:8px; align-items:center;">' +
      '<div style="flex:2;">' + '<div style="font-weight:600;">' + escapeHtml(p.name) + '</div>' + '<div style="font-size:12px;color:#999;">URL: ' + escapeHtml(p.url || '—') + '</div>' + '</div>' +
      '<div style="flex:1;">' + '<label style="font-size:12px;color:#ccc; display:block;">Vendor</label>' + '<select class="form-select" data-idx="' + i + '" id="kitCreateVendor_' + i + '"><option value="amazon">Amazon</option><option value="aliexpress">AliExpress</option><option value="temu">Temu</option><option value="mcmaster">McMaster-Carr</option></select>' + '</div>' +
      '<div style="width:120px;">' + '<label style="font-size:12px;color:#ccc; display:block;">Currency</label>' + '<select class="form-select" id="kitCreateCurrency_' + i + '"><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="CAD">CAD</option><option value="AUD">AUD</option></select>' + '</div>' +
      '</div>'; }).join('');
    // set suggested values
    pending.proposed.forEach(function(p, i){ var vEl = document.getElementById('kitCreateVendor_' + i); if (vEl) vEl.value = p.suggestedVendor || 'amazon'; var cEl = document.getElementById('kitCreateCurrency_' + i); if (cEl) cEl.value = p.suggestedCurrency || 'USD'; });
  }

  // Confirm and create materials as per user input, then expand kit into BOM items
  function confirmKitExpansionCreate() {
    if (!_pendingKitExpansion) { closeModal('kitExpansionModal'); return; }
    var pending = _pendingKitExpansion; var created = 0, added = 0; var createdMap = {}; // map proposed index -> new material
  pending.proposed.forEach(function(p, i){ var vendorEl = document.getElementById('kitCreateVendor_' + i); var curEl = document.getElementById('kitCreateCurrency_' + i); var vendor = vendorEl ? vendorEl.value : (p.suggestedVendor || 'amazon'); var currency = curEl ? curEl.value : (p.suggestedCurrency || 'USD'); var newMat = { id: generateUUID(), name: p.name, description: '', url: p.url || '', pricePer: parseFloat(p.pricePer) || 0, packSize: 1, vendor: vendor, currency: currency, tags: [] }; appData.materials = appData.materials || []; appData.materials.push(newMat); createdMap[i] = newMat; created++; });
    // now add all components (existing matches or newly created) to the project's BOM
    var project = (appData.projects || []).find(function(pp){ return pp.id === pending.projectId; }); if (!project) { alert('Project not found'); closeModal('kitExpansionModal'); return; }
    pending.components.forEach(function(comp){ if (!comp || !comp.name) return; var match = null; if (comp.url) match = (appData.materials || []).find(function(m){ return m.url && m.url === comp.url; }); if (!match) match = (appData.materials || []).find(function(m){ return m.name && comp.name && m.name.toLowerCase() === comp.name.toLowerCase(); }); if (!match) {
        // find in createdMap by matching name
        for (var k in createdMap) { if (createdMap[k] && createdMap[k].name && createdMap[k].name.toLowerCase() === comp.name.toLowerCase()) { match = createdMap[k]; break; } }
      }
      if (!match) return;
      var vendorForComp = match.vendor || 'amazon'; project.boms = project.boms || {}; project.boms[vendorForComp] = project.boms[vendorForComp] || []; var bomItem = { name: match.name, url: match.url || comp.url || '', quantity: comp.quantity || 1, pricePer: match.pricePer || comp.pricePer || 0, packSize: 1, onHand: match.onHand || 0, status: 'pending' }; project.boms[vendorForComp].push(bomItem); added++; });
    saveData(); renderMaterials(); renderBOMs(); closeModal('kitExpansionModal'); _pendingKitExpansion = null; alert('Created ' + created + ' materials and added ' + added + ' BOM items for kit expansion.');
  }

  // --- Inventory backup/restore ---
  function createInventoryBackup() {
    appData.inventoryBackups = appData.inventoryBackups || [];
    var snapshot = { timestamp: new Date().toISOString(), materials: JSON.parse(JSON.stringify(appData.materials || [])) };
    appData.inventoryBackups.push(snapshot);
    saveData(); renderInventoryBackupsList(); alert('Inventory backup created (' + new Date().toLocaleString('en-US') + ')');
  }

  function renderInventoryBackupsList() {
    var container = document.getElementById('inventoryBackupsList'); if (!container) return;
    appData.inventoryBackups = appData.inventoryBackups || [];
    if (appData.inventoryBackups.length === 0) { container.innerHTML = '<div style="color:#999; padding:8px;">No backups available</div>'; return; }
    container.innerHTML = appData.inventoryBackups.map(function(b, i){ var ts = new Date(b.timestamp); var label = ts.toLocaleString('en-US', { year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', hour12:true }); return '<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid #222;">' + '<div style="font-size:13px;">' + label + ' <span style="font-size:12px;color:#999; margin-left:8px;">(' + (b.materials ? b.materials.length : 0) + ' items)</span></div>' + '<div style="display:flex; gap:8px;"><button class="btn btn-small" onclick="previewInventoryBackup(' + i + ')">Preview</button><button class="btn btn-small" onclick="importInventoryBackup(' + i + ')">Import</button></div></div>'; }).join('');
  }

  function previewInventoryBackup(index) {
    var b = (appData.inventoryBackups || [])[index]; if (!b) return alert('Backup not found'); var previewEl = document.getElementById('inventoryBackupPreviewBody'); if (!previewEl) return; previewEl.innerHTML = '<div style="max-height:320px; overflow:auto; padding:8px; background:#050505;">' + (b.materials || []).map(function(m){ return '<div style="padding:6px; border-bottom:1px solid #111;"><strong>' + escapeHtml(m.name) + '</strong> • On-hand: ' + (m.onHand != null ? m.onHand : 0) + '</div>'; }).join('') + '</div>'; document.getElementById('inventoryBackupPreviewTimestamp') && (document.getElementById('inventoryBackupPreviewTimestamp').textContent = new Date(b.timestamp).toLocaleString('en-US')); openModal('inventoryBackupPreviewModal'); }

  function importInventoryBackup(index) {
    var b = (appData.inventoryBackups || [])[index]; if (!b) return alert('Backup not found'); // warn user with confirm including timestamp and warning that it will overwrite on-hand counts
    var ts = new Date(b.timestamp).toLocaleString('en-US'); if (!confirm('Import inventory backup from ' + ts + '? This will overwrite current on-hand counts for matching materials and cannot be undone.')) return;
    // create a snapshot so the user can undo this import if needed
    try { _lastImportSnapshot = JSON.parse(JSON.stringify(appData)); } catch (e) { _lastImportSnapshot = null; }
    // apply: match by name+vendor+url where possible; update onHand counts only
    (b.materials || []).forEach(function(bm){ var match = (appData.materials || []).find(function(m){ if (!m) return false; if (bm.id && m.id === bm.id) return true; if (m.url && bm.url && m.url === bm.url) return true; if (m.name && bm.name && m.name.toLowerCase() === bm.name.toLowerCase() && m.vendor === bm.vendor) return true; return false; }); if (match) { match.onHand = bm.onHand != null ? bm.onHand : 0; } });
    saveData(); renderInventory(); renderMaterials(); alert('Inventory backup imported and applied. You can undo this action via Undo (Edit -> Undo Import) or by calling Undo from the Import/Preview UI.');
  }

  // Prefill material modal from a missing project BOM item (index corresponds to needs array in renderInventory)
  function prefillMaterialFromMissing(idx) {
    try { console.debug('[DEBUG] prefillMaterialFromMissing called with idx=', idx); } catch(e) {}
    var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; });
    if (!project || !project.boms) { alert('No project selected or no BOM available'); return; }
    var needs = [];
  ['amazon','aliexpress','temu','mcmaster'].forEach(function(v){ (project.boms[v] || []).forEach(function(item){ var clone = Object.assign({ vendor: v }, item); clone._vendor = v; needs.push(clone); }); });
    var item = needs[idx]; if (!item) { alert('Item not found'); return; }
    // prefill material modal fields; set editingMaterialId = null to create a new material
    editingMaterialId = null;
    var set = function(id, val){ var el = document.getElementById(id); if (el) el.value = val; };
    set('materialName', item.name || '');
    set('materialDescription', item.description || '');
    set('materialUrl', item.url || '');
    set('materialPrice', item.pricePer != null ? item.pricePer : '');
    set('materialPackSize', item.packSize || '');
    set('materialVendor', item.vendor || item._vendor || 'amazon');
    var currencyEl = document.getElementById('materialCurrency'); if (currencyEl) currencyEl.value = item.currency || 'USD';
  var isPackEl = document.getElementById('materialIsPack'); if (isPackEl) isPackEl.checked = !!item.isPack;
  var packOpts = document.getElementById('materialPackOptions'); if (packOpts) packOpts.style.display = item.isPack ? 'block' : 'none';
  try { updateMaterialPackUI(); } catch(e) {}
    var packSizeOptionEl = document.getElementById('materialPackSizeOption'); if (packSizeOptionEl) packSizeOptionEl.value = item.packSizeOption || item.packSize || '';
    // warn user to check sources/imports
    if (!item.url) {
      if (!confirm('This BOM item does not include a product URL. Add to Materials Library anyway? (Consider checking Sources / Imports first)')) return;
    }
    openModal('materialModal');
  }

  // Inventory notes: persisted at top-level appData.inventoryNotes (array of {content, timestamp})
  function renderInventoryNotes() {
    var container = document.getElementById('inventoryNotesList'); if (!container) return;
    appData.inventoryNotes = appData.inventoryNotes || [];
    if (appData.inventoryNotes.length === 0) { container.innerHTML = '<div style="color:#999; padding:12px;">No inventory notes</div>'; return; }
    container.innerHTML = appData.inventoryNotes.map(function(n,i){ return '<div class="note-item"><div class="note-actions">' + (i>0?('<button class="icon-btn" onclick="moveInventoryNote(' + i + ', -1)">↑</button>'):'') + (i < appData.inventoryNotes.length-1?('<button class="icon-btn" onclick="moveInventoryNote(' + i + ', 1)">↓</button>'):'') + '<button class="icon-btn" onclick="editInventoryNote(' + i + ')">✏️</button><button class="icon-btn" onclick="deleteInventoryNote(' + i + ')">🗑️</button></div><div class="note-content">' + linkifyText(escapeHtml(n.content)) + '</div><div class="note-timestamp">' + (n.timestamp || '') + '</div></div>'; }).join('');
  }

  function showAddInventoryNoteModal() { editingInventoryNoteIndex = null; var el = document.getElementById('inventoryNoteContent'); if (el) el.value = ''; openModal('inventoryNoteModal'); }
  function editInventoryNote(index) { editingInventoryNoteIndex = index; var n = (appData.inventoryNotes || [])[index]; if (!n) return; var el = document.getElementById('inventoryNoteContent'); if (el) el.value = n.content; openModal('inventoryNoteModal'); }
  function saveInventoryNote() { var content = document.getElementById('inventoryNoteContent') ? document.getElementById('inventoryNoteContent').value.trim() : ''; if (!content) { alert('Note content is required'); return; } appData.inventoryNotes = appData.inventoryNotes || []; var ts = new Date().toISOString().replace('T',' ').substring(0,16); if (editingInventoryNoteIndex !== null && editingInventoryNoteIndex !== undefined) { appData.inventoryNotes[editingInventoryNoteIndex].content = content; appData.inventoryNotes[editingInventoryNoteIndex].timestamp = ts; } else { appData.inventoryNotes.push({ content: content, timestamp: ts }); } saveData(); renderInventoryNotes(); closeModal('inventoryNoteModal'); }
  function deleteInventoryNote(idx) { if (!confirm('Delete this inventory note?')) return; appData.inventoryNotes = appData.inventoryNotes || []; appData.inventoryNotes.splice(idx,1); saveData(); renderInventoryNotes(); }
  function moveInventoryNote(index, direction) { appData.inventoryNotes = appData.inventoryNotes || []; var newIndex = index + direction; if (newIndex < 0 || newIndex >= appData.inventoryNotes.length) return; var tmp = appData.inventoryNotes[newIndex]; appData.inventoryNotes[newIndex] = appData.inventoryNotes[index]; appData.inventoryNotes[index] = tmp; saveData(); renderInventoryNotes(); }


  function updateInventoryOnHand(id, val) {
    var n = parseInt(val); if (isNaN(n) || n < 0) n = 0; var mat = (appData.materials || []).find(function(x){ return x.id === id; }); if (!mat) return; mat.onHand = n; saveData(); renderInventory(); renderMaterials(); }

  function addInventoryToCurrentProject(materialId, vendorOverride) {
    try {
      try { console.debug('[DEBUG][addInventoryToCurrentProject] called with', materialId); } catch(e){}
      var mat = (appData.materials || []).find(function(m){ return m.id === materialId; });
      if (!mat) { console.warn('Material not found', materialId); return; }
      if (!appData.currentProjectId) { console.warn('Select a project first'); return; }
      var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; }); if (!project) { console.warn('Project not found'); return; }

      // If this material is a kit/pack with components, expand automatically:
  if (mat.isPack && Array.isArray(mat.components) && mat.components.length > 0) {
        // Ensure project.boms exists
        project.boms = project.boms || {};
        var added = 0;
        mat.components.forEach(function(comp){
          if (!comp || !comp.name) return;
          // try to find an existing material by URL or name
          var match = null;
          if (comp.url) match = (appData.materials || []).find(function(m){ return m.url && m.url === comp.url; });
          if (!match) match = (appData.materials || []).find(function(m){ return m.name && comp.name && m.name.toLowerCase() === comp.name.toLowerCase(); });
          // if not found, create a new material entry
          if (!match) {
            // create a new material entry for this component
            var newMat = { id: generateUUID(), name: comp.name, description: comp.description || '', url: comp.url || '', pricePer: parseFloat(comp.pricePer) || 0, packSize: 1, vendor: mat.vendor || 'amazon', currency: mat.currency || 'USD', tags: [], onHand: 0 };
            appData.materials = appData.materials || [];
            appData.materials.push(newMat);
            match = newMat;
          }
          // add BOM item for the matched material
          var vendorForComp = match.vendor || mat.vendor || 'amazon';
          project.boms[vendorForComp] = project.boms[vendorForComp] || [];
          var bomItem = { name: match.name, url: match.url || comp.url || '', quantity: comp.quantity || 1, pricePer: match.pricePer || comp.pricePer || 0, packSize: 1, onHand: match.onHand || 0, status: 'pending', __linkedMaterialId: match.id };
          project.boms[vendorForComp].push(bomItem);
          // Defensive: ensure the canonical BOM entry we just pushed has the linked marker set (avoid any clone/indexing surprises)
          try { project.boms[vendorForComp][project.boms[vendorForComp].length - 1].__linkedMaterialId = match.id; } catch(e){}
          added++;
        });
        saveData();
        try { renderBOMs(); } catch(e){}
        try { renderInventory(); } catch(e){}
        try { renderMaterials(); } catch(e){}
        return;
      }

      // Default behavior for non-kits: prefer linking to an existing BOM entry for this project need
  // vendorOverride can force which vendor BOM to add into (picker or UI can supply)
  var vendor = vendorOverride || mat.vendor || 'amazon';
      project.boms = project.boms || {};
      var linked = false;
      try {
        var vendors = ['amazon','aliexpress','temu','mcmaster'];
        for (var vi = 0; vi < vendors.length; vi++) {
          var v = vendors[vi];
          var list = project.boms[v] || [];
          for (var bi = 0; bi < list.length; bi++) {
            var bomEntry = list[bi];
            if (!bomEntry) continue;
            var matches = false;
            if (bomEntry.url && mat.url && bomEntry.url === mat.url) matches = true;
            if (!matches && bomEntry.name && mat.name && bomEntry.name.toLowerCase() === mat.name.toLowerCase()) matches = true;
            if (matches) {
              // link this canonical BOM entry to the material instead of creating a duplicate
              project.boms[v][bi].__linkedMaterialId = mat.id;
              linked = true;
              break;
            }
          }
          if (linked) break;
        }
  } catch (e) { console.warn('link search failed', e); }

      if (linked) {
        try { console.debug('[DEBUG][addInventoryToCurrentProject] linked existing BOM entry to material', { materialId: mat.id }); } catch(e){}
        saveData();
        try { renderBOMs(); } catch(e){}
        try { renderInventory(); } catch(e){}
        try { renderMaterials(); } catch(e){}
        return;
      }

      // No existing BOM entry matched — create a new BOM item and mark it linked
    var item = { name: mat.name, url: mat.url || '', quantity: 1, pricePer: mat.pricePer || 0, packSize: mat.packSize || 1, onHand: mat.onHand || 0, status: 'pending', __linkedMaterialId: mat.id };
    project.boms[vendor] = project.boms[vendor] || [];
    project.boms[vendor].push(item);
  // Defensive: explicitly mark the canonical BOM entry we just added
  try { project.boms[vendor][project.boms[vendor].length - 1].__linkedMaterialId = mat.id; } catch(e){}
      try { console.debug('[DEBUG][addInventoryToCurrentProject] created new BOM entry', { vendor: vendor, item: item, projectId: project.id }); } catch(e){}
      saveData();
  try { console.debug('[DEBUG][addInventoryToCurrentProject] project.boms after create', JSON.parse(JSON.stringify(project.boms || {}))); } catch(e){}
      try { renderBOMs(); } catch(e){}
      try { renderInventory(); } catch(e){}
      try { renderMaterials(); } catch(e){}
    } catch (e) {
      console.warn('addInventoryToCurrentProject failed', e);
    }
  }

  // defensive export so inline onclicks / old code can call this
  try { window.addInventoryToCurrentProject = addInventoryToCurrentProject; } catch(e) {}

  // --- Project Material Picker (searchable modal similar to Inventory Add-onboarding) ---
  var _projectPickerCurrentVendor = null;
  var _projectPickerResults = [];
  var _projectPickerIndex = -1;
  var _projectPickerSelectedId = null;

  function showProjectMaterialPicker(vendor) {
    _projectPickerCurrentVendor = vendor || 'amazon';
    _projectPickerResults = [];
    _projectPickerIndex = -1;
    _projectPickerSelectedId = null;
    var inp = document.getElementById('projectMaterialSearch'); if (inp) { inp.value = ''; // if vendor == '' means allow all; otherwise set dataset vendor to filter
      inp.dataset.vendor = (_projectPickerCurrentVendor === '' ? '' : _projectPickerCurrentVendor);
      inp.focus(); }
    // set inline new-form vendor display so quick-create shows correct vendor
    try { var vendorField = document.getElementById('pickerNewVendor'); if (vendorField) vendorField.value = (_projectPickerCurrentVendor || 'amazon'); } catch(e) {}
    try { var modalVendor = document.getElementById('projectPickerVendorSelect'); if (modalVendor) { modalVendor.value = vendor || ''; } } catch(e) {}
    renderProjectMaterialLookup([]);
    openModal('projectMaterialPickerModal');
  }

  function renderProjectMaterialLookup(results) {
    _projectPickerResults = results || [];
    _projectPickerIndex = -1; _projectPickerSelectedId = null;
    var panel = document.getElementById('projectMaterialLookupPanel');
    var wheel = document.getElementById('projectMaterialLookupWheel');
    var dropdown = document.getElementById('projectMaterialDropdown');
    if (!results || results.length === 0) {
      if (panel) panel.style.display = 'none';
      if (dropdown) { dropdown.style.display = 'none'; dropdown.innerHTML = ''; }
      if (wheel) wheel.innerHTML = '';
      return;
    }
    var itemsHtml = results.map(function(m,i){ var desc = m.description ? ('<div class="lookup-desc" style="font-size:12px;color:#999;margin-top:6px;">' + escapeHtml((m.description||'').substring(0,220)) + '</div>') : ''; return '<div class="lookup-item" data-idx="' + i + '" data-id="' + escapeHtml(m.id) + '" role="option" tabindex="-1" style="padding:8px; border-radius:6px; margin-bottom:6px; background:#0b0b0b;">' + '<div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">' + '<div style="font-weight:600; color:#ddd;">' + escapeHtml(m.name) + '</div>' + '<div class="lookup-meta" style="font-size:12px;color:#999;">' + escapeHtml((m.vendor||'').toUpperCase()) + ' • ' + formatCurrency(m.pricePer, m.currency) + '</div>' + '</div>' + desc + '</div>'; }).join('');
    if (wheel) {
      wheel.innerHTML = itemsHtml;
      try { wheel.style.zIndex = 2000; wheel.style.pointerEvents = 'auto'; } catch(e){}
      if (panel) panel.style.display = 'block';
      if (!wheel._pickerHandler) {
        wheel.addEventListener('click', function(ev){ var el = ev.target; while (el && el !== wheel && !el.classList.contains('lookup-item')) el = el.parentNode; if (!el || el === wheel) return; var idx = parseInt(el.getAttribute('data-idx')); if (isNaN(idx)) return; selectProjectMaterial(idx); });
        wheel.addEventListener('keydown', function(ev){ if (ev.key === 'ArrowDown') { ev.preventDefault(); _projectPickerIndex = Math.min(_projectPickerIndex + 1, _projectPickerResults.length - 1); focusProjectPickerItem(wheel, _projectPickerIndex); } else if (ev.key === 'ArrowUp') { ev.preventDefault(); _projectPickerIndex = Math.max(_projectPickerIndex - 1, 0); focusProjectPickerItem(wheel, _projectPickerIndex); } else if (ev.key === 'Enter') { ev.preventDefault(); if (_projectPickerIndex >= 0) selectProjectMaterial(_projectPickerIndex); } });
        wheel._pickerHandler = true;
      }
      var nodes = wheel.querySelectorAll('.lookup-item');
      nodes.forEach(function(it,ii){ it.addEventListener('mouseover', function(){ _projectPickerIndex = ii; highlightProjectPicker(ii); }); it.style.cursor = 'pointer'; });
      try { wheel.focus(); } catch(e){}
    } else if (dropdown) { dropdown.innerHTML = itemsHtml; dropdown.style.display = 'block'; }
  }

  function focusProjectPickerItem(wheel, idx) { var nodes = wheel.querySelectorAll('.lookup-item'); nodes.forEach(function(n,i){ n.style.background = (i === idx) ? '#222' : ''; if (i === idx) { try { n.scrollIntoView({ block: 'nearest' }); } catch(e){} } }); }
  function highlightProjectPicker(idx) { var items = document.querySelectorAll('#projectMaterialDropdown .lookup-item'); items.forEach(function(it,i){ it.style.background = i === idx ? '#222' : ''; }); }

  function selectProjectMaterial(i) { var m = _projectPickerResults[i]; if (!m) return; _projectPickerSelectedId = m.id; _projectPickerIndex = i; // visually highlight
    var wheel = document.getElementById('projectMaterialLookupWheel'); if (wheel) { var nodes = wheel.querySelectorAll('.lookup-item'); nodes.forEach(function(n,ii){ n.style.border = ii === i ? '1px solid var(--accent-color)' : ''; }); }
    // Immediately add the selected material to the current project's BOM (on click/enter)
    try {
      if (_projectPickerSelectedId) {
        var vendorSel = document.getElementById('projectPickerVendorSelect');
        var vendorOverride = vendorSel && vendorSel.value ? vendorSel.value : null;
        addInventoryToCurrentProject(_projectPickerSelectedId, vendorOverride);
        closeModal('projectMaterialPickerModal');
      }
    } catch (e) { console.warn('selectProjectMaterial add failed', e); }
  }

  function confirmProjectMaterialPick() {
    if (!_projectPickerSelectedId) { alert('Please select a material from the list or create a new one.'); return; }
    try {
      var vendorSel = document.getElementById('projectPickerVendorSelect');
      var vendorOverride = vendorSel && vendorSel.value ? vendorSel.value : null;
      addInventoryToCurrentProject(_projectPickerSelectedId, vendorOverride);
    } catch(e) { console.warn('confirmProjectMaterialPick failed', e); }
    closeModal('projectMaterialPickerModal');
  }

  // wire the search input for the picker
  try {
    var projectMaterialSearch = document.getElementById('projectMaterialSearch');
    if (projectMaterialSearch && !projectMaterialSearch._attached) {
      projectMaterialSearch.addEventListener('input', function(e){ var q = (e.target.value || '').trim().toLowerCase(); var vendor = e.target.dataset.vendor || null; if (!q) { renderProjectMaterialLookup([]); return; } var results = (appData.materials || []).filter(function(m){ if (!m) return false; if (vendor && m.vendor !== vendor) return false; return (m.name && m.name.toLowerCase().includes(q)) || (m.description && m.description.toLowerCase().includes(q)) || (m.vendor && m.vendor.toLowerCase().includes(q)) || (m.tags && m.tags.join(' ').toLowerCase().includes(q)); }).slice(0,80); renderProjectMaterialLookup(results); });
      projectMaterialSearch.addEventListener('keydown', function(e){ var panel = document.getElementById('projectMaterialLookupPanel'); if (!panel || panel.style.display === 'none') return; if (e.key === 'ArrowDown') { e.preventDefault(); _projectPickerIndex = Math.min(_projectPickerIndex + 1, _projectPickerResults.length - 1); focusProjectPickerItem(document.getElementById('projectMaterialLookupWheel'), _projectPickerIndex); } else if (e.key === 'ArrowUp') { e.preventDefault(); _projectPickerIndex = Math.max(_projectPickerIndex - 1, 0); focusProjectPickerItem(document.getElementById('projectMaterialLookupWheel'), _projectPickerIndex); } else if (e.key === 'Enter') { e.preventDefault(); if (_projectPickerIndex >= 0) selectProjectMaterial(_projectPickerIndex); }
      });
      projectMaterialSearch._attached = true;
    }
  } catch(e) { console.warn('Failed to attach projectMaterialSearch handlers', e); }

  // Inline quick-create support for the Project Material Picker modal
  function toggleProjectPickerNewForm(show) {
    try {
      var panel = document.getElementById('projectPickerNewForm');
      var toggleBtn = document.getElementById('projectPickerToggleNewBtn');
      if (!panel) return;
      panel.style.display = show ? 'block' : 'none';
      if (toggleBtn) toggleBtn.textContent = show ? 'Close Quick Create' : '+ New Material';
      // set vendor field when showing
      if (show) {
        var v = _projectPickerCurrentVendor || 'amazon';
        var vendorField = document.getElementById('pickerNewVendor'); if (vendorField) vendorField.value = v;
        // prefill pack/currency defaults
        var cur = document.getElementById('pickerNewCurrency'); if (cur && !cur.value) cur.value = appSettings.currencyDefault || 'USD';
        // focus name input for faster entry
        try { var nameEl = document.getElementById('pickerNewName'); if (nameEl) { nameEl.focus(); nameEl.select && nameEl.select(); } } catch(e){}
      }
    } catch(e) { console.warn('toggleProjectPickerNewForm failed', e); }
  }

  function createMaterialFromPicker() {
    try {
      var name = (document.getElementById('pickerNewName') && document.getElementById('pickerNewName').value.trim()) || '';
      if (!name) return alert('Name is required to create a material');
      var url = (document.getElementById('pickerNewUrl') && document.getElementById('pickerNewUrl').value.trim()) || '';
      var priceRaw = document.getElementById('pickerNewPrice') ? document.getElementById('pickerNewPrice').value : '';
      var price = priceRaw === '' ? 0 : parseFloat(priceRaw);
      var packSize = parseInt(document.getElementById('pickerNewPack') ? document.getElementById('pickerNewPack').value : '') || 1;
      var currency = document.getElementById('pickerNewCurrency') ? document.getElementById('pickerNewCurrency').value : (appSettings.currencyDefault || 'USD');
  // prefer the modal-level vendor selector if user chose one, otherwise fallback to inline field
  var modalVendorSel = document.getElementById('projectPickerVendorSelect');
  var vendor = (modalVendorSel && modalVendorSel.value) ? modalVendorSel.value : (document.getElementById('pickerNewVendor') ? document.getElementById('pickerNewVendor').value : (_projectPickerCurrentVendor || 'amazon'));
      // Basic validation: if URL provided ensure valid
      if (url && !isValidUrl(url)) return alert('Please enter a valid URL (must start with http:// or https://)');
      // Ensure a project is selected before attempting to add to its BOM
      if (!appData.currentProjectId) { return alert('No project selected. Open a project before adding materials to its BOM.'); }
      // Create material object
      var mat = { id: generateUUID(), name: name, description: '', url: url || '', pricePer: isNaN(price) ? 0 : price, packSize: packSize || 1, vendor: vendor || 'amazon', currency: currency || (appSettings.currencyDefault || 'USD'), tags: [] };
      appData.materials = appData.materials || [];
      appData.materials.push(mat);
      saveData();
      renderMaterials();
      // After creating, link it to current project BOM
      try {
        var modalVendorSel2 = document.getElementById('projectPickerVendorSelect');
        var vendorOverride2 = modalVendorSel2 && modalVendorSel2.value ? modalVendorSel2.value : null;
        addInventoryToCurrentProject(mat.id, vendorOverride2);
      } catch(e){ console.warn('Failed to add newly created material to BOM', e); }
      // Close the picker modal and reset quick-create; clear inputs for next use
      try {
        toggleProjectPickerNewForm(false);
        var els = ['pickerNewName','pickerNewUrl','pickerNewPrice','pickerNewPack']; els.forEach(function(id){ var e = document.getElementById(id); if (e) e.value = ''; });
      } catch(e){}
      closeModal('projectMaterialPickerModal');
    } catch(e) { console.warn('createMaterialFromPicker failed', e); alert('Failed to create material'); }
  }

  // expose for legacy inline use
  try { window.showProjectMaterialPicker = showProjectMaterialPicker; window.confirmProjectMaterialPick = confirmProjectMaterialPick; window.toggleProjectPickerNewForm = toggleProjectPickerNewForm; window.createMaterialFromPicker = createMaterialFromPicker; window.selectProjectMaterial = selectProjectMaterial; } catch(e) {}

  function refreshInventoryThumbnails() {
    // Reuse embedMissingProjectThumbnails for projects and run similar for materials
    var promises = [];
    (appData.materials || []).forEach(function(m){ if (!m) return; if (m.thumbnailDataUrl && m.thumbnailDataUrl.indexOf('data:') === 0) return; var candidate = m.thumbnailDataUrl || m.url || null; if (candidate && typeof candidate === 'string' && candidate.indexOf('http') === 0) { var p = resizeImageFromUrl(candidate, imageSettings.maxDimension).then(function(dataUrl){ m.thumbnailDataUrl = dataUrl; }).catch(function(err){ console.warn('refreshInventoryThumbnails failed for', candidate, err); }); promises.push(p); } });
    // also attempt projects
    (appData.projects || []).forEach(function(p){ if (!p) return; if (p.thumbnailDataUrl && p.thumbnailDataUrl.indexOf('data:') === 0) return; var candidate = p.thumbnailDataUrl || (p.metadata && (p.metadata.icon || p.metadata.image)) || null; if (candidate && typeof candidate === 'string' && candidate.indexOf('http') === 0) { var pr = resizeImageFromUrl(candidate, imageSettings.maxDimension).then(function(dataUrl){ p.thumbnailDataUrl = dataUrl; }).catch(function(err){ console.warn('refreshInventoryThumbnails project failed for', candidate, err); }); promises.push(pr); } });
    if (promises.length === 0) { alert('No external thumbnails found to embed'); return; }
    Promise.all(promises).then(function(){ saveData(); renderMaterials(); renderProjects(); renderInventory(); alert('Embedding attempts complete'); }).catch(function(){ saveData(); renderMaterials(); renderProjects(); renderInventory(); alert('Embedding attempts complete (some may have failed)'); });
  }

  function exportMaterials() { if (!appData.materials || appData.materials.length === 0) { alert('No materials to export'); return; } var data = JSON.stringify(appData.materials, null, 2); var blob = new Blob([data], { type: 'application/json' }); var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = 'BOManager_Materials_' + Date.now() + '.json'; a.click(); URL.revokeObjectURL(url); }

  function importMaterials() { var inp = document.getElementById('importMaterialsFile'); if (inp) inp.click(); }

  function handleMaterialsImport(e) {
    try {
      console.debug('[DEBUG] handleMaterialsImport called', { processing: (e && e.target && e.target._processing) });
      if (e && e.target && e.target._processing) return; // ignore duplicate change events
      if (e && e.target) e.target._processing = true;
    } catch(e){}
    var file = e.target.files[0]; if (!file) { try { if (e && e.target) e.target._processing = false; } catch(e){} return; }
    var reader = new FileReader();
    reader.onload = function(event){
      try {
        var materials = JSON.parse(event.target.result);
        if (!Array.isArray(materials)) { alert('Invalid materials file format'); return; }
        showImportPreview('materials', materials);
        console.debug('[DEBUG] handleMaterialsImport parsed and requested preview', { count: materials.length });
      } catch(err) { alert('Failed to import materials: Invalid file format'); }
      try { if (e && e.target) e.target._processing = false; } catch(e){}
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // BOM rendering and management (vendor-specific)
  function renderBOMs() {
    var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; });
    if (!project) return;
    ['amazon','aliexpress','temu','mcmaster'].forEach(function(v){ renderBOM(v, project.boms[v] || []); });
  }

  function renderBOM(vendor, items) {
    var container = document.getElementById(vendor + 'BOM');
    if (!container) return;
    var subtotal = 0;
    var rows = items.map(function(item, index){
      var packMultiplier = Math.ceil((item.quantity || 0) / (item.packSize || 1));
      var itemTotal = packMultiplier * (item.pricePer || 0);
      subtotal += itemTotal;
      return '<tr>' +
        '<td>' + (item.url ? '<a href="' + escapeHtml(item.url) + '" target="_blank" style="color:var(--accent-color);">' + escapeHtml(item.name) + '</a>' : escapeHtml(item.name)) + '</td>' +
        '<td>' + (item.quantity || '') + '</td>' +
        '<td>' + (item.pricePer != null ? (item.pricePer).toFixed(2) : '') + '</td>' +
        '<td>' + (item.packSize || 1) + '</td>' +
        '<td>' + (item.onHand || 0) + '</td>' +
        '<td><span class="status-badge status-' + (item.status || 'pending') + '">' + (item.status || 'pending') + '</span></td>' +
        '<td>' + (itemTotal.toFixed(2)) + '</td>' +
        '<td><button class="icon-btn" onclick="editBOMItem(\'' + vendor + '\', ' + index + ')">✏️</button><button class="icon-btn" onclick="deleteBOMItem(\'' + vendor + '\', ' + index + ')">🗑️</button></td>' +
      '</tr>';
    }).join('');
    var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; });
    var shipping = project && project.shipping ? (project.shipping[vendor] || 0) : 0;
    var total = subtotal + (shipping || 0);
    var totalSpan = document.getElementById(vendor + 'Total'); if (totalSpan) totalSpan.textContent = total.toFixed(2);
    container.innerHTML = '<table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Pack</th><th>On Hand</th><th>Status</th><th>Total</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="cost-summary"><div class="cost-row"><span>Subtotal:</span><span>' + subtotal.toFixed(2) + '</span></div>' + (shipping > 0 ? '<div class="cost-row"><span>Shipping:</span><span>' + shipping.toFixed(2) + '</span></div>' : '') + '<div class="cost-row cost-total"><span>Total:</span><span>' + total.toFixed(2) + '</span></div></div>';
  }

  function showAddBOMItemModal(vendor) {
    currentBOMVendor = vendor;
    if (window._originalSaveBOMItem) { window.saveBOMItem = window._originalSaveBOMItem; delete window._originalSaveBOMItem; }
    var lookup = document.getElementById('bomMaterialLookup'); if (lookup) { lookup.dataset.vendor = vendor; lookup.value = ''; renderBomLookupDropdown([]); }
    var fields = ['bomItemName','bomItemUrl','bomQuantity','bomPrice','bomPackSize','bomOnHand'];
    fields.forEach(function(id){ var el = document.getElementById(id); if (el) el.value = (id === 'bomQuantity' ? '1' : (id === 'bomPackSize' ? '1' : '')); });
    document.getElementById('bomStatus') && (document.getElementById('bomStatus').value = 'pending');
    openModal('bomItemModal');
    setTimeout(function(){ var lk = document.getElementById('bomMaterialLookup'); if (lk) lk.focus(); }, 50);
  }

  // BOM lookup helpers
  var bomLookupResults = [];
  var bomLookupIndex = -1;
  function renderBomLookupDropdown(results) {
    bomLookupResults = results || [];
    bomLookupIndex = -1;
    var panel = document.getElementById('bomLookupPanel');
    var wheel = document.getElementById('bomLookupWheel');
    var dropdown = document.getElementById('bomMaterialDropdown');
    if (!results || results.length === 0) {
      if (panel) panel.style.display = 'none';
      if (dropdown) { dropdown.style.display = 'none'; dropdown.innerHTML = ''; }
      if (wheel) wheel.innerHTML = '';
      return;
    }

    var itemsHtml = results.map(function(m,i){
      var desc = m.description ? ('<div class="lookup-desc" style="font-size:12px;color:#999;margin-top:6px;">' + escapeHtml((m.description||'').substring(0,220)) + '</div>') : '';
      return '<div class="lookup-item" data-idx="' + i + '" role="option" tabindex="-1" style="padding:8px; border-radius:6px; margin-bottom:6px; background:#0b0b0b;">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">' +
          '<div style="font-weight:600; color:#ddd;">' + escapeHtml(m.name) + '</div>' +
          '<div class="lookup-meta" style="font-size:12px;color:#999;">' + escapeHtml((m.vendor||'').toUpperCase()) + ' • ' + formatCurrency(m.pricePer, m.currency) + '</div>' +
        '</div>' + desc + '</div>';
    }).join('');

    if (wheel) {
      wheel.innerHTML = itemsHtml;
      // ensure the wheel can receive pointer events and appears above overlays
      try { wheel.style.zIndex = 2000; wheel.style.pointerEvents = 'auto'; } catch(e){}
      if (panel) panel.style.display = 'block';
      // Attach delegated click handler once
      if (!wheel._hasHandler) {
        wheel.addEventListener('click', function(ev){
          var el = ev.target;
          while (el && el !== wheel && !el.classList.contains('lookup-item')) el = el.parentNode;
          if (!el || el === wheel) return;
          var idx = el.getAttribute('data-idx'); if (!idx) return; selectBomLookup(parseInt(idx));
        });
        wheel.addEventListener('keydown', function(ev){
          if (ev.key === 'ArrowDown') { ev.preventDefault(); bomLookupIndex = Math.min(bomLookupIndex + 1, bomLookupResults.length - 1); focusLookupItem(wheel, bomLookupIndex); }
          else if (ev.key === 'ArrowUp') { ev.preventDefault(); bomLookupIndex = Math.max(bomLookupIndex - 1, 0); focusLookupItem(wheel, bomLookupIndex); }
          else if (ev.key === 'Enter') { ev.preventDefault(); if (bomLookupIndex >= 0) selectBomLookup(bomLookupIndex); }
        });
        wheel._hasHandler = true;
      }
      // attach per-item hover to set bomLookupIndex
      var nodes = wheel.querySelectorAll('.lookup-item');
      nodes.forEach(function(it, ii){ it.addEventListener('mouseover', function(){ bomLookupIndex = ii; highlightBomLookup(ii); }); it.style.cursor = 'pointer'; });
      // focus the wheel for keyboard navigation
      try { wheel.focus(); } catch(e){}
    } else if (dropdown) {
      dropdown.innerHTML = itemsHtml;
      dropdown.style.display = 'block';
    }
  }

  function focusLookupItem(wheel, idx) {
    var nodes = wheel.querySelectorAll('.lookup-item');
    nodes.forEach(function(n,i){ n.style.background = (i === idx) ? '#222' : ''; if (i === idx) { try { n.scrollIntoView({ block: 'nearest' }); } catch(e){} } });
  }

  function selectBomLookup(i) {
    var m = bomLookupResults[i]; if (!m) return;
    document.getElementById('bomItemName') && (document.getElementById('bomItemName').value = m.name);
    document.getElementById('bomItemUrl') && (document.getElementById('bomItemUrl').value = m.url || '');
    document.getElementById('bomPrice') && (document.getElementById('bomPrice').value = m.pricePer || '');
    document.getElementById('bomPackSize') && (document.getElementById('bomPackSize').value = m.packSize || 1);
    if (!currentBOMVendor) currentBOMVendor = m.vendor;
    renderBomLookupDropdown([]);
  }

  function highlightBomLookup(idx) {
    var items = document.querySelectorAll('#bomMaterialDropdown .lookup-item');
    items.forEach(function(it,i){ it.style.background = i === idx ? '#222' : ''; });
  }

  function saveBOMItem() {
    var name = document.getElementById('bomItemName') ? document.getElementById('bomItemName').value.trim() : '';
    var quantity = parseInt(document.getElementById('bomQuantity') ? document.getElementById('bomQuantity').value : '');
    var price = parseFloat(document.getElementById('bomPrice') ? document.getElementById('bomPrice').value : '');
    if (!name || isNaN(quantity) || isNaN(price)) { alert('Name, Quantity, and Price are required'); return; }
    var url = document.getElementById('bomItemUrl') ? document.getElementById('bomItemUrl').value.trim() : '';
    if (url && !isValidUrl(url)) { alert('Please enter a valid URL (must start with http:// or https://)'); return; }
    var item = { name: name, url: url, quantity: quantity, pricePer: price, packSize: parseInt(document.getElementById('bomPackSize') ? document.getElementById('bomPackSize').value : 1) || 1, onHand: parseInt(document.getElementById('bomOnHand') ? document.getElementById('bomOnHand').value : 0) || 0, status: document.getElementById('bomStatus') ? document.getElementById('bomStatus').value : 'pending' };
    var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; }); if (!project) return;
    project.boms = project.boms || {}; project.boms[currentBOMVendor] = project.boms[currentBOMVendor] || [];
    project.boms[currentBOMVendor].push(item);
    saveData(); renderBOM(currentBOMVendor, project.boms[currentBOMVendor]); closeModal('bomItemModal');
  }

  function editBOMItem(vendor, index) {
    var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; }); if (!project) return; var item = (project.boms && project.boms[vendor]) ? project.boms[vendor][index] : null; if (!item) return;
    currentBOMVendor = vendor;
    var selectEl = document.getElementById('bomMaterialSelect'); if (selectEl) selectEl.innerHTML = '<option value="">-- Editing Existing Item --</option>';
    document.getElementById('bomItemName') && (document.getElementById('bomItemName').value = item.name);
    document.getElementById('bomItemUrl') && (document.getElementById('bomItemUrl').value = item.url || '');
    document.getElementById('bomQuantity') && (document.getElementById('bomQuantity').value = item.quantity);
    document.getElementById('bomPrice') && (document.getElementById('bomPrice').value = item.pricePer);
    document.getElementById('bomPackSize') && (document.getElementById('bomPackSize').value = item.packSize || 1);
    document.getElementById('bomOnHand') && (document.getElementById('bomOnHand').value = item.onHand || 0);
    document.getElementById('bomStatus') && (document.getElementById('bomStatus').value = item.status);
    openModal('bomItemModal');
    if (!window._originalSaveBOMItem) window._originalSaveBOMItem = window.saveBOMItem;
    var originalSave = window._originalSaveBOMItem;
    window.saveBOMItem = function(){
      var name = document.getElementById('bomItemName') ? document.getElementById('bomItemName').value.trim() : '';
      var quantity = parseInt(document.getElementById('bomQuantity') ? document.getElementById('bomQuantity').value : '');
      var price = parseFloat(document.getElementById('bomPrice') ? document.getElementById('bomPrice').value : '');
      if (!name || isNaN(quantity) || isNaN(price)) { alert('Name, Quantity, and Price are required'); return; }
      var url = document.getElementById('bomItemUrl') ? document.getElementById('bomItemUrl').value.trim() : '';
      if (url && !isValidUrl(url)) { alert('Please enter a valid URL'); return; }
      item.name = name; item.url = url; item.quantity = quantity; item.pricePer = price; item.packSize = parseInt(document.getElementById('bomPackSize') ? document.getElementById('bomPackSize').value : 1) || 1; item.onHand = parseInt(document.getElementById('bomOnHand') ? document.getElementById('bomOnHand').value : 0) || 0; item.status = document.getElementById('bomStatus') ? document.getElementById('bomStatus').value : item.status;
      saveData(); renderBOM(vendor, project.boms[vendor]); closeModal('bomItemModal');
      if (window._originalSaveBOMItem) { window.saveBOMItem = window._originalSaveBOMItem; delete window._originalSaveBOMItem; }
      else if (originalSave) { window.saveBOMItem = originalSave; }
    };
  }

  function deleteBOMItem(vendor, index) { if (!confirm('Remove this item from the BOM?')) return; var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; }); if (!project) return; project.boms[vendor].splice(index,1); saveData(); renderBOM(vendor, project.boms[vendor]); }

  function updateShipping(vendor) { var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; }); if (!project) return; project.shipping = project.shipping || {}; var v = parseFloat(document.getElementById(vendor + 'Shipping') ? document.getElementById(vendor + 'Shipping').value : '') || 0; project.shipping[vendor] = v; saveData(); renderBOM(vendor, project.boms[vendor]); }

  // Notes
  function renderNotes() {
    var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; }); if (!project) return;
    var container = document.getElementById('notesList'); if (!container) return;
    if (!project.notes || project.notes.length === 0) { container.innerHTML = '<div class="empty-state" style="padding:20px;">No notes yet</div>'; return; }
    container.innerHTML = project.notes.map(function(note, index){ return '<div class="note-item"><div class="note-actions">' + (index>0?('<button class="icon-btn" onclick="moveNote(' + index + ', -1)">↑</button>'):'') + (index < project.notes.length-1?('<button class="icon-btn" onclick="moveNote(' + index + ', 1)">↓</button>'):'') + '<button class="icon-btn" onclick="editNote(' + index + ')">✏️</button><button class="icon-btn" onclick="deleteNote(' + index + ')">🗑️</button></div><div class="note-content">' + linkifyText(escapeHtml(note.content)) + '</div><div class="note-timestamp">' + note.timestamp + '</div></div>'; }).join('');
  }

  // Printed Parts (per-project)
  function renderPrintedParts() {
    var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; }); if (!project) return;
    project.printedParts = project.printedParts || [];
    var container = document.getElementById('printedPartsList'); if (!container) return;
    if (project.printedParts.length === 0) { container.innerHTML = '<div style="color:#999; padding:12px;">No printed parts</div>'; return; }
    container.innerHTML = project.printedParts.map(function(pp, idx){ return '<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid #222;">' +
      '<div style="flex:1;">' + '<div style="font-weight:600;">' + escapeHtml(pp.fileName || 'Unnamed') + '</div>' + '<div style="font-size:12px;color:#999;">Qty: ' + (pp.quantity || 1) + ' • ' + (pp.url ? ('<a href="' + escapeHtml(pp.url) + '" target="_blank" style="color:var(--accent-color);">View</a>') : 'No URL') + '</div>' + '</div>' +
      '<div style="display:flex; gap:8px; align-items:center;">' + '<button class="btn btn-small" onclick="editPrintedPart(' + idx + ')">Edit</button>' + '<button class="btn btn-small" onclick="deletePrintedPart(' + idx + ')">Delete</button>' + '<button class="btn btn-small" onclick="addPrintedPartToBOM(\'' + project.id + '\',' + idx + ')">Add to BOM</button>' + '</div>' + '</div>'; }).join('');
  }

  function showAddPrintedPartModal() {
    editingPrintedPartIndex = null;
    var f = document.getElementById('printedPartFileName'); if (f) f.value = '';
    var u = document.getElementById('printedPartUrl'); if (u) u.value = '';
    var q = document.getElementById('printedPartQty'); if (q) q.value = '1';
    openModal('printedPartModal');
  }

  function editPrintedPart(index) {
    var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; }); if (!project) return;
    project.printedParts = project.printedParts || [];
    var pp = project.printedParts[index]; if (!pp) return;
    editingPrintedPartIndex = index;
    var f = document.getElementById('printedPartFileName'); if (f) f.value = pp.fileName || '';
    var u = document.getElementById('printedPartUrl'); if (u) u.value = pp.url || '';
    var q = document.getElementById('printedPartQty'); if (q) q.value = pp.quantity || 1;
    openModal('printedPartModal');
  }

  function savePrintedPart() {
    var fileName = (document.getElementById('printedPartFileName') && document.getElementById('printedPartFileName').value.trim()) || '';
    var url = (document.getElementById('printedPartUrl') && document.getElementById('printedPartUrl').value.trim()) || '';
    var qty = parseInt(document.getElementById('printedPartQty') ? document.getElementById('printedPartQty').value : '') || 1;
    if (!fileName) { alert('File name is required'); return; }
    if (url && !isValidUrl(url)) { alert('Please enter a valid URL (http/https) or leave blank'); return; }
    var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; }); if (!project) return;
    project.printedParts = project.printedParts || [];
    if (editingPrintedPartIndex != null && editingPrintedPartIndex !== undefined) {
      project.printedParts[editingPrintedPartIndex].fileName = fileName;
      project.printedParts[editingPrintedPartIndex].url = url;
      project.printedParts[editingPrintedPartIndex].quantity = qty;
    } else {
    project.printedParts.push({ id: generateUUID(), fileName: fileName, url: url, quantity: qty });
    }
    saveData(); renderPrintedParts(); closeModal('printedPartModal');
  }

  function deletePrintedPart(index) { if (!confirm('Delete this printed part?')) return; var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; }); if (!project) return; project.printedParts = project.printedParts || []; project.printedParts.splice(index,1); saveData(); renderPrintedParts(); }

  // Expose printed parts inventory in the Inventory view (mirror across projects)
  function renderPrintedPartsInventory() {
    var listEl = document.getElementById('inventoryPrintedPartsList'); if (!listEl) return;
    // gather all printed parts across projects with project reference
    var all = [];
    (appData.projects || []).forEach(function(p){ (p.printedParts || []).forEach(function(pp){ all.push({ projectId: p.id, projectName: p.name, fileName: pp.fileName, url: pp.url, quantity: pp.quantity || 1 }); }); });
    if (all.length === 0) { listEl.innerHTML = '<div style="color:#999; padding:12px;">No printed parts in inventory</div>'; return; }
    listEl.innerHTML = all.map(function(it){ return '<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid #222;">' + '<div style="flex:1;">' + '<div style="font-weight:600;">' + escapeHtml(it.fileName) + '</div>' + '<div style="font-size:12px;color:#999;">Project: ' + escapeHtml(it.projectName) + ' • Qty: ' + (it.quantity || 1) + ' • ' + (it.url ? ('<a href="' + escapeHtml(it.url) + '" target="_blank" style="color:var(--accent-color);">View</a>') : 'No URL') + '</div>' + '</div>' + '<div style="display:flex; gap:8px; align-items:center;"></div>' + '</div>'; }).join('');
  }

  // Add a printed part to a project's BOM under a chosen vendor (prompt user)
  var _pendingPrintedPartAdd = null; // { projectId, printedPartIndex }
  function addPrintedPartToBOM(projectId, printedPartIndex) {
    var project = (appData.projects || []).find(function(p){ return p.id === projectId; }); if (!project) return alert('Project not found'); project.printedParts = project.printedParts || []; var pp = project.printedParts[printedPartIndex]; if (!pp) return alert('Printed part not found');
    // open vendor picker modal and store pending action
    _pendingPrintedPartAdd = { projectId: projectId, printedPartIndex: printedPartIndex };
    openModal('vendorPickerModal');
  }

  function confirmVendorPick() {
    var sel = document.getElementById('vendorPickerSelect'); if (!sel) return closeModal('vendorPickerModal'); var vendor = sel.value || 'amazon'; if (!_pendingPrintedPartAdd) { closeModal('vendorPickerModal'); return; }
    var project = (appData.projects || []).find(function(p){ return p.id === _pendingPrintedPartAdd.projectId; }); if (!project) { closeModal('vendorPickerModal'); return alert('Project not found'); }
    var pp = (project.printedParts || [])[_pendingPrintedPartAdd.printedPartIndex]; if (!pp) { closeModal('vendorPickerModal'); return alert('Printed part not found'); }
    project.boms = project.boms || {}; project.boms[vendor] = project.boms[vendor] || [];
    var bomItem = { name: pp.fileName || 'Printed Part', url: pp.url || '', quantity: pp.quantity || 1, pricePer: 0, packSize: 1, onHand: 0, status: 'pending' };
    project.boms[vendor].push(bomItem);
    saveData(); renderBOM(vendor, project.boms[vendor]); closeModal('vendorPickerModal'); _pendingPrintedPartAdd = null; alert('Added printed part to project BOM under ' + vendor.toUpperCase());
  }

  function showAddNoteModal() { editingNoteIndex = null; var el = document.getElementById('noteContent'); if (el) el.value = ''; openModal('noteModal'); }
  function editNote(index) { var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; }); if (!project) return; var note = project.notes[index]; editingNoteIndex = index; var el = document.getElementById('noteContent'); if (el) el.value = note.content; openModal('noteModal'); }
  function saveNote() { var content = document.getElementById('noteContent') ? document.getElementById('noteContent').value.trim() : ''; if (!content) { alert('Note content is required'); return; } var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; }); if (!project) return; var timestamp = new Date().toISOString().replace('T',' ').substring(0,16); if (editingNoteIndex !== null) { project.notes[editingNoteIndex].content = content; project.notes[editingNoteIndex].timestamp = timestamp; } else { project.notes.push({ content: content, timestamp: timestamp }); } saveData(); renderNotes(); closeModal('noteModal'); }
  function deleteNote(index) { if (!confirm('Delete this note?')) return; var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; }); if (!project) return; project.notes.splice(index,1); saveData(); renderNotes(); }
  function moveNote(index, direction) { var project = (appData.projects || []).find(function(p){ return p.id === appData.currentProjectId; }); if (!project) return; var newIndex = index + direction; if (newIndex < 0 || newIndex >= project.notes.length) return; var tmp = project.notes[newIndex]; project.notes[newIndex] = project.notes[index]; project.notes[index] = tmp; saveData(); renderNotes(); }

  // Utils
  function openModal(id) { var el = document.getElementById(id); if (el) el.classList.add('active'); }
  function closeModal(id) { var el = document.getElementById(id); if (el) el.classList.remove('active'); if (id === 'bomItemModal' && window._originalSaveBOMItem) { window.saveBOMItem = window._originalSaveBOMItem; delete window._originalSaveBOMItem; } }
  function isValidUrl(str) { try { var u = new URL(str); return u.protocol === 'http:' || u.protocol === 'https:'; } catch(e) { return false; } }
  function escapeHtml(text) { if (text == null) return ''; var div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
  function linkifyText(text) { if (!text) return ''; var urlRegex = /(https?:\/\/[^\s"'<>]+)/g; return text.replace(urlRegex, function(url){ return '<a href="' + url + '" target="_blank" style="color:var(--accent-color);">' + url + '</a>'; }); }
  function formatCurrency(amount, currency) { var cur = currency || 'USD'; var locale = _currencyLocaleMap[cur] || (navigator.language || 'en-US'); try { return new Intl.NumberFormat(locale, { style: 'currency', currency: cur }).format(Number(amount) || 0); } catch(e) { return (Number(amount) || 0).toFixed(2) + ' ' + cur; } }

  // Extract domain (host) from a URL and strip www. and protocol
  function extractDomain(url) {
    try {
      var u = new URL(url);
      var host = u.hostname || '';
      // strip leading www.
      var cleaned = host.replace(/^www\./i, '');
      // remove common TLDs for display (e.g., .com, .org, .net, .ai, .io)
      cleaned = cleaned.replace(/\.(com|org|net|io|ai|co|us|uk|ca|de|jp|fr|au)$/i, '');
      // capitalize first letter for button display
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    } catch(e) { try { return url.replace(/^https?:\/\//i, '').split('/')[0].replace(/\.(com|org|net|io|ai)$/i, '').replace(/^www\./i,''); } catch(ex) { return url; } }
  }

  // Validators (copied from oldIndex)
  function validateProjectSchema(project) {
    var errors = [];
    if (!project || typeof project !== 'object') { errors.push('Project must be an object'); return { valid:false, errors: errors }; }
    if (!project.name || typeof project.name !== 'string') errors.push('Missing or invalid "name" (string required)');
    if (project.metadata && typeof project.metadata !== 'object') errors.push('"metadata" must be an object if present');
    else if (project.metadata) {
      if (project.metadata.tags && !Array.isArray(project.metadata.tags)) errors.push('"metadata.tags" must be an array if present');
  if (project.metadata.credits && !Array.isArray(project.metadata.credits)) errors.push('"metadata.credits" must be an array if present');
  else if (project.metadata.credits) { project.metadata.credits.forEach(function(c,i){ if (!c || typeof c !== 'object') { errors.push('metadata.credits['+i+'] must be an object'); return; } if (!c.name || typeof c.name !== 'string') errors.push('metadata.credits['+i+'].name must be a string'); if (c.url && (typeof c.url !== 'string' || !isValidUrl(c.url))) errors.push('metadata.credits['+i+'].url must be a valid URL'); }); }
      if (project.metadata.creationDate && typeof project.metadata.creationDate !== 'string') errors.push('"metadata.creationDate" must be a string (ISO date)');
      if (project.metadata.links && !Array.isArray(project.metadata.links)) errors.push('"metadata.links" must be an array of URLs if present');
      else if (project.metadata.links) { project.metadata.links.forEach(function(l,i){ if (typeof l !== 'string' || !isValidUrl(l)) errors.push('metadata.links['+i+'] must be a valid URL'); }); }
    }
    if (project.boms && typeof project.boms !== 'object') errors.push('"boms" must be an object with vendor arrays');
    else if (project.boms) {
  ['amazon','aliexpress','temu','mcmaster'].forEach(function(v){ if (project.boms[v] && !Array.isArray(project.boms[v])) errors.push('"boms.'+v+'" must be an array if present'); else if (project.boms[v]) { project.boms[v].forEach(function(item, idx){ if (!item || typeof item !== 'object') { errors.push('boms.'+v+'['+idx+'] must be an object'); return; } if (!item.name || typeof item.name !== 'string') errors.push('boms.'+v+'['+idx+'].name is required'); if (item.quantity != null && typeof item.quantity !== 'number') errors.push('boms.'+v+'['+idx+'].quantity must be a number'); if (item.pricePer != null && typeof item.pricePer !== 'number') errors.push('boms.'+v+'['+idx+'].pricePer must be a number'); }); } });
    }
    if (project.shipping && typeof project.shipping !== 'object') errors.push('"shipping" must be an object if present');
    if (project.notes && !Array.isArray(project.notes)) errors.push('"notes" must be an array if present');
    else if (project.notes) { project.notes.forEach(function(n,i){ if (!n || typeof n !== 'object' || typeof n.content !== 'string') errors.push('notes['+i+'] must be an object with "content" string'); }); }
    // printedParts: optional per-project list of printed parts
    if (project.printedParts && !Array.isArray(project.printedParts)) errors.push('"printedParts" must be an array if present');
    else if (project.printedParts) {
      project.printedParts.forEach(function(pp,i){ if (!pp || typeof pp !== 'object') { errors.push('printedParts['+i+'] must be an object'); return; } if (!pp.fileName || typeof pp.fileName !== 'string') errors.push('printedParts['+i+'].fileName is required and must be a string'); if (pp.url && (typeof pp.url !== 'string' || !isValidUrl(pp.url))) errors.push('printedParts['+i+'].url must be a valid URL if present'); if (pp.quantity != null && typeof pp.quantity !== 'number') errors.push('printedParts['+i+'].quantity must be a number if present'); });
    }
    return { valid: errors.length === 0, errors: errors };
  }

  function validateMaterialSchema(mat) {
    var errors = [];
    if (!mat || typeof mat !== 'object') { errors.push('Material must be an object'); return { valid:false, errors: errors }; }
    if (!mat.name || typeof mat.name !== 'string') errors.push('Missing or invalid "name"');
    // If material is marked as included with a printer, we allow missing URL/price/vendor
    if (!mat.isIncluded) {
      if (!mat.url || typeof mat.url !== 'string' || !isValidUrl(mat.url)) errors.push('Missing or invalid "url" (http:// or https:// required)');
      if (mat.pricePer == null || typeof mat.pricePer !== 'number') errors.push('Missing or invalid "pricePer" (number required)');
      if (!mat.vendor || (mat.vendor !== 'amazon' && mat.vendor !== 'aliexpress' && mat.vendor !== 'temu' && mat.vendor !== 'mcmaster')) errors.push('Missing or invalid "vendor" (must be "amazon", "aliexpress", "temu", or "mcmaster")');
    } else {
      // included materials should have an includedQty number when present
      if (mat.includedQty != null && typeof mat.includedQty !== 'number') errors.push('Included materials: "includedQty" must be a number if present');
      if (mat.includedWith != null && typeof mat.includedWith !== 'string') errors.push('Included materials: "includedWith" must be a string (project id) if present');
    }
    if (mat.tags && !Array.isArray(mat.tags)) errors.push('"tags" must be an array of strings if present');
    else if (mat.tags) { mat.tags.forEach(function(t,i){ if (typeof t !== 'string') errors.push('tags['+i+'] must be a string'); }); }
    return { valid: errors.length === 0, errors: errors };
  }

  // Project tag/link UI
  function renderProjectTagsUI() { var container = document.getElementById('projectTagsContainer'); if (!container) return; container.innerHTML = tempProjectTags.map(function(t,i){ return '<span class="chip">' + escapeHtml(t) + '<button class="remove-chip" onclick="removeProjectTag(' + i + ')">✕</button></span>'; }).join(''); }
  function addProjectTagFromInput() { var input = document.getElementById('projectTagInput'); if (!input) return; var raw = input.value.trim(); if (!raw) return; raw.split(',').map(function(s){ return s.trim(); }).filter(function(s){ return s; }).forEach(function(s){ if (tempProjectTags.indexOf(s) === -1) tempProjectTags.push(s); }); input.value = ''; renderProjectTagsUI(); }
  function removeProjectTag(idx) { tempProjectTags.splice(idx,1); renderProjectTagsUI(); }
  function renderProjectCreditsUI() {
    var container = document.getElementById('projectCreditsContainer'); if (!container) return;
    if (!tempProjectCredits || tempProjectCredits.length === 0) { container.innerHTML = '<div style="color:#999;">No credits added</div>'; return; }
    container.innerHTML = tempProjectCredits.map(function(c,i){ var name = escapeHtml(c.name || ''); var url = c.url ? escapeHtml(c.url) : ''; var domain = c.url ? escapeHtml(extractDomain(c.url)) : ''; var domainBtn = url ? ('<button class="btn btn-small" onclick="window.open(\'' + url + '\', \"_blank\")">' + domain + '</button>') : ''; return '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">' + '<div style="flex:1;">' + name + '</div>' + '<div style="display:flex; gap:8px; align-items:center;">' + domainBtn + '<button class="remove-chip" onclick="removeProjectCredit(' + i + ')">✕</button></div>' + '</div>'; }).join(''); }
  function addProjectCreditFromInput() { var nameEl = document.getElementById('projectCreditName'); var urlEl = document.getElementById('projectCreditUrl'); if (!nameEl || !nameEl.value.trim()) return alert('Credit name is required'); var name = nameEl.value.trim(); var url = urlEl && urlEl.value.trim(); if (url && !isValidUrl(url)) return alert('Credit URL is invalid (must start with http:// or https://)'); tempProjectCredits.push({ name: name, url: url || null }); nameEl.value = ''; if (urlEl) urlEl.value = ''; renderProjectCreditsUI(); }
  function removeProjectCredit(idx) { if (idx < 0) return; tempProjectCredits.splice(idx,1); renderProjectCreditsUI(); }
  function renderProjectLinksUI() { var container = document.getElementById('projectLinksContainer'); if (!container) return; container.innerHTML = tempProjectLinks.map(function(l,i){ return '<span class="chip"><a href="' + escapeHtml(l) + '" target="_blank" style="color:#E0E0E0; text-decoration:none;">' + escapeHtml(l) + '</a><button class="remove-chip" onclick="removeProjectLink(' + i + ')">✕</button></span>'; }).join(''); }
  function addProjectLinkFromInput() { var input = document.getElementById('projectLinkInput'); if (!input) return; var url = input.value.trim(); if (!url) return alert('Enter a URL to add'); if (!isValidUrl(url)) return alert('Invalid URL (must start with http:// or https://)'); if (tempProjectLinks.indexOf(url) === -1) tempProjectLinks.push(url); input.value = ''; renderProjectLinksUI(); }
  function removeProjectLink(idx) { tempProjectLinks.splice(idx,1); renderProjectLinksUI(); }

  // Import preview helpers
  function showImportPreview(type, items) {
    try { console.debug('[DEBUG] showImportPreview called', { type: type, count: (Array.isArray(items) ? items.length : 1) }); } catch(e) {}
    // avoid showing the same import preview repeatedly (duplicate events/file inputs)
    try {
      var fp = type + '::' + (Array.isArray(items) ? items.length : '1') + '::' + JSON.stringify((items||[]).slice(0,5).map(function(it){ return it && (it.id || it.name || it.url) || ''; }));
      console.debug('[DEBUG] showImportPreview fingerprint', fp);
      if (fp === _lastImportPreviewFingerprint) {
        // already showing this import preview recently; ignore duplicate
        console.debug('[DEBUG] Duplicate import preview detected; skipping');
        return;
      }
      _lastImportPreviewFingerprint = fp;
    } catch(e) { /* ignore fingerprint errors and continue to show preview */ }
    _pendingImport.type = type; _pendingImport.items = items;
    // If the import preview modal is already visible, skip reopening it
    try {
      var existingModal = document.getElementById('importPreviewModal');
      if (existingModal && existingModal.classList && existingModal.classList.contains('active')) {
        return;
      }
    } catch(e) {}
    var body = document.getElementById('importPreviewBody'); if (!body) return;
    var dupList = [], invalidList = [], newList = [], validList = [];
    if (type === 'materials') {
      items.forEach(function(mat, idx){ var v = validateMaterialSchema(mat); if (!v.valid) { invalidList.push({idx:idx, mat:mat, errors:v.errors}); return; } var exists = (appData.materials||[]).find(function(m){ return (mat.id && m.id === mat.id) || ((m.name && m.name.toLowerCase() === (mat.name||'').toLowerCase()) && m.vendor === mat.vendor && m.url === mat.url); }); if (exists) dupList.push({idx:idx, mat:mat}); else newList.push({idx:idx, mat:mat}); validList.push({idx:idx, mat:mat}); });
      _pendingImport.details = { duplicates: dupList, invalid: invalidList, newItems: newList, valid: validList };
      var invalidHtml = '';
      if (invalidList.length > 0) {
        invalidHtml = '<div style="margin-top:8px; padding:8px; background:#2a1010; border-radius:6px; color:#f88;"><strong>Invalid entries (' + invalidList.length + ')</strong><div style="font-size:12px; margin-top:6px;">' + invalidList.slice(0,5).map(function(it){ return '<div style="margin-bottom:6px;"><strong>#' + it.idx + '</strong> ' + escapeHtml((it.mat && it.mat.name) || (it.proj && it.proj.name) || (it.mat && it.mat.url) || 'Item') + '<div style="margin-top:4px; color:#fdd; font-size:12px;">' + escapeHtml((it.errors||[]).join('; ')) + '</div></div>'; }).join('') + (invalidList.length > 5 ? '<div style="color:#fbb; font-size:12px;">And ' + (invalidList.length - 5) + ' more invalid entries. Use "Show Invalid" to view all.</div>' : '') + '</div></div>';
      }
      body.innerHTML = '<p>Total entries in file: <strong>' + items.length + '</strong></p><p>Valid: <strong>' + validList.length + '</strong></p><p>Potential new (if merged): <strong>' + newList.length + '</strong></p><p>Duplicates (will be skipped if merging): <strong>' + dupList.length + '</strong></p><p>Invalid entries: <strong>' + invalidList.length + '</strong></p>' + invalidHtml + '<p style="font-size:12px;color:#999;">Choose "Merge" to keep existing items and add only new ones. Choose "Replace" to overwrite your current materials with only the valid entries from this file.</p><div style="margin-top:12px; display:flex; gap:8px;"><button class="btn btn-secondary btn-small" onclick="togglePreviewDetails(\'newItems\')">Show New Items (' + newList.length + ')</button><button class="btn btn-secondary btn-small" onclick="togglePreviewDetails(\'duplicates\')">Show Duplicates (' + dupList.length + ')</button><button class="btn btn-secondary btn-small" onclick="togglePreviewDetails(\'invalid\')">Show Invalid (' + invalidList.length + ')</button></div><div id="importPreviewDetails" style="margin-top:12px; max-height:240px; overflow:auto; background:#151515; padding:8px; border-radius:6px;"></div>';
    } else if (type === 'projects') {
      items.forEach(function(proj, idx){ var v = validateProjectSchema(proj); if (!v.valid) { invalidList.push({idx:idx, proj:proj, errors:v.errors}); return; } var exists = (appData.projects||[]).find(function(p){ return (proj.id && p.id === proj.id) || (p.name && p.name.toLowerCase() === (proj.name||'').toLowerCase()); }); if (exists) dupList.push({idx:idx, proj:proj}); else newList.push({idx:idx, proj:proj}); validList.push({idx:idx, proj:proj}); });
      _pendingImport.details = { duplicates: dupList, invalid: invalidList, newItems: newList, valid: validList };
      var invalidHtmlP = '';
      if (invalidList.length > 0) {
        invalidHtmlP = '<div style="margin-top:8px; padding:8px; background:#2a1010; border-radius:6px; color:#f88;"><strong>Invalid entries (' + invalidList.length + ')</strong><div style="font-size:12px; margin-top:6px;">' + invalidList.slice(0,5).map(function(it){ return '<div style="margin-bottom:6px;"><strong>#' + it.idx + '</strong> ' + escapeHtml((it.proj && it.proj.name) || (it.mat && it.mat.name) || 'Item') + '<div style="margin-top:4px; color:#fdd; font-size:12px;">' + escapeHtml((it.errors||[]).join('; ')) + '</div></div>'; }).join('') + (invalidList.length > 5 ? '<div style="color:#fbb; font-size:12px;">And ' + (invalidList.length - 5) + ' more invalid entries. Use "Show Invalid" to view all.</div>' : '') + '</div></div>';
      }
      body.innerHTML = '<p>Total entries in file: <strong>' + items.length + '</strong></p><p>Valid: <strong>' + validList.length + '</strong></p><p>Potential new (if merged): <strong>' + newList.length + '</strong></p><p>Duplicates (will be skipped if merging): <strong>' + dupList.length + '</strong></p><p>Invalid entries: <strong>' + invalidList.length + '</strong></p>' + invalidHtmlP + '<p style="font-size:12px;color:#999;">Choose "Merge" to keep existing projects and add only new ones. Choose "Replace" to overwrite your current projects with only the valid entries from this file.</p><div style="margin-top:12px; display:flex; gap:8px;"><button class="btn btn-secondary btn-small" onclick="togglePreviewDetails(\'newItems\')">Show New Projects (' + newList.length + ')</button><button class="btn btn-secondary btn-small" onclick="togglePreviewDetails(\'duplicates\')">Show Duplicate Projects (' + dupList.length + ')</button><button class="btn btn-secondary btn-small" onclick="togglePreviewDetails(\'invalid\')">Show Invalid (' + invalidList.length + ')</button></div><div id="importPreviewDetails" style="margin-top:12px; max-height:240px; overflow:auto; background:#151515; padding:8px; border-radius:6px;"></div>';
    }
    openModal('importPreviewModal');
  }

  function togglePreviewDetails(section) { var detailsEl = document.getElementById('importPreviewDetails'); if (!detailsEl) return; var details = (_pendingImport && _pendingImport.details && _pendingImport.details[section]) || []; if (!details || details.length === 0) { detailsEl.innerHTML = '<div style="color:#999;">No items</div>'; return; } detailsEl.innerHTML = details.map(function(it){ var idx = it.idx; var obj = it.mat || it.proj || it; var name = obj.name || obj.url || 'Item'; if (section === 'invalid') return '<div style="padding:8px;border-bottom:1px solid #222;"><strong>#' + idx + '</strong> ' + escapeHtml(name) + '<div style="color:#f88; font-size:12px;">' + escapeHtml((it.errors||[]).join('; ')) + '</div></div>'; return '<div style="padding:8px;border-bottom:1px solid #222;"><strong>#' + idx + '</strong> ' + escapeHtml(name) + '</div>'; }).join(''); }

  function finalizeImport(mode) {
    if (!_pendingImport || !_pendingImport.type || !_pendingImport.items) { closeModal('importPreviewModal'); return; }
    _lastImportSnapshot = JSON.parse(JSON.stringify(appData));
    // Check for currency mismatches and warn the user if importing items with a different currency than app default
    try {
      // collect a unique set of incoming currencies from the pending import
      var incomingCurrencies = {};
      if (_pendingImport.type === 'materials') {
        (_pendingImport.items || []).forEach(function(m){ if (m && m.currency) incomingCurrencies[m.currency] = true; });
      } else if (_pendingImport.type === 'projects') {
        (_pendingImport.items || []).forEach(function(p){ if (p && p.currency) incomingCurrencies[p.currency] = true; // also scan nested BOM items
          if (p && p.boms) { ['amazon','aliexpress','temu','mcmaster'].forEach(function(v){ (p.boms[v]||[]).forEach(function(it){ if (it && it.currency) incomingCurrencies[it.currency] = true; }); }); }
        });
      }
      // remove empty and default currency values
      var allIncoming = Object.keys(incomingCurrencies).filter(function(c){ return c; });
      var incomingList = allIncoming.filter(function(c){ return c !== appSettings.currencyDefault; });
      // compute which of the incoming currencies are NOT already dismissed
      var dismissed = (appSettings.dismissedCurrencyWarnings || []);
      var toWarn = incomingList.filter(function(c){ return dismissed.indexOf(c) === -1; });
      if (toWarn.length) {
        // show warning modal and pause finalize until user proceeds
        var body = document.getElementById('currencyWarningBody'); if (body) body.innerHTML = '<div>Imported data uses currency: <strong>' + escapeHtml(allIncoming.join(', ')) + '</strong> which differs from your default currency <strong>' + escapeHtml(appSettings.currencyDefault) + '</strong>.<div style="margin-top:8px; color:#ccc;">Items will keep their original currency after import. Continue?</div></div>';
        // keep a DOM-backed fallback so the Continue button can always find the pending mode even if the global was cleared
        var modalEl = document.getElementById('currencyWarningModal'); if (modalEl) {
          try { modalEl.dataset.pendingMode = mode; modalEl.dataset.pendingCurrencies = JSON.stringify(toWarn); } catch(e){}
        }
        openModal('currencyWarningModal');
        // store pending finalize state so proceedImportDespiteCurrency can continue and remember which currencies to dismiss
        window._pendingFinalizeImport = { mode: mode, currencies: toWarn };
        return; // pause finalize
      }
    } catch(e) { console.warn('Currency check failed', e); }
    if (_pendingImport.type === 'materials') {
      var materials = _pendingImport.items;
      if (mode === 'replace') {
        var normalized = [];
  materials.forEach(function(mat){ var v = validateMaterialSchema(mat); if (!v.valid) return; normalized.push({ id: mat.id || generateUUID(), name: mat.name, description: mat.description || '', url: mat.url, pricePer: parseFloat(mat.pricePer) || 0, packSize: parseInt(mat.packSize) || 1, vendor: mat.vendor, currency: mat.currency || 'USD' }); });
  // ensure tags present when replacing
  normalized = normalized.map(function(m, idx){ var incoming = materials[idx]; if (incoming && Array.isArray(incoming.tags)) m.tags = incoming.tags.slice(); else m.tags = m.tags || []; // preserve included metadata and thumbnail when present
        if (incoming && incoming.isIncluded) { m.isIncluded = true; m.includedWith = incoming.includedWith || null; m.includedQty = typeof incoming.includedQty === 'number' ? incoming.includedQty : 1; } else { m.isIncluded = false; m.includedWith = null; m.includedQty = null; }
        if (incoming && incoming.thumbnailDataUrl) m.thumbnailDataUrl = incoming.thumbnailDataUrl;
        if (incoming && Array.isArray(incoming.components)) m.components = incoming.components.slice();
        return m; });
        if (normalized.length === 0) { showImportResult({ success:false, message:'No valid materials to import' }); return; }
        appData.materials = normalized; saveData(); renderMaterials(); showImportResult({ success:true, message: 'Imported and replaced ' + normalized.length + ' materials', replacedCount: normalized.length });
      } else {
          var imported = 0, duplicates = 0;
          materials.forEach(function(mat){
            var v = validateMaterialSchema(mat);
            if (!v.valid) return;
            var exists = (appData.materials || []).find(function(m){
              if (mat.id && m.id === mat.id) return true;
              return (m.name && m.name.toLowerCase() === (mat.name||'').toLowerCase()) && m.vendor === mat.vendor && m.url === mat.url;
            });
            if (exists) {
              duplicates++;
              // merge tags
              if (Array.isArray(mat.tags) && mat.tags.length) {
                exists.tags = exists.tags || [];
                mat.tags.forEach(function(t){ if (exists.tags.indexOf(t) === -1) exists.tags.push(t); });
              }
              // optionally update description/price if empty
              if (!exists.description && mat.description) exists.description = mat.description;
              if ((!exists.pricePer || exists.pricePer === 0) && mat.pricePer) exists.pricePer = parseFloat(mat.pricePer) || exists.pricePer;
              // preserve incoming thumbnail if existing doesn't have one
              if (!exists.thumbnailDataUrl && mat.thumbnailDataUrl) exists.thumbnailDataUrl = mat.thumbnailDataUrl;
              return;
            }
            var safeMat = {
              id: mat.id || generateUUID(),
              name: mat.name,
              description: mat.description || '',
              url: mat.url,
              pricePer: parseFloat(mat.pricePer) || 0,
              packSize: parseInt(mat.packSize) || 1,
              vendor: mat.vendor,
              currency: mat.currency || 'USD',
              tags: Array.isArray(mat.tags) ? mat.tags.slice() : []
            };
            // preserve thumbnail when adding new material
            if (mat.thumbnailDataUrl) safeMat.thumbnailDataUrl = mat.thumbnailDataUrl;
            // preserve included metadata/components
            if (mat.isIncluded) { safeMat.isIncluded = true; safeMat.includedWith = mat.includedWith || null; safeMat.includedQty = typeof mat.includedQty === 'number' ? mat.includedQty : 1; }
            if (Array.isArray(mat.components)) safeMat.components = mat.components.slice();
            appData.materials.push(safeMat);
            imported++;
          });
          saveData(); renderMaterials(); showImportResult({ success:true, message: 'Imported: ' + imported + '. Skipped duplicates: ' + duplicates + '.', importedCount: imported, skipped: duplicates });
          // For merged materials, ensure included metadata from incoming items is preserved when adding new ones
          // (existing duplicates were merged above)
      }
    } else if (_pendingImport.type === 'projects') {
      var projects = _pendingImport.items;
      if (mode === 'replace') {
        var normalizedImported = [];
  projects.forEach(function(proj){ var v = validateProjectSchema(proj); if (!v.valid) return; var clone = JSON.parse(JSON.stringify(proj)); var newProj = { id: proj.id || generateUUID(), name: clone.name, metadata: clone.metadata || {}, boms: clone.boms || { amazon:[], aliexpress:[], temu:[], mcmaster:[] }, shipping: clone.shipping || {}, notes: Array.isArray(clone.notes) ? clone.notes : [] };
          // ensure credits array preserved when present
          if (clone.metadata && Array.isArray(clone.metadata.credits)) newProj.metadata.credits = clone.metadata.credits.slice();
          // preserve printedParts when importing projects
          if (Array.isArray(clone.printedParts)) newProj.printedParts = clone.printedParts.map(function(pp){ return { id: pp.id || null, fileName: pp.fileName || '', url: pp.url || '', quantity: pp.quantity || 1 }; });
          // preserve incoming thumbnail when present
          if (clone.thumbnailDataUrl) newProj.thumbnailDataUrl = clone.thumbnailDataUrl;
          // preserve gallery entries when present (ensure IDs and normalize image shapes)
          if (Array.isArray(clone.gallery)) {
            newProj.gallery = clone.gallery.map(function(g){
              var entry = {};
              entry.id = g.id || generateUUID();
              entry.title = g.title || '';
              entry.createdAt = g.createdAt || (new Date().toISOString());
              // normalize images array to objects { src, note }
              entry.images = Array.isArray(g.images) ? g.images.map(function(img){ if (!img) return null; if (typeof img === 'string') return { src: img, note: '' }; if (typeof img === 'object') return { src: img.src || img.dataUrl || img.thumbnailDataUrl || '', note: img.note || img.caption || '' }; return null; }).filter(Boolean) : [];
              return entry;
            });
          }
          normalizedImported.push(newProj); }); if (normalizedImported.length === 0) { showImportResult({ success:false, message:'No valid projects to import' }); return; } appData.projects = normalizedImported; saveData(); renderProjects(); selectProject(appData.projects[0].id); showImportResult({ success:true, message:'Imported and replaced ' + normalizedImported.length + ' projects', replacedCount: normalizedImported.length });
      } else {
        var imported = 0, duplicates = 0;
        projects.forEach(function(proj){ var v = validateProjectSchema(proj); if (!v.valid) return; var incomingId = proj.id || null; var clone = JSON.parse(JSON.stringify(proj)); var dup = (appData.projects || []).find(function(p){ return (incomingId && p.id === incomingId) || (p.name && p.name.toLowerCase() === (clone.name||'').toLowerCase()); }); if (dup) {
            // merge printedParts into existing duplicate project to preserve incoming printed parts
            if (Array.isArray(clone.printedParts) && clone.printedParts.length) {
              dup.printedParts = dup.printedParts || [];
              clone.printedParts.forEach(function(pp){ // avoid duplicates by id or filename
                var exists = dup.printedParts.find(function(x){ if (pp.id && x.id && pp.id === x.id) return true; if (x.fileName && pp.fileName && x.fileName.toLowerCase() === pp.fileName.toLowerCase()) return true; return false; }); if (!exists) dup.printedParts.push({ id: pp.id || generateUUID(), fileName: pp.fileName || '', url: pp.url || '', quantity: pp.quantity || 1 }); });
            }
            // also merge metadata.tags and credits conservatively
            if (clone.metadata && Array.isArray(clone.metadata.tags)) { dup.metadata = dup.metadata || {}; dup.metadata.tags = dup.metadata.tags || []; clone.metadata.tags.forEach(function(t){ if (dup.metadata.tags.indexOf(t) === -1) dup.metadata.tags.push(t); }); }
            if (clone.metadata && Array.isArray(clone.metadata.credits)) { dup.metadata = dup.metadata || {}; dup.metadata.credits = dup.metadata.credits || []; clone.metadata.credits.forEach(function(c){ var existsC = dup.metadata.credits.find(function(dc){ return dc && c && dc.name === c.name && dc.url === c.url; }); if (!existsC) dup.metadata.credits.push(c); }); }
            duplicates++; return; }
          var newProj = { id: proj.id || generateUUID(), name: clone.name, metadata: clone.metadata || {}, boms: clone.boms || { amazon:[], aliexpress:[], temu:[], mcmaster:[] }, shipping: clone.shipping || {}, notes: Array.isArray(clone.notes) ? clone.notes : [] };
          // preserve credits if present
          if (clone.metadata && Array.isArray(clone.metadata.credits)) newProj.metadata.credits = clone.metadata.credits.slice();
          // preserve printedParts when importing projects
          if (Array.isArray(clone.printedParts)) newProj.printedParts = clone.printedParts.map(function(pp){ return { id: pp.id || null, fileName: pp.fileName || '', url: pp.url || '', quantity: pp.quantity || 1 }; });
          // preserve incoming thumbnail when present
          if (clone.thumbnailDataUrl) newProj.thumbnailDataUrl = clone.thumbnailDataUrl;
          // preserve gallery entries when present (ensure IDs and normalize image shapes)
          if (Array.isArray(clone.gallery)) {
            newProj.gallery = clone.gallery.map(function(g){
              var entry = {};
              entry.id = g.id || generateUUID();
              entry.title = g.title || '';
              entry.createdAt = g.createdAt || (new Date().toISOString());
              entry.images = Array.isArray(g.images) ? g.images.map(function(img){ if (!img) return null; if (typeof img === 'string') return { src: img, note: '' }; if (typeof img === 'object') return { src: img.src || img.dataUrl || img.thumbnailDataUrl || '', note: img.note || img.caption || '' }; return null; }).filter(Boolean) : [];
              return entry;
            });
          }
          appData.projects.push(newProj); imported++; }); saveData(); renderProjects(); if (imported > 0) selectProject(appData.projects[appData.projects.length-1].id); showImportResult({ success:true, message:'Imported: ' + imported + '. Skipped duplicates: ' + duplicates + '.', importedCount: imported, skipped: duplicates });
      }
    }
    _pendingImport = { type: null, items: null, details: null };
    // clear fingerprint so future imports can show preview again
    try { _lastImportPreviewFingerprint = null; } catch(e){}
  }

  // Called from currency warning modal to continue the import despite currency mismatches
  function proceedImportDespiteCurrency() {
    var dontShow = document.getElementById('currencyWarningDontShow');
    if (dontShow && dontShow.checked) {
      try {
        appSettings.dismissedCurrencyWarnings = appSettings.dismissedCurrencyWarnings || [];
        var pending = window._pendingFinalizeImport || {};
        var toAdd = Array.isArray(pending.currencies) ? pending.currencies.slice() : [];
        // add each currency only once
        toAdd.forEach(function(cur){ if (!cur) return; if (appSettings.dismissedCurrencyWarnings.indexOf(cur) === -1) appSettings.dismissedCurrencyWarnings.push(cur); });
        saveAppSettings();
      } catch(e){}
    }
    closeModal('currencyWarningModal');
    // read pending finalize state from global, fallback to modal dataset if missing
    var pending = window._pendingFinalizeImport || null;
    if (!pending) {
      try {
        var modalEl = document.getElementById('currencyWarningModal');
        if (modalEl && modalEl.dataset && modalEl.dataset.pendingMode) {
          pending = { mode: modalEl.dataset.pendingMode || 'merge', currencies: [] };
          try { pending.currencies = JSON.parse(modalEl.dataset.pendingCurrencies || '[]'); } catch(e) { pending.currencies = []; }
        }
      } catch(e) { pending = null; }
    }
    window._pendingFinalizeImport = null;
    if (pending) finalizeImport(pending.mode);
  }

  // Debug helper: log a short trace when attempting to save new items
  function _debugSaveAttempt(context) { try { console.debug('[BOManager] save attempt:', context); } catch(e){} }

  function showImportResult(result) {
    var body = document.getElementById('importPreviewBody'); if (!body) return;
    body.innerHTML = '<div style="padding:12px;"><div style="font-weight:600; margin-bottom:8px;">' + escapeHtml(result.message) + '</div></div>';
    // Replace modal actions with a single Close button so users don't see Merge/Replace after completion
    try {
      var modalEl = document.getElementById('importPreviewModal');
      if (modalEl) {
        var actions = modalEl.querySelector('.modal-actions');
        if (actions) actions.innerHTML = '<button class="btn btn-secondary" onclick="closeModal(\'importPreviewModal\')">Close</button>';
      }
    } catch (e) { }
  }
  // ensure fingerprint cleared after showing results
  try { _lastImportPreviewFingerprint = null; } catch(e){}

  function undoLastImport() { if (!_lastImportSnapshot) { alert('Nothing to undo'); return; } appData = _lastImportSnapshot; _lastImportSnapshot = null; saveData(); renderMaterials(); renderProjects(); showImportResult({ success:true, message:'Undo completed — previous data restored.' }); }

  // Expose needed handlers to window (for inline onclicks)
  var exported = [
    'showNewProjectModal','saveProject','deleteProject','editProjectMetadata','exportProject','importProject','exportAllProjects','selectProject','renderProjects','renderMaterials',
    'showNewMaterialModal','saveMaterial','editMaterial','deleteMaterial','importMaterials','exportMaterials','filterMaterials',
  'exportAllMaterials',
    'showAddBOMItemModal','saveBOMItem','editBOMItem','deleteBOMItem','updateShipping','toggleShippingEditor','toggleVendor',
    'showAddNoteModal','saveNote','deleteNote','editNote','moveNote',
    'openModal','closeModal','finalizeImport','showImportPreview','undoLastImport','validateProjectSchema','validateMaterialSchema',
  'renderGallery','handleGalleryImageAdd','updateGalleryImageNote','removeStandaloneImage','deleteStandaloneEntry','saveGalleryEntry','removeProjectThumbnailById','removeMaterialThumbnailById','exportGallery','importGallery','handleGalleryImport',
  'triggerGalleryImageSelect',
    'renderProjectTagsUI','addProjectTagFromInput','removeProjectTag','renderProjectLinksUI','addProjectLinkFromInput','removeProjectLink','togglePreviewDetails',
      'renderProjectCreditsUI','addProjectCreditFromInput','removeProjectCredit','embedMissingProjectThumbnails','embedAllSavedThumbnails','removeProjectThumbnail','removeMaterialThumbnail',
    'toggleProjectPickerNewForm','createMaterialFromPicker','selectProjectMaterial','showProjectMaterialPicker','confirmProjectMaterialPick','addMaterialToCurrentProject'
  ];
  // ensure printed parts handlers are exported
  ['renderPrintedParts','showAddPrintedPartModal','editPrintedPart','savePrintedPart','deletePrintedPart','renderPrintedPartsInventory','addPrintedPartToBOM'].forEach(function(name){ exported.push(name); });
  // expose sources management
  ['showSettingsModal','addSourceFromInput','fetchAndPreviewSource','fetchSourceAndPreview','fetchSourceAndPreviewUrl','renderSourcesList','removeSource','refreshSourceMetadata','refreshAllSources','exportProjectLegacy','copyExampleJson','applyTagSuggestion'].forEach(function(name){ try{ var fn = eval(name); if (typeof fn === 'function' && typeof window !== 'undefined') window[name] = fn; }catch(e){} });
  exported.forEach(function(name){
    try {
      var fn = eval(name);
      if (typeof fn === 'function' && typeof window !== 'undefined') {
        window[name] = fn;
      }
    } catch (e) {
      // missing function; skip exporting to avoid aborting the script
    }
  });

  // Export newly added project credit edit handlers
  try { if (typeof window !== 'undefined') { window.startEditProjectCredit = startEditProjectCredit; window.updateProjectCredit = updateProjectCredit; window.cancelEditProjectCredit = cancelEditProjectCredit; } } catch(e) {}

  // ensure new handlers are exported
  ['switchMainView','renderInventoryNotes','showAddInventoryNoteModal','saveInventoryNote','editInventoryNote','deleteInventoryNote','moveInventoryNote','embedAllSavedThumbnails'].forEach(function(name){ try{ var fn = eval(name); if (typeof fn === 'function' && typeof window !== 'undefined') window[name] = fn; }catch(e){} });
  // previous hosted loader removed
  try { if (typeof window !== 'undefined') window.prefillMaterialFromMissing = prefillMaterialFromMissing; } catch(e) {}
  // export addInventoryToCurrentProject to window for inline handlers
  try { if (typeof window !== 'undefined') window.addInventoryToCurrentProject = addInventoryToCurrentProject; } catch(e) {}
  // export new inventory/kit functions
  ['toggleKitExpand','prefillMaterialFromComponent','createInventoryBackup','renderInventoryBackupsList','previewInventoryBackup','importInventoryBackup','confirmKitExpansionCreate','renderKitExpansionModal'].forEach(function(name){ try{ var fn = eval(name); if (typeof fn === 'function' && typeof window !== 'undefined') window[name] = fn; }catch(e){} });

  // Start on DOM ready
  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init);
  // Auto-embedding behavior is controlled by `embedSettings.autoEmbedOnStartup` (default: enabled with conservative batch size 4).
  // If you do not want auto-embed on startup, open Settings and uncheck "Auto-embed images on startup".

})();
