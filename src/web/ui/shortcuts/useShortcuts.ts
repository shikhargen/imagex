import { useEffect } from 'react';
import type { ShortcutBinding } from './registry.js';

type ShortcutHandlers = Record<string, () => void>;

export function useShortcuts(bindings: ShortcutBinding[], handlers: ShortcutHandlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const binding = bindings.find((candidate) => {
        if (candidate.key.toLowerCase() !== event.key.toLowerCase()) return false;
        if (candidate.metaOrCtrl && !event.metaKey && !event.ctrlKey) return false;
        const expectedShift = candidate.shift ?? false;
        return expectedShift === event.shiftKey;
      });
      if (!binding) return;
      if (!binding.allowInInput && isTypingTarget(event.target)) return;

      const handler = handlers[binding.id];
      if (!handler) return;

      event.preventDefault();
      handler();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bindings, handlers]);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
