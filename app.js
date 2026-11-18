
"use strict";

// ==================================================
// SMART ASCII STUDIO
// Image conversion + Authentication + Saved History
// ==================================================

const API_BASE_URL =
  "https://image-to-ascii-convertor-v3.onrender.com";

// -------------------- DOM ELEMENTS --------------------

const $ = (id) => document.getElementById(id);

const imageInput = $("imageInput");
const preview = $("preview");

const widthInput = $("width");
const widthValue = $("widthValue");
const styleInput = $("style");
const invertInput = $("invert");
const adaptiveInput = $("adaptive");
const edgeInput = $("edge");
const comparisonInput = $("comparison");

const convertButton = $("convert");
const downloadTxt = $("downloadTxt");
const downloadPng = $("downloadPng");
const saveConversion = $("saveConversion");

const output = $("output");
const normalOutput = $("normalOutput");
const enhancedOutput = $("enhancedOutput");

const singleResults = $("singleResults");
const comparisonResults = $("comparisonResults");

const message = $("message");
const workCanvas = $("workCanvas");
const exportCanvas = $("exportCanvas");

// Account elements
const authName = $("authName");
const authEmail = $("authEmail");
const authPassword = $("authPassword");
const signupButton = $("signupButton");
const loginButton = $("loginButton");
const logoutButton = $("logoutButton");
const authMessage = $("authMessage");
const authForms = $("authForms");
const loggedInPanel = $("loggedInPanel");
const accountName = $("accountName");

// History elements
const historyList = $("historyList");
const refreshHistory = $("refreshHistory");

// -------------------- APP STATE --------------------

let selectedImage = null;
let currentText = "";
let currentUser = null;
let authToken = localStorage.getItem("smartAsciiToken") || "";

// -------------------- GENERAL HELPERS --------------------

function setMessage(text) {
  message.textContent = text;
}

function setAuthMessage(text) {
  authMessage.textContent = text;
}

function updateButtons() {
  const hasOutput = Boolean(currentText);
  const isLoggedIn = Boolean(authToken && currentUser);

  downloadTxt.disabled = !hasOutput;
  downloadPng.disabled = !hasOutput;
  saveConversion.disabled = !(hasOutput && isLoggedIn);
}

function updateAuthUI() {
  const isLoggedIn = Boolean(authToken && currentUser);

  authForms.hidden = isLoggedIn;
  loggedInPanel.hidden = !isLoggedIn;

  if (isLoggedIn) {
    accountName.textContent = currentUser.name;
    setAuthMessage("You are logged in successfully.");
  } else {
    setAuthMessage(
      "Login or create an account to save your ASCII conversions."
    );
  }

  updateButtons();
}

function clearSession() {
  authToken = "";
  currentUser = null;

  localStorage.removeItem("smartAsciiToken");

  updateAuthUI();

  historyList.textContent = "Please log in to view your history.";
}

// -------------------- API HELPER --------------------

async function apiRequest(endpoint, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  let response;

  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers
    });
  } catch (error) {
    throw new Error(
      "Unable to connect to the backend. Please try again."
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && authToken) {
      clearSession();
    }

    throw new Error(data.error || "Request failed.");
  }

  return data;
}

// -------------------- SIGNUP --------------------

signupButton.addEventListener("click", async () => {
  const name = authName.value.trim();
  const email = authEmail.value.trim();
  const password = authPassword.value;

  if (!name || !email || !password) {
    setAuthMessage("Please fill in all fields.");
    return;
  }

  if (password.length < 8) {
    setAuthMessage("Password must be at least 8 characters.");
    return;
  }

  signupButton.disabled = true;
  setAuthMessage("Creating your account...");

  try {
    const data = await apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password })
    });

    authToken = data.token;
    currentUser = data.user;

    localStorage.setItem("smartAsciiToken", authToken);

    authPassword.value = "";

    updateAuthUI();
    await loadHistory();

    setAuthMessage("Account created successfully!");
  } catch (error) {
    setAuthMessage(error.message);
  } finally {
    signupButton.disabled = false;
  }
});

