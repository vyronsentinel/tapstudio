const SESSION_TTL_SECONDS = 60 * 60 * 24;

const memoryStore = globalThis.__tapStudioChatStore || {
  messageSessions: new Map(),
  replies: new Map(),
  sequences: new Map(),
};

globalThis.__tapStudioChatStore = memoryStore;

const clean = (value) => String(value || "").trim();
const clamp = (value, limit) => clean(value).slice(0, limit);

const sendJson = (response, status, payload) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
};

const parseBody = (request) => {
  if (!request.body || typeof request.body === "object") {
    return request.body || {};
  }

  return JSON.parse(request.body);
};

const hasRedis = () => Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

const redis = async (...command) => {
  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    throw new Error("Temporary chat storage failed");
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  return data.result;
};

const setMessageSession = async (messageId, sessionId) => {
  if (hasRedis()) {
    await redis("SET", `tap:tg:${messageId}`, sessionId, "EX", SESSION_TTL_SECONDS);
    return;
  }

  memoryStore.messageSessions.set(String(messageId), sessionId);
};

const getMessageSession = async (messageId) => {
  if (hasRedis()) {
    return redis("GET", `tap:tg:${messageId}`);
  }

  return memoryStore.messageSessions.get(String(messageId));
};

const addReply = async (sessionId, text) => {
  if (hasRedis()) {
    const id = await redis("INCR", `tap:chat:${sessionId}:seq`);
    const reply = { id, text, at: Date.now() };
    await redis("RPUSH", `tap:chat:${sessionId}:replies`, JSON.stringify(reply));
    await redis("EXPIRE", `tap:chat:${sessionId}:seq`, SESSION_TTL_SECONDS);
    await redis("EXPIRE", `tap:chat:${sessionId}:replies`, SESSION_TTL_SECONDS);
    return reply;
  }

  const id = (memoryStore.sequences.get(sessionId) || 0) + 1;
  const reply = { id, text, at: Date.now() };
  memoryStore.sequences.set(sessionId, id);

  const replies = memoryStore.replies.get(sessionId) || [];
  replies.push(reply);
  memoryStore.replies.set(sessionId, replies);
  return reply;
};

const getReplies = async (sessionId, after) => {
  if (hasRedis()) {
    const values = await redis("LRANGE", `tap:chat:${sessionId}:replies`, 0, -1);
    return (values || [])
      .map((value) => JSON.parse(value))
      .filter((reply) => Number(reply.id) > after);
  }

  return (memoryStore.replies.get(sessionId) || []).filter((reply) => Number(reply.id) > after);
};

const sendTelegramMessage = async ({ text, replyToMessageId, forceReply = false }) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    throw new Error("Telegram is not configured");
  }

  const body = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };

  if (replyToMessageId) {
    body.reply_to_message_id = replyToMessageId;
    body.allow_sending_without_reply = true;
  }

  if (forceReply) {
    body.reply_markup = {
      force_reply: true,
      input_field_placeholder: "Reply to this visitor...",
    };
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.ok) {
    throw new Error(data.description || "Telegram message failed");
  }

  return data.result;
};

const escapeHtml = (value) =>
  clean(value).replace(/[&<>"']/g, (character) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return replacements[character];
  });

const handleSend = async (request, response) => {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed" });
  }

  let body;

  try {
    body = parseBody(request);
  } catch {
    return sendJson(response, 400, { error: "Invalid request body" });
  }

  const sessionId = clamp(body.sessionId, 80).replace(/[^a-zA-Z0-9_-]/g, "");
  const name = clamp(body.name, 80);
  const contact = clamp(body.contact, 120);
  const message = clamp(body.message, 1200);

  if (!sessionId || !name || !contact || !message) {
    return sendJson(response, 400, { error: "Please complete all fields" });
  }

  const text = [
    "<b>TAP Studio live chat</b>",
    "",
    `<b>Session:</b> <code>${escapeHtml(sessionId)}</code>`,
    `<b>Name:</b> ${escapeHtml(name)}`,
    `<b>Contact:</b> ${escapeHtml(contact)}`,
    "",
    `<b>Visitor:</b> ${escapeHtml(message)}`,
    "",
    "Reply to this Telegram message to answer the visitor on the website.",
  ].join("\n");

  try {
    const sent = await sendTelegramMessage({ text, forceReply: true });
    await setMessageSession(sent.message_id, sessionId);
    return sendJson(response, 200, { ok: true, messageId: sent.message_id });
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "Message failed" });
  }
};

