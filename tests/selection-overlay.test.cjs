/* eslint-disable @stylistic/quote-props */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-restricted-syntax, require-await */
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(repoRoot, 'src/main/windows/selectionOverlay.ts');

const DISPLAYS = [
  { id: 1, bounds: { x: -1280, y: 0, width: 1280, height: 720 }, scaleFactor: 1 },
  { id: 2, bounds: { x: 0, y: 0, width: 1440, height: 900 }, scaleFactor: 2 },
  { id: 3, bounds: { x: 1440, y: -320, width: 1024, height: 768 }, scaleFactor: 1.5 },
];

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function pointInBounds(point, bounds) {
  return (
    point.x >= bounds.x &&
    point.x < bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y < bounds.y + bounds.height
  );
}

function displayForPoint(displays, point) {
  return displays.find((display) => pointInBounds(point, display.bounds)) ?? displays[0];
}

class MockWebContents extends EventEmitter {
  constructor(owner) {
    super();
    this.owner = owner;
    this.sent = [];
    this.focusCalls = 0;
  }

  send(channel, ...args) {
    this.sent.push({ channel, args });
  }

  focus() {
    this.focusCalls += 1;
  }
}

class MockBrowserWindow extends EventEmitter {
  static instances = [];

  static reset() {
    MockBrowserWindow.instances = [];
  }

  constructor(options) {
    super();
    this.options = structuredClone(options);
    this.bounds = {
      x: options.x,
      y: options.y,
      width: options.width,
      height: options.height,
    };
    this.destroyed = false;
    this.closeCalls = 0;
    this.focusCalls = 0;
    this.showCalls = 0;
    this.showInactiveCalls = 0;
    this.opacity = 1;
    this.ignoreMouseEvents = false;
    this.webContents = new MockWebContents(this);
    MockBrowserWindow.instances.push(this);
  }

  setIgnoreMouseEvents(value) {
    this.ignoreMouseEvents = value;
  }

  setOpacity(value) {
    this.opacity = value;
  }

  showInactive() {
    this.showInactiveCalls += 1;
  }

  show() {
    this.showCalls += 1;
  }

  focus() {
    this.focusCalls += 1;
  }

  setBounds(bounds) {
    this.bounds = { ...bounds };
  }

  setAlwaysOnTop() {}

  setVisibleOnAllWorkspaces() {}

  isDestroyed() {
    return this.destroyed;
  }

  close() {
    this.closeCalls += 1;
    if (this.destroyed) return;
    this.destroyed = true;
    this.emit('closed');
  }
}

function createIpcMain() {
  const listeners = new Map();
  const handlers = new Map();

  const getListeners = (channel) => {
    if (!listeners.has(channel)) listeners.set(channel, []);
    return listeners.get(channel);
  };

  return {
    on(channel, listener) {
      getListeners(channel).push({ listener, once: false });
      return this;
    },
    once(channel, listener) {
      getListeners(channel).push({ listener, once: true });
      return this;
    },
    removeListener(channel, listener) {
      const next = getListeners(channel).filter((entry) => entry.listener !== listener);
      listeners.set(channel, next);
      return this;
    },
    removeAllListeners(channel) {
      listeners.set(channel, []);
      return this;
    },
    handle(channel, handler) {
      handlers.set(channel, { handler, once: false });
    },
    handleOnce(channel, handler) {
      handlers.set(channel, { handler, once: true });
    },
    removeHandler(channel) {
      handlers.delete(channel);
    },
    emit(channel, ...args) {
      const current = [...getListeners(channel)];
      for (const entry of current) {
        entry.listener(...args);
        if (entry.once) this.removeListener(channel, entry.listener);
      }
      return current.length > 0;
    },
    async invoke(channel, ...args) {
      const entry = handlers.get(channel);
      if (!entry) throw new Error(`No handler registered for ${channel}`);
      if (entry.once) handlers.delete(channel);
      return entry.handler(...args);
    },
    listenerCount(channel) {
      return getListeners(channel).length;
    },
    hasHandler(channel) {
      return handlers.has(channel);
    },
  };
}

