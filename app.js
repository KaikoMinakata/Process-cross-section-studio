const MATERIALS = {
  Si: { color: "#7a8ca4" },
  SiO2: { color: "#5ba3d9" },
  SiN: { color: "#8a6ccf" },
  Poly: { color: "#f0a64a" },
  PR: { color: "#d84d57" },
  Metal: { color: "#7b8b98" },
};

const COLS = 96;
const ROWS = 64;
const CELL = 12;
const MARGIN_X = 24;
const MARGIN_Y = 26;
const MASK_BAND = 30;
const LEGEND_W = 250;

const canvas = document.getElementById("scene");
const ctx = canvas.getContext("2d");

const materialSelect = document.getElementById("materialSelect");
const amountInput = document.getElementById("amountInput");
const etchType = document.getElementById("etchType");
const useMask = document.getElementById("useMask");
const maskBrush = document.getElementById("maskBrush");
const maskPatternMode = document.getElementById("maskPatternMode");
const lineWidthInput = document.getElementById("lineWidthInput");
const spaceWidthInput = document.getElementById("spaceWidthInput");
const maskPreset = document.getElementById("maskPreset");
const historyList = document.getElementById("historyList");

const depositBtn = document.getElementById("depositBtn");
const etchBtn = document.getElementById("etchBtn");
const stripBtn = document.getElementById("stripBtn");
const undoBtn = document.getElementById("undoBtn");
const resetBtn = document.getElementById("resetBtn");
const applyPresetBtn = document.getElementById("applyPresetBtn");
const clearMaskBtn = document.getElementById("clearMaskBtn");
const materialNameInput = document.getElementById("materialNameInput");
const materialColorInput = document.getElementById("materialColorInput");
const saveMaterialBtn = document.getElementById("saveMaterialBtn");
const deleteMaterialBtn = document.getElementById("deleteMaterialBtn");
const materialList = document.getElementById("materialList");
const saveSceneBtn = document.getElementById("saveSceneBtn");
const svgBtn = document.getElementById("svgBtn");
const pngBtn = document.getElementById("pngBtn");
const pptxBtn = document.getElementById("pptxBtn");
const savedList = document.getElementById("savedList");
const purposeInput = document.getElementById("purposeInput");
const targetMaterialInput = document.getElementById("targetMaterialInput");
const pptLayoutMode = document.getElementById("pptLayoutMode");
const exportStatus = document.getElementById("exportStatus");

let grid = [];
let mask = new Array(COLS).fill(false);
let steps = [];
let history = [];
let isMaskPainting = false;
let savedSlides = [];
let maskStrokeStartCol = null;
let selectedLibraryMaterial = null;
const DEFAULT_MATERIAL = "SiO2";
const PROTECTED_MATERIALS = new Set(["Si"]);

function getMaterialNames() {
  return Object.keys(MATERIALS);
}

function syncMaterialEditor() {
  const selected = selectedLibraryMaterial;
  const spec = selected ? MATERIALS[selected] : null;

  if (!spec) {
    if (selected && !MATERIALS[selected]) selectedLibraryMaterial = null;
    materialNameInput.value = "";
    materialColorInput.value = "#5ba3d9";
    saveMaterialBtn.textContent = "Add Material";
    deleteMaterialBtn.disabled = true;
    return;
  }

  materialNameInput.value = selected;
  materialColorInput.value = spec.color;
  saveMaterialBtn.textContent = "Update Material";
  deleteMaterialBtn.disabled = PROTECTED_MATERIALS.has(selected);
}

function renderMaterialList() {
  materialList.innerHTML = "";
  getMaterialNames().forEach((name) => {
    const li = document.createElement("li");
    li.classList.toggle("is-selected", name === selectedLibraryMaterial);
    li.addEventListener("click", () => {
      selectedLibraryMaterial =
        selectedLibraryMaterial === name ? null : name;
      syncMaterialEditor();
      renderMaterialList();
    });

    const swatch = document.createElement("span");
    swatch.className = "material-swatch";
    swatch.style.background = MATERIALS[name].color;

    const label = document.createElement("span");
    label.className = "material-name";
    label.textContent = name;

    const tag = document.createElement("span");
    tag.className = "material-tag";
    if (PROTECTED_MATERIALS.has(name)) tag.textContent = "locked";
    else if (name === selectedLibraryMaterial) tag.textContent = "selected";

    li.appendChild(swatch);
    li.appendChild(label);
    li.appendChild(tag);
    materialList.appendChild(li);
  });
}

