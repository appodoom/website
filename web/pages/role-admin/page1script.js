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

export async function page1script(p) {
  const questionsContainer = document.getElementById("questionsList");
  const submitButton = document.querySelector(".main_content_submit");
  const addQuestionButton = document.getElementById("add_question");
  const dict = {};

  function createModal() {
    const modal = document.createElement("div");
    modal.id = "add-question-modal";
    modal.className = "modal";

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">Add New Question</h3>
          <button class="close-button" type="button">&times;</button>
        </div>

        <form id="add-question-form">
          <div class="form-group">
            <label for="question-text">Question *</label>
            <input type="text" id="question-text" name="question" required maxlength="255">
          </div>

          <div class="form-group">
            <label for="question-description">Description</label>
            <textarea id="question-description" name="description" maxlength="255"></textarea>
          </div>

          <div class="form-group">
            <label for="question-active">Status</label>
            <select id="question-active" name="active">
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn" id="cancel-add-question">Cancel</button>
            <button type="submit" class="btn btn-primary">Add Question</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
    return modal;
  }

  function getModal() {
    return document.getElementById("add-question-modal") || createModal();
  }

  function showModal() {
    const modal = getModal();
    modal.classList.add("open");

    const form = document.getElementById("add-question-form");
    form.reset();
    document.getElementById("question-active").value = "true";
  }

  function hideModal() {
    const modal = document.getElementById("add-question-modal");
    if (modal) {
      modal.classList.remove("open");
    }
  }

  async function handleAddQuestion(formData) {
    try {
      const response = await fetch("/web/api/questions/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: formData.get("question"),
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

      showToast("Question added successfully.");
      hideModal();
      await loadQuestions();
    } catch (error) {
      showToast(`Unable to add question: ${error.message}`);
    }
  }

  async function loadQuestions() {
    try {
      const res = await fetch("/web/api/questions/");

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error);
      }

      if (res.redirected) {
        window.location.href = res.url;
        return;
      }

      const { questions } = await res.json();

      if (!questions || questions.length === 0) {
        questionsContainer.innerHTML = `
          <div class="admin-row">
            <div class="admin-row-main">
              <div class="admin-row-title">No questions available</div>
              <div class="admin-row-subtitle">Add a question to begin.</div>
            </div>
          </div>
        `;
        return;
      }

      questionsContainer.innerHTML = "";
      const fragment = document.createDocumentFragment();

      for (const { id, question, active, description } of questions) {
        dict[id] = active;

        const row = document.createElement("div");
        row.className = "admin-row";
        row.dataset.questionId = id;

        const main = document.createElement("div");
        main.className = "admin-row-main";

        const title = document.createElement("div");
        title.className = "admin-row-title";
        title.textContent = question;

        const subtitle = document.createElement("div");
        subtitle.className = "admin-row-subtitle";
        subtitle.textContent = description || `Question ID: ${id}`;

        const controls = document.createElement("div");
        controls.className = "admin-row-controls";

        const activeSelect = document.createElement("select");
        activeSelect.name = "actions";
        activeSelect.dataset.questionId = id;

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

      questionsContainer.appendChild(fragment);
    } catch (error) {
      showToast(error.message);
    }
  }

  submitButton.addEventListener("click", async () => {
    try {
      const res = await fetch("/web/api/questions/", {
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

  addQuestionButton.addEventListener("click", showModal);

  document.addEventListener("click", (event) => {
    const modal = document.getElementById("add-question-modal");
    if (!modal) return;

    if (
      event.target.classList.contains("close-button") ||
      event.target.id === "cancel-add-question" ||
      event.target === modal
    ) {
      hideModal();
    }
  });

  document.addEventListener("submit", async (event) => {
    if (event.target.id === "add-question-form") {
      event.preventDefault();
      const formData = new FormData(event.target);
      await handleAddQuestion(formData);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideModal();
    }
  });

  await loadQuestions();
}
