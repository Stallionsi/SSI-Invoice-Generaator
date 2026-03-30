import { useState } from 'react';

const FIELD_TYPES = [
  { value: 'text',        label: 'Text',          icon: '𝐓' },
  { value: 'textarea',    label: 'Textarea',       icon: '¶' },
  { value: 'number',      label: 'Number',         icon: '#' },
  { value: 'currency',    label: 'Currency',       icon: '₹' },
  { value: 'percentage',  label: 'Percentage',     icon: '%' },
  { value: 'date',        label: 'Date',           icon: '📅' },
  { value: 'datetime',    label: 'Date & Time',    icon: '🕐' },
  { value: 'email',       label: 'Email',          icon: '@' },
  { value: 'phone',       label: 'Phone',          icon: '📞' },
  { value: 'url',         label: 'URL',            icon: '🔗' },
  { value: 'dropdown',    label: 'Dropdown',       icon: '▾' },
  { value: 'multiselect', label: 'Multi Select',   icon: '☑' },
  { value: 'radio',       label: 'Radio Button',   icon: '◉' },
  { value: 'checkbox',    label: 'Checkbox',       icon: '✓' },
  { value: 'boolean',     label: 'Toggle (Yes/No)',icon: '⊙' },
  { value: 'file',        label: 'File Upload',    icon: '📎' },
  { value: 'address',     label: 'Address',        icon: '📍' },
  { value: 'richtext',    label: 'Rich Text',      icon: '✍' },
];

const ROLES = ['admin', 'finance', 'employee', 'public'];
const OPERATORS = [
  { value: 'eq',          label: 'equals' },
  { value: 'neq',         label: 'not equals' },
  { value: 'contains',    label: 'contains' },
  { value: 'not_contains',label: 'does not contain' },
  { value: 'gt',          label: 'greater than' },
  { value: 'lt',          label: 'less than' },
  { value: 'empty',       label: 'is empty' },
  { value: 'not_empty',   label: 'is not empty' },
];

const HAS_OPTIONS = ['dropdown', 'multiselect', 'radio', 'checkbox'];

const EMPTY_FIELD = {
  label:       '',
  fieldType:   'text',
  placeholder: '',
  helpText:    '',
  defaultValue:'',
  isRequired:  false,
  isReadOnly:  false,
  isSearchable:false,
  visibility:  ['admin', 'finance', 'employee'],
  section:     'Additional Info',
  order:       0,
  options:     [],
  validation:  { minLength: '', maxLength: '', min: '', max: '', pattern: '', customMessage: '', unique: false },
  conditionalLogic: { enabled: false, action: 'show', logicType: 'all', conditions: [] },
};

/**
 * CustomFieldBuilder
 *
 * Full-featured admin UI for creating and editing a custom field definition.
 *
 * Props:
 *   initialData  - existing field data when editing (null for create)
 *   existingKeys - array of already-used fieldKeys in this module (for preview)
 *   onSave       - async (data) => void
 *   onCancel     - () => void
 *   saving       - bool
 */
