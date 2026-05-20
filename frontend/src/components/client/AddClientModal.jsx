import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { createClient } from '../../api/clients.api';
import ClientForm from './ClientForm';
import Modal from '../ui/Modal';
import SimpleCustomFields from '../customFields/SimpleCustomFields';

/**
 * Modal wrapper for creating a new client inline.
 * Props:
 *   open      — boolean, controls visibility
 *   onClose   — called when modal should close
 *   onCreated — called with the newly created client object after save
 */
export default function AddClientModal({ open, onClose, onCreated }) {
  const qc = useQueryClient();
  const [customFields, setCustomFields] = useState({});

  const { mutate, isPending } = useMutation({
    mutationFn: createClient,
    onSuccess: (res) => {
      const client = res.data?.data?.client;
      toast.success('Client created!');
      qc.invalidateQueries({ queryKey: ['clients'] });
      onCreated?.(client);
      handleClose();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to create client'),
  });

  const handleClose = () => {
    setCustomFields({});
    onClose();
  };

  const onSubmit = (formData) => mutate({ ...formData, customFields });

  return (
    <Modal open={open} onClose={handleClose} title="New Client" maxWidth="max-w-2xl">
      <div className="space-y-6">
        <ClientForm onSubmit={onSubmit} isLoading={isPending} />

        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Additional Fields</h2>
          <SimpleCustomFields
            module="client"
            values={customFields}
            onChange={(key, value) => setCustomFields((prev) => ({ ...prev, [key]: value }))}
          />
        </div>
      </div>
    </Modal>
  );
}
