# Optimal — Menopause Foundation Program Presentation

A self-contained, browser-based slide presentation (12 slides, 16:9) for Optimal Clinic's
Women's Hormone Optimization / Menopause Foundation Program patient briefing.

This is a **static website** — no build step, no dependencies to install. Open `index.html`
and it runs. It is ready to push to GitHub and serve via GitHub Pages.

## What's in here

| File | Purpose |
|------|---------|
| `index.html` | The presentation. All 12 slides live here as `<section>` elements. |
| `deck-stage.js` | Slide-deck engine (`<deck-stage>` web component): scaling/letterboxing to fit any screen, keyboard nav, thumbnail rail, print-to-PDF. Loaded via a plain `<script>` tag. |
| `colors_and_type.css` | Brand color + typography tokens (CSS custom properties). Fonts load from Google Fonts. |
| `assets/` | Images and logos referenced by the slides. |

## Run it locally

It's plain static files, so any static server works. From this folder:

```bash
# Python (built in on most machines)
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` directly via `file://` mostly works too, but a local server is more reliable for fonts/images.

### How to navigate the deck
- **Arrow keys** / click the on-screen arrows to move between slides
- The thumbnail rail lets you jump to any slide
- `Cmd/Ctrl + P` prints — the deck lays out one slide per page (use Landscape, enable "Background graphics")

## Deploy to GitHub Pages

1. Create a new repository on GitHub (e.g. `optimal-menopause-presentation`).
2. From this `presentation-website/` folder:
   ```bash
   git init
   git add .
   git commit -m "Optimal menopause presentation"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   pick `main` / `/ (root)`, save.
4. After a minute the deck is live at `https://<your-username>.github.io/<your-repo>/`.

A `.nojekyll` file is included so GitHub Pages serves every file as-is (no Jekyll processing).

## Notes for Claude Code

If you're extending this into a larger presentation website (landing page, multiple decks,
navigation, a custom domain, etc.):

- **The slide content is intentional, hand-tuned HTML.** Each slide is a `<section>` directly
  inside `<deck-stage width="1920" height="1080">`. To edit copy or layout, edit that section's
  markup in `index.html`. Per-slide styles are scoped by a class on the section (`.s1`, `.s3`,
  `.s7`, etc.) defined in the `<style>` block at the top of `index.html`.
- **Design tokens** (colors, fonts) live in `colors_and_type.css` as CSS variables — reuse them
  for anything new so the brand stays consistent. Don't hardcode new hex values; extend the token
  set if you need more.
- **Don't rewrite `deck-stage.js`** unless you specifically need to change deck behavior — it's a
  general-purpose engine and the slides depend on its contract (each direct-child `<section>` is a slide).
- **Fonts**: Castoro (serif display), Public Sans / Hanken Grotesk (sans), loaded via `@import` in
  `colors_and_type.css`. If you want them self-hosted for offline/perf, drop TTFs in a `fonts/`
  folder and add `@font-face` rules.
- If you wrap this in a framework (Next/Astro/etc.), the cleanest path is to keep `index.html` as a
  standalone deck route and build the surrounding site around it, rather than porting the slides into
  components — they rely on the deck engine's scaling math.

## Brand

Optimal Clinic — 630 Huronia Road, Unit 5, Barrie ON · care@beoptimal.ca · beoptimal.ca
