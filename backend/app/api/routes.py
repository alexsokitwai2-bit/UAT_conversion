from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime, timezone
from typing import Any

import orjson
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from app.config import settings
from app.schemas import (
    DiffResponse,
    ImportResponse,
    MigrateResponse,
    ReviewItem,
    ReviewListResponse,
    SaveRequest,
    SaveResponse,
    WorkflowFileMeta,
)
from app.session_store import StoredWorkflow, store
from diff.json_diff import structured_diff
from migration.engine import extract_tags, migrate_workflow, workflow_stats
from scanners.review_scanner import scan_workflow
from validators.workflow_validator import validate_n8n_workflow

router = APIRouter(prefix="/api", tags=["api"])

_mapping_cache: dict[str, Any] | None = None
_mapping_mtime: float | None = None


def get_mapping() -> dict[str, Any]:
    global _mapping_cache, _mapping_mtime
    path = settings.mapping_path
    if not path.exists():
        raise HTTPException(status_code=500, detail=f"migration_mapping.json not found at {path}")
    mtime = path.stat().st_mtime
    if _mapping_cache is None or _mapping_mtime != mtime:
        _mapping_cache = json.loads(path.read_text(encoding="utf-8"))
        _mapping_mtime = mtime
    return _mapping_cache


def _meta_from_stored(sw: StoredWorkflow, mapping: dict[str, Any]) -> WorkflowFileMeta:
    data = sw.effective()
    n, wh, cr = workflow_stats(data)
    review = scan_workflow(data, mapping)
    has_any = len(review) > 0

    if sw.migrated is not None:
        st = "manual_review" if has_any else "auto_converted"
    elif sw.error_message:
        st = "error"
    else:
        st = "pending"

    return WorkflowFileMeta(
        file_id=sw.file_id,
        name=sw.display_name,
        status=st,
        node_count=n,
        webhook_count=wh,
        credential_refs=cr,
        modified_at=sw.modified_at,
        tags=sw.tags,
        error_message=sw.error_message if st == "error" else None,
        reviewed=sw.reviewed,
    )


@router.post("/import-folder", response_model=ImportResponse)
async def import_folder(files: list[UploadFile] = File(...)) -> ImportResponse:
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")
    session = store.new_session()
    mapping = get_mapping()

    for uf in files:
        raw = await uf.read()
        fname = uf.filename or "unknown.json"
        if not fname.lower().endswith(".json"):
            continue
        fid = fname.replace("\\", "/").split("/")[-1]
        fid_key = str(len(session.workflows)) + "_" + fid
        try:
            data = orjson.loads(raw)
        except orjson.JSONDecodeError as e:
            sw = StoredWorkflow(
                file_id=fid_key,
                display_name=fid,
                original={},
                error_message=str(e),
                modified_at=datetime.now(timezone.utc).isoformat(),
            )
            session.workflows[fid_key] = sw
            continue
        if not isinstance(data, dict):
            sw = StoredWorkflow(
                file_id=fid_key,
                display_name=fid,
                original={},
                error_message="Root JSON must be an object",
                modified_at=datetime.now(timezone.utc).isoformat(),
            )
            session.workflows[fid_key] = sw
            continue
        errs = validate_n8n_workflow(data)
        err_msg = "; ".join(errs) if errs else None
        sw = StoredWorkflow(
            file_id=fid_key,
            display_name=fid,
            original=data,
            migrated=None,
            current=None,
            error_message=err_msg,
            modified_at=datetime.now(timezone.utc).isoformat(),
            tags=extract_tags(data),
        )
        session.workflows[fid_key] = sw

    metas = [_meta_from_stored(sw, mapping) for sw in session.workflows.values()]
    return ImportResponse(session_id=session.id, files=metas)


@router.post("/migrate", response_model=MigrateResponse)
async def migrate(session_id: str = Query(..., description="Session from import-folder")) -> MigrateResponse:
    session = store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    mapping = get_mapping()
    for sw in session.workflows.values():
        if not sw.original:
            continue
        errs = validate_n8n_workflow(sw.original)
        if errs:
            sw.error_message = "; ".join(errs)
            continue
        try:
            migrated = migrate_workflow(sw.original, mapping)
        except Exception as e:  # noqa: BLE001
            sw.error_message = str(e)
            continue
        sw.migrated = migrated
        sw.current = orjson.loads(orjson.dumps(migrated))
        sw.error_message = None
    metas = [_meta_from_stored(sw, mapping) for sw in session.workflows.values()]
    return MigrateResponse(session_id=session.id, files=metas)


