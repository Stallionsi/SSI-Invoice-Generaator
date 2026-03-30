import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, ChevronUp, ChevronDown, Check, X, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { customFieldsApi } from '../../api/customFields.api';
import SimpleFieldAdder from './SimpleFieldAdder';

// ─── Type badge labels ─────────────────────────────────────────────────────────

const TYPE_BADGE = {
  // hide badge for plain-text types
  text: null, textarea: null, richtext: null,
  // numeric
  number: 'num', currency: '₹', percentage: '%', range: 'range', rating: '★',
  // contact
  email: 'email', phone: 'tel', url: 'url',
  // date
  date: 'date', datetime: 'dt',
  // choice
  dropdown: 'select', radio: 'select', select: 'select',
  multiselect: 'multi', checkbox: 'multi',
  boolean: 'toggle',
  // other
  file: 'file', tags: 'tags', color: 'color', json: 'json', code: 'code',
  autoCode: 'auto', refId: 'id',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toArray = (v) => (Array.isArray(v) ? v : (v ? [v] : []));
const toggleArray = (arr, item) => {
  const a = toArray(arr);
  return a.includes(item) ? a.filter((x) => x !== item) : [...a, item];
};

// ─── Individual field type components ─────────────────────────────────────────
// Each receives: { field, value, onChange, disabled, config }
// `config` = field.config || {}

// ── AutoCode ─────────────────────────────────────────────────────────────────
function AutoCodeField({ value }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={value || ''}
        readOnly
        className="input font-mono bg-gray-50 text-gray-500 cursor-not-allowed"
        placeholder="Auto-generated on save"
      />
      <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
    </div>
  );
}

// ── RefId ─────────────────────────────────────────────────────────────────────
function RefIdField({ field, value, onChange, disabled, config }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(field.key, e.target.value)}
      disabled={disabled}
      className="input font-mono"
      placeholder={config.placeholder || field.placeholder || 'Enter reference ID'}
    />
  );
}

// ── Textarea ──────────────────────────────────────────────────────────────────
function TextareaField({ field, value, onChange, disabled, config }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(field.key, e.target.value)}
      disabled={disabled}
      rows={config.rows || 2}
      className="input"
      placeholder={config.placeholder || field.placeholder || field.label}
    />
  );
}

// ── Number ────────────────────────────────────────────────────────────────────
function NumberField({ field, value, onChange, disabled, config }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(field.key, e.target.value)}
      disabled={disabled}
      className="input"
      placeholder={config.placeholder || field.placeholder || '0'}
      step="any"
    />
  );
}

// ── Currency ──────────────────────────────────────────────────────────────────
function CurrencyField({ field, value, onChange, disabled, config }) {
  return (
    <div className="relative flex items-center">
      <span className="absolute left-3 text-gray-400 text-sm select-none">₹</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(field.key, e.target.value)}
        disabled={disabled}
        className="input pl-7"
        placeholder={config.placeholder || field.placeholder || '0'}
        step="any"
      />
    </div>
  );
}

// ── Percentage ────────────────────────────────────────────────────────────────
function PercentageField({ field, value, onChange, disabled, config }) {
  return (
    <div className="relative flex items-center">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(field.key, e.target.value)}
        disabled={disabled}
        className="input pr-8"
        placeholder={config.placeholder || field.placeholder || '0'}
        step="any"
      />
      <span className="absolute right-3 text-gray-400 text-sm select-none">%</span>
    </div>
  );
}

// ── Date ──────────────────────────────────────────────────────────────────────
function DateField({ field, value, onChange, disabled }) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(field.key, e.target.value)}
      disabled={disabled}
      className="input"
    />
  );
}

// ── Datetime ──────────────────────────────────────────────────────────────────
function DatetimeField({ field, value, onChange, disabled }) {
  return (
    <input
      type="datetime-local"
      value={value}
      onChange={(e) => onChange(field.key, e.target.value)}
      disabled={disabled}
      className="input"
    />
  );
}

// ── Email ─────────────────────────────────────────────────────────────────────
function EmailField({ field, value, onChange, disabled, config }) {
  return (
    <input
      type="email"
      value={value}
      onChange={(e) => onChange(field.key, e.target.value)}
      disabled={disabled}
      className="input"
      placeholder={config.placeholder || field.placeholder || 'email@example.com'}
    />
  );
}

// ── Phone ─────────────────────────────────────────────────────────────────────
function PhoneField({ field, value, onChange, disabled, config }) {
  return (
    <input
      type="tel"
      value={value}
      onChange={(e) => onChange(field.key, e.target.value)}
      disabled={disabled}
      className="input"
      placeholder={config.placeholder || field.placeholder || '+91 00000 00000'}
    />
  );
}

