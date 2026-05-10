import { Activity, Clock, Images } from 'lucide-react';
import type { OutputNodeResult } from '../../../shared/types.js';

export function StatusPanel({
  status,
  outputResults,
}: {
  status: string;
  outputResults: Map<string, OutputNodeResult>;
}) {
  const allImages = Array.from(outputResults.values()).flatMap((r) => r.images);
  const hasResults = outputResults.size > 0;
  return (
    <footer className="bottom-panel">
      <section className="queue-card">
        <header>
          <Activity size={17} />
          <h2>Generation Queue</h2>
        </header>
        <p>{status}</p>
        <div className="progress-track">
          <span style={{ width: status === 'Generating...' ? '62%' : hasResults ? '100%' : '0%' }} />
        </div>
      </section>
      <section className="recent-card">
        <header>
          <Images size={17} />
          <h2>Recent Outputs</h2>
        </header>
        {allImages.length ? (
          <div className="recent-images">
            {allImages.map((image) => (
              <img key={image.id} src={image.url} alt="Generated output" />
            ))}
          </div>
        ) : (
          <p className="muted">Generated images will appear here after a run.</p>
        )}
      </section>
      <section className="stats-card">
        <header>
          <Clock size={17} />
          <h2>Run Details</h2>
        </header>
        {hasResults ? (
          <textarea readOnly value={Array.from(outputResults.values()).map((r) => r.prompt).join('\n\n---\n\n')} />
        ) : (
          <p className="muted">No compiled prompt yet.</p>
        )}
      </section>
    </footer>
  );
}
