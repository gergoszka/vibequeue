import { ApiError } from '../types';
import { API_BASE } from '../config';

export function useApi() {
  async function get<T>(path: string): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(err.error || 'Request failed', res.status, err.code);
    }
    return res.json() as Promise<T>;
  }

  async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(err.error || 'Request failed', res.status, err.code);
    }
    return res.json() as Promise<T>;
  }

  async function del(path: string): Promise<void> {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(err.error || 'Request failed', res.status, err.code);
    }
  }

  return { get, post, del };
}

interface HandleApiErrorOptions {
  navigate?: (path: string) => void;
  addToast?: (message: string, type: string) => void;
}

export function handleApiError(err: ApiError, { navigate, addToast }: HandleApiErrorOptions = {}): void {
  if (err.status === 401) {
    addToast?.('Session expired. Please reload.', 'error');
    navigate?.('/');
    return;
  }
  if (err.status === 410) {
    addToast?.('The room has ended.', 'info');
    navigate?.('/');
    return;
  }
  if (err.status === 403) {
    addToast?.('Permission denied.', 'error');
    return;
  }
  // Default
  addToast?.(err.message || 'Something went wrong.', 'error');
}
