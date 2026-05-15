import type { ReviewItem } from "../types";

function sevBorder(s: ReviewItem["severity"]) {
  if (s === "high") return "border-l-rose-500";
  if (s === "medium") return "border-l-amber-500";
  return "border-l-slate-400";
}

export function ReviewChecklist({
  items,
  onJump,
  reviewed,
  onToggleReviewed,
}: {
  items: ReviewItem[];
  onJump: (path: string) => void;
  reviewed: boolean;
  onToggleReviewed: (v: boolean) => void;
}) {
  return (
    // 移除了這裡原本的 border-l border-slate-200
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-700">
        Manual review
      </div>
      <label className="flex cursor-pointer items-center gap-2.5 border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-800 hover:bg-slate-50 transition-colors">
        <input 
          type="checkbox" 
          checked={reviewed} 
          onChange={(e) => onToggleReviewed(e.target.checked)} 
          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" 
        />
        Mark file as reviewed
      </label>
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto bg-slate-50 p-3">
        {!items.length && <div className="text-sm text-slate-500 text-center py-4">No automated findings for this workflow.</div>}
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => onJump(it.json_path)}
            className={`w-full rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition-all hover:shadow-md hover:border-indigo-300 border-l-4 ${sevBorder(it.severity)}`}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{it.severity}</div>
            <div className="text-sm font-medium text-slate-800 leading-snug">{it.message}</div>
            <div className="mt-2 font-mono text-[11px] text-indigo-600 break-all bg-indigo-50 px-1.5 py-0.5 rounded inline-block">{it.json_path}</div>
            {it.snippet && (
              <pre className="mt-2 max-h-24 overflow-auto rounded bg-slate-100 p-2 text-[11px] font-mono text-slate-600 whitespace-pre-wrap border border-slate-200">{it.snippet}</pre>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}