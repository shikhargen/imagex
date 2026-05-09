import { SlidersHorizontal, X } from 'lucide-react';
import type { GenerateWorkflowResponse, ImageXNode } from '../../../shared/types.js';
import { nodeMeta } from '../flow/meta.js';
import { EditableField } from '../flow/nodes/parts/EditableField.js';
import type { UpdateNodeData } from '../flow/types.js';

export function InspectorPanel({
  node,
  onChange,
  result,
}: {
  node: ImageXNode | null;
  onChange: UpdateNodeData;
  result: GenerateWorkflowResponse | null;
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
        <button className="icon-button" type="button" aria-label="Close inspector">
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
        {result?.images[0] ? (
          <>
            <img src={result.images[0].url} alt="Latest generated output" />
            <textarea readOnly value={result.prompt} />
          </>
        ) : (
          <p className="muted inline">Run the workflow to see the compiled prompt and latest output here.</p>
        )}
      </section>
    </aside>
  );
}
