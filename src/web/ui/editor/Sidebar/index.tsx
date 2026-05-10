import {
  Box,
  HelpCircle,
  Image,
  Keyboard,
  Layers3,
  Settings,
} from 'lucide-react';
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
}: {
  activePanel: string | null;
  onOpenPanel: (panelId: string) => void;
  onOpenModal: (modalId: string) => void;
}) {
  const top = sidebarItems.filter((i) => i.section === 'top');
  const bottom = sidebarItems.filter((i) => i.section === 'bottom');

  return (
    <aside className="thin-sidebar">
      <div className="thin-sidebar-top">
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
