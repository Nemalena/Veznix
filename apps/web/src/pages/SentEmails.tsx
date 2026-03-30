import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SendHorizonal, Mail, User, Clock, ExternalLink } from 'lucide-react';
import { useMailboxes } from '@/hooks/useMailboxes';
import { useSentEmails } from '@/hooks/useTickets';
import { Link } from 'react-router-dom';

const STATUS_COLOR: Record<string, string> = {
  NEW: 'bg-[#d4c3a1]/20 text-[#8b7355] border-[#d4c3a1]/30',
  OPEN: 'bg-[#b59e6d]/20 text-[#7a6542] border-[#b59e6d]/30',
  PENDING: 'bg-[#a39485]/20 text-[#5c544d] border-[#a39485]/30',
  RESOLVED: 'bg-[#4a453e]/10 text-[#2a2520] border-[#4a453e]/20',
};

export function SentEmails() {
  const [selectedMailboxId, setSelectedMailboxId] = useState<string>('ALL');
  const [page, setPage] = useState(1);

  const { data: mailboxes } = useMailboxes();
  const { data, isLoading } = useSentEmails({
    mailboxId: selectedMailboxId === 'ALL' ? undefined : selectedMailboxId,
    page,
  });

  const articles = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sent</h1>
          <p className="text-muted-foreground mt-1">Emails sent from your accessible mailboxes.</p>
        </div>

        <Select value={selectedMailboxId} onValueChange={(v) => { setSelectedMailboxId(v || 'ALL'); setPage(1); }}>
          <SelectTrigger className="w-[200px] h-9 bg-muted/50 border-none">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <SelectValue placeholder="All Mailboxes">
                {selectedMailboxId === 'ALL' ? 'All Mailboxes' : mailboxes?.find(m => m.id === selectedMailboxId)?.displayName}
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

      <div className="bg-card border rounded-xl overflow-hidden shadow-sm relative min-h-[400px]">
        {isLoading && (
          <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] z-10 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              <p className="text-xs font-medium text-muted-foreground animate-pulse">Loading sent emails…</p>
            </div>
          </div>
        )}

        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>To</TableHead>
              <TableHead>CC / BCC</TableHead>
              <TableHead>Sent from</TableHead>
              <TableHead>Sent by</TableHead>
              <TableHead>Ticket status</TableHead>
              <TableHead className="text-right">Date</TableHead>
              <TableHead className="w-[40px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {articles.map((article) => (
              <TableRow key={article.id} className="hover:bg-muted/20 transition-colors group">
                <TableCell>
                  <span className="font-semibold text-sm line-clamp-1">
                    {article.ticket?.subject ?? '(no subject)'}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground max-w-[200px] truncate">
                    <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{article.toAddress ?? '—'}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {(article.ccAddresses || article.bccAddresses) ? (
                    <div className="flex flex-col gap-0.5 text-xs max-w-[180px]">
                      {article.ccAddresses && (
                        <div className="flex items-start gap-1 text-muted-foreground">
                          <span className="font-semibold flex-shrink-0">CC:</span>
                          <span className="truncate">{article.ccAddresses}</span>
                        </div>
                      )}
                      {article.bccAddresses && (
                        <div className="flex items-start gap-1 text-amber-700">
                          <span className="font-semibold flex-shrink-0">BCC:</span>
                          <span className="truncate">{article.bccAddresses}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground/40">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <SendHorizonal className="w-3.5 h-3.5 flex-shrink-0" />
                    {article.sentFromMailbox?.displayName ?? '—'}
                  </div>
                </TableCell>
                <TableCell>
                  {article.sentBy ? (
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary flex-shrink-0">
                        {article.sentBy.displayName[0]}
                      </div>
                      {article.sentBy.displayName}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <User className="w-3.5 h-3.5" />
                      System
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {article.ticket?.status ? (
                    <Badge variant="secondary" className={`font-medium text-xs ${STATUS_COLOR[article.ticket.status] ?? ''}`}>
                      {article.ticket.status}
                    </Badge>
                  ) : '—'}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <div className="flex flex-col items-end">
                    <span className="text-sm">{new Date(article.createdAt).toLocaleDateString()}</span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(article.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {article.ticket?.id && (
                    <Link to={`/tickets/${article.ticket.id}`}>
                      <Button variant="ghost" size="icon" className="w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </Link>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && articles.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-40 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <SendHorizonal className="w-8 h-8 opacity-20" />
                    <p>No sent emails found.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <div className="p-4 border-t bg-muted/10 flex items-center justify-between text-sm text-muted-foreground font-medium">
          <span>Showing {articles.length} of {total} sent emails</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={articles.length < (data?.limit ?? 25)} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
