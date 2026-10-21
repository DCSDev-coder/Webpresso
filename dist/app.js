(() => {
  const STORAGE_KEY_ROUTE = 'webpresso_last_route_v2';
  const STORAGE_KEY_STACK = 'webpresso_nav_stack_v2';

  const state = {
    activeStudio: 'image',
    items: [],
    processing: false,
    pdfTool: 'merge',
    pdfCategory: 'all',
    pdfSearch: '',
    pdfQueue: [],
    workbenchPages: [],
    pdfResults: [],
    pdfProcessing: false,
    sigHasDrawing: false,
    navStack: []
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    studiosRoot: $('studios-root'),
    tabBtnImage: $('tab-btn-image'),
    tabBtnPdf: $('tab-btn-pdf'),
    imageStudioPanel: $('image-studio-panel'),
    pdfStudioPanel: $('pdf-studio-panel'),
    pageTitle: $('page-title'),
    pdfPageTitle: $('pdf-page-title'),

    // Route & History Bar
    routeBar: $('route-bar'),
    navBackBtn: $('nav-back-btn'),
    navBackLabel: $('nav-back-label'),
    breadcrumbStudioLink: $('breadcrumb-studio-link'),
    breadcrumbTool: $('breadcrumb-tool'),
    breadcrumbToolLabel: $('breadcrumb-tool-label'),
    routeSlug: $('route-slug'),
    copyRouteLink: $('copy-route-link'),

    // Image Studio
    dropZone: $('drop-zone'),
    fileInput: $('file-input'),
    quality: $('quality'),
    qualityValue: $('quality-value'),
    resizeToggle: $('resize-toggle'),
    resizeFields: $('resize-fields'),
    maxWidth: $('max-width'),
    empty: $('empty-state'),
    summary: $('summary'),
    summaryCount: $('summary-count'),
    summarySaved: $('summary-saved'),
    summaryBar: $('summary-bar'),
    list: $('result-list'),
    downloadAll: $('download-all'),
    clearImages: $('clear-images'),

    // PDF Command Bar & Tool Grid
    pdfCategoryBar: $('pdf-category-bar'),
    pdfToolSearch: $('pdf-tool-search'),
    pdfToolGrid: $('pdf-tool-grid'),

    // PDF Workspace Left
    pdfStep1Title: $('pdf-step1-title'),
    pdfSampleBtn: $('pdf-sample-btn'),
    pdfDropZone: $('pdf-drop-zone'),
    pdfDropTitle: $('pdf-drop-title'),
    pdfFormatNote: $('pdf-format-note'),
    pdfFileInput: $('pdf-file-input'),
    pdfQueueWrap: $('pdf-queue-wrap'),
    pdfQueueCount: $('pdf-queue-count'),
    pdfClearQueue: $('pdf-clear-queue'),
    pdfSourceList: $('pdf-source-list'),

    // Visual Page Workbench
    pdfPageWorkbench: $('pdf-page-workbench'),
    workbenchPageCount: $('workbench-page-count'),
    workbenchAddBlank: $('workbench-add-blank'),
    workbenchReset: $('workbench-reset'),
    workbenchGrid: $('workbench-grid'),

    // Tool-Specific Inputs
    pdfStep2Title: $('pdf-step2-title'),
    mergeFilename: $('merge-filename'),
    splitRangeFields: $('split-range-fields'),
    splitRanges: $('split-ranges'),
    splitTotalPagesHint: $('split-total-pages-hint'),
    splitMergeToggle: $('split-merge-toggle'),
    organizeFilter: $('organize-filter'),
    rotateAngle: $('rotate-angle'),
    rotateTarget: $('rotate-target'),
    grayscaleMode: $('grayscale-mode'),
    imgPdfPageSize: $('img-pdf-pagesize'),
    imgPdfOrientation: $('img-pdf-orientation'),
    imgPdfMargin: $('img-pdf-margin'),
    imgPdfQuality: $('img-pdf-quality'),
    imgPdfQualityVal: $('img-pdf-quality-val'),
    textPdfEditor: $('text-pdf-editor'),
    textPdfFont: $('text-pdf-font'),
    textPdfTheme: $('text-pdf-theme'),
    pdfImgFormat: $('pdf-img-format'),
    pdfImgScale: $('pdf-img-scale'),
    pdfImgQuality: $('pdf-img-quality'),
    pdfImgQualityVal: $('pdf-img-quality-val'),
    pdfTextFormat: $('pdf-text-format'),
    pagenumPos: $('pagenum-pos'),
    pagenumFormat: $('pagenum-format'),
    pagenumStart: $('pagenum-start'),
    pagenumSize: $('pagenum-size'),
    watermarkText: $('watermark-text'),
    watermarkStyle: $('watermark-style'),
    watermarkColor: $('watermark-color'),
    watermarkOpacity: $('watermark-opacity'),
    watermarkOpacityVal: $('watermark-opacity-val'),
    sigCanvas: $('sig-canvas'),
    sigClearBtn: $('sig-clear-btn'),
    sigSignerName: $('sig-signer-name'),
    sigPosition: $('sig-position'),
    sigTargetPage: $('sig-target-page'),
    sigInkColor: $('sig-ink-color'),
    cropMargin: $('crop-margin'),
    cropMarginVal: $('crop-margin-val'),
    cropBorderToggle: $('crop-border-toggle'),
    protectTitle: $('protect-title'),
    protectAuthor: $('protect-author'),
    protectPin: $('protect-pin'),
    protectBanner: $('protect-banner'),

    pdfProcessBtn: $('pdf-process-btn'),
    pdfProcessBtnLabel: $('pdf-process-btn-label'),

    // PDF Workspace Right
    pdfResultsHeading: $('pdf-results-heading'),
    pdfChainBtn: $('pdf-chain-btn'),
    pdfClearResults: $('pdf-clear-results'),
    pdfDownloadAll: $('pdf-download-all'),
    pdfEmptyState: $('pdf-empty-state'),
    pdfEmptyFrontBadge: $('pdf-empty-front-badge'),
    pdfEmptyTitle: $('pdf-empty-title'),
    pdfEmptyCopy: $('pdf-empty-copy'),
    pdfSummary: $('pdf-summary'),
    pdfSummaryCount: $('pdf-summary-count'),
    pdfSummarySaved: $('pdf-summary-saved'),
    pdfSummaryBar: $('pdf-summary-bar'),
    pdfResultList: $('pdf-result-list'),
    extractedTextPanel: $('extracted-text-panel'),
    extractedTextOutput: $('extracted-text-output'),
    copyExtractedBtn: $('copy-extracted-btn'),

    toast: $('toast')
  };

  // Break up long tasks with a 50ms budget (modern-web-guidance: break-up-long-tasks)
  const createYieldController = () => {
    let deadline = performance.now() + 50;
    return async () => {
      if (performance.now() >= deadline) {
        if ('scheduler' in window && 'yield' in window.scheduler) {
          await window.scheduler.yield();
        } else {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        deadline = performance.now() + 50;
      }
    };
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
    showToast.timer = setTimeout(() => els.toast.classList.remove('show'), 2500);
  };

  const revokeUrlSafe = (url) => {
    if (url && typeof url === 'string' && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  };

  // Fallback for range progress in browsers without accent-color (brand-consistent-forms)
  if (typeof CSS !== 'undefined' && !CSS.supports('accent-color', '#c7ff4a')) {
    document.querySelectorAll('input[type="range"]').forEach((slider) => {
      const syncProgress = () => {
        const min = Number(slider.min) || 0;
        const max = Number(slider.max) || 100;
        const val = Number(slider.value) || 0;
        const pct = Math.round(((val - min) / Math.max(1, max - min)) * 100);
        slider.style.setProperty('--progress', `${pct}%`);
      };
      syncProgress();
      slider.addEventListener('input', syncProgress);
    });
  }

  // ==================== 16 PDF TOOLS METADATA ====================
  const PDF_TOOL_META = {
    merge: {
      title: 'Merge PDF',
      step1: 'Add PDF files to merge',
      dropTitle: 'Drop PDF files here',
      formatNote: 'PDF DOCUMENTS · REORDERABLE MULTI-FILE MERGE',
      accept: 'application/pdf,.pdf',
      multiple: true,
      step2: 'Merge options',
      btnLabel: 'Merge PDF',
      resultsHeading: 'Your merged PDF',
      badge: 'MERGE',
      emptyTitle: 'Ready to merge PDFs',
      emptyCopy: 'Add two or more PDF files on the left, arrange their order, and combine them into one document.',
      sampleBtnText: '+ Load 2 sample PDFs'
    },
    split: {
      title: 'Split PDF',
      step1: 'Add a PDF file to split',
      dropTitle: 'Drop a PDF file here',
      formatNote: 'PDF DOCUMENT · EXTRACT RANGES OR BURST PAGES',
      accept: 'application/pdf,.pdf',
      multiple: false,
      step2: 'Split & extraction options',
      btnLabel: 'Split PDF',
      resultsHeading: 'Your split PDF files',
      badge: 'SPLIT',
      emptyTitle: 'Ready to split your PDF',
      emptyCopy: 'Upload a multi-page PDF to extract custom ranges (e.g. 1-2) or burst every page into individual PDFs.',
      sampleBtnText: '+ Load 3-page sample PDF'
    },
    organize: {
      title: 'Organize Pages',
      step1: 'Add a PDF to organize pages',
      dropTitle: 'Drop a PDF file here',
      formatNote: 'PDF DOCUMENT · REORDER, DUPLICATE, DELETE & BLANK',
      accept: 'application/pdf,.pdf',
      multiple: false,
      step2: 'Page organization options',
      btnLabel: 'Apply Page Organization',
      resultsHeading: 'Your organized PDF',
      badge: 'PAGES',
      emptyTitle: 'Ready to organize pages',
      emptyCopy: 'Load a PDF to visually reorder, rotate, duplicate, or delete pages in the Visual Page Workbench.',
      sampleBtnText: '+ Load 3-page sample PDF'
    },
    rotate: {
      title: 'Rotate PDF',
      step1: 'Add a PDF file to rotate',
      dropTitle: 'Drop a PDF file here',
      formatNote: 'PDF DOCUMENT · ROTATE 90°, 180°, OR 270°',
      accept: 'application/pdf,.pdf',
      multiple: false,
      step2: 'Rotation settings',
      btnLabel: 'Rotate PDF',
      resultsHeading: 'Your rotated PDF',
      badge: 'ROTATE',
      emptyTitle: 'Ready to rotate pages',
      emptyCopy: 'Rotate all pages or target only portrait, landscape, odd, or even pages.',
      sampleBtnText: '+ Load 3-page sample PDF'
    },
    compress: {
      title: 'Compress PDF',
      step1: 'Add PDF files to compress',
      dropTitle: 'Drop PDF files here',
      formatNote: 'PDF DOCUMENTS · SMART LOCAL COMPRESSION',
      accept: 'application/pdf,.pdf',
      multiple: true,
      step2: 'Compression level',
      btnLabel: 'Compress PDF',
      resultsHeading: 'Your compressed PDFs',
      badge: 'TINY',
      emptyTitle: 'Ready to shrink your PDF',
      emptyCopy: 'Select a PDF and choose Extreme, Recommended, or Less Compression to optimize file weight locally.',
      sampleBtnText: '+ Load sample PDF'
    },
    repair: {
      title: 'Repair PDF',
      step1: 'Add a PDF to repair & sanitize',
      dropTitle: 'Drop a PDF file here',
      formatNote: 'PDF DOCUMENT · REBUILD XREF & STREAMS',
      accept: 'application/pdf,.pdf',
      multiple: false,
      step2: 'Structural recovery',
      btnLabel: 'Repair & Rebuild PDF',
      resultsHeading: 'Your repaired PDF',
      badge: 'REPAIR',
      emptyTitle: 'Ready to repair PDF',
      emptyCopy: 'Reconstruct damaged cross-reference tables and normalize page streams into a clean PDF 1.4 file.',
      sampleBtnText: '+ Load sample PDF'
    },
    grayscale: {
      title: 'Grayscale & Scan',
      step1: 'Add a PDF for Grayscale / Scan',
      dropTitle: 'Drop a PDF file here',
      formatNote: 'PDF DOCUMENT · B&W PRINT & HIGH-CONTRAST SCAN',
      accept: 'application/pdf,.pdf',
      multiple: false,
      step2: 'Color conversion profile',
      btnLabel: 'Convert PDF Colors',
      resultsHeading: 'Your grayscale PDF',
      badge: 'B&W',
      emptyTitle: 'Ready for Grayscale & Scan',
      emptyCopy: 'Convert colorful PDFs to ink-saving grayscale, high-contrast document scan, or archival sepia.',
      sampleBtnText: '+ Load sample PDF'
    },
    'img-to-pdf': {
      title: 'Images to PDF',
      step1: 'Add images for your PDF',
      dropTitle: 'Drop images here',
      formatNote: 'JPG · PNG · WEBP · SVG · AVIF · BMP',
      accept: 'image/*,.svg,.avif,.bmp',
      multiple: true,
      step2: 'Page layout & margins',
      btnLabel: 'Convert Images to PDF',
      resultsHeading: 'Your generated PDF',
      badge: 'PDF',
      emptyTitle: 'Ready to build your PDF',
      emptyCopy: 'Add one or more images, customize page size, orientation, and margins, then generate a multi-page PDF.',
      sampleBtnText: '+ Load sample images'
    },
    'text-to-pdf': {
      title: 'HTML / Text to PDF',
      step1: 'Upload .md / .txt / .html or type below',
      dropTitle: 'Drop .md, .txt, or .html file',
      formatNote: 'MARKDOWN · HTML · PLAIN TEXT COMPOSER',
      accept: '.md,.txt,.html,text/plain,text/markdown,text/html',
      multiple: false,
      step2: 'Document content & typography',
      btnLabel: 'Typeset & Generate PDF',
      resultsHeading: 'Your typeset PDF',
      badge: 'DOC',
      emptyTitle: 'Ready to typeset PDF',
      emptyCopy: 'Write or paste Markdown, HTML, or notes on the left and click "Typeset & Generate PDF".',
      sampleBtnText: '+ Load sample Markdown'
    },
    'pdf-to-img': {
      title: 'PDF to Images',
      step1: 'Add PDF to extract images',
      dropTitle: 'Drop a PDF file here',
      formatNote: 'PDF DOCUMENT → WEBP, PNG, OR JPG IMAGES',
      accept: 'application/pdf,.pdf',
      multiple: false,
      step2: 'Image export settings',
      btnLabel: 'Convert PDF to Images',
      resultsHeading: 'Your extracted page images',
      badge: 'WEBP',
      emptyTitle: 'Ready to render PDF pages',
      emptyCopy: 'Upload a PDF to convert every page into high-resolution WebP, PNG, or JPG images.',
      sampleBtnText: '+ Load 3-page sample PDF'
    },
    'pdf-to-text': {
      title: 'PDF to Text & JSON',
      step1: 'Add PDF to extract text / JSON',
      dropTitle: 'Drop a PDF file here',
      formatNote: 'PDF DOCUMENT → .TXT, .MD, OR .JSON',
      accept: 'application/pdf,.pdf',
      multiple: false,
      step2: 'Extraction format',
      btnLabel: 'Extract Text & Metadata',
      resultsHeading: 'Your extracted text file',
      badge: 'TXT',
      emptyTitle: 'Ready to extract text',
      emptyCopy: 'Extract readable text streams and page metadata into Plain Text, Markdown, or JSON.',
      sampleBtnText: '+ Load 3-page sample PDF'
    },
    'page-numbers': {
      title: 'Page Numbers',
      step1: 'Add PDF for page numbering',
      dropTitle: 'Drop a PDF file here',
      formatNote: 'PDF DOCUMENT · CUSTOM HEADER / FOOTER NUMBERS',
      accept: 'application/pdf,.pdf',
      multiple: false,
      step2: 'Page number formatting',
      btnLabel: 'Stamp Page Numbers',
      resultsHeading: 'Your numbered PDF',
      badge: '1 / N',
      emptyTitle: 'Ready to number pages',
      emptyCopy: 'Stamp clean, customizable page numbers at any corner or center margin of your PDF.',
      sampleBtnText: '+ Load 3-page sample PDF'
    },
    watermark: {
      title: 'Add Watermark',
      step1: 'Add PDF to watermark',
      dropTitle: 'Drop a PDF file here',
      formatNote: 'PDF DOCUMENT · DIAGONAL, TILED, OR BANNER STAMP',
      accept: 'application/pdf,.pdf',
      multiple: false,
      step2: 'Watermark design',
      btnLabel: 'Stamp Watermark',
      resultsHeading: 'Your watermarked PDF',
      badge: 'STAMP',
      emptyTitle: 'Ready to stamp watermark',
      emptyCopy: 'Overlay CONFIDENTIAL, DRAFT, or custom text across every page with adjustable opacity and angle.',
      sampleBtnText: '+ Load 3-page sample PDF'
    },
    sign: {
      title: 'Sign PDF',
      step1: 'Add PDF to sign',
      dropTitle: 'Drop a PDF file here',
      formatNote: 'PDF DOCUMENT · HANDWRITTEN OR TYPED SIGNATURE',
      accept: 'application/pdf,.pdf',
      multiple: false,
      step2: 'Signature pad & placement',
      btnLabel: 'Sign & Stamp PDF',
      resultsHeading: 'Your signed PDF',
      badge: 'SIGN',
      emptyTitle: 'Ready to sign your PDF',
      emptyCopy: 'Draw your signature on the pad or type your name, pick a page & corner, and stamp your PDF locally.',
      sampleBtnText: '+ Load sample contract PDF'
    },
    crop: {
      title: 'Crop & Margins',
      step1: 'Add PDF to crop margins',
      dropTitle: 'Drop a PDF file here',
      formatNote: 'PDF DOCUMENT · TRIM MARGINS & FRAME',
      accept: 'application/pdf,.pdf',
      multiple: false,
      step2: 'Crop & frame settings',
      btnLabel: 'Crop PDF Margins',
      resultsHeading: 'Your cropped PDF',
      badge: 'CROP',
      emptyTitle: 'Ready to trim PDF margins',
      emptyCopy: 'Adjust page inset margins and optionally frame each page with a clean architectural border.',
      sampleBtnText: '+ Load sample PDF'
    },
    protect: {
      title: 'Protect & Metadata',
      step1: 'Add PDF to protect & flatten',
      dropTitle: 'Drop a PDF file here',
      formatNote: 'PDF DOCUMENT · TAMPER-FLATTEN & METADATA',
      accept: 'application/pdf,.pdf',
      multiple: false,
      step2: 'Security & metadata fields',
      btnLabel: 'Protect & Flatten PDF',
      resultsHeading: 'Your protected PDF',
      badge: 'LOCK',
      emptyTitle: 'Ready to protect your PDF',
      emptyCopy: 'Flatten selectable layers into tamper-resistant page bitmaps and embed custom title, author, and PIN seal.',
      sampleBtnText: '+ Load sample PDF'
    }
  };

  const VALID_CATEGORIES = ['all', 'organize', 'optimize', 'to-pdf', 'from-pdf', 'edit', 'security'];

  // ==================== DEEP-LINK ROUTER, PERSISTENCE & HISTORY ====================
  const loadSavedRoute = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_ROUTE);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.studio === 'image' || parsed.studio === 'pdf')) {
        return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return null;
  };

  const saveCurrentRoute = () => {
    const path = buildCanonicalHash(state.activeStudio, state.pdfTool);
    const record = {
      path,
      studio: state.activeStudio,
      pdfTool: state.pdfTool,
      pdfCategory: state.pdfCategory
    };
    try {
      localStorage.setItem(STORAGE_KEY_ROUTE, JSON.stringify(record));
      sessionStorage.setItem(STORAGE_KEY_STACK, JSON.stringify(state.navStack.slice(-25)));
    } catch {
      // ignore storage quota errors
    }
  };

  const loadSavedStack = () => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY_STACK);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr;
      }
    } catch {
      // ignore
    }
    return [];
  };

  const buildCanonicalHash = (studio, pdfTool) => {
    if (studio === 'pdf') {
      const validTool = PDF_TOOL_META[pdfTool] ? pdfTool : 'merge';
      return `/pdf/${validTool}`;
    }
    return '/image-studio';
  };

  const formatRouteLabel = (routeObj) => {
    if (!routeObj) return 'Previous';
    if (routeObj.studio === 'image') return 'Image Studio';
    const meta = PDF_TOOL_META[routeObj.pdfTool];
    return meta ? meta.title : 'PDF Studio';
  };

  // Parse a route path or legacy hash string like "/pdf/watermark", "/pdf/category/edit", "/image-studio"
  const parseHashString = (rawStr) => {
    const cleaned = String(rawStr || '')
      .replace(/^#+/, '')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .trim()
      .toLowerCase();

    if (!cleaned || cleaned === 'index.html') return null;

    if (cleaned === 'image-studio' || cleaned === 'image' || cleaned === 'webp') {
      return { studio: 'image', pdfTool: state.pdfTool, pdfCategory: state.pdfCategory };
    }
    if (cleaned === 'pdf-studio' || cleaned === 'pdf') {
      return { studio: 'pdf', pdfTool: state.pdfTool || 'merge', pdfCategory: state.pdfCategory };
    }
    if (cleaned.startsWith('pdf/category/')) {
      const cat = cleaned.slice('pdf/category/'.length);
      if (VALID_CATEGORIES.includes(cat)) {
        return {
          studio: 'pdf',
          pdfTool: state.pdfTool || 'merge',
          pdfCategory: cat
        };
      }
    }
    if (cleaned.startsWith('pdf/')) {
      const toolId = cleaned.slice('pdf/'.length);
      if (PDF_TOOL_META[toolId]) {
        return {
          studio: 'pdf',
          pdfTool: toolId,
          pdfCategory: state.pdfCategory
        };
      }
    }
    return null;
  };

  const parseCurrentLocation = () => {
    return parseHashString(window.location.pathname) || parseHashString(window.location.hash);
  };

  // Update the Header tabs, Breadcrumb bar, Back button, and Document Title
  const updateRouteUI = () => {
    const canonicalPath = buildCanonicalHash(state.activeStudio, state.pdfTool);

    // Keep the top PDF Studio tab link pointing to the user's active PDF tool
    if (els.tabBtnPdf) {
      els.tabBtnPdf.setAttribute('href', `/pdf/${state.pdfTool}`);
    }

    // Update permalink slug
    if (els.routeSlug) {
      els.routeSlug.textContent = canonicalPath;
    }

    // Update breadcrumbs
    if (state.activeStudio === 'image') {
      els.breadcrumbStudioLink.textContent = 'Image Studio (WebP)';
      els.breadcrumbStudioLink.setAttribute('href', '/image-studio');
      els.breadcrumbTool.hidden = true;
      document.title = 'Webpresso — Image to WebP Studio';
    } else {
      const toolMeta = PDF_TOOL_META[state.pdfTool] || PDF_TOOL_META.merge;
      els.breadcrumbStudioLink.textContent = 'PDF Studio';
      els.breadcrumbStudioLink.setAttribute('href', `/pdf/${state.pdfTool}`);
      els.breadcrumbTool.hidden = false;
      els.breadcrumbToolLabel.textContent = toolMeta.title;
      document.title = `${toolMeta.title} — Webpresso PDF Studio`;
    }

    // Update Back button state & label
    const prevEntry = state.navStack.length > 1 ? state.navStack[state.navStack.length - 2] : null;
    if (els.navBackBtn) {
      els.navBackBtn.disabled = !prevEntry;
      const prevName = prevEntry ? formatRouteLabel(prevEntry) : '';
      els.navBackLabel.textContent = prevEntry ? `Back to ${prevName}` : 'Back';
      els.navBackBtn.title = prevEntry
        ? `Return to ${prevName} (${buildCanonicalHash(prevEntry.studio, prevEntry.pdfTool)})`
        : 'No previous section in history';
    }
  };

  // Core studio switcher DOM logic (called by router & beforematch)
  const applyStudioDOM = (studioName) => {
    const target = studioName === 'pdf' ? 'pdf' : 'image';
    state.activeStudio = target;

    const isImage = target === 'image';
    const supportsUntilFound = 'onbeforematch' in HTMLElement.prototype;

    if (isImage) {
      els.imageStudioPanel.removeAttribute('hidden');
      if (supportsUntilFound) {
        els.pdfStudioPanel.setAttribute('hidden', 'until-found');
      } else {
        els.pdfStudioPanel.setAttribute('hidden', '');
      }
    } else {
      els.pdfStudioPanel.removeAttribute('hidden');
      if (supportsUntilFound) {
        els.imageStudioPanel.setAttribute('hidden', 'until-found');
      } else {
        els.imageStudioPanel.setAttribute('hidden', '');
      }
    }

    document.querySelectorAll('[data-studio-item]').forEach((li) => {
      li.classList.toggle('active', li.dataset.studioItem === target);
    });

    els.tabBtnImage.setAttribute('aria-expanded', isImage ? 'true' : 'false');
    els.tabBtnPdf.setAttribute('aria-expanded', !isImage ? 'true' : 'false');
    if (isImage) {
      els.tabBtnImage.setAttribute('aria-current', 'page');
      els.tabBtnPdf.removeAttribute('aria-current');
    } else {
      els.tabBtnPdf.setAttribute('aria-current', 'page');
      els.tabBtnImage.removeAttribute('aria-current');
    }
  };

  // Apply Category Filter DOM
  const applyPdfCategoryDOM = (catId) => {
    const validCat = VALID_CATEGORIES.includes(catId) ? catId : 'all';
    state.pdfCategory = validCat;
    document.querySelectorAll('[data-pdf-cat]').forEach((pill) => {
      pill.classList.toggle('active', pill.dataset.pdfCat === validCat);
    });
    filterToolCards();
  };

  // Navigate to a route state with View Transitions & Focus Management (same-document-transitions)
  const navigateTo = (targetRoute, options = {}) => {
    const nextStudio = targetRoute.studio === 'pdf' ? 'pdf' : 'image';
    const nextTool = PDF_TOOL_META[targetRoute.pdfTool] ? targetRoute.pdfTool : state.pdfTool || 'merge';
    const nextCat = VALID_CATEGORIES.includes(targetRoute.pdfCategory)
      ? targetRoute.pdfCategory
      : state.pdfCategory || 'all';

    const studioChanged = nextStudio !== state.activeStudio;
    const toolChanged = nextTool !== state.pdfTool;

    const performDOMUpdate = () => {
      applyStudioDOM(nextStudio);
      applyPdfCategoryDOM(nextCat);
      if (nextStudio === 'pdf') {
        selectPdfTool(nextTool, { fromRouter: true });
      }

      const canonicalPath = buildCanonicalHash(state.activeStudio, state.pdfTool);

      if (!options.skipStackPush) {
        const last = state.navStack[state.navStack.length - 1];
        if (!last || last.studio !== state.activeStudio || (state.activeStudio === 'pdf' && last.pdfTool !== state.pdfTool)) {
          state.navStack.push({
            studio: state.activeStudio,
            pdfTool: state.pdfTool,
            pdfCategory: state.pdfCategory
          });
        }
      }

      const statePayload = {
        studio: state.activeStudio,
        pdfTool: state.pdfTool,
        pdfCategory: state.pdfCategory
      };

      try {
        if (options.replaceHistory) {
          window.history.replaceState(statePayload, '', canonicalPath);
        } else if (
          !options.fromPopState &&
          (window.location.pathname !== canonicalPath || window.location.hash)
        ) {
          window.history.pushState(statePayload, '', canonicalPath);
        }
      } catch {
        // Fallback if opened via file:// protocol
        window.location.hash = `#${canonicalPath}`;
      }

      saveCurrentRoute();
      updateRouteUI();
    };

    const focusActiveHeading = () => {
      if (!options.focusHeading) return;
      if (state.activeStudio === 'image') {
        els.pageTitle?.focus({ preventScroll: true });
      } else {
        els.pdfPageTitle?.focus({ preventScroll: true });
      }
    };

    // Use View Transitions API for smooth SPA navigation when supported (same-document-transitions)
    if (options.animate && (studioChanged || toolChanged) && document.startViewTransition) {
      const transition = document.startViewTransition(() => {
        performDOMUpdate();
      });
      transition.finished.finally(() => {
        focusActiveHeading();
      });
    } else {
      performDOMUpdate();
      focusActiveHeading();
    }
  };

  // Switch studio helper used by tools
  const switchStudio = (studioName) => {
    navigateTo(
      { studio: studioName, pdfTool: state.pdfTool, pdfCategory: state.pdfCategory },
      { animate: true, focusHeading: true }
    );
  };

  // Synchronize studio tab state when browser Find-in-Page matches hidden="until-found" content
  if (els.studiosRoot) {
    els.studiosRoot.addEventListener('beforematch', (event) => {
      const matchedPanel = event.target.closest('.studio-panel');
      if (!matchedPanel) return;
      const targetStudio = matchedPanel.dataset.studioPanel;
      if (targetStudio) {
        document.querySelectorAll('.studio-panel').forEach((panel) => {
          if (panel !== matchedPanel) {
            panel.hidden = 'until-found';
          }
        });
        state.activeStudio = targetStudio;
        applyStudioDOM(targetStudio);
        saveCurrentRoute();
        updateRouteUI();
      }
    });
  }

  if (!('onbeforematch' in HTMLElement.prototype)) {
    document.querySelectorAll('[hidden="until-found"]').forEach((el) => {
      el.removeAttribute('hidden');
    });
    document.querySelectorAll('[data-studio-target]').forEach((btn) => {
      btn.setAttribute('aria-expanded', 'true');
    });
  }

  // ==================== STUDIO 1: IMAGE TO WEBP CONVERTER ====================
  const decodeImage = (file) =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => resolve({ image, url });
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('This image format is not supported by your browser.'));
      };
      image.src = url;
    });

  const convertFile = async (file) => {
    const { image, url } = await decodeImage(file);
    try {
      const limit = els.resizeToggle.checked
        ? Math.max(64, Number(els.maxWidth.value) || 1920)
        : image.naturalWidth;
      const scale = image.naturalWidth > limit ? limit / image.naturalWidth : 1;
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { alpha: true });
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, width, height);
      const blob = await new Promise((resolve, reject) =>
        canvas.toBlob(
          (result) =>
            result
              ? resolve(result)
              : reject(new Error('WebP conversion is not available in this browser.')),
          'image/webp',
          Number(els.quality.value) / 100
        )
      );
      return { blob, width, height, preview: URL.createObjectURL(blob) };
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const render = () => {
    const done = state.items.filter((item) => item.status === 'done');
    const hasItems = state.items.length > 0;
    els.empty.hidden = hasItems;
    els.summary.hidden = !hasItems;
    els.downloadAll.hidden = done.length < 2;
    if (els.clearImages) els.clearImages.hidden = !hasItems;
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
      thumb.className = 'thumb';
      thumb.alt = '';
      thumb.src = item.preview || item.sourcePreview;
      const info = document.createElement('div');
      info.className = 'file-info';
      const name = document.createElement('p');
      name.className = 'file-name';
      name.textContent = outputName(item.file.name);
      const meta = document.createElement('div');
      meta.className = 'file-meta';
      if (item.status === 'done') {
        const percent = item.file.size ? Math.round((1 - item.blob.size / item.file.size) * 100) : 0;
        meta.innerHTML = `<span>${formatBytes(item.file.size)}</span><span>→</span><span>${formatBytes(item.blob.size)}</span><span class="saving">${percent >= 0 ? `${percent}% smaller` : 'WebP ready'}</span>`;
      } else if (item.status === 'error') {
        meta.innerHTML = `<span class="file-error"></span>`;
        meta.firstElementChild.textContent = item.error;
      } else {
        meta.textContent = 'Converting…';
      }
      info.append(name, meta);
      const action = document.createElement('button');
      action.className = 'item-action';
      action.type = 'button';
      action.disabled = item.status !== 'done';
      action.title = 'Download WebP';
      action.setAttribute('aria-label', `Download ${outputName(item.file.name)}`);
      action.innerHTML =
        '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 4v11m0 0 4-4m-4 4-4-4M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      action.addEventListener('click', () => downloadItem(item));
      row.append(thumb, info, action);
      els.list.append(row);
    });
  };

  const downloadItem = (item, customName) => {
    if (!item.blob) return;
    const hrefUrl =
      item.preview && item.blob.type.startsWith('image/')
        ? item.preview
        : URL.createObjectURL(item.blob);
    const link = document.createElement('a');
    link.href = hrefUrl;
    link.download = customName || item.name || outputName(item.file?.name || 'image');
    document.body.append(link);
    link.click();
    link.remove();
    if (hrefUrl !== item.preview) {
      setTimeout(() => revokeUrlSafe(hrefUrl), 2000);
    }
  };

  const addFiles = async (fileList) => {
    const files = Array.from(fileList).filter(
      (file) => file.type.startsWith('image/') || /\.(svg|avif|bmp)$/i.test(file.name)
    );
    if (!files.length) {
      showToast('Please choose an image file.');
      return;
    }
    const newItems = files.map((file) => ({
      file,
      status: 'queued',
      sourcePreview: URL.createObjectURL(file)
    }));
    state.items.push(...newItems);
    render();
    const maybeYield = createYieldController();
    for (const item of newItems) {
      await maybeYield();
      item.status = 'processing';
      render();
      try {
        Object.assign(item, await convertFile(item.file), { status: 'done' });
      } catch (error) {
        item.status = 'error';
        item.error = error.message || 'Could not convert this image.';
      }
      render();
    }
    const completed = newItems.filter((item) => item.status === 'done').length;
    showToast(
      completed
        ? `${completed} image${completed === 1 ? '' : 's'} converted`
        : 'No images could be converted'
    );
  };

  let reconvertTimer = null;
  const scheduleReconvert = () => {
    if (!state.items.length) return;
    clearTimeout(reconvertTimer);
    reconvertTimer = setTimeout(async () => {
      const maybeYield = createYieldController();
      for (const item of state.items) {
        await maybeYield();
        try {
          const prevUrl = item.preview;
          const res = await convertFile(item.file);
          revokeUrlSafe(prevUrl);
          Object.assign(item, res, { status: 'done' });
        } catch (error) {
          item.status = 'error';
          item.error = error.message || 'Could not convert this image.';
        }
      }
      render();
    }, 180);
  };

  els.dropZone.addEventListener('click', () => els.fileInput.click());
  els.dropZone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      els.fileInput.click();
    }
  });
  els.fileInput.addEventListener('change', (event) => {
    addFiles(event.target.files);
    event.target.value = '';
  });
  ['dragenter', 'dragover'].forEach((name) =>
    els.dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      els.dropZone.classList.add('dragging');
    })
  );
  ['dragleave', 'drop'].forEach((name) =>
    els.dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      els.dropZone.classList.remove('dragging');
    })
  );
  els.dropZone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));
  els.quality.addEventListener('input', () => {
    els.qualityValue.textContent = `${els.quality.value}%`;
    scheduleReconvert();
  });
  els.resizeToggle.addEventListener('change', () => {
    els.resizeFields.hidden = !els.resizeToggle.checked;
    scheduleReconvert();
  });
  els.maxWidth.addEventListener('change', () => scheduleReconvert());
  if (els.clearImages) {
    els.clearImages.addEventListener('click', () => {
      state.items.forEach((item) => {
        revokeUrlSafe(item.preview);
        revokeUrlSafe(item.sourcePreview);
      });
      state.items = [];
      render();
      showToast('Cleared image list');
    });
  }
  els.downloadAll.addEventListener('click', async () => {
    const done = state.items.filter((item) => item.status === 'done');
    done.forEach((item, index) => setTimeout(() => downloadItem(item), index * 180));
    showToast(`Downloading ${done.length} images`);
  });

  // ==================== STUDIO 2: 16-IN-1 PDF OPERATING SYSTEM ====================
  let currentSplitMode = 'ranges';

  const filterToolCards = () => {
    const query = state.pdfSearch.trim().toLowerCase();
    const cat = state.pdfCategory;
    document.querySelectorAll('[data-pdf-tool]').forEach((card) => {
      const cardCat = card.dataset.toolCat;
      const text = card.textContent.toLowerCase();
      const matchesCat = cat === 'all' || cardCat === cat;
      const matchesSearch = !query || text.includes(query);
      card.hidden = !(matchesCat && matchesSearch);
    });
  };

  els.pdfToolSearch.addEventListener('input', () => {
    state.pdfSearch = els.pdfToolSearch.value;
    filterToolCards();
  });

  const selectPdfTool = (toolId, opts = {}) => {
    if (!PDF_TOOL_META[toolId]) return;
    const previousTool = state.pdfTool;
    state.pdfTool = toolId;
    const meta = PDF_TOOL_META[toolId];

    const getInputKind = (t) => (t === 'img-to-pdf' ? 'img' : t === 'text-to-pdf' ? 'text' : 'pdf');
    if (getInputKind(previousTool) !== getInputKind(toolId) && state.pdfQueue.length > 0) {
      clearPdfQueue(true);
    }

    document.querySelectorAll('[data-pdf-tool]').forEach((btn) => {
      const active = btn.dataset.pdfTool === toolId;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    document.querySelectorAll('[data-tool-config]').forEach((cfg) => {
      cfg.hidden = cfg.dataset.toolConfig !== toolId;
    });

    els.pdfStep1Title.textContent = meta.step1;
    els.pdfDropTitle.textContent = meta.dropTitle;
    els.pdfFormatNote.textContent = meta.formatNote;
    els.pdfFileInput.accept = meta.accept;
    els.pdfFileInput.multiple = meta.multiple;
    els.pdfStep2Title.textContent = meta.step2;
    els.pdfProcessBtnLabel.textContent = meta.btnLabel;
    els.pdfResultsHeading.textContent = meta.resultsHeading;
    els.pdfEmptyFrontBadge.textContent = meta.badge;
    els.pdfEmptyTitle.textContent = meta.emptyTitle;
    els.pdfEmptyCopy.textContent = meta.emptyCopy;
    els.pdfSampleBtn.textContent = meta.sampleBtnText;
    if (els.extractedTextPanel && toolId !== 'pdf-to-text') {
      els.extractedTextPanel.hidden = true;
    }

    renderPdfQueue();
    renderWorkbench();

    if (!opts.fromRouter) {
      saveCurrentRoute();
      updateRouteUI();
    }
  };

  // ==================== INTERACTIVE VISUAL PAGE WORKBENCH ====================
  const syncWorkbenchFromQueue = () => {
    state.workbenchPages = [];
    if (state.pdfQueue.length === 1 && state.pdfQueue[0].pageThumbs) {
      state.workbenchPages = state.pdfQueue[0].pageThumbs.map((pt) => ({
        originalPageNumber: pt.pageNumber,
        rotation: 0,
        previewUrl: pt.previewUrl,
        isBlank: false
      }));
    }
    renderWorkbench();
  };

  const renderWorkbench = () => {
    const showWb =
      state.pdfQueue.length === 1 &&
      state.workbenchPages.length > 0 &&
      state.pdfTool !== 'img-to-pdf' &&
      state.pdfTool !== 'text-to-pdf' &&
      state.pdfTool !== 'merge';

    els.pdfPageWorkbench.hidden = !showWb;
    if (!showWb) return;

    els.workbenchPageCount.textContent = String(state.workbenchPages.length);
    els.workbenchGrid.innerHTML = '';

    state.workbenchPages.forEach((wp, idx) => {
      const card = document.createElement('div');
      card.className = 'wb-page-card';

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'wb-thumb-wrap';
      if (wp.isBlank) {
        thumbWrap.innerHTML = '<span class="wb-page-num">BLANK</span>';
      } else {
        const img = document.createElement('img');
        img.className = 'wb-thumb';
        img.alt = `Page ${idx + 1}`;
        img.src = wp.previewUrl;
        img.style.transform = `rotate(${wp.rotation || 0}deg)`;
        thumbWrap.append(img);
      }

      const label = document.createElement('span');
      label.className = 'wb-page-num';
      label.textContent = `Pg ${idx + 1}${wp.rotation ? ` (${wp.rotation}°)` : ''}`;

      const controls = document.createElement('div');
      controls.className = 'wb-controls';

      const leftBtn = document.createElement('button');
      leftBtn.type = 'button';
      leftBtn.className = 'wb-btn';
      leftBtn.title = 'Move page earlier';
      leftBtn.disabled = idx === 0;
      leftBtn.textContent = '←';
      leftBtn.addEventListener('click', () => {
        [state.workbenchPages[idx - 1], state.workbenchPages[idx]] = [
          state.workbenchPages[idx],
          state.workbenchPages[idx - 1]
        ];
        renderWorkbench();
      });

      const rotBtn = document.createElement('button');
      rotBtn.type = 'button';
      rotBtn.className = 'wb-btn';
      rotBtn.title = 'Rotate page +90°';
      rotBtn.textContent = '↻';
      rotBtn.addEventListener('click', () => {
        wp.rotation = ((wp.rotation || 0) + 90) % 360;
        renderWorkbench();
      });

      const dupBtn = document.createElement('button');
      dupBtn.type = 'button';
      dupBtn.className = 'wb-btn';
      dupBtn.title = 'Duplicate page';
      dupBtn.textContent = '⧉';
      dupBtn.addEventListener('click', () => {
        state.workbenchPages.splice(idx + 1, 0, { ...wp });
        renderWorkbench();
      });

      const rightBtn = document.createElement('button');
      rightBtn.type = 'button';
      rightBtn.className = 'wb-btn';
      rightBtn.title = 'Move page later';
      rightBtn.disabled = idx === state.workbenchPages.length - 1;
      rightBtn.textContent = '→';
      rightBtn.addEventListener('click', () => {
        [state.workbenchPages[idx + 1], state.workbenchPages[idx]] = [
          state.workbenchPages[idx],
          state.workbenchPages[idx + 1]
        ];
        renderWorkbench();
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'wb-btn danger';
      delBtn.title = 'Delete page';
      delBtn.disabled = state.workbenchPages.length <= 1;
      delBtn.textContent = '×';
      delBtn.addEventListener('click', () => {
        if (state.workbenchPages.length > 1) {
          state.workbenchPages.splice(idx, 1);
          renderWorkbench();
        }
      });

      controls.append(leftBtn, rotBtn, dupBtn, rightBtn, delBtn);
      card.append(thumbWrap, label, controls);
      els.workbenchGrid.append(card);
    });
  };

  els.workbenchAddBlank.addEventListener('click', () => {
    state.workbenchPages.push({
      originalPageNumber: 1,
      rotation: 0,
      previewUrl: '',
      isBlank: true
    });
    renderWorkbench();
    showToast('Added blank page to workbench');
  });

  els.workbenchReset.addEventListener('click', () => {
    syncWorkbenchFromQueue();
    showToast('Reset page workbench');
  });

  // ==================== SIGNATURE PAD CANVAS ====================
  const initSignaturePad = () => {
    const canvas = els.sigCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let drawing = false;
    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: ((clientX - rect.left) / rect.width) * canvas.width,
        y: ((clientY - rect.top) / rect.height) * canvas.height
      };
    };

    const start = (e) => {
      drawing = true;
      state.sigHasDrawing = true;
      const p = getPos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    };
    const move = (e) => {
      if (!drawing) return;
      e.preventDefault();
      const p = getPos(e);
      ctx.strokeStyle = els.sigInkColor.value || '#111512';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    };
    const stop = () => {
      drawing = false;
    };

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', stop);

    els.sigClearBtn.addEventListener('click', () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      state.sigHasDrawing = false;
    });
  };
  initSignaturePad();

  // ==================== PDF QUEUE & RESULTS ====================
  const clearPdfQueue = (silent = false) => {
    state.pdfQueue.forEach((entry) => {
      revokeUrlSafe(entry.previewUrl);
      if (entry.pageThumbs) {
        entry.pageThumbs.forEach((pt) => revokeUrlSafe(pt.previewUrl));
      }
    });
    state.pdfQueue = [];
    state.workbenchPages = [];
    renderPdfQueue();
    renderWorkbench();
    if (!silent) showToast('Cleared source queue');
  };

  const clearPdfResults = (silent = false) => {
    state.pdfResults.forEach((res) => revokeUrlSafe(res.preview));
    state.pdfResults = [];
    if (els.extractedTextPanel) els.extractedTextPanel.hidden = true;
    renderPdfResults();
    if (!silent) showToast('Cleared PDF output');
  };

  const renderPdfQueue = () => {
    const count = state.pdfQueue.length;
    els.pdfQueueWrap.hidden = count === 0;
    const totalPages = state.pdfQueue.reduce((s, item) => s + (item.pageCount || 1), 0);
    els.pdfQueueCount.textContent = `${count} file${count === 1 ? '' : 's'} (${totalPages} page${totalPages === 1 ? '' : 's'})`;
    els.pdfSourceList.innerHTML = '';

    if (state.pdfTool === 'split' && state.pdfQueue[0]) {
      const pCount = state.workbenchPages.length || state.pdfQueue[0].pageCount || 1;
      els.splitTotalPagesHint.textContent = `of ${pCount} page${pCount === 1 ? '' : 's'}`;
    }

    state.pdfQueue.forEach((entry, idx) => {
      const row = document.createElement('div');
      row.className = 'source-item';

      const thumb = document.createElement('img');
      thumb.className = 'source-thumb';
      thumb.alt = '';
      if (entry.previewUrl) thumb.src = entry.previewUrl;

      const meta = document.createElement('div');
      meta.className = 'source-meta';
      const name = document.createElement('p');
      name.className = 'source-name';
      name.textContent = entry.file.name;

      const sub = document.createElement('div');
      sub.className = 'source-sub';
      sub.innerHTML = `<span>${formatBytes(entry.file.size)}</span><span>·</span><span class="source-badge">${entry.pageCount || 1} pg${(entry.pageCount || 1) === 1 ? '' : 's'}</span>`;
      meta.append(name, sub);

      const controls = document.createElement('div');
      controls.className = 'source-controls';

      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'mini-icon-btn';
      upBtn.title = 'Move up';
      upBtn.disabled = idx === 0;
      upBtn.textContent = '↑';
      upBtn.addEventListener('click', () => {
        if (idx > 0) {
          [state.pdfQueue[idx - 1], state.pdfQueue[idx]] = [state.pdfQueue[idx], state.pdfQueue[idx - 1]];
          renderPdfQueue();
        }
      });

      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'mini-icon-btn';
      downBtn.title = 'Move down';
      downBtn.disabled = idx === state.pdfQueue.length - 1;
      downBtn.textContent = '↓';
      downBtn.addEventListener('click', () => {
        if (idx < state.pdfQueue.length - 1) {
          [state.pdfQueue[idx + 1], state.pdfQueue[idx]] = [state.pdfQueue[idx], state.pdfQueue[idx + 1]];
          renderPdfQueue();
        }
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'mini-icon-btn remove';
      removeBtn.title = 'Remove file';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => {
        revokeUrlSafe(entry.previewUrl);
        if (entry.pageThumbs) entry.pageThumbs.forEach((pt) => revokeUrlSafe(pt.previewUrl));
        state.pdfQueue.splice(idx, 1);
        syncWorkbenchFromQueue();
        renderPdfQueue();
      });

      controls.append(upBtn, downBtn, removeBtn);
      row.append(thumb, meta, controls);
      els.pdfSourceList.append(row);
    });
  };

  const renderPdfResults = () => {
    const items = state.pdfResults;
    const hasResults = items.length > 0;
    els.pdfEmptyState.hidden = hasResults;
    els.pdfSummary.hidden = !hasResults;
    els.pdfClearResults.hidden = !hasResults;
    els.pdfDownloadAll.hidden = items.length < 2;

    const firstIsPdf = hasResults && items[0].blob?.type === 'application/pdf';
    if (els.pdfChainBtn) els.pdfChainBtn.hidden = !firstIsPdf;

    els.pdfResultList.innerHTML = '';
    if (!hasResults) return;

    const totalOutSize = items.reduce((sum, item) => sum + (item.blob?.size || 0), 0);
    const totalInSize = items.reduce((sum, item) => sum + (item.originalSize || 0), 0);
    els.pdfSummaryCount.textContent = `${items.length} output file${items.length === 1 ? '' : 's'} (${formatBytes(totalOutSize)})`;

    if (state.pdfTool === 'compress' && totalInSize > 0) {
      const saved = Math.max(0, totalInSize - totalOutSize);
      const pct = Math.max(8, Math.min(100, Math.round((saved / totalInSize) * 100)));
      els.pdfSummarySaved.textContent = saved > 0 ? `${formatBytes(saved)} saved` : 'Optimized PDF ready';
      els.pdfSummaryBar.style.width = `${pct}%`;
    } else {
      const totalPages = items.reduce((sum, item) => sum + (item.pageCount || 1), 0);
      els.pdfSummarySaved.textContent = `${totalPages} total page${totalPages === 1 ? '' : 's'} ready`;
      els.pdfSummaryBar.style.width = '100%';
    }

    items.forEach((item) => {
      const row = document.createElement('article');
      row.className = 'result-item';

      const thumb = document.createElement('img');
      thumb.className = 'thumb';
      thumb.alt = '';
      if (item.preview) thumb.src = item.preview;

      const info = document.createElement('div');
      info.className = 'file-info';
      const name = document.createElement('p');
      name.className = 'file-name';
      name.textContent = item.name;

      const meta = document.createElement('div');
      meta.className = 'file-meta';
      meta.innerHTML = `<span>${formatBytes(item.originalSize || item.blob.size)}</span><span>→</span><span>${formatBytes(item.blob.size)}</span><span class="saving">${item.badge || 'Ready'}</span>`;
      info.append(name, meta);

      const action = document.createElement('button');
      action.className = 'item-action';
      action.type = 'button';
      action.title = `Download ${item.name}`;
      action.setAttribute('aria-label', `Download ${item.name}`);
      action.innerHTML =
        '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 4v11m0 0 4-4m-4 4-4-4M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      action.addEventListener('click', () => downloadItem(item, item.name));

      row.append(thumb, info, action);
      els.pdfResultList.append(row);
    });

    if (items[0]?.extractedText && els.extractedTextPanel) {
      els.extractedTextOutput.textContent = items[0].extractedText;
      els.extractedTextPanel.hidden = false;
    } else if (els.extractedTextPanel) {
      els.extractedTextPanel.hidden = true;
    }
  };

  if (els.pdfChainBtn) {
    els.pdfChainBtn.addEventListener('click', async () => {
      const firstPdf = state.pdfResults.find((r) => r.blob?.type === 'application/pdf');
      if (!firstPdf) return;
      const chainedFile = new File([firstPdf.blob], firstPdf.name, { type: 'application/pdf' });
      const nextTool =
        state.pdfTool === 'img-to-pdf' || state.pdfTool === 'text-to-pdf' || state.pdfTool === 'merge'
          ? 'watermark'
          : state.pdfTool;
      navigateTo({ studio: 'pdf', pdfTool: nextTool, pdfCategory: state.pdfCategory }, { animate: true });
      clearPdfQueue(true);
      await addPdfStudioFiles([chainedFile]);
      showToast(`Chained "${firstPdf.name}" as input for ${PDF_TOOL_META[state.pdfTool].btnLabel}`);
    });
  }

  if (els.copyExtractedBtn) {
    els.copyExtractedBtn.addEventListener('click', async () => {
      const txt = els.extractedTextOutput.textContent || '';
      if (!txt) return;
      try {
        await navigator.clipboard.writeText(txt);
        showToast('Copied extracted text to clipboard');
      } catch {
        showToast('Text ready in preview box');
      }
    });
  }

  const addPdfStudioFiles = async (fileList) => {
    const rawFiles = Array.from(fileList || []);
    if (!rawFiles.length) return;

    if (state.pdfTool === 'text-to-pdf') {
      const f = rawFiles[0];
      const text = await f.text();
      els.textPdfEditor.value = text;
      await runPdfTool();
      return;
    }

    const isImgMode = state.pdfTool === 'img-to-pdf';
    const validFiles = rawFiles.filter((file) =>
      isImgMode
        ? file.type.startsWith('image/') || /\.(svg|avif|bmp|png|jpe?g|webp|gif)$/i.test(file.name)
        : file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    );

    if (!validFiles.length) {
      showToast(isImgMode ? 'Please choose image files.' : 'Please choose a valid .pdf file.');
      return;
    }

    if (!PDF_TOOL_META[state.pdfTool].multiple) {
      clearPdfQueue(true);
    }

    for (const file of validFiles) {
      if (isImgMode) {
        state.pdfQueue.push({
          file,
          pageCount: 1,
          previewUrl: URL.createObjectURL(file)
        });
      } else {
        try {
          const info = await window.WebpressoPdfEngine.inspectPdf(file);
          state.pdfQueue.push({
            file,
            pageCount: info.pageCount,
            pageThumbs: info.pageThumbs,
            previewUrl: info.previewUrl
          });
        } catch (err) {
          showToast(err.message || `Could not read ${file.name}`);
        }
      }
    }

    syncWorkbenchFromQueue();
    renderPdfQueue();
    if (state.pdfQueue.length > 0) {
      await runPdfTool();
    }
  };

  const runPdfTool = async () => {
    if (state.pdfProcessing) return;
    if (state.pdfTool !== 'text-to-pdf' && state.pdfQueue.length === 0) {
      showToast('Please add files first or click the "+ Load sample" button.');
      return;
    }

    state.pdfProcessing = true;
    els.pdfProcessBtn.disabled = true;
    const originalLabel = els.pdfProcessBtnLabel.textContent;
    els.pdfProcessBtnLabel.textContent = 'Processing…';

    try {
      const files = state.pdfQueue.map((entry) => entry.file);
      const wb = state.workbenchPages.length > 0 ? state.workbenchPages : undefined;
      const eng = window.WebpressoPdfEngine;
      let outputs = [];

      switch (state.pdfTool) {
        case 'merge':
          outputs = await eng.mergePdfs(files, {
            outputName: els.mergeFilename.value.trim() || 'merged-document.pdf'
          });
          break;
        case 'split':
          outputs = await eng.splitPdf(files[0], {
            splitMode: currentSplitMode,
            rangeInput: els.splitRanges.value,
            mergeRanges: els.splitMergeToggle.checked,
            workbenchPages: wb
          });
          break;
        case 'organize':
          outputs = await eng.organizePdf(files[0], {
            filterMode: els.organizeFilter.value,
            workbenchPages: wb
          });
          break;
        case 'rotate':
          outputs = await eng.rotatePdf(files[0], {
            angle: Number(els.rotateAngle.value) || 90,
            target: els.rotateTarget.value,
            workbenchPages: wb
          });
          break;
        case 'compress': {
          const selectedLevel =
            document.querySelector('input[name="compress-level"]:checked')?.value || 'recommended';
          for (const f of files) {
            const res = await eng.compressPdf(f, {
              level: selectedLevel,
              workbenchPages: files.length === 1 ? wb : undefined
            });
            outputs.push(...res);
          }
          break;
        }
        case 'repair':
          outputs = await eng.repairPdf(files[0]);
          break;
        case 'grayscale':
          outputs = await eng.grayscalePdf(files[0], {
            mode: els.grayscaleMode.value,
            workbenchPages: wb
          });
          break;
        case 'img-to-pdf':
          outputs = await eng.imagesToPdf(files, {
            pageSize: els.imgPdfPageSize.value,
            orientation: els.imgPdfOrientation.value,
            margin: els.imgPdfMargin.value,
            quality: Number(els.imgPdfQuality.value)
          });
          break;
        case 'text-to-pdf':
          outputs = await eng.textToPdf(els.textPdfEditor.value, {
            fontFamily: els.textPdfFont.value,
            theme: els.textPdfTheme.value,
            title: 'webpresso-typeset.pdf'
          });
          break;
        case 'pdf-to-img':
          outputs = await eng.pdfToImages(files[0], {
            format: els.pdfImgFormat.value,
            scale: Number(els.pdfImgScale.value),
            quality: Number(els.pdfImgQuality.value),
            workbenchPages: wb
          });
          break;
        case 'pdf-to-text':
          outputs = await eng.pdfToText(files[0], {
            format: els.pdfTextFormat.value
          });
          break;
        case 'page-numbers':
          outputs = await eng.addPageNumbers(files[0], {
            position: els.pagenumPos.value,
            format: els.pagenumFormat.value,
            startNumber: Number(els.pagenumStart.value) || 1,
            fontSize: Number(els.pagenumSize.value) || 12,
            workbenchPages: wb
          });
          break;
        case 'watermark':
          outputs = await eng.watermarkPdf(files[0], {
            text: els.watermarkText.value,
            style: els.watermarkStyle.value,
            color: els.watermarkColor.value,
            opacity: Number(els.watermarkOpacity.value) || 32,
            workbenchPages: wb
          });
          break;
        case 'sign': {
          let sigBlob = null;
          if (state.sigHasDrawing && els.sigCanvas) {
            sigBlob = await new Promise((resolve) => els.sigCanvas.toBlob(resolve, 'image/png'));
          }
          outputs = await eng.signPdf(files[0], {
            signatureBlob: sigBlob,
            signerName: els.sigSignerName.value.trim() || 'Authorized Signatory',
            typedName: els.sigSignerName.value.trim() || 'Authorized Signatory',
            position: els.sigPosition.value,
            targetPage: els.sigTargetPage.value,
            inkColor: els.sigInkColor.value,
            workbenchPages: wb
          });
          break;
        }
        case 'crop':
          outputs = await eng.cropPdf(files[0], {
            marginPt: Number(els.cropMargin.value) || 32,
            drawBorder: els.cropBorderToggle.checked,
            workbenchPages: wb
          });
          break;
        case 'protect':
          outputs = await eng.protectPdf(files[0], {
            title: els.protectTitle.value.trim() || 'Confidential Record',
            author: els.protectAuthor.value.trim() || 'Webpresso Security',
            password: els.protectPin.value,
            classification: els.protectBanner.value,
            workbenchPages: wb
          });
          break;
      }

      clearPdfResults(true);
      state.pdfResults = outputs;
      renderPdfResults();
      showToast(`${outputs.length} output file${outputs.length === 1 ? '' : 's'} ready`);
    } catch (error) {
      showToast(error.message || 'Could not process PDF.');
    } finally {
      state.pdfProcessing = false;
      els.pdfProcessBtn.disabled = false;
      els.pdfProcessBtnLabel.textContent = originalLabel;
    }
  };

  const createSampleCanvasBlob = async (title, subtitle, accentColor, pageIndex, totalPages) => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d', { alpha: false });

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#111512';
    ctx.fillRect(48, 48, canvas.width - 96, 130);

    ctx.fillStyle = accentColor;
    ctx.font = '800 22px Inter, sans-serif';
    ctx.fillText('WEBPRESSO · SAMPLE DOCUMENT', 84, 102);

    ctx.fillStyle = '#f5f7f3';
    ctx.font = '700 32px Inter, sans-serif';
    ctx.fillText(title, 84, 146);

    ctx.fillStyle = '#f4f6f4';
    ctx.fillRect(48, 220, canvas.width - 96, 360);

    ctx.fillStyle = '#181d19';
    ctx.font = '800 44px Inter, sans-serif';
    ctx.fillText(`Page ${pageIndex} of ${totalPages}`, 84, 305);

    ctx.fillStyle = '#4f5850';
    ctx.font = '500 24px Inter, sans-serif';
    ctx.fillText(subtitle, 84, 355);

    const colors = ['#c7ff4a', '#181d19', '#ff7a66', '#5cd6ff'];
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = colors[i % colors.length];
      const barH = 70 + ((i + pageIndex) % 3) * 45;
      ctx.fillRect(84 + i * 170, 520 - barH, 120, barH);
    }

    ctx.fillStyle = '#d8ded9';
    for (let row = 0; row < 8; row++) {
      const w = row % 3 === 2 ? 480 : 720;
      ctx.fillRect(48, 640 + row * 48, w, 18);
    }

    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  };

  els.pdfSampleBtn.addEventListener('click', async () => {
    els.pdfSampleBtn.disabled = true;
    try {
      if (state.pdfTool === 'text-to-pdf') {
        els.textPdfEditor.value = `# Webpresso Product Specification\n\nGenerated 100% locally in your browser without server uploads.\n\n## Core Architecture\n- Instant WebP image compression\n- 16-in-1 PDF Operating System\n- Interactive Visual Page Workbench\n- Multi-Tool Pipeline Chaining`;
        await runPdfTool();
      } else if (state.pdfTool === 'img-to-pdf') {
        const b1 = await createSampleCanvasBlob('Product Launch Cover', 'Visual Asset 01', '#c7ff4a', 1, 2);
        const b2 = await createSampleCanvasBlob('Architecture Diagram', 'Visual Asset 02', '#5cd6ff', 2, 2);
        const f1 = new File([b1], 'sample-slide-1.jpg', { type: 'image/jpeg' });
        const f2 = new File([b2], 'sample-slide-2.jpg', { type: 'image/jpeg' });
        await addPdfStudioFiles([f1, f2]);
      } else if (state.pdfTool === 'merge') {
        const p1 = await createSampleCanvasBlob('Q3 Financial Summary', 'First PDF Document', '#c7ff4a', 1, 1);
        const p2 = await createSampleCanvasBlob('Q4 Executive Forecast', 'Second PDF Document', '#ff7a66', 1, 1);
        const pdf1 = await window.WebpressoPdfEngine.imagesToPdf([new File([p1], 'q3.jpg', { type: 'image/jpeg' })], { quality: 92 });
        const pdf2 = await window.WebpressoPdfEngine.imagesToPdf([new File([p2], 'q4.jpg', { type: 'image/jpeg' })], { quality: 92 });
        const file1 = new File([pdf1[0].blob], 'q3-summary.pdf', { type: 'application/pdf' });
        const file2 = new File([pdf2[0].blob], 'q4-forecast.pdf', { type: 'application/pdf' });
        await addPdfStudioFiles([file1, file2]);
      } else {
        const s1 = await createSampleCanvasBlob('Annual Report — Overview', 'Executive Summary & Highlights', '#c7ff4a', 1, 3);
        const s2 = await createSampleCanvasBlob('Annual Report — Metrics', 'Performance & Compression Benchmarks', '#5cd6ff', 2, 3);
        const s3 = await createSampleCanvasBlob('Annual Report — Appendix', 'Closing Notes & Disclosures', '#ffbe55', 3, 3);
        const built = await window.WebpressoPdfEngine.imagesToPdf(
          [
            new File([s1], 'p1.jpg', { type: 'image/jpeg' }),
            new File([s2], 'p2.jpg', { type: 'image/jpeg' }),
            new File([s3], 'p3.jpg', { type: 'image/jpeg' })
          ],
          { quality: 92 }
        );
        const samplePdfFile = new File([built[0].blob], 'webpresso-sample-3pages.pdf', {
          type: 'application/pdf'
        });
        await addPdfStudioFiles([samplePdfFile]);
      }
    } finally {
      els.pdfSampleBtn.disabled = false;
    }
  });

  // ==================== LINK CLICK INTERCEPTION & BACK NAVIGATION ====================
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="/"], a[href^="#/"]');
    if (!link) return;
    if (link.hasAttribute('download')) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const targetHref = link.getAttribute('href');
    const parsed = parseHashString(targetHref);
    if (parsed) {
      event.preventDefault();
      navigateTo(parsed, { animate: true, focusHeading: true });
    }
  });

  // Browser Back / Forward / Hashchange handlers
  window.addEventListener('popstate', (event) => {
    const fromState =
      event.state && (event.state.studio === 'image' || event.state.studio === 'pdf')
        ? event.state
        : parseCurrentLocation();

    if (fromState) {
      if (
        state.navStack.length > 1 &&
        state.navStack[state.navStack.length - 2].studio === fromState.studio &&
        state.navStack[state.navStack.length - 2].pdfTool === fromState.pdfTool
      ) {
        state.navStack.pop();
      }
      navigateTo(fromState, { fromPopState: true, skipStackPush: true, animate: true });
    }
  });

  window.addEventListener('hashchange', () => {
    const parsed = parseHashString(window.location.hash);
    if (!parsed) return;
    if (parsed.studio !== state.activeStudio || (parsed.studio === 'pdf' && parsed.pdfTool !== state.pdfTool)) {
      navigateTo(parsed, { replaceHistory: true, animate: true });
    }
  });

  // In-App Back Button (#nav-back-btn)
  if (els.navBackBtn) {
    els.navBackBtn.addEventListener('click', () => {
      if (state.navStack.length <= 1) return;
      state.navStack.pop(); // remove current
      const previous = state.navStack[state.navStack.length - 1];
      if (previous) {
        navigateTo(previous, { skipStackPush: true, animate: true, focusHeading: true });
      }
    });
  }

  // Copy Direct Section Link button (#copy-route-link)
  if (els.copyRouteLink) {
    els.copyRouteLink.addEventListener('click', async () => {
      const canonicalPath = buildCanonicalHash(state.activeStudio, state.pdfTool);
      const fullUrl = `${window.location.origin}${canonicalPath}`;
      try {
        await navigator.clipboard.writeText(fullUrl);
        showToast(`Copied link: ${fullUrl}`);
      } catch {
        showToast(`Direct link: ${fullUrl}`);
      }
    });
  }

  // PDF Dropzone & Input Event Listeners
  els.pdfDropZone.addEventListener('click', () => els.pdfFileInput.click());
  els.pdfDropZone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      els.pdfFileInput.click();
    }
  });
  els.pdfFileInput.addEventListener('change', (event) => {
    addPdfStudioFiles(event.target.files);
    event.target.value = '';
  });
  ['dragenter', 'dragover'].forEach((name) =>
    els.pdfDropZone.addEventListener(name, (event) => {
      event.preventDefault();
      els.pdfDropZone.classList.add('dragging');
    })
  );
  ['dragleave', 'drop'].forEach((name) =>
    els.pdfDropZone.addEventListener(name, (event) => {
      event.preventDefault();
      els.pdfDropZone.classList.remove('dragging');
    })
  );
  els.pdfDropZone.addEventListener('drop', (event) => addPdfStudioFiles(event.dataTransfer.files));

  els.pdfClearQueue.addEventListener('click', () => clearPdfQueue(false));
  els.pdfClearResults.addEventListener('click', () => clearPdfResults(false));
  els.pdfProcessBtn.addEventListener('click', () => runPdfTool());

  document.querySelectorAll('[data-split-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentSplitMode = btn.dataset.splitMode;
      document.querySelectorAll('[data-split-mode]').forEach((b) => {
        const active = b.dataset.splitMode === currentSplitMode;
        b.classList.toggle('active', active);
        b.setAttribute('aria-checked', active ? 'true' : 'false');
      });
      els.splitRangeFields.hidden = currentSplitMode === 'all';
    });
  });

  els.imgPdfQuality.addEventListener('input', () => {
    els.imgPdfQualityVal.textContent = `${els.imgPdfQuality.value}%`;
  });
  els.pdfImgQuality.addEventListener('input', () => {
    els.pdfImgQualityVal.textContent = `${els.pdfImgQuality.value}%`;
  });
  els.watermarkOpacity.addEventListener('input', () => {
    els.watermarkOpacityVal.textContent = `${els.watermarkOpacity.value}%`;
  });
  els.cropMargin.addEventListener('input', () => {
    els.cropMarginVal.textContent = `${els.cropMargin.value} pt`;
  });

  els.pdfDownloadAll.addEventListener('click', () => {
    state.pdfResults.forEach((item, index) =>
      setTimeout(() => downloadItem(item, item.name), index * 180)
    );
    showToast(`Downloading ${state.pdfResults.length} files`);
  });

  // ==================== INITIALIZE ROUTER ON PAGE LOAD / REFRESH ====================
  const initRouter = () => {
    state.navStack = loadSavedStack();
    const urlRoute = parseCurrentLocation();
    const savedRoute = loadSavedRoute();
    const initialRoute = urlRoute || savedRoute || {
      studio: 'image',
      pdfTool: 'merge',
      pdfCategory: 'all'
    };

    // Ensure tool UI is initialized even if starting in Image Studio
    selectPdfTool(initialRoute.pdfTool || 'merge', { fromRouter: true });
    navigateTo(initialRoute, { replaceHistory: true, animate: false });
  };
  initRouter();

  // ==================== WEBMCP IMPERATIVE TOOLS (agentic-javascript-tools) ====================
  if ('modelContext' in document && document.modelContext?.registerTool) {
    const lifecycle = new AbortController();

    Promise.resolve(
      document.modelContext.registerTool(
        {
          name: 'configure_webp_output',
          title: 'Configure WebP output',
          description: 'Set the WebP quality and optional maximum image width shown in the converter.',
          inputSchema: {
            type: 'object',
            properties: {
              quality: { type: 'integer', minimum: 10, maximum: 100 },
              maxWidth: { type: ['integer', 'null'], minimum: 64, maximum: 12000 }
            },
            required: ['quality'],
            additionalProperties: false
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute(input) {
            if (!input || !Number.isInteger(input.quality) || input.quality < 10 || input.quality > 100) {
              return { error: 'Quality must be a whole number from 10 to 100.' };
            }
            if (
              input.maxWidth !== undefined &&
              input.maxWidth !== null &&
              (!Number.isInteger(input.maxWidth) || input.maxWidth < 64 || input.maxWidth > 12000)
            ) {
              return { error: 'Maximum width must be a whole number from 64 to 12000.' };
            }
            switchStudio('image');
            els.quality.value = input.quality;
            els.qualityValue.textContent = `${input.quality}%`;
            els.resizeToggle.checked = input.maxWidth != null;
            els.resizeFields.hidden = input.maxWidth == null;
            if (input.maxWidth != null) els.maxWidth.value = input.maxWidth;
            scheduleReconvert();
            return {
              studio: 'image',
              route: '/image-studio',
              quality: input.quality,
              resizeEnabled: input.maxWidth != null,
              maxWidth: input.maxWidth ?? null
            };
          }
        },
        { signal: lifecycle.signal }
      )
    ).catch(() => {});

    Promise.resolve(
      document.modelContext.registerTool(
        {
          name: 'configure_pdf_studio',
          title: 'Configure PDF Studio tool',
          description:
            'Switch to the PDF Studio and select any of the 16 PDF tools (merge, split, organize, rotate, compress, repair, grayscale, img-to-pdf, text-to-pdf, pdf-to-img, pdf-to-text, page-numbers, watermark, sign, crop, protect).',
          inputSchema: {
            type: 'object',
            properties: {
              tool: {
                type: 'string',
                enum: Object.keys(PDF_TOOL_META)
              },
              compressLevel: {
                type: 'string',
                enum: ['extreme', 'recommended', 'less']
              },
              splitRanges: { type: 'string' },
              watermarkText: { type: 'string' },
              imageFormat: { type: 'string', enum: ['webp', 'png', 'jpeg'] }
            },
            required: ['tool'],
            additionalProperties: false
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute(input) {
            const validTools = Object.keys(PDF_TOOL_META);
            if (!input || !validTools.includes(input.tool)) {
              return {
                error: `Invalid PDF tool "${input?.tool}".`,
                availableTools: validTools
              };
            }
            navigateTo(
              { studio: 'pdf', pdfTool: input.tool, pdfCategory: state.pdfCategory },
              { animate: true }
            );
            if (input.compressLevel) {
              const radio = document.querySelector(
                `input[name="compress-level"][value="${input.compressLevel}"]`
              );
              if (radio) radio.checked = true;
            }
            if (typeof input.splitRanges === 'string' && input.splitRanges.trim()) {
              els.splitRanges.value = input.splitRanges.trim();
            }
            if (typeof input.watermarkText === 'string' && input.watermarkText.trim()) {
              els.watermarkText.value = input.watermarkText.trim();
            }
            if (input.imageFormat && ['webp', 'png', 'jpeg'].includes(input.imageFormat)) {
              els.pdfImgFormat.value = input.imageFormat;
            }
            return {
              studio: 'pdf',
              activeTool: state.pdfTool,
              route: `/pdf/${state.pdfTool}`
            };
          }
        },
        { signal: lifecycle.signal }
      )
    ).catch(() => {});
  }
})();
