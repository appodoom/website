const pageId = [0];

document.getElementById("dummy").addEventListener("click", () => {
  renderPage(pageId);
});

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

async function initUserMenu() {
  try {
    const response = await fetch("/web/api/me/");

    if (!response.ok) {
      throw new Error("Failed to fetch user data");
    }

    const userData = await response.json();

    const usernameDisplay = document.getElementById("usernameDisplay");
    const dropdownContent = document.getElementById("dropdownContent");
    const userMenuToggle = document.getElementById("userMenuToggle");
    const userDropdown = document.getElementById("userDropdown");

    usernameDisplay.textContent = userData.username || "Account";
    dropdownContent.innerHTML = "";

    Object.entries(userData).forEach(([key, value]) => {
      if (key === "username") return;

      const link = document.createElement("a");
      link.href = value;
      link.textContent = key.charAt(0).toUpperCase() + key.slice(1);
      dropdownContent.appendChild(link);
    });

    userMenuToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      userDropdown.classList.toggle("open");
      userMenuToggle.classList.toggle("open");
    });

    document.addEventListener("click", (event) => {
      if (
        !userMenuToggle.contains(event.target) &&
        !userDropdown.contains(event.target)
      ) {
        userDropdown.classList.remove("open");
        userMenuToggle.classList.remove("open");
      }
    });
  } catch (error) {
    console.error("Error initializing user menu:", error);
    const usernameDisplay = document.getElementById("usernameDisplay");
    if (usernameDisplay) usernameDisplay.textContent = "Account";
    showToast("We were unable to load the account menu.");
  }
}

async function renderPage(pageIdRef) {
  const container = document.getElementById("main_content");
  container.innerHTML = "";

  const tpl = document.getElementById(`page-${pageIdRef[0]}`);
  container.appendChild(tpl.content.cloneNode(true));

  try {
    const module = await import(`./page${pageIdRef[0]}script.js`);
    const fn = module[`page${pageIdRef[0]}script`];

    if (typeof fn === "function") {
      fn(pageIdRef);
    }
  } catch (error) {
    console.error("Could not load page script:", error);
    showToast("This page could not be loaded properly.");
  }
}

(async () => {
  await initUserMenu();
  await renderPage(pageId);
})();
