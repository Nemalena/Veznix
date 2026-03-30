import { forwardRef, useImperativeHandle, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Link2, Table2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Tags allowed when pasting — strip all inline styles and class attributes. */
const PASTE_ALLOWLIST = {
  ALLOWED_TAGS: ['p', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'a',
                 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'br'],
  ALLOWED_ATTR: ['href'],
  FORCE_BODY: true,
};

export interface RichTextEditorHandle {
  insertContent: (html: string) => void;
  setContent: (html: string) => void;
  getHTML: () => string;
  isEmpty: () => boolean;
}

interface RichTextEditorProps {
  onChange?: (html: string) => void;
  placeholder?: string;
  className?: string;
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  ({ onChange, placeholder, className }, ref) => {
    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          strike: false,
          code: false,
          codeBlock: false,
          blockquote: false,
          heading: false,
        }),
        Underline,
        Link.configure({
          openOnClick: false,
          HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
        }),
        Table.configure({
          resizable: false,
          HTMLAttributes: {
            cellpadding: '8',
            cellspacing: '0',
            border: '1',
            style: 'border-collapse: collapse; width: 100%;',
          },
        }),
        TableRow,
        TableCell,
        TableHeader,
      ],
      editorProps: {
        attributes: { class: 'focus:outline-none' },
        transformPastedHTML: (html: string) => {
          return DOMPurify.sanitize(html, PASTE_ALLOWLIST) as string;
        },
      },
      onUpdate: ({ editor: ed }) => {
        onChange?.(ed.getHTML());
      },
    });

    useImperativeHandle(ref, () => ({
      insertContent: (html: string) => {
        editor?.chain().focus().insertContent(html).run();
      },
      setContent: (html: string) => {
        editor?.commands.setContent(html, false);
      },
      getHTML: () => editor?.getHTML() ?? '',
      isEmpty: () => editor?.isEmpty ?? true,
    }), [editor]);

    const handleSetLink = useCallback(() => {
      if (!editor) return;
      const prev = editor.getAttributes('link').href as string | undefined;
      const url = window.prompt('URL', prev ?? 'https://');
      if (url === null) return;
      if (url === '') {
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
        return;
      }
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }, [editor]);

    if (!editor) return null;

    const isInTable = editor.isActive('table');

    return (
      <div className={cn('flex flex-col', className)}>
        {/* Formatting toolbar */}
        <div className="flex items-center gap-0.5 px-2 py-1 border-b bg-muted/5 flex-wrap">
          <ToolbarBtn
            active={editor.isActive('bold')}
            title="Bold (Ctrl+B)"
            onMouseDown={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive('italic')}
            title="Italic (Ctrl+I)"
            onMouseDown={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive('underline')}
            title="Underline (Ctrl+U)"
            onMouseDown={() => editor.chain().focus().toggleUnderline().run()}
          >
            <UnderlineIcon className="w-3.5 h-3.5" />
          </ToolbarBtn>

          <Separator orientation="vertical" className="h-4 mx-1" />

          <ToolbarBtn
            active={editor.isActive('bulletList')}
            title="Bullet list"
            onMouseDown={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive('orderedList')}
            title="Numbered list"
            onMouseDown={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </ToolbarBtn>

          <Separator orientation="vertical" className="h-4 mx-1" />

          <ToolbarBtn
            active={editor.isActive('link')}
            title="Insert / edit link"
            onMouseDown={handleSetLink}
          >
            <Link2 className="w-3.5 h-3.5" />
          </ToolbarBtn>

          <Separator orientation="vertical" className="h-4 mx-1" />

          {/* Table operations dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <button
                type="button"
                title="Table"
                className={cn(
                  'p-1.5 rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-muted',
                  isInTable && 'text-primary bg-primary/10 hover:bg-primary/15 hover:text-primary',
                )}
              >
                <Table2 className="w-3.5 h-3.5" />
              </button>
            } />
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem
                onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
              >
                Insert 3×3 table
              </DropdownMenuItem>
              {isInTable && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">Rows</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => editor.chain().focus().addRowBefore().run()}>
                    Add row above
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => editor.chain().focus().addRowAfter().run()}>
                    Add row below
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => editor.chain().focus().deleteRow().run()}>
                    Delete row
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">Columns</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => editor.chain().focus().addColumnBefore().run()}>
                    Add column left
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => editor.chain().focus().addColumnAfter().run()}>
                    Add column right
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => editor.chain().focus().deleteColumn().run()}>
                    Delete column
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => editor.chain().focus().deleteTable().run()}
                  >
                    Delete table
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Editor content area */}
        <div className="relative">
          {editor.isEmpty && placeholder && (
            <div className="absolute top-0 left-0 text-muted-foreground/50 pointer-events-none px-4 py-4 text-sm select-none">
              {placeholder}
            </div>
          )}
          <EditorContent
            editor={editor}
            className={cn(
              'prose prose-sm max-w-none',
              '[&_.ProseMirror]:min-h-[80px] [&_.ProseMirror]:p-4',
              '[&_.ProseMirror]:focus:outline-none [&_.ProseMirror]:text-sm [&_.ProseMirror]:leading-relaxed',
              '[&_table]:w-full [&_table]:border-collapse',
              '[&_td]:border [&_td]:border-border [&_td]:p-2',
              '[&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:bg-muted/30 [&_th]:font-semibold',
            )}
          />
        </div>
      </div>
    );
  },
);

RichTextEditor.displayName = 'RichTextEditor';

function ToolbarBtn({
  children,
  active,
  onMouseDown,
  title,
}: {
  children: React.ReactNode;
  active?: boolean;
  onMouseDown?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault(); // Prevent editor from losing focus
        onMouseDown?.();
      }}
      title={title}
      className={cn(
        'p-1.5 rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-muted',
        active && 'text-primary bg-primary/10 hover:bg-primary/15 hover:text-primary',
      )}
    >
      {children}
    </button>
  );
}
