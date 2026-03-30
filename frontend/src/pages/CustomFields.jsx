import { useState } from 'react';
import Modal from '../components/ui/Modal';
import CustomFieldBuilder from '../components/customFields/CustomFieldBuilder';
import { useCustomFieldAdmin } from '../hooks/useCustomFields';

const MODULES = [
  { value: 'invoice', label: 'Invoices' },
  { value: 'client',  label: 'Clients' },
  { value: 'payment', label: 'Payments' },
  { value: 'company', label: 'Company' },
  { value: 'lineItem',label: 'Line Items' },
  { value: 'user',    label: 'Users' },
];

const TYPE_LABELS = {
  text: 'Text', textarea: 'Textarea', richtext: 'Rich Text',
  number: 'Number', currency: 'Currency', percentage: 'Percentage',
  date: 'Date', datetime: 'Date & Time',
  email: 'Email', phone: 'Phone', url: 'URL',
  dropdown: 'Dropdown', multiselect: 'Multi Select', radio: 'Radio', checkbox: 'Checkbox',
  boolean: 'Toggle', file: 'File', address: 'Address',
};

export default function CustomFields() {
  const [activeModule, setActiveModule] = useState('invoice');
  const [modalOpen, setModalOpen]       = useState(false);
  const [editingField, setEditingField] = useState(null);  // null = creating
  const [dragIndex, setDragIndex]       = useState(null);

  const {
    fields, loading, saving, error,
    createField, updateField, deleteField, reorderFields,
  } = useCustomFieldAdmin(activeModule);

  const existingKeys = fields.map((f) => f.key);

  const openCreate = () => { setEditingField(null); setModalOpen(true); };
  const openEdit   = (field) => { setEditingField(field); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditingField(null); };

  const handleSave = async (data) => {
    try {
      if (editingField) {
        await updateField(editingField._id, data);
      } else {
        await createField(data);
      }
      closeModal();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save field');
    }
  };

  const handleDelete = async (field) => {
    if (!window.confirm(`Delete "${field.label}"?\n\nThe field definition will be removed from forms, but existing data on invoices/clients will be preserved.`)) return;
    await deleteField(field._id);
  };

  // ── Drag-and-drop reorder ──
  const handleDragStart = (i)  => setDragIndex(i);
  const handleDragOver  = (e)  => e.preventDefault();
  const handleDrop      = async (targetIndex) => {
    if (dragIndex === null || dragIndex === targetIndex) return;
    const reordered = [...fields];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    setDragIndex(null);
    await reorderFields(reordered);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Custom Fields</h1>
          <p className="text-sm text-gray-500 mt-1">
            Add dynamic fields to your invoices, clients, and other modules
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 flex items-center gap-2"
        >
          + New Field
        </button>
      </div>

      {/* ── Module Tabs ── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {MODULES.map((m) => (
          <button
            key={m.value}
            onClick={() => setActiveModule(m.value)}
            className={[
              'px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
              activeModule === m.value
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900',
            ].join(' ')}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {/* ── Fields List ── */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading fields…</div>
      ) : fields.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <p className="text-5xl">📋</p>
          <p className="text-gray-500 font-medium">No custom fields yet for {activeModule}s</p>
          <p className="text-gray-400 text-sm">Create your first custom field to get started</p>
          <button
            onClick={openCreate}
            className="mt-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
          >
            + Add Custom Field
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-400 mb-3">
            Drag rows to reorder · {fields.length} field{fields.length !== 1 ? 's' : ''}
          </p>

          {/* ── Grouped by Section ── */}
          {groupBySection(fields).map(({ section, fields: sectionFields }) => (
            <div key={section} className="space-y-1">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 py-2">
                {section}
              </div>

              {sectionFields.map((field, i) => {
                const globalIndex = fields.findIndex((f) => f._id === field._id);
                return (
                  <div
                    key={field._id}
                    draggable
                    onDragStart={() => handleDragStart(globalIndex)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(globalIndex)}
                    className={[
                      'flex items-center gap-3 bg-white border rounded-lg px-4 py-3 cursor-grab active:cursor-grabbing transition-colors',
                      dragIndex === globalIndex ? 'opacity-40 border-blue-300' : 'border-gray-200 hover:border-gray-300',
                      !field.isActive && 'opacity-50',
                    ].join(' ')}
                  >
                    {/* Drag handle */}
                    <span className="text-gray-300 text-lg select-none">⠿</span>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 text-sm">{field.label}</span>
                        <code className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                          {field.key}
                        </code>
                        {!field.isActive && (
                          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">inactive</span>
                        )}
                        {field.deletedAt && (
                          <span className="text-xs text-red-400 bg-red-50 px-2 py-0.5 rounded-full">deleted</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <TypeBadge type={field.fieldType} />
                        {field.isRequired && <Flag label="Required" color="red" />}
                        {field.isReadOnly && <Flag label="Read-only" color="gray" />}
                        {field.isSearchable && <Flag label="Searchable" color="blue" />}
                        {field.conditionalLogic?.enabled && <Flag label="Conditional" color="purple" />}
                        <span className="text-xs text-gray-400">
                          Visible: {field.visibility?.join(', ') || 'all'}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEdit(field)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50 transition-colors"
                        title="Edit"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => handleDelete(field)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── Create / Edit Modal ── */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingField ? `Edit: ${editingField.label}` : 'New Custom Field'}
        size="lg"
      >
        <CustomFieldBuilder
          initialData={editingField}
          existingKeys={existingKeys.filter((k) => k !== editingField?.key)}
          onSave={handleSave}
          onCancel={closeModal}
          saving={saving}
        />
      </Modal>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupBySection(fields) {
  const map = new Map();
  for (const f of fields) {
    const s = f.section || 'Additional Info';
    if (!map.has(s)) map.set(s, []);
    map.get(s).push(f);
  }
  return Array.from(map.entries()).map(([section, fields]) => ({ section, fields }));
}

function TypeBadge({ type }) {
  return (
    <span className="text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full font-medium">
      {TYPE_LABELS[type] || type}
    </span>
  );
}

function Flag({ label, color }) {
  const colors = {
    red:    'text-red-600 bg-red-50',
    gray:   'text-gray-600 bg-gray-100',
    blue:   'text-blue-600 bg-blue-50',
    purple: 'text-purple-600 bg-purple-50',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[color] || colors.gray}`}>
      {label}
    </span>
  );
}
