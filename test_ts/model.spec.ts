import { IRunningSessions } from '@jupyterlab/running';
import React from 'react';

import { PollingModel } from '../src/model';
import {
  decorateRunningManager,
  emitRunningChanged,
  syncTabAriaLabels
} from '../src/running';

describe('PollingModel', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('serializes requests and schedules after completion', async () => {
    let resolve: ((value: { terminals: [] }) => void) | undefined;
    const fetcher = jest.fn(
      () => new Promise<{ terminals: [] }>(done => { resolve = done; })
    );
    const model = new PollingModel(fetcher, 1000);
    model.start();
    void model.poll();
    expect(fetcher).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(5000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolve?.({ terminals: [] });
    await Promise.resolve();
    jest.advanceTimersByTime(999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    model.dispose();
  });

  it('retains last data and backs off after failure', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce({ terminals: [{ name: '1', title: 'job', agent: 'codex', state: 'idle' }] })
      .mockRejectedValueOnce(new Error('offline'));
    const model = new PollingModel(fetcher, 500);
    await model.poll();
    expect(model.statuses.get('1')?.title).toBe('job');
    jest.advanceTimersByTime(500);
    await Promise.resolve();
    await Promise.resolve();
    expect(model.statuses.get('1')?.title).toBe('job');
    expect(model.stale).toBe(true);
    model.dispose();
  });

  it('clamps settings and disposes timers', () => {
    expect(PollingModel.clampInterval(100)).toBe(500);
    expect(PollingModel.clampInterval(20000)).toBe(10000);
    const model = new PollingModel(async () => ({ terminals: [] }));
    model.start();
    model.dispose();
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('Running terminal decoration', () => {
  it('uses terminal model order and preserves prototype actions', () => {
    class RunningTerminal {
      opened = 0;
      stopped = 0;
      icon(): string { return 'terminal-icon'; }
      label(): string { return 'terminals/7'; }
      open(): void { this.opened += 1; }
      shutdown(): void { this.stopped += 1; }
    }

    const item = new RunningTerminal();
    const terminalSignal = { emit: jest.fn() };
    const manager = {
      name: 'Terminais',
      runningChanged: terminalSignal,
      running: () => [item]
    } as unknown as IRunningSessions.IManager;
    const model = new PollingModel(async () => ({ terminals: [] }));
    model.lastSuccess = new Date('2026-08-27T00:00:00Z');
    model.statuses.set('7', {
      name: '7',
      title: 'training job',
      agent: 'codex',
      state: 'working'
    });

    decorateRunningManager(manager, model, terminalSignal, () => ['7']);
    const decorated = manager.running({ mode: 'list' })[0];
    decorated.open?.();
    decorated.shutdown?.();
    expect(item.opened).toBe(1);
    expect(item.stopped).toBe(1);
    expect(decorated.icon()).toContain('svg');
    const label = decorated.label() as React.ReactElement;
    const children = React.Children.toArray(label.props.children);
    expect(children[0]).toBe('◌ training job');
    const hidden = children[1] as React.ReactElement;
    expect(hidden.props.className).toBe('jp-CodexStatus-srOnly');
    expect(Array.isArray(hidden.props.children)).toBe(true);
    expect(hidden.props.children[0]).toContain('Codex working');
  });

  it('ignores managers that do not expose the terminal service signal', () => {
    const original = () => [];
    const otherSignal = { connect: jest.fn() };
    const manager = {
      name: 'Terminals',
      runningChanged: otherSignal,
      running: original
    } as unknown as IRunningSessions.IManager;
    const model = new PollingModel(async () => ({ terminals: [] }));
    decorateRunningManager(manager, model, { connect: jest.fn() }, () => []);
    expect(manager.running).toBe(original);
  });

  it('emits current models for entries that predate plugin activation', () => {
    const signal = { emit: jest.fn() };
    const manager = { runningChanged: signal } as unknown as IRunningSessions.IManager;
    const models = [{ name: 'existing' }];
    emitRunningChanged(manager, models);
    expect(signal.emit).toHaveBeenCalledWith(models);
  });
});

describe('tab accessibility', () => {
  it('copies the textual state into aria-label', () => {
    const tab = document.createElement('li');
    tab.dataset.codexAriaLabel = 'training job; Codex blocked; status may be stale';
    document.body.appendChild(tab);
    syncTabAriaLabels();
    expect(tab.getAttribute('aria-label')).toBe(
      'training job; Codex blocked; status may be stale'
    );
    tab.remove();
  });
});
