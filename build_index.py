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
  <meta name="theme-color" content="#1a2332" />
  <meta name="color-scheme" content="dark" />
  <meta name="description" content="Strategic Management study notes and flashcards." />
  <title>STM Study Hub · Notes &amp; Flashcards</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;1,9..40,400&family=Fraunces:opsz,wght@9..144,600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <header class="site-header">
    <h1 class="brand">
      STM Study Hub
      <span class="brand-sub">Strategic Management · notes &amp; flashcards</span>
    </h1>
    <div class="tabs" role="tablist" aria-label="Study mode">
      <button type="button" class="tab" role="tab" id="tab-notes" aria-controls="panel-notes" aria-selected="true">Notes</button>
      <button type="button" class="tab" role="tab" id="tab-cards" aria-controls="panel-cards" aria-selected="false">Flashcards</button>
    </div>
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
