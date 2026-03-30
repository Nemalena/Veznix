import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, CheckCheck, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { useNavigate } from 'react-router-dom';

interface Notification {
  id: string;
  type: string;
  ticketId: string;
  isRead: boolean;
  createdAt: string;
  ticket?: { id: string; subject: string };
}

const TYPE_LABELS: Record<string, string> = {
  TICKET_ASSIGNED: '📋 Assigned to you',
  MENTIONED: '💬 Mentioned you',
  TICKET_REPLIED: '↩️ New reply',
  NEW_TICKET: '📨 New ticket',
  TICKET_OVERDUE: '⏰ Overdue',
};

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const [notifResponse, { count }] = await Promise.all([
        apiFetch('/notifications'),
        apiFetch('/notifications/unread-count'),
      ]);
      // API now returns { data, nextCursor, hasMore } for pagination
      setNotifications(notifResponse?.data ?? notifResponse ?? []);
      setUnreadCount(count);
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  }, []);

  // Connect SSE on mount
  useEffect(() => {
    fetchNotifications();

    let es: EventSource;

    const connect = async () => {
      try {
        // Get MSAL token — EventSource can't send headers, so we pass it as ?token=
        const { msalInstance, loginRequest } = await import('@/lib/msal');
        const accounts = msalInstance.getAllAccounts();
        if (accounts.length === 0) return;

        const { idToken } = await msalInstance.acquireTokenSilent({
          ...loginRequest,
          account: accounts[0]
        });

        const apiBase = import.meta.env.VITE_API_URL || '/api';
        es = new EventSource(`${apiBase}/notifications/stream?token=${encodeURIComponent(idToken)}`);

        es.addEventListener('notification', (e) => {
          const n: Notification = JSON.parse(e.data);
          setNotifications(prev => [n, ...prev]);
          setUnreadCount(c => c + 1);
        });

        es.onerror = () => {
          console.warn('[SSE] Connection error, will retry...');
          es?.close();
          // Wait 10s then try to reconnect with a fresh token
          setTimeout(connect, 10_000);
        };

        sseRef.current = es;
      } catch (err) {
        console.warn('[SSE] Could not connect:', err);
      }
    };

    connect();

    return () => {
      sseRef.current?.close();
    };
  }, [fetchNotifications]);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markRead = async (id: string) => {
    await apiFetch(`/notifications/${id}/read`, { method: 'PATCH' });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    setUnreadCount(c => Math.max(0, c - 1));
  };

  const markAllRead = async () => {
    await apiFetch('/notifications/mark-all-read', { method: 'POST' });
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  const handleClick = (n: Notification) => {
    if (!n.isRead) markRead(n.id);
    navigate(`/tickets/${n.ticketId}`);
    setOpen(false);
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <Button
        variant="ghost" size="icon"
        className="relative rounded-full w-9 h-9"
        onClick={() => { setOpen(o => !o); if (!open) fetchNotifications(); }}
      >
        <Bell className="w-4.5 h-4.5" />
        {unreadCount > 0 && (
          <span className={cn(
            'absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center',
            'bg-red-500 text-white rounded-full text-[10px] font-bold px-1 ring-2 ring-background',
            'animate-in zoom-in duration-300'
          )}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>

      {/* Notification Panel */}
      {open && (
        <div className={cn(
          'absolute right-0 top-11 z-50 w-80 rounded-2xl shadow-2xl border bg-card',
          'animate-in slide-in-from-top-2 fade-in duration-200'
        )}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm">Notifications</h3>
              {unreadCount > 0 && (
                <Badge className="bg-primary/10 text-primary border-none text-xs px-1.5 py-0 font-bold">
                  {unreadCount} new
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-muted-foreground px-2"
                  onClick={markAllRead}>
                  <CheckCheck className="w-3.5 h-3.5" />All read
                </Button>
              )}
              <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => setOpen(false)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[360px] overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && notifications.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-10">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                No notifications yet
              </div>
            )}
            {notifications.map(n => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={cn(
                  'w-full text-left px-4 py-3 border-b last:border-0 transition-colors',
                  'hover:bg-muted/40 flex items-start gap-3',
                  !n.isRead && 'bg-primary/3'
                )}
              >
                {!n.isRead && (
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                )}
                {n.isRead && <span className="mt-1.5 w-2 h-2 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className={cn('text-xs font-semibold', !n.isRead && 'text-foreground', n.isRead && 'text-muted-foreground')}>
                    {TYPE_LABELS[n.type] ?? n.type}
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {n.ticket?.subject ?? `Ticket #${n.ticketId}`}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
