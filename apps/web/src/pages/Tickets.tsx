import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { RichTextEditor, RichTextEditorHandle } from '@/components/RichTextEditor/RichTextEditor';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Search,
  Filter,
  MoreHorizontal,
  User,
  Clock,
  Mail,
  ArrowUpDown,
  Database,
  Globe,
  Download,
  Check,
  X as XIcon,
  Send,
  Loader2,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TicketStatus } from '@/types/ticket';
import { useTickets, useCreateOutboundTicket, useUpdateTicket, useBulkUpdateTickets } from '@/hooks/useTickets';
import { useMailboxes } from '@/hooks/useMailboxes';
import { useNavigate, Link } from 'react-router-dom';
import { useHistoricalSearch } from '@/hooks/useSearch';
import { useImportMessage } from '@/hooks/useSearch';
import { useUserProfile } from '@/hooks/useUsers';

const STATUS_COLOR: Record<string, string> = {
  NEW: 'bg-[#d4c3a1]/20 text-[#8b7355] border-[#d4c3a1]/30',
  OPEN: 'bg-[#b59e6d]/20 text-[#7a6542] border-[#b59e6d]/30',
  PENDING: 'bg-[#a39485]/20 text-[#5c544d] border-[#a39485]/30',
  RESOLVED: 'bg-[#4a453e]/10 text-[#2a2520] border-[#4a453e]/20',
};

const statusConfig: Record<TicketStatus, { label: string, color: string }> = {
  NEW: { label: 'New', color: `${STATUS_COLOR.NEW} hover:bg-[#d4c3a1]/30` },
  OPEN: { label: 'Open', color: `${STATUS_COLOR.OPEN} hover:bg-[#b59e6d]/30` },
  PENDING: { label: 'Pending', color: `${STATUS_COLOR.PENDING} hover:bg-[#a39485]/30` },
  RESOLVED: { label: 'Resolved', color: `${STATUS_COLOR.RESOLVED} hover:bg-[#4a453e]/20` },
};

const STATUS_QUICK: { value: TicketStatus; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'NEW', label: 'New', icon: AlertCircle },
  { value: 'OPEN', label: 'Open', icon: RefreshCw },
  { value: 'PENDING', label: 'Pending', icon: Clock },
  { value: 'RESOLVED', label: 'Resolved', icon: CheckCircle2 },
];

interface GraphMessageEnriched {
  id: string;
  subject: string;
  from: { emailAddress: { address: string; name: string } };
  receivedDateTime: string;
  bodyPreview: string;
  mailbox: { id: string; displayName: string; emailAddress: string };
  isImported?: boolean;
  ticketId?: string;
}

