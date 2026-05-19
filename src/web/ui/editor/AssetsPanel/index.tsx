import { useRef, useState } from 'react';
import { Image, Layers3, Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ImageXAsset, ImageXNodeAsset, ImageXOutputAsset } from '../../../../shared/types.js';
import { nodeMeta } from '../../flow/meta.js';
import { PanelShell } from '../PanelShell/index.js';
import './styles.css';

export function AssetsPanel({
  assets,
  outputAssets,
  nodeAssets,
  onImport,
  onAddImageAsset,
  onAddOutputAsset,
  onAddNodeAsset,
  onMenu,
  onOutputMenu,
  onNodeMenu,
  onRefreshOutputs,
}: {
  assets: ImageXAsset[];
  outputAssets: ImageXOutputAsset[];
  nodeAssets: ImageXNodeAsset[];
  onImport: (files: FileList | null) => void;
  onAddImageAsset: (asset: ImageXAsset) => void;
  onAddOutputAsset: (asset: ImageXOutputAsset) => void;
  onAddNodeAsset: (asset: ImageXNodeAsset) => void;
  onMenu: (assetId: string, position: { x: number; y: number }) => void;
  onOutputMenu: (assetId: string, position: { x: number; y: number }) => void;
  onNodeMenu: (assetId: string, position: { x: number; y: number }) => void;
  onRefreshOutputs?: (() => void) | undefined;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [tab, setTab] = useState<'images' | 'outputs' | 'nodes'>('images');
  const [query, setQuery] = useState('');

  const normalized = query.trim().toLowerCase();

  const filteredAssets = normalized
    ? assets.filter((a) => a.name.toLowerCase().includes(normalized))
    : assets;

  const filteredNodeAssets = normalized
    ? nodeAssets.filter((a) => a.name.toLowerCase().includes(normalized))
    : nodeAssets;

  const filteredOutputAssets = normalized
    ? outputAssets.filter((a) => a.name.toLowerCase().includes(normalized) || a.outputNodeId.toLowerCase().includes(normalized))
    : outputAssets;

  const tabs = [
    { id: 'images', label: <><Image size={14} /> Images <span className="asset-count">{assets.length}</span></> },
    { id: 'outputs', label: <><Sparkles size={14} /> Outputs <span className="asset-count">{outputAssets.length}</span></> },
    { id: 'nodes', label: <><Layers3 size={14} /> Nodes <span className="asset-count">{nodeAssets.length}</span></> },
  ];

  return (
    <PanelShell
      title="Assets"
      searchPlaceholder={`Search ${tab}...`}
      searchValue={query}
      onSearch={setQuery}
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => {
        const nextTab = id as 'images' | 'outputs' | 'nodes';
        setTab(nextTab);
        if (nextTab === 'outputs') onRefreshOutputs?.();
      }}
    >
      {tab === 'images' ? (
        <>
          <Button
            variant="ghost"
            className="asset-import-btn"
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={14} />
            Import images
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => {
              void onImport(event.target.files);
              event.currentTarget.value = '';
            }}
          />
          <div className="asset-grid-compact">
            {filteredAssets.map((asset) => (
              <article
                key={asset.id}
                className="asset-card-compact"
                onContextMenu={(event) => {
                  event.preventDefault();
                  onMenu(asset.id, { x: event.clientX, y: event.clientY });
                }}
              >
                <button type="button" onClick={() => onAddImageAsset(asset)}>
                  <span className="asset-thumbnail">
                    <img src={asset.url} alt={asset.name} loading="lazy" />
                  </span>
                  <span>{asset.name}</span>
                </button>
              </article>
            ))}
            {filteredAssets.length === 0 && <p className="muted">No image assets match.</p>}
          </div>
        </>
      ) : tab === 'outputs' ? (
        <div className="asset-grid-compact">
          {filteredOutputAssets.map((asset) => (
            <article
              key={asset.id}
              className="asset-card-compact"
              onContextMenu={(event) => {
                event.preventDefault();
                onOutputMenu(asset.id, { x: event.clientX, y: event.clientY });
              }}
            >
              <button type="button" onClick={() => onAddOutputAsset(asset)}>
                <span className="asset-thumbnail">
                  <img src={asset.url} alt={asset.name} loading="lazy" />
                </span>
                <span>{asset.name}</span>
              </button>
            </article>
          ))}
          {filteredOutputAssets.length === 0 && <p className="muted">No generated outputs match.</p>}
        </div>
      ) : (
        <div className="asset-node-list-compact">
          {filteredNodeAssets.map((asset) => {
            const meta = nodeMeta[asset.nodeType];
            const Icon = meta.icon;
            return (
              <button
                key={asset.id}
                type="button"
                className="asset-node-card"
                onClick={() => onAddNodeAsset(asset)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onNodeMenu(asset.id, { x: event.clientX, y: event.clientY });
                }}
              >
                <span className="asset-node-icon" style={{ color: meta.accent }}>
                  <Icon size={17} />
                </span>
                <div>
                  <strong>{asset.name}</strong>
                  <span>
                    {meta.label} asset · {asset.nodes.length} node{asset.nodes.length === 1 ? '' : 's'}
                  </span>
                </div>
              </button>
            );
          })}
          {filteredNodeAssets.length === 0 && <p className="muted">No node assets match.</p>}
        </div>
      )}
    </PanelShell>
  );
}
