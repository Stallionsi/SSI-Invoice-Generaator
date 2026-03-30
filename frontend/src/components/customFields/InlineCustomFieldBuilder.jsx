import { useState } from 'react';
import toast from 'react-hot-toast';
import CustomFieldBuilder from './CustomFieldBuilder';
import { customFieldsApi } from '../../api/customFields.api';

/**
 * InlineCustomFieldBuilder
 *
 * A thin wrapper around CustomFieldBuilder that:
 *  - Calls POST /api/custom-fields on save
 *  - Notifies the parent via onCreated(newField) so it can refetch
 *  - Calls onClose() when finished or cancelled
 *
 * Usage (inside any form page):
 *
 *   const [showBuilder, setShowBuilder] = useState(false);
 *
 *   <button type="button" onClick={() => setShowBuilder(true)}>
 *     + Add Custom Field
 *   </button>
 *
 *   <Modal open={showBuilder} onClose={() => setShowBuilder(false)} title="Add Custom Field" maxWidth="max-w-2xl">
 *     <InlineCustomFieldBuilder
 *       module="invoice"
 *       onCreated={(field) => { refetch(); setCustomFields(prev => ({ ...prev, [field.key]: field.defaultValue ?? '' })); }}
 *       onClose={() => setShowBuilder(false)}
 *     />
 *   </Modal>
 */
export default function InlineCustomFieldBuilder({ module, onCreated, onClose }) {
  const [saving, setSaving] = useState(false);

  const handleSave = async (fieldData) => {
    setSaving(true);
    try {
      const res = await customFieldsApi.create({ ...fieldData, module });
      const newField = res.data.data.field;
      toast.success(`"${newField.label}" field added`);
      onCreated(newField);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create field');
    } finally {
      setSaving(false);
    }
  };

  return (
    <CustomFieldBuilder
      onSave={handleSave}
      onCancel={onClose}
      saving={saving}
    />
  );
}