function renderMaterialSelect(preferred = materialSelect.value || DEFAULT_MATERIAL) {
  materialSelect.innerHTML = "";
  getMaterialNames().forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    materialSelect.appendChild(opt);
  });
  materialSelect.value = MATERIALS[preferred] ? preferred : getMaterialNames()[0];
  renderMaterialList();
}

function initMaterialSelect() {
  renderMaterialSelect(DEFAULT_MATERIAL);
}

function normalizeMaterialName(raw) {
  return raw.trim().replace(/\s+/g, " ");
}

function saveMaterial() {
  const selected = selectedLibraryMaterial;
  const name = normalizeMaterialName(materialNameInput.value);
  const color = materialColorInput.value || "#5ba3d9";
  if (!name) return;
  if (MATERIALS[name] && name !== selected) {
    alert(`Material "${name}" already exists.`);
    return;
  }

  pushHistory();

  const shouldRetargetProcessMaterial = materialSelect.value === selected;
  const isRename = selected && MATERIALS[selected] && selected !== name;
  if (isRename) {
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        if (grid[r][c] === selected) grid[r][c] = name;
      }
    }
    delete MATERIALS[selected];
  }

  MATERIALS[name] = { color };
  addStep(`${selected ? "Update" : "Add"} material: ${name}`);
  selectedLibraryMaterial = selected ? name : null;
  renderMaterialSelect(
    shouldRetargetProcessMaterial ? name : materialSelect.value
  );
  syncMaterialEditor();
  render();
}

function deleteMaterial() {
  const selected = selectedLibraryMaterial;
  if (!selected || PROTECTED_MATERIALS.has(selected)) return;

  pushHistory();
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (grid[r][c] === selected) grid[r][c] = null;
    }
  }
  delete MATERIALS[selected];
  addStep(`Delete material: ${selected}`);
  selectedLibraryMaterial = null;
  renderMaterialSelect(
    materialSelect.value === selected ? DEFAULT_MATERIAL : materialSelect.value
  );
  syncMaterialEditor();
  render();
}

function cloneGrid(src) {
  return src.map((row) => row.slice());
}

function cloneSavedSlides(src) {
  return src.map((s) => ({
    label: s.label,
    imageData: s.imageData,
    ops: (s.ops || []).slice(),
    purpose: s.purpose || "",
    targetMaterial: s.targetMaterial || "",
    grid: s.grid ? cloneGrid(s.grid) : null,
    mask: s.mask ? s.mask.slice() : null,
  }));
}

function createEmptyGrid() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
}

function seedSubstrate() {
  grid = createEmptyGrid();
  const substrateThickness = 8;
  for (let r = ROWS - substrateThickness; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) grid[r][c] = "Si";
  }
}

function snapshot() {
  return {
    grid: cloneGrid(grid),
    mask: mask.slice(),
    steps: steps.slice(),
    savedSlides: cloneSavedSlides(savedSlides),
  };
}

function restore(state) {
  grid = cloneGrid(state.grid);
  mask = state.mask.slice();
  steps = state.steps.slice();
  savedSlides = cloneSavedSlides(state.savedSlides || []);
  renderHistory();
  renderSavedList();
  render();
}

function pushHistory() {
  history.push(snapshot());
  if (history.length > 60) history.shift();
}

function addStep(text) {
  steps.push(text);
  if (steps.length > 120) steps.shift();
  renderHistory();
}

function renderHistory() {
  historyList.innerHTML = "";
  steps.forEach((step) => {
    const li = document.createElement("li");
    li.textContent = step;
    historyList.appendChild(li);
  });
}

