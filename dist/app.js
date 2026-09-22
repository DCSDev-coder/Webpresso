(() => {
  const state = { items: [], processing: false };
  const $ = (id) => document.getElementById(id);
  const els = {
    dropZone: $('drop-zone'), fileInput: $('file-input'), quality: $('quality'), qualityValue: $('quality-value'),
    resizeToggle: $('resize-toggle'), resizeFields: $('resize-fields'), maxWidth: $('max-width'),
    empty: $('empty-state'), summary: $('summary'), summaryCount: $('summary-count'), summarySaved: $('summary-saved'),
    summaryBar: $('summary-bar'), list: $('result-list'), downloadAll: $('download-all'), toast: $('toast')
  };

  const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, i);
    return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
  };

  const outputName = (name) => `${name.replace(/\.[^.]+$/, '') || 'image'}.webp`;

  const showToast = (message) => {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove('show'), 2200);
  };

  const decodeImage = (file) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This image format is not supported by your browser.')); };
    image.src = url;
  });

  const convertFile = async (file) => {
    const { image, url } = await decodeImage(file);
    try {
      const limit = els.resizeToggle.checked ? Math.max(64, Number(els.maxWidth.value) || 1920) : image.naturalWidth;
      const scale = image.naturalWidth > limit ? limit / image.naturalWidth : 1;
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d', { alpha: true });
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, width, height);
      const blob = await new Promise((resolve, reject) => canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error('WebP conversion is not available in this browser.')),
        'image/webp', Number(els.quality.value) / 100
      ));
      return { blob, width, height, preview: URL.createObjectURL(blob) };
    } finally { URL.revokeObjectURL(url); }
  };

  const render = () => {
    const done = state.items.filter((item) => item.status === 'done');
    const hasItems = state.items.length > 0;
    els.empty.hidden = hasItems;
    els.summary.hidden = !hasItems;
    els.downloadAll.hidden = done.length < 2;
    els.summaryCount.textContent = `${state.items.length} image${state.items.length === 1 ? '' : 's'}`;
    const original = done.reduce((sum, item) => sum + item.file.size, 0);
    const converted = done.reduce((sum, item) => sum + item.blob.size, 0);
    const saved = Math.max(0, original - converted);
    const ratio = original ? Math.max(0, Math.min(100, (saved / original) * 100)) : 0;
    els.summarySaved.textContent = done.length ? `${formatBytes(saved)} saved` : 'Converting…';
    els.summaryBar.style.width = `${ratio}%`;
    els.list.innerHTML = '';

    state.items.forEach((item) => {
      const row = document.createElement('article');
      row.className = 'result-item';
      const thumb = document.createElement('img');
      thumb.className = 'thumb'; thumb.alt = ''; thumb.src = item.preview || item.sourcePreview;
      const info = document.createElement('div'); info.className = 'file-info';
      const name = document.createElement('p'); name.className = 'file-name'; name.textContent = outputName(item.file.name);
      const meta = document.createElement('div'); meta.className = 'file-meta';
      if (item.status === 'done') {
        const percent = item.file.size ? Math.round((1 - item.blob.size / item.file.size) * 100) : 0;
        meta.innerHTML = `<span>${formatBytes(item.file.size)}</span><span>→</span><span>${formatBytes(item.blob.size)}</span><span class="saving">${percent >= 0 ? `${percent}% smaller` : 'WebP ready'}</span>`;
      } else if (item.status === 'error') {
        meta.innerHTML = `<span class="file-error"></span>`;
        meta.firstElementChild.textContent = item.error;
      } else meta.textContent = 'Converting…';
      info.append(name, meta);
      const action = document.createElement('button');
      action.className = 'item-action'; action.type = 'button'; action.disabled = item.status !== 'done'; action.title = 'Download WebP';
      action.setAttribute('aria-label', `Download ${outputName(item.file.name)}`);
      action.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 4v11m0 0 4-4m-4 4-4-4M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      action.addEventListener('click', () => downloadItem(item));
      row.append(thumb, info, action); els.list.append(row);
    });
  };

  const downloadItem = (item) => {
    if (!item.blob) return;
    const link = document.createElement('a');
    link.href = item.preview; link.download = outputName(item.file.name);
    document.body.append(link); link.click(); link.remove();
  };

  const addFiles = async (fileList) => {
    const files = Array.from(fileList).filter((file) => file.type.startsWith('image/') || /\.(svg|avif|bmp)$/i.test(file.name));
    if (!files.length) { showToast('Please choose an image file.'); return; }
    const newItems = files.map((file) => ({ file, status: 'queued', sourcePreview: URL.createObjectURL(file) }));
    state.items.push(...newItems); render();
    for (const item of newItems) {
      item.status = 'processing'; render();
      try { Object.assign(item, await convertFile(item.file), { status: 'done' }); }
      catch (error) { item.status = 'error'; item.error = error.message || 'Could not convert this image.'; }
      render();
    }
    const completed = newItems.filter((item) => item.status === 'done').length;
    showToast(completed ? `${completed} image${completed === 1 ? '' : 's'} converted` : 'No images could be converted');
  };

  els.dropZone.addEventListener('click', () => els.fileInput.click());
  els.dropZone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); els.fileInput.click(); } });
  els.fileInput.addEventListener('change', (event) => { addFiles(event.target.files); event.target.value = ''; });
  ['dragenter', 'dragover'].forEach((name) => els.dropZone.addEventListener(name, (event) => { event.preventDefault(); els.dropZone.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach((name) => els.dropZone.addEventListener(name, (event) => { event.preventDefault(); els.dropZone.classList.remove('dragging'); }));
  els.dropZone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));
  els.quality.addEventListener('input', () => { els.qualityValue.textContent = `${els.quality.value}%`; });
  els.resizeToggle.addEventListener('change', () => { els.resizeFields.hidden = !els.resizeToggle.checked; });
  els.downloadAll.addEventListener('click', async () => {
    const done = state.items.filter((item) => item.status === 'done');
    done.forEach((item, index) => setTimeout(() => downloadItem(item), index * 180));
    showToast(`Downloading ${done.length} images`);
  });

  const context = document.modelContext;
  if (context?.registerTool) {
    const lifecycle = new AbortController();
    Promise.resolve(context.registerTool({
      name: 'configure_webp_output', title: 'Configure WebP output',
      description: 'Set the WebP quality and optional maximum image width shown in the converter.',
      inputSchema: { type: 'object', properties: { quality: { type: 'integer', minimum: 10, maximum: 100 }, maxWidth: { type: ['integer', 'null'], minimum: 64, maximum: 12000 } }, required: ['quality'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || !Number.isInteger(input.quality) || input.quality < 10 || input.quality > 100) throw new Error('Quality must be a whole number from 10 to 100.');
        if (input.maxWidth !== undefined && input.maxWidth !== null && (!Number.isInteger(input.maxWidth) || input.maxWidth < 64 || input.maxWidth > 12000)) throw new Error('Maximum width must be a whole number from 64 to 12000.');
        els.quality.value = input.quality; els.qualityValue.textContent = `${input.quality}%`;
        els.resizeToggle.checked = input.maxWidth != null; els.resizeFields.hidden = input.maxWidth == null;
        if (input.maxWidth != null) els.maxWidth.value = input.maxWidth;
        return { quality: input.quality, resizeEnabled: input.maxWidth != null, maxWidth: input.maxWidth ?? null };
      }
    }, { signal: lifecycle.signal })).catch(() => {});
  }
})();