// -------------------- LOGIN --------------------

loginButton.addEventListener("click", async () => {
  const email = authEmail.value.trim();
  const password = authPassword.value;

  if (!email || !password) {
    setAuthMessage("Enter your email and password.");
    return;
  }

  loginButton.disabled = true;
  setAuthMessage("Logging in...");

  try {
    const data = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    authToken = data.token;
    currentUser = data.user;

    localStorage.setItem("smartAsciiToken", authToken);

    authPassword.value = "";

    updateAuthUI();
    await loadHistory();

    setAuthMessage("Login successful!");
  } catch (error) {
    setAuthMessage(error.message);
  } finally {
    loginButton.disabled = false;
  }
});

// -------------------- LOGOUT --------------------

logoutButton.addEventListener("click", () => {
  clearSession();
  setAuthMessage("You have logged out.");
});

// -------------------- RESTORE SESSION --------------------

async function restoreSession() {
  if (!authToken) {
    updateAuthUI();
    return;
  }

  setAuthMessage("Checking your login...");

  try {
    const data = await apiRequest("/api/auth/me");

    currentUser = data.user;

    updateAuthUI();
    await loadHistory();
  } catch (error) {
    clearSession();
    setAuthMessage("Your session expired. Please log in again.");
  }
}

// ==================================================
// IMAGE PROCESSING AND ASCII CONVERSION
// ==================================================

// -------------------- IMAGE UPLOAD --------------------

widthInput.addEventListener("input", () => {
  widthValue.value = widthInput.value;
});

imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];

  if (!file) return;

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (!allowedTypes.includes(file.type)) {
    setMessage("Please select a JPG, PNG or WEBP image.");
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    const img = new Image();

    img.onload = () => {
      selectedImage = img;

      preview.src = reader.result;
      preview.style.display = "block";

      convertButton.disabled = false;

      setMessage(`Image ready: ${file.name}`);

      runConversion();
    };

    img.onerror = () => {
      selectedImage = null;
      convertButton.disabled = true;
      setMessage("Could not load the image. Try another file.");
    };

    img.src = reader.result;
  };

  reader.onerror = () => {
    setMessage("Could not read this image file.");
  };

  reader.readAsDataURL(file);
});

// -------------------- GET IMAGE PIXELS --------------------

function getImagePixels(img, width) {
  const ratio = img.naturalHeight / img.naturalWidth;
  const height = Math.max(1, Math.round(width * ratio * 0.5));

  workCanvas.width = width;
  workCanvas.height = height;

  const context = workCanvas.getContext("2d", {
    willReadFrequently: true
  });

  context.drawImage(img, 0, 0, width, height);

  return {
    data: context.getImageData(0, 0, width, height).data,
    width,
    height
  };
}

// -------------------- ENHANCE GRAYSCALE --------------------

function enhanceGray(gray, width, height, adaptive, edge) {
  const result = new Float32Array(gray);

  if (adaptive) {
    let min = 255;
    let max = 0;

    for (const value of result) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }

    const range = Math.max(1, max - min);

    for (let i = 0; i < result.length; i++) {
      result[i] = ((result[i] - min) * 255) / range;
    }
  }

  if (edge && width > 2 && height > 2) {
    const source = new Float32Array(result);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;

        const laplacian =
          source[i - 1] +
          source[i + 1] +
          source[i - width] +
          source[i + width] -
          4 * source[i];

        result[i] = Math.max(
          0,
          Math.min(255, source[i] - laplacian * 0.22)
        );
      }
    }
  }

  return result;
}

// -------------------- GENERATE ASCII --------------------