function renderSavedList() {
  savedList.innerHTML = "";
  savedSlides.forEach((s, i) => {
    const li = document.createElement("li");
    const purposeText = s.purpose ? ` | Purpose: ${s.purpose}` : "";
    const targetText = s.targetMaterial ? ` | Material: ${s.targetMaterial}` : "";
    li.textContent = `${i + 1}. ${s.label}${purposeText}${targetText}`;
    savedList.appendChild(li);
  });
}

function topFilledRow(col) {
  for (let r = 0; r < ROWS; r += 1) if (grid[r][col] !== null) return r;
  return ROWS;
}

function deposit(material, thickness, applyMask) {
  for (let c = 0; c < COLS; c += 1) {
    if (applyMask && mask[c]) continue;
    for (let t = 0; t < thickness; t += 1) {
      const top = topFilledRow(c);
      const target = top - 1;
      if (target >= 0) grid[target][c] = material;
    }
  }
}

function etchAnisotropic(material, depth, applyMask) {
  for (let c = 0; c < COLS; c += 1) {
    if (applyMask && mask[c]) continue;
    for (let d = 0; d < depth; d += 1) {
      let top = -1;
      for (let r = 0; r < ROWS; r += 1) {
        if (grid[r][c] !== null) {
          top = r;
          break;
        }
      }
      if (top === -1) break;
      if (grid[top][c] === material) grid[top][c] = null;
      else break;
    }
  }
}

function exposedVoidMap(applyMask) {
  const exposed = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
  const q = [];
  for (let c = 0; c < COLS; c += 1) {
    if (applyMask && mask[c]) continue;
    if (grid[0][c] === null) {
      exposed[0][c] = true;
      q.push([0, c]);
    }
  }

  let idx = 0;
  while (idx < q.length) {
    const [r, c] = q[idx++];
    const n4 = [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ];
    n4.forEach(([nr, nc]) => {
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return;
      if (exposed[nr][nc]) return;
      if (grid[nr][nc] !== null) return;
      exposed[nr][nc] = true;
      q.push([nr, nc]);
    });
  }
  return exposed;
}

function etchIsotropic(material, depth, applyMask) {
  for (let iter = 0; iter < depth; iter += 1) {
    const exposed = exposedVoidMap(applyMask);
    const toRemove = [];
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        if (grid[r][c] !== material) continue;
        const n4 = [
          [r - 1, c],
          [r + 1, c],
          [r, c - 1],
          [r, c + 1],
        ];
        if (n4.some(([nr, nc]) => nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && exposed[nr][nc])) {
          toRemove.push([r, c]);
        }
      }
    }
    if (toRemove.length === 0) break;
    toRemove.forEach(([r, c]) => {
      grid[r][c] = null;
    });
  }
}

function stripMaterial(material) {
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (grid[r][c] === material) grid[r][c] = null;
    }
  }
}

function getLineSpaceWidths() {
  return {
    lineWidth: Math.max(1, Number(lineWidthInput.value) || 1),
    spaceWidth: Math.max(1, Number(spaceWidthInput.value) || 1),
  };
}

function getStripeMaskValue(offset, firstValue, lineWidth, spaceWidth) {
  const period = lineWidth + spaceWidth;
  const phase = offset % period;
  return phase < lineWidth ? firstValue : !firstValue;
}

function applyMaskPreset(name) {
  if (name === "none") return;
  mask.fill(false);

  if (name === "lines") {
    const { lineWidth, spaceWidth } = getLineSpaceWidths();
    const firstValue = maskBrush.value === "protect";
    const period = lineWidth + spaceWidth;
    for (let c = 0; c < COLS; c += 1) {
      const phase = c % period;
      mask[c] = phase < lineWidth ? firstValue : !firstValue;
    }
  }

  if (name === "contact") {
    mask.fill(true);
    const holes = [12, 24, 32, 45, 58, 70, 84];
    holes.forEach((center) => {
      for (let c = center - 1; c <= center + 1; c += 1) {
        if (c >= 0 && c < COLS) mask[c] = false;
      }
    });
  }
}

function getColFromPointer(ev) {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const x = (ev.clientX - rect.left) * sx;
  const col = Math.floor((x - MARGIN_X) / CELL);
  if (col < 0 || col >= COLS) return null;
  return col;
}