// ── URL ───────────────────────────────────────────────────────────────────────
function UrlField({ field, value, onChange, disabled, config }) {
  return (
    <input
      type="url"
      value={value}
      onChange={(e) => onChange(field.key, e.target.value)}
      disabled={disabled}
      className="input"
      placeholder={config.placeholder || field.placeholder || 'https://'}
    />
  );
}

// ── Select / Dropdown ─────────────────────────────────────────────────────────
function SelectField({ field, value, onChange, disabled, config }) {
  const opts = field.options || [];
  if (!opts.length) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(field.key, e.target.value)}
        disabled={disabled}
        className="input"
        placeholder={config.placeholder || field.placeholder || field.label}
      />
    );
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(field.key, e.target.value)}
      disabled={disabled}
      className="input"
    >
      <option value="">— Select —</option>
      {opts.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

// ── Radio ─────────────────────────────────────────────────────────────────────
function RadioField({ field, value, onChange, disabled, config }) {
  const opts = field.options || [];
  if (!opts.length) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(field.key, e.target.value)}
        disabled={disabled}
        className="input"
        placeholder={config.placeholder || field.placeholder || field.label}
      />
    );
  }
  return (
    <div className="flex flex-wrap gap-4 pt-1">
      {opts.map((opt) => (
        <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-700">
          <input
            type="radio"
            name={field.key}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(field.key, opt.value)}
            disabled={disabled}
            className="text-blue-600"
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

// ── Multiselect / Checkbox ────────────────────────────────────────────────────
function MultiselectField({ field, value, onChange, disabled, config }) {
  const opts = field.options || [];
  if (!opts.length) {
    // No options → single boolean checkbox
    return (
      <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(field.key, e.target.checked)}
          disabled={disabled}
          className="w-4 h-4 rounded border-gray-300 text-blue-600"
        />
        <span className="text-sm text-gray-600">{config.placeholder || field.placeholder || 'Yes'}</span>
      </label>
    );
  }
  return (
    <div className="flex flex-wrap gap-3 pt-1">
      {opts.map((opt) => (
        <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-700">
          <input
            type="checkbox"
            checked={toArray(value).includes(opt.value)}
            onChange={() => onChange(field.key, toggleArray(value, opt.value))}
            disabled={disabled}
            className="w-4 h-4 rounded border-gray-300 text-blue-600"
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

// ── Boolean toggle ────────────────────────────────────────────────────────────
function BooleanField({ field, value, onChange, disabled }) {
  const on = !!value;
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => !disabled && onChange(field.key, !on)}
        className={`relative inline-flex h-5 w-9 rounded-full transition-colors focus:outline-none ${on ? 'bg-blue-600' : 'bg-gray-300'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5 ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
      <span className="text-sm text-gray-600">{on ? 'Yes' : 'No'}</span>
    </label>
  );
}

// ── Tags ──────────────────────────────────────────────────────────────────────
function TagsField({ field, value, onChange, disabled, config }) {
  const tags = Array.isArray(value) ? value : [];
  const [inp, setInp] = useState('');

  const addTag = () => {
    const t = inp.trim();
    if (!t || tags.includes(t)) return;
    onChange(field.key, [...tags, t]);
    setInp('');
  };

  return (
    <div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800">
              {t}
              {!disabled && (
                <button type="button" onClick={() => onChange(field.key, tags.filter((x) => x !== t))} className="hover:text-red-600 leading-none">×</button>
              )}
            </span>
          ))}
        </div>
      )}
      {!disabled && (
        <input
          value={inp}
          onChange={(e) => setInp(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
          }}
          className="input text-sm"
          placeholder={config.placeholder || field.placeholder || 'Type tag and press Enter…'}
        />
      )}
    </div>
  );
}

// ── Color ─────────────────────────────────────────────────────────────────────
function ColorField({ field, value, onChange, disabled }) {
  const hex = value || '#6b7280';
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange(field.key, e.target.value)}
        disabled={disabled}
        className="h-9 w-12 rounded border border-gray-200 cursor-pointer p-0.5"
      />
      <input
        type="text"
        value={hex}
        onChange={(e) => onChange(field.key, e.target.value)}
        disabled={disabled}
        className="input font-mono w-28 text-sm"
        placeholder="#000000"
        maxLength={7}
      />
    </div>
  );
}

// ── Rating (stars) ────────────────────────────────────────────────────────────
function RatingField({ field, value, onChange, disabled, config }) {
  const max     = config.max || 5;
  const current = Number(value) || 0;
  return (
    <div className="flex items-center gap-0.5 pt-1">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(field.key, n === current ? 0 : n)}
          className={`text-2xl leading-none transition-colors focus:outline-none
            ${n <= current ? 'text-amber-400' : 'text-gray-200 hover:text-amber-300'}
            ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        >
          ★
        </button>
      ))}
      {current > 0 && (
        <span className="text-xs text-gray-500 ml-2">{current}/{max}</span>
      )}
    </div>
  );
}

// ── Range / Slider ────────────────────────────────────────────────────────────
function RangeField({ field, value, onChange, disabled, config }) {
  const min  = config.min  ?? 0;
  const max  = config.max  ?? 100;
  const step = config.step ?? 1;
  const val  = value !== '' && value !== undefined ? Number(value) : min;

  return (
    <div className="space-y-1">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={val}
        onChange={(e) => onChange(field.key, Number(e.target.value))}
        disabled={disabled}
        className="w-full accent-blue-600"
      />
      <div className="flex justify-between text-xs text-gray-400">
        <span>{min}</span>
        <span className="font-medium text-gray-700">{val}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

// ── JSON ──────────────────────────────────────────────────────────────────────
function JsonField({ field, value, onChange, disabled, config }) {
  const [valid, setValid] = useState(true);
  const str = typeof value === 'string' ? value : (value ? JSON.stringify(value, null, 2) : '');

  const handleChange = (e) => {
    const v = e.target.value;
    try { JSON.parse(v); setValid(true); } catch { setValid(false); }
    onChange(field.key, v);
  };

  return (
    <div>
      <textarea
        value={str}
        onChange={handleChange}
        disabled={disabled}
        rows={config.rows || 4}
        className={`input font-mono text-xs ${!valid ? 'border-red-400 focus:ring-red-400' : ''}`}
        placeholder={config.placeholder || '{ "key": "value" }'}
        spellCheck={false}
      />
      {!valid && <p className="text-xs text-red-500 mt-0.5">Invalid JSON</p>}
    </div>
  );
}

// ── Default text ──────────────────────────────────────────────────────────────
function TextField({ field, value, onChange, disabled, config }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(field.key, e.target.value)}
      disabled={disabled}
      className="input"
      placeholder={config.placeholder || field.placeholder || field.label}
    />
  );
}

// ─── Registry ─────────────────────────────────────────────────────────────────
// Maps fieldType string → React component.
// To support a new type: add one entry here.
const FIELD_REGISTRY = {
  // Text
  text:        TextField,
  textarea:    TextareaField,
  richtext:    TextareaField,
  code:        TextareaField,
  // Numeric
  number:      NumberField,
  currency:    CurrencyField,
  percentage:  PercentageField,
  range:       RangeField,
  rating:      RatingField,
  // Contact
  email:       EmailField,
  phone:       PhoneField,
  url:         UrlField,
  // Date
  date:        DateField,
  datetime:    DatetimeField,
  // Choice
  dropdown:    SelectField,
  select:      SelectField,
  radio:       RadioField,
  multiselect: MultiselectField,
  checkbox:    MultiselectField,
  boolean:     BooleanField,
  // Smart
  autoCode:    AutoCodeField,
  refId:       RefIdField,
  // Other
  tags:        TagsField,
  color:       ColorField,
  json:        JsonField,
};

// ─── FieldInput ───────────────────────────────────────────────────────────────

function FieldInput({ field, value, onChange, disabled }) {
  const Component = FIELD_REGISTRY[field.fieldType] ?? TextField;
  const config    = field.config || {};
  const v         = value ?? (field.fieldType === 'boolean' ? false : '');
  return (
    <Component
      field={field}
      value={v}
      onChange={onChange}
      disabled={disabled}
      config={config}
    />
  );
}

// ─── Inline rename ─────────────────────────────────────────────────────────────

function RenameInput({ field, onSave, onCancel }) {
  const [val, setVal] = useState(field.label);
  const commit = () => {
    const t = val.trim();
    if (!t) return;
    t !== field.label ? onSave(t) : onCancel();
  };
  return (
    <div className="flex items-center gap-1 flex-1">
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') onCancel(); }}
        className="input text-sm py-1 h-8 flex-1"
        maxLength={100}
      />
      <button type="button" onClick={commit}   className="p-1 text-green-600 hover:text-green-700"><Check  className="w-4 h-4" /></button>
      <button type="button" onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * Drop-in custom fields panel. Self-fetches field definitions.
 *
 * <SimpleCustomFields
 *   module="client"
 *   values={customFields}
 *   onChange={(key, val) => setCustomFields(prev => ({ ...prev, [key]: val }))}
 * />
 */
export default function SimpleCustomFields({ module, values = {}, onChange, disabled = false }) {
  const qc       = useQueryClient();
  const queryKey = ['custom-fields', module];
  const [renamingId, setRenamingId] = useState(null);

  // ── Fetch field definitions ───────────────────────────────────────────────
  const { data: fields = [], isLoading } = useQuery({
    queryKey,
    queryFn:  () => customFieldsApi.list(module),
    select:   (res) => res?.data?.data?.fields ?? [],
    staleTime: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const renameMutation = useMutation({
    mutationFn: ({ id, label }) => customFieldsApi.update(id, { label }),
    onSuccess:  () => { invalidate(); setRenamingId(null); },
    onError:    (e) => toast.error(e.response?.data?.message || 'Rename failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => customFieldsApi.delete(id),
    onSuccess:  () => invalidate(),
    onError:    (e) => toast.error(e.response?.data?.message || 'Delete failed'),
  });

  const reorderMutation = useMutation({
    mutationFn: (payload) => customFieldsApi.reorder(module, payload),
    onSuccess:  () => invalidate(),
    onError:    (e) => toast.error(e.response?.data?.message || 'Reorder failed'),
  });

  const moveField = (idx, dir) => {
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= fields.length) return;
    reorderMutation.mutate([
      { id: fields[idx]._id,     order: fields[swapIdx].order },
      { id: fields[swapIdx]._id, order: fields[idx].order },
    ]);
  };

  const handleDelete = (field) => {
    if (!window.confirm(`Delete "${field.label}"? Saved values will be hidden.`)) return;
    deleteMutation.mutate(field._id);
  };

  if (isLoading) return null;

  return (
    <div className="space-y-3">

      {fields.length === 0 && (
        <p className="text-sm text-gray-400 italic">
          No custom fields yet. Click &quot;+ Add Field&quot; below to create one.
        </p>
      )}

      {/* ── Field rows ─────────────────────────────────────────────────── */}
      {fields.map((field, idx) => {
        const badge = TYPE_BADGE[field.fieldType];
        return (
          <div key={field._id} className="group grid grid-cols-[18px_1fr_auto] items-start gap-2">

            {/* Reorder column */}
            <div className="flex flex-col gap-0 mt-6 opacity-0 group-hover:opacity-100 transition-opacity">
              <button type="button" onClick={() => moveField(idx, 'up')}
                disabled={idx === 0 || reorderMutation.isPending}
                className="p-0 text-gray-400 hover:text-gray-600 disabled:opacity-20 leading-none">
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => moveField(idx, 'down')}
                disabled={idx === fields.length - 1 || reorderMutation.isPending}
                className="p-0 text-gray-400 hover:text-gray-600 disabled:opacity-20 leading-none">
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Label + input */}
            <div className="min-w-0">
              {renamingId === field._id ? (
                <RenameInput
                  field={field}
                  onSave={(label) => renameMutation.mutate({ id: field._id, label })}
                  onCancel={() => setRenamingId(null)}
                />
              ) : (
                <>
                  <label className="label mb-1 flex items-center gap-1.5">
                    {field.label}
                    {field.isRequired && <span className="text-red-500 text-xs">*</span>}
                    {badge && (
                      <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1 rounded">
                        {badge}
                      </span>
                    )}
                    {field.helpText && (
                      <span className="text-[11px] text-gray-400 font-normal normal-case">
                        — {field.helpText}
                      </span>
                    )}
                  </label>
                  <FieldInput field={field} value={values[field.key]} onChange={onChange} disabled={disabled} />
                </>
              )}
            </div>

            {/* Action buttons */}
            {!disabled && renamingId !== field._id && (
              <div className="flex items-center gap-1 mt-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {field.fieldType !== 'autoCode' && (
                  <button type="button" onClick={() => setRenamingId(field._id)}
                    className="p-1 text-gray-400 hover:text-blue-600" title="Rename">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
                <button type="button" onClick={() => handleDelete(field)}
                  disabled={deleteMutation.isPending}
                  className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-40" title="Delete">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* ── Add Field ──────────────────────────────────────────────────── */}
      {!disabled && (
        <div className="pt-3 border-t border-gray-100">
          <SimpleFieldAdder
            module={module}
            onCreated={(field) => {
              invalidate();
              onChange(field.key, field.defaultValue ?? (field.fieldType === 'boolean' ? false : ''));
            }}
          />
        </div>
      )}
    </div>
  );
}
