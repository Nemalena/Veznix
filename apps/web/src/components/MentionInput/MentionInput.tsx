import { useState, useCallback, useRef, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

interface User {
  id: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
}

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onMentionsChange?: (mentionedUserIds: string[]) => void;
}

/**
 * Textarea with @mention autocomplete.
 * Detects "@" followed by text, queries /api/users?search=..., shows a dropdown.
 * Replaces the @mention fragment with "@DisplayName" and tracks userId for notifications.
 */
export function MentionInput({
  value, onChange, placeholder, className, onMentionsChange
}: MentionInputProps) {
  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number>(-1);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const mentionedIds = useRef<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  const detectMention = useCallback((text: string, cursorPos: number) => {
    // Walk backwards from cursor to find an "@" that isn't preceded by a word char
    const before = text.slice(0, cursorPos);
    const match = before.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionStart(cursorPos - match[0].length);
    } else {
      setMentionQuery(null);
      setSuggestions([]);
    }
  }, []);

  useEffect(() => {
    if (mentionQuery === null) { setSuggestions([]); return; }
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      try {
        const users = await apiFetch(`/users?search=${encodeURIComponent(mentionQuery)}`);
        setSuggestions(users);
        setSelectedIdx(0);
      } catch { setSuggestions([]); }
    }, 200);
  }, [mentionQuery]);

  const handleSelect = (user: User) => {
    const textarea = textareaRef.current!;
    const cursor = textarea.selectionStart;
    const before = value.slice(0, mentionStart);
    const after = value.slice(cursor);
    const newValue = `${before}@${user.displayName} ${after}`;
    onChange(newValue);

    // Track mentioned user IDs
    if (!mentionedIds.current.includes(user.id)) {
      mentionedIds.current = [...mentionedIds.current, user.id];
      onMentionsChange?.(mentionedIds.current);
    }

    setSuggestions([]);
    setMentionQuery(null);

    // Move cursor after inserted mention
    setTimeout(() => {
      const pos = mentionStart + user.displayName.length + 2; // "@Name "
      textarea.setSelectionRange(pos, pos);
      textarea.focus();
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => (i + 1) % suggestions.length); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => (i - 1 + suggestions.length) % suggestions.length); }
    if (e.key === 'Enter' && suggestions.length > 0) { e.preventDefault(); handleSelect(suggestions[selectedIdx]); }
    if (e.key === 'Escape') { setSuggestions([]); setMentionQuery(null); }
  };

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        placeholder={placeholder}
        className={cn('w-full bg-transparent border-none outline-none resize-none text-sm', className)}
        onChange={e => {
          onChange(e.target.value);
          detectMention(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={handleKeyDown}
      />

      {/* Mention dropdown */}
      {suggestions.length > 0 && (
        <div className={cn(
          'absolute left-0 bottom-full mb-1 w-56 z-[60] bg-card/95 backdrop-blur shadow-2xl border rounded-xl overflow-hidden',
          'animate-in slide-in-from-bottom-2 fade-in duration-150'
        )}>
          {suggestions.map((u, i) => (
            <button
              key={u.id}
              onMouseDown={e => { e.preventDefault(); handleSelect(u); }}
              className={cn(
                'w-full text-left px-3 py-2 flex items-center gap-2.5 text-sm transition-colors',
                i === selectedIdx ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'
              )}
            >
              <span className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                {u.displayName[0].toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="font-medium text-xs truncate">{u.displayName}</p>
                <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
