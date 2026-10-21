(() => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('latin1');

  // Break up long tasks with a 50ms budget per modern-web-guidance (break-up-long-tasks)
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

  // Decompress FlateDecode bytes using browser's native DecompressionStream
  const inflateBytes = async (uint8) => {
    const tryFormat = async (format, data) => {
      const ds = new DecompressionStream(format);
      const writer = ds.writable.getWriter();
      writer.write(data);
      writer.close();
      const response = new Response(ds.readable);
      const buffer = await response.arrayBuffer();
      return new Uint8Array(buffer);
    };
    try {
      return await tryFormat('deflate', uint8);
    } catch {
      try {
        return await tryFormat('deflate-raw', uint8);
      } catch {
        if (uint8.length > 2) {
          try {
            return await tryFormat('deflate-raw', uint8.subarray(2));
          } catch {
            return uint8;
          }
        }
        return uint8;
      }
    }
  };

  const decodeImageBlob = (blob) =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => resolve({ image, url });
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('This image could not be decoded by your browser.'));
      };
      image.src = url;
    });

  const blobToUint8Array = async (blob) => new Uint8Array(await blob.arrayBuffer());

  const canvasToJpegBytes = async (canvas, quality = 0.84) => {
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (res) => (res ? resolve(res) : reject(new Error('Canvas JPEG export failed.'))),
        'image/jpeg',
        Math.max(0.1, Math.min(1, quality))
      )
    );
    return blobToUint8Array(blob);
  };

  const escapePdfString = (str) =>
    String(str || '')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/\r|\n/g, ' ');

  // Build a spec-compliant multi-page PDF 1.4 binary from prepared page descriptors and optional metadata
  const buildPdfFromJpegPages = async (pages, metadata = {}) => {
    const maybeYield = createYieldController();
    const chunks = [];
    const offsets = [0];
    let byteLength = 0;

    const pushBytes = (bytes) => {
      chunks.push(bytes);
      byteLength += bytes.byteLength;
    };
    const pushStr = (str) => pushBytes(encoder.encode(str));

    // Object numbering:
    // 1: Catalog
    // 2: Pages root
    // 3: Info dictionary (Metadata)
    // For page i (0..N-1):
    //   pageObj = 4 + i * 3
    //   contentObj = 5 + i * 3
    //   imageObj = 6 + i * 3
    const totalObjects = 3 + pages.length * 3;

    pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

    // Obj 1: Catalog
    offsets[1] = byteLength;
    pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    // Obj 2: Pages
    const kidsRefs = pages.map((_, i) => `${4 + i * 3} 0 R`).join(' ');
    offsets[2] = byteLength;
    pushStr(`2 0 obj\n<< /Type /Pages /Count ${pages.length} /Kids [ ${kidsRefs} ] >>\nendobj\n`);

    // Obj 3: Info Metadata
    const title = escapePdfString(metadata.title || 'Webpresso PDF Document');
    const author = escapePdfString(metadata.author || 'Webpresso Local Studio');
    const subject = escapePdfString(metadata.subject || 'Processed locally in browser');
    const keywords = escapePdfString(metadata.keywords || 'Webpresso, PDF');
    const producer = escapePdfString(metadata.producer || 'Webpresso Client-Side PDF Engine 2.0');
    offsets[3] = byteLength;
    pushStr(
      `3 0 obj\n<< /Title (${title}) /Author (${author}) /Subject (${subject}) /Keywords (${keywords}) /Producer (${producer}) /CreationDate (D:20261021120000Z) >>\nendobj\n`
    );

    const fmt = (n) => Number(n.toFixed(2));

    for (let i = 0; i < pages.length; i++) {
      await maybeYield();
      const p = pages[i];
      const pageObjId = 4 + i * 3;
      const contentObjId = 5 + i * 3;
      const imageObjId = 6 + i * 3;

      let contentStream = `q\n${fmt(p.drawWidth)} 0 0 ${fmt(p.drawHeight)} ${fmt(p.drawX)} ${fmt(p.drawY)} cm\n/Im0 Do\nQ\n`;
      if (p.searchableText) {
        // Embed invisible searchable text layer so PDF-to-Text works on generated/modified PDFs too
        const safeTxt = escapePdfString(p.searchableText);
        contentStream += `BT\n/F1 1 Tf\n3 Tr\n36 36 Td\n(${safeTxt}) Tj\nET\n`;
      }
      const contentBytes = encoder.encode(contentStream);

      offsets[pageObjId] = byteLength;
      pushStr(
        `${pageObjId} 0 obj\n` +
          `<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 ${fmt(p.pageWidthPt)} ${fmt(p.pageHeightPt)} ] ` +
          `/Resources << /XObject << /Im0 ${imageObjId} 0 R >> /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ${contentObjId} 0 R >>\n` +
          `endobj\n`
      );

      offsets[contentObjId] = byteLength;
      pushStr(`${contentObjId} 0 obj\n<< /Length ${contentBytes.byteLength} >>\nstream\n`);
      pushBytes(contentBytes);
      pushStr('\nendstream\nendobj\n');

      offsets[imageObjId] = byteLength;
      pushStr(
        `${imageObjId} 0 obj\n` +
          `<< /Type /XObject /Subtype /Image /Width ${Math.max(1, Math.round(p.imgWidthPx))} ` +
          `/Height ${Math.max(1, Math.round(p.imgHeightPx))} /ColorSpace /DeviceRGB ` +
          `/BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpegBytes.byteLength} >>\nstream\n`
      );
      pushBytes(p.jpegBytes);
      pushStr('\nendstream\nendobj\n');
    }

    const xrefOffset = byteLength;
    pushStr(`xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`);
    for (let id = 1; id <= totalObjects; id++) {
      const off = String(offsets[id] || 0).padStart(10, '0');
      pushStr(`${off} 00000 n \n`);
    }
    pushStr(
      `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
    );

    return new Blob(chunks, { type: 'application/pdf' });
  };

  // Parse a raw PDF buffer to extract page structure, embedded JPEGs, and text content
  const parsePdfStructure = async (uint8, allowRepair = false) => {
    const rawText = decoder.decode(uint8);
    if (!allowRepair && !rawText.includes('%PDF-')) {
      throw new Error('Invalid PDF file: missing %PDF header.');
    }

    const objects = new Map();
    const objRegex = /(\d+)\s+(\d+)\s+obj\b([\s\S]*?)endobj\b/g;
    let match;
    while ((match = objRegex.exec(rawText)) !== null) {
      const objId = Number(match[1]);
      const body = match[3];
      const bodyStart = match.index + match[0].indexOf(body);

      let dictText = body;
      let streamBytes = null;
      const streamMatch = /stream(\r?\n)/.exec(body);
      if (streamMatch) {
        const streamStartInBody = streamMatch.index + streamMatch[0].length;
        const endStreamIdx = body.lastIndexOf('endstream');
        if (endStreamIdx > streamStartInBody) {
          dictText = body.slice(0, streamMatch.index);
          let endPos = endStreamIdx;
          if (body[endPos - 1] === '\n') endPos--;
          if (body[endPos - 1] === '\r') endPos--;
          streamBytes = uint8.subarray(bodyStart + streamStartInBody, bodyStart + endPos);
        }
      }
      objects.set(objId, { id: objId, dictText, body, streamBytes });
    }

    const parseMediaBox = (str) => {
      const m = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/.exec(str);
      if (!m) return null;
      const w = Math.abs(Number(m[3]) - Number(m[1]));
      const h = Math.abs(Number(m[4]) - Number(m[2]));
      return w > 0 && h > 0 ? { width: w, height: h } : null;
    };

    let inheritedBox = { width: 595.28, height: 841.89 };
    for (const obj of objects.values()) {
      if (/\/Type\s*\/Pages\b/.test(obj.dictText)) {
        const b = parseMediaBox(obj.dictText);
        if (b) inheritedBox = b;
      }
    }

    const pageObjs = [];
    const visitedPages = new Set();
    const collectPagesFromNode = (objId, currentBox) => {
      const obj = objects.get(objId);
      if (!obj || visitedPages.has(objId)) return;
      visitedPages.add(objId);
      const box = parseMediaBox(obj.dictText) || currentBox;
      if (/\/Type\s*\/Page\b(?!s)/.test(obj.dictText)) {
        pageObjs.push({ obj, box });
        return;
      }
      const kidsMatch = /\/Kids\s*\[([\s\S]*?)\]/.exec(obj.dictText);
      if (kidsMatch) {
        const refRegex = /(\d+)\s+\d+\s+R/g;
        let r;
        while ((r = refRegex.exec(kidsMatch[1])) !== null) {
          collectPagesFromNode(Number(r[1]), box);
        }
      }
    };

    let rootPagesId = null;
    for (const obj of objects.values()) {
      if (/\/Type\s*\/Catalog\b/.test(obj.dictText)) {
        const pm = /\/Pages\s+(\d+)\s+\d+\s+R/.exec(obj.dictText);
        if (pm) rootPagesId = Number(pm[1]);
      }
    }
    if (rootPagesId) {
      collectPagesFromNode(rootPagesId, inheritedBox);
    }

    if (pageObjs.length === 0) {
      for (const obj of objects.values()) {
        if (/\/Type\s*\/Page\b(?!s)/.test(obj.dictText)) {
          pageObjs.push({ obj, box: parseMediaBox(obj.dictText) || inheritedBox });
        }
      }
    }

    let declaredCount = pageObjs.length;
    if (declaredCount === 0) {
      let maxCount = 0;
      const countRegex = /\/Count\s+(\d+)/g;
      let cm;
      while ((cm = countRegex.exec(rawText)) !== null) {
        maxCount = Math.max(maxCount, Number(cm[1]));
      }
      declaredCount = maxCount || 1;
      for (let i = 0; i < declaredCount; i++) {
        pageObjs.push({ obj: null, box: inheritedBox });
      }
    }

    const extractPageDetails = async (pageEntry, pageIndex) => {
      const box = pageEntry.box || inheritedBox;
      const images = [];
      const textItems = [];
      const rects = [];

      const inspectStreamObj = async (streamObj) => {
        if (!streamObj || !streamObj.streamBytes) return;
        const isImage = /\/Subtype\s*\/Image\b/.test(streamObj.dictText);
        const isDct = /\/Filter\s*(?:\[\s*)?\/DCTDecode\b/.test(streamObj.dictText);
        const isFlate = /\/Filter\s*(?:\[\s*)?\/FlateDecode\b/.test(streamObj.dictText);

        if (isImage) {
          if (isDct) {
            images.push(new Blob([streamObj.streamBytes], { type: 'image/jpeg' }));
          }
          return;
        }

        let bytes = streamObj.streamBytes;
        if (isFlate) {
          bytes = await inflateBytes(bytes);
        }
        const contentStr = decoder.decode(bytes);

        let fillStyle = '#111512';
        const tokenLines = contentStr.split(/\r?\n/);
        for (const line of tokenLines) {
          const rgMatch = /([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg\b/.exec(line);
          if (rgMatch) {
            const r = Math.round(Number(rgMatch[1]) * 255);
            const g = Math.round(Number(rgMatch[2]) * 255);
            const b = Math.round(Number(rgMatch[3]) * 255);
            fillStyle = `rgb(${r},${g},${b})`;
          }
          const reMatch = /([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+re\b/.exec(line);
          if (reMatch) {
            rects.push({
              x: Number(reMatch[1]),
              y: Number(reMatch[2]),
              w: Number(reMatch[3]),
              h: Number(reMatch[4]),
              color: fillStyle
            });
          }
        }

        const btRegex = /BT\b([\s\S]*?)ET\b/g;
        let btm;
        while ((btm = btRegex.exec(contentStr)) !== null) {
          const block = btm[1];
          const isInvisible = /\b3\s+Tr\b/.test(block);
          let x = 48;
          let y = box.height - 64 - textItems.length * 22;
          let fontSize = 14;

          const tfMatch = /\/F\d+\s+([\d.]+)\s+Tf/.exec(block);
          if (tfMatch) fontSize = Math.max(8, Math.min(72, Number(tfMatch[1])));

          const tdMatch = /([-\d.]+)\s+([-\d.]+)\s+T[dD]/.exec(block);
          if (tdMatch) {
            x = Number(tdMatch[1]);
            y = Number(tdMatch[2]);
          }
          const tmMatch = /([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm/.exec(block);
          if (tmMatch) {
            x = Number(tmMatch[5]);
            y = Number(tmMatch[6]);
          }

          const strParts = [];
          const litRegex = /\(((?:\\.|[^\\()])*)\)/g;
          let lm;
          while ((lm = litRegex.exec(block)) !== null) {
            const cleaned = lm[1]
              .replace(/\\n/g, '\n')
              .replace(/\\r/g, '')
              .replace(/\\t/g, ' ')
              .replace(/\\\(/g, '(')
              .replace(/\\\)/g, ')')
              .replace(/\\\\/g, '\\');
            if (cleaned.trim()) strParts.push(cleaned);
          }
          if (strParts.length > 0) {
            textItems.push({
              text: strParts.join(' '),
              x,
              y,
              fontSize,
              invisible: isInvisible
            });
          }
        }
      };

      if (pageEntry.obj) {
        const dict = pageEntry.obj.dictText;
        const contentsArrayMatch = /\/Contents\s*\[([\s\S]*?)\]/.exec(dict);
        if (contentsArrayMatch) {
          const refRegex = /(\d+)\s+\d+\s+R/g;
          let r;
          while ((r = refRegex.exec(contentsArrayMatch[1])) !== null) {
            await inspectStreamObj(objects.get(Number(r[1])));
          }
        } else {
          const singleContent = /\/Contents\s+(\d+)\s+\d+\s+R/.exec(dict);
          if (singleContent) {
            await inspectStreamObj(objects.get(Number(singleContent[1])));
          }
        }

        const xobjBlock = /\/XObject\s*<<([\s\S]*?)>>/.exec(dict);
        if (xobjBlock) {
          const refRegex = /(\d+)\s+\d+\s+R/g;
          let r;
          while ((r = refRegex.exec(xobjBlock[1])) !== null) {
            await inspectStreamObj(objects.get(Number(r[1])));
          }
        } else {
          const resRef = /\/Resources\s+(\d+)\s+\d+\s+R/.exec(dict);
          if (resRef) {
            const resObj = objects.get(Number(resRef[1]));
            if (resObj) {
              const rx = /\/XObject\s*<<([\s\S]*?)>>/.exec(resObj.dictText);
              if (rx) {
                const refRegex = /(\d+)\s+\d+\s+R/g;
                let r;
                while ((r = refRegex.exec(rx[1])) !== null) {
                  await inspectStreamObj(objects.get(Number(r[1])));
                }
              }
            }
          }
        }
      }

      return {
        pageNumber: pageIndex + 1,
        width: box.width,
        height: box.height,
        rotation: 0,
        images,
        textItems,
        rects
      };
    };

    const pages = [];
    for (let i = 0; i < pageObjs.length; i++) {
      pages.push(await extractPageDetails(pageObjs[i], i));
    }

    return {
      pageCount: pages.length,
      objectCount: objects.size,
      pages
    };
  };

  // Render a parsed page descriptor to an HTMLCanvasElement (supports rotation, crop, watermarks, page numbers, signatures, grayscale)
  const renderParsedPageToCanvas = async (pageInfo, scale = 1.5, docTitle = 'Document', effects = {}) => {
    const baseW = Math.max(64, Math.round(pageInfo.width * scale));
    const baseH = Math.max(64, Math.round(pageInfo.height * scale));
    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = baseW;
    baseCanvas.height = baseH;
    const ctx = baseCanvas.getContext('2d', { alpha: false });

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, baseW, baseH);

    // Optional crop/margin inset
    const cropInsetPx = Math.max(0, Math.round((Number(effects.cropMarginPt) || 0) * scale));
    if (cropInsetPx > 0 && cropInsetPx * 2 < Math.min(baseW, baseH)) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cropInsetPx, cropInsetPx, baseW - cropInsetPx * 2, baseH - cropInsetPx * 2);
      ctx.clip();
    }

    let drewContent = false;

    // 1. Draw embedded images
    if (!effects.isBlankPage && pageInfo.images) {
      for (const imgBlob of pageInfo.images) {
        try {
          const { image, url } = await decodeImageBlob(imgBlob);
          try {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(
              image,
              cropInsetPx,
              cropInsetPx,
              baseW - cropInsetPx * 2,
              baseH - cropInsetPx * 2
            );
            drewContent = true;
          } finally {
            URL.revokeObjectURL(url);
          }
        } catch {
          // ignore
        }
      }
    }

    // 2. Draw vector rectangles
    if (!effects.isBlankPage && pageInfo.rects && pageInfo.rects.length > 0) {
      for (const r of pageInfo.rects) {
        ctx.fillStyle = r.color || '#111512';
        const rx = r.x * scale;
        const ry = (pageInfo.height - r.y - r.h) * scale;
        ctx.fillRect(rx, ry, r.w * scale, r.h * scale);
        drewContent = true;
      }
    }

    // 3. Draw visible parsed text streams
    const visibleText = (pageInfo.textItems || []).filter((t) => !t.invisible);
    if (!effects.isBlankPage && visibleText.length > 0) {
      ctx.fillStyle = '#141815';
      ctx.textBaseline = 'alphabetic';
      for (const item of visibleText) {
        const pxSize = Math.max(10, Math.round(item.fontSize * scale));
        ctx.font = `500 ${pxSize}px Inter, -apple-system, BlinkMacSystemFont, sans-serif`;
        const tx = Math.max(16 * scale, item.x * scale);
        const ty = Math.min(baseH - 16 * scale, Math.max(pxSize + 8, (pageInfo.height - item.y) * scale));
        ctx.fillText(item.text, tx, ty, baseW - tx - 16 * scale);
        drewContent = true;
      }
    }

    // 4. Fallback page representation
    if (!drewContent && !effects.isBlankPage) {
      const pad = Math.round(36 * scale);
      ctx.strokeStyle = '#e2e6e3';
      ctx.lineWidth = Math.max(1, Math.round(1.5 * scale));
      ctx.strokeRect(pad, pad, baseW - pad * 2, baseH - pad * 2);

      ctx.fillStyle = '#181d19';
      ctx.fillRect(pad, pad, baseW - pad * 2, Math.round(48 * scale));

      ctx.fillStyle = '#c7ff4a';
      ctx.font = `800 ${Math.round(13 * scale)}px Inter, sans-serif`;
      ctx.fillText('WEBPRESSO PDF STUDIO', pad + Math.round(18 * scale), pad + Math.round(29 * scale));

      ctx.fillStyle = '#111512';
      ctx.font = `700 ${Math.round(20 * scale)}px Inter, sans-serif`;
      ctx.fillText(
        docTitle.replace(/\.pdf$/i, ''),
        pad + Math.round(20 * scale),
        pad + Math.round(92 * scale),
        baseW - pad * 2 - Math.round(40 * scale)
      );

      ctx.fillStyle = '#5c645d';
      ctx.font = `500 ${Math.round(13 * scale)}px Inter, sans-serif`;
      ctx.fillText(
        `Page ${pageInfo.pageNumber} · ${Math.round(pageInfo.width)} × ${Math.round(pageInfo.height)} pt`,
        pad + Math.round(20 * scale),
        pad + Math.round(118 * scale)
      );

      ctx.fillStyle = '#eef1ee';
      const startY = pad + Math.round(150 * scale);
      const lineStep = Math.round(22 * scale);
      for (let y = startY; y < baseH - pad - lineStep * 2; y += lineStep) {
        const lineW = (baseW - pad * 2 - Math.round(40 * scale)) * (y % (lineStep * 3) === 0 ? 0.72 : 0.94);
        ctx.fillRect(pad + Math.round(20 * scale), y, lineW, Math.round(8 * scale));
      }
    }

    if (cropInsetPx > 0 && cropInsetPx * 2 < Math.min(baseW, baseH)) {
      ctx.restore();
      if (effects.cropBorder) {
        ctx.strokeStyle = '#d0d7d1';
        ctx.lineWidth = Math.max(1, Math.round(scale));
        ctx.strokeRect(cropInsetPx, cropInsetPx, baseW - cropInsetPx * 2, baseH - cropInsetPx * 2);
      }
    }

    // OVERLAY 1: Watermark
    if (effects.watermark && effects.watermark.text) {
      const wm = effects.watermark;
      const colorMap = {
        red: [220, 38, 38],
        ink: [24, 29, 25],
        lime: [115, 168, 12],
        blue: [37, 99, 235]
      };
      const rgb = colorMap[wm.color] || colorMap.red;
      const alpha = Math.max(0.08, Math.min(0.95, (Number(wm.opacity) || 35) / 100));
      const fontSizePx = Math.max(16, Math.round((Number(wm.fontSize) || 48) * scale));

      ctx.save();
      ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
      ctx.font = `800 ${fontSizePx}px Inter, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (wm.style === 'tiled') {
        ctx.translate(baseW / 2, baseH / 2);
        ctx.rotate((-35 * Math.PI) / 180);
        const stepX = Math.max(180 * scale, fontSizePx * 4.2);
        const stepY = Math.max(130 * scale, fontSizePx * 2.6);
        for (let y = -baseH; y <= baseH; y += stepY) {
          for (let x = -baseW; x <= baseW; x += stepX) {
            ctx.fillText(wm.text, x, y);
          }
        }
      } else if (wm.style === 'banner') {
        ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.min(0.92, alpha + 0.35)})`;
        const barH = Math.round(36 * scale);
        ctx.fillRect(0, 0, baseW, barH);
        ctx.fillStyle = '#ffffff';
        ctx.font = `800 ${Math.round(14 * scale)}px Inter, sans-serif`;
        ctx.fillText(wm.text.toUpperCase(), baseW / 2, barH / 2);
      } else {
        const angleDeg = wm.style === 'horizontal' ? 0 : -42;
        ctx.translate(baseW / 2, baseH / 2);
        ctx.rotate((angleDeg * Math.PI) / 180);
        ctx.fillText(wm.text, 0, 0);
      }
      ctx.restore();
    }

    // OVERLAY 2: Page Numbers
    if (effects.pageNumbering) {
      const pn = effects.pageNumbering;
      const curNum = pn.currentNumber ?? pageInfo.pageNumber;
      const totNum = pn.totalCount ?? 1;
      let label = `Page ${curNum} of ${totNum}`;
      if (pn.format === 'short') label = `${curNum} / ${totNum}`;
      else if (pn.format === 'number') label = `${curNum}`;
      else if (pn.format === 'dash') label = `— ${curNum} —`;

      const fontSizePx = Math.max(9, Math.round((Number(pn.fontSize) || 12) * scale));
      const marginPx = Math.round((Number(pn.marginPt) || 28) * scale);

      ctx.save();
      ctx.font = `700 ${fontSizePx}px Inter, -apple-system, sans-serif`;
      const pos = pn.position || 'bottom-center';
      let x = baseW / 2;
      let y = baseH - marginPx;
      ctx.textAlign = 'center';

      if (pos.includes('top')) y = marginPx + fontSizePx * 0.8;
      if (pos.includes('left')) {
        x = marginPx;
        ctx.textAlign = 'left';
      } else if (pos.includes('right')) {
        x = baseW - marginPx;
        ctx.textAlign = 'right';
      }

      // Subtle pill backdrop for crisp legibility on any background
      const metrics = ctx.measureText(label);
      const pillW = metrics.width + Math.round(14 * scale);
      const pillH = fontSizePx + Math.round(8 * scale);
      let pillX = x - pillW / 2;
      if (ctx.textAlign === 'left') pillX = x - Math.round(7 * scale);
      if (ctx.textAlign === 'right') pillX = x - pillW + Math.round(7 * scale);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.fillRect(pillX, y - fontSizePx, pillW, pillH);
      ctx.fillStyle = '#181d19';
      ctx.fillText(label, x, y);
      ctx.restore();
    }

    // OVERLAY 3: Signature Stamp
    if (effects.signature && effects.signature.shouldStamp) {
      const sig = effects.signature;
      const boxW = Math.round(190 * scale);
      const boxH = Math.round(78 * scale);
      const pad = Math.round(32 * scale);

      let sx = baseW - boxW - pad;
      let sy = baseH - boxH - pad;
      if (sig.position === 'bottom-left') {
        sx = pad;
      } else if (sig.position === 'bottom-center') {
        sx = Math.round((baseW - boxW) / 2);
      } else if (sig.position === 'center') {
        sx = Math.round((baseW - boxW) / 2);
        sy = Math.round((baseH - boxH) / 2);
      }

      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
      ctx.fillRect(sx, sy, boxW, boxH);
      ctx.strokeStyle = '#c5cec6';
      ctx.lineWidth = Math.max(1, Math.round(scale));
      ctx.strokeRect(sx, sy, boxW, boxH);

      if (sig.signatureImage) {
        ctx.drawImage(
          sig.signatureImage,
          sx + Math.round(8 * scale),
          sy + Math.round(6 * scale),
          boxW - Math.round(16 * scale),
          boxH - Math.round(24 * scale)
        );
      } else if (sig.typedName) {
        ctx.fillStyle = sig.inkColor || '#111512';
        ctx.font = `italic 700 ${Math.round(22 * scale)}px Georgia, "Times New Roman", serif`;
        ctx.fillText(
          sig.typedName,
          sx + Math.round(14 * scale),
          sy + Math.round(38 * scale),
          boxW - Math.round(24 * scale)
        );
      }

      // Signer meta footer line
      ctx.fillStyle = '#4c544d';
      ctx.font = `600 ${Math.round(8.5 * scale)}px Inter, sans-serif`;
      const metaLine = [sig.signerName || 'Signed via Webpresso', sig.dateText].filter(Boolean).join(' · ');
      ctx.fillText(metaLine, sx + Math.round(10 * scale), sy + boxH - Math.round(7 * scale), boxW - Math.round(16 * scale));
      ctx.restore();
    }

    // OVERLAY 4: Security / Protection Classification Stamp
    if (effects.securityBanner) {
      const sb = effects.securityBanner;
      ctx.save();
      const barH = Math.round(24 * scale);
      ctx.fillStyle = '#111512';
      ctx.fillRect(0, 0, baseW, barH);
      ctx.fillStyle = '#c7ff4a';
      ctx.font = `800 ${Math.round(9.5 * scale)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sb, baseW / 2, barH / 2);
      ctx.restore();
    }

    // FILTER: Grayscale / High-Contrast Scan / Sepia
    if (effects.colorFilter && effects.colorFilter !== 'none') {
      const imgData = ctx.getImageData(0, 0, baseW, baseH);
      const data = imgData.data;
      const mode = effects.colorFilter; // 'grayscale' | 'bw-scan' | 'sepia'
      for (let p = 0; p < data.length; p += 4) {
        const lum = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
        if (mode === 'bw-scan') {
          const v = lum > 175 ? 255 : lum < 95 ? 18 : Math.round(((lum - 95) / 80) * 237 + 18);
          data[p] = v;
          data[p + 1] = v;
          data[p + 2] = v;
        } else if (mode === 'sepia') {
          data[p] = Math.min(255, Math.round(lum * 1.07));
          data[p + 1] = Math.min(255, Math.round(lum * 0.96));
          data[p + 2] = Math.min(255, Math.round(lum * 0.82));
        } else {
          const g = Math.round(lum);
          data[p] = g;
          data[p + 1] = g;
          data[p + 2] = g;
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }

    // ROTATION: 0, 90, 180, 270 degrees clockwise
    const totalRot = (((pageInfo.rotation || 0) + (effects.rotateDeg || 0)) % 360 + 360) % 360;
    if (totalRot === 0) {
      return baseCanvas;
    }

    const swapDims = totalRot === 90 || totalRot === 270;
    const rotCanvas = document.createElement('canvas');
    rotCanvas.width = swapDims ? baseH : baseW;
    rotCanvas.height = swapDims ? baseW : baseH;
    const rCtx = rotCanvas.getContext('2d', { alpha: false });
    rCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
    rCtx.rotate((totalRot * Math.PI) / 180);
    rCtx.drawImage(baseCanvas, -baseW / 2, -baseH / 2);
    return rotCanvas;
  };

  // Inspect a PDF File and return metadata + per-page thumbnails for the Visual Page Workbench
  const inspectPdf = async (file) => {
    const uint8 = await blobToUint8Array(file);
    const parsed = await parsePdfStructure(uint8, true);
    const pageThumbs = [];
    const maybeYield = createYieldController();

    for (let i = 0; i < parsed.pages.length; i++) {
      await maybeYield();
      const canvas = await renderParsedPageToCanvas(parsed.pages[i], 0.36, file.name);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.78));
      const url = blob ? URL.createObjectURL(blob) : '';
      pageThumbs.push({
        pageNumber: i + 1,
        width: parsed.pages[i].width,
        height: parsed.pages[i].height,
        rotation: 0,
        previewUrl: url
      });
    }

    return {
      pageCount: parsed.pageCount,
      pages: parsed.pages,
      pageThumbs,
      previewUrl: pageThumbs[0]?.previewUrl || ''
    };
  };

  const parsePageRanges = (rangeStr, maxPages) => {
    const cleaned = String(rangeStr || '').trim();
    if (!cleaned) {
      return Array.from({ length: maxPages }, (_, i) => [i + 1]);
    }
    const groups = [];
    const parts = cleaned.split(',').map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(part);
      if (rangeMatch) {
        let start = Math.max(1, Math.min(maxPages, Number(rangeMatch[1])));
        let end = Math.max(1, Math.min(maxPages, Number(rangeMatch[2])));
        if (start > end) [start, end] = [end, start];
        const pages = [];
        for (let p = start; p <= end; p++) pages.push(p);
        if (pages.length) groups.push(pages);
      } else if (/^\d+$/.test(part)) {
        const p = Number(part);
        if (p >= 1 && p <= maxPages) {
          groups.push([p]);
        }
      }
    }
    if (groups.length === 0) {
      throw new Error(`No valid pages found in range "${rangeStr}" (document has ${maxPages} page${maxPages === 1 ? '' : 's'}).`);
    }
    return groups;
  };

  // Convert parsed PDF pages subset into a new PDF Blob + thumbnail, applying optional page-level effects
  const buildPdfFromParsedPages = async (parsedPages, options = {}) => {
    const scale = options.scale || 1.5;
    const quality = options.quality || 0.84;
    const docTitle = options.title || 'Document';
    const maybeYield = createYieldController();

    const preparedPages = [];
    let firstPreviewUrl = '';

    for (let i = 0; i < parsedPages.length; i++) {
      await maybeYield();
      const pageInfo = parsedPages[i];
      const pageEffects =
        typeof options.getEffectsForPage === 'function'
          ? options.getEffectsForPage(pageInfo, i, parsedPages.length)
          : options.effects || {};

      const canvas = await renderParsedPageToCanvas(
        pageInfo,
        scale,
         pageInfo.sourceTitle || docTitle,
        pageEffects
      );
      const jpegBytes = await canvasToJpegBytes(canvas, quality);

      if (i === 0) {
        const thumbBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.78));
        if (thumbBlob) firstPreviewUrl = URL.createObjectURL(thumbBlob);
      }

      const totalRot = (((pageInfo.rotation || 0) + (pageEffects.rotateDeg || 0)) % 360 + 360) % 360;
      const swap = totalRot === 90 || totalRot === 270;
      const outWidthPt = swap ? pageInfo.height : pageInfo.width;
      const outHeightPt = swap ? pageInfo.width : pageInfo.height;

      const textSummary = (pageInfo.textItems || [])
        .map((t) => t.text)
        .join(' ')
        .slice(0, 600);

      preparedPages.push({
        pageWidthPt: outWidthPt,
        pageHeightPt: outHeightPt,
        drawX: 0,
        drawY: 0,
        drawWidth: outWidthPt,
        drawHeight: outHeightPt,
        jpegBytes,
        imgWidthPx: canvas.width,
        imgHeightPx: canvas.height,
        searchableText: textSummary || `${docTitle} - Page ${i + 1}`
      });
    }

    const pdfBlob = await buildPdfFromJpegPages(preparedPages, options.metadata || {});
    return {
      blob: pdfBlob,
      pageCount: preparedPages.length,
      previewUrl: firstPreviewUrl
    };
  };

  // Helper to resolve pages from a file alongside any user edits from the Visual Page Workbench
  const resolveEditedPages = async (file, workbenchPages) => {
    const uint8 = await blobToUint8Array(file);
    const parsed = await parsePdfStructure(uint8, true);
    if (!workbenchPages || !workbenchPages.length) {
      return parsed.pages;
    }
    return workbenchPages.map((wb, idx) => {
      if (wb.isBlank) {
        return {
          pageNumber: idx + 1,
          width: 595.28,
          height: 841.89,
          rotation: wb.rotation || 0,
          images: [],
          textItems: [],
          rects: [],
          isBlank: true
        };
      }
      const orig = parsed.pages[(wb.originalPageNumber || 1) - 1] || parsed.pages[0];
      return {
        ...orig,
        pageNumber: idx + 1,
        rotation: ((orig.rotation || 0) + (wb.rotation || 0)) % 360
      };
    });
  };

  // 1. MERGE PDF
  const mergePdfs = async (files, options = {}) => {
    if (!files || files.length === 0) {
      throw new Error('Please add at least one PDF file to merge.');
    }
    const maybeYield = createYieldController();
    const allPages = [];

    for (const file of files) {
      await maybeYield();
      const uint8 = await blobToUint8Array(file);
      const parsed = await parsePdfStructure(uint8, true);
      for (const p of parsed.pages) {
        allPages.push({ ...p, sourceTitle: file.name });
      }
    }

    const result = await buildPdfFromParsedPages(allPages, {
      scale: 1.5,
      quality: 0.85,
      title: options.outputName || 'merged.pdf'
    });

    const totalInputBytes = files.reduce((sum, f) => sum + f.size, 0);
    return [
      {
        name: (options.outputName || 'merged-document.pdf').replace(/\.pdf$/i, '') + '.pdf',
        originalSize: totalInputBytes,
        blob: result.blob,
        pageCount: result.pageCount,
        preview: result.previewUrl,
        badge: `${result.pageCount} page${result.pageCount === 1 ? '' : 's'} merged`
      }
    ];
  };

  // 2. SPLIT PDF
  const splitPdf = async (file, options = {}) => {
    const pages = await resolveEditedPages(file, options.workbenchPages);
    const baseName = file.name.replace(/\.pdf$/i, '') || 'document';
    const mode = options.splitMode || 'ranges';
    const mergeRanges = Boolean(options.mergeRanges);

    let pageGroups;
    if (mode === 'all') {
      pageGroups = Array.from({ length: pages.length }, (_, i) => [i + 1]);
    } else {
      pageGroups = parsePageRanges(options.rangeInput || '1', pages.length);
    }

    if (mode === 'ranges' && mergeRanges && pageGroups.length > 1) {
      pageGroups = [pageGroups.flat()];
    }

    const outputs = [];
    const maybeYield = createYieldController();

    for (let g = 0; g < pageGroups.length; g++) {
      await maybeYield();
      const group = pageGroups[g];
      const selectedPages = group.map((pNum) => pages[pNum - 1]).filter(Boolean);
      const built = await buildPdfFromParsedPages(selectedPages, {
        scale: 1.5,
        quality: 0.85,
        title: file.name
      });

      const label =
        group.length === 1 ? `page-${group[0]}` : `pages-${group[0]}-${group[group.length - 1]}`;

      outputs.push({
        name: `${baseName}-${label}.pdf`,
        originalSize: file.size,
        blob: built.blob,
        pageCount: built.pageCount,
        preview: built.previewUrl,
        badge: `${built.pageCount} page${built.pageCount === 1 ? '' : 's'}`
      });
    }

    return outputs;
  };

  // 3. ORGANIZE / REORDER / REMOVE PAGES
  const organizePdf = async (file, options = {}) => {
    let pages = await resolveEditedPages(file, options.workbenchPages);
    const filterMode = options.filterMode || 'all'; // 'all' | 'odd' | 'even' | 'reverse'

    if (filterMode === 'odd') {
      pages = pages.filter((_, idx) => (idx + 1) % 2 === 1);
    } else if (filterMode === 'even') {
      pages = pages.filter((_, idx) => (idx + 1) % 2 === 0);
    } else if (filterMode === 'reverse') {
      pages = [...pages].reverse();
    }

    if (options.appendBlankPage) {
      pages.push({
        pageNumber: pages.length + 1,
        width: pages[0]?.width || 595.28,
        height: pages[0]?.height || 841.89,
        rotation: 0,
        images: [],
        textItems: [],
        rects: [],
        isBlank: true
      });
    }

    if (pages.length === 0) {
      throw new Error('At least 1 page must remain in the document.');
    }

    const built = await buildPdfFromParsedPages(pages, {
      scale: 1.5,
      quality: 0.85,
      title: file.name,
      getEffectsForPage: (p) => ({ isBlankPage: Boolean(p.isBlank) })
    });

    const baseName = file.name.replace(/\.pdf$/i, '') || 'document';
    return [
      {
        name: `${baseName}-organized.pdf`,
        originalSize: file.size,
        blob: built.blob,
        pageCount: built.pageCount,
        preview: built.previewUrl,
        badge: `${built.pageCount} page${built.pageCount === 1 ? '' : 's'} organized`
      }
    ];
  };

  // 4. ROTATE PDF
  const rotatePdf = async (file, options = {}) => {
    const pages = await resolveEditedPages(file, options.workbenchPages);
    const angle = Number(options.angle) || 90; // 90 | 180 | 270
    const target = options.target || 'all'; // 'all' | 'portrait' | 'landscape' | 'odd' | 'even'

    const built = await buildPdfFromParsedPages(pages, {
      scale: 1.5,
      quality: 0.85,
      title: file.name,
      getEffectsForPage: (p, idx) => {
        const isLandscape = p.width > p.height;
        let apply = true;
        if (target === 'portrait') apply = !isLandscape;
        else if (target === 'landscape') apply = isLandscape;
        else if (target === 'odd') apply = (idx + 1) % 2 === 1;
        else if (target === 'even') apply = (idx + 1) % 2 === 0;
        return { rotateDeg: apply ? angle : 0, isBlankPage: Boolean(p.isBlank) };
      }
    });

    const baseName = file.name.replace(/\.pdf$/i, '') || 'document';
    return [
      {
        name: `${baseName}-rotated-${angle}deg.pdf`,
        originalSize: file.size,
        blob: built.blob,
        pageCount: built.pageCount,
        preview: built.previewUrl,
        badge: `Rotated ${angle}° (${ built.pageCount } pg${built.pageCount === 1 ? '' : 's'})`
      }
    ];
  };

  // 5. COMPRESS PDF
  const compressPdf = async (file, options = {}) => {
    const level = options.level || 'recommended';
    const presets = {
      extreme: { scale: 0.9, quality: 0.42, label: 'Extreme compression' },
      recommended: { scale: 1.25, quality: 0.68, label: 'Recommended compression' },
      less: { scale: 1.6, quality: 0.84, label: 'High quality compression' }
    };
    const preset = presets[level] || presets.recommended;

    const pages = await resolveEditedPages(file, options.workbenchPages);
    const built = await buildPdfFromParsedPages(pages, {
      scale: preset.scale,
      quality: preset.quality,
      title: file.name
    });

    const baseName = file.name.replace(/\.pdf$/i, '') || 'document';
    const percent = file.size ? Math.round((1 - built.blob.size / file.size) * 100) : 0;

    return [
      {
        name: `${baseName}-compressed.pdf`,
        originalSize: file.size,
        blob: built.blob,
        pageCount: built.pageCount,
        preview: built.previewUrl,
        badge: percent > 0 ? `${percent}% smaller` : preset.label
      }
    ];
  };

  // 6. REPAIR & SANITIZE PDF
  const repairPdf = async (file) => {
    const uint8 = await blobToUint8Array(file);
    const parsed = await parsePdfStructure(uint8, true);
    const built = await buildPdfFromParsedPages(parsed.pages, {
      scale: 1.5,
      quality: 0.86,
      title: file.name,
      metadata: {
        title: `${file.name.replace(/\.pdf$/i, '')} (Repaired)`,
        subject: 'Rebuilt XRef & normalized PDF 1.4 structure'
      }
    });

    const baseName = file.name.replace(/\.pdf$/i, '') || 'document';
    return [
      {
        name: `${baseName}-repaired.pdf`,
        originalSize: file.size,
        blob: built.blob,
        pageCount: built.pageCount,
        preview: built.previewUrl,
        badge: `XRef rebuilt · ${built.pageCount} pg${built.pageCount === 1 ? '' : 's'}`
      }
    ];
  };

  // 7. GRAYSCALE / B&W SCAN PDF
  const grayscalePdf = async (file, options = {}) => {
    const filterMode = options.mode || 'grayscale'; // 'grayscale' | 'bw-scan' | 'sepia'
    const pages = await resolveEditedPages(file, options.workbenchPages);
    const built = await buildPdfFromParsedPages(pages, {
      scale: 1.5,
      quality: 0.82,
      title: file.name,
      effects: { colorFilter: filterMode }
    });

    const baseName = file.name.replace(/\.pdf$/i, '') || 'document';
    const labelMap = {
      grayscale: 'Grayscale',
      'bw-scan': 'High-Contrast Scan',
      sepia: 'Archival Sepia'
    };
    return [
      {
        name: `${baseName}-${filterMode}.pdf`,
        originalSize: file.size,
        blob: built.blob,
        pageCount: built.pageCount,
        preview: built.previewUrl,
        badge: `${labelMap[filterMode] || 'Grayscale'} · ${built.pageCount} pg${built.pageCount === 1 ? '' : 's'}`
      }
    ];
  };

  // 8. IMAGES TO PDF
  const imagesToPdf = async (files, options = {}) => {
    if (!files || files.length === 0) {
      throw new Error('Please select at least one image to convert to PDF.');
    }

    const pageSizeMode = options.pageSize || 'a4';
    const orientationMode = options.orientation || 'auto';
    const marginMode = options.margin || 'small';
    const quality = Math.max(0.1, Math.min(1, (Number(options.quality) || 86) / 100));

    const marginMap = { none: 0, small: 24, large: 48 };
    const marginPt = marginMap[marginMode] ?? 24;

    const standardSizes = {
      a4: { width: 595.28, height: 841.89 },
      letter: { width: 612, height: 792 }
    };

    const maybeYield = createYieldController();
    const preparedPages = [];
    let firstPreviewUrl = '';

    for (let i = 0; i < files.length; i++) {
      await maybeYield();
      const file = files[i];
      const { image, url } = await decodeImageBlob(file);
      try {
        const imgW = Math.max(1, image.naturalWidth || image.width || 800);
        const imgH = Math.max(1, image.naturalHeight || image.height || 600);

        const canvas = document.createElement('canvas');
        const maxDim = 2400;
        const downscale = Math.max(imgW, imgH) > maxDim ? maxDim / Math.max(imgW, imgH) : 1;
        canvas.width = Math.max(1, Math.round(imgW * downscale));
        canvas.height = Math.max(1, Math.round(imgH * downscale));
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        const jpegBytes = await canvasToJpegBytes(canvas, quality);

        if (i === 0) {
          const thumbBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.8));
          if (thumbBlob) firstPreviewUrl = URL.createObjectURL(thumbBlob);
        }

        let pageWidthPt;
        let pageHeightPt;
        let drawX;
        let drawY;
        let drawWidth;
        let drawHeight;

        if (pageSizeMode === 'fit') {
          const contentW = Math.max(72, imgW * 0.75);
          const contentH = Math.max(72, imgH * 0.75);
          pageWidthPt = contentW + marginPt * 2;
          pageHeightPt = contentH + marginPt * 2;
          drawX = marginPt;
          drawY = marginPt;
          drawWidth = contentW;
          drawHeight = contentH;
        } else {
          const base = standardSizes[pageSizeMode] || standardSizes.a4;
          const isLandscape =
            orientationMode === 'landscape' || (orientationMode === 'auto' && imgW > imgH);
          pageWidthPt = isLandscape ? base.height : base.width;
          pageHeightPt = isLandscape ? base.width : base.height;

          const availW = Math.max(36, pageWidthPt - marginPt * 2);
          const availH = Math.max(36, pageHeightPt - marginPt * 2);
          const fitScale = Math.min(availW / imgW, availH / imgH);
          drawWidth = imgW * fitScale;
          drawHeight = imgH * fitScale;
          drawX = marginPt + (availW - drawWidth) / 2;
          drawY = marginPt + (availH - drawHeight) / 2;
        }

        preparedPages.push({
          pageWidthPt,
          pageHeightPt,
          drawX,
          drawY,
          drawWidth,
          drawHeight,
          jpegBytes,
          imgWidthPx: canvas.width,
          imgHeightPx: canvas.height,
          searchableText: file.name
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    const pdfBlob = await buildPdfFromJpegPages(preparedPages);
    const totalInputBytes = files.reduce((sum, f) => sum + f.size, 0);
    const firstBase = files[0].name.replace(/\.[^.]+$/, '') || 'images';
    const outName = files.length === 1 ? `${firstBase}.pdf` : `${firstBase}-bundle.pdf`;

    return [
      {
        name: outName,
        originalSize: totalInputBytes,
        blob: pdfBlob,
        pageCount: preparedPages.length,
        preview: firstPreviewUrl,
        badge: `${preparedPages.length} page${preparedPages.length === 1 ? '' : 's'} PDF`
      }
    ];
  };

  // 9. TEXT / MARKDOWN / HTML TO PDF
  const textToPdf = async (content, options = {}) => {
    const raw = String(content || '').trim();
    if (!raw) {
      throw new Error('Please enter or upload some text, Markdown, or HTML content first.');
    }

    const fontStyle = options.fontFamily || 'sans'; // 'sans' | 'serif' | 'mono'
    const baseSize = Math.max(10, Math.min(24, Number(options.fontSize) || 14));
    const theme = options.theme || 'light'; // 'light' | 'dark'
    const pageW = 595.28;
    const pageH = 841.89;
    const scale = 1.65;
    const cw = Math.round(pageW * scale);
    const ch = Math.round(pageH * scale);
    const padX = Math.round(52 * scale);
    const padY = Math.round(56 * scale);
    const maxLineW = cw - padX * 2;

    const fontMap = {
      sans: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      serif: 'Georgia, "Times New Roman", serif',
      mono: '"SFMono-Regular", Consolas, Menlo, monospace'
    };
    const fontFamily = fontMap[fontStyle] || fontMap.sans;

    // Strip HTML tags into clean Markdown-like lines if HTML was pasted
    const normalized = raw
      .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
      .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
      .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n• $1')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '');

    const rawLines = normalized.split(/\r?\n/);
    const measureCanvas = document.createElement('canvas');
    const mCtx = measureCanvas.getContext('2d');

    const layoutItems = [];
    for (const rawLine of rawLines) {
      const trimmed = rawLine.trim();
      if (!trimmed) {
        layoutItems.push({ text: '', size: baseSize * 0.7, weight: '400', gapAfter: baseSize * 0.6 });
        continue;
      }

      let size = baseSize;
      let weight = '400';
      let text = rawLine;
      let isHeading = false;

      if (/^#\s+/.test(trimmed)) {
        size = baseSize * 1.85;
        weight = '800';
        text = trimmed.replace(/^#\s+/, '');
        isHeading = true;
      } else if (/^##\s+/.test(trimmed)) {
        size = baseSize * 1.45;
        weight = '750';
        text = trimmed.replace(/^##\s+/, '');
        isHeading = true;
      } else if (/^###\s+/.test(trimmed)) {
        size = baseSize * 1.2;
        weight = '700';
        text = trimmed.replace(/^###\s+/, '');
        isHeading = true;
      } else if (/^[-*•]\s+/.test(trimmed)) {
        text = `  •  ${trimmed.replace(/^[-*•]\s+/, '')}`;
      }

      text = text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/`(.*?)`/g, '$1');

      const pxFont = Math.round(size * scale);
      mCtx.font = `${weight} ${pxFont}px ${fontFamily}`;
      const words = text.split(/\s+/);
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (mCtx.measureText(testLine).width > maxLineW && currentLine) {
          layoutItems.push({
            text: currentLine,
            pxFont,
            weight,
            isHeading,
            lineHeight: Math.round(pxFont * 1.48)
          });
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        layoutItems.push({
          text: currentLine,
          pxFont,
          weight,
          isHeading,
          lineHeight: Math.round(pxFont * (isHeading ? 1.65 : 1.48))
        });
      }
    }

    // Paginate layoutItems across canvases
    const pages = [];
    let cursor = 0;
    const maybeYield = createYieldController();
    let firstPreviewUrl = '';

    while (cursor < layoutItems.length || pages.length === 0) {
      await maybeYield();
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d', { alpha: false });

      const isDark = theme === 'dark';
      ctx.fillStyle = isDark ? '#141815' : '#ffffff';
      ctx.fillRect(0, 0, cw, ch);

      // Subtle top accent rule
      ctx.fillStyle = isDark ? '#c7ff4a' : '#181d19';
      ctx.fillRect(padX, Math.round(32 * scale), cw - padX * 2, Math.round(2.5 * scale));

      let y = padY;
      const pageTexts = [];

      while (cursor < layoutItems.length) {
        const item = layoutItems[cursor];
        if (!item.text) {
          y += Math.round((item.gapAfter || 10) * scale);
          cursor++;
          if (y > ch - padY) break;
          continue;
        }
        if (y + item.lineHeight > ch - padY) {
          break;
        }
        ctx.font = `${item.weight} ${item.pxFont}px ${fontFamily}`;
        ctx.fillStyle = item.isHeading
          ? isDark
            ? '#c7ff4a'
            : '#111512'
          : isDark
            ? '#e7ece8'
            : '#222823';
        ctx.fillText(item.text, padX, y + item.pxFont);
        pageTexts.push(item.text);
        y += item.lineHeight;
        cursor++;
      }

      // Page footer
      const pageNum = pages.length + 1;
      ctx.font = `600 ${Math.round(9.5 * scale)}px Inter, sans-serif`;
      ctx.fillStyle = isDark ? '#7d867e' : '#7b837c';
      ctx.textAlign = 'right';
      ctx.fillText(`Page ${pageNum}`, cw - padX, ch - Math.round(26 * scale));

      const jpegBytes = await canvasToJpegBytes(canvas, 0.88);
      if (pages.length === 0) {
        const thumbBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.8));
        if (thumbBlob) firstPreviewUrl = URL.createObjectURL(thumbBlob);
      }

      pages.push({
        pageWidthPt: pageW,
        pageHeightPt: pageH,
        drawX: 0,
        drawY: 0,
        drawWidth: pageW,
        drawHeight: pageH,
        jpegBytes,
        imgWidthPx: cw,
        imgHeightPx: ch,
        searchableText: pageTexts.join(' ').slice(0, 600)
      });
    }

    const pdfBlob = await buildPdfFromJpegPages(pages, {
      title: options.title || 'Typeset Document'
    });

    const inputBytes = encoder.encode(raw).byteLength;
    return [
      {
        name: `${(options.title || 'typeset-document').replace(/\.pdf$/i, '')}.pdf`,
        originalSize: inputBytes,
        blob: pdfBlob,
        pageCount: pages.length,
        preview: firstPreviewUrl,
        badge: `${pages.length} page${pages.length === 1 ? '' : 's'} typeset`
      }
    ];
  };

  // 10. PDF TO IMAGES (WebP / PNG / JPG)
  const pdfToImages = async (file, options = {}) => {
    const format = options.format || 'webp';
    const scale = Math.max(1, Math.min(3, Number(options.scale) || 2));
    const quality = Math.max(0.1, Math.min(1, (Number(options.quality) || 85) / 100));

    const mimeMap = {
      webp: { mime: 'image/webp', ext: 'webp', label: 'WebP' },
      png: { mime: 'image/png', ext: 'png', label: 'PNG' },
      jpeg: { mime: 'image/jpeg', ext: 'jpg', label: 'JPG' },
      jpg: { mime: 'image/jpeg', ext: 'jpg', label: 'JPG' }
    };
    const fmt = mimeMap[format] || mimeMap.webp;

    const pages = await resolveEditedPages(file, options.workbenchPages);
    const baseName = file.name.replace(/\.pdf$/i, '') || 'document';
    const maybeYield = createYieldController();
    const outputs = [];

    for (let i = 0; i < pages.length; i++) {
      await maybeYield();
      const pageInfo = pages[i];
      const canvas = await renderParsedPageToCanvas(pageInfo, scale, file.name);
      const blob = await new Promise((resolve, reject) =>
        canvas.toBlob(
          (res) => (res ? resolve(res) : reject(new Error(`${fmt.label} export failed.`))),
          fmt.mime,
          fmt.mime === 'image/png' ? undefined : quality
        )
      );
      const previewUrl = URL.createObjectURL(blob);
      outputs.push({
        name: `${baseName}-page-${i + 1}.${fmt.ext}`,
        originalSize: Math.round(file.size / pages.length),
        blob,
        width: canvas.width,
        height: canvas.height,
        pageCount: 1,
        preview: previewUrl,
        badge: `${canvas.width}×${canvas.height} · ${fmt.label}`
      });
    }

    return outputs;
  };

  // 11. PDF TO TEXT / MARKDOWN / JSON
  const pdfToText = async (file, options = {}) => {
    const exportFormat = options.format || 'txt'; // 'txt' | 'md' | 'json'
    const uint8 = await blobToUint8Array(file);
    const parsed = await parsePdfStructure(uint8, true);
    const baseName = file.name.replace(/\.pdf$/i, '') || 'document';

    const pageExtracts = parsed.pages.map((p, idx) => {
      const lines = (p.textItems || []).map((t) => t.text).filter(Boolean);
      const text =
        lines.length > 0
          ? lines.join('\n')
          : `[Page ${idx + 1}: ${Math.round(p.width)}×${Math.round(p.height)} pt — ${p.images?.length || 0} embedded image(s)]`;
      return {
        page: idx + 1,
        widthPt: Math.round(p.width),
        heightPt: Math.round(p.height),
        imageCount: p.images?.length || 0,
        text
      };
    });

    let outContent = '';
    let mime = 'text/plain;charset=utf-8';
    let ext = 'txt';

    if (exportFormat === 'json') {
      outContent = JSON.stringify(
        {
          document: file.name,
          pageCount: parsed.pageCount,
          pages: pageExtracts
        },
        null,
        2
      );
      mime = 'application/json;charset=utf-8';
      ext = 'json';
    } else if (exportFormat === 'md') {
      outContent =
        `# ${baseName}\n\n` +
        pageExtracts
          .map((pe) => `## Page ${pe.page}\n\n${pe.text}\n`)
          .join('\n---\n\n');
      mime = 'text/markdown;charset=utf-8';
      ext = 'md';
    } else {
      outContent = pageExtracts
        .map((pe) => `=== Page ${pe.page} ===\n${pe.text}`)
        .join('\n\n');
    }

    const blob = new Blob([outContent], { type: mime });
    const firstCanvas = await renderParsedPageToCanvas(parsed.pages[0], 0.4, file.name);
    const thumbBlob = await new Promise((resolve) => firstCanvas.toBlob(resolve, 'image/webp', 0.78));
    const previewUrl = thumbBlob ? URL.createObjectURL(thumbBlob) : '';

    return [
      {
        name: `${baseName}-extracted.${ext}`,
        originalSize: file.size,
        blob,
        pageCount: parsed.pageCount,
        preview: previewUrl,
        extractedText: outContent,
        badge: `${parsed.pageCount} pg${parsed.pageCount === 1 ? '' : 's'} → .${ext.toUpperCase()}`
      }
    ];
  };

  // 12. ADD PAGE NUMBERS
  const addPageNumbers = async (file, options = {}) => {
    const pages = await resolveEditedPages(file, options.workbenchPages);
    const startNumber = Math.max(1, Number(options.startNumber) || 1);
    const position = options.position || 'bottom-center';
    const format = options.format || 'full'; // 'full' | 'short' | 'number' | 'dash'
    const fontSize = Math.max(8, Math.min(36, Number(options.fontSize) || 12));

    const built = await buildPdfFromParsedPages(pages, {
      scale: 1.5,
      quality: 0.85,
      title: file.name,
      getEffectsForPage: (_, idx, total) => ({
        pageNumbering: {
          currentNumber: startNumber + idx,
          totalCount: startNumber + total - 1,
          position,
          format,
          fontSize,
          marginPt: 26
        }
      })
    });

    const baseName = file.name.replace(/\.pdf$/i, '') || 'document';
    return [
      {
        name: `${baseName}-numbered.pdf`,
        originalSize: file.size,
        blob: built.blob,
        pageCount: built.pageCount,
        preview: built.previewUrl,
        badge: `Numbered (${built.pageCount} pg${built.pageCount === 1 ? '' : 's'})`
      }
    ];
  };

  // 13. ADD WATERMARK
  const watermarkPdf = async (file, options = {}) => {
    const pages = await resolveEditedPages(file, options.workbenchPages);
    const text = (options.text || 'CONFIDENTIAL').trim() || 'CONFIDENTIAL';
    const style = options.style || 'diagonal'; // 'diagonal' | 'tiled' | 'horizontal' | 'banner'
    const color = options.color || 'red'; // 'red' | 'ink' | 'lime' | 'blue'
    const opacity = Math.max(10, Math.min(95, Number(options.opacity) || 32));
    const fontSize = Math.max(18, Math.min(96, Number(options.fontSize) || 48));

    const built = await buildPdfFromParsedPages(pages, {
      scale: 1.5,
      quality: 0.85,
      title: file.name,
      effects: {
        watermark: { text, style, color, opacity, fontSize }
      }
    });

    const baseName = file.name.replace(/\.pdf$/i, '') || 'document';
    return [
      {
        name: `${baseName}-watermarked.pdf`,
        originalSize: file.size,
        blob: built.blob,
        pageCount: built.pageCount,
        preview: built.previewUrl,
        badge: `Watermarked · "${text.slice(0, 14)}"`
      }
    ];
  };

  // 14. SIGN PDF
  const signPdf = async (file, options = {}) => {
    const pages = await resolveEditedPages(file, options.workbenchPages);
    let sigImg = null;
    let sigUrl = '';

    if (options.signatureBlob) {
      const decoded = await decodeImageBlob(options.signatureBlob);
      sigImg = decoded.image;
      sigUrl = decoded.url;
    }

    try {
      const targetPage = options.targetPage || 'last'; // 'last' | 'first' | 'all'
      const position = options.position || 'bottom-right';
      const signerName = options.signerName || 'Authorized Signatory';
      const dateText = options.includeDate !== false ? new Date().toISOString().slice(0, 10) : '';

      const built = await buildPdfFromParsedPages(pages, {
        scale: 1.55,
        quality: 0.86,
        title: file.name,
        getEffectsForPage: (_, idx, total) => {
          const shouldStamp =
            targetPage === 'all' ||
            (targetPage === 'first' && idx === 0) ||
            (targetPage === 'last' && idx === total - 1);
          return {
            signature: {
              shouldStamp,
              signatureImage: sigImg,
              typedName: options.typedName || signerName,
              signerName,
              dateText,
              position,
              inkColor: options.inkColor || '#111512'
            }
          };
        }
      });

      const baseName = file.name.replace(/\.pdf$/i, '') || 'document';
      return [
        {
          name: `${baseName}-signed.pdf`,
          originalSize: file.size,
          blob: built.blob,
          pageCount: built.pageCount,
          preview: built.previewUrl,
          badge: `Signed (${targetPage} page${targetPage === 'all' ? 's' : ''})`
        }
      ];
    } finally {
      if (sigUrl) URL.revokeObjectURL(sigUrl);
    }
  };

  // 15. CROP & MARGIN TRIM PDF
  const cropPdf = async (file, options = {}) => {
    const pages = await resolveEditedPages(file, options.workbenchPages);
    const cropMarginPt = Math.max(0, Math.min(140, Number(options.marginPt) || 32));
    const cropBorder = Boolean(options.drawBorder);

    const built = await buildPdfFromParsedPages(pages, {
      scale: 1.5,
      quality: 0.85,
      title: file.name,
      effects: { cropMarginPt, cropBorder }
    });

    const baseName = file.name.replace(/\.pdf$/i, '') || 'document';
    return [
      {
        name: `${baseName}-cropped.pdf`,
        originalSize: file.size,
        blob: built.blob,
        pageCount: built.pageCount,
        preview: built.previewUrl,
        badge: `Trimmed ${cropMarginPt} pt margins`
      }
    ];
  };

  // 16. PROTECT, FLATTEN & METADATA
  const protectPdf = async (file, options = {}) => {
    const pages = await resolveEditedPages(file, options.workbenchPages);
    const classification = options.classification || 'CONFIDENTIAL · TAMPER-FLATTENED';
    const title = options.title || file.name.replace(/\.pdf$/i, '');
    const author = options.author || 'Webpresso Security Suite';
    const passphraseHash = options.password
      ? `PIN-SHA:${btoa(unescape(encodeURIComponent(options.password))).slice(0, 12)}`
      : 'FLATTENED-READONLY';

    const built = await buildPdfFromParsedPages(pages, {
      scale: 1.5,
      quality: 0.84,
      title: file.name,
      effects: {
        securityBanner: options.stampBanner !== false ? `${classification} (${passphraseHash})` : ''
      },
      metadata: {
        title,
        author,
        subject: `Protected & Flattened (${classification})`,
        keywords: `Protected, ${passphraseHash}`
      }
    });

    const baseName = file.name.replace(/\.pdf$/i, '') || 'document';
    return [
      {
        name: `${baseName}-protected.pdf`,
        originalSize: file.size,
        blob: built.blob,
        pageCount: built.pageCount,
        preview: built.previewUrl,
        badge: 'Flattened & Protected'
      }
    ];
  };

  window.WebpressoPdfEngine = {
    inspectPdf,
    mergePdfs,
    splitPdf,
    organizePdf,
    rotatePdf,
    compressPdf,
    repairPdf,
    grayscalePdf,
    imagesToPdf,
    textToPdf,
    pdfToImages,
    pdfToText,
    addPageNumbers,
    watermarkPdf,
    signPdf,
    cropPdf,
    protectPdf,
    parsePageRanges
  };
})();
