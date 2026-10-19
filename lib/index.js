// src/index.ts
import z from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { readFile } from "node:fs/promises";

// src/shared.ts
var BASE = "/dsh-listener";
var DEFAULT_MODEL = "qwen-audio-3.1-asr-flash-streaming";
var SAMPLE_RATE = 16e3;
var MAX_AUDIO_BYTES = 16e3 * 2 * 120;
var MAX_BUFFER_BYTES = 16e3 * 2 * 15;
var defaults = {
  model: DEFAULT_MODEL,
  region: "beijing",
  workspaceId: "",
  hotkey: "AltRight",
  mode: "hold",
  autoSend: false,
  showLiveCaption: true
};
function validatePreferences(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("\u8BBE\u7F6E\u683C\u5F0F\u65E0\u6548");
  const p = input;
  if (typeof p.model !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(p.model)) throw new Error("\u6A21\u578B\u540D\u79F0\u65E0\u6548");
  if (p.region !== "beijing" && p.region !== "singapore") throw new Error("\u5730\u57DF\u65E0\u6548");
  if (typeof p.workspaceId !== "string" || !/^[a-zA-Z0-9-]{0,64}$/.test(p.workspaceId)) throw new Error("Workspace ID \u65E0\u6548");
  if (typeof p.hotkey !== "string" || !/^(?:(?:Control|Shift|Alt|Meta)\+)*(?:AltRight|AltLeft|ControlRight|ControlLeft|ShiftRight|ShiftLeft|MetaRight|MetaLeft|Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2])|Space)$/.test(p.hotkey)) throw new Error("\u5FEB\u6377\u952E\u65E0\u6548");
  if (p.mode !== "hold" && p.mode !== "toggle") throw new Error("\u5F55\u97F3\u6A21\u5F0F\u65E0\u6548");
  if (typeof p.autoSend !== "boolean") throw new Error("\u81EA\u52A8\u53D1\u9001\u8BBE\u7F6E\u65E0\u6548");
  const showLiveCaption = p.showLiveCaption ?? defaults.showLiveCaption;
  if (typeof showLiveCaption !== "boolean") throw new Error("\u5B9E\u65F6\u5B57\u5E55\u8BBE\u7F6E\u65E0\u6548");
  return { model: p.model, region: p.region, workspaceId: p.workspaceId, hotkey: p.hotkey, mode: p.mode, autoSend: p.autoSend, showLiveCaption };
}
function upstreamUrl(p) {
  const region = p.region === "beijing" ? "cn-beijing" : "ap-southeast-1";
  const host = p.workspaceId ? `${p.workspaceId}.${region}.maas.aliyuncs.com` : p.region === "beijing" ? "dashscope.aliyuncs.com" : "dashscope-intl.aliyuncs.com";
  return `wss://${host}/api-ws/v1/inference`;
}
function joinText(left, right) {
  if (!left || !right || /\s$/.test(left) || /^\s/.test(right)) return left + right;
  return left + (/[A-Za-z0-9]$/.test(left) && /^[A-Za-z0-9]/.test(right) ? " " : "") + right;
}

// src/host/http-channel.ts
import { randomUUID as randomUUID2 } from "node:crypto";

