const {
  clean,
  clamp,
  hasFilledHoneypot,
  isDate,
  isEmail,
  isTime,
  parseBody,
  rateLimit,
  requireAllowedOrigin,
  sendJson,
  verifyTurnstile,
} = require("./security");

const packageDurations = {
  Solo: 20,
  Duo: 25,
  Groupies: 30,
};

const sendTelegramBooking = async (lines) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_BOOKING_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    throw new Error("Booking notifications are not configured");
  }

  const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: lines.join("\n"),
      disable_web_page_preview: true,
    }),
  });

  const data = await telegramResponse.json().catch(() => ({}));

  if (!telegramResponse.ok || data.ok === false) {
    throw new Error(data.description || "Booking notification failed");
  }
};

const base64UrlEncode = (value) =>
  Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const getAccessToken = async () => {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    throw new Error("Google Calendar is not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64UrlEncode(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/calendar.events",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );
  const unsignedToken = `${header}.${claim}`;
  const signer = require("crypto").createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign(privateKey, "base64url");

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsignedToken}.${signature}`,
    }),
  });

  const data = await tokenResponse.json().catch(() => ({}));

  if (!tokenResponse.ok) {
    throw new Error(data.error_description || "Could not authorize Google Calendar");
  }

  return data.access_token;
};

const toBookingDate = (date, time) => {
  const timezone = process.env.BOOKING_TIMEZONE || "Asia/Manila";
  const start = new Date(`${date}T${time}:00+08:00`);

  if (Number.isNaN(start.getTime())) {
    throw new Error("Please choose a valid date and time");
  }

  if (start.getTime() < Date.now()) {
    throw new Error("Please choose a future date and time");
  }

  return { start, timezone };
};

module.exports = async (request, response) => {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed" });
  }

  if (!requireAllowedOrigin(request, response)) return;
  if (!rateLimit(request, response, "booking", 4)) return;

  let body;

  try {
    body = parseBody(request);
  } catch (error) {
    return sendJson(response, error.status || 400, { error: error.message || "Invalid request body" });
  }

  if (hasFilledHoneypot(body)) {
    return sendJson(response, 200, { ok: true });
  }

  const name = clamp(body.name, 80);
  const email = clamp(body.email, 140).toLowerCase();
  const contact = clamp(body.contact, 120);
  const selectedPackage = clamp(body.package, 40);
  const date = clamp(body.date, 20);
  const time = clamp(body.time, 20);
  const guests = clamp(body.guests, 20);
  const addons = clamp(body.addons, 500);
  const notes = clamp(body.notes, 1200);
  const duration = packageDurations[selectedPackage];

  if (!name || !email || !contact || !selectedPackage || !date || !time || !guests) {
    return sendJson(response, 400, { error: "Please complete all required fields" });
  }

  if (!duration) {
    return sendJson(response, 400, { error: "Please choose a valid package" });
  }

  if (!isEmail(email)) {
    return sendJson(response, 400, { error: "Please enter a valid email" });
  }

  if (!isDate(date) || !isTime(time)) {
    return sendJson(response, 400, { error: "Please choose a valid date and time" });
  }

  const guestCount = Number(guests);

  if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 20) {
    return sendJson(response, 400, { error: "Please enter a valid guest count" });
  }

  if (!(await verifyTurnstile(request, body?.turnstileToken))) {
    return sendJson(response, 400, { error: "Please complete the security check" });
  }

  let bookingDate;

  try {
    bookingDate = toBookingDate(date, time);
  } catch (error) {
    return sendJson(response, 400, { error: error.message });
  }

  const end = new Date(bookingDate.start.getTime() + duration * 60 * 1000);
  const schedule = `${date} ${time} (${bookingDate.timezone})`;
  const bookingLines = [
    "New TAP Studio booking request",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    `Contact: ${contact}`,
    `Package: ${selectedPackage}`,
    `Schedule: ${schedule}`,
    `Guests: ${guestCount}`,
    addons ? `Add-ons: ${addons}` : "",
    notes ? `Notes: ${notes}` : "",
  ].filter(Boolean);

  try {
    await sendTelegramBooking(bookingLines);
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "Booking request failed" });
  }

  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const hasGoogleCalendar = Boolean(
    calendarId && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY
  );

  if (!hasGoogleCalendar) {
    return sendJson(response, 200, { ok: true, notification: "telegram" });
  }

  const studioEmail = clean(process.env.STUDIO_EMAIL);
  const attendees = [{ email, displayName: name }];

  if (studioEmail && studioEmail.toLowerCase() !== email) {
    attendees.push({ email: studioEmail, displayName: "TAP Studio" });
  }

  const event = {
    summary: `TAP Studio booking - ${selectedPackage} - ${name}`,
    location: "Lauro Dizon St, San Pablo City, 4000 Laguna",
    description: [
      `Package: ${selectedPackage}`,
      `Client: ${name}`,
      `Email: ${email}`,
      `Contact: ${contact}`,
      `Guests: ${guestCount}`,
      addons ? `Add-ons: ${addons}` : "",
      notes ? `Notes: ${notes}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    start: {
      dateTime: bookingDate.start.toISOString(),
      timeZone: bookingDate.timezone,
    },
    end: {
      dateTime: end.toISOString(),
      timeZone: bookingDate.timezone,
    },
    attendees,
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 24 * 60 },
        { method: "popup", minutes: 60 },
      ],
    },
  };

  try {
    const accessToken = await getAccessToken();
    const calendarResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      }
    );
    const data = await calendarResponse.json().catch(() => ({}));

    if (!calendarResponse.ok) {
      throw new Error(data.error?.message || "Could not create calendar event");
    }

    return sendJson(response, 200, { ok: true, eventId: data.id, htmlLink: data.htmlLink });
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "Booking failed" });
  }
};
