import { Button } from '@/components/ui/button';
import './styles.css';

export function BottomNotification({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="bottom-notification" role="status">
      <span>{message}</span>
      <Button variant="outline" size="sm" type="button" onClick={onClose} aria-label="Dismiss notification">
        Dismiss
      </Button>
    </div>
  );
}