function loadSelectionOverlay({
  displays = DISPLAYS,
  cursor = { x: 10, y: 10 },
  windows = [],
  elementAt = null,
} = {}) {
  MockBrowserWindow.reset();

  const ipcMain = createIpcMain();
  const backgroundCalls = [];
  const registeredShortcuts = new Map();
  const timeouts = [];
  const intervals = [];
  let stopped = false;
  let cursorPoint = { ...cursor };
  let windowsList = windows;
  let elementAtProvider = null;

  const screen = {
    getCursorScreenPoint() {
      return { ...cursorPoint };
    },
    getDisplayNearestPoint(point) {
      return displayForPoint(displays, point);
    },
    getAllDisplays() {
      return displays;
    },
  };

  const moduleMocks = {
    electron: {
      BrowserWindow: MockBrowserWindow,
      globalShortcut: {
        register(accelerator, callback) {
          registeredShortcuts.set(accelerator, callback);
          return true;
        },
        unregister(accelerator) {
          registeredShortcuts.delete(accelerator);
        },
      },
      ipcMain,
      Notification: class {
        constructor(options) {
          this.options = options;
        }

        show() {}
      },
      screen,
    },
    'electron-log/main': {
      info() {},
      warn() {},
      error() {},
    },
    './common': {
      clearElementAtProvider(provider) {
        if (elementAtProvider === provider) elementAtProvider = null;
      },
      loadRendererPage() {
        return Promise.resolve();
      },
      preloadPath() {
        return '/mock/preload.js';
      },
      setElementAtProvider(provider) {
        elementAtProvider = provider;
      },
    },
    '../capture/displaySnapshot': {
      sendBackgroundSnapshot(win, display, logPerf) {
        backgroundCalls.push({ win, display, logPerf });
        return Promise.resolve();
      },
    },
    '../windowsInfo': {
      ensureAccessibilityPermission() {
        return true;
      },
      getDockItems() {
        return [];
      },
      getElementBoundsAtPoint(x, y) {
        return elementAt ? elementAt(x, y) : null;
      },
      listWindows() {
        return Promise.resolve(windowsList);
      },
      onSpaceChange() {
        return () => {};
      },
    },
    '../i18n/strings': {
      tMain() {
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

  const exports = {};
  const sandbox = {
    Buffer,
    console,
    exports,
    module: { exports },
    process,
    require(id) {
      if (Object.prototype.hasOwnProperty.call(moduleMocks, id)) return moduleMocks[id];
      return require(id);
    },
    setImmediate,
    clearImmediate,
    setTimeout(callback, delay, ...args) {
      const timer = { callback, delay, args, cleared: false };
      timeouts.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      if (timer) timer.cleared = true;
    },
    setInterval(callback, delay, ...args) {
      const timer = { callback, delay, args, cleared: false };
      intervals.push(timer);
      return timer;
    },
    clearInterval(timer) {
      if (timer) timer.cleared = true;
    },
  };

  vm.runInNewContext(transpiled, sandbox, { filename: sourcePath });

  return {
    SelectionOverlayManager: sandbox.module.exports.SelectionOverlayManager,
    backgroundCalls,
    displays,
    get elementAtProvider() {
      return elementAtProvider;
    },
    get intervals() {
      return intervals;
    },
    get timeouts() {
      return timeouts;
    },
    ipcMain,
    pressEscape() {
      const callback = registeredShortcuts.get('Escape');
      assert.equal(typeof callback, 'function', 'Escape shortcut should be registered');
      callback();
    },
    setCursor(point) {
      cursorPoint = { ...point };
    },
    setWindows(nextWindows) {
      windowsList = nextWindows;
    },
    stopTimers() {
      stopped = true;
      for (const timer of timeouts) timer.cleared = true;
      for (const timer of intervals) timer.cleared = true;
    },
    async runTimeouts(delay) {
      for (const timer of timeouts) {
        if (!timer.cleared && timer.delay === delay) {
          timer.cleared = true;
          timer.callback(...timer.args);
        }
      }
      await flushPromises();
    },
    get stopped() {
      return stopped;
    },
    windows: MockBrowserWindow.instances,
  };
}

function findWindowForDisplay(windows, display) {
  return windows.find((win) => (
    win.bounds.x === display.bounds.x &&
    win.bounds.y === display.bounds.y &&
    win.bounds.width === display.bounds.width &&
    win.bounds.height === display.bounds.height
  ));
}

function senderEvent(win) {
  return { sender: win.webContents };
}

function ready(ipcMain, win) {
  ipcMain.emit('capture:ready', senderEvent(win));
}

function windowsPayload(win) {
  const sent = win.webContents.sent.filter((entry) => entry.channel === 'capture:windows');
  assert.ok(sent.length > 0, 'expected capture:windows payload');
  return sent.at(-1).args[0];
}

async function select(ipcMain, win, rect) {
  return ipcMain.invoke('capture:region', senderEvent(win), rect);
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
  await select(
    harness.ipcMain,
    findWindowForDisplay(visibleWindows, DISPLAYS[1]),
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
    elementAt(x, y) {
      assert.equal(x, DISPLAYS[0].bounds.x + 40);
      assert.equal(y, DISPLAYS[0].bounds.y + 50);
      return { x: -1240, y: 20, w: 90, h: 40, name: 'Button' };
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

  assert.equal(typeof harness.elementAtProvider, 'function');
  assert.deepEqual(plain(harness.elementAtProvider(senderEvent(left), 40, 50)), {
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