function drawMaskAtPointer(ev) {
  const col = getColFromPointer(ev);
  if (col === null) return;

  if (maskPatternMode.value === "stripe" && maskStrokeStartCol !== null) {
    const start = Math.min(maskStrokeStartCol, col);
    const end = Math.max(maskStrokeStartCol, col);
    const firstValue = maskBrush.value === "protect";
    const { lineWidth, spaceWidth } = getLineSpaceWidths();

    for (let current = start; current <= end; current += 1) {
      const offset = Math.abs(current - maskStrokeStartCol);
      mask[current] = getStripeMaskValue(offset, firstValue, lineWidth, spaceWidth);
    }
  } else {
    mask[col] = maskBrush.value === "protect";
  }

  render();
}

function render() {
  const w = MARGIN_X * 2 + COLS * CELL + LEGEND_W;
  const h = MARGIN_Y * 2 + MASK_BAND + ROWS * CELL;
  canvas.width = w;
  canvas.height = h;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#f8fbff";
  ctx.fillRect(0, 0, w, h);

  const gx = MARGIN_X;
  const gy = MARGIN_Y + MASK_BAND;
  const lx = gx + COLS * CELL + 20;
  const ly = gy;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(gx, gy, COLS * CELL, ROWS * CELL);

  ctx.fillStyle = "#eaf1fb";
  ctx.fillRect(gx, gy - MASK_BAND - 6, COLS * CELL, MASK_BAND + 6);

  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const m = grid[r][c];
      if (!m) continue;
      ctx.fillStyle = MATERIALS[m].color;
      ctx.fillRect(gx + c * CELL, gy + r * CELL, CELL, CELL);
    }
  }

  for (let c = 0; c < COLS; c += 1) {
    if (!mask[c]) continue;
    ctx.fillStyle = "rgba(216, 77, 87, 0.28)";
    ctx.fillRect(gx + c * CELL, gy - MASK_BAND, CELL, MASK_BAND + ROWS * CELL);
  }

  ctx.fillStyle = "#4b5d73";
  ctx.font = "12px Noto Sans JP, sans-serif";
  ctx.fillText("MASK BAND", gx, MARGIN_Y + 14);

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#cdd7e5";
  ctx.lineWidth = 1;
  ctx.fillRect(lx, ly, LEGEND_W - 32, 332);
  ctx.strokeRect(lx + 0.5, ly + 0.5, LEGEND_W - 32, 332);

  ctx.fillStyle = "#2f425a";
  ctx.font = "bold 15px Noto Sans JP, sans-serif";
  ctx.fillText("Canvas Legend", lx + 12, ly + 22);
  ctx.font = "12px Noto Sans JP, sans-serif";
  ctx.fillStyle = "#4d6078";
  ctx.fillText("Materials and mask overlays", lx + 12, ly + 42);

  ctx.fillStyle = "#2f425a";
  ctx.font = "bold 12px Noto Sans JP, sans-serif";
  ctx.fillText("Current material", lx + 12, ly + 68);
  ctx.fillStyle = MATERIALS[materialSelect.value].color;
  ctx.fillRect(lx + 12, ly + 78, 22, 14);
  ctx.strokeStyle = "#8798ad";
  ctx.strokeRect(lx + 12, ly + 78, 22, 14);
  ctx.fillStyle = "#2f425a";
  ctx.font = "12px Noto Sans JP, sans-serif";
  ctx.fillText(materialSelect.value, lx + 42, ly + 90);

  ctx.fillStyle = "rgba(216, 77, 87, 0.28)";
  ctx.fillRect(lx + 12, ly + 106, 22, 14);
  ctx.strokeStyle = "#c98f94";
  ctx.strokeRect(lx + 12, ly + 106, 22, 14);
  ctx.fillStyle = "#2f425a";
  ctx.fillText("Mask protect area", lx + 42, ly + 118);

  ctx.fillStyle = "#2f425a";
  ctx.font = "bold 12px Noto Sans JP, sans-serif";
  ctx.fillText("Material colors", lx + 12, ly + 146);

  let oy = ly + 170;
  Object.entries(MATERIALS).forEach(([name, spec]) => {
    ctx.fillStyle = spec.color;
    ctx.fillRect(lx + 12, oy - 10, 20, 16);
    ctx.strokeStyle = "#8798ad";
    ctx.strokeRect(lx + 12, oy - 10, 20, 16);
    ctx.fillStyle = "#2f425a";
    ctx.fillText(name, lx + 42, oy + 3);
    oy += 26;
  });
}

