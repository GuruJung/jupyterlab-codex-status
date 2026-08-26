import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';

import { ITerminalResponse } from './model';

const API_ROOT = 'jupyterlab-codex-status/api/v1';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const settings = ServerConnection.makeSettings();
  const url = URLExt.join(settings.baseUrl, API_ROOT, path);
  const response = await ServerConnection.makeRequest(url, init, settings);
  if (!response.ok) {
    const message = await response.text();
    throw new ServerConnection.ResponseError(response, message);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function fetchTerminals(): Promise<ITerminalResponse> {
  return request<ITerminalResponse>('terminals');
}

export function setTerminalTitle(name: string, title: string): Promise<{ name: string; title: string | null }> {
  return request(`terminals/${encodeURIComponent(name)}/title`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });
}

export function clearTerminalTitle(name: string): Promise<void> {
  return request(`terminals/${encodeURIComponent(name)}/title`, { method: 'DELETE' });
}

