# Vendored fonts

Two static, latin-subset TrueType files, used **only** to render the guide
social cards (`src/app/og/guias/[slug]/card.png/route.tsx`). The site itself
loads its fonts through `next/font/google` (`src/config/fonts.ts`) and doesn't
touch these.

They're vendored because satori — the renderer behind `next/og`'s
`ImageResponse` — reads `ttf`, `otf` and `woff`, but **not** `woff2`, which is
the only format `next/font` downloads. There is no supported way to get a font
buffer out of `next/font`, so the card needs its own copy. Fetching them at
build time instead would make every build depend on the network.

| File                     | Family            | Source                                                |
| ------------------------ | ----------------- | ----------------------------------------------------- |
| `Fraunces-SemiBold.ttf`  | Fraunces 600      | Google Fonts (`fonts.gstatic.com`), v38, latin subset |
| `IBMPlexMono-Medium.ttf` | IBM Plex Mono 500 | Google Fonts (`fonts.gstatic.com`), v20, latin subset |

Both are licensed under the [SIL Open Font License 1.1](https://openfontlicense.org),
which permits redistribution as part of this repository.

To refresh them, ask the CSS API for TrueType (an old User-Agent is what makes it
answer with `.ttf` rather than `.woff2`) and download the URLs it returns:

```bash
curl -A "Mozilla/4.0" "https://fonts.googleapis.com/css?family=Fraunces:600|IBM+Plex+Mono:500"
```