const handleUpdates = async (request, response) => {
  const url = new URL(request.url, `https://${request.headers.host || "localhost"}`);
  const sessionId = clean(url.searchParams.get("sessionId")).replace(/[^a-zA-Z0-9_-]/g, "");
  const after = Number(url.searchParams.get("after") || 0);
  const messageIds = clean(url.searchParams.get("messageIds"))
    .split(",")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value));

  if (!sessionId) {
    return sendJson(response, 400, { error: "Missing chat session" });
  }

  try {
    if (messageIds.length) {
      const token = process.env.TELEGRAM_BOT_TOKEN;

      if (!token) {
        return sendJson(response, 500, { error: "Telegram is not configured" });
      }

      const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/getUpdates?allowed_updates=%5B%22message%22%5D`);
      const data = await telegramResponse.json().catch(() => ({}));

      if (!telegramResponse.ok || !data.ok) {
        return sendJson(response, 502, { error: data.description || "Could not load Telegram replies" });
      }

      const replies = (data.result || [])
        .filter((update) => Number(update.update_id) > after)
        .filter((update) => messageIds.includes(Number(update.message?.reply_to_message?.message_id)))
        .map((update) => ({
          id: update.update_id,
          text: clamp(update.message?.text, 1200),
          at: Number(update.message?.date || 0) * 1000 || Date.now(),
        }))
        .filter((reply) => reply.text);

      return sendJson(response, 200, { replies });
    }

    const replies = await getReplies(sessionId, Number.isFinite(after) ? after : 0);
    return sendJson(response, 200, { replies });
  } catch (error) {
    return sendJson(response, 500, { error: error.message || "Could not load replies" });
  }
};

const handleEnd = async (request, response) => {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed" });
  }

  let body;

  try {
    body = parseBody(request);
  } catch {
    return sendJson(response, 400, { error: "Invalid request body" });
  }

  const sessionId = clamp(body.sessionId, 80).replace(/[^a-zA-Z0-9_-]/g, "");
  const name = clamp(body.name, 80) || "Website visitor";
  const contact = clamp(body.contact, 120) || "Live chat session";

  if (!sessionId) {
    return sendJson(response, 400, { error: "Missing chat session" });
  }

  const text = [
    "<b>TAP Studio live chat ended</b>",
    "",
    `<b>Session:</b> <code>${escapeHtml(sessionId)}</code>`,
    `<b>Name:</b> ${escapeHtml(name)}`,
    `<b>Contact:</b> ${escapeHtml(contact)}`,
    "",
    "The visitor ended the chat on the website.",
  ].join("\n");

  try {
    await sendTelegramMessage({ text });
    return sendJson(response, 200, { ok: true });
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "End chat notice failed" });
  }
};

const handleTelegram = async (request, response) => {
  if (request.method !== "POST") {
    return sendJson(response, 200, { ok: true });
  }

  let update;

  try {
    update = parseBody(request);
  } catch {
    return sendJson(response, 200, { ok: true });
  }

  const message = update.message;
  const replyToMessageId = message?.reply_to_message?.message_id;
  const text = clamp(message?.text, 1200);

  if (!replyToMessageId || !text) {
    return sendJson(response, 200, { ok: true });
  }

  const sessionId = await getMessageSession(replyToMessageId);

  if (!sessionId) {
    return sendJson(response, 200, { ok: true });
  }

  await addReply(sessionId, text);
  return sendJson(response, 200, { ok: true });
};

module.exports = async (request, response) => {
  const url = new URL(request.url, `https://${request.headers.host || "localhost"}`);
  const mode = url.searchParams.get("mode");

  if (mode === "send") return handleSend(request, response);
  if (mode === "updates") return handleUpdates(request, response);
  if (mode === "end") return handleEnd(request, response);
  if (mode === "telegram") return handleTelegram(request, response);

  return sendJson(response, 404, { error: "Unknown chat action" });
};
