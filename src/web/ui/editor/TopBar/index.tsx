import { LogOut, Play, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  onCloseProject,
  status,
  canRun,
}: {
  workflows: TopBarWorkflow[];
  activeWorkflowId: string | null;
  onSelectWorkflow: (id: string) => void;
  onCreateWorkflow: () => void;
  onRun: () => void;
  onCloseProject: () => void;
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
        <Button onClick={onRun} disabled={!canRun || running} size="sm">
          <Play size={14} fill="currentColor" />
          {running ? 'Running' : 'Run'}
        </Button>
        <Button variant="outline" size="sm" type="button" onClick={onCloseProject}>
          <LogOut size={14} />
          Close
        </Button>
      </div>
    </header>
  );
}