export default function CustomFieldBuilder({ initialData = null, existingKeys = [], onSave, onCancel, saving = false }) {
  const [form, setForm] = useState(() => ({
    ...EMPTY_FIELD,
    ...(initialData || {}),
    validation:       { ...EMPTY_FIELD.validation,       ...(initialData?.validation || {}) },
    conditionalLogic: { ...EMPTY_FIELD.conditionalLogic, ...(initialData?.conditionalLogic || {}) },
  }));
  const [tab, setTab] = useState('basic'); // basic | options | validation | conditional | visibility

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const setNested = (parent, key, value) =>
    setForm((prev) => ({ ...prev, [parent]: { ...prev[parent], [key]: value } }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Clean up empty validation fields
    const cleanValidation = Object.fromEntries(
      Object.entries(form.validation).filter(([, v]) => v !== '' && v !== null && v !== undefined)
    );
    await onSave({ ...form, validation: cleanValidation });
  };

  const previewKey = form.label
    ? form.label.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '_').slice(0, 64)
    : '';

  const hasOptions = HAS_OPTIONS.includes(form.fieldType);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { id: 'basic',       label: 'Basic' },
          { id: 'options',     label: 'Options',     show: hasOptions },
          { id: 'validation',  label: 'Validation' },
          { id: 'conditional', label: 'Conditional Logic' },
          { id: 'visibility',  label: 'Visibility' },
        ]
          .filter((t) => t.show !== false)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={[
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
      </div>

      {/* ── Basic Tab ── */}
      {tab === 'basic' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Label */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Field Label <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.label}
                onChange={(e) => set('label', e.target.value)}
                placeholder="e.g. Bank Reference Number"
                required
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              {previewKey && (
                <p className="text-xs text-gray-400">
                  Key: <code className="bg-gray-100 px-1 rounded">{previewKey}</code>
                  {existingKeys.includes(previewKey) && (
                    <span className="text-amber-600 ml-2">⚠ Key already exists (will auto-suffix)</span>
                  )}
                </p>
              )}
            </div>

            {/* Field Type */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Field Type <span className="text-red-500">*</span>
              </label>
              <select
                value={form.fieldType}
                onChange={(e) => set('fieldType', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.icon}  {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Placeholder */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Placeholder Text</label>
              <input
                type="text"
                value={form.placeholder}
                onChange={(e) => set('placeholder', e.target.value)}
                placeholder="Hint shown inside the field"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* Section */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Section / Group</label>
              <input
                type="text"
                value={form.section}
                onChange={(e) => set('section', e.target.value)}
                placeholder="e.g. Payment Details"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* Default Value */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Default Value</label>
              <input
                type="text"
                value={form.defaultValue ?? ''}
                onChange={(e) => set('defaultValue', e.target.value)}
                placeholder="Pre-filled value"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* Order */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Display Order</label>
              <input
                type="number"
                value={form.order}
                onChange={(e) => set('order', Number(e.target.value))}
                min={0}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Help Text */}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Help Text / Tooltip</label>
            <input
              type="text"
              value={form.helpText}
              onChange={(e) => set('helpText', e.target.value)}
              placeholder="Shown below the field as guidance"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Flags */}
          <div className="flex flex-wrap gap-6">
            {[
              { key: 'isRequired',   label: 'Required' },
              { key: 'isReadOnly',   label: 'Read-only' },
              { key: 'isSearchable', label: 'Searchable / Filterable' },
              { key: 'isActive',     label: 'Active' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form[key] ?? true}
                  onChange={(e) => set(key, e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">{label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ── Options Tab (dropdown / radio / multiselect / checkbox) ── */}
      {tab === 'options' && hasOptions && (
        <OptionsEditor options={form.options} onChange={(opts) => set('options', opts)} />
      )}

      {/* ── Validation Tab ── */}
      {tab === 'validation' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { key: 'minLength', label: 'Min Length', show: ['text', 'textarea', 'richtext', 'email', 'phone', 'url'] },
              { key: 'maxLength', label: 'Max Length', show: ['text', 'textarea', 'richtext', 'email', 'phone', 'url'] },
              { key: 'min',       label: 'Min Value',  show: ['number', 'currency', 'percentage', 'date', 'datetime'] },
              { key: 'max',       label: 'Max Value',  show: ['number', 'currency', 'percentage', 'date', 'datetime'] },
            ]
              .filter((f) => f.show.includes(form.fieldType))
              .map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">{label}</label>
                  <input
                    type="number"
                    value={form.validation[key] ?? ''}
                    onChange={(e) => setNested('validation', key, e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              ))}
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              Regex Pattern
              <span className="ml-1 text-xs text-gray-400 font-normal">(optional — e.g. ^[A-Z]{2}\d{4}$)</span>
            </label>
            <input
              type="text"
              value={form.validation.pattern ?? ''}
              onChange={(e) => setNested('validation', 'pattern', e.target.value)}
              placeholder="Regular expression"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Custom Error Message</label>
            <input
              type="text"
              value={form.validation.customMessage ?? ''}
              onChange={(e) => setNested('validation', 'customMessage', e.target.value)}
              placeholder="Shown when validation fails"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.validation.unique ?? false}
              onChange={(e) => setNested('validation', 'unique', e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Value must be unique within this company</span>
          </label>
        </div>
      )}

      {/* ── Conditional Logic Tab ── */}
      {tab === 'conditional' && (
        <ConditionalLogicEditor
          logic={form.conditionalLogic}
          existingKeys={existingKeys}
          onChange={(logic) => set('conditionalLogic', logic)}
        />
      )}

      {/* ── Visibility Tab ── */}
      {tab === 'visibility' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Select which roles can see this field. Leave all unchecked to hide from everyone.
          </p>
          {ROLES.map((role) => (
            <label key={role} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.visibility.includes(role)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...form.visibility, role]
                    : form.visibility.filter((r) => r !== role);
                  set('visibility', next);
                }}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 capitalize">{role}</span>
              {role === 'public' && (
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  Visible in public invoice view
                </span>
              )}
            </label>
          ))}
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : initialData ? 'Update Field' : 'Create Field'}
        </button>
      </div>
    </form>
  );
}

