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

      /* ── API Configuration ──────────────────────────────– */
      const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      const API_BASE_URL = isProduction 
        ? 'https://westmorelandbiodiversity.azurewebsites.net'
        : 'http://localhost:7058';

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

      /* ── Parcel query string serialization ─────────────– */
      function serializeParcelData() {
        if (regions.length === 0) {
          return null;
        }
        
        const parcelData = regions.map(region => {
          const latlngs = region.layer.getLatLngs ? region.layer.getLatLngs()[0] : [];
          return {
            name: region.name,
            coords: latlngs.map(ll => `${ll.lat.toFixed(6)},${ll.lng.toFixed(6)}`).join(';'),
          };
        });
        
        return JSON.stringify(parcelData);
      }

      function updateQueryString() {
        const serialized = serializeParcelData();
        if (serialized) {
          const encoded = btoa(serialized); // Base64 encode for URL safety
          const params = new URLSearchParams(window.location.search);
          params.set('parcels', encoded);
          window.history.replaceState({}, '', '?' + params.toString());
        } else {
          // Remove parcels from query string if no regions
          const params = new URLSearchParams(window.location.search);
          params.delete('parcels');
          const newUrl = params.toString() ? '?' + params.toString() : window.location.pathname;
          window.history.replaceState({}, '', newUrl);
        }
      }

      function deserializeParcelData(encoded) {
        try {
          const serialized = atob(encoded); // Base64 decode
          const parcelData = JSON.parse(serialized);
          if (!Array.isArray(parcelData)) {
            throw new Error('Invalid parcel data format');
          }
          return parcelData;
        } catch (err) {
          console.warn('Failed to deserialize parcel data:', err);
          return null;
        }
      }

      async function restoreParcelsFromQueryString() {
        const params = new URLSearchParams(window.location.search);
        const encoded = params.get('parcels');
        
        if (!encoded) {
          console.log('No parcel data in query string');
          return;
        }

        const parcelData = deserializeParcelData(encoded);
        if (!parcelData) {
          console.warn('Could not deserialize parcel data');
          return;
        }

        console.log('Restoring', parcelData.length, 'parcel(s) from query string');

        for (const parcel of parcelData) {
          try {
            const coordPairs = parcel.coords.split(';').map(pair => {
              const [lat, lng] = pair.split(',').map(parseFloat);
              return { lat, lng };
            });

            if (coordPairs.length < 2) {
              console.warn('Skipping parcel with insufficient coordinates:', parcel.name);
              continue;
            }

            // Create a Leaflet polygon layer
            const layer = L.polygon(coordPairs, {
              color: PALETTE[regions.length % PALETTE.length],
              weight: 2.5,
              fillOpacity: 0.2,
            });

            // Temporarily set region name before adding
            regionCounter++;
            const id = 'region-' + Date.now() + '-' + regions.length;
            const color = PALETTE[(regions.length) % PALETTE.length];
            const name = parcel.name || 'Land ' + regionCounter;

            layer.setStyle({ color, weight: 2.5, fillOpacity: 0.2, fillColor: color });
            drawnItems.addLayer(layer);

            regions.push({ id, name, layer, color });
            
            // Small delay to allow rendering
            await new Promise(resolve => setTimeout(resolve, 50));
          } catch (err) {
            console.error('Error restoring parcel:', parcel.name, err);
          }
        }

        // Render the regions list and update UI
        renderRegionsList();
        updateSubmitBtn();
        console.log('Restoration complete. ' + regions.length + ' parcel(s) restored.');
      }

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
        submitBtn.textContent = 'Generating estimate…';
        
        // Start the generation process
        startGeneration().then(() => {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }).catch(err => {
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
    updateQueryString();
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
        <div class="region-images" style="display: none;">
          <div class="region-image-row">
            <div class="region-image-item">
              <div class="region-image-placeholder">🗺️</div>
              <img class="region-image" data-region-id="${region.id}" data-type="terrain" src="" alt="Terrain" style="display:none;" />
              <small>Terrain</small>
            </div>
            <div class="region-image-item">
              <div class="region-image-placeholder">🛰️</div>
              <img class="region-image" data-region-id="${region.id}" data-type="satellite" src="" alt="Satellite" style="display:none;" />
              <small>Satellite</small>
            </div>
          </div>
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
        updateQueryString();
      });
      nameInput.addEventListener('blur', (e) => {
        region.name = e.target.value || 'Unnamed';
        updateQueryString();
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

      // Generate full-size images asynchronously (same as submission)
      const imagesContainer = card.querySelector('.region-images');
      if (imagesContainer && latlngs.length > 2) {
        (async () => {
          try {
            // Generate terrain image (full-size, pre-loaded for submission)
            const terrainBlob = await renderRegionImage(TERRAIN_PRIMARY, latlngs, region.name, TERRAIN_MAX_ZOOM, OUT_W, OUT_H);
            const terrainBase64 = await blobToBase64(terrainBlob);
            region.terrainImageBase64 = terrainBase64;
            
            const terrainUrl = URL.createObjectURL(terrainBlob);
            const terrainImg = card.querySelector(`img[data-region-id="${region.id}"][data-type="terrain"]`);
            if (terrainImg) {
              terrainImg.src = terrainUrl;
              terrainImg.style.display = '';
              terrainImg.parentElement.querySelector('.region-image-placeholder').style.display = 'none';
              if (!region.imageUrls) region.imageUrls = [];
              region.imageUrls.push(terrainUrl);
            }

            // Generate satellite image (full-size, pre-loaded for submission)
            const satBlob = await renderRegionImage(TILE_SATELLITE, latlngs, region.name, 17, OUT_W, OUT_H);
            const satelliteBase64 = await blobToBase64(satBlob);
            region.satelliteImageBase64 = satelliteBase64;
            
            const satUrl = URL.createObjectURL(satBlob);
            const satImg = card.querySelector(`img[data-region-id="${region.id}"][data-type="satellite"]`);
            if (satImg) {
              satImg.src = satUrl;
              satImg.style.display = '';
              satImg.parentElement.querySelector('.region-image-placeholder').style.display = 'none';
              if (!region.imageUrls) region.imageUrls = [];
              region.imageUrls.push(satUrl);
            }

            // Show the images container
            imagesContainer.style.display = '';
          } catch (err) {
            console.error('Error generating preview images:', err);
          }
        })();
      }
    });

    document.getElementById('regionCountLabel').textContent = regions.length;
  }

  function removeRegion(id) {
    const idx = regions.findIndex(r => r.id === id);
    if (idx === -1) return;
    
    // Clean up object URLs
    const region = regions[idx];
    if (region.imageUrls) {
      region.imageUrls.forEach(url => URL.revokeObjectURL(url));
    }
    
    drawnItems.removeLayer(region.layer);
    regions.splice(idx, 1);
    renderRegionsList();
    updateSubmitBtn();
    updateQueryString();
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
    updateQueryString();
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

  async function renderRegionImage(tileUrlFn, latlngs, parcelName, maxZoom = 17, outW = OUT_W, outH = OUT_H) {
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

    const originX = cx - outW / 2;
    const originY = cy - outH / 2;

    const tileX0 = Math.floor(originX / TILE_SIZE);
    const tileY0 = Math.floor(originY / TILE_SIZE);
    const tileX1 = Math.floor((originX + outW - 1) / TILE_SIZE);
    const tileY1 = Math.floor((originY + outH - 1) / TILE_SIZE);

    const canvas = document.createElement('canvas');
    canvas.width  = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#d4d0c8';
    ctx.fillRect(0, 0, outW, outH);

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
    ctx.fillRect(0, outH - 18, outW, 18);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('© OpenStreetMap contributors · OpenTopoMap · Esri', 6, outH - 3);

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
    const labelEl     = document.getElementById('progressLabel');
    const itemsEl     = document.getElementById('progressItems');
    const iconEl      = successDiv.querySelector('.modal-icon');
    const resultTitle = document.getElementById('modalResultTitle');
    const resultMsg   = document.getElementById('modalResultMessage');
    const resultDetails = document.getElementById('resultDetails');
    const retryBtn    = document.getElementById('modalRetry');

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
      row.innerHTML = `<div class="progress-item-dot"></div><span>${region.name} — preparing parcel</span>`;
      itemsEl.appendChild(row);
      items[region.id] = row;
    });

    const total = regions.length;
    let done = 0;
    const parcels = [];
    const errors = [];

    function setProgress(label) {
      const pct = total ? Math.round((done / total) * 100) : 100;
      fillBar.style.width = pct + '%';
      labelEl.textContent = label;
    }

    // Use pre-loaded terrain and satellite images
    for (const region of regions) {
      const row = items[region.id];
      row.classList.add('processing');
      const latlngs = region.layer.getLatLngs ? region.layer.getLatLngs()[0] : [];
      const areaM2  = latlngs.length > 2 ? haversineArea(latlngs) : 0;
      const areaHa  = (areaM2 / 10000).toFixed(4);

      try {
        if (!region.terrainImageBase64 || !region.satelliteImageBase64) {
          setProgress(`Rendering images for "${region.name}"…`);
          const terrainBlob = await renderRegionImage(TERRAIN_PRIMARY, latlngs, region.name, TERRAIN_MAX_ZOOM);
          region.terrainImageBase64 = await blobToBase64(terrainBlob);

          const satBlob = await renderRegionImage(TILE_SATELLITE, latlngs, region.name);
          region.satelliteImageBase64 = await blobToBase64(satBlob);
        }

        parcels.push({
          name: region.name,
          area_m2: Math.round(areaM2),
          area_ha: Number(areaHa),
          coordinates: latlngs.map(ll => ({ lat: ll.lat, lng: ll.lng })),
          satellite_image_base64: region.satelliteImageBase64,
          terrain_image_base64: region.terrainImageBase64,
        });

        row.classList.remove('processing');
        row.classList.add('done');
        done++;
        setProgress(done < total ? 'Preparing next parcel…' : 'Sending estimate…');
      } catch (err) {
        errors.push(`${region.name}: ${err.message}`);
        row.classList.remove('processing');
        row.classList.add('error');
        row.querySelector('span').textContent += ' — failed to prepare';
        done++;
        setProgress(done < total ? 'Continuing with next parcel…' : 'Sending estimate…');
      }
    }

    const estimateRequest = {
      parcels,
      enquiry: {
        fullname: document.getElementById('fullname').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        address: document.getElementById('address').value,
        postcode: document.getElementById('postcode').value,
        county: document.getElementById('county').value,
      },
    };

    fillBar.style.width = '100%';
    labelEl.textContent = 'Sending estimate…';

    try {
      const response = await fetch(`${API_BASE_URL}/api/Estimate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(estimateRequest),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      const responseData = await response.json();
      progressDiv.classList.remove('show');
      successDiv.classList.add('show');
      if (iconEl) iconEl.textContent = '📈';
      if (resultTitle) resultTitle.textContent = 'Estimate received';
      if (resultMsg) resultMsg.textContent = 'Your estimate data has been returned successfully.';
      if (retryBtn) retryBtn.style.display = 'none';
      if (resultDetails) resultDetails.innerHTML = renderEstimateResponse(responseData, errors);
    } catch (err) {
      progressDiv.classList.remove('show');
      successDiv.classList.add('show');
      if (iconEl) iconEl.textContent = '⚠️';
      if (resultTitle) resultTitle.textContent = 'Estimate failed';
      if (resultMsg) resultMsg.textContent = 'We could not complete the estimate. Please retry when your connection is restored.';
      if (retryBtn) retryBtn.style.display = 'inline-flex';
      if (resultDetails) resultDetails.innerHTML = `<div class="modal-error-message">${escapeHtml(err.message || 'An unknown error occurred.')}</div>`;
      throw err;
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatCurrency(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return '£0';
    }
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(number);
  }

  function formatNumber(value, digits = 2) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return '0';
    }
    return number.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function renderEstimateResponse(data, errors = []) {
    const summary = data.project_summary || {};
    const terms = data.commercial_terms || {};
    const parcels = Array.isArray(data.land_parcels) ? data.land_parcels : [];

    const rows = [];
    rows.push(`<div class="summary-group"><div class="summary-row"><span>Reference file</span><strong>${escapeHtml(summary.reference_file || 'N/A')}</strong></div>` +
      `<div class="summary-row"><span>Total hectares</span><strong>${formatNumber(summary.total_hectares, 2)}</strong></div>` +
      `<div class="summary-row"><span>Estimated BNG units</span><strong>${formatNumber(summary.total_estimated_bng_units, 1)}</strong></div>` +
      `<div class="summary-row"><span>Estimated NN (kg P)</span><strong>${formatNumber(summary.total_estimated_nn_p_kg, 1)}</strong></div>` +
      `<div class="summary-row"><span>Overall valuation</span><strong>${formatCurrency(summary.overall_valuation_gbp || 0)}</strong></div></div>`);

    rows.push(`<div class="summary-group"><div class="summary-row"><span>Agreement length</span><strong>${escapeHtml(terms.agreement_length_years ? terms.agreement_length_years + ' years' : 'N/A')}</strong></div>` +
      `<div class="summary-row"><span>Payment structure</span><strong>${escapeHtml(terms.payment_structure || 'N/A')}</strong></div>` +
      `<div class="summary-row"><span>Generated at</span><strong>${formatDateTime(data.generated_at || '')}</strong></div></div>`);

    if (parcels.length) {
      rows.push('<div class="parcel-list"><h3>Parcel details</h3>');
      parcels.forEach(parcel => {
        rows.push(`<div class="parcel-card"><div class="parcel-card-header"><strong>${escapeHtml(parcel.primary_habitat || parcel.parcel_id || 'Parcel')}</strong></div>` +
          `<div class="parcel-row"><span>ID</span><strong>${escapeHtml(parcel.parcel_id || 'N/A')}</strong></div>` +
          `<div class="parcel-row"><span>Hectares</span><strong>${formatNumber(parcel.hectares, 2)}</strong></div>` +
          `<div class="parcel-row"><span>Predicted condition</span><strong>${escapeHtml(parcel.predicted_condition || 'N/A')}</strong></div>` +
          `<div class="parcel-row"><span>BNG contribution</span><strong>${formatNumber(parcel.bng_unit_contribution, 1)} units</strong></div>` +
          `<div class="parcel-row"><span>NN contribution</span><strong>${formatNumber(parcel.nn_unit_contribution_p_kg, 1)} kg P</strong></div></div>`);
      });
      rows.push('</div>');
    }

    if (errors.length) {
      rows.push(`<div class="modal-error-message">${escapeHtml(errors.join(' | '))}</div>`);
    }

    return rows.join('');
  }

  // Helper function to convert blob to base64
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const base64 = result.split(',')[1]; // Remove data:image/png;base64, prefix
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /* ── Modal close ──────────────────────────────– */
  const modalClose = document.getElementById('modalClose');
  const modalRetry = document.getElementById('modalRetry');
  if (modalClose) {
    modalClose.addEventListener('click', () => {
      document.getElementById('modalBackdrop').classList.remove('open');
    });
  }

  if (modalRetry) {
    modalRetry.addEventListener('click', () => {
      document.getElementById('modalBackdrop').classList.remove('open');
      submitBtn.focus();
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
  
  // Restore parcels from query string if available
  restoreParcelsFromQueryString();

    })(); // IIFE
  } // initMap

  initMap(); // Call the function to initialize when Leaflet is ready

}); // DOMContentLoaded
