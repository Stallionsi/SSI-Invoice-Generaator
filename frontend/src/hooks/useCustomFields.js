import { useState, useEffect, useCallback, useMemo } from 'react';
import { customFieldsApi } from '../api/customFields.api';

/**
 * useCustomFields
 *
 * Fetches field definitions for a module and provides helpers for
 * form rendering, conditional logic, and value management.
 *
 * @param {string} module - 'invoice' | 'client' | 'payment' | etc.
 */
export const useCustomFields = (module) => {
  const [fields, setFields]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const fetchFields = useCallback(async () => {
    if (!module) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await customFieldsApi.list(module);
      setFields(data.data.fields || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load custom fields');
    } finally {
      setLoading(false);
    }
  }, [module]);

  useEffect(() => { fetchFields(); }, [fetchFields]);

  /**
   * Group fields by their section label, preserving display order.
   * Returns: [{ section: 'Billing Info', fields: [...] }, ...]
   */
  const fieldsBySection = useMemo(() => {
    const map = new Map();
    for (const field of fields) {
      const s = field.section || 'Additional Info';
      if (!map.has(s)) map.set(s, []);
      map.get(s).push(field);
    }
    return Array.from(map.entries()).map(([section, sectionFields]) => ({
      section,
      fields: sectionFields,
    }));
  }, [fields]);

  /**
   * Build a map from fieldKey → definition for fast lookup.
   */
  const fieldMap = useMemo(
    () => new Map(fields.map((f) => [f.key, f])),
    [fields]
  );

  /**
   * Evaluate which fields are visible / required given the current values.
   * Returns: Map<fieldKey, { visible: boolean, required: boolean }>
   */
  const evaluateVisibility = useCallback(
    (values = {}) => {
      const result = new Map();
      for (const field of fields) {
        const logic = field.conditionalLogic;
        if (!logic?.enabled || !logic.conditions?.length) {
          result.set(field.key, { visible: true, required: field.isRequired });
          continue;
        }

        const condMet = evaluateConditions(logic.conditions, logic.logicType, values);
        switch (logic.action) {
          case 'show':
            result.set(field.key, { visible: condMet, required: condMet && field.isRequired });
            break;
          case 'hide':
            result.set(field.key, { visible: !condMet, required: !condMet && field.isRequired });
            break;
          case 'require':
            result.set(field.key, { visible: true, required: condMet });
            break;
          default:
            result.set(field.key, { visible: true, required: field.isRequired });
        }
      }
      return result;
    },
    [fields]
  );

  /**
   * Build initial values object: all field keys with their defaultValue (or '').
   */
  const buildInitialValues = useCallback(
    (existingValues = {}) => {
      const init = {};
      for (const field of fields) {
        init[field.key] = existingValues[field.key] ??
          field.defaultValue ??
          getEmptyValue(field.fieldType);
      }
      return init;
    },
    [fields]
  );

  return {
    fields,
    fieldsBySection,
    fieldMap,
    loading,
    error,
    refetch: fetchFields,
    evaluateVisibility,
    buildInitialValues,
  };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function evaluateConditions(conditions, logicType, values) {
  const results = conditions.map((c) => {
    const actual = values[c.fieldKey];
    const expected = c.value;
    switch (c.operator) {
      case 'eq':          return String(actual ?? '') === String(expected ?? '');
      case 'neq':         return String(actual ?? '') !== String(expected ?? '');
      case 'contains':    return String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
      case 'not_contains':return !String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
      case 'gt':          return Number(actual) > Number(expected);
      case 'lt':          return Number(actual) < Number(expected);
      case 'gte':         return Number(actual) >= Number(expected);
      case 'lte':         return Number(actual) <= Number(expected);
      case 'empty':       return !actual || (Array.isArray(actual) && !actual.length);
      case 'not_empty':   return !!actual && !(Array.isArray(actual) && !actual.length);
      default:            return true;
    }
  });
  return logicType === 'all' ? results.every(Boolean) : results.some(Boolean);
}

function getEmptyValue(fieldType) {
  switch (fieldType) {
    case 'multiselect':
    case 'checkbox':  return [];
    case 'boolean':   return false;
    case 'number':
    case 'currency':
    case 'percentage':return '';
    default:          return '';
  }
}

// ─── Admin hook — for the builder UI ─────────────────────────────────────────

/**
 * useCustomFieldAdmin
 * CRUD operations for the Custom Field Builder admin page.
 */
export const useCustomFieldAdmin = (module) => {
  const [fields, setFields]     = useState([]);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);

  const fetchFields = useCallback(async () => {
    if (!module) return;
    setLoading(true);
    try {
      const { data } = await customFieldsApi.list(module, { includeInactive: 'true' });
      setFields(data.data.fields || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load fields');
    } finally {
      setLoading(false);
    }
  }, [module]);

  useEffect(() => { fetchFields(); }, [fetchFields]);

  const createField = async (fieldData) => {
    setSaving(true);
    try {
      const { data } = await customFieldsApi.create({ ...fieldData, module });
      setFields((prev) => [...prev, data.data.field].sort((a, b) => a.order - b.order));
      return data.data.field;
    } finally {
      setSaving(false);
    }
  };

  const updateField = async (id, fieldData) => {
    setSaving(true);
    try {
      const { data } = await customFieldsApi.update(id, fieldData);
      setFields((prev) => prev.map((f) => (f._id === id ? data.data.field : f)));
      return data.data.field;
    } finally {
      setSaving(false);
    }
  };

  const deleteField = async (id) => {
    await customFieldsApi.delete(id);
    setFields((prev) => prev.filter((f) => f._id !== id));
  };

  const reorderFields = async (reordered) => {
    setFields(reordered);
    const payload = reordered.map((f, i) => ({ id: f._id, order: (i + 1) * 10 }));
    await customFieldsApi.reorder(module, payload);
  };

  return { fields, loading, saving, error, createField, updateField, deleteField, reorderFields, refetch: fetchFields };
};
