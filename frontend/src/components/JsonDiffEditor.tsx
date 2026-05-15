import { DiffEditor, type Monaco } from "@monaco-editor/react";
import type * as monaco from "monaco-editor";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { LIGHT_DIFF_THEME_ID, registerLightDiffTheme } from "../monaco/lightDiffTheme";
import type { JsonMonacoHandle } from "./JsonMonaco";

type Props = {
  original: string;
  modified: string;
  editorKey: string;
};

export const JsonDiffEditor = forwardRef<JsonMonacoHandle, Props>(function JsonDiffEditorInner(
  { original, modified, editorKey },
  ref,
) {
  const diffRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const originalDecorationsRef = useRef<string[]>([]);
  const modifiedDecorationsRef = useRef<string[]>([]);

  const jump = useCallback((jsonPath: string, kind?: string) => {
    const isReview = kind === "review";
    const diff = diffRef.current;
    const ed = kind === "removed" ? diff?.getOriginalEditor() : diff?.getModifiedEditor();
    const model = ed?.getModel();
    if (!ed || !model) return;
    
    const text = model.getValue();
    const parts = jsonPath.replace(/\]/g, "").split(/[.\[]/).filter(Boolean);
    let currentOffset = 0;

    for (let p = 0; p < parts.length; p++) {
      const part = parts[p];
      const isArrayIdx = !isNaN(Number(part));

      let depth = 0;
      let inString = false;
      let escape = false;
      let foundIdx = -1;

      if (isArrayIdx) {
        const targetItem = Number(part);
        let itemCount = -1;
        let isWaitingForElement = false;

        for (let i = currentOffset; i < text.length; i++) {
          const c = text[i];
          if (inString) {
            if (escape) escape = false;
            else if (c === '\\') escape = true;
            else if (c === '"') inString = false;
          } else {
            if (c === '"') {
              inString = true;
              if (depth === 1 && isWaitingForElement) {
                itemCount++;
                if (itemCount === targetItem) { foundIdx = i; break; }
                isWaitingForElement = false;
              }
            } else if (c === '[') {
              depth++;
              if (depth === 1) {
                isWaitingForElement = true;
              } else if (depth === 2 && isWaitingForElement) {
                itemCount++;
                if (itemCount === targetItem) { foundIdx = i; break; }
                isWaitingForElement = false;
              }
            } else if (c === '{') {
              depth++;
              if (depth === 2 && isWaitingForElement) {
                itemCount++;
                if (itemCount === targetItem) { foundIdx = i; break; }
                isWaitingForElement = false;
              }
            } else if (c === ']' || c === '}') {
              depth--;
              if (depth <= 0 && i > currentOffset) break;
            } else if (c === ',' && depth === 1) {
              isWaitingForElement = true;
            } else if (depth === 1 && isWaitingForElement && c.trim() !== '') {
              itemCount++;
              if (itemCount === targetItem) { foundIdx = i; break; }
              isWaitingForElement = false;
            }
          }
        }
      } else {
        for (let i = currentOffset; i < text.length; i++) {
          const c = text[i];
          if (inString) {
            if (escape) escape = false;
            else if (c === '\\') escape = true;
            else if (c === '"') inString = false;
          } else {
            if (c === '"') {
              inString = true;
              if (depth === 1) {
                if (text.startsWith(`"${part}"`, i)) {
                  let j = i + part.length + 2;
                  while (j < text.length && /\s/.test(text[j])) j++;
                  if (text[j] === ':') {
                    foundIdx = i;
                    break;
                  }
                }
              }
            } else if (c === '{' || c === '[') {
              depth++;
            } else if (c === '}' || c === ']') {
              depth--;
              if (depth <= 0 && i > currentOffset) break;
            }
          }
        }
      }

      if (foundIdx !== -1) {
        currentOffset = foundIdx;
      } else {
        break;
      }
    }

    if (currentOffset !== -1 && currentOffset !== 0) {
      const pos = model.getPositionAt(currentOffset);
      ed.revealPositionInCenter(pos);
      ed.setPosition(pos);
      ed.focus();

      const origEd = diff?.getOriginalEditor();
      const modEd = diff?.getModifiedEditor();
      if (origEd) {
        originalDecorationsRef.current = origEd.deltaDecorations(originalDecorationsRef.current, []);
      }
      if (modEd) {
        modifiedDecorationsRef.current = modEd.deltaDecorations(modifiedDecorationsRef.current, []);
      }

      if (isReview) {
        const deco = [
          {
            range: {
              startLineNumber: pos.lineNumber,
              startColumn: 1,
              endLineNumber: pos.lineNumber,
              endColumn: 1,
            },
            options: {
              isWholeLine: true,
              className: "monaco-review-line",
            },
          },
        ];
        const newIds = ed.deltaDecorations([], deco);
        if (ed === origEd) {
          originalDecorationsRef.current = newIds;
        } else {
          modifiedDecorationsRef.current = newIds;
        }
      }
    }
  }, []);

  useImperativeHandle(ref, () => ({ jump }), [jump]);

  const beforeMount = useCallback((monacoInstance: Monaco) => {
    registerLightDiffTheme(monacoInstance);
    monacoInstance.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: false,
      schemas: [],
    });
  }, []);

  const onMount = useCallback((diffEditor: monaco.editor.IStandaloneDiffEditor) => {
    diffRef.current = diffEditor;
    // Single scrollbar on PROD (modified): hide UAT (original) vertical bar; scrolling stays synced.
    diffEditor.getOriginalEditor().updateOptions({
      scrollbar: { vertical: "hidden", verticalScrollbarSize: 0, alwaysConsumeMouseWheel: true },
      minimap: { enabled: false }
    });
    diffEditor.getModifiedEditor().updateOptions({
      scrollbar: { vertical: "auto" },
      minimap: { enabled: true, size: "proportional" },
    });
  }, []);

  return (
    <>
      <style>{`
        .monaco-review-line {
          background-color: #ffedd5 !important;
        }
        /* Fallback: hide UAT pane vertical scrollbar (Monaco DOM may vary by version). */
        [data-diff-key="${editorKey}"] .monaco-diff-editor.side-by-side .editor.original .scrollbar.vertical {
          display: none !important;
          width: 0 !important;
        }
      `}</style>
      <div
        className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white"
        data-diff-key={editorKey}
      >
        <div className="flex shrink-0 border-b border-slate-200">
          <div className="flex min-w-0 flex-1 items-center justify-center border-r border-slate-200 bg-slate-100 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">UAT</span>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-center bg-indigo-50 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-900">PROD</span>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <DiffEditor
            height="100%"
            width="100%"
            theme={LIGHT_DIFF_THEME_ID}
            language="json"
            original={original}
            modified={modified}
            beforeMount={beforeMount}
            onMount={onMount}
            className="min-h-0 min-w-0 flex-1"
            wrapperProps={{ className: "flex h-full min-h-0 min-w-0 flex-1 flex-col" }}
            loading={
              <div className="flex min-h-[140px] flex-1 items-center justify-center bg-white text-sm text-slate-500">
                Loading diff…
              </div>
            }
            options={{
              readOnly: true,
              renderSideBySide: true,
              splitViewDefaultRatio: 0.5,
              enableSplitViewResizing: false,
              ignoreTrimWhitespace: false,
              renderIndicators: true,
              diffAlgorithm: "advanced",
              minimap: { enabled: true, size: "proportional" },
              fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              lineNumbers: "on",
              useInlineViewWhenSpaceIsLimited: false,
              renderOverviewRuler: true,
            }}
          />
        </div>
      </div>
    </>
  );
});