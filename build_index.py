"""Regenerate index.html from all *.md files (except README). Run: python build_index.py"""
from __future__ import annotations

import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
INDEX_OUT = HERE / "index.html"

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>STM Study Notes</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;1,9..40,400&family=Fraunces:opsz,wght@9..144,600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <h1>STM study notes</h1>
      <p class="sub">Strategic Management · topic pages</p>
      <nav id="nav"></nav>
    </aside>
    <main>
      <div id="status" class="status">Select a topic from the list.</div>
      <article id="content" class="prose" hidden></article>
    </main>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script>
    const NOTES = __NOTES_JSON__;

    const nav = document.getElementById('nav');
    const content = document.getElementById('content');
    const status = document.getElementById('status');

    function humanTitle(file) {
      const base = file.replace(/\\.md$/i, '');
      return base.replace(/_/g, ' ');
    }

    NOTES.sort((a, b) => a.title.localeCompare(b.title));

    NOTES.forEach((note) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = note.title;
      btn.dataset.file = note.file;
      btn.addEventListener('click', () => loadNote(note.file, btn));
      nav.appendChild(btn);
    });

    async function loadNote(filename, btn) {
      document.querySelectorAll('.sidebar button').forEach((b) => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
      status.textContent = 'Loading…';
      status.classList.remove('error');
      content.hidden = true;
      try {
        const res = await fetch(encodeURI(filename));
        if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
        const md = await res.text();
        content.innerHTML = marked.parse(md, { mangle: false, headerIds: true });
        if (!content.querySelector('h1')) {
          const t = document.createElement('h1');
          t.textContent = humanTitle(filename);
          content.insertBefore(t, content.firstChild);
        }
        status.textContent = '';
        content.hidden = false;
      } catch (e) {
        status.textContent = 'Could not load this file. Use the GitHub Pages URL (not file://).';
        status.classList.add('error');
        console.error(e);
      }
    }

    const params = new URLSearchParams(location.search);
    const q = params.get('note');
    if (q) {
      const btn = [...nav.querySelectorAll('button')].find((b) => b.dataset.file === q);
      loadNote(q, btn || null);
    }
  </script>
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


if __name__ == "__main__":
    main()
