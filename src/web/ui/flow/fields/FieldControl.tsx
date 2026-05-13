import type { CustomFieldDefinition } from '../../../../shared/types.js';
import { Button } from '@/components/ui/button';
import '../nodes/styles.css';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { HexColorPicker } from 'react-colorful';

// Shared registry to ensure only one select is open at a time
const openSelects = new Set<() => void>();

// ─── Debounced slider value hook ─────────────────────────────────────────────

const SLIDER_DEBOUNCE_MS = 32; // ~2 frames at 60fps

/**
 * Hook that debounces slider onChange calls while keeping the displayed value instant.
 * The slider visually updates immediately, but the expensive processing callback
 * only fires after the user pauses dragging for SLIDER_DEBOUNCE_MS.
 */
function useDebouncedSlider(
  value: number,
  onChange: (value: unknown) => void,
  onCommit?: ((value: unknown) => void) | undefined
): {
  displayValue: number;
  handleChange: (nextValue: number[]) => void;
  handleCommit: ((nextValue: number[]) => void) | undefined;
} {
  const [displayValue, setDisplayValue] = useState(value);
  const timerRef = useRef<number>(0);
  const latestRef = useRef(value);

  // Sync display value when external value changes (e.g., undo/redo)
  useEffect(() => {
    setDisplayValue(value);
    latestRef.current = value;
  }, [value]);

  const handleChange = useCallback((nextValue: number[]) => {
    const v = nextValue[0] ?? value;
    setDisplayValue(v);
    latestRef.current = v;

    // Debounce the expensive onChange
    if (timerRef.current) cancelAnimationFrame(timerRef.current);
    timerRef.current = requestAnimationFrame(() => {
      onChange(latestRef.current);
    });
  }, [onChange, value]);

  const handleCommit = onCommit ? (nextValue: number[]) => {
    const v = nextValue[0] ?? value;
    if (timerRef.current) cancelAnimationFrame(timerRef.current);
    timerRef.current = 0;
    setDisplayValue(v);
    onCommit(v);
  } : undefined;

  return { displayValue, handleChange, handleCommit };
}

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
  onCommit,
  assetPreviewUrl,
  assetDisplayName,
  onOpenAssets,
  labelEditing,
  onLabelCommit,
}: {
  field: CustomFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Called on pointer-up for sliders (ongoing=false trigger) */
  onCommit?: ((value: unknown) => void) | undefined;
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

  // Color picker state
  const [hexDraft, setHexDraft] = useState(stringValue);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);
  const [pickerColor, setPickerColor] = useState(stringValue);
  const swatchRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const colorRafRef = useRef(0);
  const pendingColorRef = useRef<string | null>(null);

  // Helper to pass label editing props to all shells
  const shellLabelProps = { labelEditing, onLabelCommit };

  useEffect(() => {
    setDraft(stringValue);
    setHexDraft(stringValue);
  }, [stringValue]);

  // Position picker when opening
  useEffect(() => {
    if (!colorPickerOpen) {
      setPickerPos(null);
      return;
    }
    setPickerColor(stringValue);
    const rect = swatchRef.current?.getBoundingClientRect();
    if (rect) {
      setPickerPos({ top: rect.bottom + 6, left: rect.left });
    }
  }, [colorPickerOpen, stringValue]);

  // Commit final color when picker closes
  useEffect(() => {
    if (!colorPickerOpen && pendingColorRef.current) {
      if (pendingColorRef.current !== stringValue) {
        onChange(pendingColorRef.current);
      }
      pendingColorRef.current = null;
    }
    if (!colorPickerOpen && colorRafRef.current) {
      cancelAnimationFrame(colorRafRef.current);
      colorRafRef.current = 0;
    }
  }, [colorPickerOpen, stringValue, onChange]);

  // Close color picker on click outside
  useEffect(() => {
    if (!colorPickerOpen) return;
    const handleDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        pickerRef.current &&
        !pickerRef.current.contains(target) &&
        swatchRef.current &&
        !swatchRef.current.contains(target)
      ) {
        setColorPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleDown);
    return () => document.removeEventListener('mousedown', handleDown);
  }, [colorPickerOpen]);

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
    const commitHex = () => {
      const v = hexDraft.trim();
      if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
        onChange(v);
      } else {
        setHexDraft(stringValue);
      }
    };

    const handlePickerChange = (c: string) => {
      setPickerColor(c);
      pendingColorRef.current = c;
      if (!colorRafRef.current) {
        colorRafRef.current = requestAnimationFrame(() => {
          colorRafRef.current = 0;
          const pending = pendingColorRef.current;
          pendingColorRef.current = null;
          if (pending && pending !== stringValue) {
            onChange(pending);
          }
        });
      }
    };

    return (
      <Field className="ix-field ix-color-field">
        <span className="ix-control-shell ix-color-shell">
          <FieldLabel className="ix-color-label">{field.label}</FieldLabel>
          <span className="ix-color-picker-row nodrag">
            <button
              ref={swatchRef}
              type="button"
              className="ix-color-swatch"
              style={{ backgroundColor: colorPickerOpen ? pickerColor : (stringValue || '#ffffff') }}
              onClick={() => setColorPickerOpen(o => !o)}
              aria-label="Toggle color picker"
            />
            <Input
              className="ix-color-hex-input"
              value={hexDraft || '#ffffff'}
              onChange={(e) => setHexDraft(e.target.value)}
              onBlur={commitHex}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitHex(); } }}
            />
          </span>
        </span>
        {colorPickerOpen && pickerPos &&
          createPortal(
            <div
              ref={pickerRef}
              className="ix-color-picker-dropdown"
              style={{ position: 'fixed', top: pickerPos.top, left: pickerPos.left, zIndex: 9999 }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <HexColorPicker color={pickerColor} onChange={handlePickerChange} />
            </div>,
            document.body
          )}
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
      <DebouncedSliderField
        label={field.label}
        min={min}
        max={max}
        step={step}
        value={Number(value) || min}
        onChange={onChange}
        onCommit={onCommit}
      />
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
  const fieldId = useId();
  const inputRef = useRef<HTMLElement | null>(null);

  const focusInput = () => {
    // Find the first focusable input/textarea inside the shell
    const el = inputRef.current?.querySelector('input, textarea') as HTMLElement | null;
    el?.focus();
  };

  return (
    <Field className={`ix-field ${long ? 'long' : ''}`}>
      <span className={`ix-control-shell ${long ? 'text-shell' : ''} ${className || ''}`} ref={inputRef}>
        {labelEditing ? (
          <EditableLabelInline
            value={label}
            className={`ix-control-label ${long ? 'ix-control-label--floating' : 'ix-control-label--inline'}`}
            onCommit={(v) => { onLabelCommit?.(v); focusInput(); }}
          />
        ) : (
          <FieldLabel
            htmlFor={fieldId}
            className={`ix-control-label ${long ? 'ix-control-label--floating' : 'ix-control-label--inline'}`}
            onClick={focusInput}
          >
            {label}
          </FieldLabel>
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
    <Field className="ix-field">
      <span className="ix-control-shell ix-select-shell">
        <FieldLabel className="ix-control-label ix-control-label--inline">{label}</FieldLabel>
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
      </span>
    </Field>
  );
}

function coerceNumber(value: string): number | string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

// ─── Debounced Slider Field ──────────────────────────────────────────────────

function DebouncedSliderField({
  label,
  min,
  max,
  step,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: unknown) => void;
  onCommit?: ((value: unknown) => void) | undefined;
}) {
  const { displayValue, handleChange, handleCommit } = useDebouncedSlider(value, onChange, onCommit);

  return (
    <Field className="ix-field">
      <span className="ix-control-shell ix-slider-shell">
        <FieldLabel className="ix-control-label ix-control-label--inline">{label}</FieldLabel>
        <div className="ix-slider-row">
          <Slider
            className="nodrag ix-slider"
            min={min}
            max={max}
            step={step}
            value={[displayValue]}
            onValueChange={handleChange}
            {...(handleCommit ? { onValueCommit: handleCommit } : {})}
          />
          <span className="ix-slider-value">{String(displayValue)}</span>
        </div>
      </span>
    </Field>
  );
}
