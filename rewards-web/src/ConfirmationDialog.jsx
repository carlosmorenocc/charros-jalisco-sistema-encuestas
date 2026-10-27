import React, { useEffect, useRef } from 'react';

export default function ConfirmationDialog({ action, reward, busy, onCancel, onConfirm }) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const busyRef = useRef(busy);
  const onCancelRef = useRef(onCancel);
  busyRef.current = busy;
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!action || !reward) return undefined;

    const previousFocus = document.activeElement;
    cancelRef.current?.focus();
    const keepFocusInside = (event) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...dialogRef.current.querySelectorAll('button:not(:disabled)')];
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
  return (
    <div className="confirmation-overlay" role="presentation" onMouseDown={onCancel}>
      <section
        ref={dialogRef}
        className="confirmation-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
        aria-describedby="confirmation-copy"
        onMouseDown={(event) => event.stopPropagation()}
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
        <div className="dialog-actions">
          <button ref={cancelRef} type="button" className="secondary-action" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className={isUndo ? 'danger-action' : 'primary-action'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Guardando…' : isUndo ? 'Sí, desmarcar' : 'Sí, entregar'}
          </button>
        </div>
      </section>
    </div>
  );
}
