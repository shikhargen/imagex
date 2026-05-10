import { type ReactNode } from 'react';
import './styles.css';

export function JsonCodeBlock({ code }: { code: string }) {
  const lines = code.split('\n');
  return (
    <div className="json-code" role="region" aria-label="Compiled prompt JSON">
      {lines.map((line, index) => (
        <div className="json-code-line" key={`${index}-${line}`}>
          <span className="json-line-number">{index + 1}</span>
          <code>{highlightJsonLine(line)}</code>
        </div>
      ))}
    </div>
  );
}

function highlightJsonLine(line: string): ReactNode[] {
  const tokens = line.split(/("(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}[\],])/g);
  return tokens.filter(Boolean).map((token, index) => {
    let className = 'json-token';
    if (/^"(?:\\.|[^"\\])*"\s*:$/.test(token)) className += ' key';
    else if (/^"(?:\\.|[^"\\])*"$/.test(token)) className += ' string';
    else if (/^-?\d/.test(token)) className += ' number';
    else if (/^(true|false)$/.test(token)) className += ' boolean';
    else if (token === 'null') className += ' null';
    else if (/^[{}[\],]$/.test(token)) className += ' punctuation';
    return (
      <span className={className} key={`${index}-${token}`}>
        {token}
      </span>
    );
  });
}
