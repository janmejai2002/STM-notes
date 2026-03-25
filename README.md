# STM study notes

Generated topic notes (Markdown) for Strategic Management, with mnemonic images under `Images/`.

Markdown image paths use `./Images/<topic>_mnemonic.png`.

## Website (GitHub Pages)

After you enable Pages on this repo, the site will be available at:

**https://janmejai2002.github.io/STM-notes/**

1. On GitHub: **Settings → Pages → Build and deployment**
2. **Source:** Deploy from a branch  
3. **Branch:** `main` / **Folder:** `/ (root)`  
4. Save. Wait 1–2 minutes, then open the link above.

To refresh the topic list after adding `.md` files:

```bash
python STM_Prep/Scripts/build_notes_site.py
git add index.html && git commit -m "Regenerate site index" && git push
```

(Run `build_notes_site.py` from your `ob2` project root, or copy the script path as needed.)
