import { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Send, X } from 'lucide-react';
import { sendInvoice } from '../../api/invoices.api';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';

// ── Constants ────────────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (e) => EMAIL_RE.test(e.trim());

// ── EmailChipInput ────────────────────────────────────────────────────────────
/**
 * Gmail-style chip input for multiple email addresses.
 *
 * Props:
 *   chips       string[]   — controlled list of confirmed emails
 *   onChange    (chips: string[]) => void
 *   placeholder string
 *   hasError    boolean
 */
function EmailChipInput({ chips, onChange, placeholder = 'Add email…', hasError }) {
  const [inputVal, setInputVal] = useState('');
  const [inputError, setInputError] = useState('');
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Focus the text input whenever the container div is clicked
  const focusInput = () => inputRef.current?.focus();

  // Attempt to commit the current inputVal as a chip
  const commitInput = useCallback((raw = inputVal) => {
    const email = raw.trim();
    if (!email) return;

    if (!isValidEmail(email)) {
      setInputError(`"${email}" is not a valid email`);
      return;
    }
    if (chips.includes(email)) {
      setInputError(`"${email}" is already added`);
      return;
    }

    onChange([...chips, email]);
    setInputVal('');
    setInputError('');
  }, [inputVal, chips, onChange]);

  const removeChip = (email) => {
    onChange(chips.filter((c) => c !== email));
    inputRef.current?.focus();
  };

  const removeLastChip = () => {
    if (chips.length > 0) onChange(chips.slice(0, -1));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitInput();
    } else if (e.key === 'Backspace' && inputVal === '') {
      e.preventDefault();
      removeLastChip();
    } else if (e.key === 'Tab' && inputVal.trim()) {
      e.preventDefault();
      commitInput();
    }
  };

  const handleChange = (e) => {
    setInputError('');
    const val = e.target.value;
    // Auto-commit if user typed a trailing comma or semicolon
    if (val.endsWith(',') || val.endsWith(';')) {
      commitInput(val.slice(0, -1));
    } else {
      setInputVal(val);
    }
  };

  // Paste: split on comma/semicolon/newline, add all valid ones at once
  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    const parts = pasted.split(/[,;\s\n]+/).map((s) => s.trim()).filter(Boolean);
    const toAdd = [];
    const bad = [];
    for (const p of parts) {
      if (!isValidEmail(p)) { bad.push(p); continue; }
      if (!chips.includes(p) && !toAdd.includes(p)) toAdd.push(p);
    }
    if (toAdd.length) onChange([...chips, ...toAdd]);
    if (bad.length) setInputError(`Skipped invalid: ${bad.join(', ')}`);
  };

  // Commit on blur so clicking Send after typing an email doesn't lose it
  const handleBlur = () => {
    if (inputVal.trim()) commitInput();
  };

  const borderClass = hasError || inputError
    ? 'border-red-300 ring-red-100 focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-100'
    : 'border-slate-200 focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100';

  return (
    <div>
      {/* Chip container — clicking anywhere focuses the text input */}
      <div
        ref={containerRef}
        onClick={focusInput}
        className={`flex flex-wrap items-center gap-1.5 min-h-[2.5rem] px-3 py-2 rounded-lg border bg-white cursor-text transition-all ${borderClass}`}
      >
        {chips.map((email) => (
          <span
            key={email}
            className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-primary-50 border border-primary-100 text-primary-700 text-xs font-medium select-none"
          >
            {email}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()} // prevent blur before click
              onClick={(e) => { e.stopPropagation(); removeChip(email); }}
              className="flex items-center justify-center w-4 h-4 rounded-full hover:bg-primary-200 hover:text-primary-900 transition-colors"
              aria-label={`Remove ${email}`}
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={handleBlur}
          placeholder={chips.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[140px] text-sm outline-none bg-transparent text-slate-800 placeholder:text-slate-400"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {/* Per-input errors (duplicate / invalid format) */}
      {inputError && (
        <p className="text-xs text-red-500 mt-1">{inputError}</p>
      )}
    </div>
  );
}

// ── SendInvoiceModal ──────────────────────────────────────────────────────────
export default function SendInvoiceModal({ open, onClose, invoice }) {
  const qc = useQueryClient();

  const recipientEmail = invoice?.recipientEmail || invoice?.client?.email || '';
  const invoiceNumber  = invoice?.invoiceNumber  || '';

  const [ccChips,  setCcChips]  = useState([]);
  const [subject,  setSubject]  = useState('');
  const [message,  setMessage]  = useState('');

  // Reset when the modal opens; pre-fill from saved ccEmails
  useEffect(() => {
    if (!open) return;
    const saved = invoice?.ccEmails;
    setCcChips(Array.isArray(saved) ? saved.filter(isValidEmail) : []);
    setSubject('');
    setMessage('');
  }, [open, invoice]);

  const { mutate, isPending } = useMutation({
    mutationFn: (payload) => sendInvoice(invoice._id, payload),
    onSuccess: () => {
      toast.success('Invoice sent!');
      qc.invalidateQueries({ queryKey: ['invoice', invoice._id] });
      onClose();
    },
    onError: (e) => {
      console.error('Send invoice failed', e.response?.data || e.message);
      toast.error(e.response?.data?.message || 'Failed to send invoice');
    },
  });

  const handleSend = () => {
    console.log('Send button clicked', { invoiceId: invoice._id, recipientEmail, ccEmails: ccChips });
    mutate({
      recipientEmail,
      ccEmails: ccChips.length > 0 ? ccChips : undefined,
      subject:  subject.trim() || undefined,
      message:  message.trim() || undefined,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Send Invoice" maxWidth="max-w-lg">
      <div className="space-y-4">

        {/* To (read-only) */}
        <div>
          <label className="label">To</label>
          <input
            className="input bg-slate-50 text-slate-500 cursor-default"
            value={recipientEmail}
            readOnly
          />
        </div>

        {/* CC — chip input */}
        <div>
          <label className="label">
            CC
            <span className="ml-1 text-xs font-normal text-slate-400">
              (optional — Enter or comma to add)
            </span>
          </label>
          <EmailChipInput
            chips={ccChips}
            onChange={setCcChips}
            placeholder="finance@company.com"
          />
          {ccChips.length > 0 && (
            <p className="text-xs text-slate-400 mt-1">
              {ccChips.length} recipient{ccChips.length !== 1 ? 's' : ''} added
            </p>
          )}
        </div>

        {/* Subject (optional) */}
        <div>
          <label className="label">
            Subject
            <span className="ml-1 text-xs font-normal text-slate-400">(optional)</span>
          </label>
          <input
            className="input"
            placeholder={`Invoice ${invoiceNumber}`}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        {/* Message (optional) */}
        <div>
          <label className="label">
            Message
            <span className="ml-1 text-xs font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            className="input resize-none"
            rows={3}
            placeholder="Add a personal note to the email…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSend}
            disabled={isPending || !recipientEmail}
          >
            {isPending ? (
              <Spinner />
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send Invoice
              </>
            )}
          </button>
        </div>

      </div>
    </Modal>
  );
}
