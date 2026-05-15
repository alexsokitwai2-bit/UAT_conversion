import { useMemo } from "react";
import type { DiffChange } from "../types";

function rowClass(k: DiffChange["kind"]) {
  if (k === "added") return "bg-emerald-50/50";
  if (k === "removed") return "bg-rose-50/50";
  return "bg-amber-50/50";
}

function kindLabel(k: DiffChange["kind"]) {
  if (k === "added") return "text-emerald-700 bg-emerald-100/50 px-1.5 py-0.5 rounded text-[10px]";
  if (k === "removed") return "text-rose-700 bg-rose-100/50 px-1.5 py-0.5 rounded text-[10px]";
  return "text-amber-700 bg-amber-100/50 px-1.5 py-0.5 rounded text-[10px]";
}

function getValueByPath(obj: any, path: string) {
  if (!path || !obj) return undefined;
  const parts = path.replace(/\]/g, "").split(/[.\[]/).filter(Boolean);
  let current = obj;
  for (const p of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[p];
  }
  return current;
}

function formatValue(val: any) {
  if (val === undefined) return "undefined";
  if (val === null) return "null";
  if (typeof val === "object") return "{...}";
  const s = String(val);
  return s.length > 40 ? s.substring(0, 37) + "..." : s;
}

// 升級版：支援 n8n 表達式 (開頭帶有 =) 的深度比對
function findDeepDifference(lhs: any, rhs: any): { oldVal: any; newVal: any } | null {
  // 嘗試安全解析 n8n 參數字串的內部工具
  const parseIfJson = (val: any) => {
    if (typeof val !== "string") return { parsed: false, val };
    let str = val.trim();
    // 關鍵修復：如果是 n8n expression，移除開頭的 "="
    if (str.startsWith("=")) {
      str = str.substring(1).trim();
    }
    if ((str.startsWith("{") && str.endsWith("}")) || (str.startsWith("[") && str.endsWith("]"))) {
      try {
        return { parsed: true, val: JSON.parse(str) };
      } catch (e) {
        return { parsed: false, val };
      }
    }
    return { parsed: false, val };
  };

  const pLhs = parseIfJson(lhs);
  const pRhs = parseIfJson(rhs);

  // 如果兩邊都能成功被當作 JSON 解析
  if (pLhs.parsed && pRhs.parsed) {
    const objLhs = pLhs.val;
    const objRhs = pRhs.val;

    if (objLhs !== null && objRhs !== null && typeof objLhs === "object" && typeof objRhs === "object") {
      const keys = new Set([...Object.keys(objLhs), ...Object.keys(objRhs)]);
      const diffs = [];

      for (const k of keys) {
        if (JSON.stringify(objLhs[k]) !== JSON.stringify(objRhs[k])) {
          diffs.push({ k, v1: objLhs[k], v2: objRhs[k] });
        }
      }

      // 如果「只有一個」屬性改變，繼續往深處挖！
      if (diffs.length === 1) {
        const deeper = findDeepDifference(diffs[0].v1, diffs[0].v2);
        if (deeper) return deeper;
      }
    }
  }

  // 挖到底層，發現是基本型別且不相等，回傳精確差異
  if (typeof lhs !== "object" && typeof rhs !== "object" && lhs !== rhs) {
    return { oldVal: lhs, newVal: rhs };
  }

  // 如果無法挖到單一差異點，退回顯示原始字串
  return { oldVal: lhs, newVal: rhs };
}

// 根據截圖定義的 n8n JSON 根節點順序
const N8N_ROOT_ORDER = [
  "name",
  "nodes",
  "pinData",
  "connections",
  "active",
  "settings",
  "versionId",
  "meta",
  "id",
  "tags"
];

