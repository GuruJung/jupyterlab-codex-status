import { expect, test } from '@jupyterlab/galata';

test.use({ autoGoto: false });

test('loads the extension and authenticated terminal API', async ({ page }) => {
  page.on('console', message => console.log(`browser ${message.type()}: ${message.text()}`));
  page.on('pageerror', error => console.error(`browser pageerror: ${error.stack ?? error.message}`));
  await page.page.goto('http://127.0.0.1:8899/lab', { waitUntil: 'domcontentloaded' });
  await page.page.waitForSelector('#jp-main-dock-panel');
  const result = await page.page.evaluate(async () => {
    const response = await fetch('/jupyterlab-codex-status/api/v1/terminals');
    return { status: response.status, body: await response.json() };
  });
  expect(result.status).toBe(200);
  expect(Array.isArray(result.body.terminals)).toBe(true);
});

test('renames and clears a live terminal through the API', async ({ page }) => {
  await page.page.goto('http://127.0.0.1:8899/lab', { waitUntil: 'domcontentloaded' });
  await page.page.waitForSelector('#jp-main-dock-panel');
  const result = await page.page.evaluate(async () => {
    const created = await fetch('/api/terminals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    const terminal = (await created.json()) as { name: string };
    const titleUrl = `/jupyterlab-codex-status/api/v1/terminals/${encodeURIComponent(terminal.name)}/title`;
    try {
      const renamed = await fetch(titleUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '  training   job  ' })
      });
      const invalid = await fetch(titleUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'bad\nname' })
      });
      const listed = await fetch('/jupyterlab-codex-status/api/v1/terminals');
      const cleared = await fetch(titleUrl, { method: 'DELETE' });
      return {
        renamedStatus: renamed.status,
        renamedBody: await renamed.json(),
        invalidStatus: invalid.status,
        terminals: ((await listed.json()) as {
          terminals: Array<{
            name: string;
            title: string | null;
            agent: 'codex' | null;
            state: 'idle' | 'working' | 'blocked' | null;
          }>;
        }).terminals,
        clearedStatus: cleared.status,
        name: terminal.name
      };
    } finally {
      await fetch(`/api/terminals/${encodeURIComponent(terminal.name)}`, { method: 'DELETE' });
    }
  });
  expect(result.renamedStatus).toBe(200);
  expect(result.renamedBody.title).toBe('training job');
  expect(result.invalidStatus).toBe(400);
  const terminal = result.terminals.find(item => item.name === result.name);
  expect(terminal?.title).toBe('training job');
  expect(terminal?.agent).toBe('codex');
  expect(terminal?.state).toBe('idle');
  expect(result.clearedStatus).toBe(204);
});

