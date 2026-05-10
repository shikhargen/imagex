import {
  Box,
  ChevronRight,
  HelpCircle,
  Image,
  Keyboard,
  Layers3,
  Menu,
  Settings,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';

export type SidebarItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  section: 'top' | 'bottom';
  modal?: boolean;
};

export const sidebarItems: SidebarItem[] = [
  { id: 'assets', label: 'Assets', icon: Image, section: 'top' },
  { id: 'nodes', label: 'Nodes', icon: Box, section: 'top' },
  { id: 'workflows', label: 'Workflows', icon: Layers3, section: 'top' },
  { id: 'help', label: 'Help', icon: HelpCircle, section: 'bottom', modal: true },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard, section: 'bottom', modal: true },
  { id: 'settings', label: 'Settings', icon: Settings, section: 'bottom', modal: true },
];

export function Sidebar({
  activePanel,
  onOpenPanel,
  onOpenModal,
  onMenuAction,
  showMinimap,
  rightOpen,
}: {
  activePanel: string | null;
  onOpenPanel: (panelId: string) => void;
  onOpenModal: (modalId: string) => void;
  onMenuAction: (action: string) => void;
  showMinimap: boolean;
  rightOpen: boolean;
}) {
  const top = sidebarItems.filter((i) => i.section === 'top');
  const bottom = sidebarItems.filter((i) => i.section === 'bottom');

  const [menuOpen, setMenuOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const menuItems = useMemo(
    () => [
      { id: 'exit-project', label: 'Back to projects' },
      { type: 'separator' },
      { id: 'file-new-workflow', label: 'New workflow' },
      { id: 'file-rename-workflow', label: 'Rename workflow' },
      { id: 'file-compile-prompt', label: 'Compile prompt' },
      { type: 'separator' },
      {
        id: 'edit',
        label: 'Edit',
        items: [
          { id: 'edit-undo', label: 'Undo' },
          { id: 'edit-redo', label: 'Redo' },
          { id: 'edit-duplicate', label: 'Duplicate selection' },
          { id: 'edit-delete', label: 'Delete selection' },
          { id: 'edit-disconnect', label: 'Disconnect selection' },
          { id: 'edit-detach-frame', label: 'Detach from frame' },
          { id: 'edit-clear-selection', label: 'Clear selection' },
        ],
      },
      {
        id: 'view',
        label: 'View',
        items: [
          { id: 'view-zoom-in', label: 'Zoom in' },
          { id: 'view-zoom-out', label: 'Zoom out' },
          { id: 'view-fit', label: 'Fit to screen' },
          { id: 'view-toggle-minimap', label: showMinimap ? 'Hide minimap' : 'Show minimap' },
          { id: 'view-toggle-inspector', label: rightOpen ? 'Hide inspector' : 'Show inspector' },
        ],
      },
      { type: 'separator' },
      {
        id: 'settings',
        label: 'Preferences',
        items: [
          { id: 'settings-open', label: 'Settings' },
          { id: 'settings-shortcuts', label: 'Keyboard shortcuts' },
        ],
      },
    ],
    [rightOpen, showMinimap]
  );

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setActiveMenu(null);
      }
    };
    const onMouseDown = (event: MouseEvent) => {
      if (!menuRef.current || !triggerRef.current) return;
      if (menuRef.current.contains(event.target as Node) || triggerRef.current.contains(event.target as Node)) return;
      setMenuOpen(false);
      setActiveMenu(null);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) setActiveMenu(null);
  }, [menuOpen]);

  return (
    <aside className="thin-sidebar">
      <div className="thin-sidebar-top">
        <div className="sidebar-menu-container">
          <button
            ref={triggerRef}
            type="button"
            className={`thin-sidebar-btn sidebar-menu-btn ${menuOpen ? 'active' : ''}`}
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-label="Open menu"
            onClick={() => setMenuOpen((current) => !current)}
            title="Menu"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          {menuOpen && (
            <div className="menu-shell sidebar-menu-shell" ref={menuRef}>
              <div className="menu-list">
                {menuItems.map((item, index) => {
                  if (item.type === 'separator') {
                    return <div key={`sep-${index}`} className="menu-separator" />;
                  }
                  const hasSubMenu = item.items && item.items.length > 0;
                  return (
                    <div
                      key={item.id}
                      className="menu-item-container"
                      onMouseEnter={() => hasSubMenu ? setActiveMenu(item.id!) : setActiveMenu(null)}
                    >
                      <button
                        type="button"
                        className={`menu-item ${activeMenu === item.id ? 'active' : ''}`}
                        onClick={() => {
                          if (hasSubMenu) {
                            setActiveMenu(activeMenu === item.id ? null : item.id!);
                          } else {
                            onMenuAction(item.id!);
                            setMenuOpen(false);
                          }
                        }}
                      >
                        <span>{item.label}</span>
                        {hasSubMenu && <ChevronRight size={14} />}
                      </button>
                      {hasSubMenu && activeMenu === item.id && (
                        <div className="menu-submenu">
                          {item.items!.map((subItem) => (
                            <button
                              key={subItem.id}
                              type="button"
                              className="menu-item"
                              onClick={() => {
                                onMenuAction(subItem.id);
                                setMenuOpen(false);
                              }}
                            >
                              <span>{subItem.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        {top.map((item) => {
          const Icon = item.icon;
          const active = activePanel === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`thin-sidebar-btn ${active ? 'active' : ''}`}
              onClick={() => onOpenPanel(item.id)}
              title={item.label}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      <div className="thin-sidebar-bottom">
        {bottom.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className="thin-sidebar-btn"
              onClick={() => onOpenModal(item.id)}
              title={item.label}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