function downloadFile(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function exportPng() {
  const response = await fetch(createOutputImageData());
  const blob = await response.blob();
  downloadFile(blob, "process-cross-section.png");
}

function getTopContentRow() {
  return getTopContentRowForGrid(grid);
}

function getTopContentRowForGrid(sceneGrid) {
  let top = ROWS - 1;
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (sceneGrid[r][c] !== null) return Math.max(0, r - 3);
    }
  }
  return top;
}

function createOutputImageData() {
  return createOutputImageDataFromState(grid, mask);
}

function createOutputImageDataFromState(sceneGrid, sceneMask) {
  const topRow = getTopContentRowForGrid(sceneGrid);
  const visibleRows = ROWS - topRow;
  const padX = 28;
  const padY = 20;
  const w = COLS * CELL + padX * 2;
  const h = visibleRows * CELL + MASK_BAND + padY * 2;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const outCtx = out.getContext("2d");

  outCtx.fillStyle = "#ffffff";
  outCtx.fillRect(0, 0, w, h);
  outCtx.fillStyle = "#d9e6f8";
  outCtx.fillRect(padX, padY, COLS * CELL, MASK_BAND);

  const gy = padY + MASK_BAND;
  for (let r = topRow; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const m = sceneGrid[r][c];
      if (!m) continue;
      outCtx.fillStyle = MATERIALS[m].color;
      outCtx.fillRect(padX + c * CELL, gy + (r - topRow) * CELL, CELL, CELL);
    }
  }

  for (let c = 0; c < COLS; c += 1) {
    if (!sceneMask[c]) continue;
    outCtx.fillStyle = "rgba(216, 77, 87, 0.28)";
    outCtx.fillRect(padX + c * CELL, padY, CELL, MASK_BAND + visibleRows * CELL);
  }
  return out.toDataURL("image/png");
}

