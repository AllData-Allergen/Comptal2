import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Upload,
  Pencil,
  BarChart3,
  ClipboardList,
  FileText,
  Contact,
  HeartHandshake,
  BookOpenCheck,
  Landmark,
  Settings,
  ChevronLeft,
  ChevronRight,
  LucideIcon,
} from 'lucide-react';
import { MenuVisibility } from '../../types/settings';
import { SettingsService } from '../../services/SettingsService';
import { ProfileService } from '../../services/ProfileService';
import { Logger } from '../../services/logger';

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

interface MenuItem {
  path: string;
  icon: LucideIcon;
  labelKey: string;
  visibilityKey: keyof MenuVisibility | null;
}

const ALL_MENU_ITEMS: MenuItem[] = [
  { path: '/dashboard', icon: LayoutDashboard, labelKey: 'navigation.dashboard', visibilityKey: 'dashboard' },
  { path: '/upload', icon: Upload, labelKey: 'navigation.import', visibilityKey: 'upload' },
  { path: '/edition', icon: Pencil, labelKey: 'navigation.edition', visibilityKey: 'edition' },
  { path: '/finance-global', icon: BarChart3, labelKey: 'navigation.financeGlobal', visibilityKey: 'financeGlobal' },
  { path: '/previsionnel', icon: ClipboardList, labelKey: 'navigation.projectManagement', visibilityKey: 'projectManagement' },
  { path: '/clients', icon: Contact, labelKey: 'navigation.clients', visibilityKey: 'clients' },
  { path: '/facturation', icon: FileText, labelKey: 'navigation.invoicing', visibilityKey: 'invoicing' },
  { path: '/dons', icon: HeartHandshake, labelKey: 'navigation.association', visibilityKey: 'association' },
  { path: '/registre', icon: BookOpenCheck, labelKey: 'navigation.register', visibilityKey: 'register' },
  { path: '/amortissement', icon: Landmark, labelKey: 'navigation.amortissement', visibilityKey: 'amortissement' },
  { path: '/parametre', icon: Settings, labelKey: 'navigation.settings', visibilityKey: null },
];

const Sidebar: React.FC<SidebarProps> = ({ isCollapsed, onToggle }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const [menuVisibility, setMenuVisibility] = useState<MenuVisibility>(() => {
    try {
      return SettingsService.current.menuVisibility;
    } catch {
      // If settings not loaded yet, return default visibility (all true)
      return {
        dashboard: true,
        upload: true,
        edition: true,
        financeGlobal: true,
        projectManagement: true,
        invoicing: true,
        clients: true,
        association: true,
        register: true,
        amortissement: true,
      };
    }
  });

  const [profileName, setProfileName] = useState('');

  useEffect(() => {
    return SettingsService.subscribe((settings) => setMenuVisibility(settings.menuVisibility));
  }, []);

  useEffect(() => {
    const refresh = async () => {
      const profiles = await ProfileService.list();
      const active = profiles.find((profile) => profile.id === SettingsService.current.activeProfileId);
      setProfileName(active?.name ?? '');
    };
    void refresh();
    return SettingsService.subscribe(() => void refresh());
  }, []);

  const menuItems = ALL_MENU_ITEMS.filter(
    (item) => item.visibilityKey === null || menuVisibility[item.visibilityKey]
  );

  return (
    <aside
      className={`
        fixed left-0 top-0 h-screen bg-white dark:bg-gray-800 shadow-lg
        transition-all duration-300 ease-in-out z-40
        ${isCollapsed ? 'w-16' : 'w-64'}
      `}
    >
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-700">
        {!isCollapsed && (
          <h1 className="text-xl font-bold text-primary-600 dark:text-primary-400">Comptal2.1</h1>
        )}
        <button
          onClick={onToggle}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300"
          title={isCollapsed ? t('navigation.expand') : t('navigation.collapse')}
        >
          {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      <nav className="p-2 space-y-1">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`
                flex items-center gap-3 px-3 py-3 rounded-lg
                transition-all duration-200
                ${
                  isActive
                    ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }
                ${isCollapsed ? 'justify-center' : ''}
              `}
              title={isCollapsed ? t(item.labelKey) : ''}
            >
              <Icon
                size={20}
                className={isActive ? 'text-primary-600 dark:text-primary-400' : ''}
              />
              {!isCollapsed && <span className="font-medium">{t(item.labelKey)}</span>}
            </Link>
          );
        })}
      </nav>

      {!isCollapsed && (
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 dark:border-gray-700">
          {profileName && (
            <p className="text-xs font-medium text-center mb-1 truncate" style={{ color: 'var(--invoicing-primary)' }} title={profileName}>
              {t('settings.profiles.active')}: {profileName}
            </p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Version {Logger.session?.appVersion ?? '2.1.2'}
          </p>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
