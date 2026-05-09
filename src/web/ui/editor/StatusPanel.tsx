import { Activity, Clock, Images } from 'lucide-react';
import type { GenerateWorkflowResponse } from '../../../shared/types.js';

export function StatusPanel({
  status,
  result,
}: {
  status: string;
  result: GenerateWorkflowResponse | null;
}) {
  return (
    <footer className="bottom-panel">
      <section className="queue-card">
        <header>
          <Activity size={17} />
          <h2>Generation Queue</h2>
        </header>
        <p>{status}</p>
        <div className="progress-track">
          <span style={{ width: status === 'Generating...' ? '62%' : result ? '100%' : '0%' }} />
        </div>
      </section>
      <section className="recent-card">
        <header>
          <Images size={17} />
          <h2>Recent Outputs</h2>
        </header>
        {result?.images.length ? (
          <div className="recent-images">
            {result.images.map((image) => (
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
        {result ? <textarea readOnly value={result.prompt} /> : <p className="muted">No compiled prompt yet.</p>}
      </section>
    </footer>
  );
}
