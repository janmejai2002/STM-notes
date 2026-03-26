/* Gemini API text-to-speech — expressive readout (preview TTS models). API key never sent except to Google. */
(function (global) {
  var MODEL_PRIMARY = 'gemini-2.5-flash-preview-tts';
  var MODEL_FALLBACK = 'gemini-2.5-pro-preview-tts';
  var SAMPLE_RATE = 24000;
  /** One chunk ≈ one API call. Gemini TTS allows a large context (~32k tokens); ~20k chars keeps typical notes in a single request. */
  var CHUNK_MAX = 20000;
  /** Tiny gap only when a very long note needs multiple requests (avoid bursty back-to-back calls). */
  var INTER_CHUNK_MS = 250;
  /** On 429, retry sparingly with long waits—do not hammer the API. */
  var RETRY_MAX = 3;

  var abortCtrl = null;
  var activeSources = [];

  function endpointFor(model) {
    return (
      'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent'
    );
  }

  function stop() {
    if (abortCtrl) {
      try {
        abortCtrl.abort();
      } catch (e) {}
      abortCtrl = null;
    }
    for (var i = 0; i < activeSources.length; i++) {
      try {
        activeSources[i].stop(0);
      } catch (e) {}
    }
    activeSources.length = 0;
  }

  function wrapChunk(text) {
    return (
      'Read verbatim in a warm, enthusiastic teaching voice. No summary or filler—only the content below (headings as spoken phrases):\n\n' +
      String(text).trim()
    );
  }

  function decodePcmBase64ToBuffer(audioCtx, base64) {
    var binary = atob(base64);
    var len = binary.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    var sampleCount = (bytes.byteLength / 2) | 0;
    var int16 = new Int16Array(bytes.buffer, bytes.byteOffset, sampleCount);
    var buffer = audioCtx.createBuffer(1, int16.length, SAMPLE_RATE);
    var ch = buffer.getChannelData(0);
    for (var j = 0; j < int16.length; j++) ch[j] = int16[j] / 32768.0;
    return buffer;
  }

  function playBuffer(audioCtx, buffer) {
    return new Promise(function (resolve) {
      var src = audioCtx.createBufferSource();
      src.buffer = buffer;
      src.connect(audioCtx.destination);
      activeSources.push(src);
      src.onended = function () {
        var ix = activeSources.indexOf(src);
        if (ix >= 0) activeSources.splice(ix, 1);
        resolve();
      };
      try {
        src.start(0);
      } catch (e) {
        var iy = activeSources.indexOf(src);
        if (iy >= 0) activeSources.splice(iy, 1);
        resolve();
      }
    });
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function isRateLimitedError(res, data, errMsg) {
    if (res && res.status === 429) return true;
    var m = (data && data.error && data.error.message) || errMsg || '';
    return /resource has been exhausted|resource_exhausted|too many requests|429|quota/i.test(String(m));
  }

  function chunkText(text) {
    var t = String(text)
      .replace(/\s+/g, ' ')
      .trim();
    if (!t) return [];
    if (t.length <= CHUNK_MAX) return [t];
    var parts = [];
    var rest = t;
    while (rest.length > 0) {
      if (rest.length <= CHUNK_MAX) {
        parts.push(rest);
        break;
      }
      var cut = rest.lastIndexOf('. ', CHUNK_MAX);
      if (cut < CHUNK_MAX / 2) cut = rest.indexOf(' ', CHUNK_MAX);
      if (cut < 1) cut = CHUNK_MAX;
      parts.push(rest.slice(0, cut + 1).trim());
      rest = rest.slice(cut + 1).trim();
    }
    return parts.filter(Boolean);
  }

  function synthesizeOne(apiKey, model, voiceName, text, signal) {
    return fetch(endpointFor(model), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: wrapChunk(text) }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceName }
            }
          }
        }
      }),
      signal: signal
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var msg = (data.error && data.error.message) || res.statusText || 'Request failed';
          var err = new Error(msg);
          err.status = res.status;
          err.details = data;
          throw err;
        }
        var b64 =
          data.candidates &&
          data.candidates[0] &&
          data.candidates[0].content &&
          data.candidates[0].content.parts &&
          data.candidates[0].content.parts[0] &&
          data.candidates[0].content.parts[0].inlineData &&
          data.candidates[0].content.parts[0].inlineData.data;
        if (!b64)
          throw new Error('No audio in response. Check that TTS is enabled for your API key (see AI Studio).');
        return b64;
      });
    });
  }

  function synthesizeOneWithRetry(apiKey, model, voiceName, text, signal, attempt) {
    attempt = attempt || 1;
    return synthesizeOne(apiKey, model, voiceName, text, signal).catch(function (err) {
      if (signal && signal.aborted) throw err;
      var resLike = { status: err.status };
      var limited = err.status === 429 || isRateLimitedError(resLike, err.details, err.message);
      if (!limited || attempt >= RETRY_MAX) {
        if (limited) {
          err.message =
            'Rate limited—wait several minutes, use Browser read-aloud, or try when quota resets. ' + (err.message || '');
        }
        throw err;
      }
      var backoff = Math.min(120000, 12000 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 2000));
      return delay(backoff).then(function () {
        return synthesizeOneWithRetry(apiKey, model, voiceName, text, signal, attempt + 1);
      });
    });
  }

  /**
   * @param {{ text: string, apiKey: string, voiceName?: string, onProgress?: (i:number,total:number)=>void }} opts
   */
  function speakChunks(opts) {
    stop();
    var text = opts.text;
    var apiKey = opts.apiKey;
    var voiceName = opts.voiceName || 'Kore';
    var onProgress = opts.onProgress;

    var chunks = chunkText(text);
    if (!chunks.length) return Promise.resolve();

    abortCtrl = new AbortController();
    var signal = abortCtrl.signal;

    var audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
    var modelUsed = MODEL_PRIMARY;

    function runWithModel(model) {
      modelUsed = model;
      var chain = Promise.resolve();
      for (var i = 0; i < chunks.length; i++) {
        (function (idx) {
          chain = chain.then(function () {
            if (signal.aborted) return;
            if (onProgress) onProgress(idx + 1, chunks.length);
            if (idx > 0 && INTER_CHUNK_MS > 0) return delay(INTER_CHUNK_MS);
          }).then(function () {
            if (signal.aborted) return;
            return synthesizeOneWithRetry(apiKey, model, voiceName, chunks[idx], signal).then(function (b64) {
              if (signal.aborted) return;
              var buffer = decodePcmBase64ToBuffer(audioCtx, b64);
              return playBuffer(audioCtx, buffer);
            });
          });
        })(i);
      }
      return chain;
    }

    return (audioCtx.state === 'suspended' ? audioCtx.resume() : Promise.resolve())
      .then(function () {
        return runWithModel(MODEL_PRIMARY);
      })
      .catch(function (err) {
        if (signal.aborted) return;
        var tryFallback =
          err.status === 404 ||
          (err.message && /not found|NOT_FOUND|unsupported/i.test(err.message));
        if (tryFallback && modelUsed === MODEL_PRIMARY) {
          return runWithModel(MODEL_FALLBACK);
        }
        throw err;
      })
      .finally(function () {
        stop();
        try {
          audioCtx.close();
        } catch (e) {}
      });
  }

  global.STMGeminiTTS = {
    stop: stop,
    speakChunks: speakChunks,
    chunkTextPreview: chunkText
  };
})(typeof window !== 'undefined' ? window : globalThis);
