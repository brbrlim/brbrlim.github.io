#!/usr/bin/env python3
"""AI-assisted translation for bilingual blog posts (ko <-> en).

    python3 translate_post.py <path-to-post.md> [--to ko|en]

Reads a post under 91-Blog/{en,ko}/, asks Claude to translate it, and writes the
paired file in the opposite-language folder with the SAME slug, swapped `lang`, a
translated title, and a language switcher injected into BOTH files. Direction is
inferred from the source folder/lang unless --to is given. The output is a draft —
review it before publishing.

No dependencies (stdlib urllib). Reuses ANTHROPIC_API_KEY from the environment or
from ~/code/jos-console/.env.
"""
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

MODEL = "claude-sonnet-4-6"
NAMES = {"ko": "Korean", "en": "English"}
SWITCH_RE = re.compile(r"^> .*<!-- lang-switch -->\n?", re.MULTILINE)


def api_key():
    if os.environ.get("ANTHROPIC_API_KEY"):
        return os.environ["ANTHROPIC_API_KEY"]
    env = Path.home() / "code/jos-console/.env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("ANTHROPIC_API_KEY="):
                return line.split("=", 1)[1].strip()
    sys.exit("No ANTHROPIC_API_KEY (env or ~/code/jos-console/.env).")


def split_frontmatter(text):
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            return text[3:end].strip(), text[end + 4:].lstrip("\n")
    return "", text


def fm_get(fm, key):
    m = re.search(rf"^{key}:\s*(.+)$", fm, re.MULTILINE)
    return m.group(1).strip() if m else None


def switcher(slug):
    return (f"> 🌐 [English](/en/{slug}) · [한국어](/ko/{slug}) <!-- lang-switch -->")


def ensure_switcher(path, slug):
    """Insert/refresh the switcher right after the frontmatter of an existing file."""
    text = path.read_text(encoding="utf-8")
    fm, body = split_frontmatter(text)
    body = SWITCH_RE.sub("", body).lstrip("\n")
    new = f"---\n{fm}\n---\n\n{switcher(slug)}\n\n{body}"
    path.write_text(new, encoding="utf-8")


def translate(key, title, body, target):
    sys_prompt = (
        f"You are a translator for a personal blog. Translate the post to "
        f"{NAMES[target]}. Preserve markdown structure exactly: headings, lists, "
        f"emphasis, code, blockquotes, and [[wikilinks]] (translate only visible "
        f"alias text, keep link targets unchanged). Produce natural, fluent "
        f"{NAMES[target]} prose — not a literal gloss. Translate the title too. "
        f'Respond with ONLY JSON: {{"title": string, "body": string}}.'
    )
    payload = {
        "model": MODEL, "max_tokens": 8000, "system": sys_prompt,
        "messages": [{"role": "user", "content": json.dumps({"title": title, "body": body}, ensure_ascii=False)}],
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages", data=json.dumps(payload).encode(),
        headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    data = json.loads(urllib.request.urlopen(req, timeout=180).read())
    out = "".join(b["text"] for b in data["content"] if b["type"] == "text")
    return json.loads(out[out.find("{"): out.rfind("}") + 1])


def main():
    args = sys.argv[1:]
    to = None
    if "--to" in args:
        i = args.index("--to")
        to = args[i + 1]
        args = args[:i] + args[i + 2:]
    if not args:
        sys.exit("usage: translate_post.py <path-to-post.md> [--to ko|en]")

    src = Path(args[0]).resolve()
    if not src.is_file():
        sys.exit(f"not found: {src}")
    text = src.read_text(encoding="utf-8")
    fm, body = split_frontmatter(text)
    body = SWITCH_RE.sub("", body).lstrip("\n")

    src_lang = fm_get(fm, "lang") or (src.parent.name if src.parent.name in NAMES else None)
    if src_lang not in NAMES:
        sys.exit("can't tell source language — add `lang: en|ko` or put it under en/ or ko/.")
    tgt = to or ("en" if src_lang == "ko" else "ko")
    if tgt not in NAMES:
        sys.exit("--to must be ko or en")

    slug = src.stem
    tgt_path = src.parent.parent / tgt / f"{slug}.md"
    tgt_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"translating {src_lang} → {tgt}: {slug} …")
    res = translate(api_key(), fm_get(fm, "title") or slug, body, tgt)

    # rebuild target frontmatter from source, swapping lang + title
    created = fm_get(fm, "created") or ""
    ftype = fm_get(fm, "type") or "draft"
    tags = fm_get(fm, "tags") or "[]"
    new_fm = (f"---\ntitle: {res['title']}\ncreated: {created}\n"
              f"type: {ftype}\nlang: {tgt}\ntags: {tags}\n---")
    tgt_path.write_text(f"{new_fm}\n\n{switcher(slug)}\n\n{res['body'].strip()}\n", encoding="utf-8")
    ensure_switcher(src, slug)  # add the switcher to the source too

    print(f"✓ wrote {tgt_path}")
    print(f"✓ switcher added to {src.name}")
    print("  (draft — review, then: python3 ~/code/jos-blog/publish_blog.py)")


if __name__ == "__main__":
    main()
