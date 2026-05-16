const root = document.querySelector(".snap-pages");
const reveals = document.querySelectorAll(".reveal");
const photos = document.querySelectorAll("img:not(.modal-photo)");
const photoModal = document.querySelector("#photoModal");
const photoModalImage = photoModal?.querySelector("img");
const photoModalCaption = photoModal?.querySelector("p");
const pricingModal = document.querySelector("#pricingModal");
const bookingModal = document.querySelector("#bookingModal");
const pages = Array.from(document.querySelectorAll(".page"));
const chatWidget = document.querySelector(".chat-widget");
const chatToggle = document.querySelector("[data-chat-toggle]");
const chatPanel = document.querySelector("#inquiryChat");
const chatClose = document.querySelector("[data-chat-close]");
const chatForm = document.querySelector("[data-chat-form]");
const bookingForm = document.querySelector("[data-booking-form]");
const bookingStatus = document.querySelector("[data-booking-status]");
const bookingDateInput = bookingForm?.querySelector('input[name="date"]');
const chatCompose = document.querySelector("[data-chat-compose]");
const chatSession = document.querySelector("[data-chat-session]");
const endChatButton = document.querySelector("[data-end-chat]");
const chatLog = document.querySelector("[data-chat-log]");
const chatStatus = document.querySelector("[data-chat-status]");
const chatUnread = document.querySelector("[data-chat-unread]");
const chatStorageKey = "tapStudioChatSession";
const chatRepliesKey = "tapStudioChatLastReply";
const chatMessageIdsKey = "tapStudioTelegramMessageIds";
const chatVisitorKey = "tapStudioChatVisitor";
let isSnapping = false;
let chatPollTimer;
let chatAudioContext;
let chatUnreadCount = 0;
const chatIntroMessage = "Hi! Send your question here and TAP Studio will reply in this chat.";
const chatStaffName = "TAP Studio";
const chatStaffLogo = "assets/tapstudiologo.png";
const turnstileSiteKey = document.querySelector('meta[name="turnstile-site-key"]')?.content.trim();
let turnstileLoadPromise;

const loadTurnstile = () => {
  if (!turnstileSiteKey) return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (turnstileLoadPromise) return turnstileLoadPromise;

  turnstileLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Security check could not load"));
    document.head.append(script);
  });

  return turnstileLoadPromise;
};

const getTurnstileToken = async (action) => {
  if (!turnstileSiteKey) return "";

  await loadTurnstile();

  if (!window.turnstile) {
    throw new Error("Security check is unavailable");
  }

  const container = document.createElement("div");
  container.className = "turnstile-holder";
  document.body.append(container);

  return new Promise((resolve, reject) => {
    const widgetId = window.turnstile.render(container, {
      sitekey: turnstileSiteKey,
      action,
      size: "invisible",
      execution: "execute",
      callback: (token) => {
        container.remove();
        resolve(token);
      },
      "error-callback": () => {
        container.remove();
        reject(new Error("Security check failed"));
      },
      "timeout-callback": () => {
        container.remove();
        reject(new Error("Security check timed out"));
      },
    });

    window.turnstile.execute(widgetId);
  });
};

const playPageTransition = () => {
  document.body.classList.remove("is-page-changing");
  void document.body.offsetWidth;
  document.body.classList.add("is-page-changing");
  window.setTimeout(() => {
    document.body.classList.remove("is-page-changing");
  }, 860);
};

const scrollDots = document.createElement("div");
scrollDots.className = "scroll-dots";
scrollDots.setAttribute("aria-label", "Page navigation");

const dotButtons = pages.map((page, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", `Go to section ${index + 1}`);
  button.addEventListener("click", () => {
    playPageTransition();
    page.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  scrollDots.append(button);
  return button;
});

document.body.append(scrollDots);

const setActivePage = (activePage) => {
  const activeIndex = pages.indexOf(activePage);
  pages.forEach((page, index) => {
    page.classList.toggle("is-active", page === activePage);
    dotButtons[index]?.classList.toggle("is-active", index === activeIndex);
    dotButtons[index]?.setAttribute("aria-current", index === activeIndex ? "true" : "false");
  });
};

setActivePage(pages[0]);

const pageObserver = new IntersectionObserver(
  (entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

    if (visible) {
      setActivePage(visible.target);
    }
  },
  {
    root,
    threshold: [0.45, 0.6, 0.75],
  }
);

pages.forEach((page) => pageObserver.observe(page));

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
      }
    });
  },
  {
    root,
    threshold: 0.35,
  }
);

reveals.forEach((item) => revealObserver.observe(item));

