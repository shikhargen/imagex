import { ChevronDown, Download, LogOut, Plus, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function Toolbar({
  workflowName,
  onRename,
  status,
  onRun,
  onCloseProject,
  onAddNode,
  canRun,
}: {
  workflowName: string;
  onRename: (name: string) => void;
  status: string;
  onRun: () => void;
  onCloseProject: () => void;
  onAddNode: () => void;
  canRun: boolean;
}) {
  const running = status === 'Generating...';
  return (
    <header className="toolbar">
      <Input
        className="workflow-name h-9 border-border/70 bg-background/45 text-foreground shadow-sm"
        value={workflowName}
        onChange={(event) => onRename(event.target.value)}
        aria-label="Workflow name"
      />
      <Button variant="secondary" size="sm" type="button" onClick={onAddNode}>
        <Plus size={16} />
        Add Node
      </Button>
      <Button variant="ghost" size="sm" type="button" className="gap-1">
        File <ChevronDown size={14} />
      </Button>
      <Button variant="ghost" size="sm" type="button" className="gap-1">
        Edit <ChevronDown size={14} />
      </Button>
      <Button variant="ghost" size="sm" type="button" className="gap-1">
        View <ChevronDown size={14} />
      </Button>
      <div className="toolbar-spacer" />
      <Button onClick={onRun} disabled={!canRun || running} size="sm">
        <Play size={16} fill="currentColor" />
        {running ? 'Running' : 'Run'}
      </Button>
      <Button variant="outline" size="sm" type="button">
        <Download size={16} />
        Export
      </Button>
      <Button variant="outline" size="sm" type="button" onClick={onCloseProject}>
        <LogOut size={16} />
        Close
      </Button>
    </header>
  );
}