// ─── Options Editor ───────────────────────────────────────────────────────────

function OptionsEditor({ options, onChange }) {
  const addOption = () =>
    onChange([...options, { label: '', value: '', color: '#6b7280' }]);

  const updateOption = (i, key, val) => {
    const next = options.map((o, idx) => (idx === i ? { ...o, [key]: val } : o));
    onChange(next);
  };

  const removeOption = (i) => onChange(options.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-700">Options</h4>
        <button
          type="button"
          onClick={addOption}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          + Add Option
        </button>
      </div>

      {options.length === 0 && (
        <p className="text-sm text-gray-400 italic">No options yet. Add at least one option.</p>
      )}

      <div className="space-y-2">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={opt.label}
              onChange={(e) => {
                updateOption(i, 'label', e.target.value);
                // Auto-fill value from label if value is empty
                if (!opt.value || opt.value === opt.label.toLowerCase().replace(/\s+/g, '_')) {
                  updateOption(i, 'value', e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '_'));
                }
              }}
              placeholder="Label"
              className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <input
              type="text"
              value={opt.value}
              onChange={(e) => updateOption(i, 'value', e.target.value)}
              placeholder="Value (key)"
              className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <input
              type="color"
              value={opt.color || '#6b7280'}
              onChange={(e) => updateOption(i, 'color', e.target.value)}
              title="Tag color"
              className="w-8 h-8 rounded border border-gray-300 cursor-pointer p-0.5"
            />
            <button
              type="button"
              onClick={() => removeOption(i)}
              className="text-red-400 hover:text-red-600 text-lg leading-none"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Conditional Logic Editor ────────────────────────────────────────────────

function ConditionalLogicEditor({ logic, existingKeys, onChange }) {
  const set = (key, val) => onChange({ ...logic, [key]: val });

  const addCondition = () =>
    onChange({
      ...logic,
      conditions: [...(logic.conditions || []), { fieldKey: '', operator: 'eq', value: '' }],
    });

  const updateCondition = (i, key, val) => {
    const next = logic.conditions.map((c, idx) => (idx === i ? { ...c, [key]: val } : c));
    onChange({ ...logic, conditions: next });
  };

  const removeCondition = (i) =>
    onChange({ ...logic, conditions: logic.conditions.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={logic.enabled}
          onChange={(e) => set('enabled', e.target.checked)}
          className="rounded text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm font-medium text-gray-700">Enable conditional logic</span>
      </label>

      {logic.enabled && (
        <div className="space-y-4 pl-4 border-l-2 border-blue-100">
          {/* Action */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-gray-600">When conditions match:</span>
            <select
              value={logic.action}
              onChange={(e) => set('action', e.target.value)}
              className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="show">Show this field</option>
              <option value="hide">Hide this field</option>
              <option value="require">Make it required</option>
            </select>
          </div>

          {/* Logic type */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">Match:</span>
            <select
              value={logic.logicType}
              onChange={(e) => set('logicType', e.target.value)}
              className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="all">ALL conditions (AND)</option>
              <option value="any">ANY condition (OR)</option>
            </select>
          </div>

          {/* Conditions */}
          <div className="space-y-2">
            {(logic.conditions || []).map((cond, i) => (
              <div key={i} className="flex items-center gap-2 flex-wrap">
                <select
                  value={cond.fieldKey}
                  onChange={(e) => updateCondition(i, 'fieldKey', e.target.value)}
                  className="flex-1 min-w-32 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">Select field…</option>
                  {existingKeys.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>

                <select
                  value={cond.operator}
                  onChange={(e) => updateCondition(i, 'operator', e.target.value)}
                  className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {OPERATORS.map((op) => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>

                {!['empty', 'not_empty'].includes(cond.operator) && (
                  <input
                    type="text"
                    value={cond.value ?? ''}
                    onChange={(e) => updateCondition(i, 'value', e.target.value)}
                    placeholder="Value"
                    className="flex-1 min-w-24 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                )}

                <button
                  type="button"
                  onClick={() => removeCondition(i)}
                  className="text-red-400 hover:text-red-600 text-lg leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addCondition}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            + Add Condition
          </button>
        </div>
      )}
    </div>
  );
}
