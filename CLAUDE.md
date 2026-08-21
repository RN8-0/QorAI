# Compair / Qor AI — project design record

> Recorded from the code that is live today (`web/src/styles/global.css`,
> `web/index.html`). Nothing here is a new proposal except the mono face,
> which is marked as such. The existing design is approved — this file only
> writes it down. Global rules live in `~/.claude/CLAUDE.md`.

## Subject and tone

An AI product-comparison catalogue for Turkish and English shoppers —
technical, evidence-first, never salesy: every claim is a number the reader can
check.

## Palette

The theme is token-driven with two full sets. Brand tokens are
theme-independent; surfaces and text swap per `[data-theme]`.

### Brand (theme-independent)

| Token | Hex | Role |
|---|---|---|
| `--brand-cyan` | `#00E5FF` | AI accent, score-ring terminal stop |
| `--brand-blue` | `#2196F3` | primary brand blue |
| `--brand-deep` | `#1565C0` | deep brand, light-theme accent |
| `--brand-sky` | `#4FC3F7` | dark-theme score digits |
| `--violet` | `#7C3AED` | premium only |

### Semantic

| Token | Hex | Role |
|---|---|---|
| `--score-excellent` / `--emerald` / `--green` | `#10B981` | score ≥ good, fills |
| `--score-good` | `#34D399` | score band |
| `--score-average` / `--amber` | `#F59E0B` | score band, warning |
| `--score-poor` / `--red` | `#EF4444` | score band, error |

### Dark (OLED) — `[data-theme='dark']`

| Token | Hex |
|---|---|
| `--bg` | `#000000` |
| `--surface` / `--surface-2` / `--surface-3` / `--elevated` | `#0A0A0A` / `#121212` / `#181818` / `#1A1A1A` |
| `--text` / `--text-2` / `--text-3` | `#F1F5F9` / `#94A3B8` / `#7C8A9C` |
| `--text-soft` | `#CBD5E1` |
| `--divider` | `#1E293B` |
| `--border` / `--border-strong` | `rgba(255,255,255,.08)` / `rgba(255,255,255,.14)` |
| `--accent` | `#2196F3` |
| `--on-accent` | `#001018` |
| `--price` | `#22c55e` |
| ink (text-safe) `--ink-cyan` / `--ink-blue` / `--ink-amber` / `--ink-green` / `--ink-red` | `#00E5FF` / `#4FC3F7` / `#F59E0B` / `#10B981` / `#EF4444` |

### Light (slate) — `[data-theme='light']`

| Token | Hex |
|---|---|
| `--bg` | `#F8FAFC` |
| `--surface` / `--surface-2` / `--surface-3` / `--elevated` | `#FFFFFF` / `#F1F5F9` / `#E9EEF5` / `#FFFFFF` |
| `--text` / `--text-2` / `--text-3` | `#0F172A` / `#475569` / `#5B6779` |
| `--text-soft` | `#475569` |
| `--divider` | `#E2E8F0` |
| `--border` / `--border-strong` | `rgba(15,23,42,.08)` / `rgba(15,23,42,.14)` |
| `--accent` | `#1565C0` |
| `--on-accent` | `#FFFFFF` |
| `--price` | `#15803D` |
| ink (text-safe) `--ink-cyan` / `--ink-blue` / `--ink-amber` / `--ink-green` / `--ink-red` | `#0E7490` / `#1565C0` / `#92400E` / `#047857` / `#B91C1C` |

**The `--ink-*` rule is not cosmetic.** Fill colours (`--green`, `--red`,
`--brand-cyan`) fail WCAG AA as text on light surfaces. Every measured ratio is
commented inline in `global.css`. When a brand or semantic colour carries
*text*, use the `--ink-*` counterpart. Never hardcode a hex — every one of
these was moved at least once after a contrast audit.

### Radii and layout

`--r-xs 6` · `--r-sm 10` · `--r-md 14` · `--r-lg 18` · `--r-xl 24`
· `--r-2xl 30` · `--r-pill 999` (legacy aliases: `--radius 14`,
`--radius-sm 10`, `--radius-lg 22`). `--maxw 1240px`, `--header-h 68px`.

## Type trio

| Role | Face | Status |
|---|---|---|
| **Display** | Plus Jakarta Sans 700 / 800 | installed |
| **Body** | Plus Jakarta Sans 400 / 500 / 600 | installed |
| **Mono** | **JetBrains Mono — PROPOSED, not installed** | see below |

Loaded via `--font` in `global.css`, self-hosted as woff2 under
`web/public/assets/fonts/` (`jakarta-{400,500,600,700,800}-{latin,latin-ext}.woff2`),
declared inline in `web/index.html`. Latin-ext is required — Turkish
diacritics live there. Never reintroduce a render-blocking
`fonts.googleapis.com` stylesheet; it was removed deliberately for LCP and the
reasoning is commented at `web/index.html:90`.

**There is no mono face today.** The only monospace in the codebase is a
generic `ui-monospace` stack in two places (`Blog.css:72`,
`global.css:366`). Numbers — prices, Tech Scores, specs, dates — are currently
set in the proportional body face. **JetBrains Mono with tabular figures** is
the proposal for that role. It is not installed and no component uses it yet;
adding it means self-hosting woff2 alongside Jakarta, same pattern.

## Signature element

