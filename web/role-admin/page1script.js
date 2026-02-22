export async function page1script(p) {
    function showToast(message, duration = 3000) {
        let container = document.getElementById("toast-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "toast-container";
            document.body.appendChild(container);
        }
        container.style.position = "fixed";
        container.style.bottom = "20px";
        container.style.left = "50%";
        container.style.transform = "translateX(-50%)";
        container.style.zIndex = "9999";

        const toast = document.createElement("div");
        toast.textContent = message;
        toast.style.background = "rgba(0,0,0,0.8)";
        toast.style.color = "#fff";
        toast.style.padding = "10px 20px";
        toast.style.marginTop = "10px";
        toast.style.borderRadius = "5px";
        toast.style.fontFamily = "sans-serif";
        toast.style.fontSize = "14px";
        toast.style.boxShadow = "0 2px 6px rgba(0,0,0,0.3)";
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.3s ease";

        container.appendChild(toast);

        // Fade in
        requestAnimationFrame(() => {
            toast.style.opacity = "1";
        });

        // Fade out after duration
        setTimeout(() => {
            toast.style.opacity = "0";
            toast.addEventListener("transitionend", () => {
                toast.remove();
            });
        }, duration);
    }

    // Create and add modal to the DOM
    function createModal() {
        const modal = document.createElement('div');
        modal.id = 'add-question-modal';
        modal.className = 'modal';

        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">Add New Question</h3>
                    <button class="close-button">&times;</button>
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
                        <button type="button" class="btn-secondary" id="cancel-add-question">Cancel</button>
                        <button type="submit" class="btn-primary">Add Question</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modal);
        return modal;
    }

    // Modal management functions
    function showModal() {
        const modal = document.getElementById('add-question-modal') || createModal();
        modal.style.display = 'block';

        // Reset form
        const form = document.getElementById('add-question-form');
        form.reset();
        document.getElementById('question-active').value = 'true';
    }

    function hideModal() {
        const modal = document.getElementById('add-question-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // Handle form submission
    async function handleAddQuestion(formData) {
        try {

            const response = await fetch('/web/api/questions/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    question: formData.get('question'),
                    description: formData.get('description'),
                    active: formData.get('active') === 'true'
                })
            });

            if (!response.ok) {
                const { error } = await response.json();
                throw new Error(error);
            }

            if (response.redirected) {
                window.location.href = response.url;
                return;
            }


            showToast('Question added successfully!');
            hideModal();

            // Refresh the questions list
            await loadQuestions();

        } catch (error) {
            showToast(`Error adding question: ${error.message}`);
        }
    }

    document.getElementById("switch_page").addEventListener("click", () => {
        p[0] = Number(!p[0]);
        document.getElementById("dummy").click();
    });

    // Add event listener for the "Add a question" button
    document.getElementById("add_question").addEventListener("click", showModal);

    const container = document.querySelector(".questions");
    const dict = {}; // Make sure this is declared

    document.querySelector(".main_content_submit").addEventListener("click", async (e) => {
        const res = await fetch("/web/api/questions/", {
            method: 'PUT',
            headers: {
                'Content-Type': "application/json"
            },
            body: JSON.stringify(dict)
        })

        if (!res.ok) {
            const { error } = await res.json();
            showToast(error);
            return;
        }

        if (res.redirected) {
            window.location.href = res.url;
            return;
        }

        showToast("Changes applied successfully!");
    })

    // Load questions function (extracted from your existing code)
    async function loadQuestions() {
        try {
            const res = await fetch("/web/api/questions/");
            if (!res.ok) {
                const { error } = await res.json();
                throw new Error(error);
            }

            if (res.redirected) {
                window.location.href = res.url;
            }

            const { questions } = await res.json();

            if (!questions || questions.length === 0) {
                container.textContent = "No questions to show.";
                return;
            }

            container.innerHTML = '';
            const fragment = document.createDocumentFragment();

            for (const { id, question, active } of questions) {
                dict[id] = active;
                const questionElement = document.createElement("div");
                questionElement.className = "question";
                questionElement.dataset.questionId = id;

                const questionInfo = document.createElement("span");
                questionInfo.className = "question";
                questionInfo.textContent = `${question}`;

                const activeSelect = document.createElement("select");
                activeSelect.name = "actions";
                activeSelect.dataset.questionId = id;

                const options = [
                    { value: true, text: "Activate" },
                    { value: false, text: "Deactivate" },
                ];

                options.forEach(optionData => {
                    const option = document.createElement("option");
                    option.value = optionData.value;
                    option.textContent = optionData.text;

                    if (optionData.value === active) {
                        option.selected = true;
                    }

                    activeSelect.appendChild(option);
                });

                activeSelect.addEventListener("change", function() {
                    dict[id] = this.value;
                });

                questionElement.appendChild(questionInfo);
                questionElement.appendChild(activeSelect);
                fragment.appendChild(questionElement);
            }

            container.appendChild(fragment);

        } catch (e) {
            showToast(e.message);
            return;
        }
    }

    // Set up modal event listeners
    document.addEventListener('click', function(event) {
        const modal = document.getElementById('add-question-modal');
        if (!modal) return;

        // Close modal when clicking X, cancel button, or outside modal
        if (event.target.classList.contains('close-button') ||
            event.target.id === 'cancel-add-question' ||
            event.target === modal) {
            hideModal();
        }
    });



    // Handle form submission
    document.addEventListener('submit', async function(event) {
        if (event.target.id === 'add-question-form') {
            event.preventDefault();
            const formData = new FormData(event.target);
            await handleAddQuestion(formData);
        }
    });

    // Close modal with Escape key
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            hideModal();
        }
    });

    // Initial load of questions
    await loadQuestions();
}