test('updates the terminal tab and Running panel across Codex states', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('console', message => console.log(`browser ${message.type()}: ${message.text()}`));
  page.on('pageerror', error => {
    pageErrors.push(error.message);
    console.error(`browser pageerror: ${error.stack ?? error.message}`);
  });
  await page.page.goto('http://127.0.0.1:8899/lab', { waitUntil: 'domcontentloaded' });
  await page.page.waitForSelector('#jp-main-dock-panel');
  await page.page.getByRole('button', { name: 'New Launcher' }).click();
  await page.page.locator('.jp-LauncherCard', { hasText: 'Terminal' }).click();
  await page.page.waitForSelector('.jp-Terminal');

  await expect.poll(async () => {
    return page.page.evaluate(async () => {
      const response = await fetch('/jupyterlab-codex-status/api/v1/terminals');
      const body = (await response.json()) as { terminals: Array<{ name: string }> };
      return body.terminals[0]?.name ?? '';
    });
  }).toBeTruthy();

  const name = await page.page.evaluate(async () => {
    const response = await fetch('/jupyterlab-codex-status/api/v1/terminals');
    const body = (await response.json()) as { terminals: Array<{ name: string }> };
    return body.terminals[0].name;
  });
  await expect.poll(async () => page.page.evaluate(async ({ terminalName }) => {
    const response = await fetch('/jupyterlab-codex-status/api/v1/terminals');
    const body = (await response.json()) as {
      terminals: Array<{ name: string; title: string | null }>;
    };
    return body.terminals.find(item => item.name === terminalName)?.title ?? null;
  }, { terminalName: name })).toBe('fixture title');
  const titleUrl = `/jupyterlab-codex-status/api/v1/terminals/${encodeURIComponent(name)}/title`;
  await page.page.evaluate(async ({ url }) => {
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'training job' })
    });
    if (!response.ok) {
      throw new Error(`rename failed: ${response.status}`);
    }
  }, { url: titleUrl });
  await expect.poll(async () => page.page.evaluate(async ({ terminalName }) => {
    const response = await fetch('/jupyterlab-codex-status/api/v1/terminals');
    const body = (await response.json()) as {
      terminals: Array<{ name: string; title: string | null }>;
    };
    return body.terminals.find(item => item.name === terminalName)?.title ?? null;
  }, { terminalName: name })).toBe('training job');

  const currentState = async (): Promise<string | null> => {
    return page.page.evaluate(async ({ terminalName }) => {
      const response = await fetch('/jupyterlab-codex-status/api/v1/terminals');
      const body = (await response.json()) as {
        terminals: Array<{ name: string; state: string | null }>;
      };
      return body.terminals.find(item => item.name === terminalName)?.state ?? null;
    }, { terminalName: name });
  };
  const currentAgent = async (): Promise<string | null> => {
    return page.page.evaluate(async ({ terminalName }) => {
      const response = await fetch('/jupyterlab-codex-status/api/v1/terminals');
      const body = (await response.json()) as {
        terminals: Array<{ name: string; agent: string | null }>;
      };
      return body.terminals.find(item => item.name === terminalName)?.agent ?? null;
    }, { terminalName: name });
  };
  const tabIconGeometry = async (status: string): Promise<{
    width: number;
    height: number;
    centerDeltaX: number;
    centerDeltaY: number;
  }> => {
    const icon = status === 'none'
      ? page.page.locator(
        '.lm-DockPanel-tabBar .lm-TabBar-tab[data-codex-status="none"] .lm-TabBar-tabIcon > svg'
      )
      : page.page.locator(
        `.lm-DockPanel-tabBar .jp-CodexStatus-icon.jp-CodexStatus-${status} > svg`
      );
    return icon.evaluate(svg => {
      const container = svg.parentElement;
      if (!container || !svg) {
        throw new Error('terminal tab icon was not rendered');
      }
      const containerBox = container.getBoundingClientRect();
      const svgBox = svg.getBoundingClientRect();
      const svgStyle = getComputedStyle(svg);
      return {
        width: Number.parseFloat(svgStyle.width),
        height: Number.parseFloat(svgStyle.height),
        centerDeltaX: Math.abs(
          svgBox.left + svgBox.width / 2 - (containerBox.left + containerBox.width / 2)
        ),
        centerDeltaY: Math.abs(
          svgBox.top + svgBox.height / 2 - (containerBox.top + containerBox.height / 2)
        )
      };
    });
  };
  const expectAligned = (geometry: {
    width: number;
    height: number;
    centerDeltaX: number;
    centerDeltaY: number;
  }): void => {
    expect(geometry.width).toBe(14);
    expect(geometry.height).toBe(14);
    expect(geometry.centerDeltaX).toBeLessThanOrEqual(1);
    expect(geometry.centerDeltaY).toBeLessThanOrEqual(1);
  };

  await expect.poll(currentState).toBe('working');
  await expect(page.page.locator('.lm-TabBar-tabLabel', { hasText: 'training job' })).toBeVisible();
  const workingTabIcon = page.page.locator(
    '.lm-DockPanel-tabBar .jp-CodexStatus-icon.jp-CodexStatus-working > svg'
  );
  await expect(workingTabIcon).toBeVisible();
  expectAligned(await tabIconGeometry('working'));
  await expect.poll(async () => workingTabIcon.evaluate(element =>
    getComputedStyle(element).animationName
  )).toBe('jp-CodexStatus-spin');
  await page.page.getByRole('tab', { name: 'Running Terminals and Kernels' }).click();
  const terminalSection = page.page.getByRole('region', { name: 'Terminals Section', exact: true });
  const workingIcon = terminalSection.locator(
    '.jp-CodexStatus-working .jp-RunningSessions-icon'
  );
  await expect(workingIcon).toBeVisible();
  await expect.poll(async () => workingIcon.evaluate(element => getComputedStyle(element).animationName))
    .toBe('jp-CodexStatus-spin');

  await page.page.locator('.jp-Terminal').click();
  await page.page.keyboard.type('continue-to-blocked');
  await page.page.keyboard.press('Enter');

  await expect.poll(currentState).toBe('blocked');
  const blockedTabIcon = page.page.locator(
    '.lm-DockPanel-tabBar .jp-CodexStatus-icon.jp-CodexStatus-blocked > svg'
  );
  await expect(blockedTabIcon).toBeVisible();
  expectAligned(await tabIconGeometry('blocked'));
  await expect(blockedTabIcon.locator('polygon')).toHaveCount(0);
  await expect(blockedTabIcon.locator('circle')).toHaveCount(3);
  const blockedColors = await blockedTabIcon.evaluate(element => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--jp-info-color1)';
    document.body.appendChild(probe);
    const result = {
      actual: getComputedStyle(element).color,
      expected: getComputedStyle(probe).color
    };
    probe.remove();
    return result;
  });
  expect(blockedColors.actual).toBe(blockedColors.expected);
  await expect(page.page.locator('.lm-TabBar-tabLabel', { hasText: 'training job' })).toBeVisible();
  await expect(page.page.locator('.lm-TabBar-tab[data-codex-status="blocked"]'))
    .toHaveAttribute('aria-label', /Codex blocked/);

  await expect(terminalSection.locator('.jp-RunningSessions-itemLabel', { hasText: 'training job' }))
    .toBeVisible();
  await page.page.getByRole('button', { name: /Search Tabs and Running Sessions/ }).click();
  const searchDialog = page.page.locator('.jp-Dialog');
  await expect(searchDialog).toBeVisible();
  await searchDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.page.locator('.jp-Dialog')).toHaveCount(0);
  expect(pageErrors).toEqual([]);

  await page.page.locator('.jp-Terminal').click({ button: 'right' });
  await page.page.getByRole('menuitem', { name: 'Rename Terminal…' }).click();
  const dialogInput = page.page.locator('.jp-Dialog input');
  await dialogInput.fill('dialog title');
  await page.page.locator('.jp-Dialog-button.jp-mod-accept').click();
  await expect(page.page.locator('.lm-TabBar-tabLabel', { hasText: 'dialog title' })).toBeVisible();

  const runningItem = terminalSection.locator('.jp-RunningSessions-item', { hasText: 'dialog title' });
  await expect(runningItem.locator('.jp-CodexStatus-srOnly')).toContainText('Codex blocked');
  await runningItem.hover();
  const shutdownButton = runningItem.locator('.jp-RunningSessions-itemShutdown');
  await expect(shutdownButton).toBeVisible();

  await expect.poll(currentAgent, { timeout: 20000 }).toBe(null);
  await expect.poll(currentState, { timeout: 20000 }).toBe(null);
  const restoredTab = page.page.locator(
    '.lm-DockPanel-tabBar .lm-TabBar-tab[data-codex-agent="none"][data-codex-status="none"]',
    { hasText: 'dialog title' }
  );
  await expect(restoredTab).toBeVisible();
  await expect(restoredTab.locator('.jp-CodexStatus-icon')).toHaveCount(0);
  expectAligned(await tabIconGeometry('none'));
  await expect.poll(async () => restoredTab.locator(
    '.lm-TabBar-tabIcon > svg'
  ).evaluate(element => getComputedStyle(element).animationName)).toBe('none');

  await runningItem.hover();
  await expect(shutdownButton).toBeVisible();
  await shutdownButton.click();
  await expect.poll(async () => page.page.locator('.jp-Terminal').count()).toBe(0);
});
