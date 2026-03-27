const pageId = [0];

document.getElementById("dummy").addEventListener("click", () => {
  renderPage(pageId);
});

function setActiveTab(currentPage) {
  const loginTab = document.getElementById("tab-login");
  const registerTab = document.getElementById("tab-register");

  if (!loginTab || !registerTab) return;

  loginTab.classList.toggle("active", currentPage === 0);
  registerTab.classList.toggle("active", currentPage === 1);
}

async function renderPage(pageIdRef) {
  const container = document.getElementById("main_content");
  container.innerHTML = "";

  const tpl = document.getElementById(`page-${pageIdRef[0]}`);
  container.appendChild(tpl.content.cloneNode(true));

  setActiveTab(pageIdRef[0]);

  try {
    const module = await import(`./page${pageIdRef[0]}script.js`);
    const fn = module[`page${pageIdRef[0]}script`];

    if (typeof fn === "function") {
      fn(pageIdRef);
    }
  } catch (error) {
    console.error("Could not load page script:", error);
  }
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
    if (usernameDisplay) {
      usernameDisplay.textContent = "Account";
    }
  }
}

document.getElementById("tab-login").addEventListener("click", () => {
  pageId[0] = 0;
  renderPage(pageId);
});

document.getElementById("tab-register").addEventListener("click", () => {
  pageId[0] = 1;
  renderPage(pageId);
});

(async () => {
  await initUserMenu();
  await renderPage(pageId);
})();
