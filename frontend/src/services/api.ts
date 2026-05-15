import type { DiffChange, ReviewItem, WorkflowFileMeta } from "../types";

const API = "";

export async function importFolder(files: File[]): Promise<{ session_id: string; files: WorkflowFileMeta[] }> {
  const fd = new FormData();
  for (const f of files) {
    fd.append("files", f, f.name);
  }
  const res = await fetch(`${API}/api/import-folder`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function migrate(sessionId: string): Promise<{ session_id: string; files: WorkflowFileMeta[] }> {
  const res = await fetch(`${API}/api/migrate?session_id=${encodeURIComponent(sessionId)}`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchWorkflow(sessionId: string, fileId: string, which: "original" | "current"): Promise<unknown> {
  const res = await fetch(
    `${API}/api/workflow/${encodeURIComponent(sessionId)}/${encodeURIComponent(fileId)}?which=${which}`,
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchDiff(sessionId: string, fileId: string): Promise<{ changes: DiffChange[] }> {
  const res = await fetch(`${API}/api/diff/${encodeURIComponent(sessionId)}/${encodeURIComponent(fileId)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchReview(sessionId: string, fileId: string): Promise<{ items: ReviewItem[] }> {
  const res = await fetch(`${API}/api/review-items/${encodeURIComponent(sessionId)}/${encodeURIComponent(fileId)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function saveWorkflow(sessionId: string, fileId: string, content: object): Promise<{ ok: boolean; validation_errors: string[] }> {
  const res = await fetch(`${API}/api/save/${encodeURIComponent(sessionId)}/${encodeURIComponent(fileId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function markReviewed(sessionId: string, fileId: string, reviewed: boolean): Promise<void> {
  const res = await fetch(
    `${API}/api/mark-reviewed/${encodeURIComponent(sessionId)}/${encodeURIComponent(fileId)}?reviewed=${reviewed}`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error(await res.text());
}

export async function fetchSummary(sessionId: string): Promise<{
  total: number;
  reviewed_marked: number;
  auto_converted: number;
  manual_review: number;
  errors: number;
  files: WorkflowFileMeta[];
}> {
  const res = await fetch(`${API}/api/session/${encodeURIComponent(sessionId)}/summary`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function exportUrl(sessionId: string): string {
  return `${API}/api/export/${encodeURIComponent(sessionId)}`;
}