// src/host/bailian.ts
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
var connect = (url, key) => new WebSocket(url, { headers: { Authorization: `Bearer ${key}` }, handshakeTimeout: 1e4, maxPayload: 1024 * 1024 });
var BailianTask = class {
  constructor(p, key, emit, factory = connect) {
    this.emit = emit;
    this.socket = factory(upstreamUrl(p), key);
    this.timer = setTimeout(() => this.fail("\u767E\u70BC\u8FDE\u63A5\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u548C\u914D\u7F6E"), 15e3);
    this.deadline = setTimeout(() => this.fail("\u5F55\u97F3\u8D85\u8FC7 120 \u79D2\uFF0C\u5DF2\u53D6\u6D88"), 125e3);
    this.socket.on("open", () => {
      if (this.ended) return;
      this.socket.send(JSON.stringify({
        header: { action: "run-task", task_id: this.taskId, streaming: "duplex" },
        payload: {
          task_group: "audio",
          task: "asr",
          function: "recognition",
          model: p.model,
          parameters: { format: "pcm", sample_rate: SAMPLE_RATE },
          input: {}
        }
      }));
    });
    this.socket.on("message", (raw) => this.message(raw));
    this.socket.on("error", (error) => {
      const code = String(error?.code ?? "").replace(/[^A-Z0-9_]/g, "").slice(0, 40);
      this.fail(`\u767E\u70BC\u8FDE\u63A5\u5931\u8D25${code ? `\uFF08${code}\uFF09` : ""}\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u3001\u5730\u57DF\u548C Workspace ID`);
    });
    this.socket.on("unexpected-response", (_req, response) => {
      this.fail(`\u767E\u70BC\u8FDE\u63A5\u5931\u8D25\uFF08HTTP ${response.statusCode}\uFF09\u3002${response.statusCode === 401 || response.statusCode === 403 ? "\u8BF7\u68C0\u67E5\u5BC6\u94A5\u6709\u6548\u6027\u3001\u5730\u57DF\u3001Workspace ID \u548C\u6A21\u578B\u6743\u9650\u3002" : "\u8BF7\u68C0\u67E5 Workspace ID\u3001\u670D\u52A1\u5730\u5740\u548C\u7F51\u7EDC\u3002"}`);
    });
    this.socket.on("close", () => {
      if (!this.ended) this.fail("\u767E\u70BC\u8FDE\u63A5\u63D0\u524D\u5173\u95ED\uFF0C\u8BC6\u522B\u672A\u5B8C\u6210");
    });
  }
  taskId = randomUUID().replaceAll("-", "");
  socket;
  ready = false;
  finishing = false;
  finishSent = false;
  ended = false;
  bytes = 0;
  queuedBytes = 0;
  queue = [];
  sentences = /* @__PURE__ */ new Map();
  timer;
  deadline;
  sendAudio(audio) {
    if (this.ended) return;
    if (this.finishing) {
      this.fail("\u505C\u6B62\u540E\u6536\u5230\u97F3\u9891\uFF0C\u5F55\u97F3\u534F\u8BAE\u65E0\u6548");
      return;
    }
    if (!audio.length || audio.length % 2 || audio.length > 32e3) {
      this.fail("PCM \u97F3\u9891\u5206\u5757\u65E0\u6548");
      return;
    }
    if (!this.bytes) {
      clearTimeout(this.deadline);
      this.deadline = setTimeout(() => this.fail("\u5F55\u97F3\u8D85\u8FC7 120 \u79D2\uFF0C\u5DF2\u53D6\u6D88"), 125e3);
    }
    this.bytes += audio.length;
    if (this.bytes > MAX_AUDIO_BYTES) {
      this.fail("\u5F55\u97F3\u8D85\u8FC7 120 \u79D2\uFF0C\u5DF2\u53D6\u6D88");
      return;
    }
    if (!this.ready) {
      this.queuedBytes += audio.length;
      if (this.queuedBytes > MAX_BUFFER_BYTES) {
        this.fail("\u767E\u70BC\u8FDE\u63A5\u8FC7\u6162\uFF0C\u5DF2\u53D6\u6D88\u5F55\u97F3");
        return;
      }
      this.queue.push(Buffer.from(audio));
    } else if (this.socket.bufferedAmount > MAX_BUFFER_BYTES) this.fail("\u4E0A\u4F20\u7F51\u7EDC\u8FC7\u6162\uFF0C\u5DF2\u53D6\u6D88\u5F55\u97F3");
    else this.socket.send(audio);
  }
  finish() {
    if (this.ended || this.finishing) return;
    if (!this.bytes) {
      this.fail("\u6CA1\u6709\u91C7\u96C6\u5230\u97F3\u9891");
      return;
    }
    this.finishing = true;
    clearTimeout(this.timer);
    clearTimeout(this.deadline);
    this.timer = setTimeout(() => this.fail("\u7B49\u5F85\u6700\u7EC8\u8BC6\u522B\u7ED3\u679C\u8D85\u65F6"), 2e4);
    this.flushFinish();
  }
  cancel() {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.timer);
    clearTimeout(this.deadline);
    this.queue = [];
    this.sentences.clear();
    this.socket.terminate();
  }
  fail(message) {
    if (this.ended) return;
    this.cancel();
    this.emit({ type: "error", message });
  }
  flushFinish() {
    if (!this.ready || !this.finishing || this.finishSent || this.ended) return;
    this.finishSent = true;
    this.socket.send(JSON.stringify({ header: { action: "finish-task", task_id: this.taskId, streaming: "duplex" }, payload: { input: {} } }));
  }
  message(raw) {
    if (this.ended) return;
    let e;
    try {
      e = JSON.parse(raw.toString());
    } catch {
      this.fail("\u767E\u70BC\u8FD4\u56DE\u4E86\u65E0\u6548\u6570\u636E");
      return;
    }
    if (e?.header?.task_id !== this.taskId) return;
    switch (e.header.event) {
      case "task-started": {
        if (this.ready) return;
        this.ready = true;
        if (!this.finishing) clearTimeout(this.timer);
        for (const chunk of this.queue) this.socket.send(chunk);
        this.queue = [];
        this.queuedBytes = 0;
        this.emit({ type: "ready" });
        this.flushFinish();
        break;
      }
      case "result-generated": {
        const output = e.payload?.output;
        const s = output?.sentence ?? output?.output?.sentence;
        if (!s || s.heartbeat === true || typeof s.text !== "string") return;
        if (s.sentence_end === true && Number.isInteger(s.sentence_id) && s.sentence_id > 0) this.sentences.set(s.sentence_id, s.text);
        const final = this.text();
        this.emit({ type: "partial", text: s.sentence_end === true ? final : joinText(final, s.text) });
        break;
      }
      case "task-finished": {
        if (!this.finishSent) {
          this.fail("\u767E\u70BC\u4EFB\u52A1\u610F\u5916\u7ED3\u675F");
          return;
        }
        const text = this.text().trim();
        this.ended = true;
        clearTimeout(this.timer);
        clearTimeout(this.deadline);
        this.emit({ type: "final", text });
        this.sentences.clear();
        this.socket.close();
        break;
      }
      case "task-failed":
        this.fail(`\u767E\u70BC\u8BC6\u522B\u5931\u8D25\uFF08${String(e.header.error_code ?? "UNKNOWN").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80)}\uFF09\uFF0C\u8BF7\u68C0\u67E5\u6A21\u578B\u4E0E\u914D\u7F6E`);
    }
  }
  text() {
    return [...this.sentences].sort(([a], [b]) => a - b).reduce((text, [, sentence]) => joinText(text, sentence), "");
  }
};