**Qor AI Tech Score** — the numeric score ring. It is the one thing the
product is remembered by, and it appears in `ProductCard.jsx`,
`AiAnalysis.jsx`, `AiBubble.jsx` and `AiReportView.jsx`. The ring keeps its
live cyan/blue stroke in both themes; only the *digit* falls back to
`--ink-cyan` / `--ink-blue` for contrast. Treat ring colour and digit colour as
two separate decisions — they always have been.

## SEO

- **Target markets: TR, EN.** German was removed entirely on 2026-08-21 —
  no `de` string table, no `/de` URL prefix, no German AI copy, no German blog
  language, no German Play listing. `/de/*` 301s to the root equivalent
  (`docs/nginx_website.conf`) so the ~7.7k previously indexed German URLs keep
  their value instead of 404ing.
- **hreflang alternates on every product and article route**, both locales plus
  `x-default`. Route shape is `/product/<slug>`, with a language-prefixed
  variant (`/tr/...`, bare `/` = EN).
- Product pages carry Product+Offer JSON-LD; articles carry Article+FAQPage;
  BreadcrumbList everywhere.
- Product and article routes are pre-rendered. Never ship an indexable route
  whose content only appears after JS runs.

## Scale

Every number below was measured on **2026-08-19**, not estimated. Sources are
named so they can be re-measured. Global scale rules live in
`~/.claude/CLAUDE.md`; this section is the project's actual row counts.

### Collections

| What | Count | Source |
|---|---|---|
| `products` (PocketBase) | **107,449** | `GET /api/collections/products/records?perPage=1` → `totalItems` |
| `products` (Typesense) | **107,449** docs, 32 fields | `GET /collections/products` → `num_documents` |
| `categories` | **46** | PB `totalItems` |
| `articles` (blog) | **10** | PB `totalItems` |
| Languages | **2** | `web/src/i18n/strings.js` → `STRINGS = { en, tr }` |

PocketBase and Typesense agree exactly on 107,449 — the index is not drifting.

### Locales

`en` = bare path (`/product/…`), `tr` = `/tr/…`, plus `x-default`. `LANGS` in
`web/src/i18n/index.jsx` lists exactly these two. `web/src/i18n/locales/` also
contains `ar, es, fr, it, ja, nl, pl, pt, sv` — **none of them are imported by
`strings.js`**, so they are dead files, not active locales. Do not count them
as shipped languages. `de.js` was deleted outright on 2026-08-21.

### Indexable URLs — 8,076

Counted from `website/sitemap.xml` (`grep -c "<loc>"`) on **2026-08-21**, a
single file. Two independent changes landed between the 23,199 reading and
this one — do not attribute the drop to either alone:

| Route | Per locale | × 2 locales |
|---|---|---|
| `/product/<slug>` | 3,743 | **7,486** |
| `/compare/…` | 225 | **450** |
| `/category/…` | 45 | **90** |
| `/blog/<slug>` | — | **21** |
| static (about, faq, privacy, terms, premium, quiz, …) | — | **19** |
| | | **8,076** |

1. **German removal** (2026-08-21) cut the locale multiplier 3 → 2. On its own
   that would have given 23,199 → 15,466.
2. **Curation tightening** — an *uncommitted* working-tree change to
   `seo.mjs` (per-category quota, model-key dedup, `spec<12` gate,
   `COMPARE_TOP` 8→6) cut products 6,374 → 3,743 per locale and comparisons
   1,288 → 225. Build log: `elenen: görselsiz 2, spec<12 366, kopya 1144`.
   `git show HEAD:web/scripts/seo.mjs` has none of this code — it is not part
   of the German removal and can be reverted independently.

### Ceiling — the number that breaks the current design

Full product coverage would be 107,449 × 2 = **214,898 product URLs**. That is
**4.3× Google's 50,000-URL cap for a single sitemap**, so it forces a sitemap
index of at least 5 shards. The current single `sitemap.xml` is legal today at
8,076 only because coverage is 3.5%. Do not widen coverage without splitting
the sitemap first.

### Typesense index

107,449 documents across 32 fields. Resident memory **307 MiB**
(`typesense_memory_resident_bytes` 322,318,336), allocated 263 MiB, mapped
344 MiB — measured via `GET /metrics.json`. That is ~8% of total host RAM for
the index alone.

### Server — one host, and it is the constraint

Measured over SSH on the live box (`46.225.95.201`), not read off a plan page:

| | Measured |
|---|---|
| vCPU | **2** — AMD EPYC-Genoa |
| RAM | **3,814 MB** (~4 GB), ~1.9 GB in use |
| Disk | **75 GB**, 55 GB used — **77% full** |
| Swap | 4 GB, **1.26 GB already in use** |

**The "Hetzner CPX22" label does not match this hardware.** A CPX22 is not a
2-vCPU / 4 GB machine; what is actually running is 2 vCPU / 4 GB / 80 GB. The
SKU name cannot be confirmed from inside the VM — that needs the Hetzner
console or API. Trust the measured numbers, not the label.

PocketBase, Typesense, the AI proxy and the scrapers all share this one host.
Swap is already in use at idle, so memory is the binding constraint, not CPU.
This is why a "just re-index everything" or "just pre-render everything" plan
fails here even when it would be fine on paper.

### The rule

**Any solution whose file count, query count, or build time grows with the
product count is wrong for this project.**
