import type { ITerminalTracker } from '@jupyterlab/terminal';
import { LabIcon } from '@jupyterlab/ui-components';

import type { AgentState } from './model';

export type TerminalTitle = NonNullable<ITerminalTracker['currentWidget']>['title'];
type CodexState = Exclude<AgentState, null>;

interface IIconSnapshot {
  icon: TerminalTitle['icon'];
  iconClass: string;
  iconLabel: string;
}

const IDLE_ICON = new LabIcon({
  name: 'jupyterlab-codex-status:idle',
  svgstr: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="currentColor"/></svg>'
}).bindprops({
  className: 'jp-CodexStatus-icon jp-CodexStatus-idle',
  stylesheet: 'mainAreaTab'
});

const WORKING_ICON = new LabIcon({
  name: 'jupyterlab-codex-status:working',
  svgstr: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 2a6 6 0 1 1-5.2 3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M1 2v4h4" fill="none" stroke="currentColor" stroke-width="2"/></svg>'
}).bindprops({
  className: 'jp-CodexStatus-icon jp-CodexStatus-working',
  stylesheet: 'mainAreaTab'
});

const BLOCKED_ICON = new LabIcon({
  name: 'jupyterlab-codex-status:blocked',
  svgstr: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2 2.5h12v8H7l-3.5 3v-3H2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="5" cy="6.5" r="1" fill="currentColor"/><circle cx="8" cy="6.5" r="1" fill="currentColor"/><circle cx="11" cy="6.5" r="1" fill="currentColor"/></svg>'
}).bindprops({
  className: 'jp-CodexStatus-icon jp-CodexStatus-blocked',
  stylesheet: 'mainAreaTab'
});

export const CODEX_STATE_ICONS: Record<CodexState, LabIcon> = {
  idle: IDLE_ICON,
  working: WORKING_ICON,
  blocked: BLOCKED_ICON
};

const ICON_LABELS: Record<CodexState, string> = {
  idle: 'Codex idle',
  working: 'Codex working',
  blocked: 'Codex waiting for user input'
};

export class TerminalIconController {
  private readonly originals = new WeakMap<TerminalTitle, IIconSnapshot>();

  update(title: TerminalTitle, state: CodexState | null): void {
    if (state !== null) {
      if (!this.originals.has(title)) {
        this.originals.set(title, {
          icon: title.icon,
          iconClass: title.iconClass,
          iconLabel: title.iconLabel
        });
      }
      title.icon = CODEX_STATE_ICONS[state];
      title.iconClass = `jp-CodexStatus-icon jp-CodexStatus-${state}`;
      title.iconLabel = ICON_LABELS[state];
      return;
    }

    const original = this.originals.get(title);
    if (!original) {
      return;
    }
    title.icon = original.icon;
    title.iconClass = original.iconClass;
    title.iconLabel = original.iconLabel;
    this.originals.delete(title);
  }
}
