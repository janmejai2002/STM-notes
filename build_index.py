"""Regenerate index.html and copy flashcards.json into this folder. Run: python build_index.py"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
INDEX_OUT = HERE / "index.html"
FLASH_SRC = HERE.parent / "Flashcards" / "flashcards.json"
FLASH_DST = HERE / "flashcards.json"

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" id="theme-color-meta" content="#12161f" />
  <meta name="color-scheme" content="dark light" />
  <meta name="description" content="Strategic Management study notes and flashcards." />
  <title>STM Study Hub · Notes &amp; Flashcards</title>
  <script>
(function(){
  try {
    var k='stm-hub-theme';
    var t=localStorage.getItem(k);
    if(!t) t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
    document.documentElement.setAttribute('data-theme',t);
    var meta=document.getElementById('theme-color-meta');
    if(meta) meta.content=t==='light'?'#f0f2f6':'#12161f';
  } catch(e) {}
})();
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <header class="site-header">
    <div class="header-top">
      <h1 class="brand">
        STM Study Hub
        <span class="brand-sub">Strategic Management · notes &amp; flashcards</span>
      </h1>
      <button type="button" class="theme-toggle" id="theme-toggle" title="Toggle light / dark theme" aria-label="Toggle light and dark theme">
        <svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        <svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
      </button>
    </div>
    <div class="tabs" role="tablist" aria-label="Study mode">
      <button type="button" class="tab" role="tab" id="tab-notes" aria-controls="panel-notes" aria-selected="true">Notes</button>
      <button type="button" class="tab" role="tab" id="tab-cards" aria-controls="panel-cards" aria-selected="false">Flashcards</button>
    </div>
    <nav class="header-nav" aria-label="Pages">
      <a href="./highlights.html" class="header-nav-link">My highlights</a>
    </nav>
  </header>

  <section id="panel-notes" class="panel" role="tabpanel" aria-labelledby="tab-notes">
    <div class="layout">
      <aside class="sidebar">
        <label class="sr-only" for="note-filter">Filter topics</label>
        <input type="search" id="note-filter" class="note-filter" placeholder="Filter topics…" autocomplete="off" enterkeyhint="search" />
        <nav id="nav" class="topic-nav" aria-label="Topics"></nav>
      </aside>
      <main class="main-content">
        <div id="status" class="status">Select a topic or filter the list.</div>
        <div id="note-actions" class="note-actions" hidden>
          <button type="button" class="speak-btn" id="btn-speak" title="Read note aloud" aria-label="Read note aloud" aria-pressed="false">
            <svg class="icon-speak" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
            <svg class="icon-speak-stop" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6 6h12v12H6z"/></svg>
          </button>
          <span class="speak-hint">Browser read-aloud (no download)</span>
        </div>
        <article id="content" class="prose" hidden></article>
      </main>
    </div>
  </section>

  <section id="panel-cards" class="panel hidden" role="tabpanel" aria-labelledby="tab-cards" hidden>
    <div class="flashcards-app">
      <div class="fc-toolbar">
        <label>Topic
          <select id="fc-topic" aria-label="Filter flashcards by topic"></select>
        </label>
        <button type="button" id="fc-shuffle">Shuffle deck</button>
      </div>
      <p class="fc-progress" id="fc-progress" aria-live="polite"></p>
      <span class="fc-hint" id="fc-hint">Tap card to flip</span>
      <div class="fc-scene">
        <button type="button" class="fc-flip-wrap" id="fc-flip" aria-label="Flip flashcard">
          <div class="fc-inner" id="fc-inner">
            <div class="fc-face fc-front" id="fc-front"></div>
            <div class="fc-face fc-back" id="fc-back"></div>
          </div>
        </button>
      </div>
      <div class="fc-nav-btns">
        <button type="button" id="fc-prev">Previous</button>
        <button type="button" id="fc-next">Next</button>
      </div>
      <p id="fc-status" class="status" role="status"></p>
    </div>
  </section>

  <script>window.__NOTES__ = __NOTES_JSON__;</script>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script src="./highlights.js"></script>
  <script src="./app.js"></script>
</body>
</html>
"""


def main() -> None:
    notes: list[dict] = []
    for p in sorted(HERE.glob("*.md")):
        if p.name.lower() == "readme.md":
            continue
        notes.append({"file": p.name, "title": p.stem.replace("_", " ")})

    html = HTML_TEMPLATE.replace("__NOTES_JSON__", json.dumps(notes, ensure_ascii=False))
    INDEX_OUT.write_text(html, encoding="utf-8")
    print(f"Wrote {INDEX_OUT.name} ({len(notes)} topics)")

    if FLASH_SRC.is_file():
        shutil.copy(FLASH_SRC, FLASH_DST)
        print(f"Copied flashcards.json ({FLASH_DST.stat().st_size} bytes)")
    else:
        print(f"Optional: no {FLASH_SRC} — flashcards tab will show a hint until file exists.")


if __name__ == "__main__":
    main()
