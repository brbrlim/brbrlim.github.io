#!/usr/bin/env python3
"""Build the JOS blog locally and deploy it to GitHub Pages.

Why local build: the vault (`~/JOS`) is private and lives only on the M4 hub, and
`content/` is a symlink into `91-Blog`. A GitHub Actions runner can't see that, so
the build runs HERE where the symlink resolves, and only the static `public/`
output is force-pushed to the `gh-pages` branch of origin.

One-time GitHub setup:
  1. create an empty repo (e.g. github.com/<you>/jos-blog)
  2. git -C ~/code/jos-blog remote add origin git@github.com:<you>/jos-blog.git
  3. Settings → Pages → Build and deployment → Deploy from a branch → gh-pages /(root)
Then run this script whenever you want to publish.
"""
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

BLOG = Path(__file__).resolve().parent
PUBLIC = BLOG / "public"
BRANCH = "gh-pages"


def run(cmd, cwd=None):
    print("›", " ".join(str(c) for c in cmd))
    subprocess.run(cmd, cwd=cwd, check=True)


def origin_url():
    r = subprocess.run(["git", "-C", str(BLOG), "remote", "get-url", "origin"],
                       capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else None


def main():
    url = origin_url()
    if not url:
        print("No 'origin' remote yet. Create the GitHub repo, then:\n"
              f"  git -C {BLOG} remote add origin git@github.com:<you>/jos-blog.git")
        sys.exit(1)

    # 1. build (resolves the content symlink into ~/JOS/91-Blog)
    run(["npx", "quartz", "build"], cwd=str(BLOG))
    if not (PUBLIC / "index.html").exists():
        sys.exit("build produced no index.html — aborting")
    (PUBLIC / ".nojekyll").touch()  # stop GitHub Pages from running Jekyll

    # 2. deploy public/ → gh-pages (ephemeral repo, force-push the artifact)
    if (PUBLIC / ".git").exists():
        shutil.rmtree(PUBLIC / ".git")
    msg = "deploy " + datetime.now().strftime("%Y-%m-%d %H:%M")
    run(["git", "init", "-q"], cwd=str(PUBLIC))
    run(["git", "checkout", "-q", "-b", BRANCH], cwd=str(PUBLIC))
    run(["git", "add", "-A"], cwd=str(PUBLIC))
    run(["git", "-c", "user.name=jos-blog", "-c", "user.email=blog@local",
         "commit", "-q", "-m", msg], cwd=str(PUBLIC))
    run(["git", "push", "-f", url, BRANCH], cwd=str(PUBLIC))
    print(f"\n✓ pushed to {BRANCH}. GitHub Pages will refresh in ~1 min.")


if __name__ == "__main__":
    main()
