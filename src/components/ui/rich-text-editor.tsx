import { useRef, useCallback, useEffect } from 'react';
import { Bold, Italic, List, ListOrdered } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Toggle } from '@/components/ui/toggle';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  disabled?: boolean;
}

export function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  className,
  minHeight = '120px',
  disabled = false,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isFocusedRef = useRef(false);
  const initializedRef = useRef(false);

  // Set initial value once on mount
  useEffect(() => {
    if (editorRef.current && !initializedRef.current) {
      editorRef.current.innerHTML = value || '';
      initializedRef.current = true;
    }
  }, []);

  // Sync external value changes only when the editor is not focused
  useEffect(() => {
    if (editorRef.current && !isFocusedRef.current && initializedRef.current) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value || '';
      }
    }
  }, [value]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const execCmd = useCallback((command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    handleInput();
  }, [handleInput]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'b' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      execCmd('bold');
    } else if (e.key === 'i' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      execCmd('italic');
    }
  }, [execCmd]);

  const isEmpty = !value || value === '<br>' || value === '<div><br></div>';

  return (
    <div className={cn('rounded-md border bg-background', disabled && 'opacity-50 pointer-events-none', className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b px-1 py-1">
        <Toggle
          size="sm"
          aria-label="Bold"
          onPressedChange={() => execCmd('bold')}
          className="h-7 w-7 p-0"
        >
          <Bold className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          size="sm"
          aria-label="Italic"
          onPressedChange={() => execCmd('italic')}
          className="h-7 w-7 p-0"
        >
          <Italic className="h-3.5 w-3.5" />
        </Toggle>
        <div className="w-px h-4 bg-border mx-1" />
        <Toggle
          size="sm"
          aria-label="Bullet list"
          onPressedChange={() => execCmd('insertUnorderedList')}
          className="h-7 w-7 p-0"
        >
          <List className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          size="sm"
          aria-label="Numbered list"
          onPressedChange={() => execCmd('insertOrderedList')}
          className="h-7 w-7 p-0"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </Toggle>
      </div>

      {/* Editor area */}
      <div className="relative">
        {isEmpty && placeholder && (
          <div className="absolute inset-0 px-3 py-2 text-muted-foreground text-sm pointer-events-none">
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable={!disabled}
          onInput={handleInput}
          onFocus={() => { isFocusedRef.current = true; }}
          onBlur={(e) => { isFocusedRef.current = false; onBlur?.(); }}
          onKeyDown={handleKeyDown}
          className={cn(
            'px-3 py-2 text-sm outline-none prose prose-sm max-w-none',
            '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5',
            '[&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic',
          )}
          style={{ minHeight }}
          suppressContentEditableWarning
        />
      </div>
    </div>
  );
}