const snapToPage = (direction) => {
  if (!root || isSnapping || window.innerWidth <= 920 || photoModal?.open || pricingModal?.open || bookingModal?.open) return;

  const current = Math.round(root.scrollTop / root.clientHeight);
  const next = Math.max(0, Math.min(pages.length - 1, current + direction));
  if (next === current) return;

  isSnapping = true;
  root.classList.add("is-snapping");
  playPageTransition();
  pages[next].scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => {
    isSnapping = false;
    root.classList.remove("is-snapping");
  }, 760);
};

root?.addEventListener(
  "wheel",
  (event) => {
    if (Math.abs(event.deltaY) < 18) return;
    event.preventDefault();
    snapToPage(event.deltaY > 0 ? 1 : -1);
  },
  { passive: false }
);

const markMissingPhoto = (photo) => {
  photo.setAttribute("aria-hidden", "true");
  photo.removeAttribute("alt");
  photo.parentElement?.classList.add("image-missing");
};

photos.forEach((photo) => {
  photo.addEventListener("error", () => markMissingPhoto(photo));

  if (photo.complete && photo.naturalWidth === 0) {
    markMissingPhoto(photo);
  }
});

const openDialog = (dialog) => {
  if (!dialog) return;

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
};

const closeDialog = (dialog) => {
  if (!dialog) return;
  dialog.close?.();
  dialog.removeAttribute("open");
};

document.querySelectorAll(".feature-card img, .split-photos img, .booking-collage img, .page-photo, .hero-photo").forEach((photo) => {
  photo.addEventListener("click", () => {
    if (!photoModalImage || !photoModalCaption) return;

    photoModal.classList.remove("image-missing");
    photoModalImage.src = photo.currentSrc || photo.src;
    photoModalImage.alt = photo.alt || "TAP Studio photo";
    photoModalCaption.textContent = photo.alt || "TAP Studio photo";
    openDialog(photoModal);
  });
});

document.querySelectorAll("[data-open-pricing]").forEach((button) => {
  button.addEventListener("click", () => openDialog(pricingModal));
});

document.querySelectorAll("[data-open-booking]").forEach((button) => {
  button.addEventListener("click", () => openDialog(bookingModal));
});

if (bookingDateInput) {
  bookingDateInput.min = new Date().toISOString().slice(0, 10);
}

document.querySelector("[data-close-photo]")?.addEventListener("click", () => closeDialog(photoModal));
document.querySelector("[data-close-pricing]")?.addEventListener("click", () => closeDialog(pricingModal));
document.querySelector("[data-close-booking]")?.addEventListener("click", () => closeDialog(bookingModal));

[photoModal, pricingModal, bookingModal].forEach((dialog) => {
  dialog?.addEventListener("click", (event) => {
    if (event.target === dialog) {
      closeDialog(dialog);
    }
  });
});

bookingForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!bookingStatus) return;

  const submitButton = event.submitter || bookingForm.querySelector('button[type="submit"]');

  if (submitButton?.disabled) return;

  const formData = new FormData(bookingForm);
  const payload = Object.fromEntries(formData.entries());

  bookingStatus.textContent = "Sending booking request...";
  if (submitButton) {
    submitButton.disabled = true;
  }

  try {
    payload.turnstileToken = await getTurnstileToken("booking");

    const response = await fetch("/api/book", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Booking failed");
    }

    bookingForm.reset();
    bookingStatus.textContent = "Booking request sent. Please check your email for the calendar invitation.";
  } catch (error) {
    bookingStatus.textContent = error.message || "Booking failed. Please try again.";
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
});

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const target = document.querySelector(link.getAttribute("href"));
    if (!target) return;

    event.preventDefault();
    playPageTransition();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

const setChatOpen = (isOpen) => {
  chatWidget?.classList.toggle("is-open", isOpen);
  chatToggle?.setAttribute("aria-expanded", isOpen ? "true" : "false");

  if (chatPanel) {
    chatPanel.hidden = !isOpen;
  }

  if (isOpen) {
    setChatUnread(0);
    unlockChatAudio();
    loadChatReplies();
    startChatPolling();
  } else if (getChatMessageIds().length) {
    startChatPolling();
  } else {
    stopChatPolling();
  }
};

chatToggle?.addEventListener("click", () => {
  unlockChatAudio();
  setChatOpen(!chatWidget?.classList.contains("is-open"));
});

chatClose?.addEventListener("click", () => setChatOpen(false));

