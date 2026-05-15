import type { Monaco } from "@monaco-editor/react";

/**
 * Shared light chrome for all Monaco surfaces (avoids default dark minimap / scrollbars / gutters).
 * Applied on top of base "vs".
 */
const MONACO_LIGHT_CHROME: Record<string, string> = {
  "editor.background": "#ffffff",
  "editor.foreground": "#1e293b",
  "editorLineNumber.foreground": "#94a3b8",
  "editorLineNumber.activeForeground": "#0f172a",
  "editorGutter.background": "#ffffff",
  "editorLineHighlightBackground": "#f1f5f9",
  "editorLineHighlightBorder": "#e2e8f0",
  "editorIndentGuide.background": "#e2e8f0",
  "editorIndentGuide.activeBackground": "#cbd5e1",
  "editorWhitespace.foreground": "#cbd5e1",
  "editor.selectionBackground": "#bfdbfe",
  "editor.inactiveSelectionBackground": "#e2e8f0",
  "editorCursor.foreground": "#0f172a",
  "editorBracketMatch.background": "#e0f2fe",
  "editorBracketMatch.border": "#7dd3fc",
  "editorWidget.background": "#ffffff",
  "editorWidget.foreground": "#0f172a",
  "editorWidget.border": "#e2e8f0",
  "editorSuggestWidget.background": "#ffffff",
  "editorSuggestWidget.border": "#e2e8f0",
  "editorSuggestWidget.foreground": "#0f172a",
  "editorSuggestWidget.selectedBackground": "#e0f2fe",
  "editorHoverWidget.background": "#ffffff",
  "editorHoverWidget.border": "#e2e8f0",
  "peekViewTitle.background": "#ffffff",
  "peekViewTitleLabel.foreground": "#0f172a",
  "peekView.border": "#e2e8f0",
  "peekViewResult.background": "#ffffff",
  "peekViewEditor.background": "#ffffff",
  "scrollbar.shadow": "#e2e8f0",
  "scrollbarSlider.background": "#cbd5e188",
  "scrollbarSlider.hoverBackground": "#94a3b8aa",
  "scrollbarSlider.activeBackground": "#64748bbb",
  "minimap.background": "#ffffff",
  "editorOverviewRuler.border": "#e2e8f0",
  "editorOverviewRuler.background": "#ffffff00",
};

/** Shared light theme for JSON diff: soft line fills, saturated inline chars, diagonal alignment fill. */
export const LIGHT_DIFF_THEME_ID = "n8n-light-diff";

export function registerLightDiffTheme(monaco: Monaco) {
  monaco.editor.defineTheme(LIGHT_DIFF_THEME_ID, {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      ...MONACO_LIGHT_CHROME,
      // Line-level: light wash
      "diffEditor.removedLineBackground": "#ffe4e6",
      "diffEditor.insertedLineBackground": "#dcfce7",
      // Word / intra-line: darker, more saturated than line wash
      "diffEditor.removedTextBackground": "#dc262699",
      "diffEditor.insertedTextBackground": "#15803d99",
      // Side-by-side alignment gaps (diagonal hatch)
      "diffEditor.diagonalFill": "#cbd5e1",
      "diffEditor.border": "#e2e8f0",
      "diffEditorOverview.insertedForeground": "#16a34a",
      "diffEditorOverview.removedForeground": "#e11d48",
    },
  });
}

export const LIGHT_JSON_THEME_ID = "n8n-light-json";

export function registerLightJsonTheme(monaco: Monaco) {
  monaco.editor.defineTheme(LIGHT_JSON_THEME_ID, {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      ...MONACO_LIGHT_CHROME,
    },
  });
}