function buildSvg() {
  const w = MARGIN_X * 2 + COLS * CELL + LEGEND_W;
  const h = MARGIN_Y * 2 + MASK_BAND + ROWS * CELL;
  const gx = MARGIN_X;
  const gy = MARGIN_Y + MASK_BAND;
  const lx = gx + COLS * CELL + 20;
  const ly = gy;

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<rect x="0" y="0" width="${w}" height="${h}" fill="#f8fbff"/>`,
    `<rect x="${gx}" y="${gy}" width="${COLS * CELL}" height="${ROWS * CELL}" fill="#ffffff"/>`,
    `<rect x="${gx}" y="${gy - MASK_BAND - 6}" width="${COLS * CELL}" height="${MASK_BAND + 6}" fill="#eaf1fb"/>`,
  ];

  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const m = grid[r][c];
      if (!m) continue;
      parts.push(`<rect x="${gx + c * CELL}" y="${gy + r * CELL}" width="${CELL}" height="${CELL}" fill="${MATERIALS[m].color}"/>`);
    }
  }

  for (let c = 0; c < COLS; c += 1) {
    if (!mask[c]) continue;
    parts.push(
      `<rect x="${gx + c * CELL}" y="${gy - MASK_BAND}" width="${CELL}" height="${MASK_BAND + ROWS * CELL}" fill="rgba(216,77,87,0.28)"/>`
    );
  }

  parts.push(`<rect x="${lx}" y="${ly}" width="${LEGEND_W - 32}" height="332" fill="#ffffff" stroke="#cdd7e5"/>`);
  parts.push(`<text x="${lx + 12}" y="${ly + 22}" fill="#2f425a" font-size="15" font-weight="700" font-family="Noto Sans JP,sans-serif">Canvas Legend</text>`);
  parts.push(`<text x="${lx + 12}" y="${ly + 42}" fill="#4d6078" font-size="12" font-family="Noto Sans JP,sans-serif">Materials and mask overlays</text>`);
  parts.push(`<text x="${lx + 12}" y="${ly + 68}" fill="#2f425a" font-size="12" font-weight="700" font-family="Noto Sans JP,sans-serif">Current material</text>`);
  parts.push(`<rect x="${lx + 12}" y="${ly + 78}" width="22" height="14" fill="${MATERIALS[materialSelect.value].color}" stroke="#8798ad"/>`);
  parts.push(`<text x="${lx + 42}" y="${ly + 90}" fill="#2f425a" font-size="12" font-family="Noto Sans JP,sans-serif">${materialSelect.value}</text>`);
  parts.push(`<rect x="${lx + 12}" y="${ly + 106}" width="22" height="14" fill="rgba(216,77,87,0.28)" stroke="#c98f94"/>`);
  parts.push(`<text x="${lx + 42}" y="${ly + 118}" fill="#2f425a" font-size="12" font-family="Noto Sans JP,sans-serif">Mask protect area</text>`);
  parts.push(`<text x="${lx + 12}" y="${ly + 146}" fill="#2f425a" font-size="12" font-weight="700" font-family="Noto Sans JP,sans-serif">Material colors</text>`);
  let oy = ly + 170;
  Object.entries(MATERIALS).forEach(([name, spec]) => {
    parts.push(`<rect x="${lx + 12}" y="${oy - 10}" width="20" height="16" fill="${spec.color}" stroke="#8798ad"/>`);
    parts.push(`<text x="${lx + 42}" y="${oy + 3}" fill="#2f425a" font-size="12" font-family="Noto Sans JP,sans-serif">${name}</text>`);
    oy += 26;
  });
  parts.push("</svg>");
  return parts.join("");
}

function exportSvg() {
  const svg = buildSvg();
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  downloadFile(blob, "process-cross-section.svg");
}

function getExportFrames() {
  if (savedSlides.length > 0) {
    return savedSlides.map((frame) => ({
      ...frame,
      imageData:
        frame.grid && frame.mask
          ? createOutputImageDataFromState(frame.grid, frame.mask)
          : frame.imageData,
    }));
  }

  return [{
    label: "Current view",
    imageData: createOutputImageData(),
    ops: steps.slice(-10),
    purpose: "",
    targetMaterial: "",
  }];
}

function getPptxConstructor() {
  return window.PptxGenJS || window.pptxgen || window.PPTXGenJS;
}

function updateExportStatus() {
  if (!exportStatus) return;
  if (getPptxConstructor()) {
    exportStatus.textContent = "PPTX export ready";
    exportStatus.classList.remove("warning");
  } else {
    exportStatus.textContent = "PPTX library not loaded: the network or CDN may be blocked";
    exportStatus.classList.add("warning");
  }
}

function addMaterialLegend(slide, x, y, scale = 1) {
  const items = [
    ["Si", MATERIALS.Si.color],
    ["SiO2", MATERIALS.SiO2.color],
    ["Si3N4", MATERIALS.SiN.color],
    ["Resist", MATERIALS.PR.color],
  ];

  items.forEach(([name, color], index) => {
    const itemY = y + index * 0.22 * scale;
    slide.addShape("rect", {
      x,
      y: itemY,
      w: 0.85 * scale,
      h: 0.16 * scale,
      line: { color: color.replace("#", ""), transparency: 100 },
      fill: { color: color.replace("#", "") },
    });
    slide.addText(name, {
      x: x + 0.12 * scale,
      y: itemY - 0.005,
      w: 0.6 * scale,
      h: 0.16 * scale,
      fontSize: 8 * scale,
      color: "111111",
      align: "center",
      margin: 0,
    });
  });
}

function addSingleFrameSlides(pptx, frames) {
  frames.forEach((frame, idx) => {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addShape("rect", {
      x: 0,
      y: 0,
      w: 13.333,
      h: 0.78,
      line: { color: "1F5B8F", transparency: 100 },
      fill: { color: "1F5B8F" },
    });
    slide.addText(frame.label.replace(/^Saved \d+:\s*/, ""), {
      x: 0.4,
      y: 0.15,
      w: 10.4,
      h: 0.4,
      fontSize: 25,
      color: "FFFFFF",
      charSpace: 2,
      fit: "shrink",
    });
    slide.addText(String(idx + 1), {
      x: 12.35,
      y: 0.14,
      w: 0.55,
      h: 0.4,
      fontSize: 23,
      color: "FFFFFF",
      align: "right",
    });

    slide.addImage({ data: frame.imageData, x: 0.15, y: 2.75, w: 4.7, h: 2.0 });
    addMaterialLegend(slide, 0.15, 5.35, 1.2);

    const details = [
      ["Purpose", frame.purpose || "-"],
      ["Material", frame.targetMaterial || "-"],
    ];

    details.forEach(([label, value], detailIndex) => {
      const y = 1.7 + detailIndex * 0.85;
      slide.addText(`${label} :`, {
        x: 5.35,
        y,
        w: 2.1,
        h: 0.32,
        fontSize: 20,
        bold: true,
        color: "111111",
        fit: "shrink",
      });
      slide.addText(value, {
        x: 7.0,
        y,
        w: 5.6,
        h: 0.34,
        fontSize: 20,
        color: "111111",
        fit: "shrink",
      });
    });
  });
}

function addEightUpSlides(pptx, frames) {
  const chunkSize = 8;

  for (let offset = 0; offset < frames.length; offset += chunkSize) {
    const chunk = frames.slice(offset, offset + chunkSize);
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addShape("rect", {
      x: 0,
      y: 0,
      w: 13.333,
      h: 0.62,
      line: { color: "1F5B8F", transparency: 100 },
      fill: { color: "1F5B8F" },
    });
    slide.addText(`Process Cross-Section Summary ${Math.floor(offset / chunkSize) + 1}`, {
      x: 0.35,
      y: 0.13,
      w: 5.5,
      h: 0.3,
      fontSize: 17,
      color: "FFFFFF",
      charSpace: 1.4,
    });

    chunk.forEach((frame, index) => {
      const col = index % 4;
      const row = Math.floor(index / 4);
      const tileX = 0.35 + col * 3.15;
      const tileY = 0.85 + row * 3.2;

      slide.addShape("rect", {
        x: tileX,
        y: tileY,
        w: 2.85,
        h: 2.85,
        line: { color: "D5DFEC", pt: 1 },
        fill: { color: "FFFFFF" },
        radius: 0.08,
      });

      slide.addText(`${offset + index + 1}. ${frame.label}`, {
        x: tileX + 0.08,
        y: tileY + 0.06,
        w: 2.69,
        h: 0.28,
        fontSize: 9,
        bold: true,
        color: "203248",
        fit: "shrink",
      });

      slide.addImage({
        data: frame.imageData,
        x: tileX + 0.08,
        y: tileY + 0.36,
        w: 2.69,
        h: 1.55,
      });

      slide.addText(`Purpose: ${frame.purpose || "-"}`, {
        x: tileX + 0.08,
        y: tileY + 1.98,
        w: 2.69,
        h: 0.28,
        fontSize: 7,
        color: "3C556F",
        fit: "shrink",
      });
      slide.addText(`Material: ${frame.targetMaterial || "-"}`, {
        x: tileX + 0.08,
        y: tileY + 2.23,
        w: 2.69,
        h: 0.28,
        fontSize: 7,
        color: "3C556F",
        fit: "shrink",
      });
    });
  }
}

async function exportPptx() {
  const PptxConstructor = getPptxConstructor();
  if (!PptxConstructor) {
    alert("PPTX library is not loaded. Please use SVG or PNG export.");
    return;
  }

  try {
    const pptx = new PptxConstructor();
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = "Process Cross-Section Studio";
    pptx.subject = "Semiconductor Process Cross-Section";
    const frames = getExportFrames();

    if (pptLayoutMode.value === "eight-up") addEightUpSlides(pptx, frames);
    else addSingleFrameSlides(pptx, frames);

    await pptx.writeFile({ fileName: "process-cross-section.pptx" });
  } catch (error) {
    console.error(error);
    alert(`PPTX export failed: ${error.message || error}`);
  }
}

function saveCurrentScene() {
  pushHistory();
  const index = savedSlides.length + 1;
  const lastOp = steps[steps.length - 1] || "No operation";
  const purpose = purposeInput.value.trim();
  const targetMaterial = targetMaterialInput.value.trim();
  savedSlides.push({
    label: `Saved ${index}: ${lastOp}`,
    imageData: createOutputImageData(),
    ops: steps.slice(),
    purpose,
    targetMaterial,
    grid: cloneGrid(grid),
    mask: mask.slice(),
  });
  renderSavedList();
  addStep(`Save snapshot #${index}`);
  purposeInput.value = "";
  targetMaterialInput.value = "";
}

