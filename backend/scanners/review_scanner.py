from __future__ import annotations

import hashlib
import json
import re
from typing import Any


def _item_id(parts: list[str]) -> str:
    h = hashlib.sha256(json.dumps(parts, sort_keys=True).encode()).hexdigest()[:16]
    return f"rev_{h}"


_UAT_DOMAIN = "cp-uat.emperorint.com"
_UUID_RE = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
# n8n exports often use compact alphanumeric workflow ids in executeWorkflow (not UUIDs).
_N8N_SHORT_WF_ID_RE = re.compile(r"^[A-Za-z0-9]{15,20}$")

# `[UAT]` tags and bracketed env markers like `[EIHL-CRM-UAT]` (suffix `-UAT]`).
_UAT_LABEL_RE = re.compile(r"(?i)\[UAT\]|\[[^\]]*-UAT\]")


def _has_uat_env_label(text: str) -> bool:
    return bool(_UAT_LABEL_RE.search(text))


# Zoho CRM-style search criteria in URLs: `(Field:equals:value)` after stripping n8n `{{ ... }}`.
_ZOHO_CRITERIA_OP_RE = re.compile(
    r":(equals|not_equal|not_equals|contains|starts_with|ends_with|in)\s*:",
    re.I,
)


def _url_query_criteria_fragment(url: str) -> str | None:
    """Return the substring after `criteria=` up to the next `&` at paren depth 0, or the rest of the URL."""
    m = re.search(r"criteria=", url, re.I)
    if not m:
        return None
    start = m.end()
    depth = 0
    i = start
    while i < len(url):
        c = url[i]
        if c == "(":
            depth += 1
        elif c == ")":
            depth = max(0, depth - 1)
        elif c == "&" and depth == 0:
            return url[start:i]
        i += 1
    return url[start:]


def _url_has_hardcoded_search_criteria(url: str) -> bool:
    """True if `criteria=` carries literal Zoho criterion values, not only `{{ n8n expressions }}`."""
    frag = _url_query_criteria_fragment(url)
    if frag is None:
        return False
    stripped = re.sub(r"\{\{[\s\S]*?\}\}", "", frag)
    stripped = stripped.strip()
    if not stripped:
        return False
    # Long numeric tokens (Zoho ids, etc.) outside expressions.
    if re.search(r"\d{8,}", stripped):
        return True
    # Literal text after :equals: / :in: / … (empty after op → values are expression-driven).
    for m in _ZOHO_CRITERIA_OP_RE.finditer(stripped):
        chunk = stripped[m.end() :]
        vm = re.match(r"([^)]+)", chunk)
        if not vm:
            continue
        inner = vm.group(1).strip()
        if not inner or re.fullmatch(r"[\s,;|]+", inner):
            continue
        if re.search(r"[\w\u0080-\uFFFF]", inner):
            return True
    return False


def _external_saas_resource_id_hit(text: str) -> bool:
    """Zoho / Pass2U style static resource ids in URLs or JSON-ish strings (see migration guide)."""
    if not isinstance(text, str) or len(text) < 16:
        return False
    # Pass2U API: .../models/{id}/...
    if re.search(r"(?i)pass2u[^\s\"']{0,240}?/models/\d{5,}(?:/|\?|\"|'|\s|$)", text):
        return True
    # Zoho CRM email template path
    if re.search(r"(?i)email_templates/\d{10,}(?:[\"'/\s?;,]|$)", text):
        return True
    # Zoho settings API paths with trailing numeric id
    if re.search(r'(?i)/crm/v2/settings/[^?\s"]+/\d{10,}(?:["\'/\s?]|$)', text):
        return True
    # Zoho module instance URL .../Contacts/663878900000123 (not /.../search? which uses criteria)
    if re.search(r"(?i)/crm/v2/[A-Za-z_]+/\d{13,}(?:[\"'/\s?]|$)", text):
        return True
    stripped = re.sub(r"\{\{[\s\S]*?\}\}", "", text)
    if not re.search(r"\d{10,}", stripped):
        return False
    if re.search(
        r'(?i)["\'](?:benefit|template|layout|module|picklist|campaign)_?id["\']\s*:\s*["\']?(\d{10,})["\']?',
        stripped,
    ):
        return True
    # Benefit payloads: "id": "6638789000003866056" (Zoho-style length) outside expressions
    if re.search(r'(?i)["\']id["\']\s*:\s*["\'](\d{13,})["\']', stripped):
        return True
    return False


