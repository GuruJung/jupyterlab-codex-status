import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { ICommandPalette, InputDialog } from '@jupyterlab/apputils';
import { IRunningSessionManagers, IRunningSessions } from '@jupyterlab/running';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ITerminalTracker } from '@jupyterlab/terminal';

import { clearTerminalTitle, fetchTerminals, setTerminalTitle } from './api';
import { ITerminalStatus, PollingModel } from './model';
import '../style/index.css';

const PLUGIN_ID = 'jupyterlab-codex-status:plugin';
const RENAME_COMMAND = 'jupyterlab-codex-status:rename-terminal';
const STATE_ICONS: Record<'idle' | 'working' | 'blocked', string> = {
  idle: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"%3E%3Ccircle cx="8" cy="8" r="5" fill="%232ca02c"/%3E%3C/svg%3E',
  working: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"%3E%3Cpath d="M8 2a6 6 0 1 1-5.2 3" fill="none" stroke="%23d99b00" stroke-width="2"/%3E%3Cpath d="M1 2v4h4" fill="none" stroke="%23d99b00" stroke-width="2"/%3E%3C/svg%3E',
  blocked: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"%3E%3Cpath d="M8 1 15 14H1Z" fill="%23d62728"/%3E%3Cpath d="M8 5v5M8 12v1" stroke="white"/%3E%3C/svg%3E'
};

function glyph(status: ITerminalStatus): string {
  if (status.agent !== 'codex') {
    return '';
  }
  return status.state === 'idle' ? '●' : status.state === 'working' ? '◌' : status.state === 'blocked' ? '⚠' : '';
}

function describe(status: ITerminalStatus, model: PollingModel): string {
  const state = status.agent === 'codex' ? `Codex ${status.state ?? 'unknown'}` : 'Terminal';
  const updated = model.lastSuccess ? model.lastSuccess.toLocaleTimeString() : 'not updated yet';
  const stale = model.stale ? '; connection failed, status may be stale' : '';
  return `${state}; last updated ${updated}${stale}`;
}

function decorateRunningManager(manager: IRunningSessions.IManager, model: PollingModel): void {
  const wrapped = manager as IRunningSessions.IManager & {
    __codexStatusWrapped?: boolean;
    __codexStatusHasArgs?: boolean;
    __codexStatusLastArgs?: unknown;
  };
  if (!/terminal/i.test(manager.name) || wrapped.__codexStatusWrapped) {
    return;
  }
  manager.runningChanged.connect((_sender, args) => {
    wrapped.__codexStatusHasArgs = true;
    wrapped.__codexStatusLastArgs = args;
  });
  const original = manager.running.bind(manager);
  manager.running = options => {
    return original(options).map(item => {
      const originalLabel = item.label;
      const originalTitle = item.labelTitle;
      const rendered = originalLabel.call(item);
      const text = typeof rendered === 'string' ? rendered : '';
      const name = text.replace(/^Terminal\s+/, '');
      const status = model.statuses.get(name);
      if (!status) {
        return item;
      }
      return {
        ...item,
        className: `${item.className ?? ''} jp-CodexStatus-${status.state ?? 'unknown'}`.trim(),
        icon: () => status.state ? STATE_ICONS[status.state] : item.icon.call(item),
        label: () => `${glyph(status)} ${status.title ?? text}`.trim(),
        labelTitle: () => `${originalTitle?.call(item) ?? text}; ${describe(status, model)}`
      };
    });
  };
  wrapped.__codexStatusWrapped = true;
}

function emitRunningChanged(manager: IRunningSessions.IManager): void {
  const wrapped = manager as IRunningSessions.IManager & {
    __codexStatusHasArgs?: boolean;
    __codexStatusLastArgs?: unknown;
  };
  if (!wrapped.__codexStatusHasArgs) {
    return;
  }
  const signal = manager.runningChanged as unknown as { emit?: (args: unknown) => void };
  if (signal.emit) {
    signal.emit.call(signal, wrapped.__codexStatusLastArgs);
  }
}

const plugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description: 'Show Codex state and custom terminal names.',
  autoStart: true,
  requires: [ITerminalTracker, ICommandPalette, IRunningSessionManagers],
  optional: [ISettingRegistry],
  activate: async (
    app: JupyterFrontEnd,
    tracker: ITerminalTracker,
    palette: ICommandPalette,
    runningManagers: IRunningSessionManagers,
    settingsRegistry: ISettingRegistry | null
  ): Promise<void> => {
    const model = new PollingModel(fetchTerminals);
    const defaultIconClasses = new WeakMap<object, string>();

    if (settingsRegistry) {
      try {
        const settings = await settingsRegistry.load(PLUGIN_ID);
        const applySettings = (): void => {
          model.setInterval(Number(settings.get('pollIntervalMs').composite));
        };
        applySettings();
        settings.changed.connect(applySettings);
      } catch (error) {
        console.warn('jupyterlab-codex-status: settings unavailable', error);
      }
    }

    let runningSignature = '';
    let updating = false;
    const update = (): void => {
      if (updating) {
        return;
      }
      updating = true;
      try {
        tracker.forEach(widget => {
          const name = widget.content.session.name;
          const status = model.statuses.get(name);
          if (!status) {
            return;
          }
          if (!defaultIconClasses.has(widget)) {
            defaultIconClasses.set(widget, widget.title.iconClass);
          }
          widget.title.label = status.title ?? `Terminal ${name}`;
          widget.title.caption = `${widget.title.label}; ${describe(status, model)}`;
          widget.title.iconClass = status.agent === 'codex' && status.state
            ? `jp-CodexStatus-icon jp-CodexStatus-${status.state}`
            : (defaultIconClasses.get(widget) ?? '');
          const codexStatus = status.state ?? 'none';
          const codexAgent = status.agent ?? 'none';
          if (
            widget.title.dataset.codexStatus !== codexStatus ||
            widget.title.dataset.codexAgent !== codexAgent
          ) {
            widget.title.dataset = { ...widget.title.dataset, codexStatus, codexAgent };
          }
        });
        const nextSignature = JSON.stringify([
          model.stale,
          [...model.statuses.values()].map(status => [status.name, status.title, status.agent, status.state])
        ]);
        const runningChanged = nextSignature !== runningSignature;
        runningSignature = nextSignature;
        for (const manager of runningManagers.items()) {
          decorateRunningManager(manager, model);
          if (runningChanged) {
            emitRunningChanged(manager);
          }
        }
      } finally {
        updating = false;
      }
    };
    model.subscribe(update);
    tracker.widgetAdded.connect((_sender, widget) => {
      widget.title.changed.connect(update);
      update();
    });
    runningManagers.added.connect((_sender, manager) => {
      decorateRunningManager(manager, model);
    });

    app.commands.addCommand(RENAME_COMMAND, {
      label: 'Rename Terminal…',
      isEnabled: () => tracker.currentWidget !== null,
      execute: async () => {
        const widget = tracker.currentWidget;
        if (!widget) {
          return;
        }
        const name = widget.content.session.name;
        const current = model.statuses.get(name)?.title ?? '';
        const result = await InputDialog.getText({
          title: `Rename Terminal ${name}`,
          text: current,
          placeholder: 'Empty clears the custom title'
        });
        if (!result.button.accept || result.value === null) {
          return;
        }
        if (result.value.trim()) {
          await setTerminalTitle(name, result.value);
        } else {
          await clearTerminalTitle(name);
        }
        await model.poll();
      }
    });
    palette.addItem({ command: RENAME_COMMAND, category: 'Terminal' });
    app.contextMenu.addItem({ command: RENAME_COMMAND, selector: '.jp-Terminal', rank: 10 });

    model.start();
  }
};

export default plugin;
export { PollingModel } from './model';
