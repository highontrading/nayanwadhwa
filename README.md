# nayanwadhwa.com

Personal site for Nayan Wadhwa, CFA: quant researcher and founder of Ideabro AI.

It is a plain static site. There is no build step and nothing to install: HTML, one
stylesheet, one script, two fonts and a handful of images.

## Preview it locally

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Opening `index.html` straight from disk also works.

## Deploy

**Netlify** (where the domain currently points): connect this repository, leave the
build command empty and keep the publish directory as `.` (`netlify.toml` already says so).

**Anywhere else** (Vercel, Cloudflare Pages, GitHub Pages): serve the repository root.

### The contact form needs one switch flipped

The form is wired for Netlify Forms. After the first deploy, open
**Forms → Enable form detection** in the Netlify dashboard and redeploy. Messages then
show up under *Forms* and can be forwarded to your email.

On another host, change the form's `action` in `index.html` to a form endpoint
(Formspree, Basin, your own API). Until a form backend answers, the page tells visitors
the message did not send and points them to LinkedIn. It never claims a delivery that
did not happen.

## Where things live

| Path | What it is |
| --- | --- |
| `index.html` | The whole home page: hero, about, work, writing, quick answers, contact |
| `writing/*.html` | One page per essay |
| `404.html` | Not-found page |
| `assets/css/styles.css` | All styling. Colours, type and spacing are variables at the top |
| `assets/js/main.js` | All behaviour: theme, navigation, reveals, the four demos, the form |
| `assets/img/` | Hero artwork (light and dark), social share card, icons |
| `assets/fonts/` | Fraunces and Inter, subsetted, with their licences |
| `tools/stipple.py` | Regenerates the hero artwork |

## Common edits

- **Text**: edit it directly in `index.html`. Each section is marked with a comment.
- **Colours and fonts**: the `:root` block at the top of `styles.css`. The dark theme is
  the `:root[data-theme="dark"]` block right under it.
- **Social links**: the `socials` list in the contact section, plus `sameAs` in the
  structured data near the top of `index.html`.
- **A new essay**: copy a file in `writing/`, change its text and meta tags, then add a
  row to the writing list in `index.html` and an entry in `sitemap.xml`.
- **The floating tiles**: each one is a `<li class="slot">` in the hero. `--x` / `--y`
  place it on desktop, `--xm` / `--ym` on phones (percent of the artwork area).

## The hero artwork

The head is made by `tools/stipple.py` from a public-domain museum photograph. The
script cuts the sculpture out, slices it open, dissolves the neck and redraws it as grain.

```bash
pip install numpy opencv-python-headless
python3 tools/stipple.py
```

To use your own portrait instead, take a frontal photo on a plain background and run:

```bash
python3 tools/stipple.py --src my-portrait.jpg --preview preview.png
```

Adjust `--rect`, `--cut` and `--neck` until the preview looks right
(`python3 tools/stipple.py --help` explains each one).

## Credits

- Artwork source: *Portrait Head of a Youth*, Roman, 14-68 CE, Art Institute of Chicago
  ([1889.105](https://www.artic.edu/artworks/262)), public domain (CC0).
- Fonts: [Fraunces](https://github.com/undercasetype/Fraunces) and
  [Inter](https://github.com/rsms/inter), both under the SIL Open Font License.
