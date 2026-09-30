import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { setImmediate } from 'node:timers';
import { test } from 'node:test';
import * as vm from 'node:vm';
import * as ts from 'typescript';

type Point = {
  x: number;
  y: number;
};

type Bounds = Point & {
  width: number;
  height: number;
};

type DisplayLike = {
  id: number;
  bounds: Bounds;
  scaleFactor: number;
};

type Rect = Point & {
  w: number;
  h: number;
  windowId?: number;
};

type SelectionResult =
  { kind: 'selected'; rect: Rect } |
  { kind: 'canceled' };

type WindowInfoLike = Point & {
  id: number;
  name: string;
  w: number;
  h: number;
};

type SenderEvent = {
  sender: MockWebContents;
};

type SentMessage = {
  channel: string;
  args: unknown[];
};

type BrowserWindowOptions = Partial<Bounds> & {
  [key: string]: unknown;
};

type Listener = (...args: unknown[]) => void;
type Handler = (...args: unknown[]) => unknown;

type ListenerEntry = {
  listener: Listener;
  once: boolean;
};

type IpcMainMock = {
  on(channel: string, listener: Listener): IpcMainMock;
  once(channel: string, listener: Listener): IpcMainMock;
  removeListener(channel: string, listener: Listener): IpcMainMock;
  removeAllListeners(channel: string): IpcMainMock;
  handle(channel: string, handler: Handler): void;
  handleOnce(channel: string, handler: Handler): void;
  removeHandler(channel: string): void;
  emit(channel: string, ...args: unknown[]): boolean;
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  listenerCount(channel: string): number;
  hasHandler(channel: string): boolean;
};

type TimerCallback = (...args: unknown[]) => void;

type TimerRecord = {
  callback: TimerCallback;
  delay: number | undefined;
  args: unknown[];
  cleared: boolean;
};

type ElementAtProviderMock = (event: SenderEvent, x: number, y: number) => WindowInfoLike | null;

type LoadSelectionOverlayOptions = {
  displays?: DisplayLike[];
  cursor?: Point;
  windows?: WindowInfoLike[];
  elementAt?: (x: number, y: number) => WindowInfoLike | null;
};

type SelectionOverlayManagerLike = {
  show(): Promise<SelectionResult>;
  stop(): void;
};

type SelectionOverlayModule = {
  SelectionOverlayManager: new () => SelectionOverlayManagerLike;
};

type LoadedSelectionOverlay = {
  SelectionOverlayManager: new () => SelectionOverlayManagerLike;
  backgroundCalls: Array<{
    win: MockBrowserWindow;
    display: DisplayLike;
    logPerf: boolean | undefined;
  }>;
  displays: DisplayLike[];
  elementAtProvider: ElementAtProviderMock | null;
  intervals: TimerRecord[];
  timeouts: TimerRecord[];
  ipcMain: IpcMainMock;
  pressEscape(): void;
  setCursor(point: Point): void;
  setWindows(nextWindows: WindowInfoLike[]): void;
  stopTimers(): void;
  runTimeouts(delay: number): Promise<void>;
  stopped: boolean;
  windows: MockBrowserWindow[];
};

const repoRoot = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(repoRoot, 'src/main/windows/selectionOverlay.ts');

const DISPLAYS: DisplayLike[] = [
  { id: 1, bounds: { x: -1280, y: 0, width: 1280, height: 720 }, scaleFactor: 1 },
  { id: 2, bounds: { x: 0, y: 0, width: 1440, height: 900 }, scaleFactor: 2 },
  { id: 3, bounds: { x: 1440, y: -320, width: 1024, height: 768 }, scaleFactor: 1.5 },
];

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function plain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function pointInBounds(point: Point, bounds: Bounds): boolean {
  return (
    point.x >= bounds.x &&
    point.x < bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y < bounds.y + bounds.height
  );
}

function displayForPoint(displays: DisplayLike[], point: Point): DisplayLike {
  return displays.find((display) => pointInBounds(point, display.bounds)) ?? displays[0];
}

