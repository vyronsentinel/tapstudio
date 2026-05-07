const root = document.querySelector(".snap-pages");
const reveals = document.querySelectorAll(".reveal");
const photos = document.querySelectorAll("img:not(.modal-photo)");
const photoModal = document.querySelector("#photoModal");
const photoModalImage = photoModal?.querySelector("img");
const photoModalCaption = photoModal?.querySelector("p");
const pricingModal = document.querySelector("#pricingModal");
const pages = Array.from(document.querySelectorAll(".page"));
const chatWidget = document.querySelector(".chat-widget");
const chatToggle = document.querySelector("[data-chat-toggle]");
const chatPanel = document.querySelector("#inquiryChat");
const chatClose = document.querySelector("[data-chat-close]");
const chatForm = document.querySelector("[data-chat-form]");
const chatStatus = document.querySelector("[data-chat-status]");
let isSnapping = false;

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
  if (!root || isSnapping || window.innerWidth <= 920 || photoModal?.open || pricingModal?.open) return;

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

document.querySelector("[data-close-photo]")?.addEventListener("click", () => closeDialog(photoModal));
document.querySelector("[data-close-pricing]")?.addEventListener("click", () => closeDialog(pricingModal));

[photoModal, pricingModal].forEach((dialog) => {
  dialog?.addEventListener("click", (event) => {
    if (event.target === dialog) {
      closeDialog(dialog);
    }
  });
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
};

chatToggle?.addEventListener("click", () => {
  setChatOpen(!chatWidget?.classList.contains("is-open"));
});

chatClose?.addEventListener("click", () => setChatOpen(false));

chatForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!chatStatus) return;

  const submitButton = chatForm.querySelector('button[type="submit"]');
  const formData = new FormData(chatForm);
  const payload = {
    name: formData.get("name"),
    contact: formData.get("contact"),
    message: formData.get("message"),
  };

  chatStatus.textContent = "Sending...";
  submitButton.disabled = true;

  try {
    const response = await fetch("/api/send-inquiry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Message failed");
    }

    chatForm.reset();
    chatStatus.textContent = "Inquiry sent. TAP Studio will reply soon.";
  } catch (error) {
    chatStatus.textContent = error.message || "Message failed. Please try again.";
  } finally {
    submitButton.disabled = false;
  }
});