const setChatSessionView = (isSessionActive) => {
  if (chatCompose) {
    chatCompose.hidden = isSessionActive;
    chatCompose.querySelectorAll("input, textarea, button").forEach((field) => {
      field.disabled = isSessionActive;
    });
  }

  if (chatSession) {
    chatSession.hidden = !isSessionActive;
    chatSession.querySelectorAll("input, textarea, button").forEach((field) => {
      field.disabled = !isSessionActive;
    });
  }
};

const getChatVisitor = () => {
  try {
    return JSON.parse(window.localStorage.getItem(chatVisitorKey) || "{}");
  } catch {
    return {};
  }
};

const rememberChatVisitor = ({ name, contact }) => {
  window.localStorage.setItem(chatVisitorKey, JSON.stringify({ name, contact }));
};

const getChatSessionId = () => {
  const existing = window.localStorage.getItem(chatStorageKey);

  if (existing) return existing;

  const generated =
    window.crypto?.randomUUID?.() ||
    `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;

  window.localStorage.setItem(chatStorageKey, generated);
  return generated;
};

const formatChatTime = (date = new Date()) =>
  date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

const setChatUnread = (count) => {
  chatUnreadCount = Math.max(0, count);

  if (!chatUnread) return;

  chatUnread.hidden = chatUnreadCount === 0;
  chatUnread.textContent = chatUnreadCount > 9 ? "9+" : String(chatUnreadCount);
};

const appendChatBubble = (text, type = "visitor") => {
  if (!chatLog) return;

  const bubble = document.createElement("p");
  bubble.className = `chat-bubble ${type}`;

  if (type === "staff") {
    const identity = document.createElement("span");
    identity.className = "chat-staff";

    const logo = document.createElement("img");
    logo.src = chatStaffLogo;
    logo.alt = "";
    logo.loading = "lazy";

    const name = document.createElement("span");
    name.textContent = chatStaffName;

    const message = document.createElement("span");
    message.className = "chat-message";
    message.textContent = text;

    identity.append(logo, name);
    bubble.append(identity, message);
  } else {
    bubble.textContent = text;
  }

  const meta = document.createElement("span");
  meta.className = "chat-meta";
  meta.textContent = formatChatTime();
  bubble.append(meta);

  chatLog.append(bubble);
  chatLog.scrollTop = chatLog.scrollHeight;
  return bubble;
};

const setChatBubbleStatus = (bubble, status = "") => {
  const meta = bubble?.querySelector(".chat-meta");

  if (!meta) return;

  meta.textContent = status ? `${formatChatTime()} · ${status}` : formatChatTime();
  bubble.classList.toggle("is-failed", status === "Not sent");
};

const getChatMessageIds = () => {
  try {
    return JSON.parse(window.localStorage.getItem(chatMessageIdsKey) || "[]");
  } catch {
    return [];
  }
};

const rememberChatMessageId = (messageId) => {
  if (!messageId) return;

  const ids = getChatMessageIds();
  const nextIds = [...new Set([...ids, Number(messageId)])].slice(-20);
  window.localStorage.setItem(chatMessageIdsKey, JSON.stringify(nextIds));
};

const getChatAudioContext = () => {
  const AudioContext = window.AudioContext || window.webkitAudioContext;

  if (!AudioContext) return null;

  chatAudioContext = chatAudioContext || new AudioContext();
  return chatAudioContext;
};

const unlockChatAudio = () => {
  try {
    const audioContext = getChatAudioContext();

    if (audioContext?.state === "suspended") {
      audioContext.resume();
    }
  } catch {
    // Browsers can block audio until they are ready to allow it.
  }
};

const playChatNotification = () => {
  try {
    const audioContext = getChatAudioContext();

    if (!audioContext) return;

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    const now = audioContext.currentTime;
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    gain.connect(audioContext.destination);

    [740, 980].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.11);
      oscillator.connect(gain);
      oscillator.start(now + index * 0.11);
      oscillator.stop(now + index * 0.11 + 0.18);
    });
  } catch {
    // Sound notifications are a nice-to-have and can be blocked by browser policy.
  }
};

const loadChatReplies = async () => {
  if (!chatLog) return;

  const sessionId = getChatSessionId();
  const after = Number(window.localStorage.getItem(chatRepliesKey) || 0);
  const messageIds = getChatMessageIds();

  if (!messageIds.length) return;

  try {
    const params = new URLSearchParams({
      mode: "updates",
      sessionId,
      after: String(after),
      messageIds: messageIds.join(","),
    });
    const response = await fetch(`/api/chat?${params}`);

    if (!response.ok) return;

    const data = await response.json();
    const replies = data.replies || [];
    const isChatOpen = Boolean(chatWidget?.classList.contains("is-open"));

    replies.forEach((reply) => {
      appendChatBubble(reply.text, "staff");
      window.localStorage.setItem(chatRepliesKey, String(reply.id));
    });

    if (replies.length) {
      playChatNotification();

      if (chatStatus) {
        chatStatus.textContent = "New reply from TAP Studio.";
      }

      if (!isChatOpen) {
        setChatUnread(chatUnreadCount + replies.length);
      }
    }
  } catch {
    // Polling is best-effort; the submit state shows actionable errors.
  }
};

const startChatPolling = () => {
  window.clearInterval(chatPollTimer);
  chatPollTimer = window.setInterval(loadChatReplies, 3500);
};

const stopChatPolling = () => {
  window.clearInterval(chatPollTimer);
};

const resetChatLog = () => {
  if (!chatLog) return;

  chatLog.textContent = "";
  appendChatBubble(chatIntroMessage, "staff");
};

const endChat = async () => {
  const sessionId = window.localStorage.getItem(chatStorageKey);
  const visitor = getChatVisitor();

  stopChatPolling();

  if (chatStatus) {
    chatStatus.textContent = "Ending chat...";
  }

  if (endChatButton) {
    endChatButton.disabled = true;
  }

  try {
    if (sessionId) {
      await fetch("/api/chat?mode=end", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          name: visitor.name,
          contact: visitor.contact,
        }),
      });
    }
  } catch {
    // The visitor should still be able to end the local chat if the notice fails.
  }

  window.localStorage.removeItem(chatStorageKey);
  window.localStorage.removeItem(chatRepliesKey);
  window.localStorage.removeItem(chatMessageIdsKey);
  window.localStorage.removeItem(chatVisitorKey);
  chatForm?.reset();
  setChatUnread(0);
  resetChatLog();
  setChatSessionView(false);

  if (chatStatus) {
    chatStatus.textContent = "Chat ended.";
  }

  if (endChatButton) {
    endChatButton.disabled = false;
  }
};

const hasActiveChatSession = getChatMessageIds().length > 0;
setChatSessionView(hasActiveChatSession);
resetChatLog();

if (hasActiveChatSession) {
  startChatPolling();
}

endChatButton?.addEventListener("click", endChat);

chatPanel?.addEventListener("pointerdown", unlockChatAudio);
chatPanel?.addEventListener("focusin", unlockChatAudio);

const getActiveChatSubmitButton = () => {
  if (!chatSession?.hidden) {
    return chatSession.querySelector('button[type="submit"]');
  }

  return chatCompose?.querySelector('button[type="submit"]') || chatForm?.querySelector('button[type="submit"]');
};

chatForm?.querySelectorAll("textarea").forEach((textarea) => {
  textarea.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;

    event.preventDefault();
    const submitButton = getActiveChatSubmitButton();

    if (submitButton?.disabled) return;

    if (submitButton) {
      chatForm.requestSubmit(submitButton);
    } else {
      chatForm.requestSubmit();
    }
  });
});

chatForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!chatStatus) return;

  unlockChatAudio();

  const submitButton = event.submitter || getActiveChatSubmitButton();

  if (submitButton?.disabled) return;

  const formData = new FormData(chatForm);
  const visitor = getChatVisitor();
  const isSessionActive = !chatSession?.hidden;
  const payload = {
    sessionId: getChatSessionId(),
    name: isSessionActive ? visitor.name || "Website visitor" : formData.get("name"),
    contact: isSessionActive ? visitor.contact || "Live chat session" : formData.get("contact"),
    message: isSessionActive ? formData.get("sessionMessage") : formData.get("message"),
    website: formData.get("website"),
  };

  chatStatus.textContent = "Sending...";
  if (submitButton) {
    submitButton.disabled = true;
  }
  const visitorBubble = appendChatBubble(payload.message, "visitor");
  setChatBubbleStatus(visitorBubble, "Sending");

  try {
    payload.turnstileToken = await getTurnstileToken("chat");

    const response = await fetch("/api/chat?mode=send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Message failed");
    }

    rememberChatMessageId(data.messageId);
    rememberChatVisitor(payload);
    chatForm.elements.message.value = "";
    chatForm.elements.sessionMessage.value = "";
    setChatBubbleStatus(visitorBubble);
    setChatSessionView(true);
    chatStatus.textContent = "";
    startChatPolling();
  } catch (error) {
    setChatBubbleStatus(visitorBubble, "Not sent");
    chatStatus.textContent = error.message || "Message failed. Please try again.";
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
});
