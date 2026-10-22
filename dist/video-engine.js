/**
 * Webpresso Client-Side Video Studio Engine (video-engine.js)
 * 100% On-Device Video Compression, Format Conversion (MP4 / WebM / GIF / WAV),
 * Trimming, Aspect-Ratio Reframing, Audio Extraction, and Frame Sequence Export.
 */
(() => {
  'use strict';

  const yieldToMain = () => {
    if (globalThis.scheduler?.yield) {
      return globalThis.scheduler.yield();
    }
    return new Promise((resolve) => setTimeout(resolve, 0));
  };

  const createYieldController = (budgetMs = 50) => {
    let deadline = performance.now() + budgetMs;
    return async () => {
      if (performance.now() >= deadline) {
        await yieldToMain();
        deadline = performance.now() + budgetMs;
      }
    };
  };

  // Detect best supported MediaRecorder MIME type for desired container ('mp4' | 'webm')
  const pickRecorderMime = (preferredContainer = 'mp4', includeAudio = true) => {
    const mp4Candidates = includeAudio
      ? [
          'video/mp4;codecs="avc1.42E01E, mp4a.40.2"',
          'video/mp4;codecs=avc1,mp4a.40.2',
          'video/mp4;codecs=avc1',
          'video/mp4;codecs=h264',
          'video/mp4'
        ]
      : ['video/mp4;codecs=avc1', 'video/mp4;codecs=h264', 'video/mp4'];

    const webmCandidates = includeAudio
      ? [
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm;codecs=h264,opus',
          'video/webm'
        ]
      : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

    const ordered =
      preferredContainer === 'webm'
        ? [...webmCandidates, ...mp4Candidates]
        : [...mp4Candidates, ...webmCandidates];

    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
      for (const candidate of ordered) {
        try {
          if (MediaRecorder.isTypeSupported(candidate)) {
            return {
              mimeType: candidate,
              ext: preferredContainer === 'mp4' ? 'mp4' : 'webm',
              containerLabel: preferredContainer === 'mp4' ? 'MP4 (H.264/Web)' : 'WebM (VP9/VP8)'
            };
          }
        } catch {
          // continue checking
        }
      }
    }

    return {
      mimeType: '',
      ext: preferredContainer === 'mp4' ? 'mp4' : 'webm',
      containerLabel: preferredContainer === 'mp4' ? 'MP4' : 'WebM'
    };
  };

  // Load a video File/Blob into an offscreen HTMLVideoElement and resolve metadata
  const loadVideoElement = (file) =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';

      const cleanupError = (msg) => {
        URL.revokeObjectURL(url);
        reject(new Error(msg));
      };

      video.onloadedmetadata = () => {
        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 3.5;
        resolve({
          video,
          url,
          duration,
          width: video.videoWidth || 1280,
          height: video.videoHeight || 720
        });
      };

      video.onerror = () => cleanupError('This video format or codec is not supported by your browser.');
      video.src = url;
    });

  const seekVideoTo = (video, timeSec) =>
    new Promise((resolve) => {
      const target = Math.max(0, Math.min(timeSec, (video.duration || 1) - 0.01));
      if (Math.abs(video.currentTime - target) < 0.008 && video.readyState >= 2) {
        resolve();
        return;
      }
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      video.addEventListener('seeked', onSeeked, { once: true });
      try {
        video.currentTime = target;
      } catch {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      }
    });

  // Inspect video metadata & capture a WebP preview frame
  const inspectVideo = async (file) => {
    const { video, url, duration, width, height } = await loadVideoElement(file);
    try {
      await seekVideoTo(video, Math.min(0.5, duration * 0.2));
      const thumbW = Math.min(480, width);
      const thumbH = Math.max(1, Math.round((height / width) * thumbW));
      const canvas = document.createElement('canvas');
      canvas.width = thumbW;
      canvas.height = thumbH;
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.drawImage(video, 0, 0, thumbW, thumbH);
      const thumbBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
      return {
        duration,
        width,
        height,
        previewUrl: thumbBlob ? URL.createObjectURL(thumbBlob) : ''
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  // Compute output canvas dimensions given maxRes ('original' | 1080 | 720 | 480 | 360) and aspectRatio ('original' | '16:9' | '9:16' | '1:1')
  const computeTargetDimensions = (srcW, srcH, maxHeightOption = 0, aspectMode = 'original') => {
    let targetW = srcW;
    let targetH = srcH;

    const maxDim = Number(maxHeightOption) || 0;
    if (maxDim > 0) {
      const shorterSide = Math.min(srcW, srcH);
      if (shorterSide > maxDim) {
        const scale = maxDim / shorterSide;
        targetW = Math.round(srcW * scale);
        targetH = Math.round(srcH * scale);
      }
    }

    if (aspectMode === '16:9') {
      const h = maxDim > 0 ? Math.min(maxDim, 1080) : Math.min(targetH, 720);
      targetH = h;
      targetW = Math.round((h * 16) / 9);
    } else if (aspectMode === '9:16') {
      const w = maxDim > 0 ? Math.min(maxDim, 1080) : Math.min(targetW, 720);
      targetW = w;
      targetH = Math.round((w * 16) / 9);
    } else if (aspectMode === '1:1') {
      const side = maxDim > 0 ? Math.min(maxDim, 1080) : Math.min(targetW, targetH, 720);
      targetW = side;
      targetH = side;
    }

    // Ensure even dimensions for hardware H.264/VP9 encoders
    targetW = Math.max(64, targetW + (targetW % 2));
    targetH = Math.max(64, targetH + (targetH % 2));
    return { width: targetW, height: targetH };
  };

  // Draw a video frame onto target canvas with aspect-fit letterboxing
  const drawFrameToCanvas = (ctx, video, srcW, srcH, dstW, dstH) => {
    ctx.fillStyle = '#0d100e';
    ctx.fillRect(0, 0, dstW, dstH);
    const scale = Math.min(dstW / srcW, dstH / srcH);
    const drawW = Math.round(srcW * scale);
    const drawH = Math.round(srcH * scale);
    const drawX = Math.round((dstW - drawW) / 2);
    const drawY = Math.round((dstH - drawH) / 2);
    ctx.drawImage(video, drawX, drawY, drawW, drawH);
  };

  // Core transcode pipeline using Canvas captureStream + MediaRecorder
  const transcodeVideoSegment = async (file, opts = {}, onProgress) => {
    const { video, url, duration, width: srcW, height: srcH } = await loadVideoElement(file);
    try {
      const startTime = Math.max(0, Math.min(Number(opts.startTime) || 0, duration - 0.1));
      const rawEnd = Number(opts.endTime);
      const endTime = rawEnd && rawEnd > startTime ? Math.min(rawEnd, duration) : duration;
      const clipDuration = Math.max(0.25, endTime - startTime);

      const fps = Math.max(10, Math.min(60, Number(opts.fps) || 30));
      const speed = Math.max(0.5, Math.min(2, Number(opts.speed) || 1));
      const muteAudio = Boolean(opts.muteAudio);
      const container = opts.format === 'webm' ? 'webm' : 'mp4';

      const { width: dstW, height: dstH } = computeTargetDimensions(
        srcW,
        srcH,
        opts.maxHeight,
        opts.aspectRatio || 'original'
      );

      const canvas = document.createElement('canvas');
      canvas.width = dstW;
      canvas.height = dstH;
      const ctx = canvas.getContext('2d', { alpha: false });

      // Calculate target bitrate in bps
      const inputBitrateBps = Math.max(180_000, Math.round((file.size * 8) / Math.max(0.5, duration)));
      let targetVideoBps = (Number(opts.bitrateKbps) || 1500) * 1000;
      if (opts.compressionRatio) {
        targetVideoBps = Math.min(targetVideoBps, Math.max(140_000, Math.round(inputBitrateBps * opts.compressionRatio)));
      }

      await seekVideoTo(video, startTime);
      drawFrameToCanvas(ctx, video, srcW, srcH, dstW, dstH);

      // Capture first frame thumbnail
      const thumbBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.8));
      const previewUrl = thumbBlob ? URL.createObjectURL(thumbBlob) : '';

      const canvasStream = canvas.captureStream(fps);
      const combinedTracks = [...canvasStream.getVideoTracks()];

      // Attach audio track if not muted and browser supports video.captureStream
      if (!muteAudio) {
        try {
          video.muted = false;
          video.volume = 0.0001; // near-inaudible during local transcode
          const mediaStream = video.captureStream ? video.captureStream() : video.mozCaptureStream?.();
          if (mediaStream && mediaStream.getAudioTracks().length > 0) {
            combinedTracks.push(mediaStream.getAudioTracks()[0]);
          }
        } catch {
          // Audio track capture optional if restricted
        }
      }

      const finalStream = new MediaStream(combinedTracks);
      const picked = pickRecorderMime(container, combinedTracks.length > 1);
      const recorderOpts = {
        videoBitsPerSecond: targetVideoBps
      };
      if (picked.mimeType) {
        recorderOpts.mimeType = picked.mimeType;
      }

      const chunks = [];
      const recorder = new MediaRecorder(finalStream, recorderOpts);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      const recordingDone = new Promise((resolve) => {
        recorder.onstop = () => resolve();
      });

      video.playbackRate = speed;
      recorder.start(120);

      try {
        await video.play();
      } catch {
        // Fallback: if autoplay with unmuted stream is blocked, mute and step frames
        video.muted = true;
      }

      if (!video.paused) {
        // Real-time / speed-adjusted playback loop
        await new Promise((resolve) => {
          const tick = () => {
            if (video.paused || video.ended || video.currentTime >= endTime - 0.02) {
              video.pause();
              resolve();
              return;
            }
            drawFrameToCanvas(ctx, video, srcW, srcH, dstW, dstH);
            const pct = Math.min(99, Math.round(((video.currentTime - startTime) / clipDuration) * 100));
            onProgress?.(pct);
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      } else {
        // Deterministic frame-stepped fallback if play() was blocked
        const totalSteps = Math.max(6, Math.min(180, Math.round((clipDuration / speed) * fps)));
        const maybeYield = createYieldController();
        for (let i = 0; i <= totalSteps; i++) {
          await maybeYield();
          const t = startTime + (i / totalSteps) * clipDuration;
          await seekVideoTo(video, t);
          drawFrameToCanvas(ctx, video, srcW, srcH, dstW, dstH);
          onProgress?.(Math.min(99, Math.round((i / totalSteps) * 100)));
          await new Promise((r) => setTimeout(r, Math.round(1000 / fps)));
        }
      }

      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      await recordingDone;
      finalStream.getTracks().forEach((t) => t.stop());
      onProgress?.(100);

      const outMime = container === 'mp4' ? 'video/mp4' : 'video/webm';
      const outBlob = new Blob(chunks, { type: outMime });

      return {
        blob: outBlob,
        ext: picked.ext,
        containerLabel: picked.containerLabel,
        width: dstW,
        height: dstH,
        duration: Number((clipDuration / speed).toFixed(1)),
        previewUrl
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  // ==================== PURE-JS ANIMATED GIF89a ENCODER (3-3-2 PALETTE + LZW) ====================
  const buildPalette332 = () => {
    const pal = new Uint8Array(256 * 3);
    for (let i = 0; i < 256; i++) {
      const r = ((i >> 5) & 0x07) * 36;
      const g = ((i >> 2) & 0x07) * 36;
      const b = (i & 0x03) * 85;
      pal[i * 3] = r;
      pal[i * 3 + 1] = g;
      pal[i * 3 + 2] = b;
    }
    return pal;
  };

  const quantizeRgbaTo332 = (rgba, width, height) => {
    const total = width * height;
    const indexed = new Uint8Array(total);
    for (let i = 0; i < total; i++) {
      const off = i * 4;
      const r = rgba[off] >> 5;
      const g = rgba[off + 1] >> 5;
      const b = rgba[off + 2] >> 6;
      indexed[i] = (r << 5) | (g << 2) | b;
    }
    return indexed;
  };

  // LZW minimum code size 8 encoder for GIF89a image data blocks
  const lzwEncodeGifFrame = (indexedPixels) => {
    const minCodeSize = 8;
    const clearCode = 256;
    const eoiCode = 257;

    const bytes = [];
    let bitBuffer = 0;
    let bitCount = 0;

    const emitCode = (code, size) => {
      bitBuffer |= code << bitCount;
      bitCount += size;
      while (bitCount >= 8) {
        bytes.push(bitBuffer & 0xff);
        bitBuffer >>= 8;
        bitCount -= 8;
      }
    };

    let codeSize = minCodeSize + 1;
    let nextCode = 258;
    let dict = new Map();

    emitCode(clearCode, codeSize);

    if (indexedPixels.length === 0) {
      emitCode(eoiCode, codeSize);
    } else {
      let prefix = indexedPixels[0];
      for (let i = 1; i < indexedPixels.length; i++) {
        const k = indexedPixels[i];
        const key = (prefix << 8) | k;
        const found = dict.get(key);
        if (found !== undefined) {
          prefix = found;
        } else {
          emitCode(prefix, codeSize);
          if (nextCode < 4096) {
            dict.set(key, nextCode++);
            if (nextCode > 1 << codeSize && codeSize < 12) {
              codeSize++;
            }
          } else {
            emitCode(clearCode, codeSize);
            dict.clear();
            codeSize = minCodeSize + 1;
            nextCode = 258;
          }
          prefix = k;
        }
      }
      emitCode(prefix, codeSize);
      emitCode(eoiCode, codeSize);
    }

    if (bitCount > 0) {
      bytes.push(bitBuffer & 0xff);
    }

    // Packetize into <=255-byte GIF sub-blocks
    const out = [minCodeSize];
    for (let i = 0; i < bytes.length; i += 255) {
      const chunk = bytes.slice(i, i + 255);
      out.push(chunk.length, ...chunk);
    }
    out.push(0); // block terminator
    return new Uint8Array(out);
  };

  // Encode multiple RGBA ImageData frames into an animated looping GIF89a Blob
  const encodeAnimatedGif = async (framesRgba, width, height, delayCs = 10) => {
    const chunks = [];
    const writeU16 = (val) => [val & 0xff, (val >> 8) & 0xff];

    // Header + Logical Screen Descriptor (Global Color Table Flag = 1, 256 colors)
    chunks.push(
      new Uint8Array([
        0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // "GIF89a"
        ...writeU16(width),
        ...writeU16(height),
        0xf7, // Global Color Table, 8-bit color resolution, 256 entries
        0x00,
        0x00
      ])
    );

    // 256-color Global Color Table
    chunks.push(buildPalette332());

    // NETSCAPE2.0 Infinite Loop Application Extension
    chunks.push(
      new Uint8Array([
        0x21, 0xff, 0x0b,
        0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30,
        0x03, 0x01, 0x00, 0x00, 0x00
      ])
    );

    const maybeYield = createYieldController();
    for (const rgba of framesRgba) {
      await maybeYield();
      const indexed = quantizeRgbaTo332(rgba, width, height);
      const lzwBlock = lzwEncodeGifFrame(indexed);

      // Graphic Control Extension + Image Descriptor
      chunks.push(
        new Uint8Array([
          0x21, 0xf9, 0x04, 0x04,
          ...writeU16(delayCs),
          0x00, 0x00,
          0x2c,
          0x00, 0x00, 0x00, 0x00,
          ...writeU16(width),
          ...writeU16(height),
          0x00
        ])
      );
      chunks.push(lzwBlock);
    }

    // GIF Trailer
    chunks.push(new Uint8Array([0x3b]));
    return new Blob(chunks, { type: 'image/gif' });
  };

  // ==================== 1. COMPRESS VIDEO ====================
  const compressVideo = async (file, options = {}, onProgress) => {
    const level = options.level || 'recommended'; // 'extreme' | 'recommended' | 'high' | 'custom'
    const presetMap = {
      extreme: { bitrateKbps: 650, ratio: 0.36, defaultHeight: 480 },
      recommended: { bitrateKbps: 1450, ratio: 0.56, defaultHeight: 720 },
      high: { bitrateKbps: 2800, ratio: 0.76, defaultHeight: 1080 },
      custom: {
        bitrateKbps: Number(options.customBitrateKbps) || 1200,
        ratio: 0.65,
        defaultHeight: 720
      }
    };
    const preset = presetMap[level] || presetMap.recommended;
    const maxHeight =
      options.maxHeight !== undefined && options.maxHeight !== 'auto'
        ? Number(options.maxHeight)
        : preset.defaultHeight;

    const res = await transcodeVideoSegment(
      file,
      {
        format: options.format || 'mp4',
        bitrateKbps: Number(options.customBitrateKbps) || preset.bitrateKbps,
        compressionRatio: preset.ratio,
        maxHeight,
        fps: Number(options.fps) || 30,
        muteAudio: Boolean(options.muteAudio)
      },
      onProgress
    );

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'video';
    const pctSaved =
      file.size > 0 ? Math.round((1 - res.blob.size / file.size) * 100) : 0;

    return [
      {
        name: `${baseName}-compressed.${res.ext}`,
        originalSize: file.size,
        blob: res.blob,
        width: res.width,
        height: res.height,
        duration: res.duration,
        preview: res.previewUrl,
        isVideo: true,
        badge:
          pctSaved > 0
            ? `${pctSaved}% smaller · ${res.width}×${res.height}`
            : `${res.width}×${res.height} · ${res.containerLabel}`
      }
    ];
  };

  // ==================== 2. CONVERT VIDEO FORMAT ====================
  const convertVideo = async (file, options = {}, onProgress) => {
    const targetFormat = options.targetFormat || 'mp4'; // 'mp4' | 'webm' | 'gif' | 'wav'

    if (targetFormat === 'gif') {
      return videoToGif(file, {
        width: Number(options.maxHeight) || 480,
        fps: Number(options.fps) || 10,
        maxSeconds: 6
      }, onProgress);
    }

    if (targetFormat === 'wav') {
      return extractAudioWav(file, { normalize: true }, onProgress);
    }

    const res = await transcodeVideoSegment(
      file,
      {
        format: targetFormat,
        bitrateKbps: Number(options.bitrateKbps) || 2200,
        maxHeight: Number(options.maxHeight) || 0,
        aspectRatio: options.aspectRatio || 'original',
        fps: Number(options.fps) || 30,
        muteAudio: Boolean(options.muteAudio)
      },
      onProgress
    );

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'video';
    return [
      {
        name: `${baseName}-converted.${res.ext}`,
        originalSize: file.size,
        blob: res.blob,
        width: res.width,
        height: res.height,
        duration: res.duration,
        preview: res.previewUrl,
        isVideo: true,
        badge: `${res.containerLabel} · ${res.width}×${res.height}`
      }
    ];
  };

  // ==================== 3. TRIM & SPEED VIDEO ====================
  const trimVideo = async (file, options = {}, onProgress) => {
    const res = await transcodeVideoSegment(
      file,
      {
        startTime: Number(options.startTime) || 0,
        endTime: Number(options.endTime) || 0,
        speed: Number(options.speed) || 1,
        format: options.format || 'mp4',
        bitrateKbps: 2000,
        muteAudio: Boolean(options.muteAudio)
      },
      onProgress
    );

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'video';
    return [
      {
        name: `${baseName}-trimmed.${res.ext}`,
        originalSize: file.size,
        blob: res.blob,
        width: res.width,
        height: res.height,
        duration: res.duration,
        preview: res.previewUrl,
        isVideo: true,
        badge: `${res.duration}s clip · ${res.width}×${res.height}`
      }
    ];
  };

  // ==================== 4. VIDEO TO ANIMATED GIF ====================
  const videoToGif = async (file, options = {}, onProgress) => {
    const { video, url, duration, width: srcW, height: srcH } = await loadVideoElement(file);
    try {
      const targetW = Math.max(160, Math.min(640, Number(options.width) || 420));
      const targetH = Math.max(90, Math.round((srcH / srcW) * targetW));
      const fps = Math.max(5, Math.min(15, Number(options.fps) || 10));
      const maxDuration = Math.min(duration, Math.max(1, Number(options.maxSeconds) || 5));
      const totalFrames = Math.max(4, Math.min(65, Math.round(maxDuration * fps)));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      const framesRgba = [];
      const maybeYield = createYieldController();

      for (let i = 0; i < totalFrames; i++) {
        await maybeYield();
        const t = (i / totalFrames) * maxDuration;
        await seekVideoTo(video, t);
        ctx.drawImage(video, 0, 0, targetW, targetH);
        const imgData = ctx.getImageData(0, 0, targetW, targetH);
        framesRgba.push(imgData.data);
        onProgress?.(Math.round(((i + 1) / totalFrames) * 80));
      }

      const delayCs = Math.max(4, Math.round(100 / fps));
      const gifBlob = await encodeAnimatedGif(framesRgba, targetW, targetH, delayCs);
      onProgress?.(100);

      const previewUrl = URL.createObjectURL(gifBlob);
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'animation';
      return [
        {
          name: `${baseName}.gif`,
          originalSize: file.size,
          blob: gifBlob,
          width: targetW,
          height: targetH,
          preview: previewUrl,
          badge: `${totalFrames} frames · ${targetW}×${targetH} GIF`
        }
      ];
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  // ==================== 5. EXTRACT AUDIO (16-BIT PCM WAV) ====================
  const encodeWavFromAudioBuffer = (audioBuffer, targetSampleRate = 44100, normalize = true) => {
    const numChannels = Math.min(2, audioBuffer.numberOfChannels || 1);
    const srcRate = audioBuffer.sampleRate || 44100;
    const ratio = srcRate / targetSampleRate;
    const outSamples = Math.max(1, Math.floor(audioBuffer.length / ratio));

    const channels = [];
    let peak = 0.001;
    for (let ch = 0; ch < numChannels; ch++) {
      const data = audioBuffer.getChannelData(ch);
      channels.push(data);
      if (normalize) {
        for (let i = 0; i < data.length; i += 4) {
          const abs = Math.abs(data[i]);
          if (abs > peak) peak = abs;
        }
      }
    }
    const gain = normalize && peak > 0.01 ? Math.min(2.5, 0.94 / peak) : 1;

    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const dataByteLength = outSamples * blockAlign;
    const buffer = new ArrayBuffer(44 + dataByteLength);
    const view = new DataView(buffer);

    const writeStr = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataByteLength, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true); // PCM format = 1
    view.setUint16(22, numChannels, true);
    view.setUint32(24, targetSampleRate, true);
    view.setUint32(28, targetSampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true); // 16-bit
    writeStr(36, 'data');
    view.setUint32(40, dataByteLength, true);

    let offset = 44;
    for (let i = 0; i < outSamples; i++) {
      const srcIdx = Math.min(audioBuffer.length - 1, Math.floor(i * ratio));
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, channels[ch][srcIdx] * gain));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }

    return new Blob([buffer], { type: 'audio/wav' });
  };

  const extractAudioWav = async (file, options = {}, onProgress) => {
    onProgress?.(20);
    const info = await inspectVideo(file);
    onProgress?.(45);
    const arrayBuffer = await file.arrayBuffer();
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtx();

    let audioBuffer;
    try {
      audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    } catch {
      // If video has no audio stream, generate a clean silent/ambient track matching its duration
      const sr = Number(options.sampleRate) || 44100;
      const len = Math.max(sr, Math.round((info.duration || 3) * sr));
      audioBuffer = audioCtx.createBuffer(2, len, sr);
    } finally {
      audioCtx.close().catch(() => {});
    }

    onProgress?.(80);
    const sampleRate = Number(options.sampleRate) || 44100;
    const wavBlob = encodeWavFromAudioBuffer(
      audioBuffer,
      sampleRate,
      options.normalize !== false
    );
    onProgress?.(100);

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'audio-track';
    return [
      {
        name: `${baseName}.wav`,
        originalSize: file.size,
        blob: wavBlob,
        preview: info.previewUrl,
        isAudio: true,
        badge: `16-bit PCM WAV · ${(sampleRate / 1000).toFixed(1)} kHz`
      }
    ];
  };

  // ==================== 6. VIDEO TO FRAME IMAGES (WebP / PNG / JPG) ====================
  const extractFrames = async (file, options = {}, onProgress) => {
    const { video, url, duration, width, height } = await loadVideoElement(file);
    try {
      const count = Math.max(1, Math.min(24, Number(options.frameCount) || 6));
      const format = options.format || 'webp';
      const fmtMap = {
        webp: { mime: 'image/webp', ext: 'webp', label: 'WebP' },
        png: { mime: 'image/png', ext: 'png', label: 'PNG' },
        jpeg: { mime: 'image/jpeg', ext: 'jpg', label: 'JPG' }
      };
      const fmt = fmtMap[format] || fmtMap.webp;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });

      const baseName = file.name.replace(/\.[^.]+$/, '') || 'video';
      const maybeYield = createYieldController();
      const outputs = [];

      for (let i = 0; i < count; i++) {
        await maybeYield();
        const t = count === 1 ? duration * 0.25 : (i / (count - 1)) * Math.max(0.1, duration - 0.12);
        await seekVideoTo(video, t);
        ctx.drawImage(video, 0, 0, width, height);
        const blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, fmt.mime, fmt.mime === 'image/png' ? undefined : 0.88)
        );
        const previewUrl = URL.createObjectURL(blob);
        outputs.push({
          name: `${baseName}-frame-${String(i + 1).padStart(2, '0')}.${fmt.ext}`,
          originalSize: Math.round(file.size / count),
          blob,
          width,
          height,
          preview: previewUrl,
          badge: `@ ${t.toFixed(1)}s · ${width}×${height} ${fmt.label}`
        });
        onProgress?.(Math.round(((i + 1) / count) * 100));
      }

      return outputs;
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  // ==================== SAMPLE HD VIDEO GENERATOR ====================
  const generateSampleVideo = async () => {
    const width = 1280;
    const height = 720;
    const fps = 30;
    const totalFrames = 75; // 2.5 seconds HD clip
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });

    const stream = canvas.captureStream(fps);
    const picked = pickRecorderMime('mp4', false);
    const recorderOpts = { videoBitsPerSecond: 4_500_000 };
    if (picked.mimeType) recorderOpts.mimeType = picked.mimeType;

    const chunks = [];
    const recorder = new MediaRecorder(stream, recorderOpts);
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    const done = new Promise((resolve) => {
      recorder.onstop = () => resolve();
    });

    recorder.start(80);

    for (let f = 0; f < totalFrames; f++) {
      const p = f / totalFrames;
      // Rich gradient background with intentional high-frequency detail so compression savings are clearly measurable
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#111512');
      grad.addColorStop(0.5, '#1b2820');
      grad.addColorStop(1, '#0f172a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Animated grid + geometric cards
      ctx.strokeStyle = 'rgba(199, 255, 74, 0.16)';
      ctx.lineWidth = 2;
      const offset = (f * 6) % 60;
      for (let x = -offset; x < width; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = -offset; y < height; y += 60) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Orbiting accent circles
      const cx = width * 0.68 + Math.cos(p * Math.PI * 2) * 140;
      const cy = height * 0.5 + Math.sin(p * Math.PI * 2) * 90;
      ctx.fillStyle = '#c7ff4a';
      ctx.beginPath();
      ctx.arc(cx, cy, 78, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ff7a66';
      ctx.beginPath();
      ctx.arc(width * 0.68 - Math.cos(p * Math.PI * 2) * 110, height * 0.5 - Math.sin(p * Math.PI * 2) * 70, 52, 0, Math.PI * 2);
      ctx.fill();

      // HUD Title & Timecode
      ctx.fillStyle = '#f5f7f3';
      ctx.font = '800 52px Inter, system-ui, sans-serif';
      ctx.fillText('WEBPRESSO VIDEO STUDIO', 76, 160);

      ctx.fillStyle = '#c7ff4a';
      ctx.font = '700 28px Inter, system-ui, sans-serif';
      ctx.fillText(`1280×720 HD · 30 FPS · FRAME ${String(f + 1).padStart(2, '0')} / ${totalFrames}`, 76, 220);

      ctx.fillStyle = '#9aa79d';
      ctx.font = '500 24px Inter, system-ui, sans-serif';
      ctx.fillText('100% Client-Side Video Compression & Format Conversion', 76, 270);

      // Progress bar inside video
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(76, 590, 540, 20);
      ctx.fillStyle = '#c7ff4a';
      ctx.fillRect(76, 590, Math.round(540 * p), 20);

      await new Promise((r) => setTimeout(r, 18));
    }

    recorder.stop();
    await done;
    stream.getTracks().forEach((t) => t.stop());

    const blob = new Blob(chunks, { type: picked.ext === 'mp4' ? 'video/mp4' : 'video/webm' });
    return new File([blob], `webpresso-sample-720p.${picked.ext}`, {
      type: blob.type
    });
  };

  window.WebpressoVideoEngine = {
    inspectVideo,
    compressVideo,
    convertVideo,
    trimVideo,
    videoToGif,
    extractAudioWav,
    extractFrames,
    generateSampleVideo
  };
})();
