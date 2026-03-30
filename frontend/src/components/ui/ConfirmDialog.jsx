import Modal from './Modal';
import Spinner from './Spinner';

export default function ConfirmDialog({ open, onClose, onConfirm, title, message, loading }) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-sm">
      <p className="text-sm text-gray-600 mb-6">{message}</p>
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn btn-secondary" disabled={loading}>
          Cancel
        </button>
        <button onClick={onConfirm} className="btn btn-danger" disabled={loading}>
          {loading ? <Spinner /> : 'Delete'}
        </button>
      </div>
    </Modal>
  );
}
