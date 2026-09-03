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
  const nBeats = Number(localStorage.getItem("modelCycleLength"));
  const tempo = Number(localStorage.getItem("modelTempo"));

  const SOUNDS = {
    Doom: {
      path: "/web/infer/sounds/doum.wav",
      symbol: "D",
      color: "#cc5418",
    },
    "Open Tak": {
      path: "/web/infer/sounds/open_tak.wav",
      symbol: "OTA",
      color: "#3f78b5",
    },
    "Open Tik": {
      path: "/web/infer/sounds/open_tik.wav",
      symbol: "OTI",
      color: "#7a59a3",
    },
    Pa2: {
      path: "/web/infer/sounds/pa2.wav",
      symbol: "PA2",
      color: "#2f8a74",
    },
    Silence: {
      path: null,
      symbol: "S",
      color: "#8a8a8a",
    },
  };

  const MODEL_API_URL = "http://192.168.78.11:3002";

  let markers = [];
  let hoverBeat = null;
  let selectedSound = "Doom";
  let stopLoop = null;
  let buffers = {};

  let composition = [];
  let currentCycleId = 0;
  let playbackState = {
    isPlaying: false,
    startTime: null,
    animationFrame: null,
    currentCycle: 0,
  };

  let zoomMarkers = [];
  let zoomSelectedSound = "Doom";
  let zoomStopLoop = null;
  let zoomHoverBeat = null;
  let zoomInitialized = false;

  const canvas = document.getElementById("circle");
  const ctx = canvas.getContext("2d");
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const radius = 85;

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  const zoomModal = document.getElementById("zoomModal");
  const zoomCanvas = document.getElementById("zoomCircle");
  const zoomCtx = zoomCanvas.getContext("2d");
  const zoomRadius = 250;

  document.getElementById("metaCycleLength").textContent = `${nBeats} beats`;
  document.getElementById("metaTempo").textContent = `${tempo} BPM`;

  function angleToBeat(angle) {
    if (angle < 0) angle += 2 * Math.PI;
    let beat = ((2 * Math.PI - angle) / (2 * Math.PI)) * nBeats;
    const snapValue = parseFloat(document.getElementById("snapSelect").value);
    beat = Math.round(beat / snapValue) * snapValue;
    return Math.abs(beat - nBeats) < 0.0001 ? 0 : beat;
  }

  function beatToAngle(beat) {
    return 2 * Math.PI - (beat / nBeats) * 2 * Math.PI;
  }

  function getContrastColor(hexColor) {
    if (!hexColor.startsWith("#")) return "#000";
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? "#000" : "#fff";
  }

  async function loadAudioFile(url) {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      return await audioCtx.decodeAudioData(arrayBuffer);
    } catch (error) {
      console.error("Error loading audio:", error);
      return null;
    }
  }

  async function loadAllBuffers() {
    for (const [key, sound] of Object.entries(SOUNDS)) {
      if (sound.path) {
        const buffer = await loadAudioFile(sound.path);
        if (buffer) buffers[key] = buffer;
      }
    }
  }

  function createSoundButtons(containerId, isZoom = false) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";

    Object.keys(SOUNDS).forEach((sound) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = isZoom ? "zoom-sound-btn" : "sound-btn";
      button.innerHTML = `
        <div class="color-indicator" style="background-color: ${SOUNDS[sound].color}"></div>
        ${sound}
      `;

      button.addEventListener("click", () => {
        if (isZoom) {
          zoomSelectedSound = sound;
          document.getElementById("zoomCurrentSound").textContent = sound;
          updateActiveSoundButtons(sound, true);
        } else {
          selectedSound = sound;
          document.getElementById("currentSound").textContent = sound;
          updateActiveSoundButtons(sound, false);
        }

        if (isZoom) {
          selectedSound = sound;
          document.getElementById("currentSound").textContent = sound;
          updateActiveSoundButtons(sound, false);
        } else {
          zoomSelectedSound = sound;
          document.getElementById("zoomCurrentSound").textContent = sound;
          updateActiveSoundButtons(sound, true);
        }
      });

      container.appendChild(button);
    });

    const firstBtn = container.querySelector(
      isZoom ? ".zoom-sound-btn" : ".sound-btn",
    );
    if (firstBtn) firstBtn.classList.add("active");
  }

  function updateActiveSoundButtons(sound, isZoom) {
    const selector = isZoom ? ".zoom-sound-btn" : ".sound-btn";
    document.querySelectorAll(selector).forEach((btn) => {
      btn.classList.remove("active");
      if (btn.textContent.includes(sound)) {
        btn.classList.add("active");
      }
    });
  }

  function getCanvasStyles() {
    const styles = getComputedStyle(document.documentElement);
    return {
      circleColor: styles.getPropertyValue("--border-dark").trim() || "#888",
      tickColor: styles.getPropertyValue("--text").trim() || "#333",
      secondaryTickColor:
        styles.getPropertyValue("--text-muted").trim() || "#666",
      markerBorder: styles.getPropertyValue("--gray-0").trim() || "#fff",
      hoverColor: "rgba(204, 84, 24, 0.18)",
      hoverBorder: "rgba(204, 84, 24, 0.5)",
    };
  }

  function drawCanvas(
    targetCtx,
    centerX,
    centerY,
    currentRadius,
    markersArray,
    hoverBeatVal,
    isZoom = false,
  ) {
    const styles = getCanvasStyles();
    targetCtx.clearRect(0, 0, targetCtx.canvas.width, targetCtx.canvas.height);

    targetCtx.beginPath();
    targetCtx.arc(centerX, centerY, currentRadius, 0, 2 * Math.PI);
    targetCtx.strokeStyle = styles.circleColor;
    targetCtx.lineWidth = isZoom ? 4 : 2;
    targetCtx.stroke();

    targetCtx.lineWidth = 1;
    for (let i = 0; i < nBeats * 2; i++) {
      const angle = beatToAngle(i / 2) - Math.PI / 2;
      const x = centerX + currentRadius * Math.cos(angle);
      const y = centerY + currentRadius * Math.sin(angle);

      targetCtx.beginPath();
      if (i % 2 === 0) {
        targetCtx.arc(x, y, isZoom ? 8 : 5, 0, 2 * Math.PI);
        targetCtx.fillStyle = styles.tickColor;
      } else {
        targetCtx.arc(x, y, isZoom ? 5 : 3, 0, 2 * Math.PI);
        targetCtx.fillStyle = styles.secondaryTickColor;
      }
      targetCtx.fill();
    }

    markersArray.forEach((marker) => {
      const angle = beatToAngle(marker.beat) - Math.PI / 2;
      const x = centerX + currentRadius * Math.cos(angle);
      const y = centerY + currentRadius * Math.sin(angle);

      targetCtx.save();
      targetCtx.beginPath();

      if (marker.active) {
        targetCtx.shadowBlur = 18;
        targetCtx.shadowColor = SOUNDS[marker.sound].color;
        targetCtx.fillStyle = SOUNDS[marker.sound].color;
        targetCtx.arc(x, y, isZoom ? 15 : 8, 0, 2 * Math.PI);
      } else {
        targetCtx.fillStyle = SOUNDS[marker.sound].color;
        targetCtx.arc(x, y, isZoom ? 12 : 6, 0, 2 * Math.PI);
      }

      targetCtx.fill();
      targetCtx.strokeStyle = styles.markerBorder;
      targetCtx.lineWidth = isZoom ? 2 : 1.5;
      targetCtx.stroke();

      if (isZoom) {
        targetCtx.fillStyle = "#fff";
        targetCtx.font = "bold 10px Helvetica";
        targetCtx.textAlign = "center";
        targetCtx.textBaseline = "middle";
        targetCtx.fillText(SOUNDS[marker.sound].symbol, x, y);
      }

      targetCtx.restore();
    });

    if (hoverBeatVal !== null) {
      const angle = beatToAngle(hoverBeatVal) - Math.PI / 2;
      const x = centerX + currentRadius * Math.cos(angle);
      const y = centerY + currentRadius * Math.sin(angle);

      targetCtx.beginPath();
      targetCtx.arc(x, y, isZoom ? 10 : 6, 0, 2 * Math.PI);
      targetCtx.fillStyle = styles.hoverColor;
      targetCtx.fill();
      targetCtx.strokeStyle = styles.hoverBorder;
      targetCtx.lineWidth = isZoom ? 3 : 2;
      targetCtx.stroke();
    }
  }

  function draw() {
    drawCanvas(ctx, cx, cy, radius, markers, hoverBeat);
  }

  function drawZoom() {
    const centerX = zoomCanvas.width / 2;
    const centerY = zoomCanvas.height / 2;
    drawCanvas(
      zoomCtx,
      centerX,
      centerY,
      zoomRadius,
      zoomMarkers,
      zoomHoverBeat,
      true,
    );
  }

  function animate() {
    draw();
    requestAnimationFrame(animate);
  }

  function handleCanvasClick(event, isZoom = false) {
    const targetCanvas = isZoom ? zoomCanvas : canvas;
    const rect = targetCanvas.getBoundingClientRect();
    const centerX = isZoom ? targetCanvas.width / 2 : cx;
    const centerY = isZoom ? targetCanvas.height / 2 : cy;

    const x = event.clientX - rect.left - centerX;
    const y = event.clientY - rect.top - centerY;
    const angle = Math.atan2(y, x) + Math.PI / 2;

    const snapSelect = document.getElementById(
      isZoom ? "zoomSnapSelect" : "snapSelect",
    );
    const snapValue = parseFloat(snapSelect.value);
    let beat = angleToBeat(angle);
    beat = Math.round(beat / snapValue) * snapValue;

    const targetMarkers = isZoom ? zoomMarkers : markers;
    const targetSound = isZoom ? zoomSelectedSound : selectedSound;

    const existingIndex = targetMarkers.findIndex(
      (m) => Math.abs(m.beat - beat) < 0.01,
    );

    if (existingIndex >= 0) {
      targetMarkers.splice(existingIndex, 1);
    } else {
      targetMarkers.push({ beat, sound: targetSound, active: false });
    }

    if (isZoom) {
      markers.length = 0;
      markers.push(...JSON.parse(JSON.stringify(zoomMarkers)));
      draw();
    }

    isZoom ? drawZoom() : draw();
  }

  function clearMarkers(isZoom = false) {
    const targetMarkers = isZoom ? zoomMarkers : markers;

    if (targetMarkers.length === 0) {
      showToast("There are no markers to clear.");
      return;
    }

    if (
      targetMarkers.length > 5 &&
      !window.confirm(`Clear all ${targetMarkers.length} markers?`)
    ) {
      return;
    }

    targetMarkers.length = 0;

    if (isZoom) {
      markers.length = 0;
      if (zoomStopLoop) {
        clearInterval(zoomStopLoop);
        zoomStopLoop = null;
        document.getElementById("playZoomSkeleton").textContent = "Play Cycle";
      }
    } else {
      if (stopLoop) {
        clearInterval(stopLoop);
        stopLoop = null;
        document.getElementById("playSkeleton").textContent = "Play Cycle";
      }
    }

    isZoom ? drawZoom() : draw();
    if (isZoom) draw();
    showToast("Markers cleared.");
  }

  async function playAudio(
    bpm,
    cycleLength,
    loadedBuffers,
    markerArray,
    isZoom = false,
  ) {
    const beatLength = 60 / bpm;
    const cycleDuration = cycleLength * beatLength;
    const startTime = audioCtx.currentTime;

    function scheduleCycle(cycleStart) {
      markerArray.forEach((hit) => {
        const sound = loadedBuffers[hit.sound];
        if (!sound) return;

        const timeOffset = hit.beat * beatLength;
        const playTime = cycleStart + timeOffset;

        const source = audioCtx.createBufferSource();
        source.buffer = sound;
        source.connect(audioCtx.destination);
        source.start(playTime);

        const now = audioCtx.currentTime;
        const delay = (playTime - now) * 1000;

        setTimeout(() => {
          hit.active = true;

          if (isZoom && zoomModal.classList.contains("active")) {
            markers.forEach((m) => {
              if (Math.abs(m.beat - hit.beat) < 0.01 && m.sound === hit.sound) {
                m.active = true;
              }
            });
            draw();
          }

          isZoom ? drawZoom() : draw();

          setTimeout(() => {
            hit.active = false;

            if (isZoom && zoomModal.classList.contains("active")) {
              markers.forEach((m) => {
                if (
                  Math.abs(m.beat - hit.beat) < 0.01 &&
                  m.sound === hit.sound
                ) {
                  m.active = false;
                }
              });
              draw();
            }

            isZoom ? drawZoom() : draw();
          }, 150);
        }, delay);
      });
    }

    scheduleCycle(startTime);

    return setInterval(() => {
      const cycleStart = audioCtx.currentTime;
      scheduleCycle(cycleStart);
    }, cycleDuration * 1000);
  }

  function renderBeatGrid(totalBeats) {
    let gridHTML = "";
    for (let i = 0; i <= totalBeats; i++) {
      gridHTML += `<div class="beat-line main-beat" style="left:${(i / totalBeats) * 100}%;"></div>`;
      if (i < totalBeats) {
        for (let j = 1; j < 4; j++) {
          const subBeatPos = (i + j / 4) / totalBeats;
          gridHTML += `<div class="beat-line sub-beat" style="left:${subBeatPos * 100}%;"></div>`;
        }
        gridHTML += `
          <div class="beat-container" style="width:${(1 / totalBeats) * 100}%;">
            <div class="beat-label">${i}</div>
          </div>
        `;
      }
    }
    return gridHTML;
  }

  function renderMusicSheet() {
    const sheetContainer = document.getElementById("musicSheet");

    if (composition.length === 0) {
      sheetContainer.innerHTML = `
        <div class="empty-sheet">
          <div class="empty-message">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
            </svg>
            <p>No cycles added yet</p>
            <small>Click “Add to input” to add your first cycle.</small>
          </div>
        </div>
      `;
      return;
    }

    let sheetHTML = "";

    composition.forEach((cycle, cycleIndex) => {
      const cycleNumber = cycleIndex + 1;
      const sortedMarkers = [...cycle.markers].sort((a, b) => a.beat - b.beat);

      sheetHTML += `
        <div class="cycle-display" data-cycle-id="${cycle.id}" data-cycle-index="${cycleIndex}">
          <div class="cycle-header">
            <span class="cycle-number">Cycle ${cycleNumber}</span>
            <div class="cycle-controls">
              <button class="cycle-delete-btn" data-delete-cycle="${cycleIndex}" type="button">Delete</button>
            </div>
          </div>

          <div class="beat-timeline" style="height:80px;position:relative;">
            <div class="playback-progress" id="progress-${cycleIndex}" style="width:0%;"></div>
            ${renderBeatGrid(nBeats)}
            ${sortedMarkers
              .map(
                (marker, markerIndex) => `
              <div
                class="sound-marker"
                data-cycle="${cycleIndex}"
                data-beat="${marker.beat}"
                data-sound="${marker.sound}"
                data-marker-index="${markerIndex}"
                style="
                  left:${(marker.beat / nBeats) * 100}%;
                  top:50%;
                  background-color:${SOUNDS[marker.sound].color};
                  border-color:${getContrastColor(SOUNDS[marker.sound].color)};
                "
                title="${marker.sound} at beat ${marker.beat.toFixed(2)}"
              >
                ${SOUNDS[marker.sound].symbol}
              </div>
            `,
              )
              .join("")}
          </div>
        </div>
      `;
    });

    sheetContainer.innerHTML = sheetHTML;

    sheetContainer.querySelectorAll("[data-delete-cycle]").forEach((button) => {
      button.addEventListener("click", () => {
        const cycleIndex = Number(button.getAttribute("data-delete-cycle"));
        deleteCycle(cycleIndex);
      });
    });
  }

  function scheduleCycleAudio(cycle, cycleIndex, startOffset, beatLength) {
    cycle.markers.forEach((marker) => {
      const playTime =
        playbackState.startTime + startOffset + marker.beat * beatLength;
      const soundBuffer = buffers[marker.sound];

      if (soundBuffer) {
        const source = audioCtx.createBufferSource();
        source.buffer = soundBuffer;
        source.connect(audioCtx.destination);
        source.start(playTime);
      }
    });
  }

  function updatePlaybackVisuals() {
    if (!playbackState.isPlaying || !playbackState.startTime) return;

    const elapsed = audioCtx.currentTime - playbackState.startTime;
    const beatLength = 60 / tempo;
    const cycleDuration = nBeats * beatLength;

    const currentCycleIndex = Math.floor(elapsed / cycleDuration);

    if (currentCycleIndex < composition.length) {
      const cycleStart = currentCycleIndex * cycleDuration;
      const progressBar = document.getElementById(
        `progress-${currentCycleIndex}`,
      );

      if (progressBar) {
        if (elapsed >= cycleStart && elapsed <= cycleStart + cycleDuration) {
          const cycleProgress = ((elapsed - cycleStart) / cycleDuration) * 100;
          progressBar.style.width = `${cycleProgress}%`;
          playbackState.currentCycle = currentCycleIndex;
          updateMarkerHighlights(
            currentCycleIndex,
            elapsed - cycleStart,
            beatLength,
          );
        }
      }

      composition.forEach((_, idx) => {
        if (idx !== currentCycleIndex) {
          const otherProgressBar = document.getElementById(`progress-${idx}`);
          if (otherProgressBar) otherProgressBar.style.width = "0%";
        }
      });

      clearAllHighlightsExcept(currentCycleIndex);
    } else {
      stopPlayback();
    }

    if (playbackState.isPlaying) {
      playbackState.animationFrame = requestAnimationFrame(
        updatePlaybackVisuals,
      );
    }
  }

  function updateMarkerHighlights(cycleIndex, elapsedInCycle, beatLength) {
    composition[cycleIndex].markers.forEach((marker) => {
      const markerEl = document.querySelector(
        `[data-cycle="${cycleIndex}"][data-beat="${marker.beat}"][data-sound="${marker.sound}"]`,
      );

      if (markerEl) {
        const markerTime = marker.beat * beatLength;
        const timeDiff = Math.abs(elapsedInCycle - markerTime);
        markerEl.classList.toggle("playing", timeDiff < 0.1);
      }
    });
  }

  function clearAllHighlightsExcept(exceptCycleIndex) {
    document.querySelectorAll(".sound-marker").forEach((marker) => {
      const cycleIndex = Number(marker.dataset.cycle);
      if (cycleIndex !== exceptCycleIndex) {
        marker.classList.remove("playing");
      }
    });
  }

  function stopPlayback() {
    if (!playbackState.isPlaying) return;

    playbackState.isPlaying = false;
    playbackState.startTime = null;

    if (playbackState.animationFrame) {
      cancelAnimationFrame(playbackState.animationFrame);
      playbackState.animationFrame = null;
    }

    document.querySelectorAll(".sound-marker").forEach((marker) => {
      marker.classList.remove("playing");
    });

    composition.forEach((_, cycleIndex) => {
      const progressBar = document.getElementById(`progress-${cycleIndex}`);
      if (progressBar) progressBar.style.width = "0%";
    });

    document.getElementById("playComposition").textContent = "Play All";
  }

  function deleteCycle(cycleIndex) {
    if (cycleIndex < 0 || cycleIndex >= composition.length) return;

    const cycleNumber = cycleIndex + 1;
    if (window.confirm(`Delete cycle ${cycleNumber}?`)) {
      composition.splice(cycleIndex, 1);
      renderMusicSheet();
      showToast(`Cycle ${cycleNumber} deleted.`);
    }
  }

  function initZoomView() {
    zoomMarkers = JSON.parse(JSON.stringify(markers));
    zoomSelectedSound = selectedSound;

    document.getElementById("zoomSnapSelect").value =
      document.getElementById("snapSelect").value;
    document.getElementById("zoomCurrentSound").textContent = selectedSound;

    createSoundButtons("zoomSoundButtons", true);
    drawZoom();

    if (!zoomInitialized) {
      setupZoomEvents();
      zoomInitialized = true;
    }
  }

  function setupZoomEvents() {
    zoomCanvas.addEventListener("click", (event) =>
      handleCanvasClick(event, true),
    );

    zoomCanvas.addEventListener("mousemove", (event) => {
      const rect = zoomCanvas.getBoundingClientRect();
      const centerX = zoomCanvas.width / 2;
      const centerY = zoomCanvas.height / 2;

      const x = event.clientX - rect.left - centerX;
      const y = event.clientY - rect.top - centerY;
      const angle = Math.atan2(y, x) + Math.PI / 2;

      const snapValue = parseFloat(
        document.getElementById("zoomSnapSelect").value,
      );
      let beat = angleToBeat(angle);
      beat = Math.round(beat / snapValue) * snapValue;

      zoomHoverBeat = beat;
      drawZoom();
    });

    zoomCanvas.addEventListener("mouseleave", () => {
      zoomHoverBeat = null;
      drawZoom();
    });

    document
      .getElementById("zoomSnapSelect")
      .addEventListener("change", function () {
        document.getElementById("snapSelect").value = this.value;
        draw();
      });

    document
      .getElementById("snapSelect")
      .addEventListener("change", function () {
        document.getElementById("zoomSnapSelect").value = this.value;
        drawZoom();
      });
  }

  function closeZoomModal() {
    zoomModal.classList.remove("active");
    document.body.style.overflow = "";

    markers.length = 0;
    markers.push(...JSON.parse(JSON.stringify(zoomMarkers)));
    draw();

    if (zoomStopLoop) {
      clearInterval(zoomStopLoop);
      zoomStopLoop = null;
      document.getElementById("playZoomSkeleton").textContent = "Play Cycle";
    }
  }

  function setupEventListeners() {
    const snapSelect = document.getElementById("snapSelect");
    const playSkeletonButton = document.getElementById("playSkeleton");
    const appendCycleButton = document.getElementById("appendCycle");
    const clearCompositionButton = document.getElementById("clearComposition");
    const playCompositionButton = document.getElementById("playComposition");
    const clearMarkersButton = document.getElementById("clearMarkers");
    const clearZoomMarkersButton = document.getElementById("clearZoomMarkers");
    const zoomCanvasButton = document.getElementById("zoomCanvas");
    const closeZoomButton = document.getElementById("closeZoomModal");
    const zoomOverlay = document.getElementById("zoomOverlay");
    const sendInputButton = document.getElementById("sendInput");
    const exportChatButton = document.getElementById("export-chat");
    const deleteChatButton = document.getElementById("delete-chat");
    const composeNewInputButton = document.getElementById(
      "composeNewInputButton",
    );
    const compositionTabButton = document.getElementById("composition-tab-btn");
    const chatTabButton = document.getElementById("chat-tab-btn");
    const tabs = document.querySelectorAll(".tab-btn");
    const contents = document.querySelectorAll(".tab-content");

    canvas.addEventListener("mousemove", (event) => {
      const x = event.offsetX - cx;
      const y = event.offsetY - cy;
      const angle = Math.atan2(y, x) + Math.PI / 2;
      hoverBeat = angleToBeat(angle);
      draw();
    });

    canvas.addEventListener("mouseleave", () => {
      hoverBeat = null;
      draw();
    });

    canvas.addEventListener("click", (event) =>
      handleCanvasClick(event, false),
    );

    playSkeletonButton.addEventListener("click", async (event) => {
      if (audioCtx.state === "suspended") await audioCtx.resume();

      if (!stopLoop) {
        if (Object.keys(buffers).length !== Object.keys(SOUNDS).length - 1)
          return;

        stopLoop = await playAudio(tempo, nBeats, buffers, markers, false);
        event.currentTarget.textContent = "Stop";
      } else {
        clearInterval(stopLoop);
        stopLoop = null;
        event.currentTarget.textContent = "Play Cycle";
      }
    });

    document
      .getElementById("playZoomSkeleton")
      .addEventListener("click", async (event) => {
        if (audioCtx.state === "suspended") await audioCtx.resume();

        if (!zoomStopLoop) {
          if (Object.keys(buffers).length !== Object.keys(SOUNDS).length - 1)
            return;

          zoomStopLoop = await playAudio(
            tempo,
            nBeats,
            buffers,
            zoomMarkers,
            true,
          );
          event.currentTarget.textContent = "Stop";
        } else {
          clearInterval(zoomStopLoop);
          zoomStopLoop = null;
          event.currentTarget.textContent = "Play Cycle";
        }
      });

    appendCycleButton.addEventListener("click", () => {
      if (markers.length === 0) {
        showToast("Please place a few markers before adding a cycle.");
        return;
      }

      const cycleMarkers = markers.map((marker) => ({
        beat: marker.beat,
        sound: marker.sound,
        color: SOUNDS[marker.sound].color,
        symbol: SOUNDS[marker.sound].symbol,
      }));

      composition.push({
        id: currentCycleId++,
        markers: cycleMarkers,
        createdAt: new Date().toISOString(),
      });

      renderMusicSheet();
      showToast(`Cycle ${composition.length} added to the input.`);
    });

    clearCompositionButton.addEventListener("click", () => {
      if (composition.length === 0) {
        showToast("The composition sheet is already empty.");
        return;
      }

      if (
        window.confirm(
          `Clear the entire composition (${composition.length} cycles)?`,
        )
      ) {
        composition = [];
        currentCycleId = 0;
        renderMusicSheet();
        stopPlayback();
        showToast("Composition cleared.");
      }
    });

    playCompositionButton.addEventListener("click", async function () {
      if (playbackState.isPlaying) {
        stopPlayback();
        this.textContent = "Play All";
        return;
      }

      if (composition.length === 0) {
        showToast("There are no cycles in the composition.");
        return;
      }

      if (audioCtx.state === "suspended") await audioCtx.resume();

      const beatLength = 60 / tempo;
      const cycleDuration = nBeats * beatLength;

      playbackState.isPlaying = true;
      playbackState.startTime = audioCtx.currentTime;
      playbackState.currentCycle = 0;

      composition.forEach((cycle, cycleIndex) => {
        const startOffset = cycleIndex * cycleDuration;
        scheduleCycleAudio(cycle, cycleIndex, startOffset, beatLength);
      });

      playbackState.animationFrame = requestAnimationFrame(
        updatePlaybackVisuals,
      );
      this.textContent = "Stop";

      const totalDuration = composition.length * cycleDuration;
      showToast(`Playing ${composition.length} cycles.`, totalDuration * 1000);

      setTimeout(
        () => {
          if (playbackState.isPlaying) stopPlayback();
        },
        totalDuration * 1000 + 100,
      );
    });

    clearMarkersButton.addEventListener("click", () => clearMarkers(false));
    clearZoomMarkersButton.addEventListener("click", () => clearMarkers(true));

    zoomCanvasButton.addEventListener("click", () => {
      initZoomView();
      zoomModal.classList.add("active");
      document.body.style.overflow = "hidden";
    });

    closeZoomButton.addEventListener("click", closeZoomModal);
    zoomOverlay.addEventListener("click", closeZoomModal);

    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        appendCycleButton.click();
      }

      if (event.key === "Escape") {
        if (zoomModal.classList.contains("active")) {
          closeZoomModal();
        } else if (playbackState.isPlaying) {
          event.preventDefault();
          stopPlayback();
        }
      }

      if (event.key === " " && playbackState.isPlaying) {
        event.preventDefault();
        stopPlayback();
      }
    });

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((button) => button.classList.remove("active"));
        tab.classList.add("active");

        contents.forEach((content) => {
          content.style.display = "none";
        });

        document.getElementById(`${tab.dataset.tab}-tab`).style.display =
          "flex";
      });
    });

    composeNewInputButton.addEventListener("click", () => {
      compositionTabButton.click();
    });

    sendInputButton.addEventListener("click", async () => {
      if (composition.length === 0) {
        showToast("The input is currently empty.");
        return;
      }

      const comp = composition;
      composition = [];
      currentCycleId = 0;
      renderMusicSheet();
      stopPlayback();

      sendInputButton.textContent = "Loading...";
      sendInputButton.disabled = true;

      const tokens = getTokens(comp);

      try {
        const resUser = await fetch(`${MODEL_API_URL}/sound`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ tokens, tempo }),
        });

        if (!resUser.ok) {
          showToast("We were unable to prepare your input audio.");
          sendInputButton.textContent = "Send to model";
          sendInputButton.disabled = false;
          return;
        }

        const audioBlob = await resUser.blob();
        const audioUrl = URL.createObjectURL(audioBlob);

        document
          .getElementById("conversation-container")
          .appendChild(createAudioMessageElement(audioUrl, "user"));

        chatTabButton.click();
        sendInputButton.disabled = false;
        sendInputButton.textContent = "Send to model";
        document.getElementById("empty-sheet").style.display = "none";
        document.getElementById("conversation-container").style.display =
          "block";

        const sessionId = localStorage.getItem("model_session_id");
        const body = sessionId
          ? { tokens, session_id: sessionId, tempo }
          : { tokens, tempo };

        const loadingMessage = createLoadingElement();
        document
          .getElementById("conversation-container")
          .appendChild(loadingMessage);

        const resModel = await fetch(MODEL_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        if (!resModel.ok) {
          document
            .getElementById("conversation-container")
            .removeChild(loadingMessage);
          showToast("The model did not respond successfully.");
          return;
        }

        const newSessionId = resModel.headers.get("x-session-id");

        if (!newSessionId) {
          document
            .getElementById("conversation-container")
            .removeChild(loadingMessage);
          showToast("The model response did not include a session.");
          return;
        }

        localStorage.setItem("model_session_id", newSessionId);

        const modelAudioBlob = await resModel.blob();
        const modelAudioUrl = URL.createObjectURL(modelAudioBlob);

        document
          .getElementById("conversation-container")
          .removeChild(loadingMessage);
        document
          .getElementById("conversation-container")
          .appendChild(createAudioMessageElement(modelAudioUrl, "ai"));
      } catch (error) {
        console.error(error);
        showToast("Something went wrong while talking to the model.");
        sendInputButton.textContent = "Send to model";
        sendInputButton.disabled = false;
      }
    });

    exportChatButton.addEventListener("click", async () => {
      const sessionId = localStorage.getItem("model_session_id");

      if (sessionId == null) {
        showToast("There is no active chat to export.");
        return;
      }

      try {
        const res = await fetch(
          `${MODEL_API_URL}/chat?session=${sessionId}&tempo=${tempo}`,
          {
            method: "GET",
          },
        );

        if (!res.ok) {
          showToast("The chat export could not be prepared.");
          return;
        }

        const audioBlob = await res.blob();
        const audioURL = URL.createObjectURL(audioBlob);

        const link = document.createElement("a");
        link.href = audioURL;
        link.download = "derboukagpt-chat.wav";

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(audioURL);
      } catch (error) {
        console.error(error);
        showToast("Something went wrong while exporting the chat.");
      }
    });

    deleteChatButton.addEventListener("click", () => {
      localStorage.removeItem("model_session_id");
      document.getElementById("conversation-container").style.display = "none";
      document.getElementById("conversation-container").innerHTML = "";
      document.getElementById("empty-sheet").style.display = "flex";
      showToast("Chat deleted.");
    });

    snapSelect.addEventListener("change", draw);
  }

  function createAudioMessageElement(audioSrc, type = "user") {
    const wrapper = document.createElement("div");
    wrapper.className = `message-wrapper ${type}-message`;

    const avatar = document.createElement("div");
    avatar.className = `message-avatar ${type === "ai" ? "ai-avatar" : ""}`;
    avatar.innerHTML =
      type === "user"
        ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
             <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
             <circle cx="12" cy="7" r="4" />
           </svg>`
        : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
             <rect x="4" y="8" width="16" height="12" rx="2" />
             <circle cx="9" cy="13" r="1.5" fill="currentColor" />
             <circle cx="15" cy="13" r="1.5" fill="currentColor" />
             <path d="M9 5v3" />
             <path d="M15 5v3" />
           </svg>`;

    const content = document.createElement("div");
    content.className = "message-content";

    const audioContainer = document.createElement("div");
    audioContainer.className = "audio-message";

    const audio = document.createElement("audio");
    audio.controls = true;

    if (typeof audioSrc === "string") {
      const source = document.createElement("source");
      source.src = audioSrc;
      source.type = "audio/wav";
      audio.appendChild(source);
    } else if (audioSrc instanceof Blob) {
      const url = URL.createObjectURL(audioSrc);
      audio.src = url;
      audio.addEventListener("loadeddata", () => URL.revokeObjectURL(url), {
        once: true,
      });
      audio.addEventListener("error", () => URL.revokeObjectURL(url), {
        once: true,
      });
    } else if (audioSrc instanceof MediaSource) {
      audio.src = URL.createObjectURL(audioSrc);
    }

    audio.appendChild(
      document.createTextNode(
        "Your browser does not support the audio element.",
      ),
    );

    audioContainer.appendChild(audio);
    content.appendChild(audioContainer);
    wrapper.appendChild(avatar);
    wrapper.appendChild(content);

    return wrapper;
  }

  function createLoadingElement() {
    const wrapper = document.createElement("div");
    wrapper.className = "message-wrapper ai-message";

    const avatar = document.createElement("div");
    avatar.className = "message-avatar ai-avatar";
    avatar.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <circle cx="9" cy="13" r="1.5" fill="currentColor" />
      <circle cx="15" cy="13" r="1.5" fill="currentColor" />
      <path d="M9 5v3" />
      <path d="M15 5v3" />
    </svg>`;

    const content = document.createElement("div");
    content.className = "message-content";
    content.innerText = "...";

    wrapper.appendChild(avatar);
    wrapper.appendChild(content);

    return wrapper;
  }

  function getTokens(comp) {
    const arr = [];
    for (const cycle of comp) {
      const cycleArray = [];
      for (const marker of cycle.markers) {
        cycleArray.push({ beat: marker.beat, sound: marker.sound });
      }
      arr.push(cycleArray);
    }

    const symbols = {
      Doom: "D",
      "Open Tak": "OTA",
      "Open Tik": "OTI",
      Silence: "S",
      Pa2: "PA2",
    };

    const tokens = [];

    for (const cycle of arr) {
      tokens.push("<SOC>");

      const temp = cycle
        .map((hit) => [hit.beat, hit.sound])
        .sort((a, b) => a[0] - b[0]);

      for (let i = 0; i < nBeats; i++) {
        tokens.push("<SOB>");

        const hitsInBeat = [];
        for (const hit of temp) {
          if (hit[0] < i + 1 && hit[0] >= i) {
            hitsInBeat.push(hit);
          }
        }

        let minDelta = 10000;
        if (hitsInBeat.length > 1) {
          for (let k = 0; k < hitsInBeat.length - 1; k++) {
            minDelta = Math.min(
              minDelta,
              hitsInBeat[k + 1][0] - hitsInBeat[k][0],
            );
          }
        }

        if (hitsInBeat.length === 1) {
          minDelta = hitsInBeat[0][0] - i;
        }

        const subd = minDelta === 10000 || minDelta === 0 ? 4 : 1 / minDelta;
        tokens.push("SUBD_" + subd);

        for (let l = 0; l < subd; l++) {
          let found = false;
          tokens.push("POS_" + l);

          const current = i + (1 / subd) * l;
          for (const hit of hitsInBeat) {
            if (hit[0] === current) {
              tokens.push("HIT_" + symbols[hit[1]]);
              found = true;
            }
          }

          if (!found) tokens.push("HIT_S");
        }

        tokens.push("<EOB>");
      }

      tokens.push("<EOC>");
    }

    return tokens;
  }

  function init() {
    createSoundButtons("sound-buttons", false);
    animate();
    setupEventListeners();
    loadAllBuffers();
    localStorage.removeItem("model_session_id");
  }

  init();
}
