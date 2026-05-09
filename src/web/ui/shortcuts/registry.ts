export type ShortcutScope = 'editor';

export type ShortcutBinding = {
  id: string;
  scope: ShortcutScope;
  key: string;
  label: string;
  description: string;
  allowInInput?: boolean;
  metaOrCtrl?: boolean;
  shift?: boolean;
};

export const editorShortcuts = [
  {
    id: 'delete-selection',
    scope: 'editor',
    key: 'x',
    label: 'X',
    description: 'Delete selected node or selected edges',
  },
  {
    id: 'clear-selection',
    scope: 'editor',
    key: 'Escape',
    label: 'Esc',
    description: 'Clear selection',
  },
  {
    id: 'duplicate-field',
    scope: 'editor',
    key: 'd',
    label: 'D',
    description: 'Duplicate hovered custom field',
  },
  {
    id: 'detach-frame',
    scope: 'editor',
    key: 'k',
    label: 'K',
    description: 'Detach selected node from its frame',
  },
  {
    id: 'undo',
    scope: 'editor',
    key: 'z',
    label: 'Ctrl/⌘ Z',
    description: 'Undo editor change',
    allowInInput: true,
    metaOrCtrl: true,
    shift: false,
  },
  {
    id: 'redo',
    scope: 'editor',
    key: 'z',
    label: 'Ctrl/⌘ Shift Z',
    description: 'Redo editor change',
    allowInInput: true,
    metaOrCtrl: true,
    shift: true,
  },
  {
    id: 'redo',
    scope: 'editor',
    key: 'y',
    label: 'Ctrl/⌘ Y',
    description: 'Redo editor change',
    allowInInput: true,
    metaOrCtrl: true,
    shift: false,
  },
] satisfies ShortcutBinding[];
