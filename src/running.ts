import type { IRunningSessions } from '@jupyterlab/running';
import React from 'react';

import { ITerminalStatus, PollingModel } from './model';

const STATE_ICONS: Record<'idle' | 'working' | 'blocked', string> = {
  idle: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"%3E%3Ccircle cx="8" cy="8" r="5" fill="%232ca02c"/%3E%3C/svg%3E',
  working: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"%3E%3Cpath d="M8 2a6 6 0 1 1-5.2 3" fill="none" stroke="%23d99b00" stroke-width="2"/%3E%3Cpath d="M1 2v4h4" fill="none" stroke="%23d99b00" stroke-width="2"/%3E%3C/svg%3E',
  blocked: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"%3E%3Cpath d="M8 1 15 14H1Z" fill="%23d62728"/%3E%3Cpath d="M8 5v5M8 12v1" stroke="white"/%3E%3C/svg%3E'
};

export function describe(status: ITerminalStatus, model: PollingModel): string {
  const state = status.agent === 'codex' ? `Codex ${status.state ?? 'unknown'}` : 'Terminal';
  const updated = model.lastSuccess ? model.lastSuccess.toLocaleTimeString() : 'not updated yet';
  const stale = model.stale ? '; connection failed, status may be stale' : '';
  return `${state}; last updated ${updated}${stale}`;
}

export function syncTabAriaLabels(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-codex-aria-label]').forEach(tab => {
    const label = tab.dataset.codexAriaLabel;
    if (label) {
      tab.setAttribute('aria-label', label);
    }
  });
}

export function decorateRunningManager(
  manager: IRunningSessions.IManager,
  model: PollingModel,
  terminalRunningChanged: object,
  terminalNames: () => readonly string[]
): void {
  const wrapped = manager as IRunningSessions.IManager & {
    __codexStatusWrapped?: boolean;
  };
  if (manager.runningChanged !== terminalRunningChanged || wrapped.__codexStatusWrapped) {
    return;
  }
  const original = manager.running.bind(manager);
  manager.running = options => {
    const names = terminalNames();
    return original(options).map((item, index) => {
      const originalLabel = item.label;
      const originalTitle = item.labelTitle;
      const rendered = originalLabel.call(item);
      const text = typeof rendered === 'string' ? rendered : '';
      const name = names[index];
      const status = model.statuses.get(name);
      if (!status) {
        return item;
      }
      const visibleLabel = status.title ?? `Terminal ${name}`;
      return {
        children: item.children,
        className: `${item.className ?? ''} jp-CodexStatus-${status.state ?? 'unknown'}`.trim(),
        context: item.context,
        open: item.open ? () => item.open!.call(item) : undefined,
        shutdown: item.shutdown ? () => item.shutdown!.call(item) : undefined,
        icon: () => status.state ? STATE_ICONS[status.state] : item.icon.call(item),
        label: () => React.createElement(
          React.Fragment,
          null,
          visibleLabel,
          React.createElement(
            'span',
            { className: 'jp-CodexStatus-srOnly' },
            [`; ${describe(status, model)}`]
          )
        ),
        labelTitle: () => `${originalTitle?.call(item) ?? text}; ${describe(status, model)}`,
        detail: item.detail ? () => item.detail!.call(item) : undefined
      };
    });
  };
  wrapped.__codexStatusWrapped = true;
}

export function emitRunningChanged(
  manager: IRunningSessions.IManager,
  terminalRunningChanged: unknown,
  currentTerminalModels: unknown
): void {
  if (manager.runningChanged !== terminalRunningChanged) {
    return;
  }
  const signal = manager.runningChanged as unknown as { emit?: (args: unknown) => void };
  if (signal.emit) {
    signal.emit.call(signal, currentTerminalModels);
  }
}
