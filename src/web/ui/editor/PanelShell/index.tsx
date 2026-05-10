import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, useRef, useState } from 'react';
import './styles.css';

export function PanelShell({
  title,
  children,
  searchPlaceholder = 'Search...',
  searchValue,
  onSearch,
  tabs,
  activeTab,
  onTabChange,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearch?: (value: string) => void;
  tabs?: Array<{ id: string; label: React.ReactNode }>;
  activeTab?: string;
  onTabChange?: (id: string) => void;
  footer?: React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [localQuery, setLocalQuery] = useState(searchValue ?? '');

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const query = searchValue !== undefined ? searchValue : localQuery;
  const setQuery = onSearch ?? setLocalQuery;

  return (
    <div className="side-panel-content">
      <header className="side-panel-header">
        <h2>{title}</h2>
      </header>
      <div className="side-panel-search">
        <Search size={14} />
        <input
          ref={inputRef}
          type="text"
          placeholder={searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <Button variant="ghost" size="icon" onClick={() => setQuery('')}>
            <X size={14} />
          </Button>
        )}
      </div>
      {tabs && tabs.length > 0 && activeTab && onTabChange && (
        <div className="side-panel-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? 'active' : ''}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
      <div className="side-panel-body">{children}</div>
      {footer && <div className="side-panel-footer">{footer}</div>}
    </div>
  );
}
