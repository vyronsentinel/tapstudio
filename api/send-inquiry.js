const {
  clamp,
  hasFilledHoneypot,
  isReasonableText,
  parseBody,
  rateLimit,
  requireAllowedOrigin,
  sendJson,
  verifyTurnstile,
} = require("./security");

module.exports = async (request, response) => {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed" });
  }

  if (!requireAllowedOrigin(request, response)) return;
  if (!rateLimit(request, response, "inquiry", 5)) return;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return sendJson(response, 500, { error: "Telegram is not configured" });
  }

  let body;

  try {
    body = parseBody(request);
  } catch (error) {
    return sendJson(response, error.status || 400, { error: error.message || "Invalid request body" });
  }

  if (hasFilledHoneypot(body)) {
    return sendJson(response, 200, { ok: true });
  }

  const name = clamp(body?.name, 80);
  const contact = clamp(body?.contact, 120);
  const message = clamp(body?.message, 1200);

  if (!name || !contact || !message) {
    return sendJson(response, 400, { error: "Please complete all fields" });
  }

  if (!isReasonableText(message)) {
    return sendJson(response, 400, { error: "Please send a message without links" });
  }

  if (!(await verifyTurnstile(request, body?.turnstileToken))) {
    return sendJson(response, 400, { error: "Please complete the security check" });
  }

  const text = [
    "New TAP Studio website inquiry",
    "",
    `Name: ${name}`,
    `Contact: ${contact}`,
    "",
    "Message:",
    message,
  ].join("\n");

  const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!telegramResponse.ok) {
    return sendJson(response, 502, { error: "Telegram message failed" });
  }

  return sendJson(response, 200, { ok: true });
};