function applyDeposit() {
  const material = materialSelect.value;
  const amount = Math.max(1, Number(amountInput.value) || 1);
  pushHistory();
  deposit(material, amount, useMask.checked);
  addStep(`Deposit ${material} x${amount} ${useMask.checked ? "(mask)" : ""}`.trim());
  render();
}

function applyEtch() {
  const material = materialSelect.value;
  const amount = Math.max(1, Number(amountInput.value) || 1);
  pushHistory();
  if (etchType.value === "anisotropic") etchAnisotropic(material, amount, useMask.checked);
  else etchIsotropic(material, amount, useMask.checked);
  addStep(`Etch ${material} ${etchType.value} x${amount} ${useMask.checked ? "(mask)" : ""}`.trim());
  render();
}

function applyStrip() {
  const material = materialSelect.value;
  pushHistory();
  stripMaterial(material);
  addStep(`Strip ${material}`);
  render();
}

function applyPreset() {
  const preset = maskPreset.value;
  pushHistory();
  applyMaskPreset(preset);
  addStep(`Mask preset: ${preset}`);
  render();
}

function clearMask() {
  pushHistory();
  mask.fill(false);
  addStep("Mask clear");
  render();
}

function undo() {
  if (history.length === 0) return;
  const prev = history.pop();
  restore(prev);
}

