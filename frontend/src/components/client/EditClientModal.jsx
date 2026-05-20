import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getClient, updateClient } from '../../api/clients.api';
import ClientForm from './ClientForm';
import Modal from '../ui/Modal';
import SimpleCustomFields from '../customFields/SimpleCustomFields';
import Spinner from '../ui/Spinner';

/**
 * Modal for editing an existing client inline (e.g. from the Edit Invoice page).
 * Props:
 *   clientId  — ID of the client to edit; falsy keeps the modal closed
 *   open      — boolean
 *   onClose   — called when modal should close
 *   onUpdated — called with the updated client object after save
 */
export default function EditClientModal({ clientId, open, onClose, onUpdated }) {
  const qc = useQueryClient();
  const [customFields, setCustomFields] = useState(null); // null = not yet initialised

  const { data, isLoading } = useQuery({
    queryKey: ['client', clientId],
    queryFn:  () => getClient(clientId),
    enabled:  !!clientId && open,
    staleTime: 30_000,
  });

  const client = data?.data?.data?.client;

  // Initialise customFields from the loaded client (once per open)
  if (client && customFields === null) {
    setCustomFields(client.customFields || {});
  }

  const { mutate, isPending } = useMutation({
    mutationFn: (formData) => updateClient(clientId, formData),
    onSuccess: (res) => {
      const updated = res.data?.data?.client;
      toast.success('Client updated!');
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['client', clientId] });
      onUpdated?.(updated);
      handleClose();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to update client'),
  });

  const handleClose = () => {
    setCustomFields(null); // reset so next open re-initialises
    onClose();
  };

  const onSubmit = (formData) => mutate({ ...formData, customFields: customFields || {} });

  return (
    <Modal open={open} onClose={handleClose} title="Edit Client" maxWidth="max-w-2xl">
      {isLoading || !client ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <div className="space-y-6">
          <ClientForm
            defaultValues={client}
            onSubmit={onSubmit}
            isLoading={isPending}
            submitLabel="Save Changes"
          />

          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Additional Fields</h2>
            <SimpleCustomFields
              module="client"
              values={customFields || {}}
              onChange={(key, value) =>
                setCustomFields((prev) => ({ ...(prev || {}), [key]: value }))
              }
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