def _scan_headers(node_path: str, params: dict[str, Any], items: list[dict[str, Any]]) -> None:
    hp = params.get("headerParameters")
    if not isinstance(hp, dict):
        return
    plist = hp.get("parameters")
    if not isinstance(plist, list):
        return
    for i, p in enumerate(plist):
        if not isinstance(p, dict):
            continue
        name = str(p.get("name", "")).lower()
        val = p.get("value")
        if not isinstance(val, str) or len(val) < 8:
            continue
        if name in ("authorization", "x-api-key") or "bearer" in val.lower():
            items.append(
                {
                    "id": _item_id([node_path, "header", str(i)]),
                    "severity": "high",
                    "category": "api_secret",
                    "message": f"Header may expose secret ({p.get('name')})",
                    "json_path": f"{node_path}.parameters.headerParameters.parameters[{i}].value",
                    "snippet": val[:80] + ("…" if len(val) > 80 else ""),
                    "suggested_field": "value",
                }
            )


# Query param names that often carry Zoho COQL / search / filter strings (see migration guide).
_QUERY_SEARCH_PARAM_NAMES = frozenset(
    {
        "criteria",
        "search",
        "search_text",
        "q",
        "filter",
        "coql",
        "cvid",
        "record_cursor",
    }
)


def _scan_query_parameters(node_path: str, params: dict[str, Any], items: list[dict[str, Any]]) -> None:
    """HTTP Request node: `parameters.queryParameters.parameters[]` (search criteria, filters, static IDs)."""
    qp = params.get("queryParameters")
    if not isinstance(qp, dict):
        return
    plist = qp.get("parameters")
    if not isinstance(plist, list):
        return
    for i, p in enumerate(plist):
        if not isinstance(p, dict):
            continue
        pname_raw = p.get("name")
        pname = str(pname_raw).strip() if pname_raw is not None else ""
        pval = p.get("value")
        base = f"{node_path}.parameters.queryParameters.parameters[{i}]"
        name_l = pname.lower()

        if pname and _has_uat_env_label(pname):
            items.append(
                {
                    "id": _item_id([node_path, "query", str(i), "name", "uat"]),
                    "severity": "medium",
                    "category": "env_label",
                    "message": f"UAT tag in query param name ({pname})",
                    "json_path": f"{base}.name",
                    "snippet": pname[:200],
                    "suggested_field": "name",
                }
            )

        if not isinstance(pval, str):
            continue
        val = pval
        val_path = f"{base}.value"

        if _UAT_DOMAIN in val:
            items.append(
                {
                    "id": _item_id([node_path, "query", str(i), "uat_domain"]),
                    "severity": "high",
                    "category": "uat_domain",
                    "message": "UAT domain in query value",
                    "json_path": val_path,
                    "snippet": val[:200],
                    "suggested_field": "value",
                }
            )
        if _has_uat_env_label(val):
            items.append(
                {
                    "id": _item_id([node_path, "query", str(i), "uat"]),
                    "severity": "medium",
                    "category": "env_label",
                    "message": "UAT tag in query value",
                    "json_path": val_path,
                    "snippet": val[:200],
                    "suggested_field": "value",
                }
            )
        if re.search(r"\bTBC\b", val, re.I):
            items.append(
                {
                    "id": _item_id([node_path, "query", str(i), "tbc"]),
                    "severity": "medium",
                    "category": "placeholder",
                    "message": "TBC placeholder in query value",
                    "json_path": val_path,
                    "snippet": val[:200],
                    "suggested_field": "value",
                }
            )

        # Same spirit as header secrets — rare on query string but e.g. static tokens.
        if len(val) >= 8 and "{{" not in val:
            if name_l in ("authorization", "x-api-key", "api_key", "apikey", "access_token", "token", "client_secret") or (
                "bearer" in val.lower() and not val.strip().startswith("=")
            ):
                items.append(
                    {
                        "id": _item_id([node_path, "query", str(i), "secret"]),
                        "severity": "high",
                        "category": "api_secret",
                        "message": f"Query param may expose secret ({pname or 'unnamed'})",
                        "json_path": val_path,
                        "snippet": val[:80] + ("…" if len(val) > 80 else ""),
                        "suggested_field": "value",
                    }
                )

        if name_l in _QUERY_SEARCH_PARAM_NAMES or "criteria=" in val.lower():
            items.append(
                {
                    "id": _item_id([node_path, "query", str(i), "search_param"]),
                    "severity": "medium",
                    "category": "query_search",
                    "message": "Search/criteria param — check for hardcoded test filters",
                    "json_path": val_path,
                    "snippet": val[:200],
                    "suggested_field": "value",
                }
            )
        elif re.search(r":\s*equals\s*:", val, re.I) and "{{" not in val and len(val) > 15:
            items.append(
                {
                    "id": _item_id([node_path, "query", str(i), "static_criteria"]),
                    "severity": "medium",
                    "category": "query_criteria",
                    "message": "Static Zoho :equals: filter (no n8n expression)",
                    "json_path": val_path,
                    "snippet": val[:200],
                    "suggested_field": "value",
                }
            )

        if _external_saas_resource_id_hit(val):
            items.append(
                {
                    "id": _item_id([node_path, "query", str(i), "saas_id"]),
                    "severity": "high",
                    "category": "saas_id",
                    "message": "Hardcoded external SaaS id",
                    "json_path": val_path,
                    "snippet": val[:200],
                    "suggested_field": "value",
                }
            )

        if re.search(r"852\d{8}", val) or re.search(r"\+?852\s*\d{4}\s*\d{4}", val):
            items.append(
                {
                    "id": _item_id([node_path, "query", str(i), "phone"]),
                    "severity": "medium",
                    "category": "phone",
                    "message": "HK phone in query — verify PROD whitelist",
                    "json_path": val_path,
                    "snippet": val[:200],
                    "suggested_field": None,
                }
            )


