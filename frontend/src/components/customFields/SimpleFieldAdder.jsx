import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { customFieldsApi } from '../../api/customFields.api';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';

/**
 * Minimal "Add Field" button + modal.
 *
 * Default (simple): user types a name, backend infers the type.
 * Advanced toggle:  user picks a type, sets options (select/multiselect)
 *                   or config (range, rating).
 *
 * Usage:
 *   <SimpleFieldAdder module="client" onCreated={(field) => ...} />
 */

// ─── All supported field types ────────────────────────────────────────────────
const FIELD_TYPES = [
  // Text
  { value: 'text',        label: 'Text',             group: 'Text' },
  { value: 'textarea',    label: 'Textarea',          group: 'Text' },
  { value: 'richtext',    label: 'Rich Text',         group: 'Text' },
  // Numeric
  { value: 'number',      label: 'Number',            group: 'Numeric' },
  { value: 'currency',    label: 'Currency',          group: 'Numeric' },
  { value: 'percentage',  label: 'Percentage',        group: 'Numeric' },
  { value: 'range',       label: 'Range / Slider',    group: 'Numeric' },
  { value: 'rating',      label: 'Rating (Stars)',    group: 'Numeric' },
  // Contact
  { value: 'email',       label: 'Email',             group: 'Contact' },
  { value: 'phone',       label: 'Phone',             group: 'Contact' },
  { value: 'url',         label: 'URL',               group: 'Contact' },
  // Date / Time
  { value: 'date',        label: 'Date',              group: 'Date' },
  { value: 'datetime',    label: 'Date & Time',       group: 'Date' },
  // Choice
  { value: 'boolean',     label: 'Yes / No',          group: 'Choice' },
  { value: 'dropdown',    label: 'Select (single)',   group: 'Choice' },
  { value: 'multiselect', label: 'Select (multiple)', group: 'Choice' },
  { value: 'radio',       label: 'Radio',             group: 'Choice' },
  { value: 'checkbox',    label: 'Checkbox',          group: 'Choice' },
  // Other
  { value: 'tags',        label: 'Tags',              group: 'Other' },
  { value: 'color',       label: 'Color Picker',      group: 'Other' },
  { value: 'json',        label: 'JSON Data',         group: 'Other' },
  { value: 'file',        label: 'File Upload',       group: 'Other' },
];

// Types that need an options list
const NEEDS_OPTIONS = new Set(['dropdown', 'multiselect', 'radio', 'checkbox']);
// Types that need range config (min/max/step)
const NEEDS_RANGE_CONFIG = new Set(['range']);
// Types that need rating config (max stars)
const NEEDS_RATING_CONFIG = new Set(['rating']);

const RESET = {
  label: '', fieldType: '', showAdvanced: false,
  optionInput: '', options: [],
  // range config
  rangeMin: '', rangeMax: '', rangeStep: '',
  // rating config
  ratingMax: '5',
};

