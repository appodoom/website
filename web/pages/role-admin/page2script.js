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

export async function page2script(p) {
  const tagsContainer = document.getElementById("tagsList");
  const submitButton = document.querySelector(".main_content_submit");
  const addTagButton = document.getElementById("add_tag");
  const dict = {};

  function createModal() {
    const modal = document.createElement("div");
    modal.id = "add-tag-modal";
    modal.className = "modal";

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">Add New Tag</h3>
          <button class="close-button" type="button">&times;</button>
        </div>

        <form id="add-tag-form">
          <div class="form-group">
            <label for="tag-text">Tag label *</label>
            <input type="text" id="tag-text" name="tag" required maxlength="255">
          </div>

          <div class="form-group">
            <label for="tag-description">Description</label>
            <textarea id="tag-description" name="description" maxlength="255"></textarea>
          </div>

          <div class="form-group">
            <label for="tag-active">Status</label>
            <select id="tag-active" name="active">
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn" id="cancel-add-tag">Cancel</button>
            <button type="submit" class="btn btn-primary">Add Tag</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
    return modal;
  }

  function getModal() {
    return document.getElementById("add-tag-modal") || createModal();
  }

  function showModal() {
    const modal = getModal();
    modal.classList.add("open");

    const form = document.getElementById("add-tag-form");
    form.reset();
    document.getElementById("tag-active").value = "true";
  }

  function hideModal() {
    const modal = document.getElementById("add-tag-modal");
    if (modal) {
      modal.classList.remove("open");
    }
  }

  async function handleAddTag(formData) {
    try {
      const response = await fetch("/web/api/tags/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tag: formData.get("tag"),
          description: formData.get("description"),
          active: formData.get("active") === "true",
        }),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error);
      }

      if (response.redirected) {
        window.location.href = response.url;
        return;
      }

      showToast("Tag added successfully.");
      hideModal();
      await loadTags();
    } catch (error) {
      showToast(`Unable to add tag: ${error.message}`);
    }
  }

  async function loadTags() {
    try {
      const res = await fetch("/web/api/tags/");

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error);
      }

      if (res.redirected) {
        window.location.href = res.url;
        return;
      }

      const { tags } = await res.json();

      if (!tags || tags.length === 0) {
        tagsContainer.innerHTML = `
          <div class="admin-row">
            <div class="admin-row-main">
              <div class="admin-row-title">No tags available</div>
              <div class="admin-row-subtitle">Add a tag to begin.</div>
            </div>
          </div>
        `;
        return;
      }

      tagsContainer.innerHTML = "";
      const fragment = document.createDocumentFragment();

      for (const { id, tag, active, description } of tags) {
        dict[id] = active;

        const row = document.createElement("div");
        row.className = "admin-row";
        row.dataset.tagId = id;

        const main = document.createElement("div");
        main.className = "admin-row-main";

        const title = document.createElement("div");
        title.className = "admin-row-title";
        title.textContent = tag;

        const subtitle = document.createElement("div");
        subtitle.className = "admin-row-subtitle";
        subtitle.textContent = description || `Tag ID: ${id}`;

        const controls = document.createElement("div");
        controls.className = "admin-row-controls";

        const activeSelect = document.createElement("select");
        activeSelect.name = "actions";
        activeSelect.dataset.tagId = id;

        const options = [
          { value: "true", text: "Active" },
          { value: "false", text: "Inactive" },
        ];

        options.forEach((optionData) => {
          const option = document.createElement("option");
          option.value = optionData.value;
          option.textContent = optionData.text;

          if (String(active) === optionData.value) {
            option.selected = true;
          }

          activeSelect.appendChild(option);
        });

        activeSelect.addEventListener("change", function () {
          dict[id] = this.value;
        });

        main.appendChild(title);
        main.appendChild(subtitle);
        controls.appendChild(activeSelect);
        row.appendChild(main);
        row.appendChild(controls);

        fragment.appendChild(row);
      }

      tagsContainer.appendChild(fragment);
    } catch (error) {
      showToast(error.message);
    }
  }

  submitButton.addEventListener("click", async () => {
    try {
      const res = await fetch("/web/api/tags/", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(dict),
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
    } catch (error) {
      showToast("Unable to save changes.");
    }
  });

  addTagButton.addEventListener("click", showModal);

  document.addEventListener("click", (event) => {
    const modal = document.getElementById("add-tag-modal");
    if (!modal) return;

    if (
      event.target.classList.contains("close-button") ||
      event.target.id === "cancel-add-tag" ||
      event.target === modal
    ) {
      hideModal();
    }
  });

  document.addEventListener("submit", async (event) => {
    if (event.target.id === "add-tag-form") {
      event.preventDefault();
      const formData = new FormData(event.target);
      await handleAddTag(formData);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideModal();
    }
  });

  await loadTags();
}
