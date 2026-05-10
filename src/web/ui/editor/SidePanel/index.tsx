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
        <Button
          variant="ghost"
          size="icon"
          className="side-panel-close"
          onClick={onClose}
          aria-label="Close panel"
        >
          <X size={14} />
        </Button>
        {children}
      </div>
    </aside>
  );
}
