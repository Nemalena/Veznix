import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Ticket, Settings, Mail, LogOut, BookOpen, Users, SendHorizonal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMsal } from '@azure/msal-react';
import { useNotificationPrefs } from '@/hooks/useNotificationPrefs';

const baseNavigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Emails', href: '/tickets', icon: Ticket },
  { name: 'Sent', href: '/sent', icon: SendHorizonal },
  { name: 'Templates', href: '/templates', icon: BookOpen },
  { name: 'Settings', href: '/settings', icon: Settings },
];

const adminNavigation = [
  { name: 'Users', href: '/users', icon: Users },
];

export function Sidebar() {
  const location = useLocation();
  const { instance } = useMsal();
  const { data: currentUser } = useNotificationPrefs();
  const isAdmin = currentUser?.isAdmin ?? false;

  const navigation = isAdmin ? [...baseNavigation, ...adminNavigation] : baseNavigation;

  const handleLogout = () => {
    instance.logoutRedirect();
  };

  return (
    <div className="flex flex-col w-64 border-r bg-card h-screen sticky top-0">
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
          <Mail className="w-5 h-5" />
        </div>
        <span className="font-bold text-2xl tracking-tight font-serif regular text-primary">Veznix</span>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(item.href));
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 group text-sm font-medium",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className={cn("w-4 h-4", isActive ? "" : "text-muted-foreground group-hover:text-foreground")} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </div>
  );
}
