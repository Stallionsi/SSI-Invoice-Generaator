import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { addPayment } from '../../api/invoices.api';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import { fmtCurrency } from '../../utils/calculations';

const schema = z.object({
  paymentAmount: z.number().positive('Amount must be positive'),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'upi', 'cheque', 'card', 'other']),
  paymentDate:   z.string().optional(),
  notes:         z.string().optional(),
});

export default function PaymentModal({ open, onClose, invoice }) {
  const qc = useQueryClient();
  const balanceDue = invoice?.balanceDue || 0;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      paymentAmount: balanceDue,
      paymentMethod: 'bank_transfer',
      paymentDate:   new Date().toISOString().slice(0, 10),
    },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: (data) => addPayment(invoice._id, data),
    onSuccess: () => {
      toast.success('Payment recorded!');
      qc.invalidateQueries({ queryKey: ['invoice', invoice._id] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      reset();
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Payment failed'),
  });

  const handleClose = () => { reset(); onClose(); };

  return (
    <Modal open={open} onClose={handleClose} title="Record Payment">
      <form onSubmit={handleSubmit(mutate)} className="space-y-4">
        <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-800">
          Balance due: <span className="font-bold">{fmtCurrency(balanceDue, invoice?.currency)}</span>
        </div>

        <div>
          <label className="label">Amount *</label>
          <input
            {...register('paymentAmount', { valueAsNumber: true })}
            type="number"
            step="0.01"
            min="0.01"
            className="input"
          />
          {errors.paymentAmount && (
            <p className="text-red-500 text-xs mt-1">{errors.paymentAmount.message}</p>
          )}
        </div>

        <div>
          <label className="label">Payment Method *</label>
          <select {...register('paymentMethod')} className="input">
            <option value="bank_transfer">Bank Transfer</option>
            <option value="upi">UPI</option>
            <option value="cash">Cash</option>
            <option value="cheque">Cheque</option>
            <option value="card">Card</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label className="label">Payment Date</label>
          <input {...register('paymentDate')} type="date" className="input" />
        </div>

        <div>
          <label className="label">Notes</label>
          <input {...register('notes')} className="input" placeholder="Reference number, etc." />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={isPending}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isPending}>
            {isPending ? <Spinner /> : 'Record Payment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
