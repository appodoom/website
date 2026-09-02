const NUMERIC_OPERATORS = [
  { value: "=", label: "=" },
  { value: "!=", label: "≠" },
  { value: ">", label: ">" },
  { value: ">=", label: "≥" },
  { value: "<", label: "<" },
  { value: "<=", label: "≤" },
];

const FIELD_DEFINITIONS = [
  { value: "bpm", label: "BPM", kind: "number", min: 0, exclusiveMin: true },
  { value: "num_cycles", label: "Number of cycles", kind: "number", min: 1, integer: true },
  { value: "maxsubd", label: "Maximum subdivision", kind: "number", min: 1, max: 16, integer: true },
  { value: "num_hits", label: "Number of hits", kind: "number", min: 0, integer: true },
  { value: "skeletons", label: "Skeleton", kind: "skeleton" },
  { value: "shift_proba", label: "Shift probability", kind: "number", min: 0, max: 1 },
  { value: "generation_time", label: "Generation time", kind: "number", min: 0 },
  { value: "amplitudeVariation", label: "Amplitude variation", kind: "number", min: 0, max: 1 },
  { value: "allowed_tempo_deviation", label: "Allowed tempo deviation", kind: "number", min: 0 },
];

const SOUND_MAP = {
  Doom: "D",
  "Open Tak": "OTA",
  "Open Tik": "OTI",
  Pa2: "PA2",
  Silence: "S",
};

const SOUND_COLORS = {
  Doom: "#e74c3c",
  "Open Tak": "#3498db",
  "Open Tik": "#9b59b6",
  Pa2: "#1abc9c",
  Silence: "#95a5a6",
};

const SOUNDS = Object.keys(SOUND_MAP);

function showToast(message, duration = 3200) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  }, duration);
}

function cloneSkeleton(skeleton) {
  if (!skeleton) return null;
  return {
    length: Number(skeleton.length),
    hits: skeleton.hits.map((hit) => ({ beat: Number(hit.beat), hit: hit.hit })),
  };
}

function validateSkeleton(skeleton) {
  if (!skeleton || !Number.isFinite(Number(skeleton.length)) || Number(skeleton.length) <= 0) {
    return "Skeleton length must be positive.";
  }
  if (!Array.isArray(skeleton.hits) || skeleton.hits.length === 0) {
    return "Add at least one hit to the skeleton.";
  }

  const seenBeats = new Set();
  for (const hit of skeleton.hits) {
    const beat = Number(hit.beat);
    if (!Number.isFinite(beat) || beat < 0 || beat >= Number(skeleton.length)) {
      return "Every hit must fall within the skeleton length.";
    }
    if (!Object.values(SOUND_MAP).includes(hit.hit)) {
      return "The skeleton contains an unsupported sound.";
    }
    const beatKey = beat.toFixed(4);
    if (seenBeats.has(beatKey)) {
      return "A skeleton may contain only one hit at each beat.";
    }
    seenBeats.add(beatKey);
  }
  return "";
}

