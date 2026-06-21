# JOS Blog — deploy notes

Public face of the `~/JOS` vault. Quartz v5 builds **only `91-Blog`** (the rest of
the vault stays private). Part of the JOS two-track setup — see the marking note at
`~/JOS/02-Projects/Personal/jos-console.md`.

## How content flows

```
~/JOS/91-Blog/*.md   →  content/ (symlink)  →  npx quartz build  →  public/  →  gh-pages
```

Write a post in Obsidian under `91-Blog`, and it's published on the next build.
The homepage is `91-Blog/index.md`. Nothing outside `91-Blog` is ever built.

## Bilingual posts (ko / en)

One language per file — never both in one file. Posts live under `91-Blog/en/`
and `91-Blog/ko/` with the **same slug** in each language:

```
91-Blog/
  en/enabling-a-debate.md   # lang: en
  ko/enabling-a-debate.md   # lang: ko
  index.md                  # lists each post once; the switcher toggles language
```

Each post carries `lang: en|ko` in frontmatter and a switcher line at the top.
Not every post needs both languages — translate selectively.

AI-assisted translation (works both directions, infers from the source):

```bash
python3 ~/code/jos-blog/translate_post.py ~/JOS/91-Blog/en/enabling-a-debate.md
# → writes ko/enabling-a-debate.md (translated draft) and adds the switcher to both
python3 ~/code/jos-blog/translate_post.py ~/JOS/91-Blog/ko/some-post.md --to en
```

Output is a **draft** — review before publishing. Needs `ANTHROPIC_API_KEY`
(read from env or `~/code/jos-console/.env`).

> Note: `[[wikilinks]]` to notes outside `91-Blog` (e.g. `[[Last Dance]]`) render
> as dead links publicly — strip or rewrite them in the published version.

## Local preview

```bash
cd ~/code/jos-blog
npx quartz build --serve      # http://localhost:8080
```

(The preview is a dev server, not a launchd service — start it when you want it.)

## Deploy to GitHub Pages (local build → gh-pages)

The vault is private and local, so the build runs on the hub and only the static
output ships. There is intentionally **no GitHub Action** (CI can't see the vault).

One-time:

```bash
# 1. create an empty repo at github.com/<you>/jos-blog
git -C ~/code/jos-blog remote add origin git@github.com:<you>/jos-blog.git
# 2. GitHub → Settings → Pages → Deploy from a branch → gh-pages /(root)
```

Every publish:

```bash
python3 ~/code/jos-blog/publish_blog.py   # build + force-push public/ to gh-pages
```

## Before going live — edit these placeholders

- `quartz.config.yaml` → `pageTitle` (currently "JOS Blog") and `baseUrl`
  (currently `brbrlim.github.io/jos-blog` — set to `<you>.github.io/jos-blog`).
- Comments (giscus) are **disabled**; enable + fill repo/ids in `quartz.config.yaml`
  once the repo exists if you want them.

## Theme

JOS palette (paper-grey + pine + amber, Newsreader / IBM Plex Mono) lives in the
`theme:` block of `quartz.config.yaml`. Inspiration: quartz.jzhao.xyz/showcase ·
options: quartz.jzhao.xyz/configuration#theme.

## Updating Quartz itself

`upstream` points at the Quartz repo; pull improvements with:

```bash
git -C ~/code/jos-blog fetch upstream && git -C ~/code/jos-blog merge upstream/v4
```
