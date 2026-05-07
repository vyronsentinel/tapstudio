const clean = (value) => String(value || "").trim();

const clamp = (value, limit) => clean(value).slice(0, limit);

const sendJson = (response, status, payload) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
};

module.exports = async (request, response) => {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed" });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return sendJson(response, 500, { error: "Telegram is not configured" });
  }

  let body = request.body;

  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return sendJson(response, 400, { error: "Invalid request body" });
    }
  }

  const name = clamp(body?.name, 80);
  const contact = clamp(body?.contact, 120);
  const message = clamp(body?.message, 1200);

  if (!name || !contact || !message) {
    return sendJson(response, 400, { error: "Please complete all fields" });
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
