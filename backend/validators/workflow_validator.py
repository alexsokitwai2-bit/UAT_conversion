from __future__ import annotations

import json
from typing import Any


def validate_json_syntax(raw: str) -> tuple[bool, list[str], dict[str, Any] | None]:
    errors: list[str] = []
    try:
        data = json.loads(raw)
        return True, errors, data
    except json.JSONDecodeError as e:
        errors.append(str(e))
        return False, errors, None


def validate_n8n_workflow(data: dict[str, Any]) -> list[str]:
    errs: list[str] = []
    if not isinstance(data, dict):
        return ["Root must be an object"]
    if "nodes" not in data:
        errs.append("Missing required field: nodes")
    else:
        nodes = data.get("nodes")
        if not isinstance(nodes, list):
            errs.append("nodes must be an array")
        else:
            for i, node in enumerate(nodes):
                if not isinstance(node, dict):
                    errs.append(f"nodes[{i}] must be an object")
                    continue
                if "name" not in node:
                    errs.append(f"nodes[{i}] missing name")
                if "type" not in node:
                    errs.append(f"nodes[{i}] missing type")
                if "parameters" not in node:
                    errs.append(f"nodes[{i}] missing parameters")
    if "connections" in data and not isinstance(data["connections"], dict):
        errs.append("connections must be an object when present")
    return errs
