import React, { useEffect, useRef, useState } from 'react';

export default function ConfirmationDialog({ action, reward, busy, error = '', onCancel, onConfirm }) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const recipientRef = useRef(null);
  const busyRef = useRef(busy);
  const onCancelRef = useRef(onCancel);
  const [recipientName, setRecipientName] = useState('');
  const [validationError, setValidationError] = useState('');
  busyRef.current = busy;
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!action || !reward) return undefined;

    const previousFocus = document.activeElement;
    setRecipientName('');
    setValidationError('');
    if (action === 'deliver') recipientRef.current?.focus();
    else cancelRef.current?.focus();
    const keepFocusInside = (event) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...dialogRef.current.querySelectorAll('input:not(:disabled), button:not(:disabled)')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', keepFocusInside);
    return () => {
      document.removeEventListener('keydown', keepFocusInside);
      previousFocus?.focus?.();
    };
  }, [action, reward]);

  if (!action || !reward) return null;

  const isUndo = action === 'undo';
  const handleCancel = () => {
    if (!busy) onCancel();
  };
  const handleSubmit = (event) => {
    event.preventDefault();
    if (isUndo) {
      onConfirm();
      return;
    }
    const normalizedRecipient = recipientName.trim();
    if (!normalizedRecipient) {
      setValidationError('Indica el nombre de quien recibe la recompensa.');
      recipientRef.current?.focus();
      return;
    }
    onConfirm(normalizedRecipient);
  };

  return (
    <div className="confirmation-overlay" role="presentation" onMouseDown={handleCancel}>
      <form
        ref={dialogRef}
        className="confirmation-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
        aria-describedby={isUndo ? 'confirmation-copy' : 'confirmation-copy confirmation-date-note'}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        noValidate
      >
        <p className="eyebrow">CONFIRMACIÓN</p>
        <h3 id="confirmation-title">
          {isUndo ? `¿Desmarcar la recompensa ${reward.milestone}?` : `¿Confirmar la recompensa ${reward.milestone}?`}
        </h3>
        <p id="confirmation-copy">
          {isUndo
            ? 'La entrega quedará registrada como una corrección y podrá volver a capturarse.'
            : `Se registrará la entrega de “${reward.benefit}” para esta butaca.`}
        </p>
        {!isUndo ? (
          <>
            <div className="delivery-reward-summary" aria-label="Recompensa seleccionada">
              <span>{reward.milestone}</span>
              <div>
                <small>Recompensa</small>
                <strong>{reward.benefit}</strong>
              </div>
            </div>
            <label className="recipient-field" htmlFor="delivery-recipient">
              Nombre de quien recibe
              <input
                ref={recipientRef}
                id="delivery-recipient"
                name="recipientName"
                type="text"
                autoComplete="name"
                maxLength="120"
                required
                value={recipientName}
                aria-invalid={Boolean(validationError)}
                aria-describedby={validationError ? 'recipient-error' : 'confirmation-date-note'}
                onChange={(event) => {
                  setRecipientName(event.target.value);
                  if (validationError) setValidationError('');
                }}
              />
            </label>
            {validationError ? <p id="recipient-error" className="field-error" role="alert">{validationError}</p> : null}
            <p id="confirmation-date-note" className="dialog-note">
              La fecha, hora y usuario que realiza la entrega se registrarán automáticamente.
            </p>
          </>
        ) : null}
        {error ? <p className="dialog-error" role="alert">{error}</p> : null}
        <div className="dialog-actions">
          <button ref={cancelRef} type="button" className="secondary-action" onClick={handleCancel} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className={isUndo ? 'danger-action' : 'primary-action'} disabled={busy}>
            {busy ? 'Guardando…' : isUndo ? 'Sí, desmarcar' : 'Sí, entregar'}
          </button>
        </div>
      </form>
    </div>
  );
}
