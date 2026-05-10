import { useState } from 'react';
import type { NodeCategory, NodeType } from '../../../../shared/types.js';
import { nodeMeta, type NodeMeta } from '../../flow/meta.js';
import { PanelShell } from '../PanelShell/index.js';
import './styles.css';

// Show all node types except 'frame' (frames are added via a different mechanism)
const nodeChoices = Object.entries(nodeMeta)
  .filter(([type]) => type !== 'frame')
  .map(([type, meta]) => ({
    type: type as NodeType,
    label: meta.label,
    description: meta.description,
    icon: meta.icon,
    category: meta.category,
  }));

const categoryLabels: Record<NodeCategory, string> = {
  'primitive': 'Primitives',
  'llm-output': 'Output',
  'image-editing': 'Image Editing',
};

const categoryOrder: NodeCategory[] = ['primitive', 'llm-output', 'image-editing'];

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

  // Group by category
  const grouped = categoryOrder
    .map((cat) => ({
      category: cat,
      label: categoryLabels[cat],
      items: filtered.filter((n) => n.category === cat),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <PanelShell
      title="Nodes"
      searchPlaceholder="Filter nodes..."
      searchValue={query}
      onSearch={setQuery}
    >
      <div className="node-panel-list">
        {grouped.map((group) => (
          <div key={group.category} className="node-panel-group">
            <div className="node-panel-group-label">{group.label}</div>
            {group.items.map((item) => {
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
          </div>
        ))}
        {filtered.length === 0 && <p className="muted">No nodes match.</p>}
      </div>
    </PanelShell>
  );
}
