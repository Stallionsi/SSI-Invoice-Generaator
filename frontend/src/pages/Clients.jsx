import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Pencil, Trash2, Users, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { getClients, deleteClient } from '../api/clients.api';
import { useAuthStore } from '../store/authStore';
import PageHeader from '../components/ui/PageHeader';
import Spinner from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';

export default function Clients() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const activeId = useAuthStore((s) => s.selectedCompanyId);
  const [inputValue, setInputValue]   = useState('');
  const [search, setSearch]           = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Debounce: only fire API call 300ms after user stops typing
  useEffect(() => {
    const timer = setTimeout(() => setSearch(inputValue), 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const { data, isLoading } = useQuery({
    queryKey: ['clients', activeId, { search }],
    queryFn: () => getClients({ search: search || undefined, limit: 50 }),
    keepPreviousData: true,
  });

  const clients = data?.data?.data?.clients || [];

  const { mutate: doDelete, isPending: deleting } = useMutation({
    mutationFn: () => deleteClient(deleteTarget._id),
    onSuccess: () => {
      toast.success('Client deleted');
      qc.invalidateQueries({ queryKey: ['clients'] });
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Delete failed'),
  });

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle={`${clients.length} client${clients.length !== 1 ? 's' : ''}`}
        actions={
          <button className="btn-primary" onClick={() => navigate('/clients/new')}>
            <Plus className="w-4 h-4" /> New Client
          </button>
        }
      />

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          className="input pl-9"
          placeholder="Search by name, email, phone…"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : clients.length === 0 ? (

          <EmptyState
            icon={Users}
            title="No clients yet"
            description="Add your first client to get started"
            action={
              <button className="btn-primary" onClick={() => navigate('/clients/new')}>
                <Plus className="w-4 h-4" /> Add Client
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
          <table className="table-premium w-full text-sm min-w-[520px]">
            <thead>
              <tr>
                <th>Name</th>
                <th className="hidden sm:table-cell">Email</th>
                <th className="hidden md:table-cell">Phone</th>
                <th className="hidden md:table-cell">Currency</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr
                  key={c._id}
                  onClick={() => navigate(`/clients/${c._id}`)}
                >
                  <td>
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0"
                        style={{ background: 'linear-gradient(135deg, #6366F1, #7C3AED)' }}
                      >
                        {(c.clientName || '?').charAt(0).toUpperCase()}
                      </div>
                      <span className="font-semibold text-gray-900">{c.clientName}</span>
                    </div>
                  </td>
                  <td className="text-gray-500 hidden sm:table-cell">{c.email || '—'}</td>
                  <td className="text-gray-500 hidden md:table-cell">{c.phone || '—'}</td>
                  <td className="hidden md:table-cell">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700">
                      {c.currency || 'INR'}
                    </span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => navigate(`/clients/${c._id}`)}
                        title="View"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => navigate(`/clients/${c._id}/edit`)}
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => setDeleteTarget(c)}
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={doDelete}
        loading={deleting}
        title="Delete Client"
        message={`Are you sure you want to delete "${deleteTarget?.clientName}"? This cannot be undone.`}
      />
    </div>
  );
}
