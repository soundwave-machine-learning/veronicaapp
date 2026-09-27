import { useEffect, useId, useRef, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Short line under the title. */
  description?: string;
  size?: 'small' | 'medium';
}

/**
 * A pop-up window built on the browser's own <dialog>, which keeps keyboard
 * focus inside and closes with the Escape key. Full screen on phones.
 */
export function Dialog({ open, title, onClose, children, description, size = 'medium' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Start focus on the first form field (or the first button).
      const first =
        dialog.querySelector<HTMLElement>('[data-autofocus]') ??
        dialog.querySelector<HTMLElement>('input, select, textarea, .dialog-body button');
      first?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={`dialog dialog-${size}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {open && (
        <div className="dialog-inner">
          <header className="dialog-header">
            <div>
              <h2 id={titleId} className="dialog-title">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="dialog-description">
                  {description}
                </p>
              )}
            </div>
            <button type="button" className="btn btn-quiet dialog-close" onClick={onClose}>
              Close
            </button>
          </header>
          <div className="dialog-body">{children}</div>
        </div>
      )}
    </dialog>
  );
}
