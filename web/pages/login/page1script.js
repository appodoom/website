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

export function page1script(p) {
  const switchButton = document.getElementById("switch_page");
  const form = document.getElementById("register-form");
  const usernameInput = document.getElementById("register-username");
  const passwordInput = document.getElementById("register-password");

  switchButton.addEventListener("click", () => {
    p[0] = 0;
    document.getElementById("dummy").click();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const user = usernameInput.value.trim();
    const pass = passwordInput.value.trim();

    if (!user || !pass) {
      showToast("Please complete all required fields before continuing.");
      return;
    }

    try {
      const res = await fetch("/web/api/register/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user, pass }),
      });

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error);
      }

      if (res.redirected) {
        window.location.href = res.url;
      }
    } catch (e) {
      showToast(
        e.message || "We were unable to create your account at this time.",
      );
    }
  });
}
