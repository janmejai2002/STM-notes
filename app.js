/* global marked */
(function () {
  const NOTES = window.__NOTES__ || [];

  const tabNotes = document.getElementById('tab-notes');
  const tabCards = document.getElementById('tab-cards');
  const panelNotes = document.getElementById('panel-notes');
  const panelCards = document.getElementById('panel-cards');

  const nav = document.getElementById('nav');
  const noteFilter = document.getElementById('note-filter');
  const content = document.getElementById('content');
  const status = document.getElementById('status');
  const noteActions = document.getElementById('note-actions');
  const btnSpeak = document.getElementById('btn-speak');
  const ttsEngine = document.getElementById('tts-engine');
  const ttsVoice = document.getElementById('tts-voice');
  const ttsApiKey = document.getElementById('tts-api-key');
  const ttsSaveKey = document.getElementById('tts-save-key');
  const ttsClearKey = document.getElementById('tts-clear-key');
  const ttsKeyDetails = document.getElementById('tts-key-details');

  const LS_TTS_ENGINE = 'stm-tts-engine';
  const LS_GEMINI_KEY = 'stm-gemini-tts-key';
  const LS_GEMINI_VOICE = 'stm-gemini-voice';

  const TTS_CHUNK = 24000;

  function setSpeakingUi(on) {
    if (!btnSpeak) return;
    if (on) {
      btnSpeak.classList.add('is-speaking');
      btnSpeak.setAttribute('aria-pressed', 'true');
      btnSpeak.setAttribute('aria-label', 'Stop reading');
      btnSpeak.title = 'Stop reading';
    } else {
      btnSpeak.classList.remove('is-speaking');
      btnSpeak.setAttribute('aria-pressed', 'false');
      btnSpeak.setAttribute('aria-label', 'Read note aloud');
      btnSpeak.title = 'Read note aloud';
    }
  }

  function stopSpeak() {
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    } catch (e) {
      /* ignore */
    }
    if (window.STMGeminiTTS) window.STMGeminiTTS.stop();
    setSpeakingUi(false);
  }

  function loadTtsPrefs() {
    if (ttsEngine) {
      const e = localStorage.getItem(LS_TTS_ENGINE);
      if (e === 'browser' || e === 'gemini') ttsEngine.value = e;
    }
    if (ttsVoice) {
      const v = localStorage.getItem(LS_GEMINI_VOICE);
      if (v) ttsVoice.value = v;
    }
    if (ttsApiKey) {
      const k = localStorage.getItem(LS_GEMINI_KEY);
      ttsApiKey.placeholder = k ? '•••••••• (saved)' : 'Paste API key from AI Studio';
    }
  }

  function syncTtsVoiceDisabled() {
    if (ttsVoice && ttsEngine) ttsVoice.disabled = ttsEngine.value === 'browser';
  }

  if (ttsEngine) {
    ttsEngine.addEventListener('change', () => {
      try {
        localStorage.setItem(LS_TTS_ENGINE, ttsEngine.value);
      } catch (e) {
        /* ignore */
      }
      syncTtsVoiceDisabled();
    });
  }
  if (ttsVoice) {
    ttsVoice.addEventListener('change', () => {
      try {
        localStorage.setItem(LS_GEMINI_VOICE, ttsVoice.value);
      } catch (e) {
        /* ignore */
      }
    });
  }
  if (ttsSaveKey && ttsApiKey) {
    ttsSaveKey.addEventListener('click', () => {
      const v = ttsApiKey.value.trim();
      if (!v) return;
      try {
        localStorage.setItem(LS_GEMINI_KEY, v);
      } catch (e) {
        /* ignore */
      }
      ttsApiKey.value = '';
      ttsApiKey.placeholder = '•••••••• (saved)';
    });
  }
  if (ttsClearKey && ttsApiKey) {
    ttsClearKey.addEventListener('click', () => {
      try {
        localStorage.removeItem(LS_GEMINI_KEY);
      } catch (e) {
        /* ignore */
      }
      ttsApiKey.value = '';
      ttsApiKey.placeholder = 'Paste API key from AI Studio';
    });
  }
  loadTtsPrefs();
  syncTtsVoiceDisabled();

  function pickVoice(synth) {
    const voices = synth.getVoices();
    return (
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('en') && v.localService) ||
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('en')) ||
      voices[0]
    );
  }

  function chunkText(text) {
    const t = text.replace(/\s+/g, ' ').trim();
    if (t.length <= TTS_CHUNK) return [t];
    const parts = [];
    let rest = t;
    while (rest.length > 0) {
      if (rest.length <= TTS_CHUNK) {
        parts.push(rest);
        break;
      }
      let cut = rest.lastIndexOf('. ', TTS_CHUNK);
      if (cut < TTS_CHUNK / 2) cut = rest.indexOf(' ', TTS_CHUNK);
      if (cut < 1) cut = TTS_CHUNK;
      parts.push(rest.slice(0, cut + 1).trim());
      rest = rest.slice(cut + 1).trim();
    }
    return parts.filter(Boolean);
  }

  function speakArticleBrowser(rootEl) {
    const synth = window.speechSynthesis;
    if (!synth) {
      if (status) {
        status.textContent = 'This browser has no speech synthesis. Try Chrome, Edge, or Safari—or use Gemini TTS.';
        status.classList.add('error');
      }
      return;
    }

    stopSpeak();
    const plain = rootEl.innerText || '';
    const chunks = chunkText(plain);
    if (!chunks.length || !btnSpeak) return;

    setSpeakingUi(true);

    let utteranceStarted = false;
    const speakNext = (i) => {
      if (i >= chunks.length) {
        setSpeakingUi(false);
        return;
      }
      const u = new SpeechSynthesisUtterance(chunks[i]);
      u.lang = 'en-US';
      const voice = pickVoice(synth);
      if (voice) u.voice = voice;
      u.onend = () => speakNext(i + 1);
      u.onerror = () => setSpeakingUi(false);
      synth.speak(u);
    };

    const kick = () => {
      if (utteranceStarted) return;
      utteranceStarted = true;
      speakNext(0);
    };
    if (synth.getVoices().length) kick();
    else {
      synth.addEventListener('voiceschanged', kick, { once: true });
      setTimeout(kick, 900);
    }
  }

  async function speakArticleGemini(rootEl) {
    const plain = rootEl.innerText || '';
    if (!plain.trim() || !btnSpeak) return;

    const key = localStorage.getItem(LS_GEMINI_KEY);
    if (!key) {
      if (status) {
        status.textContent = 'Save a Gemini API key below (free from Google AI Studio), or switch to Browser mode.';
        status.classList.add('error');
      }
      if (ttsKeyDetails) ttsKeyDetails.open = true;
      return;
    }

    if (!window.STMGeminiTTS) {
      if (status) {
        status.textContent = 'Gemini TTS script failed to load. Check your connection.';
        status.classList.add('error');
      }
      return;
    }

    stopSpeak();
    setSpeakingUi(true);
    if (status) {
      status.classList.remove('error');
      status.textContent = 'Preparing read-aloud (one request for most notes)…';
    }

    const voice = (ttsVoice && ttsVoice.value) || 'Kore';
    let userError = false;
    try {
      await window.STMGeminiTTS.speakChunks({
        text: plain,
        apiKey: key,
        voiceName: voice,
        onProgress: (n, tot) => {
          if (!status) return;
          if (tot <= 1) status.textContent = 'Generating audio…';
          else status.textContent = 'Long note: part ' + n + '/' + tot + ' (short pause between parts)…';
        }
      });
    } catch (e) {
      const aborted = e && (e.name === 'AbortError' || /aborted/i.test(String(e.message)));
      if (!aborted) {
        userError = true;
        if (status) {
          status.textContent = 'Gemini TTS: ' + (e.message || 'Request failed');
          status.classList.add('error');
        }
      }
    } finally {
      setSpeakingUi(false);
      if (status && !userError) status.textContent = '';
    }
  }

  function toggleSpeak() {
    if (content.hidden || !content.innerText.trim()) return;
    if (btnSpeak && btnSpeak.classList.contains('is-speaking')) {
      stopSpeak();
      return;
    }
    const engine = (ttsEngine && ttsEngine.value) || 'browser';
    if (engine === 'gemini') {
      speakArticleGemini(content);
    } else {
      speakArticleBrowser(content);
    }
  }

  if (btnSpeak) {
    btnSpeak.addEventListener('click', toggleSpeak);
  }

  /**
   * Base URL for static assets (ends with /). Fixes GitHub Pages project URLs like
   * /repo-name (no trailing slash), where ./Images/x.png would otherwise resolve to /Images/x.png.
   */
  function getStaticSiteBase() {
    let path = window.location.pathname || '/';
    if (path.endsWith('/')) {
      return window.location.origin + path;
    }
    if (/\.html?$/i.test(path)) {
      return window.location.origin + path.replace(/[^/]+$/, '');
    }
    return window.location.origin + path + '/';
  }

  function resolveAppUrl(relative) {
    try {
      return new URL(relative, getStaticSiteBase()).href;
    } catch (e) {
      return relative;
    }
  }

  function rewriteRelativeMediaUrls(rootEl) {
    const base = getStaticSiteBase();
    rootEl.querySelectorAll('img[src], source[src]').forEach((el) => {
      const src = el.getAttribute('src');
      if (!src || /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//')) return;
      try {
        el.setAttribute('src', new URL(src, base).href);
      } catch (e) {
        /* ignore */
      }
    });
  }

  function setTab(which) {
    const isNotes = which === 'notes';
    tabNotes.setAttribute('aria-selected', isNotes ? 'true' : 'false');
    tabCards.setAttribute('aria-selected', isNotes ? 'false' : 'true');
    panelNotes.classList.toggle('hidden', !isNotes);
    panelCards.classList.toggle('hidden', isNotes);
    panelNotes.hidden = !isNotes;
    panelCards.hidden = isNotes;
    if (!isNotes) stopSpeak();
    try {
      const p = new URLSearchParams(location.search);
      if (isNotes) {
        p.delete('view');
      } else {
        p.set('view', 'flashcards');
      }
      const qs = p.toString();
      history.replaceState(null, '', qs ? '?' + qs : location.pathname);
    } catch (e) {
      /* ignore */
    }
  }

  tabNotes.addEventListener('click', () => setTab('notes'));
  tabCards.addEventListener('click', () => setTab('cards'));

  function humanTitle(file) {
    return file.replace(/\.md$/i, '').replace(/_/g, ' ');
  }

  NOTES.sort((a, b) => a.title.localeCompare(b.title));

  NOTES.forEach((note) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = note.title;
    btn.dataset.file = note.file;
    btn.dataset.filterText = (note.title + ' ' + note.file).toLowerCase();
    btn.addEventListener('click', () => loadNote(note.file, btn));
    nav.appendChild(btn);
  });

  if (noteFilter) {
    noteFilter.addEventListener('input', () => {
      const q = noteFilter.value.trim().toLowerCase();
      nav.querySelectorAll('button').forEach((btn) => {
        const match = !q || (btn.dataset.filterText && btn.dataset.filterText.includes(q));
        btn.classList.toggle('hidden-by-filter', !match);
      });
    });
  }

  async function loadNote(filename, btn) {
    stopSpeak();
    nav.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    status.textContent = 'Loading…';
    status.classList.remove('error');
    content.hidden = true;
    try {
      const res = await fetch(resolveAppUrl(filename));
      if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
      const md = await res.text();
      content.innerHTML = marked.parse(md, { mangle: false, headerIds: true });
      rewriteRelativeMediaUrls(content);
      if (!content.querySelector('h1')) {
        const t = document.createElement('h1');
        t.textContent = humanTitle(filename);
        content.insertBefore(t, content.firstChild);
      }
      status.textContent = '';
      content.hidden = false;
      if (noteActions) noteActions.hidden = false;
      if (window.speechSynthesis) window.speechSynthesis.getVoices();
      content.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      status.textContent = 'Could not load this file. Use the GitHub Pages URL (not file://).';
      status.classList.add('error');
      console.error(e);
      if (noteActions) noteActions.hidden = true;
    }
  }

  const params = new URLSearchParams(location.search);
  if (params.get('view') === 'flashcards') {
    setTab('cards');
  } else {
    const q = params.get('note');
    if (q) {
      const btn = [...nav.querySelectorAll('button')].find((b) => b.dataset.file === q);
      loadNote(q, btn || null);
    }
  }

  /* Flashcards */
  const fcTopic = document.getElementById('fc-topic');
  const fcShuffle = document.getElementById('fc-shuffle');
  const fcProgress = document.getElementById('fc-progress');
  const fcFront = document.getElementById('fc-front');
  const fcBack = document.getElementById('fc-back');
  const fcInner = document.getElementById('fc-inner');
  const fcFlipBtn = document.getElementById('fc-flip');
  const fcHint = document.getElementById('fc-hint');
  const fcPrev = document.getElementById('fc-prev');
  const fcNext = document.getElementById('fc-next');
  const fcStatus = document.getElementById('fc-status');

  let allCards = [];
  let deck = [];
  let idx = 0;
  let isFlipped = false;

  function shuffle(a) {
    const arr = a.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function buildDeck() {
    const topic = fcTopic ? fcTopic.value : '';
    deck = topic ? allCards.filter((c) => c.topic === topic) : allCards.slice();
    if (!deck.length) {
      fcStatus.textContent = topic ? 'No cards for this topic.' : 'No flashcards loaded.';
      fcFront.textContent = '';
      fcBack.textContent = '';
      fcProgress.textContent = '';
      fcPrev.disabled = true;
      fcNext.disabled = true;
      return;
    }
    idx = 0;
    isFlipped = false;
    fcInner.classList.remove('is-flipped');
    fcStatus.textContent = '';
    showCard();
  }

  function showCard() {
    if (!deck.length) return;
    const c = deck[idx];
    fcFront.textContent = c.front;
    fcBack.textContent = c.back;
    isFlipped = false;
    fcInner.classList.remove('is-flipped');
    fcProgress.textContent = 'Card ' + (idx + 1) + ' / ' + deck.length + ' · ' + c.topic;
    fcPrev.disabled = idx <= 0;
    fcNext.disabled = idx >= deck.length - 1;
  }

  fcFlipBtn.addEventListener('click', () => {
    if (!deck.length) return;
    isFlipped = !isFlipped;
    fcInner.classList.toggle('is-flipped', isFlipped);
    if (fcHint) {
      fcHint.textContent = isFlipped ? 'Tap to see question' : 'Tap to see answer';
    }
  });

  fcPrev.addEventListener('click', () => {
    if (idx > 0) {
      idx--;
      showCard();
    }
  });

  fcNext.addEventListener('click', () => {
    if (idx < deck.length - 1) {
      idx++;
      showCard();
    }
  });

  fcShuffle.addEventListener('click', () => {
    if (!deck.length) return;
    deck = shuffle(deck);
    idx = 0;
    showCard();
  });

  fcTopic.addEventListener('change', buildDeck);

  async function loadFlashcards() {
    fcStatus.textContent = 'Loading flashcards…';
    try {
      const res = await fetch(resolveAppUrl('flashcards.json'), { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
      allCards = await res.json();
      const topics = [...new Set(allCards.map((c) => c.topic))].sort((a, b) => a.localeCompare(b));
      fcTopic.innerHTML = '<option value="">All topics</option>';
      topics.forEach((t) => {
        const o = document.createElement('option');
        o.value = t;
        o.textContent = t;
        fcTopic.appendChild(o);
      });
      buildDeck();
      fcStatus.textContent = allCards.length + ' cards';
    } catch (e) {
      fcStatus.textContent = 'Add flashcards.json (run python build_index.py from your STM_Prep folder).';
      console.error(e);
    }
  }

  loadFlashcards();

  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    const THEME_KEY = 'stm-hub-theme';
    themeToggle.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      const next = cur === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (e) {
        /* ignore */
      }
      const meta = document.getElementById('theme-color-meta');
      if (meta) meta.content = next === 'light' ? '#f0f2f6' : '#12161f';
    });
  }
})();
