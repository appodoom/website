export function page1script() {
  const rowLabels = ["Percentages", "Doom", "Open Tak", "Open Tik", "Pa2"];

  const maxSubd = Number(localStorage.getItem("maxSubd"));
  generateMatrix(maxSubd);

  function generateMatrix(nbCols) {
    const rows = rowLabels.length;
    const cols = nbCols;
    const container = document.getElementById("matrix");
    container.innerHTML = "";

    container.style.gridTemplateColumns = `120px repeat(${cols}, 48px)`;
    container.style.gridTemplateRows = `36px repeat(${rows}, 34px)`;

    container.appendChild(document.createElement("div"));

    for (let c = cols; c > 0; c--) {
      const div = document.createElement("div");
      div.className = "col-label";
      div.textContent = c;
      container.appendChild(div);
    }

    for (let r = 0; r < rows; r++) {
      const label = document.createElement("div");
      label.className = "row-label";
      label.textContent = rowLabels[r];
      container.appendChild(label);

      for (let c = 0; c < cols; c++) {
        const input = document.createElement("input");
        input.type = "text";
        input.classList.add("step_2_input");
        container.appendChild(input);
      }
    }

    const savedMatrix = localStorage.getItem("matrix");
    if (savedMatrix) {
      try {
        const parsed = JSON.parse(savedMatrix);
        const rawInputs = document.querySelectorAll(".step_2_input");
        let index = 0;

        for (let r = 0; r < parsed.length; r++) {
          for (let c = 0; c < parsed[r].length; c++) {
            if (rawInputs[index] && parsed[r][c] !== undefined) {
              rawInputs[index].value = parsed[r][c];
            }
            index++;
          }
        }
      } catch (error) {
        console.error("Could not restore matrix:", error);
      }
    }
  }

  function getMatrix() {
    const matrixInputsRaw = document.querySelectorAll(".step_2_input");
    const maxSubd = Number(localStorage.getItem("maxSubd"));
    const matrixInputs = [];
    let rowIndex = -1;

    for (let i = 0; i < matrixInputsRaw.length; i++) {
      if (i % maxSubd === 0) {
        matrixInputs.push([]);
        rowIndex++;
      }

      const rawValue = matrixInputsRaw[i].value.trim();
      const valueToPush =
        rawValue === ""
          ? undefined
          : Number.isNaN(Number(rawValue))
            ? undefined
            : Number(rawValue);

      matrixInputs[rowIndex].push(valueToPush);
    }

    fillMatrix(matrixInputs);
    return matrixInputs;
  }

  function fillMatrix(matrix) {
    for (let i = 0; i < matrix.length; i++) {
      let lastValue = 0;
      for (let j = 0; j < matrix[0].length; j++) {
        if (matrix[i][j] !== undefined) lastValue = matrix[i][j];
        else matrix[i][j] = lastValue;
      }
    }
  }

  document.getElementById("next-btn").addEventListener("click", () => {
    const matrix = getMatrix();
    localStorage.setItem("matrix", JSON.stringify(matrix));
    localStorage.setItem("currPage", 2);
    document.getElementById("dummy").click();
  });
}
