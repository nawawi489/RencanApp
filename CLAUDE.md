# RencanApp — Wiki Schema for Claude Code

This file is the operating manual for maintaining the RencanApp project wiki.
Read it at the start of every session before touching any wiki files.

---

## Directory layout

```
RencanApp/
├── CLAUDE.md          ← this file (wiki schema + workflow rules)
├── raw/               ← immutable source documents (never modify these)
│   └── assets/        ← downloaded images referenced by raw sources
├── wiki/
│   ├── index.md       ← master index of all wiki pages (update on every ingest)
│   ├── log.md         ← append-only chronological log (## [YYYY-MM-DD] prefix)
│   ├── overview.md    ← high-level project summary, always kept current
│   ├── entities/      ← one page per named thing (feature, module, person, service)
│   ├── concepts/      ← one page per idea, pattern, or design decision
│   └── sources/       ← one summary page per ingested source document
```

---

## Page conventions (Obsidian-compatible)

- **Wikilinks** for all cross-references: `[[PageName]]` not markdown links.
- **Frontmatter** on every wiki page (not on raw sources):
  ```yaml
  ---
  type: entity | concept | source | overview
  tags: [tag1, tag2]
  updated: YYYY-MM-DD
  sources: 0          # number of raw sources that informed this page
  ---
  ```
- **Headings**: H1 for page title, H2 for major sections, H3 for subsections.
- **Contradiction markers**: use `> [!warning] Contradicts [[OtherPage]]` when a new source conflicts with existing content.
- **Stub marker**: add `#stub` tag in frontmatter when a page was created as a placeholder.

---

## Workflows

### Ingest a new source

Triggered when the user drops a file into `raw/` and says "ingest [filename]".

1. Read the source file in full.
2. Discuss key takeaways with the user (2–4 bullet points, ask if emphasis is right).
3. Write a summary page in `wiki/sources/` named after the source file (no extension).
4. Update `wiki/overview.md` if the source changes the high-level picture.
5. Create or update entity pages in `wiki/entities/` for any named things (features, modules, APIs, people, services).
6. Create or update concept pages in `wiki/concepts/` for any design decisions, patterns, or ideas.
7. Add cross-references (`[[wikilinks]]`) between all affected pages.
8. Update `wiki/index.md` — add new pages, update summaries of modified pages.
9. Append an entry to `wiki/log.md`:
   ```
   ## [YYYY-MM-DD] ingest | <source title>
   - Pages created: ...
   - Pages updated: ...
   - Key takeaways: ...
   ```

### Answer a query

Triggered when the user asks a question about the project.

1. Read `wiki/index.md` to identify relevant pages.
2. Read those pages.
3. Synthesize an answer with `[[wikilink]]` citations.
4. If the answer is non-trivial and reusable, ask the user if it should be filed as a new wiki page.

### Lint the wiki

Triggered when the user says "lint" or "health check".

1. Read all wiki pages (start with index.md to enumerate them).
2. Report:
   - Pages with `#stub` tag that still have no real content.
   - Contradictions between pages (claims that conflict).
   - Orphan pages (no inbound wikilinks).
   - Missing pages (concepts mentioned but not yet created).
   - Stale claims (pages that haven't been updated after a newer source superseded them).
3. Suggest 3–5 questions worth investigating or sources worth finding.

---

## Index format (`wiki/index.md`)

Sections: Overview, Entities, Concepts, Sources.
Each entry: `- [[PageName]] — one-line summary`
Keep entries alphabetical within each section.

## Log format (`wiki/log.md`)

Each entry starts with `## [YYYY-MM-DD] <type> | <title>` where type is one of:
`ingest`, `query`, `lint`, `update`, `init`.
Entries are appended (newest at bottom is fine; newest at top is also fine — pick one and stick to it).
Today's date: use the date provided in system context, not a hardcoded value.

---

## Design tokens (`mobile/`)

`DESIGN.md` di root adalah **sumber kebenaran token desain** (warna, tipografi, spacing, radius, elevation, motion, a11y). Aturan:

1. Sebelum menyentuh UI di `mobile/src/` (komponen, layar, styling), baca `DESIGN.md` lebih dulu.
2. Token baru (warna/spasi/komponen) **didaftarkan di `DESIGN.md` dulu**, lalu diimplementasi di `mobile/src/global.css` (`@theme` untuk brand) + class NativeWind.
3. Patuhi aturan aksesibilitas yang mengikat di `DESIGN.md §4` (touch target ≥44px, warna ≠ satu-satunya sinyal, solid+teks putih pakai `brand-dark` `#1564b3`).
4. Saat sebuah keputusan token diambil/berubah, perbarui `DESIGN.md` + `global.css` agar tetap sinkron.

---

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

Available gstack skills:
`/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/setup-gbrain`, `/retro`, `/investigate`, `/document-release`, `/document-generate`, `/codex`, `/cso`, `/autoplan`, `/plan-devex-review`, `/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`

---

## Style rules

- Write wiki pages for a future reader who knows the domain but not this specific project.
- Prefer short declarative sentences. No fluff.
- When uncertain, use `[?]` inline to mark claims that need verification.
- Never delete content from `raw/` — it is the source of truth.
- Do not write comments in wiki pages explaining what you (Claude) did. Write as if the wiki is authoritative documentation.
