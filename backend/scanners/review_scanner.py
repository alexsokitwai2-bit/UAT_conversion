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
                    "message": f"Possible secret in header parameter '{p.get('name')}'",
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

        if pname and re.search(r"\[UAT\]", pname, re.I):
            items.append(
                {
                    "id": _item_id([node_path, "query", str(i), "name", "uat"]),
                    "severity": "medium",
                    "category": "env_label",
                    "message": f"Query parameter name '{pname}' contains [UAT]",
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
                    "message": "UAT domain cp-uat.emperorint.com in query parameter value",
                    "json_path": val_path,
                    "snippet": val[:200],
                    "suggested_field": "value",
                }
            )
        if re.search(r"\[UAT\]", val, re.I):
            items.append(
                {
                    "id": _item_id([node_path, "query", str(i), "uat"]),
                    "severity": "medium",
                    "category": "env_label",
                    "message": "Query parameter value contains [UAT]",
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
                    "message": "Query parameter value contains TBC placeholder",
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
                        "message": f"Possible secret in query parameter '{pname or '(unnamed)'}'",
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
                    "message": "Search / criteria style query parameter — verify no UAT-only or test campaign filters are hardcoded",
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
                    "message": "Static Zoho-style :equals: criterion in query string (no expression) — confirm PROD values",
                    "json_path": val_path,
                    "snippet": val[:200],
                    "suggested_field": "value",
                }
            )

        if ("email_templates" in val or "pass2u" in val.lower() or "template" in val.lower()) and re.search(
            r"/\d{10,}/", val
        ):
            items.append(
                {
                    "id": _item_id([node_path, "query", str(i), "saas_id"]),
                    "severity": "high",
                    "category": "saas_id",
                    "message": "Possible hardcoded SaaS / template numeric ID in query parameter",
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
                    "message": "Possible Hong Kong phone number in query parameter — confirm PROD whitelist",
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
        if re.search(r"\[UAT\]", name, re.I):
            items.append(
                {
                    "id": _item_id(["root", "name", "uat"]),
                    "severity": "medium",
                    "category": "env_label",
                    "message": "Workflow name still contains [UAT]",
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
                if re.search(r"\[UAT\]", val, re.I):
                    items.append(
                        {
                            "id": _item_id([np, field, "uat"]),
                            "severity": "medium",
                            "category": "env_label",
                            "message": f"Field '{field}' contains [UAT]",
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
                            "message": f"Field '{field}' contains TBC placeholder",
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
                            "message": "UAT domain cp-uat.emperorint.com still present",
                            "json_path": f"{np}.parameters.{field}",
                            "snippet": val[:200],
                            "suggested_field": field,
                        }
                    )
                if field == "url" and ("email_templates" in val or "pass2u" in val.lower() or "template" in val.lower()):
                    if re.search(r"/\d{10,}/", val):
                        items.append(
                            {
                                "id": _item_id([np, field, "saas_id"]),
                                "severity": "high",
                                "category": "saas_id",
                                "message": "Possible hardcoded SaaS / template numeric ID in URL",
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
                            "message": "Sub-workflow id not covered by migration_mapping — add to workflowMappings.subWorkflows and set PROD id",
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
                        "message": "Possible Hong Kong phone number — confirm PROD whitelist",
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
                    "message": "Large jsonOutput — may be mock / test payload",
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
                    "message": "Bucket name may reference UAT — verify PROD bucket",
                    "json_path": f"{np}.parameters.bucketName",
                    "snippet": bn,
                    "suggested_field": "bucketName",
                }
            )

    return items
