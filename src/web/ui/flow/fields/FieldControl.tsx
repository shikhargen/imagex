import type { CustomFieldDefinition } from '../../../../shared/types.js';
import { Button } from '@/components/ui/button';
import '../nodes/styles.css';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

// Shared registry to ensure only one select is open at a time
const openSelects = new Set<() => void>();

function useExclusiveSelect() {
  const [open, setOpen] = useState(false);
  const closeRef = useRef(() => setOpen(false));

  const handleOpenChange = useCallback((next: boolean) => {
    if (next) {
      // Close all other open selects
      for (const close of openSelects) {
        if (close !== closeRef.current) close();
      }
      openSelects.add(closeRef.current);
    } else {
      openSelects.delete(closeRef.current);
    }
    setOpen(next);
  }, []);

  return { open, onOpenChange: handleOpenChange };
}

export function FieldControl({
  field,
  value,
  onChange,
  assetPreviewUrl,
  assetDisplayName,
  onOpenAssets,
}: {
  field: CustomFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  assetPreviewUrl?: string | undefined;
  assetDisplayName?: string | undefined;
  onOpenAssets?: (() => void) | undefined;
}) {
  const stringValue = value === undefined || value === null ? '' : String(value);
  const assetLabel = assetDisplayName?.trim() || stringValue;
  const [draft, setDraft] = useState(stringValue);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectionRef = useRef<{ start: number; end: number } | null>(null);
  const isLong = field.kind === 'textarea' || stringValue.length > 42;

  useEffect(() => {
    setDraft(stringValue);
  }, [stringValue]);

  useLayoutEffect(() => {
    const selection = selectionRef.current;
    const control = inputRef.current || textareaRef.current;
    if (!selection || !control || document.activeElement !== control) return;
    control.setSelectionRange(selection.start, selection.end);
  }, [draft]);

  function updateDraft(nextValue: string) {
    const control = inputRef.current || textareaRef.current;
    selectionRef.current = control
      ? { start: control.selectionStart ?? nextValue.length, end: control.selectionEnd ?? nextValue.length }
      : null;
    setDraft(nextValue);
    onChange(nextValue);
  }

  if (field.kind === 'select') {
    return (
      <SelectField
        value={stringValue}
        options={field.options || []}
        label={field.label}
        onChange={onChange}
      />
    );
  }

  if (field.kind === 'slider') {
    const min = field.min ?? 0;
    const max = field.max ?? 1;
    const step = field.step ?? 0.05;
    return (
      <NodeFieldShell label={field.label} className="ix-slider-row">
          <Slider
            className="nodrag ix-slider"
            min={min}
            max={max}
            step={step}
            value={[Number(value) || min]}
            onValueChange={(nextValue) => onChange(nextValue[0] ?? min)}
          />
          <Input className="nodrag ix-slider-value" value={stringValue || String(min)} onChange={(event) => onChange(coerceNumber(event.target.value))} />
      </NodeFieldShell>
    );
  }

  if (field.kind === 'number') {
    return (
      <NodeFieldShell label={field.label}>
        <Input className="nodrag" type="number" value={stringValue} onChange={(event) => onChange(coerceNumber(event.target.value))} />
      </NodeFieldShell>
    );
  }

  if (field.kind === 'toggle') {
    return (
      <NodeFieldShell label={field.label}>
          <Switch className="nodrag ix-switch" checked={Boolean(value)} onCheckedChange={onChange} />
      </NodeFieldShell>
    );
  }

  if (onOpenAssets) {
    return (
      <NodeFieldShell label={field.label} long className="asset-shell">
        <div className="ix-asset-field">
          <Button type="button" variant="secondary" size="sm" className="nodrag ix-asset-picker-button" onClick={onOpenAssets}>
            <span>{assetLabel || draft || 'Choose asset...'}</span>
          </Button>
          {assetPreviewUrl && (
            <figure className="ix-asset-preview">
              <img src={assetPreviewUrl} alt="" />
            </figure>
          )}
        </div>
      </NodeFieldShell>
    );
  }

  if (isLong) {
    return (
      <NodeFieldShell label={field.label} long>
          <Textarea ref={textareaRef} className="nodrag" value={draft} rows={field.id === 'text' ? 5 : 3} onChange={(event) => updateDraft(event.target.value)} />
      </NodeFieldShell>
    );
  }

  return (
    <NodeFieldShell label={field.label}>
      <Input ref={inputRef} className="nodrag" value={draft} onChange={(event) => updateDraft(event.target.value)} />
    </NodeFieldShell>
  );
}

function NodeFieldShell({
  label,
  children,
  long,
  className,
}: {
  label: string;
  children: ReactNode;
  long?: boolean;
  className?: string;
}) {
  return (
    <Field className={`ix-field ${long ? 'long' : ''}`}>
      <span className={`ix-control-shell ${long ? 'text-shell' : ''} ${className || ''}`}>
        <FieldLabel className={`ix-control-label ${long ? 'ix-control-label--floating' : 'ix-control-label--inline'}`}>{label}</FieldLabel>
        {children}
      </span>
    </Field>
  );
}

function SelectField({
  value,
  options,
  label,
  onChange,
}: {
  value: string;
  options: string[];
  label: string;
  onChange: (value: string) => void;
}) {
  const exclusive = useExclusiveSelect();
  return (
    <NodeFieldShell label={label}>
      <Select value={value} onValueChange={onChange} open={exclusive.open} onOpenChange={exclusive.onOpenChange}>
        <SelectTrigger className="nodrag ix-select-trigger" size="sm">
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent className="nodrag">
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </NodeFieldShell>
  );
}

function coerceNumber(value: string): number | string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}
