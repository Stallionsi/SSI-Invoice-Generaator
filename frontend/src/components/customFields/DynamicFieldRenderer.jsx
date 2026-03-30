import { useMemo } from 'react';

/**
 * DynamicFieldRenderer
 *
 * Renders a single custom field based on its definition.
 * Supports all field types, conditional visibility, and validation display.
 *
 * Props:
 *   field       - CustomField definition object
 *   value       - current value for this field
 *   onChange    - (key, value) => void
 *   error       - validation error string for this field
 *   disabled    - bool (read-only mode)
 *   allValues   - all current customFields values (for conditional display)
 *   visibility  - { visible, required } from evaluateVisibility()
 */
export default function DynamicFieldRenderer({
  field,
  value,
  onChange,
  error,
  disabled = false,
  visibility = { visible: true, required: false },
}) {
  if (!visibility.visible) return null;

  const required = visibility.required || field.isRequired;
  const isDisabled = disabled || field.isReadOnly;

  const handleChange = (val) => onChange(field.key, val);

  const baseInputClass = [
    'w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
    error ? 'border-red-400 bg-red-50' : 'border-gray-300',
    isDisabled ? 'bg-gray-100 cursor-not-allowed text-gray-500' : 'bg-white',
  ].join(' ');

  return (
    <div className="space-y-1">
      {/* Label */}
      <label className="block text-sm font-medium text-gray-700">
        {field.label}
        {required && <span className="ml-1 text-red-500">*</span>}
        {field.isReadOnly && (
          <span className="ml-2 text-xs text-gray-400 font-normal">(read-only)</span>
        )}
      </label>

      {/* Input */}
      <FieldInput
        field={field}
        value={value}
        onChange={handleChange}
        disabled={isDisabled}
        required={required}
        baseInputClass={baseInputClass}
      />

      {/* Help text */}
      {field.helpText && !error && (
        <p className="text-xs text-gray-500">{field.helpText}</p>
      )}

      {/* Validation error */}
      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <span>⚠</span> {error}
        </p>
      )}
    </div>
  );
}

// ─── Field Input Switcher ─────────────────────────────────────────────────────

function FieldInput({ field, value, onChange, disabled, required, baseInputClass }) {
  const { fieldType, options = [], placeholder, validation = {} } = field;

  switch (fieldType) {
    case 'text':
    case 'email':
    case 'phone':
    case 'url':
      return (
        <input
          type={fieldType === 'text' ? 'text' : fieldType}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || ''}
          disabled={disabled}
          required={required}
          maxLength={validation.maxLength}
          className={baseInputClass}
        />
      );

    case 'number':
    case 'currency':
    case 'percentage':
      return (
        <div className="relative">
          {fieldType === 'currency' && (
            <span className="absolute left-3 top-2 text-gray-400 text-sm">₹</span>
          )}
          {fieldType === 'percentage' && (
            <span className="absolute right-3 top-2 text-gray-400 text-sm">%</span>
          )}
          <input
            type="number"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder={placeholder || '0'}
            disabled={disabled}
            required={required}
            min={validation.min}
            max={validation.max}
            step={fieldType === 'currency' ? '0.01' : 'any'}
            className={[baseInputClass, fieldType === 'currency' ? 'pl-7' : '', fieldType === 'percentage' ? 'pr-7' : ''].join(' ')}
          />
        </div>
      );

    case 'textarea':
      return (
        <textarea
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || ''}
          disabled={disabled}
          required={required}
          rows={3}
          maxLength={validation.maxLength}
          className={baseInputClass}
        />
      );

    case 'richtext':
      // Lightweight rich text — swap for a full editor (e.g. TipTap) as needed
      return (
        <textarea
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || ''}
          disabled={disabled}
          required={required}
          rows={5}
          className={[baseInputClass, 'font-mono text-xs'].join(' ')}
        />
      );

    case 'date':
      return (
        <input
          type="date"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={required}
          className={baseInputClass}
        />
      );

    case 'datetime':
      return (
        <input
          type="datetime-local"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={required}
          className={baseInputClass}
        />
      );

    case 'dropdown':
      return (
        <select
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={required}
          className={baseInputClass}
        >
          <option value="">{placeholder || `Select ${field.label}…`}</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );

    case 'radio':
      return (
        <div className="space-y-2">
          {options.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value={opt.value}
                checked={value === opt.value}
                onChange={() => onChange(opt.value)}
                disabled={disabled}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">{opt.label}</span>
            </label>
          ))}
        </div>
      );

    case 'multiselect':
      return (
        <MultiSelect
          options={options}
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
          disabled={disabled}
          placeholder={placeholder}
        />
      );

    case 'checkbox':
      return (
        <div className="space-y-2">
          {options.map((opt) => {
            const checked = Array.isArray(value) && value.includes(opt.value);
            return (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const current = Array.isArray(value) ? value : [];
                    onChange(
                      e.target.checked
                        ? [...current, opt.value]
                        : current.filter((v) => v !== opt.value)
                    );
                  }}
                  disabled={disabled}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">{opt.label}</span>
              </label>
            );
          })}
        </div>
      );

    case 'boolean':
      return (
        <label className="flex items-center gap-3 cursor-pointer w-fit">
          <div
            onClick={() => !disabled && onChange(!value)}
            className={[
              'relative w-11 h-6 rounded-full transition-colors duration-200',
              value ? 'bg-blue-600' : 'bg-gray-300',
              disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
            ].join(' ')}
          >
            <div
              className={[
                'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200',
                value ? 'translate-x-5' : 'translate-x-0.5',
              ].join(' ')}
            />
          </div>
          <span className="text-sm text-gray-600">{value ? 'Yes' : 'No'}</span>
        </label>
      );

    case 'file':
      return (
        <input
          type="file"
          onChange={(e) => onChange(e.target.files?.[0] || null)}
          disabled={disabled}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
      );

    case 'address':
      return <AddressField value={value} onChange={onChange} disabled={disabled} baseInputClass={baseInputClass} />;

    default:
      return (
        <input
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || ''}
          disabled={disabled}
          className={baseInputClass}
        />
      );
  }
}

