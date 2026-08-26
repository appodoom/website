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

function setActiveStep(pageId) {
  document.querySelectorAll(".step-pill").forEach((pill) => {
    pill.classList.toggle(
      "active",
      Number(pill.dataset.step) === Number(pageId),
    );
  });
}

document.getElementById("dummy").addEventListener("click", () => {
  const pageId = localStorage.getItem("currPage");
  renderPage(pageId);
});

async function renderPage(pageId) {
  // Page 1 was the removed shared-matrix screen. Resume those sessions in
  // the skeleton builder instead of trying to render a missing template.
  if (Number(pageId) === 1) {
    pageId = 2;
    localStorage.setItem("currPage", 2);
  }

  const container = document.getElementById("main_content");
  container.innerHTML = "";

  const tpl = document.getElementById(`page-${pageId}`);
  container.appendChild(tpl.content.cloneNode(true));
  setActiveStep(pageId);

  try {
    const module = await import(`./page${pageId}script.js`);
    const fn = module[`page${pageId}script`];
    if (typeof fn === "function") {
      fn();
    }
  } catch (error) {
    console.error("could not load", error);
    showToast("This section could not be loaded properly.");
  }
}

document.getElementById("go_back").addEventListener("click", () => {
  localStorage.setItem("currPage", 0);
  renderPage(0);
});

(async () => {
  const currPage = Number(localStorage.getItem("currPage")) || 0;
  await renderPage(currPage);
})();
