export function page2script() {
  const nBeats = Number(localStorage.getItem("cycleLength"));
  const canvas = document.getElementById("circle");
  const ctx = canvas.getContext("2d");
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const radius = 150;

  const markers = [];
  let hoverBeat = null;
  let selectedSound = "Doom";
  let stopLoop = null;

  const pathsMap = {
    Doom: "/web/generate/sounds/doum.wav",
    "Open Tak": "/web/generate/sounds/open_tak.wav",
    "Open Tik": "/web/generate/sounds/open_tik.wav",
    Pa2: "/web/generate/sounds/pa2.wav",
  };

  const symbolMap = {
    Doom: "D",
    "Open Tak": "OTA",
    "Open Tik": "OTI",
    Pa2: "PA2",
    Silence: "S",
  };

  let buffers = {};

  const sounds = ["Doom", "Open Tak", "Open Tik", "Pa2", "Silence"];
  const colors = {
    Doom: "#e74c3c",
    "Open Tak": "#3498db",
    "Open Tik": "#9b59b6",
    Pa2: "#1abc9c",
    Silence: "#95a5a6",
  };

  const soundButtonsContainer = document.getElementById("sound-buttons");
  sounds.forEach((sound) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sound-btn";
    button.innerHTML = `
      <div class="color-indicator" style="background-color: ${colors[sound]}"></div>
      ${sound}
    `;

    button.addEventListener("click", () => {
      selectedSound = sound;
      document.getElementById("currentSound").textContent = sound;

      document.querySelectorAll(".sound-btn").forEach((btn) => {
        btn.classList.remove("active");
      });

      button.classList.add("active");
    });

    soundButtonsContainer.appendChild(button);
  });

  document.querySelector(".sound-btn").classList.add("active");

  function angleToBeat(angle) {
    if (angle < 0) angle += 2 * Math.PI;

    let beat = ((2 * Math.PI - angle) / (2 * Math.PI)) * nBeats;
    const snapEnabled = document.getElementById("snapCheckbox").checked;
    if (snapEnabled) beat = Math.round(beat * 4) / 4;

    return beat === nBeats ? 0 : beat;
  }

  function beatToAngle(beat) {
    return 2 * Math.PI - (beat / nBeats) * 2 * Math.PI;
  }

  function draw() {
    const styles = getComputedStyle(document.documentElement);
    const circleColor =
      styles.getPropertyValue("--border-dark").trim() || "#888";
    const tickColor = styles.getPropertyValue("--text").trim() || "#333";
    const secondaryTickColor =
      styles.getPropertyValue("--text-muted").trim() || "#666";
    const hoverColor = "rgba(204, 84, 24, 0.18)";
    const hoverBorder = "rgba(204, 84, 24, 0.5)";

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = circleColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.lineWidth = 1;
    for (let i = 0; i < nBeats * 2; i++) {
      const angle = beatToAngle(i / 2) - Math.PI / 2;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);

      ctx.beginPath();

      if (i % 2 === 0) {
        ctx.arc(x, y, 5, 0, 2 * Math.PI);
        ctx.strokeStyle = tickColor;
      } else {
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.strokeStyle = secondaryTickColor;
      }

      ctx.stroke();
    }

    markers.forEach((marker) => {
      const angle = beatToAngle(marker.beat) - Math.PI / 2;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);

      ctx.save();
      ctx.beginPath();

      if (marker.active) {
        ctx.shadowBlur = 20;
        ctx.shadowColor = colors[marker.sound];
        ctx.fillStyle = colors[marker.sound];
        ctx.arc(x, y, 14, 0, 2 * Math.PI);
      } else {
        ctx.fillStyle = colors[marker.sound];
        ctx.arc(x, y, 10, 0, 2 * Math.PI);
      }

      ctx.fill();
      ctx.strokeStyle = "#2c3e50";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    });

    if (hoverBeat !== null) {
      const angle = beatToAngle(hoverBeat) - Math.PI / 2;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);

      ctx.beginPath();
      ctx.arc(x, y, 10, 0, 2 * Math.PI);
      ctx.fillStyle = hoverColor;
      ctx.fill();
      ctx.strokeStyle = hoverBorder;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function animate() {
    draw();
    requestAnimationFrame(animate);
  }
  animate();

  canvas.addEventListener("mousemove", (event) => {
    const tooltip = document.getElementById("tooltip");
    const rect = canvas.getBoundingClientRect();

    tooltip.style.left = `${rect.left + event.offsetX + 15}px`;
    tooltip.style.top = `${rect.top + event.offsetY + 15}px`;

    const x = event.offsetX - cx;
    const y = event.offsetY - cy;
    const angle = Math.atan2(y, x) + Math.PI / 2;
    hoverBeat = angleToBeat(angle);

    tooltip.textContent = "Beat: " + hoverBeat.toFixed(2);
    tooltip.style.display = "block";

    draw();
  });

  canvas.addEventListener("mouseleave", () => {
    hoverBeat = null;
    document.getElementById("tooltip").style.display = "none";
    draw();
  });

  canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left - cx;
    const y = event.clientY - rect.top - cy;
    const angle = Math.atan2(y, x) + Math.PI / 2;
    const beat = angleToBeat(angle);

    for (let i = 0; i < markers.length; i++) {
      if (markers[i].beat === beat) {
        markers.splice(i, 1);
        break;
      }
    }

    markers.push({ beat, sound: selectedSound, active: false });
    draw();
  });

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  async function loadAudioFile(url) {
    const response = await fetch(url);
    return await response.arrayBuffer();
  }

  async function decodeAudioData(arrayBuffer) {
    try {
      return await audioCtx.decodeAudioData(arrayBuffer);
    } catch (error) {
      console.error("Error decoding audio data:", error);
      return null;
    }
  }

  async function loadWavBuffer(filePath) {
    const arrayBuffer = await loadAudioFile(filePath);
    if (arrayBuffer) {
      return await decodeAudioData(arrayBuffer);
    }
    return null;
  }

  async function loadAllBuffers(targetBuffers) {
    for (const key in pathsMap) {
      const buffer = await loadWavBuffer(pathsMap[key]);
      if (buffer) {
        targetBuffers[key] = buffer;
      }
    }
  }

  document
    .getElementById("playSkeleton")
    .addEventListener("click", async (event) => {
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      if (!stopLoop) {
        if (Object.keys(buffers).length !== Object.keys(pathsMap).length)
          return;

        const bpm = Number(localStorage.getItem("tempo"));
        const cycleLength = Number(localStorage.getItem("cycleLength"));
        stopLoop = await playAudio(bpm, cycleLength, buffers);
        event.target.textContent = "Stop";
      } else {
        clearInterval(stopLoop);
        stopLoop = null;
        event.target.textContent = "Play";
      }
    });

  loadAllBuffers(buffers);

  async function playAudio(bpm, cycleLength, loadedBuffers) {
    const beatLength = 60 / bpm;
    const cycleDuration = cycleLength * beatLength;
    const startTime = audioCtx.currentTime;

    function scheduleCycle(cycleStart) {
      for (const hit of markers) {
        const sound = loadedBuffers[hit.sound];
        if (!sound) continue;

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
          setTimeout(() => {
            hit.active = false;
          }, 150);
        }, delay);
      }
    }

    scheduleCycle(startTime);

    return setInterval(() => {
      const cycleStart = audioCtx.currentTime;
      scheduleCycle(cycleStart);
    }, cycleDuration * 1000);
  }

  function getSkeletonFromMarkers(sourceMarkers) {
    const sorted = [...sourceMarkers].sort((a, b) => a.beat - b.beat);
    const output = [];
    let oldBeat = 0;

    for (const { beat, sound } of sorted) {
      const newBeat = beat - oldBeat;
      output.push([newBeat, symbolMap[sound]]);
      oldBeat = beat;
    }

    if (sorted.length > 0) {
      output[0][0] = nBeats - sorted[sorted.length - 1].beat + output[0][0];
    }

    return output;
  }

  document.getElementById("next-btn").addEventListener("click", async () => {
    const skeleton = getSkeletonFromMarkers(markers);
    localStorage.setItem("skeleton", JSON.stringify(skeleton));
    localStorage.setItem("currPage", 3);
    document.getElementById("dummy").click();
  });
}