function makeAscii(img, options) {
  const {
    width,
    invert,
    adaptive,
    edge,
    chars
  } = options;

  const pixels = getImagePixels(img, width);

  const data = pixels.data;
  const w = pixels.width;
  const h = pixels.height;

  const gray = new Float32Array(w * h);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] =
      0.299 * data[i] +
      0.587 * data[i + 1] +
      0.114 * data[i + 2];
  }

  const values = enhanceGray(gray, w, h, adaptive, edge);

  if (invert) {
    for (let i = 0; i < values.length; i++) {
      values[i] = 255 - values[i];
    }
  }

  const palette = Array.from(chars || "@%#*+=-:. ");
  const lines = [];

  for (let y = 0; y < h; y++) {
    let line = "";

    for (let x = 0; x < w; x++) {
      const value = values[y * w + x];

      const index = Math.min(
        palette.length - 1,
        Math.floor((value / 255) * (palette.length - 1))
      );

      line += palette[index];
    }

    lines.push(line);
  }

  return lines.join("\n");
}

// -------------------- SETTINGS --------------------

function getSettings() {
  return {
    width: Number(widthInput.value),
    invert: invertInput.checked,
    adaptive: adaptiveInput.checked,
    edge: edgeInput.checked,
    style: styleInput.options[styleInput.selectedIndex].text,
    comparison: comparisonInput.checked
  };
}

// -------------------- RUN CONVERSION --------------------

function runConversion() {
  if (!selectedImage) return;

  try {
    const common = {
      width: Number(widthInput.value),
      invert: invertInput.checked,
      chars: styleInput.value
    };

    const isComparison = comparisonInput.checked;

    singleResults.hidden = isComparison;
    comparisonResults.hidden = !isComparison;

    if (isComparison) {
      const normal = makeAscii(selectedImage, {
        ...common,
        adaptive: false,
        edge: false
      });

      const enhanced = makeAscii(selectedImage, {
        ...common,
        adaptive: adaptiveInput.checked,
        edge: edgeInput.checked
      });

      normalOutput.textContent = normal;
      enhancedOutput.textContent = enhanced;

      currentText =
        `NORMAL ASCII\n\n${normal}\n\nENHANCED ASCII\n\n${enhanced}`;

      setMessage("Normal and enhanced ASCII comparison completed.");
    } else {
      currentText = makeAscii(selectedImage, {
        ...common,
        adaptive: adaptiveInput.checked,
        edge: edgeInput.checked
      });

      output.textContent = currentText;

      setMessage("ASCII conversion completed successfully.");
    }

    updateButtons();
  } catch (error) {
    console.error(error);
    setMessage("Conversion failed. Please try another image.");
  }
}

convertButton.addEventListener("click", runConversion);

comparisonInput.addEventListener("change", () => {
  if (selectedImage) runConversion();
});

[
  invertInput,
  adaptiveInput,
  edgeInput,
  styleInput,
  widthInput
].forEach((element) => {
  element.addEventListener("change", () => {
    if (selectedImage) runConversion();
  });
});

// -------------------- DOWNLOAD HELPER --------------------

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// -------------------- DOWNLOAD TXT --------------------

downloadTxt.addEventListener("click", () => {
  if (!currentText) return;

  const blob = new Blob(
    [currentText],
    { type: "text/plain;charset=utf-8" }
  );

  downloadBlob(blob, "smart-ascii-output.txt");
});

// -------------------- DOWNLOAD PNG --------------------

downloadPng.addEventListener("click", () => {
  if (!currentText) return;

  const lines = currentText.split("\n");
  const fontSize = 10;
  const lineHeight = 12;

  const maxCols = Math.max(
    1,
    ...lines.map((line) => line.length)
  );

  exportCanvas.width = Math.max(500, maxCols * 6.2 + 30);
  exportCanvas.height = Math.max(180, lines.length * lineHeight + 30);

  const context = exportCanvas.getContext("2d");

  context.fillStyle = "#090d19";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

  context.fillStyle = "#e1d4ff";
  context.font = `${fontSize}px "Courier New", monospace`;
  context.textBaseline = "top";

  lines.forEach((line, index) => {
    context.fillText(line, 15, 15 + index * lineHeight);
  });

  exportCanvas.toBlob((blob) => {
    if (blob) {
      downloadBlob(blob, "smart-ascii-output.png");
    } else {
      setMessage("Could not create PNG file.");
    }
  }, "image/png");
});

