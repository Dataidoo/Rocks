/* ============================================================
   Rock Vault — app logic
   ============================================================ */

(() => {
  'use strict';

  /* ---------------- state ---------------- */
  let allSpecimens = [];
  let currentFilter = 'all';
  let currentSort = 'inventoryDesc';
  let currentSearch = '';
  let editingId = null;             // null = new specimen
  let pendingImages = { top: null, front: null, side: null };   // Blobs staged in the form
  let existingImages = { top: null, front: null, side: null };  // Blobs already saved (edit mode, untouched slots)
  let objectUrls = [];              // for cleanup
  let detailOpenId = null;

  /* ---------------- element refs ---------------- */
  const $ = (id) => document.getElementById(id);
  const cardGrid = $('cardGrid');
  const emptyState = $('emptyState');
  const searchInput = $('searchInput');
  const sortSelect = $('sortSelect');
  const filterChips = $('filterChips');

  const editModal = $('editModal');
  const detailModal = $('detailModal');
  const settingsModal = $('settingsModal');
  const confirmModal = $('confirmModal');
  const specimenForm = $('specimenForm');

  /* ================================================================
     INIT
     ================================================================ */
  async function init() {
    applyStoredTheme();
    registerServiceWorker();
    bindGlobalEvents();
    bindFormEvents();
    await refreshFromDb();
  }

  async function refreshFromDb() {
    allSpecimens = await RockDB.getAll();
    renderStats();
    renderGrid();
  }

  /* ================================================================
     THEME
     ================================================================ */
  function applyStoredTheme() {
    const stored = localStorage.getItem('rockvault-theme');
    if (stored) document.documentElement.setAttribute('data-theme', stored);
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('rockvault-theme', next === 'dark' ? 'dark' : '');
  }

  /* ================================================================
     SERVICE WORKER
     ================================================================ */
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').catch(() => {});
      });
    }
  }

  /* ================================================================
     UNIT HELPERS + DENSITY CALC
     ================================================================ */
  function toCm(value, unit) {
    if (!value) return 0;
    return unit === 'in' ? value * 2.54 : value / 10;
  }
  function toGrams(value, unit) {
    if (!value) return 0;
    return unit === 'oz' ? value * 28.3495 : value;
  }
  function computeVolumeDensity(specimen) {
    const l = toCm(parseFloat(specimen.dimL) || 0, specimen.dimUnit);
    const w = toCm(parseFloat(specimen.dimW) || 0, specimen.dimUnit);
    const h = toCm(parseFloat(specimen.dimH) || 0, specimen.dimUnit);
    const volume = l * w * h;
    const grams = toGrams(parseFloat(specimen.weight) || 0, specimen.weightUnit);
    const density = volume > 0 ? grams / volume : 0;
    return { volume, density };
  }

  /* ================================================================
     GRID RENDER
     ================================================================ */
  function matchesFilter(s) {
    if (currentFilter === 'known') return s.status === 'known';
    if (currentFilter === 'unknown') return s.status === 'unknown';
    if (currentFilter === 'favorite') return !!s.favorite;
    return true;
  }
  function matchesSearch(s) {
    if (!currentSearch) return true;
    const q = currentSearch.toLowerCase();
    const hay = [
      s.inventoryNumber, s.assumedIdentity, s.knownIdentity, s.rockMinerals,
      s.locationFound, s.tags, s.notes, s.storageLocation,
    ].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  }
  function sortSpecimens(list) {
    const arr = [...list];
    switch (currentSort) {
      case 'inventoryAsc': return arr.sort((a, b) => (a.id || 0) - (b.id || 0));
      case 'inventoryDesc': return arr.sort((a, b) => (b.id || 0) - (a.id || 0));
      case 'dateFoundAsc': return arr.sort((a, b) => (a.dateFound || '').localeCompare(b.dateFound || ''));
      case 'dateFoundDesc': return arr.sort((a, b) => (b.dateFound || '').localeCompare(a.dateFound || ''));
      case 'dateAddedDesc': return arr.sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || ''));
      case 'nameAsc': return arr.sort((a, b) => displayName(a).localeCompare(displayName(b)));
      case 'hardnessDesc': return arr.sort((a, b) => (parseFloat(b.mohsHardness) || 0) - (parseFloat(a.mohsHardness) || 0));
      case 'valueDesc': return arr.sort((a, b) => (parseFloat(b.estValue) || 0) - (parseFloat(a.estValue) || 0));
      case 'densityDesc': return arr.sort((a, b) => computeVolumeDensity(b).density - computeVolumeDensity(a).density);
      default: return arr;
    }
  }
  function displayName(s) {
    return s.knownIdentity || s.assumedIdentity || 'Unidentified specimen';
  }
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderStats() {
    const total = allSpecimens.length;
    const known = allSpecimens.filter((s) => s.status === 'known').length;
    const unknown = total - known;
    const fav = allSpecimens.filter((s) => s.favorite).length;
    const value = allSpecimens.reduce((sum, s) => sum + (parseFloat(s.estValue) || 0), 0);
    $('statTotal').textContent = total;
    $('statKnown').textContent = known;
    $('statUnknown').textContent = unknown;
    $('statFav').textContent = fav;
    $('statValue').textContent = '$' + value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function renderGrid() {
    const filtered = sortSpecimens(allSpecimens.filter((s) => matchesFilter(s) && matchesSearch(s)));
    cardGrid.innerHTML = '';
    emptyState.hidden = allSpecimens.length !== 0;

    if (filtered.length === 0 && allSpecimens.length > 0) {
      const p = document.createElement('p');
      p.className = 'empty-state';
      p.textContent = 'No specimens match your search / filter.';
      cardGrid.appendChild(p);
      return;
    }

    filtered.forEach((s) => cardGrid.appendChild(buildCard(s)));
  }

  function buildCard(s) {
    const card = document.createElement('div');
    card.className = `rock-card ${s.status === 'known' ? 'known' : 'unknown'}`;
    card.dataset.id = s.id;

    const photoBlob = s.images && (s.images.front || s.images.top || s.images.side);
    const photoHtml = photoBlob
      ? `<img src="${URL.createObjectURL(photoBlob)}" alt="${escapeHtml(displayName(s))}" />`
      : `<span class="no-photo">🪨</span>`;

    const minerals = (s.rockMinerals || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 3);
    const pillsHtml = minerals.map((m) => `<span class="meta-pill">${escapeHtml(m)}</span>`).join('')
      + (s.mohsHardness ? `<span class="meta-pill">Mohs ${escapeHtml(s.mohsHardness)}</span>` : '');

    card.innerHTML = `
      <div class="card-photo">
        ${photoHtml}
        <span class="card-badge-inv">${escapeHtml(s.inventoryNumber || '—')}</span>
        <span class="card-status-badge ${s.status}">${s.status === 'known' ? 'Known' : 'Unknown'}</span>
        <button class="card-fav ${s.favorite ? 'is-fav' : ''}" type="button" aria-label="Toggle favorite">${s.favorite ? '★' : '☆'}</button>
      </div>
      <div class="card-title">${escapeHtml(displayName(s))}</div>
      <div class="card-sub">${escapeHtml(s.assumedIdentity && s.knownIdentity ? 'Assumed: ' + s.assumedIdentity : (s.locationFound || 'No location logged'))}</div>
      <div class="card-meta-row">${pillsHtml}</div>
      <div class="card-footer-row">
        <span>${escapeHtml(s.dateFound || '')}</span>
        <span class="card-value">${s.estValue ? '$' + parseFloat(s.estValue).toLocaleString() : ''}</span>
      </div>
    `;

    card.querySelector('.card-fav').addEventListener('click', async (e) => {
      e.stopPropagation();
      s.favorite = !s.favorite;
      await RockDB.put(s);
      await refreshFromDb();
    });

    card.addEventListener('click', () => openDetail(s.id));
    return card;
  }

  /* ================================================================
     DETAIL VIEW
     ================================================================ */
  function openDetail(id) {
    const s = allSpecimens.find((x) => x.id === id);
    if (!s) return;
    detailOpenId = id;
    $('detailTitle').textContent = displayName(s);

    const { volume, density } = computeVolumeDensity(s);
    const photos = ['top', 'front', 'side'].map((k) => {
      const blob = s.images && s.images[k];
      return `<div class="dphoto">${blob ? `<img src="${URL.createObjectURL(blob)}" alt="${k}">` : ''}</div>`;
    }).join('');

    const item = (k, v) => v ? `<div class="detail-item"><div class="k">${k}</div><div class="v">${escapeHtml(v)}</div></div>` : '';

    $('detailBody').innerHTML = `
      <div class="detail-photos">${photos}</div>

      <div class="detail-section">
        <h3>Identity</h3>
        <div class="detail-grid">
          ${item('Inventory #', s.inventoryNumber)}
          ${item('Status', s.status === 'known' ? 'Known' : 'Unknown')}
          ${item('Favorite', s.favorite ? '★ Yes' : 'No')}
          ${item('Assumed identity', s.assumedIdentity)}
          ${item('Known identity', s.knownIdentity)}
          ${item('Rock / minerals', s.rockMinerals)}
          ${item('Condition', s.condition)}
          ${item('Est. value', s.estValue ? '$' + parseFloat(s.estValue).toLocaleString() : '')}
          ${item('Tags', s.tags)}
        </div>
      </div>

      <div class="detail-section">
        <h3>Tests &amp; Measurements</h3>
        <div class="detail-grid">
          ${item('Mohs hardness', s.mohsHardness)}
          ${item('Streak', s.streak)}
          ${item('Luster', s.luster)}
          ${item('UV reaction', s.uvReaction)}
          ${item('UV notes', s.uvNotes)}
          ${item('Acid test', s.acidTest)}
          ${item('Magnetic', s.magnetic)}
          ${item('Cleavage / fracture', s.cleavage)}
          ${item('Dimensions', (s.dimL && s.dimW && s.dimH) ? `${s.dimL} × ${s.dimW} × ${s.dimH} ${s.dimUnit}` : '')}
          ${item('Weight', s.weight ? `${s.weight} ${s.weightUnit}` : '')}
          ${item('Est. volume', volume ? volume.toFixed(2) + ' cm³' : '')}
          ${item('Est. density', density ? density.toFixed(2) + ' g/cm³' : '')}
        </div>
      </div>

      <div class="detail-section">
        <h3>Provenance</h3>
        <div class="detail-grid">
          ${item('Location found', s.locationFound)}
          ${item('GPS coordinates', s.gpsCoords)}
          ${item('Date found', s.dateFound)}
          ${item('Date added', s.dateAdded)}
          ${item('Acquired via', s.acquisitionSource)}
          ${item('Storage location', s.storageLocation)}
        </div>
      </div>

      ${s.notes ? `<div class="detail-section"><h3>Notes</h3><div class="detail-notes">${escapeHtml(s.notes)}</div></div>` : ''}
    `;

    detailModal.hidden = false;
  }

  /* ================================================================
     ADD / EDIT MODAL
     ================================================================ */
  function resetForm() {
    specimenForm.reset();
    pendingImages = { top: null, front: null, side: null };
    existingImages = { top: null, front: null, side: null };
    ['Top', 'Front', 'Side'].forEach((k) => {
      $('img' + k + 'Preview').hidden = true;
      $('img' + k + 'Preview').src = '';
    });
    $('favoriteToggle').classList.remove('is-fav');
    $('favoriteToggle').textContent = '☆';
    $('favoriteToggle').dataset.fav = 'false';
    $('densityOutput').textContent = '— cm³ / — g/cm³';
    switchTab('photos');
    $('btnDelete').hidden = true;
  }

  async function openAddModal() {
    editingId = null;
    resetForm();
    $('modalTitle').textContent = 'New Specimen';
    $('inventoryNumber').value = await RockDB.nextInventoryNumber();
    $('dateAdded').value = new Date().toISOString().slice(0, 10);
    editModal.hidden = false;
  }

  function openEditModal(id) {
    const s = allSpecimens.find((x) => x.id === id);
    if (!s) return;
    editingId = id;
    resetForm();
    $('modalTitle').textContent = 'Edit Specimen';
    $('btnDelete').hidden = false;

    $('inventoryNumber').value = s.inventoryNumber || '';
    $('statusSelect').value = s.status || 'unknown';
    setFavoriteToggle(!!s.favorite);

    $('assumedIdentity').value = s.assumedIdentity || '';
    $('knownIdentity').value = s.knownIdentity || '';
    $('rockMinerals').value = s.rockMinerals || '';
    $('estValue').value = s.estValue || '';
    $('condition').value = s.condition || '';
    $('tags').value = s.tags || '';

    $('mohsHardness').value = s.mohsHardness || '';
    $('streak').value = s.streak || '';
    $('luster').value = s.luster || '';
    $('uvReaction').value = s.uvReaction || 'not-tested';
    $('uvNotes').value = s.uvNotes || '';
    $('acidTest').value = s.acidTest || 'not-tested';
    $('magnetic').value = s.magnetic || 'not-tested';
    $('cleavage').value = s.cleavage || '';

    $('dimL').value = s.dimL || '';
    $('dimW').value = s.dimW || '';
    $('dimH').value = s.dimH || '';
    $('dimUnit').value = s.dimUnit || 'mm';
    $('weight').value = s.weight || '';
    $('weightUnit').value = s.weightUnit || 'g';

    $('locationFound').value = s.locationFound || '';
    $('gpsCoords').value = s.gpsCoords || '';
    $('dateFound').value = s.dateFound || '';
    $('acquisitionSource').value = s.acquisitionSource || 'found';
    $('storageLocation').value = s.storageLocation || '';
    $('dateAdded').value = s.dateAdded || '';
    $('notes').value = s.notes || '';

    if (s.images) {
      existingImages = { ...s.images };
      ['top', 'front', 'side'].forEach((k) => {
        if (s.images[k]) showPreview(k, s.images[k]);
      });
    }

    updateDensityPreview();
    $('modalTitle').textContent = 'Edit Specimen';
    editModal.hidden = false;
  }

  function closeEditModal() {
    editModal.hidden = true;
  }

  function setFavoriteToggle(isFav) {
    const btn = $('favoriteToggle');
    btn.dataset.fav = isFav ? 'true' : 'false';
    btn.classList.toggle('is-fav', isFav);
    btn.textContent = isFav ? '★' : '☆';
    btn.setAttribute('aria-pressed', String(isFav));
  }

  function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabName));
    document.querySelectorAll('.tab-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === tabName));
  }

  function showPreview(slot, blob) {
    const img = $('img' + capitalize(slot) + 'Preview');
    const url = URL.createObjectURL(blob);
    objectUrls.push(url);
    img.src = url;
    img.hidden = false;
  }
  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function updateDensityPreview() {
    const draft = {
      dimL: $('dimL').value, dimW: $('dimW').value, dimH: $('dimH').value, dimUnit: $('dimUnit').value,
      weight: $('weight').value, weightUnit: $('weightUnit').value,
    };
    const { volume, density } = computeVolumeDensity(draft);
    $('densityOutput').textContent = `${volume ? volume.toFixed(2) : '—'} cm³ / ${density ? density.toFixed(2) : '—'} g/cm³`;
  }

  async function handleImageInput(slot, fileInput) {
    const file = fileInput.files[0];
    if (!file) return;
    pendingImages[slot] = file;
    showPreview(slot, file);
  }

  async function saveSpecimen(e) {
    e.preventDefault();
    const now = new Date().toISOString();

    const images = {
      top: pendingImages.top || existingImages.top || null,
      front: pendingImages.front || existingImages.front || null,
      side: pendingImages.side || existingImages.side || null,
    };

    const specimen = {
      inventoryNumber: $('inventoryNumber').value.trim(),
      status: $('statusSelect').value,
      favorite: $('favoriteToggle').dataset.fav === 'true',

      assumedIdentity: $('assumedIdentity').value.trim(),
      knownIdentity: $('knownIdentity').value.trim(),
      rockMinerals: $('rockMinerals').value.trim(),
      estValue: $('estValue').value,
      condition: $('condition').value,
      tags: $('tags').value.trim(),

      mohsHardness: $('mohsHardness').value,
      streak: $('streak').value.trim(),
      luster: $('luster').value,
      uvReaction: $('uvReaction').value,
      uvNotes: $('uvNotes').value.trim(),
      acidTest: $('acidTest').value,
      magnetic: $('magnetic').value,
      cleavage: $('cleavage').value.trim(),

      dimL: $('dimL').value, dimW: $('dimW').value, dimH: $('dimH').value, dimUnit: $('dimUnit').value,
      weight: $('weight').value, weightUnit: $('weightUnit').value,

      locationFound: $('locationFound').value.trim(),
      gpsCoords: $('gpsCoords').value.trim(),
      dateFound: $('dateFound').value,
      acquisitionSource: $('acquisitionSource').value,
      storageLocation: $('storageLocation').value.trim(),
      dateAdded: $('dateAdded').value,
      notes: $('notes').value.trim(),

      images,
      updatedAt: now,
    };

    if (!specimen.inventoryNumber) {
      showToast('Inventory # is required');
      return;
    }

    if (editingId) {
      specimen.id = editingId;
      const existing = allSpecimens.find((x) => x.id === editingId);
      specimen.createdAt = existing ? existing.createdAt : now;
    } else {
      specimen.createdAt = now;
    }

    await RockDB.put(specimen);
    closeEditModal();
    await refreshFromDb();
    showToast(editingId ? 'Specimen updated' : 'Specimen added');
  }

  /* ================================================================
     DELETE
     ================================================================ */
  function confirmDelete(id) {
    showConfirm('Delete this specimen? This cannot be undone.', async () => {
      await RockDB.delete(id);
      closeEditModal();
      detailModal.hidden = true;
      await refreshFromDb();
      showToast('Specimen deleted');
    });
  }

  /* ================================================================
     CONFIRM / TOAST helpers
     ================================================================ */
  let confirmCallback = null;
  function showConfirm(message, onOk) {
    $('confirmMessage').textContent = message;
    confirmCallback = onOk;
    confirmModal.hidden = false;
  }
  let toastTimer = null;
  function showToast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  /* ================================================================
     BACKUP / RESTORE / CSV
     ================================================================ */
  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  async function dataUrlToBlob(dataUrl) {
    const res = await fetch(dataUrl);
    return res.blob();
  }

  async function exportBackup() {
    const specimens = await RockDB.getAll();
    const out = [];
    for (const s of specimens) {
      const copy = { ...s };
      const imgs = {};
      if (s.images) {
        for (const k of ['top', 'front', 'side']) {
          imgs[k] = s.images[k] ? await blobToDataUrl(s.images[k]) : null;
        }
      }
      copy.images = imgs;
      out.push(copy);
    }
    const payload = { app: 'rock-vault', version: 1, exportedAt: new Date().toISOString(), specimens: out };
    downloadFile(JSON.stringify(payload, null, 2), `rock-vault-backup-${dateStamp()}.json`, 'application/json');
    showToast('Backup exported');
  }

  async function importBackup(file) {
    const text = await file.text();
    let payload;
    try { payload = JSON.parse(text); } catch { showToast('Invalid backup file'); return; }
    if (!payload.specimens) { showToast('Invalid backup file'); return; }

    showConfirm(`Import ${payload.specimens.length} specimen(s)? Existing entries with the same ID will be overwritten.`, async () => {
      for (const s of payload.specimens) {
        const copy = { ...s };
        const imgs = {};
        if (s.images) {
          for (const k of ['top', 'front', 'side']) {
            imgs[k] = s.images[k] ? await dataUrlToBlob(s.images[k]) : null;
          }
        }
        copy.images = imgs;
        await RockDB.put(copy);
      }
      await refreshFromDb();
      showToast('Backup imported');
      settingsModal.hidden = true;
    });
  }

  function exportCsv() {
    const cols = [
      'inventoryNumber', 'status', 'favorite', 'assumedIdentity', 'knownIdentity', 'rockMinerals',
      'estValue', 'condition', 'tags', 'mohsHardness', 'streak', 'luster', 'uvReaction', 'uvNotes',
      'acidTest', 'magnetic', 'cleavage', 'dimL', 'dimW', 'dimH', 'dimUnit', 'weight', 'weightUnit',
      'estVolumeCm3', 'estDensityGcm3', 'locationFound', 'gpsCoords', 'dateFound', 'acquisitionSource',
      'storageLocation', 'dateAdded', 'notes',
    ];
    const rows = allSpecimens.map((s) => {
      const { volume, density } = computeVolumeDensity(s);
      const row = { ...s, estVolumeCm3: volume.toFixed(2), estDensityGcm3: density.toFixed(2) };
      return cols.map((c) => csvEscape(row[c]));
    });
    const csv = [cols.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadFile(csv, `rock-vault-export-${dateStamp()}.csv`, 'text/csv');
    showToast('CSV exported');
  }
  function csvEscape(v) {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function dateStamp() { return new Date().toISOString().slice(0, 10); }
  function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ================================================================
     EVENT BINDING
     ================================================================ */
  function bindGlobalEvents() {
    $('btnTheme').addEventListener('click', toggleTheme);
    $('btnAdd').addEventListener('click', openAddModal);
    $('btnSettings').addEventListener('click', () => { settingsModal.hidden = false; });
    $('btnCloseSettings').addEventListener('click', () => { settingsModal.hidden = true; });

    searchInput.addEventListener('input', (e) => { currentSearch = e.target.value; renderGrid(); });
    sortSelect.addEventListener('change', (e) => { currentSort = e.target.value; renderGrid(); });
    filterChips.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderGrid();
    });

    $('btnCloseDetail').addEventListener('click', () => { detailModal.hidden = true; });
    detailModal.addEventListener('click', (e) => { if (e.target === detailModal) detailModal.hidden = true; });
    $('btnDetailEdit').addEventListener('click', () => { detailModal.hidden = true; openEditModal(detailOpenId); });
    $('btnDetailDelete').addEventListener('click', () => confirmDelete(detailOpenId));

    settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) settingsModal.hidden = true; });
    $('btnExportBackup').addEventListener('click', exportBackup);
    $('btnExportCsv').addEventListener('click', exportCsv);
    $('importFile').addEventListener('change', (e) => {
      if (e.target.files[0]) importBackup(e.target.files[0]);
      e.target.value = '';
    });

    $('confirmCancel').addEventListener('click', () => { confirmModal.hidden = true; confirmCallback = null; });
    $('confirmOk').addEventListener('click', async () => {
      confirmModal.hidden = true;
      if (confirmCallback) await confirmCallback();
      confirmCallback = null;
    });
  }

  function bindFormEvents() {
    $('btnCloseModal').addEventListener('click', closeEditModal);
    $('btnCancel').addEventListener('click', closeEditModal);
    editModal.addEventListener('click', (e) => { if (e.target === editModal) closeEditModal(); });

    document.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

    $('favoriteToggle').addEventListener('click', () => {
      const isFav = $('favoriteToggle').dataset.fav === 'true';
      setFavoriteToggle(!isFav);
    });

    $('imgTop').addEventListener('change', (e) => handleImageInput('top', e.target));
    $('imgFront').addEventListener('change', (e) => handleImageInput('front', e.target));
    $('imgSide').addEventListener('change', (e) => handleImageInput('side', e.target));

    ['dimL', 'dimW', 'dimH', 'dimUnit', 'weight', 'weightUnit'].forEach((id) => {
      $(id).addEventListener('input', updateDensityPreview);
      $(id).addEventListener('change', updateDensityPreview);
    });

    specimenForm.addEventListener('submit', saveSpecimen);
    $('btnDelete').addEventListener('click', () => { if (editingId) confirmDelete(editingId); });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
