from __future__ import annotations

import json
from typing import Any

from app.schemas import DiffChange


def _canonical_key(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, default=str)


def _flatten(obj: Any, prefix: str, out: dict[str, Any]) -> None:
    if isinstance(obj, dict):
        for k in sorted(obj.keys(), key=lambda x: str(x)):
            p = f"{prefix}.{k}" if prefix else str(k)
            _flatten(obj[k], p, out)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            _flatten(v, f"{prefix}[{i}]", out)
    else:
        out[prefix] = obj


def structured_diff(left: dict[str, Any], right: dict[str, Any]) -> list[DiffChange]:
    """Compare JSON structures ignoring object key order (paths are stable sorted)."""
    la: dict[str, Any] = {}
    ra: dict[str, Any] = {}
    _flatten(left, "", la)
    _flatten(right, "", ra)
    all_keys = sorted(set(la) | set(ra), key=lambda s: (s.count("."), s))
    changes: list[DiffChange] = []
    for k in all_keys:
        lv = la.get(k)
        rv = ra.get(k)
        if k not in la:
            changes.append(DiffChange(path=k or "root", kind="added", old_value=None, new_value=rv))
        elif k not in ra:
            changes.append(DiffChange(path=k or "root", kind="removed", old_value=lv, new_value=None))
        elif _canonical_key(lv) != _canonical_key(rv):
            changes.append(DiffChange(path=k or "root", kind="changed", old_value=lv, new_value=rv))
    return changes
