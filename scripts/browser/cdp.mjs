// Shared Chrome DevTools Protocol helpers for the browser verification harnesses.
import { sleep } from './chrome.mjs';

/**
 * Open a fresh page target and attach to it. Retries while Chrome is still
 * starting. The returned `events` array collects all CDP events (e.g. Network
 * responses) for later assertions.
 */
export async function connect(cdpPort, pageUrl) {
  let lastError;
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(pageUrl)}`, { method: 'PUT' });
      if (!res.ok) throw new Error('status ' + res.status);
      const target = await res.json();
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = () => reject(new Error('websocket failed'));
      });
      let msgId = 0;
      const pending = new Map();
      const events = [];
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id && pending.has(msg.id)) {
          const { resolve, reject } = pending.get(msg.id);
          pending.delete(msg.id);
          if (msg.error) reject(new Error(JSON.stringify(msg.error)));
          else resolve(msg.result);
          return;
        }
        if (msg.method) events.push(msg);
      };
      const send = (method, params = {}) =>
        new Promise((resolve, reject) => {
          const id = ++msgId;
          pending.set(id, { resolve, reject });
          ws.send(JSON.stringify({ id, method, params }));
        });
      return { ws, send, events };
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }
  throw new Error('Could not attach to a Chrome page target: ' + (lastError && lastError.message ? lastError.message : ''));
}

/** Raw mouse/keyboard/touch helpers plus element queries over a CDP session. */
export function createDriver(send) {
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const q = (selector) => JSON.stringify(selector);
  const exists = (selector) => evaluate(`!!document.querySelector(${q(selector)})`);
  async function waitFor(selector, label = selector, timeout = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await exists(selector)) return;
      await sleep(150);
    }
    throw new Error(`timeout waiting for ${label} (${selector})`);
  }
  async function waitGone(selector, label = selector, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (!(await exists(selector))) return;
      await sleep(150);
    }
    throw new Error(`timeout waiting for ${label} to disappear`);
  }
  const rect = (selector) =>
    evaluate(
      `(()=>{const e=document.querySelector(${q(selector)});const b=e.getBoundingClientRect();return {w:Math.round(b.width),h:Math.round(b.height),x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};})()`,
    );
  async function clickAt(x, y, clickCount = 1) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount, buttons: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount, buttons: 0 });
    await sleep(70);
  }
  async function clickSelector(selector) {
    const r = await rect(selector);
    if (!r || r.w === 0 || r.h === 0) throw new Error('not clickable: ' + selector);
    await clickAt(r.x, r.y, 1);
  }
  async function doubleClick(x, y) {
    await clickAt(x, y, 1);
    await sleep(40);
    await clickAt(x, y, 2);
    await sleep(140);
  }
  async function drag(x0, y0, dx, dy) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1, buttons: 1 });
    await sleep(30);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + dx, y: y0 + dy, button: 'left', buttons: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x0 + dx, y: y0 + dy, button: 'left', clickCount: 1, buttons: 0 });
    await sleep(90);
  }
  async function wheel(x, y, deltaY, modifiers = 0) {
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY, modifiers });
    await sleep(90);
  }
  async function key(k, code, vk) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await sleep(80);
  }
  async function touchDrag(x0, y0, dx, dy, steps = 6) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
    await sleep(40);
    for (let i = 1; i <= steps; i += 1) {
      await send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: Math.round(x0 + (dx * i) / steps), y: Math.round(y0 + (dy * i) / steps), id: 1 }],
      });
      await sleep(25);
    }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(100);
  }
  async function typeInto(selector, text) {
    await evaluate(`(()=>{const e=document.querySelector(${q(selector)}); e.focus(); e.select && e.select();})()`);
    await send('Input.insertText', { text });
    await sleep(60);
  }
  return {
    evaluate,
    q,
    exists,
    waitFor,
    waitGone,
    rect,
    clickAt,
    clickSelector,
    doubleClick,
    drag,
    wheel,
    key,
    touchDrag,
    typeInto,
    focusDialog: () => evaluate(`document.querySelector('[role=dialog]').focus()`),
  };
}