// ==================================================
// DATABASE: SAVE AND VIEW CONVERSIONS
// ==================================================

// -------------------- SAVE CONVERSION --------------------

saveConversion.addEventListener("click", async () => {
  if (!currentUser || !currentText) {
    setMessage("Please log in and convert an image first.");
    return;
  }

  const title = prompt(
    "Enter a name for this conversion:",
    "My ASCII Conversion"
  );

  if (title === null) return;

  if (!title.trim()) {
    setMessage("Please enter a conversion name.");
    return;
  }

  saveConversion.disabled = true;
  setMessage("Saving your conversion...");

  try {
    await apiRequest("/api/conversions", {
      method: "POST",
      body: JSON.stringify({
        title: title.trim(),
        asciiText: currentText,
        settings: getSettings()
      })
    });

    setMessage("Your conversion was saved successfully!");

    await loadHistory();
  } catch (error) {
    setMessage(error.message);
  } finally {
    updateButtons();
  }
});

// -------------------- LOAD HISTORY --------------------

async function loadHistory() {
  if (!authToken || !currentUser) {
    historyList.textContent = "Please log in to view your history.";
    return;
  }

  historyList.textContent = "Loading saved conversions...";

  try {
    const data = await apiRequest("/api/conversions");
    renderHistory(data.conversions || []);
  } catch (error) {
    historyList.textContent = error.message;
  }
}

// -------------------- RENDER HISTORY --------------------

function renderHistory(conversions) {
  historyList.replaceChildren();

  if (conversions.length === 0) {
    const empty = document.createElement("p");
    empty.textContent =
      "No saved conversions yet. Convert an image and save it!";
    historyList.appendChild(empty);
    return;
  }

  conversions.forEach((item) => {
    const card = document.createElement("div");
    card.className = "history-item";

    const details = document.createElement("div");
    details.className = "history-details";

    const title = document.createElement("h3");
    title.textContent = item.title;

    const date = document.createElement("p");
    date.textContent = new Date(item.created_at).toLocaleString();

    details.append(title, date);

    const actions = document.createElement("div");
    actions.className = "history-actions";

    const viewButton = document.createElement("button");
    viewButton.type = "button";
    viewButton.className = "history-view";
    viewButton.textContent = "View";

    viewButton.addEventListener("click", () => {
      openConversion(item.id);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "history-delete";
    deleteButton.textContent = "Delete";

    deleteButton.addEventListener("click", () => {
      deleteConversion(item.id, deleteButton);
    });

    actions.append(viewButton, deleteButton);
    card.append(details, actions);

    historyList.appendChild(card);
  });
}

// -------------------- OPEN SAVED CONVERSION --------------------

async function openConversion(id) {
  setMessage("Loading saved conversion...");

  try {
    const data = await apiRequest(
      `/api/conversions/${encodeURIComponent(id)}`
    );

    const conversion = data.conversion;

    currentText = conversion.ascii_text;

    singleResults.hidden = false;
    comparisonResults.hidden = true;

    output.textContent = currentText;

    updateButtons();

    setMessage(`Loaded: ${conversion.title}`);
  } catch (error) {
    setMessage(error.message);
  }
}

// -------------------- DELETE CONVERSION --------------------

async function deleteConversion(id, button) {
  if (!confirm("Are you sure you want to delete this conversion?")) {
    return;
  }

  button.disabled = true;

  try {
    await apiRequest(
      `/api/conversions/${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );

    setMessage("Conversion deleted successfully.");

    await loadHistory();
  } catch (error) {
    setMessage(error.message);
    button.disabled = false;
  }
}

// -------------------- REFRESH HISTORY --------------------

refreshHistory.addEventListener("click", loadHistory);

// -------------------- START APPLICATION --------------------

updateAuthUI();
restoreSession();