export function Tickets() {
  const [activeStatus, setActiveStatus] = useState<TicketStatus | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMailboxId, setSelectedMailboxId] = useState<string>('ALL');
  const [isHistorical, setIsHistorical] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [assignedToMeFilter, setAssignedToMeFilter] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: mailboxes } = useMailboxes();
  const { data: currentUser } = useUserProfile();
  const importMutation = useImportMessage();
  const navigate = useNavigate();
  const createOutbound = useCreateOutboundTicket();
  const bulkUpdate = useBulkUpdateTickets();

  const { data: response, isLoading: ticketsLoading } = useTickets({
    status: activeStatus as any,
    search: isHistorical ? '' : searchQuery,
    mailboxId: selectedMailboxId === 'ALL' ? undefined : selectedMailboxId,
    assignedToId: assignedToMeFilter ? currentUser?.id : undefined,
  });

  const { data: historicalResults, isFetching: historicalLoading } = useHistoricalSearch(
    isHistorical ? searchQuery : '',
    selectedMailboxId
  );

  const isLoading = ticketsLoading || (isHistorical && historicalLoading);
  const tickets = response?.data ?? [];

  const activeFilterCount = (assignedToMeFilter ? 1 : 0);

  const handleBulkAction = async (update: { status?: string; assignedToUserId?: string | null }) => {
    if (selectedIds.size === 0) return;
    await bulkUpdate.mutateAsync({ ids: Array.from(selectedIds), update });
    setSelectedIds(new Set());
    toast.success(`Updated ${selectedIds.size} ticket${selectedIds.size > 1 ? 's' : ''}`);
  };

  const allVisibleSelected = tickets.length > 0 && tickets.every(t => selectedIds.has(t.id));
  const someSelected = selectedIds.size > 0 && !allVisibleSelected;

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tickets.map(t => t.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Emails</h1>
          <p className="text-muted-foreground mt-1">Manage and respond to incoming emails.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilterOpen(o => !o)}
            className={cn(filterOpen || activeFilterCount > 0 ? 'border-primary text-primary bg-primary/5' : '')}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-4 h-4 inline-flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </Button>
          <Button size="sm" onClick={() => setComposeOpen(true)}>
            <Mail className="w-4 h-4 mr-2" />
            Novi mejl
          </Button>
        </div>
      </div>

      {/* Filter Panel */}
      {filterOpen && (
        <div className="bg-muted/30 border rounded-xl p-4 flex flex-wrap items-center gap-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <Checkbox
              id="assigned-to-me"
              checked={assignedToMeFilter}
              onCheckedChange={(v) => setAssignedToMeFilter(!!v)}
            />
            <label htmlFor="assigned-to-me" className="text-sm font-medium cursor-pointer select-none">
              Assigned to me
            </label>
          </div>
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => { setAssignedToMeFilter(false); }}
            >
              <XIcon className="w-3 h-3 mr-1" /> Clear all
            </Button>
          )}
        </div>
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5 animate-in slide-in-from-top-2 duration-200">
          <span className="text-sm font-semibold text-primary">
            {selectedIds.size} selected
          </span>
          <div className="h-4 border-l border-primary/20" />
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                Change Status <ChevronDown className="w-3 h-3 opacity-60" />
              </Button>
            } />
            <DropdownMenuContent>
              {STATUS_QUICK.map(({ value, label, icon: Icon }) => (
                <DropdownMenuItem key={value} className="gap-2 text-xs"
                  onClick={() => handleBulkAction({ status: value })}>
                  <Icon className="w-3.5 h-3.5" />{label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {currentUser && (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
              onClick={() => handleBulkAction({ assignedToUserId: currentUser.id })}>
              <User className="w-3 h-3" />Assign to me
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 text-xs ml-auto text-muted-foreground"
            onClick={() => setSelectedIds(new Set())}>
            <XIcon className="w-3 h-3 mr-1" />Clear
          </Button>
          {bulkUpdate.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
        </div>
      )}

      {/* Compose Dialog */}
      <ComposeDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        mailboxes={mailboxes ?? []}
        onSend={async (data: any) => {
          try {
            const result = await createOutbound.mutateAsync(data);
            toast.success('Email sent successfully');
            setComposeOpen(false);
            if (result?.id) navigate(`/tickets/${result.id}`);
          } catch (err: any) {
            toast.error(err?.message || 'Failed to send email. Please try again.');
          }
        }}
        isSending={createOutbound.isPending}
      />

      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Tabs value={activeStatus} onValueChange={(v) => setActiveStatus(v as any)}>
              <TabsList className="bg-muted/50 p-1">
                <TabsTrigger value="ALL" className="text-sm">All</TabsTrigger>
                <TabsTrigger value="NEW" className="text-sm">New</TabsTrigger>
                <TabsTrigger value="OPEN" className="text-sm">Open</TabsTrigger>
                <TabsTrigger value="PENDING" className="text-sm">Pending</TabsTrigger>
                <TabsTrigger value="RESOLVED" className="text-sm">Resolved</TabsTrigger>
              </TabsList>
            </Tabs>

            <Select value={selectedMailboxId} onValueChange={(v) => setSelectedMailboxId(v || 'ALL')}>
              <SelectTrigger className="w-[180px] h-9 bg-muted/50 border-none">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <SelectValue placeholder="All Mailboxes">
                    {selectedMailboxId === 'ALL' ? 'All Mailboxes' :
                      mailboxes?.find(m => m.id === selectedMailboxId)?.displayName}
                  </SelectValue>
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Mailboxes</SelectItem>
                {mailboxes?.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-muted/30 rounded-lg p-0.5 border">
              <Button
                variant={!isHistorical ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5"
                onClick={() => setIsHistorical(false)}
              >
                <Database className="w-3.5 h-3.5" />
                Local
              </Button>
              <Button
                variant={isHistorical ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5"
                onClick={() => setIsHistorical(true)}
              >
                <Globe className="w-3.5 h-3.5" />
                Graph
              </Button>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={isHistorical ? "Search Graph API..." : "Search local..."}
                className="pl-9 h-9 border-none bg-muted/50"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="bg-card border rounded-xl overflow-hidden shadow-sm relative min-h-[400px]">
          {isLoading && (
            <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] z-10 flex items-center justify-center animate-in fade-in duration-300">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="text-xs font-medium text-muted-foreground animate-pulse">Loading tickets...</p>
              </div>
            </div>
          )}

          {isHistorical ? (
            <HistoricalResultsTable
              results={historicalResults as GraphMessageEnriched[] || []}
              loading={historicalLoading}
              onImport={(id, mailboxId) => importMutation.mutate({ graphMessageId: id, mailboxId })}
              importingId={importMutation.isPending ? importMutation.variables?.graphMessageId : undefined}
            />
          ) : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={allVisibleSelected}
                      indeterminate={someSelected}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors">
                      Subject
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead>Mailbox</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((ticket) => (
                  <TicketRow
                    key={ticket.id}
                    ticket={ticket}
                    currentUserId={currentUser?.id}
                    selected={selectedIds.has(ticket.id)}
                    onToggleSelect={toggleSelect}
                  />
                ))}
                {tickets.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Database className="w-8 h-8 opacity-20" />
                        <p>No tickets found in this view.</p>
                        <Button variant="link" size="sm" onClick={() => { setActiveStatus('ALL'); setSelectedMailboxId('ALL'); setSearchQuery(''); setAssignedToMeFilter(false); }}>
                          Clear filters
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}

          {!isHistorical && (
            <div className="p-4 border-t bg-muted/10 flex items-center justify-between text-sm text-muted-foreground font-medium">
              <span>Showing {tickets.length} of {response?.total ?? 0} tickets</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled>Previous</Button>
                <Button variant="outline" size="sm">Next</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TicketRow({ ticket, currentUserId, selected, onToggleSelect }: {
  ticket: any;
  currentUserId?: string;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const navigate = useNavigate();
  const updateTicket = useUpdateTicket(ticket.id);

  return (
    <TableRow className={cn('hover:bg-muted/20 transition-colors group cursor-pointer animate-in fade-in duration-300', selected && 'bg-primary/5')}>
      <TableCell>
        <Checkbox
          checked={!!selected}
          onCheckedChange={() => onToggleSelect?.(ticket.id)}
          onClick={(e) => e.stopPropagation()}
        />
      </TableCell>
      <TableCell>
        <Link to={`/tickets/${ticket.id}`} className="flex flex-col">
          <span className="font-semibold text-sm group-hover:text-primary transition-colors underline-offset-4 decoration-primary/30 group-hover:underline">
            {ticket.subject}
          </span>
          <span className="text-xs text-muted-foreground mt-0.5">{ticket.originMailbox.displayName}</span>
        </Link>
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className={cn("font-medium", statusConfig[ticket.status as TicketStatus]?.color)}>
          {statusConfig[ticket.status as TicketStatus]?.label}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Mail className="w-3.5 h-3.5" />
          {ticket.originMailbox.displayName}
        </div>
      </TableCell>
      <TableCell>
        {ticket.assignedTo ? (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
              {ticket.assignedTo.displayName[0]}
            </div>
            <span className="text-sm">{ticket.assignedTo.displayName}</span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground/60 flex items-center gap-2 italic">
            <User className="w-3.5 h-3.5" />
            Unassigned
          </span>
        )}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        <div className="flex flex-col items-end">
          <span className="text-sm">{new Date(ticket.createdAt).toLocaleDateString()}</span>
          <span className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            {new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuLabel>Quick Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate(`/tickets/${ticket.id}`)}>
              View ticket
            </DropdownMenuItem>
            {currentUserId && (
              <DropdownMenuItem onClick={() => updateTicket.mutate({ assignedToUserId: currentUserId })}>
                Assign to me
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {STATUS_QUICK.map(({ value, label, icon: Icon }) => (
              <DropdownMenuItem
                key={value}
                onClick={() => updateTicket.mutate({ status: value })}
                className={cn('gap-2', ticket.status === value && 'font-bold text-primary')}
              >
                <Icon className="w-3.5 h-3.5" />
                Mark {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function HistoricalResultsTable({
  results,
  loading,
  onImport,
  importingId
}: {
  results: GraphMessageEnriched[],
  loading: boolean,
  onImport: (id: string, mailboxId: string) => void,
  importingId?: string
}) {
  const navigate = useNavigate();

  if (loading) return <div className="p-20 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  if (results.length === 0) return <div className="p-20 text-center text-muted-foreground">No historical messages found. Try a broader search.</div>;

  return (
    <Table>
      <TableHeader className="bg-muted/30">
        <TableRow>
          <TableHead>Subject</TableHead>
          <TableHead>From</TableHead>
          <TableHead>Mailbox</TableHead>
          <TableHead className="text-right">Dated</TableHead>
          <TableHead className="w-[120px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map((msg) => (
          <TableRow key={msg.id} className="hover:bg-muted/20 transition-colors group">
            <TableCell>
              <div className="flex flex-col">
                <span className="font-semibold text-sm line-clamp-1">{msg.subject}</span>
                <span className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{msg.bodyPreview}</span>
              </div>
            </TableCell>
            <TableCell>
              <div className="text-sm truncate max-w-[150px]">
                {msg.from.emailAddress.name || msg.from.emailAddress.address}
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="w-3.5 h-3.5" />
                {msg.mailbox.displayName}
              </div>
            </TableCell>
            <TableCell className="text-right whitespace-nowrap">
              <span className="text-sm text-muted-foreground">
                {new Date(msg.receivedDateTime).toLocaleDateString()}
              </span>
            </TableCell>
            <TableCell>
              <div className="flex justify-end">
                {msg.isImported ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                    onClick={() => navigate(`/tickets/${msg.ticketId}`)}
                  >
                    <Check className="w-3.5 h-3.5" />
                    View
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1"
                    disabled={!!importingId}
                    onClick={() => onImport(msg.id, msg.mailbox.id)}
                  >
                    {importingId === msg.id ? (
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    Import
                  </Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Chip/tag style email address input */
function EmailChipInput({
  label,
  chips,
  onChange,
  placeholder,
}: {
  label: string;
  chips: string[];
  onChange: (chips: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');

  const addChip = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !chips.includes(trimmed)) {
      onChange([...chips, trimmed]);
    }
    setInput('');
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</Label>
      <div className="flex flex-wrap gap-1.5 min-h-[38px] rounded-md border bg-background px-3 py-1.5 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0">
        {chips.map(chip => (
          <span key={chip} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs rounded-full px-2 py-0.5 font-medium">
            {chip}
            <button type="button" onClick={() => onChange(chips.filter(c => c !== chip))} className="hover:opacity-70">
              <XIcon className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground/50 py-0.5"
          value={input}
          placeholder={chips.length === 0 ? placeholder : ''}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',' || e.key === ' ' || e.key === 'Tab') {
              e.preventDefault();
              if (input.trim()) addChip(input);
            }
            if (e.key === 'Backspace' && !input && chips.length > 0) {
              onChange(chips.slice(0, -1));
            }
          }}
          onBlur={() => { if (input.trim()) addChip(input); }}
        />
      </div>
    </div>
  );
}

function ComposeDialog({
  open,
  onClose,
  mailboxes,
  onSend,
  isSending,
}: {
  open: boolean;
  onClose: () => void;
  mailboxes: { id: string; displayName: string; emailAddress: string }[];
  onSend: (data: { subject: string; to: string[]; cc: string[]; bcc: string[]; bodyHtml: string; fromMailboxId: string }) => Promise<void>;
  isSending: boolean;
}) {
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [bcc, setBcc] = useState<string[]>([]);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [fromMailboxId, setFromMailboxId] = useState('');
  const richEditorRef = useRef<RichTextEditorHandle>(null);

  // Set default mailbox
  const defaultMailbox = mailboxes[0];
  const effectiveMailboxId = fromMailboxId || defaultMailbox?.id || '';

  const isBodyEmpty = richEditorRef.current?.isEmpty() ?? !bodyHtml.trim();
  const canSend = to.length > 0 && subject.trim() && !isBodyEmpty && effectiveMailboxId;

  const handleSend = async () => {
    if (!canSend) return;
    const html = richEditorRef.current?.getHTML() ?? bodyHtml;
    await onSend({ subject: subject.trim(), to, cc, bcc, bodyHtml: html, fromMailboxId: effectiveMailboxId });
    // Reset on close
    setTo([]); setCc([]); setBcc([]); setSubject(''); setBodyHtml(''); setFromMailboxId(''); setShowCc(false); setShowBcc(false);
    richEditorRef.current?.setContent('');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[620px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Mail className="w-4 h-4 text-primary" />
            Compose New Email
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-4 space-y-3">
          {/* From mailbox */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">From</Label>
            <Select value={effectiveMailboxId} onValueChange={(v) => setFromMailboxId(v ?? '')}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select mailbox">
                  {mailboxes.find(m => m.id === effectiveMailboxId)?.displayName}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {mailboxes.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.displayName} <span className="text-muted-foreground ml-1 text-xs">({m.emailAddress})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* To */}
          <EmailChipInput label="To" chips={to} onChange={setTo} placeholder="recipient@example.com — press Enter or comma" />

          {/* CC / BCC toggles + fields */}
          <div className="flex items-center gap-3">
            {!showCc && (
              <button type="button" className="text-xs text-primary underline-offset-2 hover:underline" onClick={() => setShowCc(true)}>
                + Add CC
              </button>
            )}
            {!showBcc && (
              <button type="button" className="text-xs text-primary underline-offset-2 hover:underline" onClick={() => setShowBcc(true)}>
                + Add BCC
              </button>
            )}
          </div>
          {showCc && <EmailChipInput label="CC" chips={cc} onChange={setCc} placeholder="cc@example.com" />}
          {showBcc && <EmailChipInput label="BCC (hidden from other recipients)" chips={bcc} onChange={setBcc} placeholder="bcc@example.com" />}

          {/* Subject */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Subject</Label>
            <Input
              className="h-9 text-sm"
              placeholder="Email subject"
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />
          </div>

          {/* Body */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Message</Label>
            <RichTextEditor
              ref={richEditorRef}
              onChange={setBodyHtml}
              placeholder="Write your message here…"
              className="rounded-md border bg-background [&_.ProseMirror]:min-h-[160px]"
            />
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t bg-muted/30 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {!canSend ? 'Fill in To, Subject and Message to send.' : 'Ready to send.'}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isSending}>Cancel</Button>
            <Button size="sm" onClick={handleSend} disabled={!canSend || isSending} className="gap-1.5">
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
