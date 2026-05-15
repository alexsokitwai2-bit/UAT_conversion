export type FileStatus = "auto_converted" | "manual_review" | "error" | "pending";

export interface WorkflowFileMeta {
  file_id: string;
  name: string;
  status: FileStatus;
  reviewed: boolean;
  node_count: number;
  webhook_count: number;
  credential_refs: number;
  modified_at: string | null;
  tags: string[];
  error_message: string | null;
}

export interface DiffChange {
  path: string;
  kind: "added" | "removed" | "changed";
  old_value: unknown;
  new_value: unknown;
}

export interface ReviewItem {
  id: string;
  severity: "high" | "medium" | "low";
  category: string;
  message: string;
  json_path: string;
  snippet: string | null;
  suggested_field: string | null;
}