// src/host/http-channel.ts
function reply(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}
function mountHttpChannel(ctx, preferences, keyRef2, factory = (p, k, emit) => new BailianTask(p, k, emit)) {
  const entries = /* @__PURE__ */ new Map();
  let creating = 0, disposed = false;
  const active = () => creating + [...entries.values()].filter((e) => !e.ended).length;
  const remove = (id, entry) => {
    entry.ended = true;
    entry.task?.cancel();
    for (const wake of entry.wake) wake();
    entries.delete(id);
  };
  const sweep = setInterval(() => {
    for (const [id, entry] of entries) if (Date.now() - entry.touched > 3e4) remove(id, entry);
  }, 5e3);
  const unregister = ctx.webServer.register({ kind: "exact", path: `${BASE}/channel`, handler: async (req, res) => {
    const admission = ctx.connection.admit(req);
    if ("rejection" in admission) {
      reply(res, admission.rejection, { error: "Harness \u767B\u5F55\u6216\u9875\u9762\u6765\u6E90\u9A8C\u8BC1\u5931\u8D25" });
      return;
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    const action = url.searchParams.get("action"), id = url.searchParams.get("id") ?? "";
    try {
      if (req.method === "POST" && action === "start") {
        if (disposed || active() >= 4 || entries.size >= 64) {
          reply(res, 503, { error: "\u8BED\u97F3\u901A\u9053\u5FD9\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5" });
          return;
        }
        creating++;
        try {
          const key = await ctx.credentials.resolve(keyRef2);
          if (res.destroyed) return;
          if (!key) {
            reply(res, 400, { error: "\u5C1A\u672A\u914D\u7F6E\u767E\u70BC API Key" });
            return;
          }
          if (disposed) {
            reply(res, 503, { error: "\u8BED\u97F3\u63D2\u4EF6\u5DF2\u505C\u6B62\uFF0C\u8BF7\u5237\u65B0\u9875\u9762" });
            return;
          }
          const id2 = randomUUID2(), entry2 = { events: [], seq: 0, ended: false, touched: Date.now(), wake: /* @__PURE__ */ new Set() };
          entries.set(id2, entry2);
          res.once("close", () => {
            if (!res.writableFinished) remove(id2, entry2);
          });
          try {
            entry2.task = factory(preferences(), key.value, (event) => {
              entry2.events.push({ seq: ++entry2.seq, event });
              if (entry2.events.length > 256) entry2.events.shift();
              if (event.type === "final" || event.type === "error") entry2.ended = true;
              for (const wake of entry2.wake) wake();
            });
          } catch {
            remove(id2, entry2);
            throw new Error("initialize");
          }
          reply(res, 200, { id: id2 });
          return;
        } finally {
          creating--;
        }
      }
      const entry = entries.get(id);
      if (!entry) {
        reply(res, 404, { error: "\u5F55\u97F3\u4F1A\u8BDD\u5DF2\u7ED3\u675F\uFF0C\u8BF7\u91CD\u65B0\u5F00\u59CB" });
        return;
      }
      entry.touched = Date.now();
      if (req.method === "GET" && action === "events") {
        const after = Number(url.searchParams.get("after") ?? 0);
        if (!Number.isSafeInteger(after) || after < 0 || after > entry.seq) {
          reply(res, 400, { error: "\u4E8B\u4EF6\u5E8F\u53F7\u65E0\u6548" });
          return;
        }
        if (entry.seq === after && !entry.ended) await new Promise((resolve) => {
          const done = () => {
            clearTimeout(timer);
            entry.wake.delete(done);
            res.off("close", done);
            resolve();
          };
          const timer = setTimeout(done, 15e3);
          entry.wake.add(done);
          res.once("close", done);
        });
        if (!res.destroyed) reply(res, 200, { events: entry.events.filter((e) => e.seq > after), ended: entry.ended });
        return;
      }
      if (req.method !== "POST") {
        reply(res, 405, { error: "\u65B9\u6CD5\u4E0D\u652F\u6301" });
        return;
      }
      if (action === "cancel") {
        remove(id, entry);
        reply(res, 200, { ok: true });
        return;
      }
      if (entry.ended) {
        reply(res, 409, { error: "\u5F55\u97F3\u5DF2\u7ED3\u675F" });
        return;
      }
      if (action === "audio") {
        if (req.headers["content-type"] !== "application/octet-stream") {
          reply(res, 415, { error: "\u9700\u8981 PCM \u4E8C\u8FDB\u5236\u97F3\u9891" });
          return;
        }
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 32e3) {
            remove(id, entry);
            reply(res, 413, { error: "\u97F3\u9891\u5206\u5757\u8FC7\u5927" });
            return;
          }
          ;
          chunks.push(chunk);
        }
        entry.task?.sendAudio(Buffer.concat(chunks));
      } else if (action === "finish") entry.task?.finish();
      else {
        reply(res, 400, { error: "\u64CD\u4F5C\u65E0\u6548" });
        return;
      }
      reply(res, 200, { ok: true });
    } catch {
      if (!res.headersSent) reply(res, 500, { error: "Harness \u65E0\u6CD5\u521D\u59CB\u5316\u8BED\u97F3\u4EFB\u52A1\uFF0C\u8BF7\u68C0\u67E5\u51ED\u636E\u5B58\u50A8\u548C\u914D\u7F6E" });
    }
  } });
  return { active, dispose: () => {
    disposed = true;
    clearInterval(sweep);
    unregister();
    for (const [id, entry] of entries) remove(id, entry);
  } };
}

