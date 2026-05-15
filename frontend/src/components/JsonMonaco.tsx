import Editor, { type Monaco } from "@monaco-editor/react";
import type * as monaco from "monaco-editor";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { LIGHT_JSON_THEME_ID, registerLightJsonTheme } from "../monaco/lightDiffTheme";

export type JsonMonacoHandle = {
  jump: (jsonPath: string, kind?: string) => void;
};

type Props = {
  value: string;
  readOnly: boolean;
  editorKey: string;
  onChange?: (v: string) => void;
  onValidate?: (ok: boolean) => void;
};

export const JsonMonaco = forwardRef<JsonMonacoHandle, Props>(function JsonMonacoInner(
  { value, readOnly, editorKey, onChange, onValidate },
  ref,
) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<string[]>([]);

  const jump = useCallback((jsonPath: string, kind?: string) => {
    const isReview = kind === "review";
    const ed = editorRef.current;
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

      if (isReview) {
        decorationsRef.current = ed.deltaDecorations(decorationsRef.current, [
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
        ]);
      } else {
        decorationsRef.current = ed.deltaDecorations(decorationsRef.current, []);
      }
    }
  }, []);

  useImperativeHandle(ref, () => ({ jump }), [jump]);

  const beforeMount = useCallback((m: Monaco) => {
    registerLightJsonTheme(m);
    m.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: false,
      schemas: [],
    });
  }, []);

  const handleMount = useCallback((editor: monaco.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
  }, []);

  return (
    <>
      <style>{`
        .monaco-review-line {
          background-color: #ffedd5 !important;
        }
      `}</style>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-slate-200 bg-white" data-editor-key={editorKey}>
        <Editor
          path={editorKey}
          defaultLanguage="json"
          theme={LIGHT_JSON_THEME_ID}
          value={value}
          beforeMount={beforeMount}
          options={{
            readOnly,
            minimap: { enabled: true },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace", // <- 加上這行
            folding: true,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
          loading={
            <div className="flex min-h-[140px] flex-1 items-center justify-center bg-white text-sm text-slate-500">
              Loading editor…
            </div>
          }
          onMount={handleMount}
          onChange={(v) => onChange?.(v ?? "")}
          onValidate={(markers) => {
            onValidate?.(!markers.length);
          }}
        />
      </div>
    </>
  );
});