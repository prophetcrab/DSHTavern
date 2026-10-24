#!/usr/bin/env python3
"""Inline the deck's screenshots so it can be shared as one offline HTML file.

`index.html` stays the hand-editable source and references `assets/*.jpg`.
This script rewrites those references into base64 data URIs and writes
`dist/DSH-Tavern-deck.html`, which opens on a bare `file://` URL with no
sibling files.
"""
import base64
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent
SOURCE = ROOT / "index.html"
OUT = ROOT / "dist" / "DSH-Tavern-deck.html"

ASSET_REF = re.compile(r'src="(assets/[^"]+)"')


def data_uri(path: pathlib.Path) -> str:
    """Encode one image as a data URI, picking the media type from its suffix."""
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def main() -> None:
    """Render the standalone deck and report what it inlined."""
    html = SOURCE.read_text(encoding="utf-8")
    inlined: list[str] = []

    def replace(match: re.Match[str]) -> str:
        rel = match.group(1)
        asset = ROOT / rel
        if not asset.is_file():
            raise SystemExit(f"missing asset: {rel}")
        inlined.append(rel)
        return f'src="{data_uri(asset)}"'

    html = ASSET_REF.sub(replace, html)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"inlined {len(inlined)} screenshot(s)")
    print(f"wrote {OUT.relative_to(ROOT)} — {OUT.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
