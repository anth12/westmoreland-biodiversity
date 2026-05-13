document.addEventListener('DOMContentLoaded', function() {
  // Wait for Leaflet to be available
  function initMap() {
    if (!window.L) {
      console.log('Waiting for Leaflet...');
      setTimeout(initMap, 100);
      return;
    }

    (function () {
      'use strict';

      /* ── Variables and state ────────────────────────────── */
      const form = document.getElementById('estimatorForm');
      const submitBtn = document.getElementById('submitBtn');
      const acceptTermsCheckbox = document.getElementById('acceptTerms');
      let regions = [];   // { id, name, layer, color }
      let regionCounter = 0;

      /* ── Palette for drawn regions ────────────────── */
      const PALETTE = [
        '#2d8a4e', '#b8913a', '#3a6ea8', '#a03080', '#e06c3a',
        '#1a7a7a', '#8a5a2d', '#5a3a8a', '#5a8a3a', '#8a3a3a',
      ];

      /* ── Map setup ────────────────────────────────– */
      const mapElement = document.getElementById('map');
      if (!mapElement) {
        console.error('Map element not found');
        return;
      }

      const map = L.map('map', {
        center: [54.5, -2.8],
        zoom: 9,
        zoomControl: false,
        scrollWheelZoom: false,
        attributionControl: true,
      });
      
      console.log('Map initialized:', map);
      
      L.control.zoom({ position: 'topleft' }).addTo(map);

      /* Tile layers */
      const tiles = {
        osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }),
        satellite: L.tileLayer(
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          {
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP',
            maxZoom: 19,
          }
        ),
        terrain: L.tileLayer(
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}',
          {
            attribution: 'Tiles &copy; Esri &mdash; Source: USGS, Esri, TANA, DeLorme, NaturalVue',
            maxZoom: 13,
          }
        ),
      };
      tiles.osm.addTo(map);

      let activeLayer = 'osm';
      function setLayer(name) {
        map.removeLayer(tiles[activeLayer]);
        tiles[name].addTo(map);
        activeLayer = name;
        document.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('layer' + name.charAt(0).toUpperCase() + name.slice(1)).classList.add('active');
      }
      
      // Map layer buttons - only show if they exist
      const layerOsm = document.getElementById('layerOsm');
      const layerSat = document.getElementById('layerSat');
      const layerTerrain = document.getElementById('layerTerrain');
      
      if (layerOsm) layerOsm.addEventListener('click', () => setLayer('osm'));
      if (layerSat) layerSat.addEventListener('click', () => setLayer('satellite'));
      if (layerTerrain) layerTerrain.addEventListener('click', () => setLayer('terrain'));

      /* ── Draw layer ───────────────────────────────– */
      const drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);

      const drawControl = new L.Control.Draw({
        position: 'topleft', // Position required for control initialization
        draw: {
          polygon: {
            shapeOptions: { color: PALETTE[0], weight: 2.5, fillOpacity: 0.2 },
            showArea: true,
            metric: true,
            allowIntersection: false,
            drawError: { color: '#e74c3c', message: 'Polygon edges cannot cross!' },
          },
          polyline: false,
          rectangle: false,
          circle: false,
          circlemarker: false,
          marker: false,
        },
        edit: {
          featureGroup: drawnItems,
          remove: true,
        },
      });
      
      // Add control but hide it with CSS
      map.addControl(drawControl);

      // Custom draw button handler
      const drawLandBtn = document.getElementById('drawLandBtn');
      let activeDrawer = null;
      
      if (drawLandBtn) {
        drawLandBtn.addEventListener('click', (e) => {
          e.preventDefault();
          
          if (activeDrawer) {
            // Stop drawing
            activeDrawer.disable();
            activeDrawer = null;
            drawLandBtn.textContent = '✏️ Draw land boundary';
            drawLandBtn.style.background = 'var(--green-deep)';
          } else {
            // Start drawing
            const polygonOptions = {
              color: PALETTE[0],
              weight: 2.5,
              fillOpacity: 0.2,
              showArea: true,
              metric: true,
              allowIntersection: false,
              drawError: { color: '#e74c3c', message: 'Polygon edges cannot cross!' },
            };
            
            activeDrawer = new L.Draw.Polygon(map, polygonOptions);
            activeDrawer.enable();
            
            drawLandBtn.innerHTML = '⏹️ Cancel Drawing<br><small style="font-size: 0.75rem; opacity: 0.8;">Double-click to finish</small>';
            drawLandBtn.style.background = '#d9534f';
          }
        });
      }

      // Listen for drawing events to reset button state
      map.on(L.Draw.Event.CREATED, (e) => {
        if (activeDrawer) {
          activeDrawer.disable();
          activeDrawer = null;
          drawLandBtn.textContent = '✏️ Draw land boundary';
          drawLandBtn.style.background = 'var(--green-deep)';
        }
        addRegion(e.layer);
      });
      
      map.on(L.Draw.Event.DRAWSTOP, (e) => {
        if (activeDrawer) {
          activeDrawer.disable();
          activeDrawer = null;
          drawLandBtn.textContent = '✏️ Draw land boundary';
          drawLandBtn.style.background = 'var(--green-deep)';
        }
      });

      /* ── Form handling ────────────────────────────── */
      
      // Enable/disable submit button based on terms checkbox and drawn regions
      function updateSubmitBtn() {
        const hasRegions = regions.length > 0;
        const termsAccepted = acceptTermsCheckbox.checked;
        submitBtn.disabled = !(hasRegions && termsAccepted);
      }

      acceptTermsCheckbox.addEventListener('change', updateSubmitBtn);

      /* ── Geocoding and address-based map centering ── */
      async function geocodeAddress() {
        const address = document.getElementById('address').value.trim();
        const postcode = document.getElementById('postcode').value.trim();
        const county = document.getElementById('county').value.trim();
        
        if (!address || !postcode) return;
        
        const query = `${postcode}, UK`;
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
            { headers: { 'Accept': 'application/json' } }
          );
          const results = await response.json();
          if (results && results.length > 0) {
            const { lat, lon } = results[0];
            map.setView([parseFloat(lat), parseFloat(lon)], 14);
          }
        } catch (err) {
          console.log('Geocoding error:', err);
        }
      }

      // Add geocoding listeners to address fields
      const addressField = document.getElementById('address');
      const postcodeField = document.getElementById('postcode');
      const countyField = document.getElementById('county');
      
      if (addressField) addressField.addEventListener('blur', geocodeAddress);
      if (postcodeField) postcodeField.addEventListener('blur', geocodeAddress);
      if (countyField) countyField.addEventListener('blur', geocodeAddress);

      form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Validate form fields
        const fullname = document.getElementById('fullname').value.trim();
        const email = document.getElementById('email').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const address = document.getElementById('address').value.trim();
        const postcode = document.getElementById('postcode').value.trim();
        const county = document.getElementById('county').value.trim();
        
        if (!fullname || !email || !phone || !address || !postcode || !county) {
          alert('Please fill in all required fields');
          return;
        }
        
        if (!acceptTermsCheckbox.checked) {
          alert('Please accept the terms and disclaimer');
          return;
        }
        
        if (regions.length === 0) {
          alert('Please draw at least one land area on the map');
          return;
        }
        
        // Set loading state
        submitBtn.disabled = true;
        const originalText = submitBtn.textContent;
        submitBtn.textContent = '⏳ Processing…';
        
        // Start the generation process
        startGeneration().then(() => {
          // Optionally reset button state after completion
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }).catch(err => {
          // Reset button state on error
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
          console.error('Generation error:', err);
        });
      });

  function haversineArea(latlngs) {
    if (L.GeometryUtil && L.GeometryUtil.geodesicArea) {
      return L.GeometryUtil.geodesicArea(latlngs);
    }
    const R = 6371000;
    let area = 0;
    const n = latlngs.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const xi = latlngs[i].lng * Math.PI / 180 * R * Math.cos(latlngs[i].lat * Math.PI / 180);
      const yi = latlngs[i].lat * Math.PI / 180 * R;
      const xj = latlngs[j].lng * Math.PI / 180 * R * Math.cos(latlngs[j].lat * Math.PI / 180);
      const yj = latlngs[j].lat * Math.PI / 180 * R;
      area += xi * yj - xj * yi;
    }
    return Math.abs(area) / 2;
  }

  function formatArea(m2) {
    const ha = m2 / 10000;
    if (ha >= 1) return ha.toFixed(2) + ' ha';
    return (m2).toFixed(0) + ' m²';
  }

  function m2ToAcres(m2) {
    return m2 / 4046.86;
  }

  function getTotalAreaAcres() {
    return regions.reduce((total, region) => {
      const latlngs = region.layer.getLatLngs ? region.layer.getLatLngs()[0] : [];
      const areaM2 = latlngs.length > 2 ? haversineArea(latlngs) : 0;
      return total + m2ToAcres(areaM2);
    }, 0);
  }

  function addRegion(layer) {
    // Check max 5 areas limit
    if (regions.length >= 5) {
      alert('Maximum 5 land areas allowed. Please remove an area before drawing another.');
      return;
    }

    // Check total area limit
    const newAreaM2 = layer.getLatLngs ? haversineArea(layer.getLatLngs()[0]) : 0;
    const newAreaAcres = m2ToAcres(newAreaM2);
    const currentTotalAcres = getTotalAreaAcres();
    const newTotalAcres = currentTotalAcres + newAreaAcres;

    if (newTotalAcres > 1000) {
      alert(`This area would exceed the 1000 acre limit. Current total: ${currentTotalAcres.toFixed(2)} acres, new area: ${newAreaAcres.toFixed(2)} acres.\n\nFor larger land areas, please contact us for a detailed estimate.`);
      return;
    }

    regionCounter++;
    const color = PALETTE[(regions.length) % PALETTE.length];
    const name = 'Land ' + regionCounter;
    const id = 'region-' + Date.now();

    layer.setStyle({ color, weight: 2.5, fillOpacity: 0.2, fillColor: color });
    drawnItems.addLayer(layer);

    regions.push({ id, name, layer, color });
    renderRegionsList();
    updateSubmitBtn();
  }

  function removeRegion(id) {
    const idx = regions.findIndex(r => r.id === id);
    if (idx === -1) return;
    drawnItems.removeLayer(regions[idx].layer);
    regions.splice(idx, 1);
    renderRegionsList();
    updateSubmitBtn();
  }

  function renderRegionsList() {
    const list = document.getElementById('regionsList');
    const empty = document.getElementById('regionEmpty');

    if (regions.length === 0) {
      list.innerHTML = '';
      list.appendChild(empty);
      empty.style.display = '';
      document.getElementById('regionCountLabel').textContent = '0';
      return;
    }
    empty.style.display = 'none';

    // Clear only the cards, not the entire list
    const existingCards = list.querySelectorAll('.region-card');
    existingCards.forEach(card => card.remove());
    
    // Remove warning if it exists
    const existingWarning = list.querySelector('[data-warning]');
    if (existingWarning) {
      existingWarning.remove();
    }

    const totalAcres = getTotalAreaAcres();
    const shouldShowWarning = totalAcres > 900;
    
    if (shouldShowWarning) {
      const warningDiv = document.createElement('div');
      warningDiv.setAttribute('data-warning', 'true');
      warningDiv.style.cssText = 'background: #fff3cd; border: 1px solid #ffc107; border-radius: var(--radius); padding: 0.6rem; margin-bottom: 0.8rem; font-size: 0.75rem; color: #856404;';
      warningDiv.innerHTML = `⚠️ Total: <strong>${totalAcres.toFixed(2)} acres</strong> — Approaching 1000 acre limit. Contact us for larger areas.`;
      list.appendChild(warningDiv);
    }

    regions.forEach(region => {
      const latlngs = region.layer.getLatLngs ? region.layer.getLatLngs()[0] : [];
      const areaM2 = latlngs.length > 2 ? haversineArea(latlngs) : 0;
      const areaAcres = m2ToAcres(areaM2);
      const bounds = region.layer.getBounds();

      const card = document.createElement('div');
      card.className = 'region-card';
      card.dataset.regionId = region.id;
      card.innerHTML = `
        <div class="region-card-top">
          <div class="region-dot" style="background:${region.color}"></div>
          <input class="region-name-input" type="text" value="${region.name}" maxlength="40" aria-label="Land name" data-region-id="${region.id}" />
          <button class="region-delete-btn" type="button" title="Remove land area" data-region-id="${region.id}">✕</button>
        </div>
        <div class="region-meta">
          <span>📐 ${formatArea(areaM2)}</span>
          <span style="font-size: 0.75rem; color: var(--text-muted);">(${areaAcres.toFixed(2)} acres)</span>
          <button class="region-zoom-btn" type="button" data-region-id="${region.id}">Zoom to area</button>
        </div>
      `;
      list.appendChild(card);

      const nameInput = card.querySelector('.region-name-input');
      nameInput.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        nameInput.focus();
        nameInput.select();
      });
      nameInput.addEventListener('input', (e) => {
        region.name = e.target.value || 'Unnamed';
      });
      nameInput.addEventListener('blur', (e) => {
        region.name = e.target.value || 'Unnamed';
      });

      const deleteBtn = card.querySelector('.region-delete-btn');
      deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeRegion(region.id);
      });

      const zoomBtn = card.querySelector('.region-zoom-btn');
      zoomBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        map.fitBounds(bounds, { padding: [40, 40] });
      });
    });

    document.getElementById('regionCountLabel').textContent = regions.length;
  }

  /* ── Map events ───────────────────────────────– */
  map.on(L.Draw.Event.DELETED, (e) => {
    e.layers.eachLayer(layer => {
      const region = regions.find(r => r.layer === layer);
      if (region) {
        regions = regions.filter(r => r.id !== region.id);
      }
    });
    renderRegionsList();
    updateSubmitBtn();
  });

  /* ── Local tile-stitching renderer ─────────────
   *  No export API required. Fetches individual 256 px
   *  slippy-map tiles, stitches them on a <canvas>, then
   *  draws the polygon outline on top — all in-browser.
   * ─────────────────────────────────────────────── */
  const TILE_SIZE = 256;
  const OUT_W     = 1200;
  const OUT_H     = 900;

  const TERRAIN_SERVERS = ['a', 'b', 'c'];
  const TERRAIN_PRIMARY  = (x, y, z) => `https://tile.opentopomap.org/${z}/${x}/${y}.png`;
  const TERRAIN_FALLBACK = (x, y, z) => {
    const s = TERRAIN_SERVERS[(x + y) % 3];
    return `https://${s}.tile.openstreetmap.org/${z}/${x}/${y}.png`;
  };
  const TILE_SATELLITE = (x, y, z) =>
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

  const TERRAIN_MAX_ZOOM = 17;

  function mercPx(lng, lat, zoom) {
    const n   = Math.pow(2, zoom) * TILE_SIZE;
    const x   = ((lng + 180) / 360) * n;
    const rad = lat * Math.PI / 180;
    const y   = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n;
    return { x, y };
  }

  function chooseBestZoom(latlngs, maxZoom = 17) {
    const lats = latlngs.map(ll => ll.lat);
    const lngs = latlngs.map(ll => ll.lng);
    const bbox = {
      north: Math.max(...lats), south: Math.min(...lats),
      east:  Math.max(...lngs), west:  Math.min(...lngs),
    };
    for (let z = Math.min(maxZoom, 17); z >= 1; z--) {
      const nw = mercPx(bbox.west, bbox.north, z);
      const se = mercPx(bbox.east, bbox.south, z);
      if ((se.x - nw.x) <= OUT_W * 0.60 && (se.y - nw.y) <= OUT_H * 0.60) return z;
    }
    return 3;
  }

  function loadTileWithRetry(primaryUrl, fallbackUrl = null, retries = 2, delayMs = 300) {
    return new Promise((resolve, reject) => {
      function attempt(url, attemptsLeft, isFallback) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => {
          if (attemptsLeft > 0) {
            setTimeout(() => attempt(url, attemptsLeft - 1, isFallback), delayMs * (retries - attemptsLeft + 1));
          } else if (!isFallback && fallbackUrl) {
            attempt(fallbackUrl, retries, true);
          } else {
            reject(new Error(`Tile failed: ${url}`));
          }
        };
        img.src = url;
      }
      attempt(primaryUrl, retries, false);
    });
  }

  async function fetchTilesInBatches(tasks, batchSize = 6) {
    for (let i = 0; i < tasks.length; i += batchSize) {
      await Promise.all(tasks.slice(i, i + batchSize).map(fn => fn()));
    }
  }

  async function renderRegionImage(tileUrlFn, latlngs, parcelName, maxZoom = 17) {
    const zoom        = chooseBestZoom(latlngs, maxZoom);
    const maxTileIdx  = Math.pow(2, zoom) - 1;

    const lats = latlngs.map(ll => ll.lat);
    const lngs = latlngs.map(ll => ll.lng);
    const bbox = {
      north: Math.max(...lats), south: Math.min(...lats),
      east:  Math.max(...lngs), west:  Math.min(...lngs),
    };

    const nwPx = mercPx(bbox.west, bbox.north, zoom);
    const sePx = mercPx(bbox.east, bbox.south, zoom);
    const cx   = (nwPx.x + sePx.x) / 2;
    const cy   = (nwPx.y + sePx.y) / 2;

    const originX = cx - OUT_W / 2;
    const originY = cy - OUT_H / 2;

    const tileX0 = Math.floor(originX / TILE_SIZE);
    const tileY0 = Math.floor(originY / TILE_SIZE);
    const tileX1 = Math.floor((originX + OUT_W - 1) / TILE_SIZE);
    const tileY1 = Math.floor((originY + OUT_H - 1) / TILE_SIZE);

    const canvas = document.createElement('canvas');
    canvas.width  = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#d4d0c8';
    ctx.fillRect(0, 0, OUT_W, OUT_H);

    const tasks = [];
    for (let ty = tileY0; ty <= tileY1; ty++) {
      for (let tx = tileX0; tx <= tileX1; tx++) {
        if (tx < 0 || ty < 0 || tx > maxTileIdx || ty > maxTileIdx) continue;
        const px = Math.round(tx * TILE_SIZE - originX);
        const py = Math.round(ty * TILE_SIZE - originY);
        const capturedTx = tx, capturedTy = ty, capturedPx = px, capturedPy = py;
        tasks.push(() =>
          tileUrlFn === TERRAIN_PRIMARY
            ? loadTileWithRetry(TERRAIN_PRIMARY(capturedTx, capturedTy, zoom), TERRAIN_FALLBACK(capturedTx, capturedTy, zoom))
                .then(img => ctx.drawImage(img, capturedPx, capturedPy, TILE_SIZE, TILE_SIZE))
                .catch(() => {})
            : loadTileWithRetry(tileUrlFn(capturedTx, capturedTy, zoom))
                .then(img => ctx.drawImage(img, capturedPx, capturedPy, TILE_SIZE, TILE_SIZE))
                .catch(() => {})
        );
      }
    }
    await fetchTilesInBatches(tasks, 8);

    const project = (ll) => {
      const p = mercPx(ll.lng, ll.lat, zoom);
      return { x: p.x - originX, y: p.y - originY };
    };

    ctx.beginPath();
    latlngs.forEach((ll, i) => { const p = project(ll); i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); });
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,215,0,0.18)';
    ctx.fill();

    ctx.beginPath();
    latlngs.forEach((ll, i) => { const p = project(ll); i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); });
    ctx.closePath();
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth   = 3.5;
    ctx.lineJoin    = 'round';
    ctx.stroke();

    const centroid = latlngs.reduce(
      (acc, ll) => ({ lat: acc.lat + ll.lat / latlngs.length, lng: acc.lng + ll.lng / latlngs.length }),
      { lat: 0, lng: 0 }
    );
    const cp = project(centroid);
    ctx.font = 'bold 16px "DM Sans", sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    const labelText = parcelName || 'Land Area';
    const tw = ctx.measureText(labelText).width;
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(cp.x - tw / 2 - 10, cp.y - 13, tw + 20, 26);
    ctx.fillStyle = '#FFD700';
    ctx.fillText(labelText, cp.x, cp.y);

    ctx.font         = '11px sans-serif';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle    = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, OUT_H - 18, OUT_W, 18);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('© OpenStreetMap contributors · OpenTopoMap · Esri', 6, OUT_H - 3);

    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null')), 'image/png');
    });
  }

  /* ── Submit flow ──────────────────────────────– */
  submitBtn.addEventListener('click', (e) => {
    e.preventDefault();
    form.dispatchEvent(new Event('submit'));
  });

  async function startGeneration() {
    const backdrop    = document.getElementById('modalBackdrop');
    const progressDiv = document.getElementById('modalProgress');
    const successDiv  = document.getElementById('modalSuccess');
    const fillBar     = document.getElementById('progressFill');
    const labelEl    = document.getElementById('progressLabel');
    const itemsEl    = document.getElementById('progressItems');

    progressDiv.classList.add('show');
    successDiv.classList.remove('show');
    fillBar.style.width = '0%';
    labelEl.textContent = 'Preparing…';
    itemsEl.innerHTML = '';
    backdrop.classList.add('open');

    const items = {};
    regions.forEach(region => {
      const row = document.createElement('div');
      row.className = 'progress-item';
      row.innerHTML = `<div class="progress-item-dot"></div><span>${region.name} — terrain &amp; satellite</span>`;
      itemsEl.appendChild(row);
      items[region.id] = row;
    });

    const zip = new JSZip();
    const total = regions.length * 2;
    let done = 0;
    const fileList = [];
    const errors = [];

    function setProgress(label) {
      const pct = Math.round((done / total) * 100);
      fillBar.style.width = pct + '%';
      labelEl.textContent = label;
    }

    for (const region of regions) {
      const row = items[region.id];
      row.classList.add('processing');
      const latlngs = region.layer.getLatLngs ? region.layer.getLatLngs()[0] : [];
      const safeName = region.name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_') || 'land';

      try {
        setProgress(`Rendering terrain for "${region.name}"…`);
        const terrainBlob = await renderRegionImage(TERRAIN_PRIMARY, latlngs, region.name, TERRAIN_MAX_ZOOM);
        const terrainName = `${safeName}_terrain.png`;
        zip.file(terrainName, terrainBlob);
        fileList.push(terrainName);
        done++;
        setProgress(`Rendering satellite for "${region.name}"…`);

        const satBlob = await renderRegionImage(TILE_SATELLITE, latlngs, region.name);
        const satName = `${safeName}_satellite.png`;
        zip.file(satName, satBlob);
        fileList.push(satName);
        done++;

        row.classList.remove('processing');
        row.classList.add('done');
      } catch (err) {
        console.error(err);
        errors.push(`${region.name}: ${err.message}`);
        row.classList.remove('processing');
        row.classList.add('error');
        row.querySelector('span').textContent += ' — ⚠️ failed';
        done += 2;
      }
      setProgress(done < total ? 'Processing next area…' : 'Building archive…');
    }

    const meta = {
      generated: new Date().toISOString(),
      submitted_by: {
        fullname: document.getElementById('fullname').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        address: document.getElementById('address').value,
        postcode: document.getElementById('postcode').value,
        county: document.getElementById('county').value,
      },
      parcels: regions.map(r => {
        const latlngs = r.layer.getLatLngs ? r.layer.getLatLngs()[0] : [];
        const areaM2  = latlngs.length > 2 ? haversineArea(latlngs) : 0;
        return {
          name: r.name,
          area_m2: Math.round(areaM2),
          area_ha: +(areaM2 / 10000).toFixed(4),
          coordinates: latlngs.map(ll => ({ lat: ll.lat, lng: ll.lng })),
        };
      }),
      errors,
    };
    zip.file('parcel_metadata.json', JSON.stringify(meta, null, 2));
    fileList.push('parcel_metadata.json');

    fillBar.style.width = '100%';
    labelEl.textContent = 'Generating ZIP…';

    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const zipUrl  = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = zipUrl;
    a.download = `acres-assets-land-${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(zipUrl);

    progressDiv.classList.remove('show');
    successDiv.classList.add('show');

    const filesEl = document.getElementById('successFiles');
    filesEl.innerHTML = `<strong>${fileList.length} files in archive</strong>` +
      fileList.map(f => `<div>📄 ${f}</div>`).join('');

    if (errors.length) {
      filesEl.innerHTML += `<div style="margin-top:0.5rem;color:#c0392b;font-size:0.76rem;">⚠️ ${errors.length} area(s) had errors — check console for details.</div>`;
    }
  }

  /* ── Modal close ──────────────────────────────– */
  const modalClose = document.getElementById('modalClose');
  if (modalClose) {
    modalClose.addEventListener('click', () => {
      document.getElementById('modalBackdrop').classList.remove('open');
    });
  }

  document.getElementById('modalBackdrop').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalBackdrop')) {
      document.getElementById('modalBackdrop').classList.remove('open');
    }
  });

  /* ── Render initial state ─────────────────────– */
  renderRegionsList();
  updateSubmitBtn();

    })(); // IIFE
  } // initMap

  initMap(); // Call the function to initialize when Leaflet is ready

}); // DOMContentLoaded
