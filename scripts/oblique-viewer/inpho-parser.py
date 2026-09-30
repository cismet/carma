"""Strict block reader using the preserved INPHO prototype's value preprocessing."""
from pathlib import Path
import re
import runpy


_prototype = runpy.run_path(str(Path(__file__).parent / "vendor" / "parse_prj.py"))
_preprocess_lines = _prototype["preprocess_lines"]
_parse_number = _prototype["parse_value"]
_NUMBER = re.compile(r"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$")
_FIELD = re.compile(r"^\s*\$([A-Z][A-Z0-9_]*)\s*:\s*(.*)$")
_BLOCK = re.compile(r"^\$([A-Z][A-Z0-9_]*)(?:\s+(\S.*))?\s*$")
_NAMED_ENDS = {
    "COORDINATE_SYSTEM_SET": "END_COORDINATE_SYSTEM",
    "CONTROL_POINTS": "END_POINTS",
    "NAVIGATION": "ENDNAV",
}
_METADATA_BLOCKS = {
    "PROJECT", "COORDINATE_SYSTEM_SET", "CAMERA_DEFINITION",
    "MULTIHEADSYSTEM", "PHOTO", "STATION",
}


class InphoError(ValueError):
    pass


def parse_value_lines(lines):
    joined = " ".join(lines).strip()
    if not joined:
        return None
    if joined.startswith("{") and joined.endswith("}"):
        return joined[1:-1].split()
    values = []
    for line in lines:
        tokens = line.split()
        if tokens and all(_NUMBER.fullmatch(token) for token in tokens):
            numbers = [_parse_number(token) for token in tokens]
            values.append(numbers[0] if len(numbers) == 1 else numbers)
        elif line.strip():
            values.append(re.sub(r"\\([()\[\] ])", r"\1", line.strip()))
    return values[0] if len(values) == 1 else values


def parse_document(text):
    """Retain repeated fields; never recover by silently skipping malformed blocks.

    INPHO's calibration containers have colon headers and unnamed nested ends.
    Fields stay occurrence lists; the importer accepts exactly one active camera
    calibration, instead of conflating multiple calibrations with scalar arrays.
    """
    lines = _preprocess_lines(text.splitlines(keepends=True))
    blocks = []
    active = None
    field = None
    values = []

    def finish_field():
        nonlocal field, values
        if field is not None:
            active["fields"].setdefault(field, []).append(parse_value_lines(values))
        field, values = None, []

    for index, line in enumerate(lines, 1):
        if not line.strip():
            continue
        if "\t" in line[:len(line) - len(line.lstrip())]:
            raise InphoError(f"line {index}: tab indentation is unsupported")
        if line.startswith("$"):
            match = _BLOCK.fullmatch(line)
            if not match:
                raise InphoError(f"line {index}: invalid top-level block marker")
            keyword = match[1]
            if keyword.startswith("END"):
                if active is None:
                    raise InphoError(f"line {index}: unexpected ${keyword}")
                permitted = {"END", f"END_{active['keyword']}"}
                named_end = _NAMED_ENDS.get(active["keyword"])
                if named_end:
                    permitted.add(named_end)
                if keyword not in permitted:
                    raise InphoError(f"line {index}: ${keyword} does not close ${active['keyword']}")
                finish_field()
                blocks.append(active)
                active = None
            else:
                if active is not None:
                    raise InphoError(f"line {index}: ${active['keyword']} has no matching end")
                active = {"keyword": keyword, "fields": {}, "line": index}
            continue
        if active is None:
            raise InphoError(f"line {index}: content outside a top-level block")
        if active["keyword"] not in _METADATA_BLOCKS:
            continue
        match = _FIELD.match(line)
        if match:
            finish_field()
            field, first = match.groups()
            values = [first] if first else []
        elif line.lstrip().startswith("$"):
            finish_field()
        elif field is not None:
            values.append(line.strip())
        else:
            raise InphoError(f"line {index}: value without a field in ${active['keyword']}")
    if active is not None:
        raise InphoError(f"${active['keyword']} has no matching end at EOF")
    return blocks
