/**
 * UndoRedo — Plain class for undo/redo history management.
 * NOT in React state — mutations don't trigger re-renders.
 */

import type { ImageXWorkflow } from '../../shared/types.js';

export type EditorSnapshot = {
  workflow: ImageXWorkflow;
  selectedId: string | null;
};

export class UndoRedo {
  private undoStack: EditorSnapshot[] = [];
  private redoStack: EditorSnapshot[] = [];
  private limit = 50;

  setLimit(limit: number): void {
    this.limit = Math.max(5, Math.min(200, limit));
    while (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
  }

  getLimit(): number {
    return this.limit;
  }

  push(snapshot: EditorSnapshot): void {
    this.undoStack.push(snapshot);
    this.redoStack = [];
    while (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
  }

  undo(): EditorSnapshot | undefined {
    return this.undoStack.pop();
  }

  redo(): EditorSnapshot | undefined {
    return this.redoStack.pop();
  }

  pushRedo(snapshot: EditorSnapshot): void {
    this.redoStack.push(snapshot);
  }

  pushUndo(snapshot: EditorSnapshot): void {
    this.undoStack.push(snapshot);
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  hasUndo(): boolean {
    return this.undoStack.length > 0;
  }

  hasRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undoCount(): number {
    return this.undoStack.length;
  }

  redoCount(): number {
    return this.redoStack.length;
  }
}

/** Singleton instance */
export const undoRedo = new UndoRedo();
