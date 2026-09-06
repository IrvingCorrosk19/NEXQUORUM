# -*- coding: utf-8 -*-
from pathlib import Path
import ftfy

ROOT = Path(r"c:\Proyectos\NEXQUORUM\src\Asambleas.Web\wwwroot")
EXTS = {".html", ".js", ".css", ".json", ".svg"}


def suspicious(raw: bytes, text: str) -> bool:
    if b"\xc3\x83\xc6\x92" in raw or b"\xc3\xa2\xe2\x82\xac" in raw:
        return True
    if "\u00c3\u0192" in text or "\u00c3\u00a2" in text:
        return True
    if any(ord(ch) < 32 and ord(ch) not in (9, 10, 13) and ord(ch) > 0x7F for ch in text):
        return True
    # also catch already-single mojibake Ã³ etc when Spanish words expected wrong
    if "Moci\u00c3" in text or "Votaci\u00c3" in text or "qu\u00c3" in text:
        return True
    return False


def main():
    changed = []
    for p in ROOT.rglob("*"):
        if not p.is_file() or p.suffix.lower() not in EXTS:
            continue
        raw = p.read_bytes()
        if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
            text = raw.decode("utf-16")
            fixed = ftfy.fix_text(text)
            out = fixed.encode("utf-8")
            if out != raw:
                p.write_bytes(out)
                changed.append(str(p.relative_to(ROOT)))
            continue
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            continue
        if not suspicious(raw, text):
            continue
        fixed = ftfy.fix_text(text)
        if fixed == text:
            continue
        # normalize newlines to existing style if file used CRLF
        if b"\r\n" in raw:
            fixed = fixed.replace("\n", "\r\n").replace("\r\r\n", "\r\n")
        p.write_bytes(fixed.encode("utf-8"))
        changed.append(str(p.relative_to(ROOT)))

    print("changed", len(changed))
    for c in changed:
        print("FIXED", c)

    a = (ROOT / "assembly.html").read_text(encoding="utf-8")
    for k in ["Moci\u00f3n", "Votaci\u00f3n", "A\u00fan", "aparecer\u00e1", "Podr\u00e1s", "qu\u00f3rum", "Micr\u00f3fono", "C\u00e1mara"]:
        print(("OK" if k in a else "MISSING"), k.encode("unicode_escape").decode())


if __name__ == "__main__":
    main()