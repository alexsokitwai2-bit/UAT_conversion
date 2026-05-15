from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class StoredWorkflow:
    file_id: str
    display_name: str
    original: dict[str, Any]
    migrated: dict[str, Any] | None = None
    current: dict[str, Any] | None = None
    reviewed: bool = False
    error_message: str | None = None
    modified_at: str | None = None
    tags: list[str] = field(default_factory=list)

    def effective(self) -> dict[str, Any]:
        if self.current is not None:
            return self.current
        if self.migrated is not None:
            return self.migrated
        return self.original


@dataclass
class Session:
    id: str
    workflows: dict[str, StoredWorkflow] = field(default_factory=dict)
    created_at: str = field(default_factory=utc_now_iso)


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}

    def new_session(self) -> Session:
        sid = str(uuid.uuid4())
        s = Session(id=sid)
        self._sessions[sid] = s
        return s

    def get(self, session_id: str) -> Session | None:
        return self._sessions.get(session_id)

    def delete(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)


store = SessionStore()