export function page3script() {
  const conditionsContainer = document.getElementById("analyticsConditions");
  const addConditionButton = document.getElementById("analyticsAddCondition");
  const runButton = document.getElementById("analyticsRun");
  const resultsContainer = document.getElementById("analyticsResults");
  const fileCountElement = document.getElementById("analyticsFileCount");
  const durationElement = document.getElementById("analyticsDuration");
  const fileList = document.getElementById("analyticsFileList");
  const conditionStates = new WeakMap();

  let modal = null;
  let modalContext = null;

  function fieldDefinition(fieldValue) {
    return FIELD_DEFINITIONS.find((field) => field.value === fieldValue);
  }

  function operatorsFor(fieldValue) {
    if (fieldValue === "skeletons") {
      return [
        { value: "=", label: "contains" },
        { value: "!=", label: "does not contain" },
      ];
    }
    return NUMERIC_OPERATORS;
  }

  function createSelect(options, className) {
    const select = document.createElement("select");
    select.className = className;
    options.forEach((option) => {
      const element = document.createElement("option");
      element.value = option.value;
      element.textContent = option.label;
      select.appendChild(element);
    });
    return select;
  }

  function formatSkeletonSummary(skeleton) {
    if (!skeleton) return "Build skeleton";
    const hitCount = Array.isArray(skeleton.hits) ? skeleton.hits.length : 0;
    return `${Number(skeleton.length)} beats · ${hitCount} hit${hitCount === 1 ? "" : "s"}`;
  }

  function setConditionError(condition, message) {
    const error = condition.querySelector(".analytics-condition-error");
    error.textContent = message;
    error.classList.toggle("visible", Boolean(message));
  }

  function updateValueEditor(condition, state) {
    const slot = condition.querySelector(".analytics-value-slot");
    slot.innerHTML = "";
    if (state.field === "skeletons") {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "analytics-skeleton-button";
      button.textContent = formatSkeletonSummary(state.skeleton);
      button.addEventListener("click", () => openSkeletonEditor(condition, state));
      slot.appendChild(button);
      return;
    }

    const input = document.createElement("input");
    input.type = "text";
    input.className = "analytics-input";
    input.placeholder = "Value";
    input.value = state.value;
    input.addEventListener("input", () => {
      state.value = input.value;
      setConditionError(condition, "");
    });
    slot.appendChild(input);
  }

  function createCondition() {
    const condition = document.createElement("div");
    condition.className = "analytics-condition";
    const state = { field: "bpm", operator: "=", value: "", skeleton: null };
    conditionStates.set(condition, state);

    const field = createSelect(FIELD_DEFINITIONS, "analytics-select analytics-field");
    const operator = createSelect(operatorsFor(state.field), "analytics-select analytics-operator");
    const valueSlot = document.createElement("div");
    valueSlot.className = "analytics-value-slot";
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "analytics-remove-condition";
    removeButton.textContent = "×";
    removeButton.title = "Remove condition";
    const error = document.createElement("div");
    error.className = "analytics-condition-error";
    error.setAttribute("role", "alert");

    field.addEventListener("change", () => {
      state.field = field.value;
      const validOperators = operatorsFor(state.field);
      if (!validOperators.some((option) => option.value === state.operator)) {
        state.operator = validOperators[0].value;
      }
      operator.replaceChildren(...validOperators.map((option) => {
        const element = document.createElement("option");
        element.value = option.value;
        element.textContent = option.label;
        return element;
      }));
      operator.value = state.operator;
      updateValueEditor(condition, state);
      setConditionError(condition, "");
    });
    operator.addEventListener("change", () => {
      state.operator = operator.value;
      setConditionError(condition, "");
    });
    removeButton.addEventListener("click", () => {
      if (modalContext?.condition === condition) closeSkeletonEditor();
      condition.remove();
      updateConditionLabels();
    });

    condition.append(field, operator, valueSlot, removeButton, error);
    updateValueEditor(condition, state);
    return condition;
  }

  function updateConditionLabels() {
    conditionsContainer.querySelectorAll(".analytics-condition").forEach((condition, index) => {
      let label = condition.querySelector(".analytics-condition-label");
      if (index === 0) {
        label?.remove();
        return;
      }
      if (!label) {
        label = document.createElement("span");
        label.className = "analytics-condition-label";
        condition.prepend(label);
      }
      label.textContent = "AND";
    });
  }

  function addCondition() {
    conditionsContainer.appendChild(createCondition());
    updateConditionLabels();
  }

  function createSkeletonModal() {
    const root = document.createElement("div");
    root.className = "analytics-skeleton-modal";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = `
      <div class="analytics-skeleton-overlay" data-skeleton-modal-cancel></div>
      <section class="analytics-skeleton-dialog" role="dialog" aria-modal="true" aria-labelledby="analytics-skeleton-title">
        <div class="analytics-skeleton-header">
          <div><h2 id="analytics-skeleton-title">Build skeleton</h2><p>Place one percussion hit at each beat position to match.</p></div>
          <button type="button" class="close-button" data-skeleton-modal-cancel aria-label="Close">×</button>
        </div>
        <div class="analytics-skeleton-controls">
          <label>Length <input type="number" class="analytics-skeleton-length" min="0.25" step="0.25"></label>
          <label class="analytics-skeleton-snap"><input type="checkbox" checked> Snap to nearest 0.25 beat</label>
        </div>
        <div class="analytics-skeleton-editor">
          <div class="analytics-skeleton-circle-shell"><canvas class="analytics-skeleton-canvas" width="400" height="400"></canvas></div>
          <div class="analytics-skeleton-palette">
            <div class="analytics-skeleton-selection">Current selection: <strong class="analytics-skeleton-current-sound">Doom</strong></div>
            <div class="analytics-skeleton-sounds"></div>
            <p>Click an empty beat to add a sound. Click an existing hit with another sound to replace it, or click it again to remove it.</p>
          </div>
        </div>
        <div class="analytics-skeleton-tooltip" aria-hidden="true"></div>
        <div class="analytics-skeleton-error" role="alert"></div>
        <div class="modal-actions analytics-skeleton-actions">
          <button type="button" class="btn" data-skeleton-modal-cancel>Cancel</button>
          <button type="button" class="btn btn-primary" data-skeleton-modal-save>Save skeleton</button>
        </div>
      </section>`;

    document.body.appendChild(root);
    root.querySelectorAll("[data-skeleton-modal-cancel]").forEach((element) => element.addEventListener("click", closeSkeletonEditor));
    root.querySelector("[data-skeleton-modal-save]").addEventListener("click", saveSkeletonEditor);
    root.querySelector(".analytics-skeleton-length").addEventListener("change", handleSkeletonLengthChange);
    root.querySelector(".analytics-skeleton-canvas").addEventListener("mousemove", handleSkeletonMouseMove);
    root.querySelector(".analytics-skeleton-canvas").addEventListener("mouseleave", handleSkeletonMouseLeave);
    root.querySelector(".analytics-skeleton-canvas").addEventListener("click", handleSkeletonCanvasClick);
    root.querySelector(".analytics-skeleton-snap").addEventListener("change", drawSkeletonCircle);
    return root;
  }

  function ensureSkeletonModal() {
    if (!modal) modal = createSkeletonModal();
    return modal;
  }

  function modalDraft() {
    return modalContext?.draft;
  }

  function modalCanvas() {
    return modal.querySelector(".analytics-skeleton-canvas");
  }

  function modalBeatFromPoint(event) {
    const canvas = modalCanvas();
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvas.width / rect.width) - canvas.width / 2;
    const y = (event.clientY - rect.top) * (canvas.height / rect.height) - canvas.height / 2;
    let angle = Math.atan2(y, x) + Math.PI / 2;
    if (angle < 0) angle += 2 * Math.PI;
    let beat = ((2 * Math.PI - angle) / (2 * Math.PI)) * modalDraft().length;
    if (modal.querySelector(".analytics-skeleton-snap input").checked) beat = Math.round(beat * 4) / 4;
    if (beat >= modalDraft().length) beat = 0;
    return Number(beat.toFixed(4));
  }

  function drawSkeletonCircle() {
    if (!modalContext) return;
    const canvas = modalCanvas();
    const ctx = canvas.getContext("2d");
    const skeleton = modalDraft();
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = Math.min(cx, cy) - 48;
    const styles = getComputedStyle(document.documentElement);
    const border = styles.getPropertyValue("--border-dark").trim() || "#888";
    const text = styles.getPropertyValue("--text").trim() || "#333";
    const muted = styles.getPropertyValue("--text-muted").trim() || "#666";

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = border;
    ctx.lineWidth = 2;
    ctx.stroke();

    const guideCount = Math.max(1, Math.round(skeleton.length * 2));
    for (let index = 0; index < guideCount; index += 1) {
      const beat = index / 2;
      if (beat >= skeleton.length) break;
      const angle = 2 * Math.PI - (beat / skeleton.length) * 2 * Math.PI - Math.PI / 2;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      ctx.beginPath();
      ctx.arc(x, y, index % 2 === 0 ? 5 : 3, 0, 2 * Math.PI);
      ctx.strokeStyle = index % 2 === 0 ? text : muted;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    skeleton.hits.forEach((hit) => {
      const angle = 2 * Math.PI - (hit.beat / skeleton.length) * 2 * Math.PI - Math.PI / 2;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      const sound = Object.entries(SOUND_MAP).find(([, symbol]) => symbol === hit.hit)?.[0] || "Silence";
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, 2 * Math.PI);
      ctx.fillStyle = SOUND_COLORS[sound];
      ctx.fill();
      ctx.strokeStyle = "#2c3e50";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    if (modalContext.hoverBeat !== null) {
      const angle = 2 * Math.PI - (modalContext.hoverBeat / skeleton.length) * 2 * Math.PI - Math.PI / 2;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(204, 84, 24, 0.18)";
      ctx.fill();
      ctx.strokeStyle = "rgba(204, 84, 24, 0.5)";
      ctx.stroke();
    }
  }

  function renderSkeletonSounds() {
    const soundsContainer = modal.querySelector(".analytics-skeleton-sounds");
    soundsContainer.innerHTML = "";
    SOUNDS.forEach((sound) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sound-btn analytics-skeleton-sound-btn";
      button.classList.toggle("active", modalContext.selectedSound === sound);
      button.innerHTML = `<span class="color-indicator" style="background-color:${SOUND_COLORS[sound]}"></span>${sound}`;
      button.addEventListener("click", () => {
        modalContext.selectedSound = sound;
        modal.querySelector(".analytics-skeleton-current-sound").textContent = sound;
        renderSkeletonSounds();
      });
      soundsContainer.appendChild(button);
    });
  }

  function openSkeletonEditor(condition, state) {
    ensureSkeletonModal();
    modalContext = {
      condition,
      state,
      draft: cloneSkeleton(state.skeleton) || { length: 4, hits: [] },
      selectedSound: "Doom",
      hoverBeat: null,
    };
    modal.querySelector(".analytics-skeleton-length").value = modalContext.draft.length;
    modal.querySelector(".analytics-skeleton-error").textContent = "";
    modal.querySelector("#analytics-skeleton-title").textContent = state.skeleton ? "Edit skeleton" : "Build skeleton";
    modal.querySelector(".analytics-skeleton-current-sound").textContent = "Doom";
    renderSkeletonSounds();
    drawSkeletonCircle();
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeSkeletonEditor() {
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    modal.querySelector(".analytics-skeleton-tooltip").style.display = "none";
    document.body.style.overflow = "";
    modalContext = null;
  }

  function saveSkeletonEditor() {
    if (!modalContext) return;
    const error = validateSkeleton(modalContext.draft);
    const errorElement = modal.querySelector(".analytics-skeleton-error");
    errorElement.textContent = error;
    if (error) return;
    modalContext.state.skeleton = cloneSkeleton(modalContext.draft);
    updateValueEditor(modalContext.condition, modalContext.state);
    setConditionError(modalContext.condition, "");
    closeSkeletonEditor();
  }

  function handleSkeletonLengthChange(event) {
    if (!modalContext) return;
    const previous = modalContext.draft.length;
    const length = Number(event.target.value);
    if (!Number.isFinite(length) || length <= 0 || modalContext.draft.hits.some((hit) => hit.beat >= length)) {
      event.target.value = previous;
      modal.querySelector(".analytics-skeleton-error").textContent = "Length must be positive and cannot exclude an existing hit.";
      return;
    }
    modalContext.draft.length = length;
    modal.querySelector(".analytics-skeleton-error").textContent = "";
    drawSkeletonCircle();
  }

  function handleSkeletonMouseMove(event) {
    if (!modalContext) return;
    modalContext.hoverBeat = modalBeatFromPoint(event);
    const tooltip = modal.querySelector(".analytics-skeleton-tooltip");
    tooltip.textContent = `Beat: ${modalContext.hoverBeat.toFixed(2)}`;
    tooltip.style.left = `${event.clientX + 15}px`;
    tooltip.style.top = `${event.clientY + 15}px`;
    tooltip.style.display = "block";
    drawSkeletonCircle();
  }

  function handleSkeletonMouseLeave() {
    if (!modalContext) return;
    modalContext.hoverBeat = null;
    modal.querySelector(".analytics-skeleton-tooltip").style.display = "none";
    drawSkeletonCircle();
  }

  function handleSkeletonCanvasClick(event) {
    if (!modalContext) return;
    const beat = modalBeatFromPoint(event);
    const hits = modalContext.draft.hits;
    const index = hits.findIndex((hit) => Math.abs(hit.beat - beat) < 0.0001);
    const symbol = SOUND_MAP[modalContext.selectedSound];
    if (index >= 0) {
      if (hits[index].hit === symbol) hits.splice(index, 1);
      else hits[index] = { beat, hit: symbol };
    } else {
      hits.push({ beat, hit: symbol });
    }
    hits.sort((a, b) => a.beat - b.beat);
    modal.querySelector(".analytics-skeleton-error").textContent = "";
    drawSkeletonCircle();
  }

  function validateNumericCondition(definition, rawValue) {
    const value = String(rawValue ?? "").trim();
    if (!value) return "A value is required.";
    const number = Number(value);
    if (!Number.isFinite(number)) return "Enter a finite numeric value.";
    if (definition.integer && !Number.isInteger(number)) return "Enter a whole number.";
    if (definition.exclusiveMin && number <= definition.min) return `Value must be greater than ${definition.min}.`;
    if (!definition.exclusiveMin && definition.min !== undefined && number < definition.min) return `Value must be at least ${definition.min}.`;
    if (definition.max !== undefined && number > definition.max) return `Value must be at most ${definition.max}.`;
    return "";
  }

  function validateCondition(condition) {
    const state = conditionStates.get(condition);
    const definition = fieldDefinition(state.field);
    if (!definition) return "Choose a valid field.";
    if (!operatorsFor(state.field).some((option) => option.value === state.operator)) return "That operator is not valid for this field.";
    const error = definition.kind === "skeleton"
      ? validateSkeleton(state.skeleton)
      : validateNumericCondition(definition, state.value);
    setConditionError(condition, error);
    return error;
  }

  function getConditions() {
    return Array.from(conditionsContainer.querySelectorAll(".analytics-condition")).map((condition) => {
      const state = conditionStates.get(condition);
      return {
        field: state.field,
        operator: state.operator,
        value: state.field === "skeletons" ? cloneSkeleton(state.skeleton) : state.value.trim(),
      };
    });
  }

  function validateAllConditions() {
    const conditions = Array.from(conditionsContainer.querySelectorAll(".analytics-condition"));
    let firstError = "";
    conditions.forEach((condition) => {
      const error = validateCondition(condition);
      if (!firstError && error) firstError = error;
    });
    return { valid: !firstError, firstError };
  }

  function clearResults() {
    fileCountElement.textContent = "0";
    durationElement.textContent = "0s";
    fileList.innerHTML = "";
    resultsContainer.hidden = true;
  }

  function createFileElement(file) {
    const details = document.createElement("details");
    details.className = "analytics-file";
    const summary = document.createElement("summary");
    summary.className = "analytics-file-summary";
    const fileInfo = document.createElement("div");
    fileInfo.className = "analytics-file-info";
    const fileId = document.createElement("span");
    fileId.className = "analytics-file-id";
    fileId.textContent = file.file_id;
    const fileDuration = document.createElement("span");
    fileDuration.className = "analytics-file-duration";
    fileDuration.textContent = file.duration;
    fileInfo.append(fileId, fileDuration);
    summary.appendChild(fileInfo);
    details.appendChild(summary);

    const settingsContainer = document.createElement("div");
    settingsContainer.className = "analytics-file-settings";
    Object.entries(file.settings || {}).forEach(([key, value]) => {
      const setting = document.createElement("div");
      setting.className = "analytics-setting";
      const settingName = document.createElement("span");
      settingName.className = "analytics-setting-name";
      settingName.textContent = key;
      const settingValue = document.createElement("span");
      settingValue.className = "analytics-setting-value";
      settingValue.textContent = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
      setting.append(settingName, settingValue);
      settingsContainer.appendChild(setting);
    });
    details.appendChild(settingsContainer);
    return details;
  }

  function displayResults(data) {
    fileCountElement.textContent = data["number of files"] ?? 0;
    durationElement.textContent = data.duration ?? "0s";
    fileList.innerHTML = "";
    if (!data.files || data.files.length === 0) {
      const empty = document.createElement("div");
      empty.className = "analytics-empty";
      empty.textContent = "No matching files.";
      fileList.appendChild(empty);
    } else {
      data.files.forEach((file) => fileList.appendChild(createFileElement(file)));
    }
    resultsContainer.hidden = false;
  }

  async function runAnalytics() {
    const validation = validateAllConditions();
    if (!validation.valid) {
      showToast(validation.firstError);
      return;
    }

    const payload = { conditions: getConditions() };
    runButton.disabled = true;
    runButton.textContent = "Running...";
    clearResults();

    try {
      const response = await fetch("/web/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        let message = `Analytics request failed: ${response.status}`;
        try {
          const body = await response.json();
          if (body.error) message = body.error;
        } catch {
          // Keep the status-based message.
        }
        throw new Error(message);
      }
      displayResults(await response.json());
    } catch (error) {
      console.error("Analytics error:", error);
      const errorElement = document.createElement("div");
      errorElement.className = "analytics-empty";
      errorElement.textContent = error.message || "Something went wrong while fetching the data.";
      fileList.appendChild(errorElement);
      resultsContainer.hidden = false;
    } finally {
      runButton.disabled = false;
      runButton.textContent = "Run";
    }
  }

  addConditionButton.addEventListener("click", addCondition);
  runButton.addEventListener("click", runAnalytics);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modalContext) closeSkeletonEditor();
  });
}
