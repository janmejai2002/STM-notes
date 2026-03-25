# STM Study Hub (static site)

This repo powers a **mobile-friendly** static site: **topic notes** (Markdown + images) plus **flashcards** (JSON).

**Live site (after GitHub Pages is enabled):** [https://janmejai2002.github.io/STM-notes/](https://janmejai2002.github.io/STM-notes/)

## Features

- **Notes** tab: filter box for long topic lists, large tap targets, readable typography on small screens, `viewport-fit` / safe-area aware header.
- **Flashcards** tab: load `flashcards.json`, filter by topic, tap card to flip, previous/next, shuffle deck.
- **URLs:** `?note=Some_File.md` opens a note; `?view=flashcards` opens flashcards (other query params preserved).

## Content

- Markdown notes: `*.md` (except `README.md`)
- Mnemonic images: `Images/`
- Flashcards: `flashcards.json` (regenerated from `STM_Prep/Flashcards/` when you run the build below)

## Regenerate site + flashcards

From this folder (with the full `ob2` tree so `../Flashcards/flashcards.json` exists):

```bash
python build_index.py
git add index.html flashcards.json
git commit -m "Regenerate site and flashcards"
git push
```

## GitHub Pages

**Settings → Pages:** Branch `main`, folder `/ (root)`.