def _is_subworkflow_id_value(val: str) -> bool:
    if _UUID_RE.fullmatch(val):
        return True
    if not _N8N_SHORT_WF_ID_RE.match(val):
        return False
    # avoid matching pure numeric strings
    return any(c.isalpha() for c in val) and any(c.isdigit() for c in val)


def _known_workflow_ids(mapping: dict[str, Any]) -> set[str]:
    ids: set[str] = set()
    wf = mapping.get("workflowMappings") or {}
    err = wf.get("errorWorkflow")
    if isinstance(err, dict):
        ids.add(str(err.get("oldId", "")))
        ids.add(str(err.get("newId", "")))
    for m in wf.get("subWorkflows") or []:
        if isinstance(m, dict):
            ids.add(str(m.get("oldId", "")))
            ids.add(str(m.get("newId", "")))
    return {x for x in ids if x}


def scan_workflow(data: dict[str, Any], mapping: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    known_wf = _known_workflow_ids(mapping)

    name = data.get("name")
    if isinstance(name, str):
        if _has_uat_env_label(name):
            items.append(
                {
                    "id": _item_id(["root", "name", "uat"]),
                    "severity": "medium",
                    "category": "env_label",
                    "message": "UAT tag in workflow name",
                    "json_path": "name",
                    "snippet": name,
                    "suggested_field": None,
                }
            )

    nodes = data.get("nodes")
    if not isinstance(nodes, list):
        return items

    for idx, node in enumerate(nodes):
        if not isinstance(node, dict):
            continue
        np = f"nodes[{idx}]"
        params = node.get("parameters")
        if not isinstance(params, dict):
            params = {}

        _scan_headers(np, params, items)
        _scan_query_parameters(np, params, items)

        for field in ("subject", "html", "fromEmail", "toEmail"):
            val = params.get(field)
            if isinstance(val, str):
                if _has_uat_env_label(val):
                    items.append(
                        {
                            "id": _item_id([np, field, "uat"]),
                            "severity": "medium",
                            "category": "env_label",
                            "message": f"UAT tag in {field}",
                            "json_path": f"{np}.parameters.{field}",
                            "snippet": val[:200],
                            "suggested_field": field,
                        }
                    )
                if re.search(r"\bTBC\b", val, re.I):
                    items.append(
                        {
                            "id": _item_id([np, field, "tbc"]),
                            "severity": "medium",
                            "category": "placeholder",
                            "message": f"TBC in {field}",
                            "json_path": f"{np}.parameters.{field}",
                            "snippet": val[:200],
                            "suggested_field": field,
                        }
                    )

        for field in ("url", "jsonBody", "jsonOutput", "jsCode"):
            val = params.get(field)
            if isinstance(val, str):
                if _UAT_DOMAIN in val:
                    items.append(
                        {
                            "id": _item_id([np, field, "uat_domain"]),
                            "severity": "high",
                            "category": "uat_domain",
                            "message": "UAT domain still present",
                            "json_path": f"{np}.parameters.{field}",
                            "snippet": val[:200],
                            "suggested_field": field,
                        }
                    )
                if field in ("url", "jsonBody", "jsonOutput") and _external_saas_resource_id_hit(val):
                    items.append(
                        {
                            "id": _item_id([np, field, "saas_id"]),
                            "severity": "high",
                            "category": "saas_id",
                            "message": "Hardcoded external SaaS id",
                            "json_path": f"{np}.parameters.{field}",
                            "snippet": val[:200],
                            "suggested_field": field,
                        }
                    )

                # Zoho CRM /search?criteria=(...) in parameters.url — only when literals remain after stripping n8n {{ }}.
                if field == "url" and _url_has_hardcoded_search_criteria(val):
                    items.append(
                        {
                            "id": _item_id([np, field, "url_criteria"]),
                            "severity": "medium",
                            "category": "query_search",
                            "message": "Hardcoded Zoho search criteria in URL",
                            "json_path": f"{np}.parameters.{field}",
                            "snippet": val[:200],
                            "suggested_field": field,
                        }
                    )

        wid = params.get("workflowId")
        if isinstance(wid, dict):
            inner_val = wid.get("value")
            if isinstance(inner_val, str) and _is_subworkflow_id_value(inner_val):
                if inner_val not in known_wf:
                    items.append(
                        {
                            "id": _item_id([np, "workflowId"]),
                            "severity": "high",
                            "category": "workflow_id",
                            "message": "Sub-workflow id not in migration_mapping",
                            "json_path": f"{np}.parameters.workflowId.value",
                            "snippet": inner_val,
                            "suggested_field": "workflowId.value",
                        }
                    )

        def phone_scan(text: str, jpath: str) -> None:
            if re.search(r"852\d{8}", text) or re.search(r"\+?852\s*\d{4}\s*\d{4}", text):
                items.append(
                    {
                        "id": _item_id([np, jpath, "phone"]),
                        "severity": "medium",
                        "category": "phone",
                        "message": "HK phone — verify PROD whitelist",
                        "json_path": jpath,
                        "snippet": text[:200],
                        "suggested_field": None,
                    }
                )

        jb = params.get("jsonBody")
        if isinstance(jb, str) and "channel_number" in jb:
            phone_scan(jb, f"{np}.parameters.jsonBody")

        jo = params.get("jsonOutput")
        if isinstance(jo, str) and len(jo) > 400:
            items.append(
                {
                    "id": _item_id([np, "jsonOutput", "large"]),
                    "severity": "low",
                    "category": "mock_data",
                    "message": "Large jsonOutput (likely mock data)",
                    "json_path": f"{np}.parameters.jsonOutput",
                    "snippet": jo[:120] + "…",
                    "suggested_field": "jsonOutput",
                }
            )

        conds = params.get("conditions")
        if isinstance(conds, dict):
            clist = conds.get("conditions")
            if isinstance(clist, list):
                for ci, c in enumerate(clist):
                    if not isinstance(c, dict):
                        continue
                    for side in ("leftValue", "rightValue"):
                        v = c.get(side)
                        if isinstance(v, str):
                            phone_scan(v, f"{np}.parameters.conditions.conditions[{ci}].{side}")

        bn = params.get("bucketName")
        if isinstance(bn, str) and "uat" in bn.lower():
            items.append(
                {
                    "id": _item_id([np, "bucket"]),
                    "severity": "medium",
                    "category": "storage",
                    "message": "Bucket name references UAT",
                    "json_path": f"{np}.parameters.bucketName",
                    "snippet": bn,
                    "suggested_field": "bucketName",
                }
            )

    return items
