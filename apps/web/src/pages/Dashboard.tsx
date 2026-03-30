import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Ticket, Users, Clock, AlertCircle, TrendingUp, Mail, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStats, useTickets } from '@/hooks/useTickets';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState, useMemo } from 'react';

const STATUS_COLOR: Record<string, string> = {
  NEW: 'bg-[#d4c3a1]/20 text-[#8b7355] border-[#d4c3a1]/30',
  OPEN: 'bg-[#b59e6d]/20 text-[#7a6542] border-[#b59e6d]/30',
  PENDING: 'bg-[#a39485]/20 text-[#5c544d] border-[#a39485]/30',
  RESOLVED: 'bg-[#4a453e]/10 text-[#2a2520] border-[#4a453e]/20',
};

function StatCard({ name, value, icon: Icon, description, color, loading }: any) {
  return (
    <Card className="border-none shadow-md shadow-neutral-200/50 hover:shadow-lg transition-all duration-300">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 text-muted-foreground">
        <CardTitle className="text-sm font-medium">{name}</CardTitle>
        <Icon className={cn('w-4 h-4', color)} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-9 w-16 rounded-lg bg-muted/50 animate-pulse" />
        ) : (
          <div className={cn('text-3xl font-bold', color)}>{value}</div>
        )}
        <p className="text-xs text-muted-foreground mt-1 font-medium">{description}</p>
      </CardContent>
    </Card>
  );
}

export function Dashboard() {
  const [dateRange, setDateRange] = useState<string>('30d');

  const dateParams = useMemo(() => {
    if (dateRange === 'all') return undefined;
    const end = new Date();
    const start = new Date();
    if (dateRange === '7d') start.setDate(start.getDate() - 7);
    if (dateRange === '30d') start.setDate(start.getDate() - 30);
    if (dateRange === '90d') start.setDate(start.getDate() - 90);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }, [dateRange]);

  // Use staleTime so the page renders immediately on revisit without showing loading
  const { data: stats, isLoading: statsLoading } = useStats(dateParams);
  const { data: recentTicketsResponse, isLoading: ticketsLoading } = useTickets({ limit: 5 } as any);

  const recentTickets = recentTicketsResponse?.data ?? [];

  const statItems = [
    { name: 'Total Tickets',  value: stats?.total ?? '—',            icon: Ticket,      description: dateRange === 'all' ? 'All time' : `Last ${dateRange.replace('d', ' days')}`,          color: 'text-[#8b7355]' },
    { name: 'Open Tickets',   value: stats?.open ?? '—',             icon: AlertCircle, description: 'Requires attention', color: 'text-[#b59e6d]' },
    { name: 'Avg. Response',  value: stats?.avgResponseTime ?? '—',  icon: Clock,       description: dateRange === 'all' ? 'All time' : `Last ${dateRange.replace('d', ' days')}`,       color: 'text-[#5c544d]' },
    { name: 'Active Agents',  value: stats?.activeAgents ?? '—',     icon: Users,       description: 'Replied recently',   color: 'text-[#4a453e]' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">System Overview</h1>
          <p className="text-muted-foreground text-lg mt-2">Real-time metrics across all shared mailboxes.</p>
        </div>
        <div className="w-[180px]">
          <Select value={dateRange} onValueChange={(val) => setDateRange(val || '30d')}>
            <SelectTrigger>
              <SelectValue placeholder="Select timeframe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats cards — skeleton on load, no full-page spinner */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {statItems.map(stat => (
          <StatCard key={stat.name} {...stat} loading={statsLoading} />
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        {/* Recent Tickets */}
        <Card className="col-span-4 border-none shadow-md shadow-neutral-200/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Recent Tickets
            </CardTitle>
            <Link to="/tickets" className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {ticketsLoading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => (
                  <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : recentTickets.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-10">
                No tickets yet.
              </div>
            ) : (
              <div className="space-y-2">
                {recentTickets.map((t: any) => (
                  <Link key={t.id} to={`/tickets/${t.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/40 transition-colors group border border-transparent hover:border-border">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Mail className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">{t.subject}</p>
                      <p className="text-xs text-muted-foreground truncate">{t.originMailbox.displayName} · {new Date(t.createdAt).toLocaleDateString()}</p>
                    </div>
                    <Badge className={cn('text-[10px] font-bold border-none flex-shrink-0', STATUS_COLOR[t.status] ?? 'bg-muted text-muted-foreground')}>
                      {t.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick stats */}
        <Card className="col-span-3 border-none shadow-md shadow-neutral-200/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              At a Glance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { label: 'New (unassigned)', value: stats?.new ?? '—', color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Open', value: stats?.open ?? '—', color: 'text-amber-600', bg: 'bg-amber-50' },
                { label: 'Pending', value: stats?.pending ?? '—', color: 'text-purple-600', bg: 'bg-purple-50' },
                { label: 'Resolved (30d)', value: stats?.resolved ?? '—', color: 'text-emerald-600', bg: 'bg-emerald-50' },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between p-3 rounded-xl border bg-muted/10 hover:bg-muted/30 transition-colors">
                  <span className="text-sm font-medium text-muted-foreground">{item.label}</span>
                  <span className={cn('text-lg font-bold', item.color)}>
                    {statsLoading ? <span className="w-6 h-5 rounded bg-muted/50 animate-pulse inline-block" /> : item.value}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
