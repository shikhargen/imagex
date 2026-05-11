import { Handle, Position } from '@xyflow/react';
import { MoreHorizontal } from 'lucide-react';
import { useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { nodeMeta } from '../meta.js';
import { inputPortsFor, outputPortsFor } from '../ports.js';
import type { UiNodeData } from '../types.js';
import type { ImageXNode } from '../../../../shared/types.js';

export type BaseNodeProps = {
  data: UiNodeData;
  selected: boolean;
  /** Show icon in header (for non-primitive nodes) */
  showIcon?: boolean;
  /** Render handles at top: 50% (centered, for editing nodes) */
  centeredHandles?: boolean;
  /** Allow double-click rename on title */
  renamable?: boolean;
  children: ReactNode;
};

export function BaseNode({ data, selected, showIcon, centeredHandles, renamable, children }: BaseNodeProps) {
  const node = data.workflowNode;
  const meta = nodeMeta[node.type];
  const title = (node.data.title as string) || meta.label;
  const inputs = inputPortsFor(node);
  const outputs = outputPortsFor(node);

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(title);

  const onMenu = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    data.onMenu(node.id, { x: event.clientX, y: event.clientY });
  };

  const commitRename = () => {
    if (renameValue.trim() && renameValue !== title) {
      data.onChange(node.id, 'title', renameValue.trim());
    }
    setRenaming(false);
  };

  return (
    <article
      className={`ix-node ix-node-${node.type} ${selected ? 'selected' : ''}`}
      style={{ '--node-accent': meta.accent } as CSSProperties}
      onContextMenu={onMenu}
    >
      {/* Header */}
      <header className="ix-node-header">
        <div className="ix-node-header-main">
          {showIcon && (
            <span className="ix-node-icon">
              <meta.icon size={15} strokeWidth={2} />
            </span>
          )}
          <div className="ix-node-header-text">
            {renamable && renaming ? (
              <input
                className="ix-node-rename-input nodrag"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') { setRenameValue(title); setRenaming(false); }
                }}
                autoFocus
              />
            ) : (
              <strong onDoubleClick={renamable ? () => { setRenameValue(title); setRenaming(true); } : undefined}>{title}</strong>
            )}
          </div>
        </div>
        <button className="ix-node-menu-btn nodrag" type="button" aria-label="Node actions" onClick={onMenu}>
          <MoreHorizontal size={14} />
        </button>
      </header>

      {/* Input handles */}
      {centeredHandles && inputs.map((port) => (
        <Handle
          key={port.id}
          id={port.id}
          className={`ix-handle ix-handle-in ix-port-${port.kind}`}
          type="target"
          position={Position.Left}
          isConnectableStart={false}
          style={{ top: '50%' }}
        />
      ))}

      {/* Output handles */}
      {outputs.map((port) => (
        <Handle
          key={port.id}
          id={port.id}
          className={`ix-handle ix-handle-out ix-port-${port.kind}`}
          type="source"
          position={Position.Right}
          isConnectableEnd={false}
          style={{ top: '50%' }}
        />
      ))}

      {/* Node body */}
      {children}
    </article>
  );
}
