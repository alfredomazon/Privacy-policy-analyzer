import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const guardSource = await readFile(
  new URL("../content/popupGuardMain.js", import.meta.url),
  "utf8"
);

function makeElement({
  text = "",
  href = "",
  role = "",
  id = "",
  className = "",
  visible = true,
} = {}) {
  return {
    innerText: text,
    textContent: text,
    id,
    className,
    href,
    action: href,
    getAttribute(name) {
      const values = {
        "aria-label": "",
        title: "",
        value: "",
        role,
        href,
        action: href,
      };
      return values[name] || "";
    },
    getBoundingClientRect() {
      return visible
        ? { width: 320, height: 160 }
        : { width: 0, height: 0 };
    },
    closest(selector) {
      if (/a\[href\]|area\[href\]|button|\[role='button'\]/.test(selector)) {
        return this;
      }

      return null;
    },
  };
}

function runGuard({
  bodyText = "",
  queryElements = [],
  clickTarget = null,
  nativeNotificationResult = "granted",
} = {}) {
  const listeners = new Map();
  const reports = [];
  const attributes = new Map();
  const nativePermissionCalls = [];

  const window = {
    location: {
      href: "https://www.google.com/search?q=how+to+make+a+taco",
    },
    addEventListener(type, handler) {
      const current = listeners.get(type) || [];
      current.push(handler);
      listeners.set(type, current);
    },
    dispatchEvent(event) {
      if (event?.type === "evil-eye-popup-guard-activity") {
        reports.push(event.detail);
      }
      return true;
    },
    open() {
      return {};
    },
    alert() {},
    confirm() {
      return true;
    },
    prompt() {
      return "";
    },
    Notification: {
      requestPermission(callback) {
        nativePermissionCalls.push(true);
        if (typeof callback === "function") callback(nativeNotificationResult);
        return Promise.resolve(nativeNotificationResult);
      },
    },
    getComputedStyle() {
      return {
        display: "block",
        visibility: "visible",
        opacity: "1",
      };
    },
  };
  window.window = window;

  const document = {
    documentElement: {
      getAttribute(name) {
        return attributes.get(name) || null;
      },
      setAttribute(name, value) {
        attributes.set(name, String(value));
      },
    },
    body: {
      innerText: bodyText,
      textContent: bodyText,
    },
    querySelectorAll() {
      return queryElements;
    },
  };

  const sandbox = {
    window,
    document,
    location: window.location,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail || null;
      }
    },
  };
  sandbox.globalThis = sandbox;

  vm.runInNewContext(guardSource, sandbox, {
    filename: "content/popupGuardMain.js",
  });

  return {
    listeners,
    reports,
    attributes,
    nativePermissionCalls,
    window,
    fire(type, event = {}) {
      const handlers = listeners.get(type) || [];
      for (const handler of handlers) {
        handler(event);
      }
      return event;
    },
    click(target = clickTarget) {
      return this.fire("click", {
        isTrusted: true,
        target,
        defaultPrevented: false,
        stopped: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        stopImmediatePropagation() {
          this.stopped = true;
        },
      });
    },
  };
}

test("safety guard does not create leave-site dialogs during normal search navigation", () => {
  const guard = runGuard({
    bodyText: "Search results how to make a taco recipes videos maps news",
  });

  const event = guard.fire("beforeunload", {
    stopped: false,
    stopImmediatePropagation() {
      this.stopped = true;
    },
  });

  assert.equal(event.stopped, false);
  assert.equal(Object.hasOwn(event, "returnValue"), false);
  assert.equal(guard.reports.length, 0);
});

test("safety guard still blocks scam-like page leave traps", () => {
  const guard = runGuard({
    bodyText:
      "Windows Defender security warning. Your browser is locked. Malware detected. Call support now.",
  });

  const event = guard.fire("beforeunload", {
    stopped: false,
    stopImmediatePropagation() {
      this.stopped = true;
    },
  });

  assert.equal(event.stopped, true);
  assert.equal(Object.hasOwn(event, "returnValue"), false);
  assert.equal(guard.reports.at(-1)?.requestType, "beforeunload");
  assert.equal(guard.reports.at(-1)?.action, "blocked");
});

test("safety guard allows normal user-initiated notification opt-ins", async () => {
  const guard = runGuard({
    bodyText: "Enable alerts for order updates.",
  });

  guard.fire("pointerdown", { isTrusted: true });
  const result = await guard.window.Notification.requestPermission();

  assert.equal(result, "granted");
  assert.equal(guard.nativePermissionCalls.length, 1);
  assert.equal(guard.reports.length, 0);
});

test("safety guard blocks fake allow notification traps by default", async () => {
  const guard = runGuard({
    bodyText: "Click Allow to verify you are not a robot and continue.",
  });

  guard.fire("pointerdown", { isTrusted: true });
  const result = await guard.window.Notification.requestPermission();

  assert.equal(result, "denied");
  assert.equal(guard.nativePermissionCalls.length, 0);
  assert.equal(guard.reports.at(-1)?.kind, "notification-trap");
  assert.equal(guard.reports.at(-1)?.action, "blocked");
});

test("safety guard blocks unwanted installer clicks", () => {
  const installButton = makeElement({
    text: "Install Wave Browser now to continue safely.",
    href: "https://example.test/download/wavebrowser-setup.exe",
  });
  const guard = runGuard({
    bodyText: "Your browser is out of date. Install Wave Browser now.",
    clickTarget: installButton,
  });

  const event = guard.click();

  assert.equal(event.defaultPrevented, true);
  assert.equal(event.stopped, true);
  assert.equal(guard.reports.at(-1)?.kind, "unwanted-install");
});

test("safety guard does not block ordinary shopping clicks", () => {
  const productLink = makeElement({
    text: "View taco seasoning",
    href: "https://example.test/products/taco-seasoning",
  });
  const guard = runGuard({
    bodyText: "Search results and product links.",
    clickTarget: productLink,
  });

  const event = guard.click();

  assert.equal(event.defaultPrevented, false);
  assert.equal(event.stopped, false);
  assert.equal(guard.reports.length, 0);
});
