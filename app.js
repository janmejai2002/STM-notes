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
    if (window.STMHighlights) {
      if (isNotes) window.STMHighlights.resumeNotesTab();
      else window.STMHighlights.pauseForFlashcards();
    }
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
    if (window.STMHighlights) window.STMHighlights.onNoteClosed();
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
      if (window.STMHighlights) window.STMHighlights.afterNoteLoad(content, filename);
      content.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      status.textContent = 'Could not load this file. Use the GitHub Pages URL (not file://).';
      status.classList.add('error');
      console.error(e);
      if (window.STMHighlights) window.STMHighlights.onNoteClosed();
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
})();