// src/index.ts
var name = "dsh-asr-realtime";
var settingsId = "dsh-listener";
var inject = ["webServer", "connection", "credentials", "settings"];
var Config = z.object({
  model: z.string().default(defaults.model).volatile(),
  region: z.union(["beijing", "singapore"]).default("beijing").volatile(),
  workspaceId: z.string().default("").volatile(),
  hotkey: z.string().default("AltRight").volatile(),
  mode: z.union(["hold", "toggle"]).default("hold").volatile(),
  autoSend: z.boolean().default(false).volatile(),
  showLiveCaption: z.boolean().default(defaults.showLiveCaption).volatile()
});
var keyRef = credentialRef("DSH_LISTENER_API_KEY");
function json(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}
async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) throw new Error("\u8BBE\u7F6E\u8BF7\u6C42\u8FC7\u5927");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
function apply(ctx, initial = defaults) {
  let writes = Promise.resolve();
  const descriptor = () => ctx.settings.describe().find((s) => s.ns === settingsId);
  const preferences = () => validatePreferences(descriptor()?.value ?? initial);
  const view = async () => ({
    ...preferences(),
    configured: (await ctx.credentials.describe(keyRef)).configured,
    writable: ctx.settings.writable,
    revision: descriptor()?.revision ?? 0
  });
  ctx.effect(() => ctx.settings.configure({ auto: false }));
  const channel = mountHttpChannel(ctx, preferences, keyRef);
  ctx.effect(() => channel.dispose);
  ctx.effect(() => ctx.webServer.register({ kind: "exact", path: `${BASE}/config`, handler: async (req, res) => {
    const admission = ctx.connection.admit(req);
    if ("rejection" in admission) {
      json(res, admission.rejection, { error: "\u8BF7\u5148\u767B\u5F55 Harness" });
      return;
    }
    try {
      if (req.method === "GET") {
        json(res, 200, await view());
        return;
      }
      if (req.method !== "POST") {
        json(res, 405, { error: "\u65B9\u6CD5\u4E0D\u652F\u6301" });
        return;
      }
      if (!req.headers["content-type"]?.startsWith("application/json")) {
        json(res, 415, { error: "\u9700\u8981 JSON \u8BF7\u6C42" });
        return;
      }
      const request = await body(req);
      const reset = request?.reset === true;
      if (request.reset !== void 0 && typeof request.reset !== "boolean") throw new Error("\u6E05\u9664\u64CD\u4F5C\u65E0\u6548");
      if (request?.updateDownload !== void 0) throw new Error("\u63D2\u4EF6\u5DF2\u79FB\u9664\u5185\u7F6E\u66F4\u65B0\uFF0C\u8BF7\u901A\u8FC7 GitHub \u53D1\u5E03\u9875\u66F4\u65B0");
      const next = reset ? defaults : validatePreferences(request?.preferences);
      if (reset && (request.apiKey !== void 0 || request.clearKey !== void 0)) throw new Error("\u6E05\u9664\u4E0D\u80FD\u4E0E\u4FDD\u5B58\u540C\u65F6\u8FDB\u884C");
      if (!Number.isInteger(request?.revision) || request.revision < 0) throw new Error("\u8BBE\u7F6E\u7248\u672C\u65E0\u6548\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5");
      if (request.apiKey !== void 0 && (typeof request.apiKey !== "string" || request.apiKey.length > 2048 || !request.apiKey.trim())) throw new Error("API Key \u65E0\u6548");
      if (request.clearKey !== void 0 && typeof request.clearKey !== "boolean") throw new Error("\u5BC6\u94A5\u64CD\u4F5C\u65E0\u6548");
      if (request.apiKey !== void 0 && request.clearKey) throw new Error("\u4E0D\u80FD\u540C\u65F6\u4FDD\u5B58\u548C\u6E05\u9664\u5BC6\u94A5");
      const write = writes.then(async () => {
        if (!ctx.settings.writable) throw new Error("\u5F53\u524D\u914D\u7F6E\u53EA\u8BFB");
        if (request.revision !== descriptor()?.revision) throw new Error("\u8BBE\u7F6E\u5DF2\u53D8\u5316\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5");
        if (reset && channel.active() > 0) throw new Error("\u8BF7\u5148\u7ED3\u675F\u5F55\u97F3");
        if (request.apiKey !== void 0) await ctx.credentials.set(keyRef, request.apiKey.trim());
        if (reset || request.clearKey === true) await ctx.credentials.unset(keyRef);
        await ctx.settings.update(settingsId, next, request.revision);
      });
      writes = write.catch(() => void 0);
      await write;
      json(res, 200, await view());
    } catch {
      json(res, 400, { error: "\u4FDD\u5B58\u6216\u8BFB\u53D6\u5931\u8D25\uFF1A\u68C0\u67E5\u914D\u7F6E\u3001\u53EF\u5199\u6743\u9650\uFF0C\u6216\u5237\u65B0\u540E\u91CD\u8BD5\u3002\u5BC6\u94A5\u4E0E\u666E\u901A\u8BBE\u7F6E\u5206\u522B\u4FDD\u5B58\u3002" });
    }
  } }));
  ctx.effect(() => ctx.webServer.register({ kind: "exact", path: `${BASE}/pcm-worklet.js`, handler: async (req, res) => {
    const admission = ctx.connection.admit(req);
    if ("rejection" in admission) {
      res.writeHead(admission.rejection);
      res.end();
      return;
    }
    try {
      const source = await readFile(new URL("./pcm-worklet.js", import.meta.url), "utf8");
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" });
      res.end(source);
    } catch {
      res.writeHead(500);
      res.end("Audio worklet unavailable");
    }
  } }));
}
export {
  Config,
  apply,
  inject,
  name
};
