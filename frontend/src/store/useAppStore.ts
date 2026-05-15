import { create } from "zustand";

import type { DiffChange, ReviewItem, WorkflowFileMeta } from "../types";

interface AppState {
  sessionId: string | null;
  files: WorkflowFileMeta[];
  selectedFileId: string | null;
  leftJson: string;
  rightJson: string;
  diffChanges: DiffChange[];
  reviewItems: ReviewItem[];
  editMode: boolean;
  jsonValid: boolean;
  setSession: (id: string | null, files: WorkflowFileMeta[]) => void;
  setFiles: (files: WorkflowFileMeta[]) => void;
  selectFile: (id: string | null) => void;
  setLeftJson: (s: string) => void;
  setRightJson: (s: string) => void;
  setDiffChanges: (c: DiffChange[]) => void;
  setReviewItems: (r: ReviewItem[]) => void;
  setEditMode: (v: boolean) => void;
  setJsonValid: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sessionId: null,
  files: [],
  selectedFileId: null,
  leftJson: "",
  rightJson: "",
  diffChanges: [],
  reviewItems: [],
  editMode: false,
  jsonValid: true,
  setSession: (sessionId, files) => set({ sessionId, files }),
  setFiles: (files) => set({ files }),
  selectFile: (selectedFileId) => set({ selectedFileId, editMode: false }),
  setLeftJson: (leftJson) => set({ leftJson }),
  setRightJson: (rightJson) => set({ rightJson }),
  setDiffChanges: (diffChanges) => set({ diffChanges }),
  setReviewItems: (reviewItems) => set({ reviewItems }),
  setEditMode: (editMode) => set({ editMode }),
  setJsonValid: (jsonValid) => set({ jsonValid }),
}));
