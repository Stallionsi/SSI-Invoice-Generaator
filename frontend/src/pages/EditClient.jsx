import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import { getClient, updateClient } from '../api/clients.api';
import ClientForm from '../components/client/ClientForm';
import PageHeader from '../components/ui/PageHeader';
import Spinner from '../components/ui/Spinner';
import SimpleCustomFields from '../components/customFields/SimpleCustomFields';

export default function EditClient() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const qc       = useQueryClient();

  // Custom fields state — seeded from the existing client record once loaded
  const [customFields, setCustomFields] = useState({});
  const [cfReady, setCfReady]           = useState(false);

  const handleCustomFieldChange = (key, value) =>
    setCustomFields((prev) => ({ ...prev, [key]: value }));

  const { data, isLoading } = useQuery({
    queryKey: ['client', id],
    queryFn:  () => getClient(id),
  });

  const client = data?.data?.data?.client;

  // Populate custom fields state once (on first load)
  useEffect(() => {
    if (client && !cfReady) {
      setCustomFields(client.customFields || {});
      setCfReady(true);
    }
  }, [client, cfReady]);

  const { mutate, isPending } = useMutation({
    mutationFn: (d) => updateClient(id, d),
    onSuccess: () => {
      toast.success('Client updated!');
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['client', id] });
      navigate(`/clients/${id}`);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to update'),
  });

  // Merge custom fields into the payload
  const onSubmit = (formData) => mutate({ ...formData, customFields });

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div>
      <PageHeader
        title="Edit Client"
        actions={
          <button className="btn btn-secondary" onClick={() => navigate(`/clients/${id}`)}>
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        }
      />

      <div className="space-y-6 max-w-2xl">
        <div className="card">
          <ClientForm defaultValues={client} onSubmit={onSubmit} isLoading={isPending} />
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
