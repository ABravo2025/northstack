# Northstack — Marketing

This branch (`marketing`) holds **everything Northstack creates for marketing**: posts, copy, images,
videos, music, scripts used to produce them, and the project handoff. It is an **orphan branch** — it
shares no history with the app (`main` / `staging`) or the website (`landing`) and must **never be
merged** into them.

## Rules

1. **Every marketing asset goes here, and only here.** LinkedIn/social posts, images, videos, audio,
   ad copy, one-pagers, email campaigns — committed to this branch, never to `main`, `staging` or
   `landing`. (The live website itself stays on the `landing` branch; a copy of any campaign image it
   uses can also live here.)
2. **Folders by month and week:** `YYYY-MM/semana-NN/` — weeks run Monday→Sunday and are numbered
   within the month by the week that contains the Monday (the first, possibly partial, week of the
   month is `semana-01`). Inside a week, group by type:
   ```
   2026-10/
     semana-01/
       README.md        ← what was produced this week, status (draft / published), where it was published
       linkedin/        ← post-es.md, post-en.md, ...
       video/           ← final .mp4 files (+ the music used)
       imagenes/        ← images, OG/social cards
   ```
3. **`handoff.md` is the project's running context.** Whenever a new feature ships (or a major change
   lands in the app or the landing), update `handoff.md` in this branch in the same session: what it
   does, where it lives, its status (staging / production), and anything marketing should say — or
   must not say — about it. Newest entries on top.
4. **Reusable production tooling** (video recorder, music generator, demo-data seed) lives in
   `tools/`, so any asset can be re-made later.
5. **Never commit secrets or real customer data.** Demos use the fictitious "Acme Latam" tenant on
   staging; scripts read tokens from local files outside the repo.
6. **SEO is marketing.** Everything about search visibility (Search Console status, keyword map,
   module pages, backlinks) is tracked in `seo/README.md`; update it whenever SEO work happens, plus a
   changelog line in `handoff.md`. The pages themselves ship on the `landing` branch.

## Content rules (what we say publicly)

- Payroll is **tracking only** — Northstack never pays anyone or moves money.
- Don't market the Payments / collections module.
- Don't claim "available in English & Spanish".
- Don't mention the Android app until it's on the Play Store.
- Prices live only in `src/config/pricing.ts` (main branch); avoid hard-coding prices in posts.
- Brand: violet `#5b21e6`, font Instrument Sans, fleur logo (unchanged for now).