function resetAll() {
  pushHistory();
  steps = [];
  mask.fill(false);
  savedSlides = [];
  seedSubstrate();
  addStep("Reset scene");
  renderSavedList();
  render();
}

depositBtn.addEventListener("click", applyDeposit);
etchBtn.addEventListener("click", applyEtch);
stripBtn.addEventListener("click", applyStrip);
undoBtn.addEventListener("click", undo);
resetBtn.addEventListener("click", resetAll);
applyPresetBtn.addEventListener("click", applyPreset);
clearMaskBtn.addEventListener("click", clearMask);
materialSelect.addEventListener("change", () => {
  render();
});
materialColorInput.addEventListener("input", () => {
  const selected = selectedLibraryMaterial;
  if (!selected || !MATERIALS[selected]) return;
  MATERIALS[selected].color = materialColorInput.value;
  renderMaterialList();
  render();
});
saveMaterialBtn.addEventListener("click", saveMaterial);
deleteMaterialBtn.addEventListener("click", deleteMaterial);
saveSceneBtn.addEventListener("click", saveCurrentScene);
svgBtn.addEventListener("click", exportSvg);
pngBtn.addEventListener("click", exportPng);
pptxBtn.addEventListener("click", exportPptx);

canvas.addEventListener("mousedown", (ev) => {
  maskStrokeStartCol = getColFromPointer(ev);
  if (maskStrokeStartCol === null) return;
  isMaskPainting = true;
  drawMaskAtPointer(ev);
});
canvas.addEventListener("mousemove", (ev) => {
  if (!isMaskPainting) return;
  drawMaskAtPointer(ev);
});
window.addEventListener("mouseup", () => {
  if (isMaskPainting) {
    const { lineWidth, spaceWidth } = getLineSpaceWidths();
    addStep(`Mask paint: ${maskBrush.value} (${maskPatternMode.value}, L${lineWidth}/S${spaceWidth})`);
  }
  isMaskPainting = false;
  maskStrokeStartCol = null;
});
canvas.addEventListener("mouseleave", () => {
  isMaskPainting = false;
  maskStrokeStartCol = null;
});

initMaterialSelect();
seedSubstrate();
addStep("Initialize substrate Si");
syncMaterialEditor();
renderSavedList();
renderMaterialList();
render();
updateExportStatus();
window.addEventListener("load", updateExportStatus);
