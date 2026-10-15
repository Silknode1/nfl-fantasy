"""Tiny .env reader so the fantasy scripts run with only the standard library.

Real environment variables win over .env values (GitHub Actions passes secrets as env vars).
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(os.getenv("FANTASY_CACHE") or ROOT / "data_cache")


def load_env(path: Path = ROOT / ".env") -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key.strip(), value)


def need(*names: str) -> None:
    missing = [n for n in names if not os.getenv(n)]
    if missing:
        raise SystemExit(f"Missing in .env or environment: {', '.join(missing)}")
