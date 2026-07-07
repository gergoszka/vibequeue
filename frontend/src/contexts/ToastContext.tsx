import { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { Toast } from '../types';

interface ToastContextValue {
  addToast: (message: string, type?: Toast['type'], duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

interface ToastProviderProps {
  children: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef<number>(0);

  const addToast = useCallback((message: string, type: Toast['type'] = 'info', duration = 3000) => {
    const id = ++counterRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 md:left-auto md:right-4 md:translate-x-0 z-50 space-y-2 w-80 max-w-[90vw]">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: number) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const colors: Record<Toast['type'], string> = {
    info: 'bg-gray-700 border-gray-600 text-white',
    success: 'bg-green-800 border-green-600 text-green-100',
    error: 'bg-red-800 border-red-600 text-red-100',
    warning: 'bg-yellow-800 border-yellow-600 text-yellow-100',
  };
  return (
    <div className={`flex items-center justify-between rounded-lg border px-4 py-3 shadow-lg text-sm ${colors[toast.type]}`}>
      <span>{toast.message}</span>
      <button onClick={() => onDismiss(toast.id)} className="ml-3 opacity-60 hover:opacity-100">&#x2715;</button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
