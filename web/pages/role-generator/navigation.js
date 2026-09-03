const pageId = [0];

function showToast(message, duration = 3200) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");

  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  setTimeout(() => {
    toast.classList.remove("show");
    toast.addEventListener("transitionend", () => toast.remove(), {
      once: true,
    });
  }, duration);
}

function setActiveStep(page) {
  document.querySelectorAll(".step-pill").forEach((pill) => {
    pill.classList.toggle("active", Number(pill.dataset.step) === Number(page));
  });
}

document.getElementById("dummy").addEventListener("click", () => {
  renderPage(pageId);
});

async function renderPage(pageIdRef) {
  const container = document.getElementById("main_content");
  container.innerHTML = "";

  const tpl = document.getElementById(`page-${pageIdRef[0]}`);

  if (!tpl) {
    console.error(`Template page-${pageIdRef[0]} does not exist.`);
    showToast("This section could not be loaded properly.");
    return;
  }

  container.appendChild(tpl.content.cloneNode(true));

  setActiveStep(pageIdRef[0]);

  try {
    const module = await import(`./page${pageIdRef[0]}script.js`);
    const fn = module[`page${pageIdRef[0]}script`];

    if (typeof fn === "function") {
      await fn(pageIdRef);
    }
  } catch (error) {
    console.error("Could not load page script:", error);
    showToast("This section could not be loaded properly.");
  }
}

(async () => {
  await renderPage(pageId);
})();