// ─── MultiSelect ──────────────────────────────────────────────────────────────

function MultiSelect({ options, value, onChange, disabled, placeholder }) {
  return (
    <div className="border border-gray-300 rounded-md p-2 space-y-1 max-h-48 overflow-y-auto">
      {options.map((opt) => {
        const selected = value.includes(opt.value);
        return (
          <label key={opt.value} className="flex items-center gap-2 cursor-pointer px-1 py-0.5 rounded hover:bg-gray-50">
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, opt.value]
                    : value.filter((v) => v !== opt.value)
                )
              }
              disabled={disabled}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">{opt.label}</span>
          </label>
        );
      })}
      {options.length === 0 && (
        <p className="text-xs text-gray-400 py-1 px-1">{placeholder || 'No options configured'}</p>
      )}
    </div>
  );
}

// ─── Address Composite Field ──────────────────────────────────────────────────

function AddressField({ value = {}, onChange, disabled, baseInputClass }) {
  const update = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-2">
      {[
        { key: 'line1', placeholder: 'Address line 1' },
        { key: 'line2', placeholder: 'Address line 2 (optional)' },
        { key: 'city',  placeholder: 'City' },
        { key: 'state', placeholder: 'State' },
        { key: 'pincode', placeholder: 'PIN / ZIP code' },
        { key: 'country', placeholder: 'Country' },
      ].map(({ key, placeholder }) => (
        <input
          key={key}
          type="text"
          value={value[key] ?? ''}
          onChange={(e) => update(key, e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={baseInputClass}
        />
      ))}
    </div>
  );
}

// ─── CustomFieldsSection ──────────────────────────────────────────────────────

/**
 * Renders a complete section of custom fields with a section heading.
 * Drop this into any form (CreateInvoice, ClientForm, etc.)
 *
 * Props:
 *   fieldsBySection  - from useCustomFields().fieldsBySection
 *   values           - customFields object in form state
 *   onChange         - (key, value) => void
 *   errors           - { [fieldKey]: errorMessage }
 *   disabled         - bool
 *   visibility       - Map from useCustomFields().evaluateVisibility(values)
 */
export function CustomFieldsSection({
  fieldsBySection = [],
  values = {},
  onChange,
  errors = {},
  disabled = false,
  visibility = new Map(),
}) {
  if (fieldsBySection.length === 0) return null;

  return (
    <>
      {fieldsBySection.map(({ section, fields }) => (
        <div key={section} className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200 pb-1">
            {section}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fields.map((field) => (
              <DynamicFieldRenderer
                key={field.key}
                field={field}
                value={values[field.key]}
                onChange={onChange}
                error={errors[field.key]}
                disabled={disabled}
                visibility={visibility.get(field.key) || { visible: true, required: field.isRequired }}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
