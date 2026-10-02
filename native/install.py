"""Register the local research publisher bridge for Chrome or Brave on macOS."""
import argparse
import json
from pathlib import Path
import re
import shlex
import shutil
import struct
import subprocess
import sys

HOST_NAME = "org.research.publisher"
BROWSERS = {"chrome": "Google/Chrome", "brave": "BraveSoftware/Brave-Browser"}


def probe_host(launcher, origin, action="status"):
    payload = json.dumps({"action": action}).encode("utf-8")
    request = struct.pack("=I", len(payload)) + payload
    process = subprocess.run(
        [str(launcher), origin], input=request, capture_output=True, timeout=15,
    )
    if process.returncode != 0 or len(process.stdout) < 4:
        raise ValueError("The installed native host did not start correctly.")
    length = struct.unpack("=I", process.stdout[:4])[0]
    raw = process.stdout[4:]
    if length != len(raw):
        raise ValueError("The installed native host returned an invalid response.")
    try:
        result = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("The installed native host returned an invalid response.") from error
    if not result.get("ok"):
        raise ValueError(result.get("error") or "The installed native host could not verify the repository.")
    return result


def install(extension_id, browser, repo, support, settings_only=False):
    if not re.fullmatch(r"[a-p]{32}", extension_id):
        raise ValueError("Use the 32-character ID shown on the browser extensions page.")
    origin = f"chrome-extension://{extension_id}/"
    destination = support / "Research Publisher" / browser / extension_id
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    config_path = destination / "config.json"
    existing = {}
    if config_path.exists():
        try:
            existing = json.loads(config_path.read_text())
        except (OSError, json.JSONDecodeError):
            existing = {}

    if settings_only:
        repo_value = existing.get("repo") if existing.get("origin") == origin else None
        branch = existing.get("branch") if existing.get("origin") == origin else None
    else:
        repo = repo.expanduser().resolve()
        def git(*args):
            return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True).stdout.strip()
        if git("rev-parse", "--show-toplevel") != str(repo):
            raise ValueError("Choose the repository root folder.")
        branch = git("symbolic-ref", "--quiet", "--short", "HEAD")
        git("remote", "get-url", "origin")
        repo_value = str(repo)

    shutil.copyfile(Path(__file__).with_name("host.py"), destination / "host.py")
    config_path.write_text(json.dumps({"repo": repo_value, "branch": branch, "origin": origin}))
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
    if browser == "brave":
        # Some Brave builds look for user-level hosts in Chrome's directory.
        compatibility = support / BROWSERS["chrome"] / "NativeMessagingHosts" / manifest.name
        if not compatibility.exists() and not compatibility.is_symlink():
            compatibility.parent.mkdir(parents=True, exist_ok=True)
            compatibility.symlink_to(manifest.resolve())
    probe_host(launcher, origin, "codex-settings-status" if settings_only else "status")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--extension-id", required=True)
    parser.add_argument("--browser", choices=BROWSERS, required=True)
    parser.add_argument("--repo", type=Path, help="Repository folder; otherwise show a picker")
    parser.add_argument("--settings-only", action="store_true", help="Install the local bridge without requiring a research repository")
    args = parser.parse_args()
    if sys.platform != "darwin":
        parser.error("This bridge requires macOS.")
    if not re.fullmatch(r"[a-p]{32}", args.extension_id):
        parser.error("Invalid extension ID.")
    try:
        repo = args.repo
        if repo is None and not args.settings_only:
            selection = subprocess.run([
                "/usr/bin/osascript", "-e",
                'POSIX path of (choose folder with prompt "Choose the repository for research reports:")',
            ], check=True, capture_output=True, text=True)
            repo = Path(selection.stdout.strip())
        manifest = install(
            args.extension_id, args.browser, repo,
            Path.home() / "Library/Application Support",
            settings_only=args.settings_only,
        )
        host_manifest = json.loads(manifest.read_text())
        config = json.loads(Path(host_manifest["path"]).with_name("config.json").read_text())
    except (ValueError, OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        parser.exit(1, "Publisher bridge was not verified. Choose a Git repository with an origin remote and try again.\n")
    if args.settings_only:
        print("Local Codex personalization bridge installed and self-tested.")
        print("Return to Flawless ChatGPT settings and use Sync to Codex.")
    else:
        print(f"Publisher bridge installed and self-tested for {Path(config['repo']).name} ({config['branch']}).")
        print("Return to extension settings and use Check connection to confirm the browser can reach it. Add to repo stays hidden until that check succeeds.")


if __name__ == "__main__":
    main()
