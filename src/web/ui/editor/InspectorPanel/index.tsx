import { Menu, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ImageXNode, OutputNodeResult } from '../../../../shared/types.js';
import { nodeMeta } from '../../flow/meta.js';
import { EditableField } from '../../flow/nodes/parts/EditableField.js';
import type { UpdateNodeData } from '../../flow/types.js';
import './styles.css';

export function InspectorPanel({
  node,
  onChange,
  outputResults,
  onClose,
}: {
  node: ImageXNode | null;
  onChange: UpdateNodeData;
  outputResults: Map<string, OutputNodeResult>;
  onClose: () => void;
}) {
  return (
    <aside className="inspector">
      <header className="panel-header">
        <span className="panel-icon">
          <SlidersHorizontal size={17} />
        </span>
        <div>
          <h2>Inspector</h2>
          <p>{node ? nodeMeta[node.type].label : 'No node selected'}</p>
        </div>
        <button className="icon-button" type="button" aria-label="Close inspector" onClick={onClose}>
          <X size={17} />
        </button>
      </header>
      {node ? (
        <div className="inspector-fields">
          <div className="inspector-title" style={{ '--node-accent': nodeMeta[node.type].accent } as React.CSSProperties}>
            <span>{node.type}</span>
            <strong>{nodeMeta[node.type].description}</strong>
          </div>
          {Object.entries(node.data)
            .filter(([key]) => key !== 'fields')
            .map(([key, value]) => (
              <EditableField key={key} nodeId={node.id} field={key} value={value} onChange={onChange} />
            ))}
        </div>
      ) : (
        <p className="muted">Select a workflow node to edit its data. You can also edit fields directly inside nodes.</p>
      )}
      <section className="inspector-output">
        <h2>Latest Output</h2>
        {(() => {
          const result = node && node.type === 'codex-output' ? outputResults.get(node.id) : undefined;
          const image = result?.images[0];
          if (image) {
            return (
              <>
                <img src={image.url} alt="Latest generated output" />
                <textarea readOnly value={result.prompt} />
              </>
            );
          }
          return <p className="muted inline">Run the workflow to see the compiled prompt and latest output here.</p>;
        })()}
      </section>
    </aside>
  );
}

export function InspectorToggle({ onOpen }: { onOpen: () => void }) {
  return (
    <aside className="inspector-rail">
      <Button variant="ghost" size="icon" type="button" aria-label="Open inspector" title="Open inspector" onClick={onOpen}>
        <Menu size={18} />
      </Button>
      <span>Inspector</span>
    </aside>
  );
}
