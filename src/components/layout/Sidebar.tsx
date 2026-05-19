import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  Settings,
  LogOut,
  TrendingUp,
  Globe,
  Moon,
  Sun,
  Briefcase
} from 'lucide-react';
import { useTheme } from 'next-themes';

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const location = useLocation();
  const { t, language, setLanguage } = useLanguage();
  const { signOut, user } = useAuth();
  const { theme, setTheme } = useTheme();

  const navItems = [
    { href: '/', label: t.nav.dashboard, icon: LayoutDashboard },
    { href: '/portfolio', label: t.portfolio.title, icon: Briefcase },
    { href: '/settings', label: t.nav.settings, icon: Settings },
  ];

  const isActive = (href: string) => {
    if (href === '/') return location.pathname === '/';
    return location.pathname.startsWith(href);
  };


  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
        <TrendingUp className="h-6 w-6 text-primary" />
        <span className="text-xl font-bold text-sidebar-foreground">Napsys</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive(item.href)
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-sidebar-border p-4 space-y-4">
        {/* Language toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-sidebar-foreground">
            <Globe className="h-4 w-4" />
            <span>{t.settings.language}</span>
          </div>
          <div className="flex gap-1">
            <Button
              variant={language === 'sv' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setLanguage('sv')}
            >
              SV
            </Button>
            <Button
              variant={language === 'en' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setLanguage('en')}
            >
              EN
            </Button>
          </div>
        </div>

        {/* Theme toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-sidebar-foreground">
            {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            <span>{t.settings.theme}</span>
          </div>
          <div className="flex gap-1">
            <Button
              variant={theme === 'light' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setTheme('light')}
            >
              <Sun className="h-3 w-3" />
            </Button>
            <Button
              variant={theme === 'dark' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setTheme('dark')}
            >
              <Moon className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* User info and logout */}
        {user && (
          <div className="space-y-2">
            <p className="truncate text-sm text-muted-foreground">
              {user.email}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={signOut}
            >
              <LogOut className="h-4 w-4" />
              {t.nav.logout}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