function isSelectionOverlayModule(value: unknown): value is SelectionOverlayModule {
  return (
    typeof value === 'object' &&
    value !== null &&
    'SelectionOverlayManager' in value &&
    typeof value.SelectionOverlayManager === 'function'
  );
}

function numberOption(options: BrowserWindowOptions, key: keyof Bounds): number {
  const value = options[key];
  if (typeof value !== 'number') {
    throw new TypeError(`BrowserWindow option ${key} must be numeric`);
  }
  return value;
}

function expectNoIpcReturn(value: unknown): void {
  assert.equal(value, undefined);
}

class MockWebContents extends EventEmitter {
  readonly owner: MockBrowserWindow;
  readonly sent: SentMessage[] = [];
  focusCalls = 0;

  constructor(owner: MockBrowserWindow) {
    super();
    this.owner = owner;
  }

  send(channel: string, ...args: unknown[]): void {
    this.sent.push({ channel, args });
  }

  focus(): void {
    this.focusCalls += 1;
  }
}

class MockBrowserWindow extends EventEmitter {
  static instances: MockBrowserWindow[] = [];

  readonly options: BrowserWindowOptions;
  readonly webContents: MockWebContents;
  bounds: Bounds;
  destroyed = false;
  closeCalls = 0;
  focusCalls = 0;
  showCalls = 0;
  showInactiveCalls = 0;
  alwaysOnTopCalls = 0;
  allWorkspacesCalls = 0;
  opacity = 1;
  ignoreMouseEvents = false;

  static reset(): void {
    MockBrowserWindow.instances = [];
  }

  constructor(options: BrowserWindowOptions) {
    super();
    this.options = structuredClone(options);
    this.bounds = {
      x: numberOption(options, 'x'),
      y: numberOption(options, 'y'),
      width: numberOption(options, 'width'),
      height: numberOption(options, 'height'),
    };
    this.webContents = new MockWebContents(this);
    MockBrowserWindow.instances.push(this);
  }

  setIgnoreMouseEvents(value: boolean): void {
    this.ignoreMouseEvents = value;
  }

  setOpacity(value: number): void {
    this.opacity = value;
  }

  showInactive(): void {
    this.showInactiveCalls += 1;
  }

  show(): void {
    this.showCalls += 1;
  }

  focus(): void {
    this.focusCalls += 1;
  }

  setBounds(bounds: Bounds): void {
    this.bounds = { ...bounds };
  }

  setAlwaysOnTop(_flag: boolean, _level?: string): void {
    this.alwaysOnTopCalls += 1;
  }

