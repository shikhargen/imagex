import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import './styles.css';

export function SidePanel({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <aside className="side-panel">
      <div className="side-panel-inner">
        <button
          type="button"
          className="ix-close-btn side-panel-close"
          onClick={onClose}
          aria-label="Close panel"
        >
          <X size={14} />
        </button>
        {children}
      </div>
    </aside>
  );
}
