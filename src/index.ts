import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { ICommandPalette, InputDialog } from '@jupyterlab/apputils';
import { IRunningSessionManagers } from '@jupyterlab/running';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ITerminalTracker } from '@jupyterlab/terminal';

import { clearTerminalTitle, fetchTerminals, setTerminalTitle } from './api';
import { PollingModel } from './model';
import {
  decorateRunningManager,
  describe,
  emitRunningChanged,
  syncTabAriaLabels
} from './running';
import '../style/index.css';

const PLUGIN_ID = 'jupyterlab-codex-status:plugin';
const RENAME_COMMAND = 'jupyterlab-codex-status:rename-terminal';
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
    const terminalManager = app.serviceManager.terminals;
    const terminalNames = (): string[] => Array.from(terminalManager.running(), item => item.name);

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
          const codexAriaLabel = `${widget.title.label}; ${describe(status, model)}`;
          if (
            widget.title.dataset['codex-status'] !== codexStatus ||
            widget.title.dataset['codex-agent'] !== codexAgent ||
            widget.title.dataset['codex-aria-label'] !== codexAriaLabel
          ) {
            widget.title.dataset = {
              ...widget.title.dataset,
              'codex-status': codexStatus,
              'codex-agent': codexAgent,
              'codex-aria-label': codexAriaLabel
            };
            globalThis.requestAnimationFrame(() => syncTabAriaLabels());
          }
        });
        const nextSignature = JSON.stringify([
          model.stale,
          [...model.statuses.values()].map(status => [status.name, status.title, status.agent, status.state])
        ]);
        const runningChanged = nextSignature !== runningSignature;
        runningSignature = nextSignature;
        const currentTerminalModels = Array.from(terminalManager.running());
        for (const manager of runningManagers.items()) {
          decorateRunningManager(manager, model, terminalManager.runningChanged, terminalNames);
          if (runningChanged) {
            emitRunningChanged(manager, currentTerminalModels);
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
      decorateRunningManager(manager, model, terminalManager.runningChanged, terminalNames);
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
export { decorateRunningManager, emitRunningChanged, syncTabAriaLabels } from './running';
