/* STM Study Hub — private highlights (localStorage only, never uploaded) */
(function () {
  var THEME_KEY = 'stm-hub-theme';

  function getStorageScope() {
    var p = (location.pathname || '/').replace(/\\/g, '/');
    var parts = p.split('/').filter(Boolean);
    if (parts.length && /\.html?$/i.test(parts[parts.length - 1])) parts.pop();
    var last = parts.length ? parts[parts.length - 1] : '';
    return last && last !== 'index.html' ? last : 'stm-notes';
  }

  var LS_KEY = 'stm-study-hub:' + getStorageScope() + ':highlights:v1';

  function uid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'hl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  }

  function loadList() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveList(list) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('Could not save highlights', e);
    }
  }

  function getStaticSiteBase() {
    var path = location.pathname || '/';
    if (path.endsWith('/')) return location.origin + path;
    if (/\.html?$/i.test(path)) return location.origin + path.replace(/[^/]+$/, '');
    return location.origin + path + '/';
  }

  function resolveAppUrl(rel) {
    try {
      return new URL(rel, getStaticSiteBase()).href;
    } catch (e) {
      return rel;
    }
  }

  function normalizeWs(s) {
    return String(s).replace(/\s+/g, ' ').trim();
  }

  function getRangeForTextOffsets(root, start, end) {
    var range = document.createRange();
    var acc = 0;
    var startSet = false;

    function visit(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        var text = node;
        var len = text.length;
        if (!startSet && acc + len > start) {
          var off = Math.max(0, start - acc);
          if (off > len) return false;
          range.setStart(text, off);
          startSet = true;
        }
        if (startSet && acc + len >= end) {
          var endOff = Math.min(len, end - acc);
          range.setEnd(text, endOff);
          return true;
        }
        acc += len;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        var tag = node.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE') return false;
        for (var i = 0; i < node.childNodes.length; i++) {
          if (visit(node.childNodes[i])) return true;
        }
      }
      return false;
    }

    visit(root);
    if (!startSet || range.collapsed) return null;
    return range;
  }

  function surroundRangeWithMark(range, hlId) {
    if (!range || range.collapsed) return false;
    var mark = document.createElement('mark');
    mark.className = 'user-highlight';
    mark.setAttribute('data-hl-id', hlId);
    mark.id = 'hl-' + hlId;
    try {
      range.surroundContents(mark);
      return true;
    } catch (e) {
      try {
        var frag = range.extractContents();
        mark.appendChild(frag);
        range.insertNode(mark);
        return true;
      } catch (e2) {
        console.warn('Could not wrap highlight', e2);
        return false;
      }
    }
  }

  function applyOneHighlight(root, h) {
    var full = root.textContent;
    var start = h.start;
    var end = h.end;
    var text = h.text || '';

    if (text && full.slice(start, end) !== text) {
      if (normalizeWs(full.slice(start, end)) !== normalizeWs(text)) {
        var idx = full.indexOf(text);
        if (idx === -1) idx = full.indexOf(text.trim());
        if (idx !== -1) {
          start = idx;
          end = idx + text.length;
        } else {
          return false;
        }
      }
    }

    if (start < 0 || end > full.length || start >= end) return false;

    var range = getRangeForTextOffsets(root, start, end);
    if (!range) return false;

    return surroundRangeWithMark(range, h.id);
  }

  function applyHighlights(root, noteFile) {
    var list = loadList().filter(function (h) {
      return h.noteFile === noteFile;
    });
    list.sort(function (a, b) {
      return a.start - b.start;
    });

    for (var i = 0; i < list.length; i++) {
      applyOneHighlight(root, list[i]);
    }
  }

  function offsetsFromSelection(root) {
    var sel = window.getSelection();
    if (!sel.rangeCount) return null;
    var rng = sel.getRangeAt(0);
    if (rng.collapsed) return null;
    if (!root.contains(rng.commonAncestorContainer)) return null;

    function lenBefore(node, offsetInNode) {
      var r = document.createRange();
      r.selectNodeContents(root);
      r.setEnd(node, offsetInNode);
      return r.toString().length;
    }

    var start = lenBefore(rng.startContainer, rng.startOffset);
    var end = lenBefore(rng.endContainer, rng.endOffset);
    if (start > end) {
      var t = start;
      start = end;
      end = t;
    }
    var text = root.textContent.slice(start, end);
    if (!text.trim()) return null;
    return { start: start, end: end, text: text };
  }

  function findContainingHighlight(root, sel) {
    if (!sel.rangeCount) return null;
    var rng = sel.getRangeAt(0);
    var n = rng.commonAncestorContainer;
    var el = n.nodeType === Node.ELEMENT_NODE ? n : n.parentElement;
    if (!el || !root.contains(el)) return null;
    return el.closest ? el.closest('mark.user-highlight') : null;
  }

  function removeHighlightById(id) {
    var list = loadList().filter(function (h) {
      return h.id !== id;
    });
    saveList(list);
  }

  function unwrapMark(mark) {
    var parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  }

  /* ——— Notes page UI ——— */
  var toolbar;
  var boundContent = null;
  var currentNoteFile = null;

  function ensureToolbar() {
    if (toolbar) return;
    toolbar = document.createElement('div');
    toolbar.className = 'hl-toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Text highlights');
    toolbar.innerHTML =
      '<button type="button" class="hl-btn hl-btn-primary" data-action="add">Highlight</button>' +
      '<button type="button" class="hl-btn" data-action="remove" hidden>Remove</button>' +
      '<span class="hl-toolbar-hint">Private — saved in this browser only</span>';
    document.body.appendChild(toolbar);

    toolbar.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      if (!btn || !boundContent || !currentNoteFile) return;
      var action = btn.getAttribute('data-action');
      if (action === 'add') {
        var off = offsetsFromSelection(boundContent);
        if (!off) return;
        var list = loadList();
        var id = uid();
        list.push({
          id: id,
          noteFile: currentNoteFile,
          start: off.start,
          end: off.end,
          text: off.text,
          createdAt: new Date().toISOString()
        });
        saveList(list);
        applyOneHighlight(boundContent, list[list.length - 1]);
        window.getSelection().removeAllRanges();
        syncToolbar();
      } else if (action === 'remove') {
        var sel = window.getSelection();
        var mark = findContainingHighlight(boundContent, sel);
        if (!mark) return;
        var hid = mark.getAttribute('data-hl-id');
        if (hid) {
          removeHighlightById(hid);
          unwrapMark(mark);
        }
        window.getSelection().removeAllRanges();
        syncToolbar();
      }
    });

    document.addEventListener(
      'selectionchange',
      debounce(function () {
        syncToolbar();
      }, 150)
    );
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      var a = arguments;
      var th = this;
      t = setTimeout(function () {
        fn.apply(th, a);
      }, ms);
    };
  }

  var toolbarPaused = false;

  function pauseForFlashcards() {
    toolbarPaused = true;
    if (toolbar) toolbar.classList.add('hl-toolbar-hidden');
  }

  function resumeNotesTab() {
    toolbarPaused = false;
    syncToolbar();
  }

  function syncToolbar() {
    if (toolbarPaused) {
      if (toolbar) toolbar.classList.add('hl-toolbar-hidden');
      return;
    }
    if (!toolbar || !boundContent || !currentNoteFile) {
      if (toolbar) toolbar.classList.add('hl-toolbar-hidden');
      return;
    }
    var sel = window.getSelection();
    var addBtn = toolbar.querySelector('[data-action="add"]');
    var remBtn = toolbar.querySelector('[data-action="remove"]');
    if (!addBtn || !remBtn) return;

    var mark = findContainingHighlight(boundContent, sel);
    var off = offsetsFromSelection(boundContent);

    if (mark) {
      remBtn.hidden = false;
      addBtn.hidden = true;
    } else if (off) {
      remBtn.hidden = true;
      addBtn.hidden = false;
    } else {
      toolbar.classList.add('hl-toolbar-hidden');
      remBtn.hidden = true;
      addBtn.hidden = false;
      return;
    }
    toolbar.classList.remove('hl-toolbar-hidden');
  }

  function maybeScrollToHighlight(contentEl) {
    var p = new URLSearchParams(location.search);
    var hid = p.get('hl');
    if (!hid || !contentEl) return;
    requestAnimationFrame(function () {
      var el = document.getElementById('hl-' + hid) || contentEl.querySelector('[data-hl-id="' + hid + '"]');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function initThemeToggle() {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      var next = cur === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (e) {}
      var meta = document.getElementById('theme-color-meta');
      if (meta) meta.content = next === 'light' ? '#f0f2f6' : '#12161f';
    });
  }

  /* ——— Library page ——— */
  function humanTitle(file) {
    return String(file)
      .replace(/\.md$/i, '')
      .replace(/_/g, ' ');
  }

  function renderLibraryPage() {
    var container = document.getElementById('hl-library');
    if (!container) return;

    var list = loadList().slice().sort(function (a, b) {
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    if (!list.length) {
      container.innerHTML =
        '<p class="hl-empty">No highlights yet. Open <a href="./index.html">Notes</a>, select text, and tap <strong>Highlight</strong>.</p>';
      return;
    }

    var html = '<ul class="hl-list">';
    for (var i = 0; i < list.length; i++) {
      var h = list[i];
      var title = humanTitle(h.noteFile);
      var excerpt = (h.text || '').trim();
      if (excerpt.length > 220) excerpt = excerpt.slice(0, 217) + '…';
      var when = h.createdAt ? new Date(h.createdAt).toLocaleString() : '';
      var link = resolveAppUrl('index.html') + '?note=' + encodeURIComponent(h.noteFile) + '&hl=' + encodeURIComponent(h.id);
      html +=
        '<li class="hl-item">' +
        '<div class="hl-item-meta">' +
        '<a class="hl-item-note" href="' +
        link +
        '">' +
        escapeHtml(title) +
        '</a>' +
        '<span class="hl-item-date">' +
        escapeHtml(when) +
        '</span>' +
        '</div>' +
        '<blockquote class="hl-item-quote">' +
        escapeHtml(excerpt) +
        '</blockquote>' +
        '<div class="hl-item-actions">' +
        '<button type="button" class="hl-btn hl-btn-small hl-item-del" data-hl-id="' +
        escapeHtml(h.id) +
        '">Delete</button>' +
        '</div>' +
        '</li>';
    }
    html += '</ul>';
    container.innerHTML = html;

    container.querySelectorAll('.hl-item-del').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-hl-id');
        if (!id || !confirm('Remove this highlight?')) return;
        removeHighlightById(id);
        renderLibraryPage();
      });
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  window.STMHighlights = {
    LS_KEY: LS_KEY,
    loadList: loadList,
    saveList: saveList,
    applyHighlights: applyHighlights,
    resolveAppUrl: resolveAppUrl,
    afterNoteLoad: function (contentEl, noteFile) {
      ensureToolbar();
      boundContent = contentEl;
      currentNoteFile = noteFile;
      applyHighlights(contentEl, noteFile);
      maybeScrollToHighlight(contentEl);
      syncToolbar();
    },
    onNoteClosed: function () {
      currentNoteFile = null;
      boundContent = null;
      if (toolbar) toolbar.classList.add('hl-toolbar-hidden');
    },
    pauseForFlashcards: pauseForFlashcards,
    resumeNotesTab: resumeNotesTab,
    initThemeToggle: initThemeToggle,
    renderLibraryPage: renderLibraryPage
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initThemeToggle();
      if (document.getElementById('hl-library')) {
        renderLibraryPage();
      }
    });
  } else {
    initThemeToggle();
    if (document.getElementById('hl-library')) {
      renderLibraryPage();
    }
  }
})();
