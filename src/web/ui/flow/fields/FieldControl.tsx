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
  labelEditing,
  onLabelCommit,
}: {
  field: CustomFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  assetPreviewUrl?: string | undefined;
  assetDisplayName?: string | undefined;
  onOpenAssets?: (() => void) | undefined;
  labelEditing?: boolean;
  onLabelCommit?: (newLabel: string) => void;
}) {
  const stringValue = value === undefined || value === null ? '' : String(value);
  const assetLabel = assetDisplayName?.trim() || stringValue;
  const [draft, setDraft] = useState(stringValue);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectionRef = useRef<{ start: number; end: number } | null>(null);
  const isLong = field.kind === 'textarea' || stringValue.length > 42;

  // Helper to pass label editing props to all shells
  const shellLabelProps = { labelEditing, onLabelCommit };

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

  if (field.kind === 'color') {
    return (
      <Field className="ix-field">
        <span className="ix-control-shell">
          <FieldLabel className="ix-control-label ix-control-label--inline">{field.label}</FieldLabel>
          <span className="ix-color-picker-row">
            <input
              type="color"
              className="nodrag ix-color-input"
              value={stringValue || '#ffffff'}
              onChange={(event) => onChange(event.target.value)}
            />
            <Input
              ref={inputRef}
              className="nodrag ix-color-text"
              value={draft || '#ffffff'}
              onChange={(event) => updateDraft(event.target.value)}
            />
          </span>
        </span>
      </Field>
    );
  }

  if (field.kind === 'image') {
    return (
      <Field className="ix-field long">
        <span className="ix-control-shell text-shell asset-shell">
          <FieldLabel className="ix-control-label ix-control-label--floating">{field.label}</FieldLabel>
          <div className="ix-asset-field">
            {onOpenAssets && (
              <Button type="button" variant="secondary" size="sm" className="nodrag ix-asset-picker-button" onClick={onOpenAssets}>
                <span>{assetLabel || 'Choose image...'}</span>
              </Button>
            )}
            {assetPreviewUrl && (
              <figure className="ix-asset-preview">
                <img src={assetPreviewUrl} alt="" />
              </figure>
            )}
            {!onOpenAssets && !assetPreviewUrl && (
              <Textarea ref={textareaRef} className="nodrag" value={draft} rows={2} placeholder="Image description..." onChange={(event) => updateDraft(event.target.value)} />
            )}
          </div>
        </span>
      </Field>
    );
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
      <Field className="ix-field">
        <span className="ix-control-shell ix-slider-shell">
          <FieldLabel className="ix-control-label ix-control-label--inline">{field.label}</FieldLabel>
          <div className="ix-slider-row">
            <Slider
              className="nodrag ix-slider"
              min={min}
              max={max}
              step={step}
              value={[Number(value) || min]}
              onValueChange={(nextValue) => onChange(nextValue[0] ?? min)}
            />
            <span className="ix-slider-value">{stringValue || String(min)}</span>
          </div>
        </span>
      </Field>
    );
  }

  if (field.kind === 'number') {
    return (
      <NodeFieldShell label={field.label} {...shellLabelProps}>
        <Input className="nodrag" type="number" value={stringValue} onChange={(event) => onChange(coerceNumber(event.target.value))} />
      </NodeFieldShell>
    );
  }

  if (field.kind === 'toggle') {
    return (
      <NodeFieldShell label={field.label} {...shellLabelProps}>
          <Switch className="nodrag ix-switch" checked={Boolean(value)} onCheckedChange={onChange} />
      </NodeFieldShell>
    );
  }

  if (onOpenAssets) {
    return (
      <NodeFieldShell label={field.label} long className="asset-shell" {...shellLabelProps}>
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
      <NodeFieldShell label={field.label} long {...shellLabelProps}>
          <Textarea ref={textareaRef} className="nodrag" value={draft} rows={field.id === 'text' ? 5 : 3} onChange={(event) => updateDraft(event.target.value)} />
      </NodeFieldShell>
    );
  }

  return (
    <NodeFieldShell label={field.label} {...shellLabelProps}>
      <Input ref={inputRef} className="nodrag" value={draft} onChange={(event) => updateDraft(event.target.value)} />
    </NodeFieldShell>
  );
}

function NodeFieldShell({
  label,
  children,
  long,
  className,
  labelEditing,
  onLabelCommit,
}: {
  label: string;
  children: ReactNode;
  long?: boolean | undefined;
  className?: string | undefined;
  labelEditing?: boolean | undefined;
  onLabelCommit?: ((newLabel: string) => void) | undefined;
}) {
  return (
    <Field className={`ix-field ${long ? 'long' : ''}`}>
      <span className={`ix-control-shell ${long ? 'text-shell' : ''} ${className || ''}`}>
        {labelEditing ? (
          <EditableLabelInline
            value={label}
            className={`ix-control-label ${long ? 'ix-control-label--floating' : 'ix-control-label--inline'}`}
            onCommit={(v) => onLabelCommit?.(v)}
          />
        ) : (
          <FieldLabel className={`ix-control-label ${long ? 'ix-control-label--floating' : 'ix-control-label--inline'}`}>{label}</FieldLabel>
        )}
        {children}
      </span>
    </Field>
  );
}

function EditableLabelInline({
  value,
  className,
  onCommit,
}: {
  value: string;
  className: string;
  onCommit: (value: string) => void;
}) {
  const [editing, setEditing] = useState(true);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      const len = inputRef.current.value.length;
      inputRef.current.setSelectionRange(len, len);
    }
  }, [editing]);

  const save = () => {
    const text = draft.trim() || value;
    onCommit(text);
    setEditing(false);
  };

  if (!editing) {
    return <FieldLabel className={className}>{draft || value}</FieldLabel>;
  }

  // Render a <label> wrapper with the same class so layout is identical,
  // and put a naked input inside it
  return (
    <label className={className}>
      <input
        ref={inputRef}
        className="ix-label-edit nodrag"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); save(); }
          if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
        }}
        onBlur={save}
      />
    </label>
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
        <SelectContent className="nodrag" position="popper" sideOffset={4}>
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
