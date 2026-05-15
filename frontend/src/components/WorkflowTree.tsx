import { NodeApi, Tree } from "react-arborist";
import { useEffect, useState } from "react";
import type { WorkflowFileMeta } from "../types";

function statusIcon(s: WorkflowFileMeta["status"]) {
  if (s === "auto_converted") return "✅";
  if (s === "manual_review") return "⚠️";
  if (s === "error") return "❌";
  return "⏳";
}

type TreeNode = { id: string; name: string };

export function WorkflowTree({
  files,
  title,
  selectedId,
  onSelect,
  stackId,
}: {
  files: WorkflowFileMeta[];
  title: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  stackId: string;
}) {
  const [height, setHeight] = useState(400);
  const data: TreeNode[] = files.map((f) => ({
    id: f.file_id,
    name: `${statusIcon(f.status)} ${f.name}`,
  }));

  useEffect(() => {
    const el = document.getElementById(stackId);
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(Math.max(200, el.clientHeight - 40)));
    ro.observe(el);
    setHeight(Math.max(200, el.clientHeight - 40));
    return () => ro.disconnect();
  }, [stackId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col border-b border-slate-200 bg-white md:border-b-0 md:border-r">
      <div className="border-b border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</div>
      <div id={stackId} className="min-h-0 flex-1 overflow-hidden p-1">
        <Tree
          data={data}
          className="bg-white outline-none"
          width="100%"
          height={height}
          indent={12}
          rowHeight={26}
          overscanCount={10}
          selection={selectedId ?? undefined}
          onSelect={(nodes: NodeApi<TreeNode>[]) => {
            const n = nodes[0];
            if (n?.data.id) onSelect(n.data.id);
          }}
        >
          {({ node, style, dragHandle }) => (
            <div
              style={style}
              ref={dragHandle}
              className={`flex cursor-pointer items-center rounded px-2 text-sm ${
                node.isSelected ? "bg-blue-100 text-slate-900" : "text-slate-800 hover:bg-slate-100"
              }`}
              onClick={() => onSelect(node.data.id)}
            >
              <span className="truncate">{node.data.name}</span>
            </div>
          )}
        </Tree>
      </div>
    </div>
  );
}
