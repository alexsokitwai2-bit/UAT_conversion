from __future__ import annotations

import copy
import json
import re
from typing import Any, Callable


def load_mapping(raw: dict[str, Any]) -> dict[str, Any]:
    return raw


def _walk_strings(obj: Any, fn: Callable[[str], str]) -> Any:
    if isinstance(obj, str):
        return fn(obj)
    if isinstance(obj, list):
        return [_walk_strings(x, fn) for x in obj]
    if isinstance(obj, dict):
        return {k: _walk_strings(v, fn) for k, v in obj.items()}
    return obj


def _replace_domains(s: str, domains: dict[str, str]) -> str:
    out = s
    for old, new in domains.items():
        out = out.replace(old, new)
    return out


def _replace_kv_in_strings(s: str, kv: dict[str, str]) -> str:
    out = s
    for old, new in kv.items():
        out = out.replace(old, new)
    return out


def _strip_uat_name(name: str) -> str:
    return re.sub(r"\[UAT\]\s*", "", name, flags=re.IGNORECASE).strip()


def _apply_credentials(nodes: list[dict[str, Any]], credential_mappings: dict[str, Any]) -> None:
    for node in nodes:
        creds = node.get("credentials")
        if not isinstance(creds, dict):
            continue
        for _ctype, ref in creds.items():
            if not isinstance(ref, dict):
                continue
            cid = str(ref.get("id", ""))
            cname = str(ref.get("name", ""))
            for _key, cmap in credential_mappings.items():
                if not isinstance(cmap, dict):
                    continue
                if cid == str(cmap.get("oldId", "")) or cname == str(cmap.get("oldName", "")):
                    ref["id"] = cmap.get("newId", ref.get("id"))
                    ref["name"] = cmap.get("newName", ref.get("name"))


def _apply_error_workflow(settings: dict[str, Any], wf_map: dict[str, Any]) -> None:
    err = wf_map.get("errorWorkflow")
    if not isinstance(err, dict):
        return
    old_id = str(err.get("oldId", ""))
    new_id = str(err.get("newId", ""))
    cur = settings.get("errorWorkflow")
    if cur is not None and str(cur) == old_id:
        settings["errorWorkflow"] = new_id


def _apply_subworkflow_ids(obj: Any, mappings: list[dict[str, str]]) -> Any:
    if isinstance(obj, dict):
        if "workflowId" in obj and isinstance(obj["workflowId"], dict):
            inner = obj["workflowId"]
            val = inner.get("value")
            if val is not None:
                sval = str(val)
                for m in mappings:
                    if sval == str(m.get("oldId", "")):
                        inner["value"] = m.get("newId", val)
        return {k: _apply_subworkflow_ids(v, mappings) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_apply_subworkflow_ids(x, mappings) for x in obj]
    return obj


def _apply_webhook_paths(nodes: list[dict[str, Any]], path_map: dict[str, str]) -> None:
    for node in nodes:
        params = node.get("parameters")
        if not isinstance(params, dict):
            continue
        p = params.get("path")
        if isinstance(p, str) and p in path_map:
            params["path"] = path_map[p]


def migrate_workflow(data: dict[str, Any], mapping: dict[str, Any]) -> dict[str, Any]:
    w = copy.deepcopy(data)

    for k in ("id", "versionId", "meta"):
        w.pop(k, None)

    if isinstance(w.get("name"), str):
        w["name"] = _strip_uat_name(w["name"])

    domains = mapping.get("domains") or {}
    bucket_mappings = mapping.get("bucketMappings") or {}
    wati_channels = mapping.get("watiChannels") or {}
    email_mappings = mapping.get("emailMappings") or {}

    def string_migrate(s: str) -> str:
        s2 = _replace_domains(s, domains)
        s2 = _replace_kv_in_strings(s2, bucket_mappings)
        s2 = _replace_kv_in_strings(s2, wati_channels)
        s2 = _replace_kv_in_strings(s2, email_mappings)
        return s2

    w = _walk_strings(w, string_migrate)

    nodes = w.get("nodes")
    if isinstance(nodes, list):
        _apply_credentials(nodes, mapping.get("credentialMappings") or {})
        _apply_webhook_paths(nodes, mapping.get("webhookPathMappings") or {})

    settings = w.get("settings")
    if isinstance(settings, dict):
        _apply_error_workflow(settings, (mapping.get("workflowMappings") or {}))

    sub_maps = (mapping.get("workflowMappings") or {}).get("subWorkflows") or []
    if isinstance(sub_maps, list):
        w = _apply_subworkflow_ids(w, sub_maps)

    return w


def workflow_stats(data: dict[str, Any]) -> tuple[int, int, int]:
    nodes = data.get("nodes")
    if not isinstance(nodes, list):
        return 0, 0, 0
    n = len(nodes)
    webhooks = 0
    cred_refs = 0
    for node in nodes:
        if not isinstance(node, dict):
            continue
        t = str(node.get("type", "")).lower()
        if "webhook" in t:
            webhooks += 1
        creds = node.get("credentials")
        if isinstance(creds, dict) and creds:
            cred_refs += len(creds)
    return n, webhooks, cred_refs


def extract_tags(data: dict[str, Any]) -> list[str]:
    tags = data.get("tags")
    if isinstance(tags, list):
        out: list[str] = []
        for t in tags:
            if isinstance(t, dict) and "name" in t:
                out.append(str(t["name"]))
            elif isinstance(t, str):
                out.append(t)
        return out
    return []
