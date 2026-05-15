from typing import Any, Literal

from pydantic import BaseModel, Field


class WorkflowFileMeta(BaseModel):
    file_id: str
    name: str
    status: Literal["auto_converted", "manual_review", "error", "pending"]
    reviewed: bool = False
    node_count: int = 0
    webhook_count: int = 0
    credential_refs: int = 0
    modified_at: str | None = None
    tags: list[str] = Field(default_factory=list)
    error_message: str | None = None


class ImportResponse(BaseModel):
    session_id: str
    files: list[WorkflowFileMeta]


class MigrateResponse(BaseModel):
    session_id: str
    files: list[WorkflowFileMeta]


class DiffChange(BaseModel):
    path: str
    kind: Literal["added", "removed", "changed"]
    old_value: Any | None = None
    new_value: Any | None = None


class DiffResponse(BaseModel):
    file_id: str
    changes: list[DiffChange]


class ReviewItem(BaseModel):
    id: str
    severity: Literal["high", "medium", "low"]
    category: str
    message: str
    json_path: str
    snippet: str | None = None
    suggested_field: str | None = None


class ReviewListResponse(BaseModel):
    file_id: str
    items: list[ReviewItem]


class SaveRequest(BaseModel):
    content: dict[str, Any]


class SaveResponse(BaseModel):
    file_id: str
    ok: bool
    validation_errors: list[str] = Field(default_factory=list)
