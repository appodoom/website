export function page3script() {
  const conditionsContainer = document.getElementById("analyticsConditions");

  const addConditionButton = document.getElementById("analyticsAddCondition");

  const runButton = document.getElementById("analyticsRun");

  const resultsContainer = document.getElementById("analyticsResults");

  const fileCountElement = document.getElementById("analyticsFileCount");

  const durationElement = document.getElementById("analyticsDuration");

  const fileList = document.getElementById("analyticsFileList");

  /*
   * Available fields.
   *
   * These values must correspond to the keys
   * inside the JSONB settings object.
   */

  const fields = [
    {
      value: "bpm",
      label: "BPM",
    },
    {
      value: "num_cycles",
      label: "Number of cycles",
    },
    {
      value: "maxsubd",
      label: "Maximum subdivision",
    },
    {
      value: "num_hits",
      label: "Number of hits",
    },
    {
      value: "cycle_length",
      label: "Cycle length",
    },
    {
      value: "skeleton",
      label: "Skeleton",
    },
    {
      value: "shift_proba",
      label: "Shift probability",
    },
    {
      value: "generation_time",
      label: "Generation time",
    },
    {
      value: "amplitudeVariation",
      label: "Amplitude variation",
    },
    {
      value: "allowed_tempo_deviation",
      label: "Allowed tempo deviation",
    },
  ];

  const operators = [
    {
      value: "=",
      label: "=",
    },
    {
      value: "!=",
      label: "≠",
    },
    {
      value: ">",
      label: ">",
    },
    {
      value: ">=",
      label: "≥",
    },
    {
      value: "<",
      label: "<",
    },
    {
      value: "<=",
      label: "≤",
    },
  ];

  /*
   * Create a select element.
   */

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

  /*
   * Create one condition.
   *
   * Example:
   *
   * [ BPM ] [ = ] [ 120 ] [ × ]
   */

  function createCondition() {
    const condition = document.createElement("div");

    condition.className = "analytics-condition";

    const field = createSelect(fields, "analytics-select analytics-field");

    const operator = createSelect(
      operators,
      "analytics-select analytics-operator",
    );

    const value = document.createElement("input");

    value.type = "text";
    value.className = "analytics-input";
    value.placeholder = "Value";

    const removeButton = document.createElement("button");

    removeButton.type = "button";
    removeButton.className = "analytics-remove-condition";

    removeButton.textContent = "×";
    removeButton.title = "Remove condition";

    /*
     * Remove condition.
     */

    removeButton.addEventListener("click", () => {
      condition.remove();
      updateConditionLabels();
    });

    condition.appendChild(field);
    condition.appendChild(operator);
    condition.appendChild(value);
    condition.appendChild(removeButton);

    return condition;
  }

  /*
   * Add AND labels to every condition after
   * the first one.
   */

  function updateConditionLabels() {
    const conditionElements = conditionsContainer.querySelectorAll(
      ".analytics-condition",
    );

    conditionElements.forEach((condition, index) => {
      let label = condition.querySelector(".analytics-condition-label");

      if (index === 0) {
        if (label) {
          label.remove();
        }

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

  /*
   * Add a new condition.
   */

  function addCondition() {
    const condition = createCondition();

    conditionsContainer.appendChild(condition);

    updateConditionLabels();
  }

  /*
   * Get all conditions currently
   * displayed in the UI.
   *
   * IMPORTANT:
   *
   * If there are no conditions this returns [].
   * This is intentional.
   */

  function getConditions() {
    const conditionElements = conditionsContainer.querySelectorAll(
      ".analytics-condition",
    );

    return Array.from(conditionElements).map((condition) => {
      const field = condition.querySelector(".analytics-field");

      const operator = condition.querySelector(".analytics-operator");

      const value = condition.querySelector(".analytics-input");

      return {
        field: field.value,
        operator: operator.value,
        value: value.value.trim(),
      };
    });
  }

  /*
   * Clear previous results.
   */

  function clearResults() {
    fileCountElement.textContent = "0";

    durationElement.textContent = "0s";

    fileList.innerHTML = "";

    resultsContainer.hidden = true;
  }

  /*
   * Create a file result.
   */

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

    fileInfo.appendChild(fileId);
    fileInfo.appendChild(fileDuration);

    summary.appendChild(fileInfo);

    details.appendChild(summary);

    /*
     * Settings
     */

    const settingsContainer = document.createElement("div");

    settingsContainer.className = "analytics-file-settings";

    const settings = file.settings || {};

    Object.entries(settings).forEach(([key, value]) => {
      const setting = document.createElement("div");

      setting.className = "analytics-setting";

      const settingName = document.createElement("span");

      settingName.className = "analytics-setting-name";

      settingName.textContent = key;

      const settingValue = document.createElement("span");

      settingValue.className = "analytics-setting-value";

      /*
       * Skeleton will eventually get
       * its own formatting.
       *
       * For now JSON.stringify is fine.
       */

      if (typeof value === "object" && value !== null) {
        settingValue.textContent = JSON.stringify(value);
      } else {
        settingValue.textContent = String(value);
      }

      setting.appendChild(settingName);
      setting.appendChild(settingValue);

      settingsContainer.appendChild(setting);
    });

    details.appendChild(settingsContainer);

    return details;
  }

  /*
   * Display backend response.
   */

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
      data.files.forEach((file) => {
        fileList.appendChild(createFileElement(file));
      });
    }

    resultsContainer.hidden = false;
  }

  /*
   * Execute analytics query.
   */

  async function runAnalytics() {
    const queryConditions = getConditions();

    /*
     * IMPORTANT:
     *
     * An empty conditions array is VALID.
     *
     * It means:
     *
     *     "return everything"
     *
     * The backend will implement that behavior.
     */

    const payload = {
      conditions: queryConditions,
    };

    console.log("Analytics request:", payload);

    runButton.disabled = true;
    runButton.textContent = "Running...";

    clearResults();

    try {
      const response = await fetch("/web/analytics", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Analytics request failed: ${response.status}`);
      }

      const data = await response.json();

      displayResults(data);
    } catch (error) {
      console.error("Analytics error:", error);

      const errordiv = document.createElement("div");

      errordiv.className = "analytics-empty";

      errordiv.textContent = "Something went wrong while fetching the data.";

      fileList.appendChild(errordiv);
    } finally {
      runButton.disabled = false;
      runButton.textContent = "Run";
    }
  }

  /*
   * EVENTS
   */

  addConditionButton.addEventListener("click", () => addCondition());

  runButton.addEventListener("click", () => runAnalytics());
}
