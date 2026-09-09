"""Launch only the locally configured macOS publishing app via native messaging."""
import json
from pathlib import Path
import struct
import subprocess
import sys


def handle(message, config, origin):
    if origin != config["origin"]:
        raise ValueError("Unknown extension.")
    if message != {"action": "launch"}:
        raise ValueError("Unsupported action.")
    app = Path(config["app"])
    if app.suffix != ".app" or not app.is_dir():
        raise ValueError("Publishing app is missing. Link it again.")
    subprocess.run(["/usr/bin/open", "-a", str(app)], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
    return {"ok": True}


def main():
    try:
        header = sys.stdin.buffer.read(4)
        if len(header) != 4:
            raise ValueError("Missing message header.")
        length = struct.unpack("=I", header)[0]
        if not 0 < length <= 4096:
            raise ValueError("Invalid message size.")
        message = json.loads(sys.stdin.buffer.read(length))
        config = json.loads(Path(__file__).with_name("config.json").read_text())
        result = handle(message, config, sys.argv[1] if len(sys.argv) > 1 else "")
    except Exception:
        result = {"ok": False, "error": "Unable to launch publisher. Link the app again."}
    payload = json.dumps(result).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("=I", len(payload)) + payload)
    sys.stdout.buffer.flush()


if __name__ == "__main__":
    main()
