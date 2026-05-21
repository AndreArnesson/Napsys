import { forwardRef, useState, useRef } from 'react';
import { Input } from './input';
import { cn } from '@/lib/utils';

export interface NumericInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value?: number | null;
  onChange?: (value: number | undefined) => void;
}

/**
 * Number input that accepts both "," and "." as decimal separators.
 * Maintains internal string state so partial input (e.g. "1,") isn't
 * wiped while the user is still typing.
 */
export const NumericInput = forwardRef<HTMLInputElement, NumericInputProps>(
  ({ value, onChange, onBlur, onFocus, className, ...props }, ref) => {
    const toDisplay = (v: number | null | undefined) =>
      v != null && !isNaN(v as number) ? String(v) : '';

    const [display, setDisplay] = useState(() => toDisplay(value));
    const isFocused = useRef(false);
    const prevValue = useRef(value);

    // Sync external value into display while not actively editing
    if (!isFocused.current && value !== prevValue.current) {
      prevValue.current = value;
      setDisplay(toDisplay(value));
    }

    const parse = (raw: string) => {
      const normalized = raw.replace(',', '.');
      const n = parseFloat(normalized);
      return isNaN(n) ? undefined : n;
    };

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="decimal"
        className={cn(className)}
        value={display}
        onChange={(e) => {
          const raw = e.target.value;
          setDisplay(raw);
          onChange?.(parse(raw));
        }}
        onFocus={(e) => {
          isFocused.current = true;
          onFocus?.(e);
        }}
        onBlur={(e) => {
          isFocused.current = false;
          // Normalize display on blur: "1," → "1", "1,50" → "1.5"
          const n = parse(display);
          setDisplay(n != null ? String(n) : '');
          onBlur?.(e);
        }}
      />
    );
  }
);
NumericInput.displayName = 'NumericInput';
