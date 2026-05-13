import { Play, Plus, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PrimaryActionButton } from '@/components/ui/primary-action-button';
import './styles.css';

export type TopBarWorkflow = {
  id: string;
  title: string;
};

export function TopBar({
  workflows,
  activeWorkflowId,
  onSelectWorkflow,
  onCreateWorkflow,
  onRun,
  onCancel,
  status,
  canRun,
}: {
  workflows: TopBarWorkflow[];
  activeWorkflowId: string | null;
  onSelectWorkflow: (id: string) => void;
  onCreateWorkflow: () => void;
  onRun: () => void;
  onCancel?: () => void;
  status: string;
  canRun: boolean;
}) {
  const running = status === 'Generating...';

  return (
    <header className="top-bar">
      <div className="top-bar-tabs">
        {workflows.map((wf) => (
          <button
            key={wf.id}
            type="button"
            className={`top-bar-tab ${wf.id === activeWorkflowId ? 'active' : ''}`}
            onClick={() => onSelectWorkflow(wf.id)}
          >
            {wf.title}
          </button>
        ))}
        <button
          type="button"
          className="top-bar-tab top-bar-tab-add"
          onClick={onCreateWorkflow}
          aria-label="Create workflow"
          title="Create workflow"
        >
          <Plus size={13} />
        </button>
      </div>
      <div className="top-bar-actions">
        <span className="top-bar-status">{status}</span>
        {running ? (
          <Button onClick={onCancel} size="sm" variant="secondary" className="top-bar-cancel-btn">
            <Square size={10} fill="currentColor" />
            Cancel
          </Button>
        ) : (
          <PrimaryActionButton onClick={onRun} disabled={!canRun}>
            <Play size={11} fill="currentColor" />
            Run
          </PrimaryActionButton>
        )}
      </div>
    </header>
  );
}
