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
    toast.addEventListener("transitionend", () => toast.remove(), {
      once: true,
    });
  }, duration);
}

export function page2script() {
  if (typeof window.cytoscape !== "function") {
    console.error("Cytoscape.js was not loaded.");
    showToast("The Markov graph library could not be loaded.");
    return;
  }

  // The former flow stored one shared matrix under this key. It is no longer
  // read; remove it so returning users cannot accidentally carry it forward.
  localStorage.removeItem("matrix");

  /* ------------------------------------------------------------------ */
  /* Constants                                                          */
  /* ------------------------------------------------------------------ */

  const defaultLength = Math.max(
    1,
    Number(localStorage.getItem("cycleLength")) || 4,
  );

  const symbolMap = {
    Doom: "D",
    "Open Tak": "OTA",
    "Open Tik": "OTI",
    Pa2: "PA2",
    Silence: "S",
  };

  const soundMap = Object.fromEntries(
    Object.entries(symbolMap).map(([sound, symbol]) => [symbol, sound]),
  );

  const sounds = ["Doom", "Open Tak", "Open Tik", "Pa2", "Silence"];

  const soundColors = {
    Doom: "#e74c3c",
    "Open Tak": "#3498db",
    "Open Tik": "#9b59b6",
    Pa2: "#1abc9c",
    Silence: "#95a5a6",
  };

  const audioPaths = {
    Doom: "/web/generate/sounds/doum.wav",
    "Open Tak": "/web/generate/sounds/open_tak.wav",
    "Open Tik": "/web/generate/sounds/open_tik.wav",
    Pa2: "/web/generate/sounds/pa2.wav",
  };

  const probabilityRowLabels = ["Percentages", "Doom", "Open Tak", "Open Tik", "Pa2"];
  const maxSubd = Math.max(1, Number(localStorage.getItem("maxSubd")) || 4);

  /* ------------------------------------------------------------------ */
  /* DOM                                                                */
  /* ------------------------------------------------------------------ */

  const graphElement = document.getElementById("markov-graph");
  const transitionList = document.getElementById("transition-list");
  const transitionTotal = document.getElementById("transition-total");

  const selectedSkeletonTitle = document.getElementById(
    "selected-skeleton-title",
  );

  const editorSkeletonLabel = document.getElementById("editor-skeleton-label");

  const lengthInput = document.getElementById("selectedSkeletonLength");
  const deleteButton = document.getElementById("delete-skeleton-btn");
  const editMatrixButton = document.getElementById("edit-matrix-btn");
  const playButton = document.getElementById("playSkeleton");
  const matrixModal = document.getElementById("matrix-modal");
  const matrixModalTitle = document.getElementById("matrix-modal-title");
  const matrixEditor = document.getElementById("matrix-editor");
  const matrixValidation = document.getElementById("matrix-validation");

  const canvas = document.getElementById("circle");
  const ctx = canvas.getContext("2d");

  const cx = canvas.width / 2;
  const cyCanvas = canvas.height / 2;
  const radius = Math.min(cx, cyCanvas) - 48;

  /* ------------------------------------------------------------------ */
  /* State                                                              */
  /* ------------------------------------------------------------------ */

  function makeSkeleton(length = defaultLength) {
    return {
      length,
      hits: [],
    };
  }

  function makeIdentityMatrix(size) {
    return Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, col) => (row === col ? 1 : 0)),
    );
  }

  function makeProbabilityMatrix() {
    return Array.from({ length: probabilityRowLabels.length }, () =>
      Array(maxSubd).fill(0),
    );
  }

  function loadSkeletons() {
    try {
      const stored = JSON.parse(localStorage.getItem("skeletons"));

      if (!Array.isArray(stored) || stored.length === 0) {
        return [makeSkeleton()];
      }

      return stored.map((rawSkeleton) => {
        const length = Number(rawSkeleton?.length);

        const rawHits = Array.isArray(rawSkeleton?.hits)
          ? rawSkeleton.hits
          : [];

        return {
          length:
            Number.isFinite(length) && length > 0 ? length : defaultLength,

          hits: rawHits
            .map((hit) => ({
              beat: Number(hit?.beat),
              hit: String(hit?.hit ?? ""),
            }))
            .filter(
              (hit) =>
                Number.isFinite(hit.beat) &&
                hit.beat >= 0 &&
                Object.prototype.hasOwnProperty.call(soundMap, hit.hit),
            )
            .sort((a, b) => a.beat - b.beat),
        };
      });
    } catch (error) {
      console.error("Could not restore skeletons:", error);
      return [makeSkeleton()];
    }
  }

  function loadMatrix(size) {
    try {
      const stored = JSON.parse(localStorage.getItem("skeletonMatrix"));

      if (
        !Array.isArray(stored) ||
        stored.length !== size ||
        stored.some((row) => !Array.isArray(row) || row.length !== size)
      ) {
        return makeIdentityMatrix(size);
      }

      return stored.map((row) =>
        row.map((value) => {
          const number = Number(value);

          return Number.isFinite(number) && number >= 0 ? number : 0;
        }),
      );
    } catch (error) {
      console.error("Could not restore skeleton matrix:", error);
      return makeIdentityMatrix(size);
    }
  }

  function loadProbabilityMatrices(size) {
    try {
      const stored = JSON.parse(localStorage.getItem("matrices"));
      const shapeValid =
        Array.isArray(stored) &&
        stored.length === size &&
        stored.every(
          (matrix) =>
            Array.isArray(matrix) &&
            matrix.length === probabilityRowLabels.length &&
            matrix.every(
              (row) =>
                Array.isArray(row) &&
                row.length === maxSubd &&
                row.every(
                  (value) =>
                    Number.isFinite(Number(value)) &&
                    Number(value) >= 0 &&
                    Number(value) <= 100,
                ),
            ),
        );

      if (!shapeValid) {
        return Array.from({ length: size }, () => makeProbabilityMatrix());
      }

      const normalized = stored.map((matrix) =>
        matrix.map((row) => row.map((value) => Number(value))),
      );

      if (normalized.some((matrix) => validateProbabilityMatrix(matrix))) {
        return Array.from({ length: size }, () => makeProbabilityMatrix());
      }

      return normalized;
    } catch (error) {
      console.error("Could not restore probability matrices:", error);
      return Array.from({ length: size }, () => makeProbabilityMatrix());
    }
  }

  function loadGraphPositions() {
    try {
      const positions = JSON.parse(localStorage.getItem("markovPositions"));

      if (!Array.isArray(positions)) {
        return [];
      }

      return positions.map((position) => {
        if (
          !position ||
          !Number.isFinite(Number(position.x)) ||
          !Number.isFinite(Number(position.y))
        ) {
          return null;
        }

        return {
          x: Number(position.x),
          y: Number(position.y),
        };
      });
    } catch {
      return [];
    }
  }

  let skeletons = loadSkeletons();
  let skeletonMatrix = loadMatrix(skeletons.length);
  let matrices = loadProbabilityMatrices(skeletons.length);

  let selectedSkeletonIndex = Math.min(
    Math.max(Number(localStorage.getItem("selectedSkeletonIndex")) || 0, 0),
    skeletons.length - 1,
  );

  let graphPositions = loadGraphPositions();
  let graph = null;

  let selectedSound = "Doom";
  let hoverBeat = null;
  let activeHitIndices = new Set();

  let audioCtx = null;
  let audioBuffers = {};
  let audioLoadPromise = null;

  let playbackInterval = null;
  let scheduledSources = new Set();
  let highlightTimers = new Set();

  function currentSkeleton() {
    return skeletons[selectedSkeletonIndex];
  }

  function persistState() {
    localStorage.setItem("skeletons", JSON.stringify(skeletons));

    localStorage.setItem("skeletonMatrix", JSON.stringify(skeletonMatrix));
    localStorage.setItem("matrices", JSON.stringify(matrices));

    localStorage.setItem(
      "selectedSkeletonIndex",
      String(selectedSkeletonIndex),
    );
  }

  function persistGraphPositions() {
    if (!graph) return;

    graphPositions = skeletons.map((_, index) => {
      const node = graph.$id(`s-${index}`);

      if (!node.length) {
        return null;
      }

      const position = node.position();

      return {
        x: position.x,
        y: position.y,
      };
    });

    localStorage.setItem("markovPositions", JSON.stringify(graphPositions));
  }

  /* ------------------------------------------------------------------ */
  /* Markov matrix helpers                                              */
  /* ------------------------------------------------------------------ */

  function rowTotal(rowIndex) {
    return skeletonMatrix[rowIndex].reduce((sum, value) => sum + value, 0);
  }

  function normalizeRow(rowIndex) {
    const row = skeletonMatrix[rowIndex];

    const total = row.reduce((sum, value) => sum + value, 0);

    if (total <= 0) {
      row.fill(0);
      row[rowIndex] = 1;
      return;
    }

    skeletonMatrix[rowIndex] = row.map((value) => value / total);
  }

  function addSkeleton() {
    stopPlayback();
    persistGraphPositions();

    const oldSize = skeletons.length;

    skeletons.push(makeSkeleton());
    matrices.push(makeProbabilityMatrix());

    for (const row of skeletonMatrix) {
      row.push(0);
    }

    const newRow = Array(oldSize + 1).fill(0);

    newRow[oldSize] = 1;

    skeletonMatrix.push(newRow);

    selectedSkeletonIndex = oldSize;

    graphPositions.push(null);

    persistState();
    renderInspector();
    rebuildGraph(true);
    drawCircle();
  }

  function deleteSelectedSkeleton() {
    if (skeletons.length <= 1) {
      showToast("You need at least one skeleton.");
      return;
    }

    stopPlayback();
    persistGraphPositions();

    const deletedIndex = selectedSkeletonIndex;

    skeletons.splice(deletedIndex, 1);
    matrices.splice(deletedIndex, 1);

    skeletonMatrix.splice(deletedIndex, 1);

    for (const row of skeletonMatrix) {
      row.splice(deletedIndex, 1);
    }

    skeletonMatrix.forEach((_, rowIndex) => normalizeRow(rowIndex));

    if (graphPositions.length > deletedIndex) {
      graphPositions.splice(deletedIndex, 1);
    }

    selectedSkeletonIndex = Math.min(
      selectedSkeletonIndex,
      skeletons.length - 1,
    );

    persistState();
    renderInspector();
    rebuildGraph(true);
    drawCircle();
  }

  /* ------------------------------------------------------------------ */
  /* Graph                                                              */
  /* ------------------------------------------------------------------ */

  function graphColors() {
    const styles = getComputedStyle(document.documentElement);

    return {
      text: styles.getPropertyValue("--text").trim() || "#333333",

      muted: styles.getPropertyValue("--text-muted").trim() || "#666666",

      border: styles.getPropertyValue("--border-dark").trim() || "#999999",

      accent: styles.getPropertyValue("--accent").trim() || "#cc5418",

      accentDark: styles.getPropertyValue("--accent-dark").trim() || "#a94313",
    };
  }

  function formatPercent(probability) {
    const percent = probability * 100;

    return Number.isInteger(percent)
      ? String(percent)
      : String(Number(percent.toFixed(2)));
  }

  function captureGraphPositions() {
    if (!graph) {
      return graphPositions;
    }

    return skeletons.map((_, index) => {
      const node = graph.$id(`s-${index}`);

      return node.length
        ? {
            ...node.position(),
          }
        : null;
    });
  }

  function graphElements(positions = []) {
    const elements = [];

    skeletons.forEach((skeleton, index) => {
      const node = {
        data: {
          id: `s-${index}`,
          index,
          label: `S${index + 1}\n` + `${skeleton.length} beats`,
        },
      };

      if (positions[index]) {
        node.position = positions[index];
      }

      elements.push(node);
    });

    skeletonMatrix.forEach((row, sourceIndex) => {
      row.forEach((probability, targetIndex) => {
        if (probability <= 0) {
          return;
        }

        elements.push({
          data: {
            id: `e-${sourceIndex}-${targetIndex}`,

            source: `s-${sourceIndex}`,

            target: `s-${targetIndex}`,

            probability,

            label: `${formatPercent(probability)}%`,
          },
        });
      });
    });

    return elements;
  }

  function rebuildGraph(forceLayout = false) {
    const previousPositions = forceLayout ? [] : captureGraphPositions();

    const colors = graphColors();

    if (graph) {
      graph.destroy();
    }

    const haveAllPositions =
      previousPositions.length === skeletons.length &&
      previousPositions.every(Boolean);

    graph = window.cytoscape({
      container: graphElement,

      elements: graphElements(haveAllPositions ? previousPositions : []),

      minZoom: 0.4,
      maxZoom: 2.5,
      wheelSensitivity: 0.2,
      boxSelectionEnabled: false,

      style: [
        {
          selector: "node",

          style: {
            width: 72,
            height: 72,
            shape: "ellipse",

            "background-color": "#f7f7f7",

            "border-width": 2,
            "border-color": colors.border,

            label: "data(label)",

            color: colors.text,

            "font-size": 11,
            "font-weight": 600,

            "text-valign": "center",
            "text-halign": "center",
            "text-wrap": "wrap",
            "text-max-width": 64,

            "overlay-opacity": 0,
          },
        },

        {
          selector: "node:selected",

          style: {
            "background-color": "#fff4ed",

            "border-color": colors.accent,
            "border-width": 3,

            color: colors.accentDark,
          },
        },

        {
          selector: "edge",

          style: {
            width: "mapData(probability, 0, 1, 1.5, 5)",

            "line-color": "#aaaaaa",

            "target-arrow-color": colors.accent,

            "target-arrow-shape": "triangle",

            "arrow-scale": 1.05,

            "curve-style": "bezier",

            label: "data(label)",

            color: colors.muted,

            "font-size": 10,

            "text-background-color": "#ffffff",

            "text-background-opacity": 0.9,

            "text-background-padding": 3,

            "text-rotation": "autorotate",

            "overlay-opacity": 0,
          },
        },

        {
          selector: "edge:selected",

          style: {
            "line-color": colors.accent,

            "target-arrow-color": colors.accent,
          },
        },
      ],

      layout: haveAllPositions
        ? {
            name: "preset",
            fit: true,
            padding: 45,
          }
        : {
            name: "circle",
            fit: true,
            padding: 55,
            avoidOverlap: true,
          },
    });

    const selectedNode = graph.$id(`s-${selectedSkeletonIndex}`);

    if (selectedNode.length) {
      selectedNode.select();
    }

    graph.on("tap", "node", (event) => {
      const index = Number(event.target.data("index"));

      selectSkeleton(index);
    });

    graph.on("dragfree", "node", () => {
      persistGraphPositions();
    });
  }

  function resetGraphLayout() {
    graphPositions = [];

    localStorage.removeItem("markovPositions");

    if (!graph) {
      return;
    }

    graph
      .layout({
        name: "circle",
        fit: true,
        padding: 55,
        avoidOverlap: true,

        animate: true,
        animationDuration: 250,
      })
      .run();

    setTimeout(persistGraphPositions, 300);
  }

  function selectSkeleton(index) {
    if (!Number.isInteger(index) || index < 0 || index >= skeletons.length) {
      return;
    }

    stopPlayback();

    selectedSkeletonIndex = index;
    hoverBeat = null;

    persistState();
    renderInspector();
    drawCircle();

    if (graph) {
      graph.nodes().unselect();

      const node = graph.$id(`s-${index}`);

      if (node.length) {
        node.select();
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Inspector                                                          */
  /* ------------------------------------------------------------------ */

  function renderInspector() {
    const skeleton = currentSkeleton();

    const title = `Skeleton ${selectedSkeletonIndex + 1}`;

    selectedSkeletonTitle.textContent = title;

    editorSkeletonLabel.textContent = title;
    matrixModalTitle.textContent = `${title} probability matrix`;

    lengthInput.value = skeleton.length;

    deleteButton.disabled = skeletons.length <= 1;

    transitionList.innerHTML = "";

    skeletonMatrix[selectedSkeletonIndex].forEach(
      (probability, targetIndex) => {
        const row = document.createElement("div");

        row.className = "transition-row";

        const label = document.createElement("label");

        label.textContent = `Skeleton ${targetIndex + 1}`;

        const inputShell = document.createElement("div");

        inputShell.className = "transition-input-shell";

        const input = document.createElement("input");

        input.type = "number";
        input.min = "0";
        input.max = "100";
        input.step = "0.1";

        input.value = formatPercent(probability);

        input.dataset.targetIndex = String(targetIndex);

        const percentSign = document.createElement("span");

        percentSign.textContent = "%";

        input.addEventListener("input", () => {
          let value = Number(input.value);

          if (!Number.isFinite(value)) {
            value = 0;
          }

          value = Math.max(0, Math.min(100, value));

          skeletonMatrix[selectedSkeletonIndex][targetIndex] = value / 100;

          persistState();
          updateTransitionTotal();
          rebuildGraph();
        });

        inputShell.appendChild(input);
        inputShell.appendChild(percentSign);

        row.appendChild(label);
        row.appendChild(inputShell);

        transitionList.appendChild(row);
      },
    );

    updateTransitionTotal();
  }

  function readProbabilityMatrixFromEditor() {
    const inputs = matrixEditor.querySelectorAll(".probability-matrix-input");
    const matrix = Array.from({ length: probabilityRowLabels.length }, () => []);

    inputs.forEach((input, index) => {
      const row = Math.floor(index / maxSubd);
      const rawValue = input.value.trim();
      matrix[row].push(rawValue === "" ? undefined : Number(rawValue));
    });

    matrix.forEach((row) => {
      let previous = 0;
      row.forEach((value, index) => {
        if (value === undefined) {
          row[index] = previous;
        } else {
          previous = value;
        }
      });
    });

    return matrix;
  }

  function validateProbabilityMatrix(matrix) {
    for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
      for (let column = 0; column < maxSubd; column += 1) {
        const value = matrix[rowIndex][column];
        if (!Number.isFinite(value) || value < 0 || value > 100) {
          return `Values must be between 0 and 100 (row ${rowIndex + 1}, column ${column + 1}).`;
        }
      }
    }

    for (let column = 0; column < maxSubd; column += 1) {
      const total = matrix
        .slice(1)
        .reduce((sum, row) => sum + row[column], 0);
      if (total > 100.0001) {
        return `Hit probabilities in column ${column + 1} cannot exceed 100%.`;
      }
    }

    return "";
  }

  function renderProbabilityMatrix() {
    const matrix = matrices[selectedSkeletonIndex];
    matrixEditor.innerHTML = "";
    matrixEditor.style.gridTemplateColumns = `150px repeat(${maxSubd}, 52px)`;
    matrixEditor.style.gridTemplateRows = `36px repeat(${probabilityRowLabels.length}, 34px)`;

    matrixEditor.appendChild(document.createElement("div"));
    for (let column = maxSubd; column > 0; column -= 1) {
      const label = document.createElement("div");
      label.className = "col-label";
      label.textContent = column;
      matrixEditor.appendChild(label);
    }

    probabilityRowLabels.forEach((rowLabel, rowIndex) => {
      const label = document.createElement("div");
      label.className = "row-label";
      label.textContent = rowLabel;
      matrixEditor.appendChild(label);

      for (let column = 0; column < maxSubd; column += 1) {
        const input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.max = "100";
        input.step = "0.1";
        input.className = "probability-matrix-input";
        input.value = matrix[rowIndex][column];
        input.addEventListener("input", () => {
          const candidate = readProbabilityMatrixFromEditor();
          const error = validateProbabilityMatrix(candidate);
          matrixValidation.textContent = error;
          matrixValidation.classList.toggle("visible", Boolean(error));
          if (!error) {
            matrices[selectedSkeletonIndex] = candidate;
            persistState();
          }
        });
        matrixEditor.appendChild(input);
      }
    });
  }

  function openProbabilityMatrix() {
    renderProbabilityMatrix();
    matrixValidation.textContent = "";
    matrixValidation.classList.remove("visible");
    matrixModal.classList.add("open");
    matrixModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeProbabilityMatrix() {
    matrixModal.classList.remove("open");
    matrixModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function updateTransitionTotal() {
    const total = rowTotal(selectedSkeletonIndex) * 100;

    const valid = Math.abs(total - 100) < 0.01;

    transitionTotal.textContent = `Total: ${Number(total.toFixed(2))}%`;

    transitionTotal.classList.toggle("invalid", !valid);
  }

  /* ------------------------------------------------------------------ */
  /* Circle editor                                                      */
  /* ------------------------------------------------------------------ */

  function beatToAngle(beat) {
    const length = currentSkeleton().length;

    return 2 * Math.PI - (beat / length) * 2 * Math.PI;
  }

  function angleToBeat(angle) {
    if (angle < 0) {
      angle += 2 * Math.PI;
    }

    const length = currentSkeleton().length;

    let beat = ((2 * Math.PI - angle) / (2 * Math.PI)) * length;

    const snap = document.getElementById("snapCheckbox").checked;

    if (snap) {
      beat = Math.round(beat * 4) / 4;
    }

    if (beat >= length) {
      beat = 0;
    }

    return Number(beat.toFixed(4));
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();

    const scaleX = canvas.width / rect.width;

    const scaleY = canvas.height / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,

      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function findHitIndex(beat) {
    const epsilon = 0.0001;

    return currentSkeleton().hits.findIndex(
      (hit) => Math.abs(hit.beat - beat) < epsilon,
    );
  }

  function drawCircle() {
    const skeleton = currentSkeleton();

    const length = skeleton.length;

    const styles = getComputedStyle(document.documentElement);

    const circleColor =
      styles.getPropertyValue("--border-dark").trim() || "#888888";

    const tickColor = styles.getPropertyValue("--text").trim() || "#333333";

    const secondaryTickColor =
      styles.getPropertyValue("--text-muted").trim() || "#666666";

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath();

    ctx.arc(cx, cyCanvas, radius, 0, 2 * Math.PI);

    ctx.strokeStyle = circleColor;

    ctx.lineWidth = 2;
    ctx.stroke();

    const guideCount = Math.max(1, Math.round(length * 2));

    for (let i = 0; i < guideCount; i++) {
      const beat = i / 2;

      if (beat >= length) {
        break;
      }

      const angle = beatToAngle(beat) - Math.PI / 2;

      const x = cx + radius * Math.cos(angle);

      const y = cyCanvas + radius * Math.sin(angle);

      ctx.beginPath();

      ctx.arc(x, y, i % 2 === 0 ? 5 : 3, 0, 2 * Math.PI);

      ctx.strokeStyle = i % 2 === 0 ? tickColor : secondaryTickColor;

      ctx.lineWidth = 1;
      ctx.stroke();
    }

    skeleton.hits.forEach((hit, index) => {
      const sound = soundMap[hit.hit] || "Silence";

      const angle = beatToAngle(hit.beat) - Math.PI / 2;

      const x = cx + radius * Math.cos(angle);

      const y = cyCanvas + radius * Math.sin(angle);

      const active = activeHitIndices.has(index);

      ctx.save();
      ctx.beginPath();

      if (active) {
        ctx.shadowBlur = 20;

        ctx.shadowColor = soundColors[sound];

        ctx.arc(x, y, 14, 0, 2 * Math.PI);
      } else {
        ctx.arc(x, y, 10, 0, 2 * Math.PI);
      }

      ctx.fillStyle = soundColors[sound];

      ctx.fill();

      ctx.strokeStyle = "#2c3e50";

      ctx.lineWidth = 1.5;

      ctx.stroke();
      ctx.restore();
    });

    if (hoverBeat !== null) {
      const angle = beatToAngle(hoverBeat) - Math.PI / 2;

      const x = cx + radius * Math.cos(angle);

      const y = cyCanvas + radius * Math.sin(angle);

      ctx.beginPath();

      ctx.arc(x, y, 10, 0, 2 * Math.PI);

      ctx.fillStyle = "rgba(204, 84, 24, 0.18)";

      ctx.fill();

      ctx.strokeStyle = "rgba(204, 84, 24, 0.5)";

      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Sound buttons                                                      */
  /* ------------------------------------------------------------------ */

  function renderSoundButtons() {
    const container = document.getElementById("sound-buttons");

    container.innerHTML = "";

    sounds.forEach((sound) => {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "sound-btn";

      button.innerHTML = `
        <div
          class="color-indicator"
          style="background-color: ${soundColors[sound]}"
        ></div>
        ${sound}
      `;

      if (sound === selectedSound) {
        button.classList.add("active");
      }

      button.addEventListener("click", () => {
        selectedSound = sound;

        document.getElementById("currentSound").textContent = sound;

        document.querySelectorAll(".sound-btn").forEach((soundButton) => {
          soundButton.classList.remove("active");
        });

        button.classList.add("active");
      });

      container.appendChild(button);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Preview audio                                                      */
  /* ------------------------------------------------------------------ */

  async function ensureAudioReady() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }

    if (!audioLoadPromise) {
      audioLoadPromise = Promise.all(
        Object.entries(audioPaths).map(async ([sound, url]) => {
          const response = await fetch(url);

          if (!response.ok) {
            throw new Error(`Could not load ${sound}`);
          }

          const arrayBuffer = await response.arrayBuffer();

          audioBuffers[sound] = await audioCtx.decodeAudioData(arrayBuffer);
        }),
      ).catch((error) => {
        audioLoadPromise = null;
        throw error;
      });
    }

    await audioLoadPromise;
  }

  function clearHighlightTimers() {
    highlightTimers.forEach((timer) => clearTimeout(timer));

    highlightTimers.clear();
    activeHitIndices.clear();

    drawCircle();
  }

  function stopPlayback() {
    if (playbackInterval !== null) {
      clearInterval(playbackInterval);

      playbackInterval = null;
    }

    scheduledSources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // Source may already have ended.
      }
    });

    scheduledSources.clear();
    clearHighlightTimers();

    playButton.textContent = "Play";
  }

  function scheduleCycle(startTime) {
    const skeleton = currentSkeleton();

    const bpm = Number(localStorage.getItem("tempo")) || 120;

    const beatLength = 60 / bpm;

    skeleton.hits.forEach((hit, index) => {
      const soundName = soundMap[hit.hit];

      const buffer = audioBuffers[soundName];

      const playTime = startTime + hit.beat * beatLength;

      if (buffer) {
        const source = audioCtx.createBufferSource();

        source.buffer = buffer;

        source.connect(audioCtx.destination);

        source.start(playTime);

        scheduledSources.add(source);

        source.onended = () => scheduledSources.delete(source);
      }

      const delay = Math.max(0, (playTime - audioCtx.currentTime) * 1000);

      const onTimer = setTimeout(() => {
        activeHitIndices.add(index);

        drawCircle();

        const offTimer = setTimeout(() => {
          activeHitIndices.delete(index);

          drawCircle();

          highlightTimers.delete(offTimer);
        }, 150);

        highlightTimers.add(offTimer);

        highlightTimers.delete(onTimer);
      }, delay);

      highlightTimers.add(onTimer);
    });
  }

  async function startPlayback() {
    const skeleton = currentSkeleton();

    if (skeleton.hits.length === 0) {
      showToast("Add at least one hit before playing this skeleton.");

      return;
    }

    try {
      await ensureAudioReady();
    } catch (error) {
      console.error("Could not load preview audio:", error);

      showToast("Preview sounds could not be loaded.");

      return;
    }

    const bpm = Number(localStorage.getItem("tempo")) || 120;

    const cycleDurationSeconds = skeleton.length * (60 / bpm);

    const startTime = audioCtx.currentTime + 0.04;

    scheduleCycle(startTime);

    playbackInterval = setInterval(() => {
      scheduleCycle(audioCtx.currentTime + 0.04);
    }, cycleDurationSeconds * 1000);

    playButton.textContent = "Stop";
  }

  /* ------------------------------------------------------------------ */
  /* Validation                                                         */
  /* ------------------------------------------------------------------ */

  function validateBeforeGeneration() {
    for (let i = 0; i < skeletons.length; i++) {
      const skeleton = skeletons[i];

      if (!Number.isFinite(skeleton.length) || skeleton.length <= 0) {
        showToast(`Skeleton ${i + 1} needs a positive length.`);

        selectSkeleton(i);
        return false;
      }

      if (skeleton.hits.length === 0) {
        showToast(`Skeleton ${i + 1} must contain at least one hit.`);

        selectSkeleton(i);
        return false;
      }

      const invalidHit = skeleton.hits.some(
        (hit) =>
          !Number.isFinite(hit.beat) ||
          hit.beat < 0 ||
          hit.beat >= skeleton.length ||
          !Object.prototype.hasOwnProperty.call(soundMap, hit.hit),
      );

      if (invalidHit) {
        showToast(`Skeleton ${i + 1} contains an invalid hit.`);

        selectSkeleton(i);
        return false;
      }
    }

    if (
      skeletonMatrix.length !== skeletons.length ||
      skeletonMatrix.some((row) => row.length !== skeletons.length)
    ) {
      showToast("The Markov matrix dimensions are invalid.");

      return false;
    }

    for (let i = 0; i < skeletonMatrix.length; i++) {
      const row = skeletonMatrix[i];

      const invalid = row.some(
        (probability) => !Number.isFinite(probability) || probability < 0,
      );

      const total = row.reduce((sum, probability) => sum + probability, 0);

      if (invalid || Math.abs(total - 1) >= 0.0001) {
        showToast(
          `Skeleton ${i + 1}'s outgoing probabilities must total 100%.`,
        );

        selectSkeleton(i);
        return false;
      }
    }

    if (
      matrices.length !== skeletons.length ||
      matrices.some(
        (matrix) =>
          !Array.isArray(matrix) ||
          matrix.length !== probabilityRowLabels.length ||
          matrix.some((row) => !Array.isArray(row) || row.length !== maxSubd),
      )
    ) {
      showToast("Each skeleton needs a complete probability matrix.");
      return false;
    }

    for (let skeletonIndex = 0; skeletonIndex < matrices.length; skeletonIndex += 1) {
      const error = validateProbabilityMatrix(matrices[skeletonIndex]);
      if (error) {
        showToast(`Skeleton ${skeletonIndex + 1}: ${error}`);
        selectSkeleton(skeletonIndex);
        return false;
      }
    }

    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Events                                                             */
  /* ------------------------------------------------------------------ */

  document
    .getElementById("add-skeleton-btn")
    .addEventListener("click", addSkeleton);

  deleteButton.addEventListener("click", deleteSelectedSkeleton);
  editMatrixButton.addEventListener("click", openProbabilityMatrix);
  document.querySelectorAll("[data-close-matrix-modal]").forEach((element) => {
    element.addEventListener("click", closeProbabilityMatrix);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && matrixModal.classList.contains("open")) {
      closeProbabilityMatrix();
    }
  });

  document
    .getElementById("reset-layout-btn")
    .addEventListener("click", resetGraphLayout);

  document.getElementById("normalize-row-btn").addEventListener("click", () => {
    normalizeRow(selectedSkeletonIndex);

    persistState();
    renderInspector();
    rebuildGraph();
  });

  lengthInput.addEventListener("change", () => {
    const skeleton = currentSkeleton();

    const oldLength = skeleton.length;

    const newLength = Number(lengthInput.value);

    if (!Number.isFinite(newLength) || newLength <= 0) {
      lengthInput.value = oldLength;

      showToast("Skeleton length must be a positive number.");

      return;
    }

    if (skeleton.hits.some((hit) => hit.beat >= newLength)) {
      lengthInput.value = oldLength;

      showToast("Move or remove hits beyond the new length first.");

      return;
    }

    stopPlayback();

    skeleton.length = newLength;

    persistState();
    renderInspector();
    rebuildGraph();
    drawCircle();
  });

  canvas.addEventListener("mousemove", (event) => {
    const tooltip = document.getElementById("tooltip");

    const point = canvasPoint(event);

    const x = point.x - cx;

    const y = point.y - cyCanvas;

    const angle = Math.atan2(y, x) + Math.PI / 2;

    hoverBeat = angleToBeat(angle);

    tooltip.style.left = `${event.clientX + 15}px`;

    tooltip.style.top = `${event.clientY + 15}px`;

    tooltip.textContent = `Beat: ${hoverBeat.toFixed(2)}`;

    tooltip.style.display = "block";

    drawCircle();
  });

  canvas.addEventListener("mouseleave", () => {
    hoverBeat = null;

    const tooltip = document.getElementById("tooltip");

    if (tooltip) {
      tooltip.style.display = "none";
    }

    drawCircle();
  });

  canvas.addEventListener("click", (event) => {
    stopPlayback();

    const point = canvasPoint(event);

    const x = point.x - cx;

    const y = point.y - cyCanvas;

    const angle = Math.atan2(y, x) + Math.PI / 2;

    const beat = angleToBeat(angle);

    const skeleton = currentSkeleton();

    const hitSymbol = symbolMap[selectedSound];

    const existingIndex = findHitIndex(beat);

    if (existingIndex >= 0) {
      if (skeleton.hits[existingIndex].hit === hitSymbol) {
        skeleton.hits.splice(existingIndex, 1);
      } else {
        skeleton.hits[existingIndex] = {
          beat,
          hit: hitSymbol,
        };
      }
    } else {
      skeleton.hits.push({
        beat,
        hit: hitSymbol,
      });
    }

    skeleton.hits.sort((a, b) => a.beat - b.beat);

    persistState();
    drawCircle();
  });

  playButton.addEventListener("click", async () => {
    if (playbackInterval !== null) {
      stopPlayback();
    } else {
      await startPlayback();
    }
  });

  document.getElementById("next-btn").addEventListener("click", () => {
    stopPlayback();

    if (!validateBeforeGeneration()) {
      return;
    }

    persistState();
    persistGraphPositions();

    localStorage.setItem("currPage", 3);

    document.getElementById("dummy").click();
  });

  /* ------------------------------------------------------------------ */
  /* Initial render                                                     */
  /* ------------------------------------------------------------------ */

  persistState();
  renderSoundButtons();
  renderInspector();
  rebuildGraph();
  drawCircle();
}
