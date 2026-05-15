import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FolderOpen, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { DiffTable } from "./components/DiffTable";
import { JsonDiffEditor } from "./components/JsonDiffEditor";
import type { JsonMonacoHandle } from "./components/JsonMonaco";
import { JsonMonaco } from "./components/JsonMonaco";
import { ReviewChecklist } from "./components/ReviewChecklist";
import { WorkflowTree } from "./components/WorkflowTree";
import {
  exportUrl,
  fetchDiff,
  fetchReview,
  fetchSummary,
  fetchWorkflow,
  importFolder,
  markReviewed,
  migrate,
  saveWorkflow,
} from "./services/api";
import { useAppStore } from "./store/useAppStore";

export default function App() {
  const qc = useQueryClient();
  const diffViewRef = useRef<JsonMonacoHandle>(null);
  const prodEditorRef = useRef<JsonMonacoHandle>(null);
  const uatEditorRef = useRef<JsonMonacoHandle>(null);

  const sessionId = useAppStore((s) => s.sessionId);
  const files = useAppStore((s) => s.files);
  const selectedFileId = useAppStore((s) => s.selectedFileId);
  const leftJson = useAppStore((s) => s.leftJson);
  const rightJson = useAppStore((s) => s.rightJson);
  const diffChanges = useAppStore((s) => s.diffChanges);
  const reviewItems = useAppStore((s) => s.reviewItems);
  const editMode = useAppStore((s) => s.editMode);
  const jsonValid = useAppStore((s) => s.jsonValid);

  const setSession = useAppStore((s) => s.setSession);
  const setFiles = useAppStore((s) => s.setFiles);
  const selectFile = useAppStore((s) => s.selectFile);
  const setLeftJson = useAppStore((s) => s.setLeftJson);
  const setRightJson = useAppStore((s) => s.setRightJson);
  const setDiffChanges = useAppStore((s) => s.setDiffChanges);
  const setReviewItems = useAppStore((s) => s.setReviewItems);
  const setEditMode = useAppStore((s) => s.setEditMode);
  const setJsonValid = useAppStore((s) => s.setJsonValid);

  // 1. 將 loadFilePayload 移到這裡（在 Migrate 被宣告之前）
  const loadFilePayload = useCallback(async () => {
    if (!sessionId || !selectedFileId) return;
    const orig = (await fetchWorkflow(sessionId, selectedFileId, "original")) as object;
    const cur = (await fetchWorkflow(sessionId, selectedFileId, "current")) as object;
    setLeftJson(JSON.stringify(orig, null, 2));
    setRightJson(JSON.stringify(cur, null, 2));
    try {
      const d = await fetchDiff(sessionId, selectedFileId);
      setDiffChanges(d.changes);
    } catch {
      setDiffChanges([]);
    }
    const r = await fetchReview(sessionId, selectedFileId);
    setReviewItems(r.items);
    setJsonValid(true);
  }, [sessionId, selectedFileId, setDiffChanges, setJsonValid, setLeftJson, setReviewItems, setRightJson]);

  const summaryQuery = useQuery({
    queryKey: ["summary", sessionId],
    queryFn: () => fetchSummary(sessionId!),
    enabled: !!sessionId,
    refetchInterval: false,
  });

  const migrateMutation = useMutation({
    mutationFn: (sessionId: string) => migrate(sessionId),
    onSuccess: async (data) => {
      setFiles(data.files);
      void qc.invalidateQueries({ queryKey: ["summary", data.session_id] });
      await loadFilePayload();
    },
  });

  const importMutation = useMutation({
    mutationFn: (fileList: File[]) => importFolder(fileList),
    onSuccess: (data) => {
      setSession(data.session_id, data.files);
      selectFile(data.files[0]?.file_id ?? null);
      void qc.invalidateQueries({ queryKey: ["summary", data.session_id] });
      migrateMutation.mutate(data.session_id);
    },
  });

  const selectedMeta = useMemo(() => files.find((f) => f.file_id === selectedFileId), [files, selectedFileId]);

  useEffect(() => {
    void loadFilePayload();
  }, [loadFilePayload]);

  const onPickFolder = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list?.length) return;
    const arr = Array.from(list).filter((f) => f.name.toLowerCase().endsWith(".json"));
    importMutation.mutate(arr);
    e.target.value = "";
  };

  const onSave = async () => {
    if (!sessionId || !selectedFileId) return;
    let parsed: object;
    try {
      parsed = JSON.parse(rightJson) as object;
    } catch {
      return;
    }
    const res = await saveWorkflow(sessionId, selectedFileId, parsed);
    if (res.ok) {
      await loadFilePayload();
      const sum = await fetchSummary(sessionId);
      setFiles(sum.files);
    }
  };

  const onToggleReviewed = async (v: boolean) => {
    if (!sessionId || !selectedFileId) return;
    await markReviewed(sessionId, selectedFileId, v);
    const sum = await fetchSummary(sessionId);
    setFiles(sum.files);
    void qc.invalidateQueries({ queryKey: ["summary", sessionId] });
  };

  const summary = summaryQuery.data;

  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-900 overflow-hidden font-sans">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-5 py-3 shadow-sm z-10 relative">
        <div className="text-sm font-semibold tracking-tight text-slate-900 mr-2">n8n Migration Assistant</div>

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-900 focus-within:ring-2 focus-within:ring-indigo-500/20">
          <FolderOpen className="h-4 w-4" />
          Import UAT folder
          <input
            type="file"
            className="hidden"
            multiple
            // @ts-expect-error webkitdirectory
            webkitdirectory=""
            onChange={onPickFolder}
          />
        </label>

        <button
          type="button"
          disabled={!sessionId || !selectedFileId}
          onClick={() => {
            if (!selectedMeta) return;
            const blob = new Blob([rightJson], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = selectedMeta.name.endsWith(".json") ? selectedMeta.name : `${selectedMeta.name}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-40 disabled:hover:bg-white"
        >
          <Download className="h-4 w-4" />
          Download workflow
        </button>

        <button
          type="button"
          disabled={!sessionId}
          onClick={() => sessionId && window.open(exportUrl(sessionId), "_blank")}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-40 disabled:hover:bg-white"
        >
          <Download className="h-4 w-4" />
          Export all workflow
        </button>

        <div className="ml-auto flex min-w-[220px] flex-col gap-1 text-xs text-slate-600">
          <div className="flex justify-between font-medium">
            <span>Progress</span>
            <span>
              {summary ? `${summary.reviewed_marked}/${summary.total} reviewed` : sessionId ? "…" : "—"}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-indigo-500 transition-all duration-500 ease-out"
              style={{
                width: `${summary && summary.total ? Math.round((summary.reviewed_marked / summary.total) * 100) : 0}%`,
              }}
            />
          </div>
          {summary && (
            <div className="flex flex-wrap gap-3 text-[10px] font-medium mt-0.5">
              <span className="text-emerald-600 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> auto {summary.auto_converted}</span>
              <span className="text-amber-600 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> review {summary.manual_review}</span>
              <span className="text-rose-600 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> err {summary.errors}</span>
            </div>
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 p-4 grid-rows-[auto_1fr] md:grid-cols-[280px_1fr_300px] md:grid-rows-none">
        
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <WorkflowTree
            title="Workflows"
            stackId="explorer-workflows"
            files={files}
            selectedId={selectedFileId}
            onSelect={(id) => selectFile(id)}
          />
        </aside>

        <main className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-2 bg-slate-50 p-2 md:gap-3 md:p-3">
            <div className="flex min-h-0 flex-col gap-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 ml-1">Structured diff (paths)</div>
              <DiffTable
                changes={diffChanges}
                leftJson={leftJson}     
                rightJson={rightJson}   
                onJump={(path, kind) => {
                  if (editMode) {
                    if (kind === "removed") {
                      uatEditorRef.current?.jump(path, kind);
                    } else {
                      prodEditorRef.current?.jump(path, kind);
                    }
                  } else {
                    diffViewRef.current?.jump(path, kind);
                  }
                }}
              />
            </div>
            
            {editMode ? (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden">
                <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setEditMode(false)}
                    className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    View diff
                  </button>
                  <button
                    type="button"
                    disabled={!jsonValid}
                    onClick={() => void onSave()}
                    className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-40"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save
                  </button>
                  {!jsonValid && (
                    <span className="text-xs font-medium text-rose-600 bg-rose-50 px-2 py-1 rounded">Invalid JSON</span>
                  )}
                </div>
                <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="flex min-h-[200px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:min-h-0">
                  <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                    UAT JSON (read-only)
                  </div>
                  <JsonMonaco
                    ref={uatEditorRef}
                    editorKey={`uat-${selectedFileId ?? "none"}`}
                    value={leftJson}
                    readOnly
                    onValidate={() => { }}
                  />
                </div>
                <div className="flex min-h-[200px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:min-h-0">
                  <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                    PROD JSON
                  </div>
                  <JsonMonaco
                    ref={prodEditorRef}
                    editorKey={`prod-${selectedFileId ?? "none"}`}
                    value={rightJson}
                    readOnly={false}
                    onChange={(v) => setRightJson(v)}
                    onValidate={(ok) => setJsonValid(ok)}
                  />
                </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden rounded-lg border border-slate-200 shadow-sm">
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5">
                  <div className="text-[10px] font-medium tracking-wide text-slate-500">Side-by-side diff</div>
                  <button
                    type="button"
                    onClick={() => setEditMode(true)}
                    className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    Edit PROD JSON
                  </button>
                </div>
                <JsonDiffEditor
                  ref={diffViewRef}
                  key={`diff-${selectedFileId ?? "none"}`}
                  editorKey={`diff-${selectedFileId ?? "none"}`}
                  original={leftJson}
                  modified={rightJson}
                />
              </div>
            )}
          </div>
        </main>

        <section className="flex min-h-[240px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:min-h-0">
          <ReviewChecklist
            items={reviewItems}
            reviewed={!!selectedMeta?.reviewed}
            onToggleReviewed={(v) => void onToggleReviewed(v)}
            onJump={(path) => (editMode ? prodEditorRef : diffViewRef).current?.jump(path, "review")} 
          />
        </section>
      </div>

      {(importMutation.isError || migrateMutation.isError) && (
        <div className="border-t border-rose-200 bg-rose-50 px-5 py-3 text-sm font-medium text-rose-600">
          {(importMutation.error as Error)?.message || (migrateMutation.error as Error)?.message}
        </div>
      )}
    </div>
  );
}