  setVisibleOnAllWorkspaces(_flag: boolean, _options?: Record<string, unknown>): void {
    this.allWorkspacesCalls += 1;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  close(): void {
    this.closeCalls += 1;
    if (this.destroyed) return;
    this.destroyed = true;
    this.emit('closed');
  }
}

function createIpcMain(): IpcMainMock {
  const listeners = new Map<string, ListenerEntry[]>();
  const handlers = new Map<string, { handler: Handler; once: boolean }>();

  const getListeners = (channel: string): ListenerEntry[] => {
    const current = listeners.get(channel);
    if (current) return current;
    const next: ListenerEntry[] = [];
    listeners.set(channel, next);
    return next;
  };

  const ipcMain: IpcMainMock = {
    on(channel: string, listener: Listener): IpcMainMock {
      getListeners(channel).push({ listener, once: false });
      return this;
    },
    once(channel: string, listener: Listener): IpcMainMock {
      getListeners(channel).push({ listener, once: true });
      return this;
    },
    removeListener(channel: string, listener: Listener): IpcMainMock {
      const next = getListeners(channel).filter((entry) => entry.listener !== listener);
      listeners.set(channel, next);
      return this;
    },
    removeAllListeners(channel: string): IpcMainMock {
      listeners.set(channel, []);
      return this;
    },
    handle(channel: string, handler: Handler): void {
      handlers.set(channel, { handler, once: false });
    },
    handleOnce(channel: string, handler: Handler): void {
      handlers.set(channel, { handler, once: true });
    },
    removeHandler(channel: string): void {
      handlers.delete(channel);
    },
    emit(channel: string, ...args: unknown[]): boolean {
      const current = [...getListeners(channel)];
      for (const entry of current) {
        entry.listener(...args);
        if (entry.once) this.removeListener(channel, entry.listener);
      }
      return current.length > 0;
    },
    invoke(channel: string, ...args: unknown[]): Promise<unknown> {
      const entry = handlers.get(channel);
      if (!entry) return Promise.reject(new Error(`No handler registered for ${channel}`));
      if (entry.once) handlers.delete(channel);
      return Promise.resolve(entry.handler(...args));
    },
    listenerCount(channel: string): number {
      return getListeners(channel).length;
    },
    hasHandler(channel: string): boolean {
      return handlers.has(channel);
    },
  };

  return ipcMain;
}

function loadSelectionOverlay({
  displays = DISPLAYS,
  cursor = { x: 10, y: 10 },
  windows = [],
  elementAt = undefined,
}: LoadSelectionOverlayOptions = {}): LoadedSelectionOverlay {
  MockBrowserWindow.reset();

  const ipcMain = createIpcMain();
  const backgroundCalls: LoadedSelectionOverlay['backgroundCalls'] = [];
  const registeredShortcuts = new Map<string, () => void>();
  const timeouts: TimerRecord[] = [];
  const intervals: TimerRecord[] = [];
  const accessibilityPermissionChecks: boolean[] = [];
  const logEntries: Array<{ level: string; args: unknown[] }> = [];
  let stopped = false;
  let cursorPoint = { ...cursor };
  let windowsList = windows;
  let elementAtProvider: ElementAtProviderMock | null = null;
  let spaceUnsubscribeCalls = 0;

  const screen = {
    getCursorScreenPoint(): Point {
      return { ...cursorPoint };
    },
    getDisplayNearestPoint(point: Point): DisplayLike {
      return displayForPoint(displays, point);
    },
    getAllDisplays(): DisplayLike[] {
      return displays;
    },
  };

  const moduleMocks: Record<string, unknown> = {
    'electron': {
      BrowserWindow: MockBrowserWindow,
      globalShortcut: {
        register(accelerator: string, callback: () => void): boolean {
          registeredShortcuts.set(accelerator, callback);
          return true;
        },
        unregister(accelerator: string): void {
          registeredShortcuts.delete(accelerator);
        },
      },
      ipcMain,
      Notification: class {
        readonly options: unknown;
        shown = false;

        constructor(options: unknown) {
          this.options = options;
        }

        show(): void {
          this.shown = true;
        }
      },
      screen,
    },
    'electron-log/main': {
      info(...args: unknown[]): void {
        logEntries.push({ level: 'info', args });
      },
      warn(...args: unknown[]): void {
        logEntries.push({ level: 'warn', args });
      },
      error(...args: unknown[]): void {
        logEntries.push({ level: 'error', args });
      },
    },
    './common': {
      clearElementAtProvider(provider: ElementAtProviderMock): void {
        if (elementAtProvider === provider) elementAtProvider = null;
      },
      loadRendererPage(): Promise<void> {
        return Promise.resolve();
      },
      preloadPath(): string {
        return '/mock/preload.js';
      },
      setElementAtProvider(provider: ElementAtProviderMock): void {
        elementAtProvider = provider;
      },
    },
    '../capture/displaySnapshot': {
      sendBackgroundSnapshot(
        win: MockBrowserWindow,
        display: DisplayLike,
        logPerf?: boolean,
      ): Promise<void> {
        backgroundCalls.push({ win, display, logPerf });
        return Promise.resolve();
      },
    },
    '../windowsInfo': {
      ensureAccessibilityPermission(prompt?: boolean): boolean {
        accessibilityPermissionChecks.push(prompt === true);
        return true;
      },
      getDockItems(): WindowInfoLike[] {
        return [];
      },
      getElementBoundsAtPoint(x: number, y: number): WindowInfoLike | null {
        return elementAt ? elementAt(x, y) : null;
      },
      listWindows(): Promise<WindowInfoLike[]> {
        return Promise.resolve(windowsList);
      },
      onSpaceChange(_callback: () => void): () => void {
        return (): void => {
          spaceUnsubscribeCalls += 1;
        };
      },
    },
    '../i18n/strings': {
      tMain(): unknown {
        return {
          accessibility: {
            title: 'Accessibility',
            selectionBody: 'Selection needs accessibility',
          },
        };
      },
    },
  };

  const source = fs.readFileSync(sourcePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;

  const moduleObject = { exports: {} as Record<string, unknown> };
  const sandbox = {
    Buffer,
    console,
    exports: moduleObject.exports,
    module: moduleObject,
    process,
    require(id: string): unknown {
      if (Object.hasOwn(moduleMocks, id)) return moduleMocks[id];
      throw new Error(`Unexpected module dependency in selectionOverlay test: ${id}`);
    },
    setImmediate,
    clearImmediate,
    setTimeout(callback: TimerCallback, delay?: number, ...args: unknown[]): TimerRecord {
      const timer = { callback, delay, args, cleared: false };
      timeouts.push(timer);
      return timer;
    },
    clearTimeout(timer?: TimerRecord): void {
      if (timer) timer.cleared = true;
    },
    setInterval(callback: TimerCallback, delay?: number, ...args: unknown[]): TimerRecord {
      const timer = { callback, delay, args, cleared: false };
      intervals.push(timer);
      return timer;
    },
    clearInterval(timer?: TimerRecord): void {
      if (timer) timer.cleared = true;
    },
  };

  vm.runInNewContext(transpiled, sandbox, { filename: sourcePath });

  if (!isSelectionOverlayModule(moduleObject.exports)) {
    throw new TypeError('selectionOverlay module did not export SelectionOverlayManager');
  }

  return {
    SelectionOverlayManager: moduleObject.exports.SelectionOverlayManager,
    backgroundCalls,
    displays,
    get elementAtProvider(): ElementAtProviderMock | null {
      return elementAtProvider;
    },
    get intervals(): TimerRecord[] {
      return intervals;
    },
    get timeouts(): TimerRecord[] {
      return timeouts;
    },
    ipcMain,
    pressEscape(): void {
      const callback = registeredShortcuts.get('Escape');
      if (typeof callback !== 'function') {
        throw new TypeError('Escape shortcut should be registered');
      }
      callback();
    },
    setCursor(point: Point): void {
      cursorPoint = { ...point };
    },
    setWindows(nextWindows: WindowInfoLike[]): void {
      windowsList = nextWindows;
    },
    stopTimers(): void {
      stopped = true;
      for (const timer of timeouts) timer.cleared = true;
      for (const timer of intervals) timer.cleared = true;
      if (spaceUnsubscribeCalls < 0) throw new Error('unreachable unsubscribe counter state');
    },
    runTimeouts(delay: number): Promise<void> {
      for (const timer of timeouts) {
        if (!timer.cleared && timer.delay === delay) {
          timer.cleared = true;
          timer.callback(...timer.args);
        }
      }
      return flushPromises();
    },
    get stopped(): boolean {
      return stopped;
    },
    windows: MockBrowserWindow.instances,
  };
}

function findWindowForDisplay(
  windows: MockBrowserWindow[],
  display: DisplayLike,
): MockBrowserWindow | undefined {
  return windows.find((win) => (
    win.bounds.x === display.bounds.x &&
    win.bounds.y === display.bounds.y &&
    win.bounds.width === display.bounds.width &&
    win.bounds.height === display.bounds.height
  ));
}

function senderEvent(win: MockBrowserWindow): SenderEvent {
  return { sender: win.webContents };
}

function ready(ipcMain: IpcMainMock, win: MockBrowserWindow): void {
  ipcMain.emit('capture:ready', senderEvent(win));
}

function windowsPayload(win: MockBrowserWindow): unknown {
  const sent = win.webContents.sent.filter((entry) => entry.channel === 'capture:windows');
  assert.ok(sent.length > 0, 'expected capture:windows payload');
  const last = sent.at(-1);
  assert.ok(last);
  return last.args[0];
}

function select(
  ipcMain: IpcMainMock,
  win: MockBrowserWindow,
  rect: Rect,
): Promise<void> {
  return ipcMain.invoke('capture:region', senderEvent(win), rect).then(expectNoIpcReturn);
}

test('show creates one overlay window per display using display DIP bounds', async () => {
  const harness = loadSelectionOverlay();
  const manager = new harness.SelectionOverlayManager();

  const resultPromise = manager.show();
  const visibleWindows = harness.windows.filter((win) => !win.destroyed);

  assert.equal(visibleWindows.length, DISPLAYS.length);
  for (const display of DISPLAYS) {
    const win = findWindowForDisplay(visibleWindows, display);
    assert.ok(win, `missing overlay for display ${display.id}`);
    assert.deepEqual(plain(win.bounds), display.bounds);
    assert.deepEqual(
      {
        x: win.options.x,
        y: win.options.y,
        width: win.options.width,
        height: win.options.height,
      },
      display.bounds,
      'BrowserWindow should use Electron DIP bounds without scale multiplication',
    );
  }

  for (const win of visibleWindows) ready(harness.ipcMain, win);
  const target = findWindowForDisplay(visibleWindows, DISPLAYS[1]);
  assert.ok(target);
  await select(
    harness.ipcMain,
    target,
    { x: 1, y: 2, w: 3, h: 4 },
  );
  await resultPromise;
});

test('selected rect is translated from sender window local coordinates to global display coordinates', async () => {
  const harness = loadSelectionOverlay();
  const manager = new harness.SelectionOverlayManager();

  const resultPromise = manager.show();
  const target = findWindowForDisplay(harness.windows, DISPLAYS[2]);
  assert.ok(target);

  const rect = { x: 20, y: 30, w: 100, h: 80 };
  await select(harness.ipcMain, target, rect);
  const result = await resultPromise;

  assert.deepEqual(plain(result), {
    kind: 'selected',
    rect: {
      ...rect,
      x: DISPLAYS[2].bounds.x + rect.x,
      y: DISPLAYS[2].bounds.y + rect.y,
    },
  });
});

test('regular selected rect is clamped to the sender display bounds', async () => {
  const harness = loadSelectionOverlay();
  const manager = new harness.SelectionOverlayManager();

  const resultPromise = manager.show();
  const target = findWindowForDisplay(harness.windows, DISPLAYS[1]);
  assert.ok(target);

  await select(harness.ipcMain, target, { x: -20, y: -30, w: 2000, h: 1000 });
  const result = await resultPromise;

  assert.deepEqual(plain(result), {
    kind: 'selected',
    rect: { x: 0, y: 0, w: 1440, h: 900 },
  });
});

test('windows payload and element-at results are translated into each sender window coordinate space', async () => {
  const globalWindow = { id: 99, name: 'Left App', x: -1260, y: 12, w: 300, h: 200 };
  const harness = loadSelectionOverlay({
    windows: [globalWindow],
    elementAt(x: number, y: number): WindowInfoLike {
      assert.equal(x, DISPLAYS[0].bounds.x + 40);
      assert.equal(y, DISPLAYS[0].bounds.y + 50);
      return { x: -1240, y: 20, w: 90, h: 40, name: 'Button', id: 100 };
    },
  });
  const manager = new harness.SelectionOverlayManager();

  const resultPromise = manager.show();
  const left = findWindowForDisplay(harness.windows, DISPLAYS[0]);
  assert.ok(left);

  ready(harness.ipcMain, left);
  await harness.runTimeouts(150);
  await flushPromises();

  assert.deepEqual(plain(windowsPayload(left)), [
    {
      ...globalWindow,
      x: globalWindow.x - DISPLAYS[0].bounds.x,
      y: globalWindow.y - DISPLAYS[0].bounds.y,
    },
  ]);

  const elementAtProvider = harness.elementAtProvider;
  if (!elementAtProvider) {
    throw new TypeError('element-at provider should be registered');
  }
  assert.deepEqual(plain(elementAtProvider(senderEvent(left), 40, 50)), {
    x: 40,
    y: 20,
    w: 90,
    h: 40,
    name: 'Button',
  });

  await select(harness.ipcMain, left, { x: 1, y: 1, w: 2, h: 2 });
  await resultPromise;
});

test('selecting from any overlay settles once and closes every overlay exactly once', async () => {
  const harness = loadSelectionOverlay();
  const manager = new harness.SelectionOverlayManager();

  const resultPromise = manager.show();
  const visibleWindows = [...harness.windows];
  const selectedFrom = findWindowForDisplay(visibleWindows, DISPLAYS[0]);
  assert.ok(selectedFrom);

  await select(harness.ipcMain, selectedFrom, { x: 10, y: 11, w: 12, h: 13 });
  const result = await resultPromise;

  assert.deepEqual(plain(result), {
    kind: 'selected',
    rect: { x: -1270, y: 11, w: 12, h: 13 },
  });
  assert.equal(visibleWindows.length, DISPLAYS.length);
  for (const win of visibleWindows) {
    assert.equal(win.closeCalls, 1);
    assert.equal(win.isDestroyed(), true);
  }
  await assert.rejects(
    () => select(harness.ipcMain, selectedFrom, { x: 1, y: 1, w: 1, h: 1 }),
    /No handler registered/,
  );
});

test('cancel ignores unrelated senders, while active sender cancel and Escape settle the session', async () => {
  const harness = loadSelectionOverlay();
  const manager = new harness.SelectionOverlayManager();

  const firstResult = manager.show();
  const active = findWindowForDisplay(harness.windows, DISPLAYS[1]);
  assert.ok(active);
  const standby = new MockBrowserWindow({ x: 0, y: 0, width: 1, height: 1 });

  harness.ipcMain.emit('capture:cancel', senderEvent(standby));
  assert.equal(harness.windows.filter((win) => !win.destroyed).length, DISPLAYS.length + 1);

  harness.ipcMain.emit('capture:cancel', senderEvent(active));
  assert.deepEqual(plain(await firstResult), { kind: 'canceled' });

  const secondResult = manager.show();
  harness.pressEscape();
  assert.deepEqual(plain(await secondResult), { kind: 'canceled' });
});

test('duplicate show returns canceled without replacing the active session; stop and next session are clean', async () => {
  const harness = loadSelectionOverlay();
  const manager = new harness.SelectionOverlayManager();

  const firstResult = manager.show();
  const firstWindows = [...harness.windows];
  assert.deepEqual(plain(await manager.show()), { kind: 'canceled' });
  assert.deepEqual(firstWindows, harness.windows);

  manager.stop();
  assert.deepEqual(plain(await firstResult), { kind: 'canceled' });
  for (const win of firstWindows) {
    assert.equal(win.closeCalls, 1);
    assert.equal(win.isDestroyed(), true);
  }

  const freshManager = new harness.SelectionOverlayManager();
  const thirdResult = freshManager.show();
  const thirdWindows = harness.windows.slice(firstWindows.length);
  assert.equal(thirdWindows.length, DISPLAYS.length);
  await select(harness.ipcMain, thirdWindows[0], { x: 2, y: 3, w: 4, h: 5 });
  assert.equal((await thirdResult).kind, 'selected');
});

test('ready from standby sender does not activate or feed the active session', async () => {
  const harness = loadSelectionOverlay({
    windows: [{ id: 1, name: 'Real', x: 5, y: 6, w: 7, h: 8 }],
  });
  const manager = new harness.SelectionOverlayManager();

  const resultPromise = manager.show();
  const active = findWindowForDisplay(harness.windows, DISPLAYS[1]);
  assert.ok(active);
  const standby = new MockBrowserWindow({ x: 0, y: 0, width: 1, height: 1 });

  ready(harness.ipcMain, standby);
  await flushPromises();
  assert.equal(active.webContents.sent.filter((entry) => entry.channel === 'capture:windows').length, 0);

  ready(harness.ipcMain, active);
  await harness.runTimeouts(150);
  await flushPromises();
  assert.equal(active.webContents.sent.filter((entry) => entry.channel === 'capture:windows').length, 1);

  await select(harness.ipcMain, active, { x: 3, y: 4, w: 5, h: 6 });
  await resultPromise;
});
