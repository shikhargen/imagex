import { ChevronDown, Play, Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { GenerationRunMode } from '../../../../shared/types.js';
import './styles.css';

export type TopBarWorkflow = {
  id: string;
  title: string;
};

export function TopBarTabs({
  workflows,
  activeWorkflowId,
  onSelectWorkflow,
  onWorkflowMenu,
  onCreateWorkflow,
}: {
  workflows: TopBarWorkflow[];
  activeWorkflowId: string | null;
  onSelectWorkflow: (id: string) => void;
  onWorkflowMenu?: ((id: string, position: { x: number; y: number }) => void) | undefined;
  onCreateWorkflow: () => void;
}) {
  return (
    <div className="top-bar-tabs">
      {workflows.map((wf) => (
        <button
          key={wf.id}
          type="button"
          className={`top-bar-tab ${wf.id === activeWorkflowId ? 'active' : ''}`}
          onClick={() => onSelectWorkflow(wf.id)}
          onContextMenu={(event) => {
            event.preventDefault();
            onWorkflowMenu?.(wf.id, { x: event.clientX, y: event.clientY });
          }}
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
  );
}

export function TopBarRunControl({
  onRun,
  onCancel,
  status,
  canRun,
  selectedOutputCount,
  generationActive,
}: {
  onRun: (mode?: GenerationRunMode) => void;
  onCancel?: (() => void | Promise<void>) | undefined;
  status: string;
  canRun: boolean;
  selectedOutputCount: number;
  generationActive: boolean;
}) {
  const running = generationActive || status === 'Generating...';
  const [menuOpen, setMenuOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canRunSelected = canRun && selectedOutputCount > 0 && !running;

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setMenuOpen(false), 150);
  };

  return (
    <div className="top-bar-actions">
      <div className="run-control">
        <div className={`ix-split-button ${running ? 'is-running' : ''} ${menuOpen ? 'is-open' : ''}`}>
          <button
            type="button"
            className="ix-split-button-main"
            onClick={() => onRun('selected')}
            disabled={running || !canRunSelected}
          >
            <Play size={14} fill="currentColor" />
            {running ? 'Running' : 'Run'}
          </button>
          <span className="ix-split-button-separator" aria-hidden="true" />
          {running ? (
            <button
              type="button"
              className="ix-split-button-trigger"
              onClick={onCancel}
              aria-label="Cancel generation"
              title="Cancel generation"
            >
              <X size={14} />
            </button>
          ) : (
            <button
              type="button"
              className="ix-split-button-trigger"
              disabled={!canRun}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Run options"
              title="Run options"
              onMouseEnter={() => {
                cancelClose();
                setMenuOpen(true);
              }}
              onMouseLeave={scheduleClose}
            >
              <ChevronDown size={14} />
            </button>
          )}
        </div>
        {menuOpen && (
          <div
            className="run-menu"
            role="menu"
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            <div className="menu-list">
              <button
                type="button"
                role="menuitem"
                className="menu-item"
                disabled={!canRunSelected}
                onClick={() => {
                  setMenuOpen(false);
                  onRun('selected');
                }}
              >
                Run selected
              </button>
              <button
                type="button"
                role="menuitem"
                className="menu-item"
                disabled={!canRunSelected}
                onClick={() => {
                  setMenuOpen(false);
                  onRun('forced');
                }}
              >
                Run forced
              </button>
              <button
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  onRun('all');
                }}
              >
                Run all
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function TopBar({
  workflows,
  activeWorkflowId,
  onSelectWorkflow,
  onWorkflowMenu,
  onCreateWorkflow,
  onRun,
  onCancel,
  status,
  canRun,
  selectedOutputCount,
  generationActive,
}: {
  workflows: TopBarWorkflow[];
  activeWorkflowId: string | null;
  onSelectWorkflow: (id: string) => void;
  onWorkflowMenu?: ((id: string, position: { x: number; y: number }) => void) | undefined;
  onCreateWorkflow: () => void;
  onRun: (mode?: GenerationRunMode) => void;
  onCancel?: (() => void | Promise<void>) | undefined;
  status: string;
  canRun: boolean;
  selectedOutputCount: number;
  generationActive: boolean;
}) {
  return (
    <>
      <TopBarTabs
        workflows={workflows}
        activeWorkflowId={activeWorkflowId}
        onSelectWorkflow={onSelectWorkflow}
        onWorkflowMenu={onWorkflowMenu}
        onCreateWorkflow={onCreateWorkflow}
      />
      <TopBarRunControl
        onRun={onRun}
        onCancel={onCancel}
        status={status}
        canRun={canRun}
        selectedOutputCount={selectedOutputCount}
        generationActive={generationActive}
      />
    </>
  );
}