@router.get("/diff/{session_id}/{file_id}", response_model=DiffResponse)
async def get_diff(session_id: str, file_id: str) -> DiffResponse:
    session = store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    sw = session.workflows.get(file_id)
    if not sw:
        raise HTTPException(status_code=404, detail="File not found")
    if sw.migrated is None:
        raise HTTPException(status_code=400, detail="Run migrate first")
    changes = structured_diff(sw.original, sw.effective())
    return DiffResponse(file_id=file_id, changes=changes)


@router.get("/review-items/{session_id}/{file_id}", response_model=ReviewListResponse)
async def get_review(session_id: str, file_id: str) -> ReviewListResponse:
    session = store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    sw = session.workflows.get(file_id)
    if not sw:
        raise HTTPException(status_code=404, detail="File not found")
    mapping = get_mapping()
    raw_items = scan_workflow(sw.effective(), mapping)
    items = [ReviewItem(**r) for r in raw_items]
    return ReviewListResponse(file_id=file_id, items=items)


@router.post("/save/{session_id}/{file_id}", response_model=SaveResponse)
async def save_workflow(session_id: str, file_id: str, body: SaveRequest) -> SaveResponse:
    session = store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    sw = session.workflows.get(file_id)
    if not sw:
        raise HTTPException(status_code=404, detail="File not found")
    errs = validate_n8n_workflow(body.content)
    if errs:
        return SaveResponse(file_id=file_id, ok=False, validation_errors=errs)
    sw.current = body.content
    sw.modified_at = datetime.now(timezone.utc).isoformat()
    return SaveResponse(file_id=file_id, ok=True, validation_errors=[])


@router.post("/mark-reviewed/{session_id}/{file_id}")
async def mark_reviewed(session_id: str, file_id: str, reviewed: bool = True) -> dict[str, Any]:
    session = store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    sw = session.workflows.get(file_id)
    if not sw:
        raise HTTPException(status_code=404, detail="File not found")
    sw.reviewed = bool(reviewed)
    return {"file_id": file_id, "reviewed": sw.reviewed}


@router.get("/export/{session_id}")
async def export_zip(session_id: str) -> StreamingResponse:
    session = store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    mapping = get_mapping()
    buf = io.BytesIO()
    review_report: list[dict[str, Any]] = []
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for sw in session.workflows.values():
            if sw.current is None and sw.migrated is None:
                continue
            data = sw.effective()
            name_safe = sw.display_name.replace("/", "_")
            zf.writestr(f"workflows/{name_safe}", orjson.dumps(data, option=orjson.OPT_INDENT_2))
            review_report.append(
                {
                    "file": sw.display_name,
                    "reviewed": sw.reviewed,
                    "items": [i.model_dump() for i in scan_workflow(data, mapping)],
                }
            )
        zf.writestr(
            "migration_report.json",
            orjson.dumps(
                {
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                    "files": [m.model_dump() for m in [_meta_from_stored(x, mapping) for x in session.workflows.values()]],
                },
                option=orjson.OPT_INDENT_2,
            ).decode(),
        )
        zf.writestr("manual_review_report.json", orjson.dumps(review_report, option=orjson.OPT_INDENT_2).decode())
    buf.seek(0)
    headers = {"Content-Disposition": f'attachment; filename="n8n-prod-export-{session_id[:8]}.zip"'}
    return StreamingResponse(buf, media_type="application/zip", headers=headers)


@router.get("/workflow/{session_id}/{file_id}")
async def get_workflow_json(session_id: str, file_id: str, which: str = "current") -> dict[str, Any]:
    session = store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    sw = session.workflows.get(file_id)
    if not sw:
        raise HTTPException(status_code=404, detail="File not found")
    if which == "original":
        return sw.original
    if which == "migrated" and sw.migrated is not None:
        return sw.migrated
    return sw.effective()


@router.get("/session/{session_id}/summary")
async def session_summary(session_id: str) -> dict[str, Any]:
    session = store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    mapping = get_mapping()
    files = [_meta_from_stored(sw, mapping) for sw in session.workflows.values()]
    reviewed = sum(1 for sw in session.workflows.values() if sw.reviewed)
    auto = sum(1 for f in files if f.status == "auto_converted")
    manual = sum(1 for f in files if f.status == "manual_review")
    errors = sum(1 for f in files if f.status == "error")
    return {
        "session_id": session_id,
        "total": len(files),
        "reviewed_marked": reviewed,
        "auto_converted": auto,
        "manual_review": manual,
        "errors": errors,
        "files": [f.model_dump() for f in files],
    }