// 取得 path 的第一層 key (例如從 "nodes[0].name" 提取出 "nodes")
function getRootKey(path: string) {
  if (!path) return "";
  return path.split(/[.\[]/)[0];
}

export function DiffTable({
  changes,
  onJump,
  leftJson,
  rightJson,
}: {
  changes: DiffChange[];
  onJump?: (path: string, kind: DiffChange["kind"]) => void;
  leftJson?: string;
  rightJson?: string;
}) {
  const leftObj = useMemo(() => {
    try { return leftJson ? JSON.parse(leftJson) : {}; } catch { return {}; }
  }, [leftJson]);

  const rightObj = useMemo(() => {
    try { return rightJson ? JSON.parse(rightJson) : {}; } catch { return {}; }
  }, [rightJson]);

  // 新增排序邏輯
  const sortedChanges = useMemo(() => {
    if (!changes) return [];
    return [...changes].sort((a, b) => {
      const rootA = getRootKey(a.path || "");
      const rootB = getRootKey(b.path || "");

      const indexA = N8N_ROOT_ORDER.indexOf(rootA);
      const indexB = N8N_ROOT_ORDER.indexOf(rootB);

      // 如果兩者都在定義的順序陣列中
      if (indexA !== -1 && indexB !== -1) {
        if (indexA !== indexB) return indexA - indexB;
        // 修改這裡：加入 { numeric: true } 讓陣列索引 [3] 能夠排在 [21] 前面
        return (a.path || "").localeCompare(b.path || "", undefined, { numeric: true });
      }

      // 如果其中一個不在定義清單中，確保未知的節點排在最後面
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;

      // 如果都不在清單中，按照一般字母排序（修改這裡：同樣加入 numeric: true 以防萬一）
      return (a.path || "").localeCompare(b.path || "", undefined, { numeric: true });
    });
  }, [changes]);

  if (!sortedChanges.length) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="text-sm font-medium text-slate-400">No structural differences detected.</div>
      </div>
    );
  }

  return (
    <div className="max-h-52 overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm md:max-h-56">
      <table className="w-full text-left text-[11px] border-collapse">
        <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-500 shadow-sm">
          <tr>
            <th className="px-3 py-2 font-semibold uppercase tracking-wider w-1/3">Path</th>
            <th className="px-3 py-2 font-semibold uppercase tracking-wider w-16">Kind</th>
            <th className="px-3 py-2 font-semibold uppercase tracking-wider">Details (UAT → PROD)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {/* 改為使用 sortedChanges 進行渲染 */}
          {sortedChanges.slice(0, 500).map((c, i) => {
            const valLhs = c.old_value !== undefined ? c.old_value : getValueByPath(leftObj, c.path);
            const valRhs = c.new_value !== undefined ? c.new_value : getValueByPath(rightObj, c.path);

            let displayLhs = valLhs;
            let displayRhs = valRhs;

            if (c.kind === "changed") {
              const deepDiff = findDeepDifference(valLhs, valRhs);
              if (deepDiff) {
                displayLhs = deepDiff.oldVal;
                displayRhs = deepDiff.newVal;
              }
            }

            let textLhs = formatValue(displayLhs);
            let textRhs = formatValue(displayRhs);

            if (c.kind === "changed" && typeof displayLhs === "string" && typeof displayRhs === "string") {
              if (displayLhs.length > 40 || displayRhs.length > 40) {
                let diffIdx = 0;
                while (
                  diffIdx < displayLhs.length &&
                  diffIdx < displayRhs.length &&
                  displayLhs[diffIdx] === displayRhs[diffIdx]
                ) {
                  diffIdx++;
                }

                if (diffIdx > 20) {
                  const start = Math.max(0, diffIdx - 15);
                  textLhs = "..." + displayLhs.substring(start, start + 35).replace(/[\r\n]+/g, ' ') + "...";
                  textRhs = "..." + displayRhs.substring(start, start + 35).replace(/[\r\n]+/g, ' ') + "...";
                }
              }
            }

            return (
              <tr
                key={`${c.path}-${i}`}
                className={`cursor-pointer transition-colors hover:bg-slate-100/80 ${rowClass(c.kind)}`}
                onClick={() => {
                  if (c.path && onJump) onJump(c.path, c.kind);
                }}
              >
                <td className="px-3 py-2 font-mono text-slate-700 break-all leading-relaxed">
                  {c.path || "root"}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={kindLabel(c.kind)}>{c.kind}</span>
                </td>
                <td className="px-3 py-2 font-mono text-[10px] text-slate-500">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {c.kind === "added" && (
                      <span className="text-emerald-600 bg-emerald-50 px-1 rounded border border-emerald-100">
                        + {textRhs}
                      </span>
                    )}
                    {c.kind === "removed" && (
                      <span className="text-rose-600 bg-rose-50 px-1 rounded border border-rose-100">
                        - {textLhs}
                      </span>
                    )}
                    {c.kind === "changed" && (
                      <>
                        <span className="text-slate-400 line-through decoration-slate-300">
                          {textLhs}
                        </span>
                        <span className="text-slate-400">→</span>
                        <span className="text-amber-700 font-medium bg-amber-50 px-1 rounded border border-amber-100/50">
                          {textRhs}
                        </span>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sortedChanges.length > 500 && (
        <div className="border-t border-slate-100 bg-slate-50 p-2 text-center text-[10px] font-medium text-slate-400">
          Showing first 500 of {sortedChanges.length} changes.
        </div>
      )}
    </div>
  );
}