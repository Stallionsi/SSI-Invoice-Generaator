import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '../api/clients.api';
import ClientForm from '../components/client/ClientForm';
import PageHeader from '../components/ui/PageHeader';
import SimpleCustomFields from '../components/customFields/SimpleCustomFields';

export default function CreateClient() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [customFields, setCustomFields] = useState({});
  const handleCustomFieldChange = (key, value) =>
    setCustomFields((prev) => ({ ...prev, [key]: value }));

  const { mutate, isPending } = useMutation({
    mutationFn: createClient,
    onSuccess: () => {
      toast.success('Client created!');
      qc.invalidateQueries({ queryKey: ['clients'] });
      navigate('/clients');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to create client'),
  });

  const onSubmit = (formData) => mutate({ ...formData, customFields });

  return (
    <div>
      <PageHeader
        title="New Client"
        actions={
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        }
      />

      <div className="space-y-6 max-w-2xl">
        <div className="card">
          <ClientForm onSubmit={onSubmit} isLoading={isPending} />
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Additional Fields</h2>
          <SimpleCustomFields
            module="client"
            values={customFields}
            onChange={handleCustomFieldChange}
          />
        </div>
      </div>
    </div>
  );
}
