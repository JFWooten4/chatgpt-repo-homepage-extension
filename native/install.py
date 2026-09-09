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


def install(extension_id, browser, app, support):
    if not re.fullmatch(r"[a-p]{32}", extension_id):
        raise ValueError("Use the 32-character ID shown on the browser extensions page.")
    app = app.expanduser().resolve()
    if app.suffix != ".app" or not (app / "Contents/Info.plist").is_file():
        raise ValueError("Choose an installed .app bundle.")
    origin = f"chrome-extension://{extension_id}/"
    destination = support / "Research Publisher" / browser / extension_id
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    shutil.copyfile(Path(__file__).with_name("host.py"), destination / "host.py")
    (destination / "config.json").write_text(json.dumps({"app": str(app), "origin": origin}))
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
    parser.add_argument("--app", type=Path, help="Publishing .app; otherwise show a picker")
    args = parser.parse_args()
    if sys.platform != "darwin":
        parser.error("This bridge requires macOS.")
    if not re.fullmatch(r"[a-p]{32}", args.extension_id):
        parser.error("Invalid extension ID.")
    try:
        app = args.app
        if app is None:
            selection = subprocess.run([
                "/usr/bin/osascript", "-e",
                'POSIX path of (choose file with prompt "Choose your DOCX publishing app:" of type {"com.apple.application-bundle"})',
            ], check=True, capture_output=True, text=True)
            app = Path(selection.stdout.strip())
        install(args.extension_id, args.browser, app, Path.home() / "Library/Application Support")
    except (ValueError, OSError, subprocess.CalledProcessError):
        parser.exit(1, "Publisher was not linked. Choose a valid app and try again.\n")
    print("Publisher linked. Enable Deep research publisher in extension settings, then choose Open publisher.")


if __name__ == "__main__":
    main()
