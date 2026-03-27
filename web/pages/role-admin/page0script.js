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

export async function page0script(p) {
  const container = document.getElementById("usersList");
  const submitButton = document.querySelector(".main_content_submit");
  const dict = {};

  async function loadUsers() {
    try {
      const res = await fetch("/web/api/users/");

      if (res.redirected) {
        window.location.href = res.url;
        return;
      }

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error);
      }

      const data = await res.json();
      const { users } = data;

      if (!users || users.length <= 1) {
        container.innerHTML = `
          <div class="admin-row">
            <div class="admin-row-main">
              <div class="admin-row-title">No users available</div>
              <div class="admin-row-subtitle">There are no non-admin users to manage.</div>
            </div>
          </div>
        `;
        return;
      }

      container.innerHTML = "";
      const fragment = document.createDocumentFragment();

      for (const { id, username, role } of users) {
        if (role === "admin") continue;

        dict[id] = role;

        const row = document.createElement("div");
        row.className = "admin-row";
        row.dataset.userId = id;

        const main = document.createElement("div");
        main.className = "admin-row-main";

        const title = document.createElement("div");
        title.className = "admin-row-title";
        title.textContent = username;

        const subtitle = document.createElement("div");
        subtitle.className = "admin-row-subtitle";
        subtitle.textContent = `Current role: ${role}`;

        const controls = document.createElement("div");
        controls.className = "admin-row-controls";

        const roleSelect = document.createElement("select");
        roleSelect.name = "actions";
        roleSelect.dataset.userId = id;

        const options = [
          { value: "none", text: "Decline access" },
          { value: "generate", text: "Generator" },
          { value: "rate", text: "Rater" },
        ];

        options.forEach((optionData) => {
          const option = document.createElement("option");
          option.value = optionData.value;
          option.textContent = optionData.text;

          if (optionData.value === role) {
            option.selected = true;
          }

          roleSelect.appendChild(option);
        });

        roleSelect.addEventListener("change", function () {
          dict[id] = this.value;
          subtitle.textContent = `Current role: ${this.value}`;
        });

        main.appendChild(title);
        main.appendChild(subtitle);
        controls.appendChild(roleSelect);
        row.appendChild(main);
        row.appendChild(controls);

        fragment.appendChild(row);
      }

      if (!fragment.childNodes.length) {
        container.innerHTML = `
          <div class="admin-row">
            <div class="admin-row-main">
              <div class="admin-row-title">No users available</div>
              <div class="admin-row-subtitle">There are no non-admin users to manage.</div>
            </div>
          </div>
        `;
        return;
      }

      container.appendChild(fragment);
    } catch (error) {
      showToast(error.message || "Unable to load users.");
    }
  }

  submitButton.addEventListener("click", async () => {
    try {
      const res = await fetch("/web/api/roles/", {
        method: "POST",
        body: JSON.stringify(dict),
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const { error } = await res.json();
        showToast(error);
        return;
      }

      if (res.redirected) {
        window.location.href = res.url;
        return;
      }

      showToast("Changes applied successfully.");
      await loadUsers();
    } catch (error) {
      showToast("Unable to save role changes.");
    }
  });

  await loadUsers();
}
