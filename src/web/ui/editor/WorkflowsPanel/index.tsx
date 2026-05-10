import { FilePlus2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PanelShell } from '../PanelShell/index.js';
import './styles.css';

export type SidebarWorkflow = {
  id: string;
  title: string;
};

export function WorkflowsPanel({
  workflows,
  activeWorkflowId,
  onSelect,
  onCreate,
  onMenu,
  searchQuery,
  onSearch,
}: {
  workflows: SidebarWorkflow[];
  activeWorkflowId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onMenu: (id: string, position: { x: number; y: number }) => void;
  searchQuery: string;
  onSearch: (value: string) => void;
}) {
  const normalized = searchQuery.trim().toLowerCase();
  const filtered = normalized
    ? workflows.filter((w) => w.title.toLowerCase().includes(normalized))
    : workflows;

  return (
    <PanelShell
      title="Workflows"
      searchPlaceholder="Search workflows..."
      searchValue={searchQuery}
      onSearch={onSearch}
      footer={
        <Button variant="ghost" className="workflow-create-btn" onClick={onCreate}>
          <Plus size={14} />
          Create workflow
        </Button>
      }
    >
      <div className="workflow-panel-list">
        {filtered.map((workflow) => (
          <button
            key={workflow.id}
            type="button"
            className={`workflow-row ${workflow.id === activeWorkflowId ? 'active' : ''}`}
            onClick={() => onSelect(workflow.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              onMenu(workflow.id, { x: event.clientX, y: event.clientY });
            }}
            title={workflow.title}
          >
            <FilePlus2 size={15} />
            <span>{workflow.title}</span>
          </button>
        ))}
        {filtered.length === 0 && <p className="muted">No workflows match.</p>}
      </div>
    </PanelShell>
  );
}
