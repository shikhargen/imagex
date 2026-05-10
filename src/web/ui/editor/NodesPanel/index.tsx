import { useState } from 'react';
import type { NodeType } from '../../../../shared/types.js';
import { nodeMeta } from '../../flow/meta.js';
import { PanelShell } from '../PanelShell/index.js';
import './styles.css';

const nodeChoices = Object.entries(nodeMeta).map(([type, meta]) => ({
  type: type as NodeType,
  label: meta.label,
  description: meta.description,
  icon: meta.icon,
}));

export function NodesPanel({
  onAdd,
}: {
  onAdd: (type: NodeType) => void;
}) {
  const [query, setQuery] = useState('');

  const normalized = query.trim().toLowerCase();
  const filtered = nodeChoices.filter((node) =>
    `${node.label} ${node.description}`.toLowerCase().includes(normalized)
  );

  return (
    <PanelShell
      title="Nodes"
      searchPlaceholder="Filter nodes..."
      searchValue={query}
      onSearch={setQuery}
    >
      {filtered.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.type}
            type="button"
            className="node-panel-item"
            onClick={() => onAdd(item.type)}
          >
            <span className="node-panel-icon" style={{ color: nodeMeta[item.type].accent }}>
              <Icon size={18} />
            </span>
            <div>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </div>
          </button>
        );
      })}
      {filtered.length === 0 && <p className="muted">No nodes match.</p>}
    </PanelShell>
  );
}
