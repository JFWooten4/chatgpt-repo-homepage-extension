"""Register the local research publisher bridge for Chrome or Brave on macOS."""
import argparse
import json
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys

HOST_NAME = "org.research.publisher"
BROWSERS = {"chrome": "Google/Chrome", "brave": "BraveSoftware/Brave-Browser"}


def install(extension_id, browser, repo, support):
    if not re.fullmatch(r"[a-p]{32}", extension_id):
        raise ValueError("Use the 32-character ID shown on the browser extensions page.")
    repo = repo.expanduser().resolve()
    def git(*args):
        return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True).stdout.strip()
    if git("rev-parse", "--show-toplevel") != str(repo):
        raise ValueError("Choose the repository root folder.")
    branch = git("symbolic-ref", "--quiet", "--short", "HEAD")
    git("remote", "get-url", "origin")
    origin = f"chrome-extension://{extension_id}/"
    destination = support / "Research Publisher" / browser / extension_id
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    shutil.copyfile(Path(__file__).with_name("host.py"), destination / "host.py")
    (destination / "config.json").write_text(json.dumps({"repo": str(repo), "branch": branch, "origin": origin}))
    launcher = destination / "launch-host"
    launcher.write_text("#!/bin/sh\nexec " + shlex.quote(sys.executable) + " "
                        + shlex.quote(str(destination / "host.py")) + ' "$@"\n')
    launcher.chmod(0o700)
    hosts = support / BROWSERS[browser] / "NativeMessagingHosts"
    hosts.mkdir(parents=True, exist_ok=True)
    manifest = hosts / f"{HOST_NAME}.json"
    manifest.write_text(json.dumps({
        "name": HOST_NAME,
        "description": "Local research report publisher",
        "path": str(launcher),
        "type": "stdio",
        "allowed_origins": [origin],
    }, indent=2) + "\n")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--extension-id", required=True)
    parser.add_argument("--browser", choices=BROWSERS, required=True)
    parser.add_argument("--repo", type=Path, help="Repository folder; otherwise show a picker")
    args = parser.parse_args()
    if sys.platform != "darwin":
        parser.error("This bridge requires macOS.")
    if not re.fullmatch(r"[a-p]{32}", args.extension_id):
        parser.error("Invalid extension ID.")
    try:
        repo = args.repo
        if repo is None:
            selection = subprocess.run([
                "/usr/bin/osascript", "-e",
                'POSIX path of (choose folder with prompt "Choose the repository for research reports:")',
            ], check=True, capture_output=True, text=True)
            repo = Path(selection.stdout.strip())
        install(args.extension_id, args.browser, repo, Path.home() / "Library/Application Support")
    except (ValueError, OSError, subprocess.CalledProcessError):
        parser.exit(1, "Publisher was not linked. Choose a Git repository with an origin remote and try again.\n")
    print("Publisher linked. Enable Deep research publisher in extension settings, then use Add to repo beside the report download button.")


if __name__ == "__main__":
    main()
