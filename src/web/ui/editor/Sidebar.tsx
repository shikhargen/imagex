import { FilePlus2, Image, Keyboard, Menu, Plus, Settings } from 'lucide-react';
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
  onOpenAssets,
  onOpenSettings,
  onOpenShortcuts,
  collapsed,
  onToggleCollapsed,
}: {
  projectTitle: string;
  workflows: SidebarWorkflow[];
  activeWorkflowId: string | null;
  onSelectWorkflow: (workflowId: string) => void;
  onCreateWorkflow: () => void;
  onDeleteWorkflow: (workflowId: string) => void;
  onWorkflowMenu: (workflowId: string, position: { x: number; y: number }) => void;
  onOpenAssets: () => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  return (
    <aside className={`sidebar project-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand">
        <span className="brand-mark">X</span>
        {!collapsed && <span>imagex</span>}
        <Button variant="ghost" size="icon" type="button" className="sidebar-toggle" aria-label="Toggle sidebar" onClick={onToggleCollapsed}>
          <Menu size={17} />
        </Button>
      </div>

      {!collapsed && (
        <section className="project-switcher">
          <span>Project</span>
          <strong>{projectTitle}</strong>
        </section>
      )}

      <nav className="primary-nav compact">
        <Button variant="ghost" className="w-full justify-start gap-2 px-3 sidebar-icon-button" type="button" title="Assets" onClick={onOpenAssets}>
          <Image size={17} /> {!collapsed && 'Assets'}
        </Button>
      </nav>

      <section className="workflow-list">
        <header>
          {!collapsed && <span>Workflows</span>}
          <Button variant="ghost" size="icon" type="button" aria-label="Create workflow" title="Create workflow" onClick={onCreateWorkflow}>
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
              title={workflow.title}
            >
              <FilePlus2 size={15} />
              {!collapsed && <span>{workflow.title}</span>}
            </Button>
          ))}
        </div>
      </section>

      <div className="sidebar-footer">
        <Button variant="ghost" className="w-full justify-start gap-2 px-3 sidebar-icon-button" onClick={onOpenShortcuts} title="Shortcuts">
          <Keyboard size={17} /> {!collapsed && 'Shortcuts'}
        </Button>
        <Button variant="ghost" className="w-full justify-start gap-2 px-3 sidebar-icon-button" onClick={onOpenSettings} title="Settings">
          <Settings size={17} /> {!collapsed && 'Settings'}
        </Button>
      </div>
    </aside>
  );
}
