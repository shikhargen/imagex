import { ChevronRight, LogOut, Menu, Play, Plus, Settings, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  onMenuAction,
  showMinimap,
  rightOpen,
  status,
  canRun,
}: {
  workflows: TopBarWorkflow[];
  activeWorkflowId: string | null;
  onSelectWorkflow: (id: string) => void;
  onCreateWorkflow: () => void;
  onRun: () => void;
  onMenuAction: (action: string) => void;
  showMinimap: boolean;
  rightOpen: boolean;
  status: string;
  canRun: boolean;
}) {
  const running = status === 'Generating...';
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const menuItems = useMemo(
    () => [
      { id: 'exit-project', label: 'Back to projects' },
      { type: 'separator' },
      { id: 'file-new-workflow', label: 'New workflow' },
      { id: 'file-rename-workflow', label: 'Rename workflow' },
      { id: 'file-compile-prompt', label: 'Compile prompt' },
      { type: 'separator' },
      {
        id: 'edit',
        label: 'Edit',
        items: [
          { id: 'edit-undo', label: 'Undo' },
          { id: 'edit-redo', label: 'Redo' },
          { id: 'edit-duplicate', label: 'Duplicate selection' },
          { id: 'edit-delete', label: 'Delete selection' },
          { id: 'edit-disconnect', label: 'Disconnect selection' },
          { id: 'edit-detach-frame', label: 'Detach from frame' },
          { id: 'edit-clear-selection', label: 'Clear selection' },
        ],
      },
      {
        id: 'view',
        label: 'View',
        items: [
          { id: 'view-zoom-in', label: 'Zoom in' },
          { id: 'view-zoom-out', label: 'Zoom out' },
          { id: 'view-fit', label: 'Fit to screen' },
          { id: 'view-toggle-minimap', label: showMinimap ? 'Hide minimap' : 'Show minimap' },
          { id: 'view-toggle-inspector', label: rightOpen ? 'Hide inspector' : 'Show inspector' },
        ],
      },
      { type: 'separator' },
      {
        id: 'settings',
        label: 'Preferences',
        items: [
          { id: 'settings-open', label: 'Settings' },
          { id: 'settings-shortcuts', label: 'Keyboard shortcuts' },
        ],
      },
    ],
    [rightOpen, showMinimap]
  );

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setActiveMenu(null);
      }
    };
    const onMouseDown = (event: MouseEvent) => {
      if (!menuRef.current || !triggerRef.current) return;
      if (menuRef.current.contains(event.target as Node) || triggerRef.current.contains(event.target as Node)) return;
      setMenuOpen(false);
      setActiveMenu(null);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) setActiveMenu(null);
  }, [menuOpen]);

  return (
    <header className="top-bar">
      <div className="top-bar-start">
        <button
          ref={triggerRef}
          type="button"
          className={`menu-trigger ${menuOpen ? 'active' : ''}`}
          aria-haspopup="true"
          aria-expanded={menuOpen}
          aria-label="Open menu"
          onClick={() => setMenuOpen((current) => !current)}
        >
          {menuOpen ? <X size={16} /> : <Menu size={16} />}
        </button>
        <span className="menu-brand">imagex</span>
        {menuOpen && (
          <div className="menu-shell" ref={menuRef}>
            <div className="menu-list">
              {menuItems.map((item, index) => {
                if (item.type === 'separator') {
                  return <div key={`sep-${index}`} className="menu-separator" />;
                }
                const hasSubMenu = item.items && item.items.length > 0;
                return (
                  <div
                    key={item.id}
                    className="menu-item-container"
                    onMouseEnter={() => hasSubMenu ? setActiveMenu(item.id!) : setActiveMenu(null)}
                  >
                    <button
                      type="button"
                      className={`menu-item ${activeMenu === item.id ? 'active' : ''}`}
                      onClick={() => {
                        if (hasSubMenu) {
                          setActiveMenu(activeMenu === item.id ? null : item.id!);
                        } else {
                          onMenuAction(item.id!);
                          setMenuOpen(false);
                        }
                      }}
                    >
                      <span>{item.label}</span>
                      {hasSubMenu && <ChevronRight size={14} />}
                    </button>
                    {hasSubMenu && activeMenu === item.id && (
                      <div className="menu-submenu">
                        {item.items!.map((subItem) => (
                          <button
                            key={subItem.id}
                            type="button"
                            className="menu-item"
                            onClick={() => {
                              onMenuAction(subItem.id);
                              setMenuOpen(false);
                            }}
                          >
                            <span>{subItem.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
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
      </div>
    </header>
  );
}
