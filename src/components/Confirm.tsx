import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Dialog } from './Dialog';

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm must be used inside ConfirmProvider');
  return context;
}

/** "Are you sure?" questions in plain language, with clearly labelled answers. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    resolver.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const answer = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={options !== null} title={options?.title ?? ''} onClose={() => answer(false)} size="small">
        {options && (
          <div className="confirm">
            <div className="confirm-message">{options.message}</div>
            <div className="button-row">
              <button
                type="button"
                data-autofocus={options.danger ? undefined : true}
                className={`btn btn-large ${options.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => answer(true)}
              >
                {options.confirmLabel}
              </button>
              <button
                type="button"
                data-autofocus={options.danger ? true : undefined}
                className="btn btn-large btn-secondary"
                onClick={() => answer(false)}
              >
                {options.cancelLabel ?? 'Go Back'}
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}
