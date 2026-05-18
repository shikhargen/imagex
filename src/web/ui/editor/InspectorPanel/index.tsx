import { Menu, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ImageXNode, OutputNodeResult } from '../../../../shared/types.js';
import { nodeMeta } from '../../flow/meta.js';
import { NodeContent } from '../../flow/nodes/NodeContent.js';
import { NodeFields } from '../../flow/nodes/parts/NodeFields.js';
import type { UpdateNodeData } from '../../flow/types.js';
import './styles.css';

// Map node types to their addable field kinds (same as in ImageXNode.tsx)
const addableFieldsMap: Record<string, string[]> = {
  prompt: ['textarea', 'text'],
  image: ['textarea', 'image'],
  file: ['text'],
};

// Node types that use NodeContent (have custom body: preview, controls, etc.)
const contentNodeTypes = new Set(['codex-output', 'rotate-flip', 'crop', 'color-balance', 'blur', 'download']);

export function InspectorPanel({
  node,
  onChange,
  outputResults,
  onClose,
  connectedHandles,
  onDisconnect,
  onAddField,
  onDynamicFieldChange,
  onOpenAssets,
  onShowPrompt,
}: {
  node: ImageXNode | null;
  onChange: UpdateNodeData;
  outputResults: Map<string, OutputNodeResult>;
  onClose: () => void;
  connectedHandles: string[];
  onDisconnect: (nodeId: string, handleId: string) => void;
  onAddField?: (nodeId: string, kind: string) => void;
  onDynamicFieldChange?: (nodeId: string, fieldId: string, value: unknown) => void;
  onOpenAssets?: (nodeId: string, fieldId: string) => void;
  onShowPrompt?: (nodeId: string) => void;
}) {
  return (
    <aside className="inspector">
      <header className="panel-header">
        <span className="panel-icon">
          <SlidersHorizontal size={17} />
        </span>
        <div>
          <h2>Inspector</h2>
          <p>{node ? ((node.data.title as string) || nodeMeta[node.type].label) : 'No node selected'}</p>
        </div>
        <button className="icon-button" type="button" aria-label="Close inspector" onClick={onClose}>
          <X size={17} />
        </button>
      </header>
      {node ? (
        contentNodeTypes.has(node.type) ? (
          // Non-primitive nodes: render the full node body (preview + controls)
          <div className="inspector-content" style={{ '--node-accent': nodeMeta[node.type].accent } as React.CSSProperties}>
            <NodeContent
              node={node}
              onChange={onChange}
              onShowPrompt={onShowPrompt}
              connectedHandles={connectedHandles}
            />
          </div>
        ) : (
          // Primitive nodes: render fields with handles/add support
          <NodeFields
            node={node}
            connectedHandles={connectedHandles}
            addableFields={addableFieldsMap[node.type] || []}
            hasAssetPicker={node.type === 'image'}
            onFieldChange={onChange}
            onDynamicFieldChange={onDynamicFieldChange}
            onFieldsChange={(nodeId, fields) => onChange(nodeId, 'fields', fields)}
            onAddField={onAddField}
            onDisconnect={onDisconnect}
            onOpenAssets={onOpenAssets}
            editableFieldStructure
          />
        )
      ) : (
        <p className="muted">Select a node to inspect its properties.</p>
      )}
      {node && node.type === 'codex-output' && (
        <section className="inspector-output">
          <h2>Latest Output</h2>
          {(() => {
            const result = outputResults.get(node.id);
            const image = result?.images[0];
            if (image) {
              return (
                <>
                  <img src={image.url} alt="Latest generated output" />
                  <textarea readOnly value={result.prompt} />
                </>
              );
            }
            return <p className="muted inline">Run the workflow to see output here.</p>;
          })()}
        </section>
      )}
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
