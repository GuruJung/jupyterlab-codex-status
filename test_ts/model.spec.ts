import { PollingModel } from '../src/model';

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
