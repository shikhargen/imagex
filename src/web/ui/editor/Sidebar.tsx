import { FilePlus2, Image, Keyboard, Plus, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type SidebarWorkflow = {
  id: string;
  title: string;
};

export function Sidebar({
  projectTitle,
  workflows,
  activeWorkflowId,
  onSelectWorkflow,
  onCreateWorkflow,
  onDeleteWorkflow,
  onWorkflowMenu,
  onOpenSettings,
  onOpenShortcuts,
}: {
  projectTitle: string;
  workflows: SidebarWorkflow[];
  activeWorkflowId: string | null;
  onSelectWorkflow: (workflowId: string) => void;
  onCreateWorkflow: () => void;
  onDeleteWorkflow: (workflowId: string) => void;
  onWorkflowMenu: (workflowId: string, position: { x: number; y: number }) => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
}) {
  return (
    <aside className="sidebar project-sidebar">
      <div className="brand">
        <span className="brand-mark">X</span>
        <span>imagex</span>
      </div>

      <section className="project-switcher">
        <span>Project</span>
        <strong>{projectTitle}</strong>
      </section>

      <nav className="primary-nav compact">
        <Button variant="ghost" className="w-full justify-start gap-2 px-3" type="button">
          <Image size={17} /> Assets
        </Button>
      </nav>

      <section className="workflow-list">
        <header>
          <span>Workflows</span>
          <Button variant="ghost" size="icon" type="button" aria-label="Create workflow" onClick={onCreateWorkflow}>
            <Plus size={15} />
          </Button>
        </header>
        <div>
          {workflows.map((workflow) => (
            <Button
              key={workflow.id}
              variant={workflow.id === activeWorkflowId ? 'secondary' : 'ghost'}
              className="h-9 w-full justify-start gap-2 overflow-hidden px-3 text-left"
              onClick={() => onSelectWorkflow(workflow.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                onWorkflowMenu(workflow.id, { x: event.clientX, y: event.clientY });
              }}
            >
              <FilePlus2 size={15} />
              <span>{workflow.title}</span>
            </Button>
          ))}
        </div>
      </section>

      <div className="sidebar-footer">
        <Button variant="ghost" className="w-full justify-start gap-2 px-3" onClick={onOpenShortcuts}>
          <Keyboard size={17} /> Shortcuts
        </Button>
        <Button variant="ghost" className="w-full justify-start gap-2 px-3" onClick={onOpenSettings}>
          <Settings size={17} /> Settings
        </Button>
      </div>
    </aside>
  );
}
