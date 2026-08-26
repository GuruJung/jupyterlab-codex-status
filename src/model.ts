export type AgentState = 'idle' | 'working' | 'blocked' | null;

export interface ITerminalStatus {
  name: string;
  title: string | null;
  agent: 'codex' | null;
  state: AgentState;
}

export interface ITerminalResponse {
  terminals: ITerminalStatus[];
}

export type StatusListener = (terminals: ReadonlyMap<string, ITerminalStatus>) => void;
type TimerHandle = ReturnType<typeof setTimeout>;
type Scheduler = (callback: () => void, delay: number) => TimerHandle;
type Canceller = (handle: TimerHandle) => void;

export class PollingModel {
  constructor(
    private readonly fetchStatuses: () => Promise<ITerminalResponse>,
    intervalMs = 1000,
    private readonly schedule: Scheduler = (callback, delay) => globalThis.setTimeout(callback, delay),
    private readonly cancel: Canceller = handle => globalThis.clearTimeout(handle)
  ) {
    this.intervalMs = PollingModel.clampInterval(intervalMs);
  }

  readonly statuses = new Map<string, ITerminalStatus>();
  lastSuccess: Date | null = null;
  stale = false;
  intervalMs: number;
  private listeners = new Set<StatusListener>();
  private timer: TimerHandle | null = null;
  private disposed = false;
  private failures = 0;
  private inFlight: Promise<void> | null = null;

  static clampInterval(value: number): number {
    if (!Number.isFinite(value)) {
      return 1000;
    }
    return Math.min(10000, Math.max(500, Math.round(value)));
  }

  setInterval(value: number): void {
    this.intervalMs = PollingModel.clampInterval(value);
  }

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (!this.disposed && this.timer === null) {
      void this.poll();
    }
  }

  async poll(): Promise<void> {
    if (this.disposed) {
      return;
    }
    if (this.inFlight !== null) {
      return this.inFlight;
    }
    this.inFlight = this.runPoll();
    try {
      await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async runPoll(): Promise<void> {
    try {
      const response = await this.fetchStatuses();
      this.statuses.clear();
      for (const terminal of response.terminals) {
        this.statuses.set(terminal.name, terminal);
      }
      this.lastSuccess = new Date();
      this.stale = false;
      this.failures = 0;
      this.notify();
      this.arm(this.intervalMs);
    } catch {
      this.stale = this.lastSuccess !== null;
      this.failures += 1;
      this.notify();
      const backoff = Math.min(30000, 1000 * 2 ** Math.min(this.failures - 1, 5));
      this.arm(backoff);
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) {
      this.cancel(this.timer);
      this.timer = null;
    }
    this.listeners.clear();
  }

  private arm(delay: number): void {
    if (this.disposed) {
      return;
    }
    if (this.timer !== null) {
      this.cancel(this.timer);
    }
    this.timer = this.schedule(() => {
      this.timer = null;
      void this.poll();
    }, delay);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.statuses);
    }
  }
}