export default function SimpleFieldAdder({ module, onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(RESET);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setForm(RESET);
      setSaving(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  // ── Option management (for select/multiselect/radio/checkbox) ─────────────
  const addOption = () => {
    const t = form.optionInput.trim();
    if (!t) return;
    const val = t.toLowerCase().replace(/\s+/g, '_');
    if (form.options.some((o) => o.value === val)) return;
    set('options', [...form.options, { label: t, value: val }]);
    set('optionInput', '');
  };

  const removeOption = (val) => set('options', form.options.filter((o) => o.value !== val));

  // ── Build config object from form state ───────────────────────────────────
  const buildConfig = () => {
    if (NEEDS_RANGE_CONFIG.has(form.fieldType)) {
      const cfg = {};
      if (form.rangeMin !== '') cfg.min = Number(form.rangeMin);
      if (form.rangeMax !== '') cfg.max = Number(form.rangeMax);
      if (form.rangeStep !== '') cfg.step = Number(form.rangeStep);
      return cfg;
    }
    if (NEEDS_RATING_CONFIG.has(form.fieldType)) {
      return { max: Math.max(1, Number(form.ratingMax) || 5) };
    }
    return {};
  };

  const handleSave = async () => {
    const label = form.label.trim();
    if (!label) { toast.error('Field name is required'); return; }

    if (NEEDS_OPTIONS.has(form.fieldType) && form.options.length === 0) {
      toast.error('Add at least one option for this field type');
      return;
    }

    const config = buildConfig();

    const payload = {
      module,
      label,
      ...(form.fieldType  && { fieldType: form.fieldType }),
      ...(form.options.length && { options: form.options }),
      ...(Object.keys(config).length && { config }),
    };

    setSaving(true);
    try {
      const res   = await customFieldsApi.create(payload);
      const field = res.data.data.field;
      toast.success(`"${field.label}" added`);
      onCreated(field);
      setOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add field');
    } finally {
      setSaving(false);
    }
  };

  const needsOpts   = NEEDS_OPTIONS.has(form.fieldType);
  const needsRange  = NEEDS_RANGE_CONFIG.has(form.fieldType);
  const needsRating = NEEDS_RATING_CONFIG.has(form.fieldType);

  // Group types for the select menu
  const groups = [...new Set(FIELD_TYPES.map((t) => t.group))];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
      >
        <span className="text-base leading-none">+</span> Add Field
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Field" maxWidth="max-w-sm">
        <div className="space-y-4">

          {/* Field Name */}
          <div>
            <label className="label">Field Name <span className="text-red-500">*</span></label>
            <input
              ref={inputRef}
              value={form.label}
              onChange={(e) => set('label', e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !needsOpts && !needsRange && !needsRating) { e.preventDefault(); handleSave(); } }}
              className="input"
              placeholder="e.g. GST Category, Project Code…"
              maxLength={100}
            />
          </div>

          {/* Advanced toggle */}
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            onClick={() => set('showAdvanced', !form.showAdvanced)}
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${form.showAdvanced ? 'rotate-180' : ''}`} />
            {form.showAdvanced ? 'Less options' : 'Choose field type'}
          </button>

          {form.showAdvanced && (
            <>
              {/* Field type picker — grouped */}
              <div>
                <label className="label">Field Type</label>
                <select
                  value={form.fieldType}
                  onChange={(e) => set('fieldType', e.target.value)}
                  className="input"
                >
                  <option value="">Auto-detect from name</option>
                  {groups.map((group) => (
                    <optgroup key={group} label={group}>
                      {FIELD_TYPES.filter((t) => t.group === group).map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Range config */}
              {needsRange && (
                <div>
                  <label className="label">Slider Configuration</label>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Min</p>
                      <input type="number" value={form.rangeMin} onChange={(e) => set('rangeMin', e.target.value)} className="input text-sm" placeholder="0" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Max</p>
                      <input type="number" value={form.rangeMax} onChange={(e) => set('rangeMax', e.target.value)} className="input text-sm" placeholder="100" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Step</p>
                      <input type="number" value={form.rangeStep} onChange={(e) => set('rangeStep', e.target.value)} className="input text-sm" placeholder="1" />
                    </div>
                  </div>
                </div>
              )}

              {/* Rating config */}
              {needsRating && (
                <div>
                  <label className="label">Max Stars</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={form.ratingMax}
                    onChange={(e) => set('ratingMax', e.target.value)}
                    className="input"
                  />
                </div>
              )}

              {/* Options list (for select / radio / checkbox) */}
              {needsOpts && (
                <div>
                  <label className="label">Options <span className="text-red-500">*</span></label>
                  <div className="flex gap-2 mb-2">
                    <input
                      value={form.optionInput}
                      onChange={(e) => set('optionInput', e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
                      className="input flex-1 text-sm"
                      placeholder="Type option and press Enter…"
                      maxLength={100}
                    />
                    <button type="button" className="btn btn-secondary text-xs" onClick={addOption}>Add</button>
                  </div>
                  {form.options.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {form.options.map((opt) => (
                        <span key={opt.value} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800">
                          {opt.label}
                          <button type="button" onClick={() => removeOption(opt.value)} className="hover:text-red-600 leading-none">×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              disabled={saving || !form.label.trim()}
            >
              {saving ? 'Saving…' : 'Save Field'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
