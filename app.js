const STORAGE_KEY = "attendance-calculator.subjects";

const subjectForm = document.querySelector("#subjectForm");
const subjectName = document.querySelector("#subjectName");
const attendedInput = document.querySelector("#attendedInput");
const totalInput = document.querySelector("#totalInput");
const targetRange = document.querySelector("#targetRange");
const targetOutput = document.querySelector("#targetOutput");
const missInput = document.querySelector("#missInput");
const decreaseMiss = document.querySelector("#decreaseMiss");
const increaseMiss = document.querySelector("#increaseMiss");
const subjectList = document.querySelector("#subjectList");
const subjectTemplate = document.querySelector("#subjectTemplate");
const emptyState = document.querySelector("#emptyState");
const subjectCount = document.querySelector("#subjectCount");
const overallPercent = document.querySelector("#overallPercent");
const overallMeta = document.querySelector("#overallMeta");
const totalAttended = document.querySelector("#totalAttended");
const totalClasses = document.querySelector("#totalClasses");
const resetApp = document.querySelector("#resetApp");
const extensionSettings = document.querySelector("#extensionSettings");
const attendanceUrl = document.querySelector("#attendanceUrl");
const saveAttendanceUrl = document.querySelector("#saveAttendanceUrl");
const syncFromSite = document.querySelector("#syncFromSite");
const syncStatus = document.querySelector("#syncStatus");
const editDialog = document.querySelector("#editDialog");
const editForm = document.querySelector("#editForm");
const cancelEdit = document.querySelector("#cancelEdit");
const editId = document.querySelector("#editId");
const editName = document.querySelector("#editName");
const editAttended = document.querySelector("#editAttended");
const editTotal = document.querySelector("#editTotal");
const detailDialog = document.querySelector("#detailDialog");
const detailTitle = document.querySelector("#detailTitle");
const detailMeta = document.querySelector("#detailMeta");
const detailPresent = document.querySelector("#detailPresent");
const detailAbsent = document.querySelector("#detailAbsent");
const detailTotal = document.querySelector("#detailTotal");
const detailRows = document.querySelector("#detailRows");
const closeDetails = document.querySelector("#closeDetails");

let subjects = loadSubjects();
const extensionApi = typeof chrome !== "undefined" && chrome.storage && chrome.tabs && chrome.scripting;

if (extensionApi) {
  extensionSettings.hidden = false;
}

function loadSubjects() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveSubjects() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(subjects));

  if (extensionApi) {
    chrome.storage.local.set({ subjects });
  }
}

function percentage(attended, total) {
  if (total <= 0) {
    return 0;
  }

  return (attended / total) * 100;
}

function formatPercent(value) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function normalizeCount(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function neededClasses(attended, total, target) {
  if (target >= 100) {
    return attended === total ? 0 : Infinity;
  }

  const current = percentage(attended, total);
  if (current >= target) {
    return 0;
  }

  return Math.ceil(((target * total) - (100 * attended)) / (100 - target));
}

function safeMisses(attended, total, target) {
  if (total <= 0 || percentage(attended, total) < target) {
    return 0;
  }

  const misses = Math.floor((100 * attended - target * total) / target);
  return Math.max(0, misses);
}

function statusClass(value, target) {
  if (value < target) {
    return "danger";
  }

  if (value < target + 5) {
    return "warning";
  }

  return "";
}

function validateCounts(attended, total) {
  if (attended > total) {
    return "Attended classes cannot be more than total classes.";
  }

  return "";
}

function mergeSubjects(incomingSubjects) {
  incomingSubjects.forEach((incoming) => {
    const existing = subjects.find(
      (subject) => subject.name.toLowerCase() === incoming.name.toLowerCase()
    );

    if (existing) {
      existing.attended = incoming.attended;
      existing.total = incoming.total;
      existing.source = incoming.source || existing.source;
      existing.sessions = incoming.sessions || existing.sessions || [];
      return;
    }

    subjects.push({
      id: createId(),
      name: incoming.name,
      attended: incoming.attended,
      total: incoming.total,
      source: incoming.source || "manual",
      sessions: incoming.sessions || [],
    });
  });
}

function setSyncStatus(message) {
  if (syncStatus) {
    syncStatus.textContent = message;
  }
}

function extractSubjectsFromRoot(root) {
  function clean(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function numberFrom(text) {
    const match = clean(text).match(/\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  }

  function headerIndex(headers, words) {
    return headers.findIndex((header) => words.some((word) => header.includes(word)));
  }

  const tables = Array.from(root.querySelectorAll("table"));
  const foundSubjects = [];

  tables.forEach((table) => {
    const rows = Array.from(table.querySelectorAll("tr"))
      .map((row) => Array.from(row.children).map((cell) => clean(cell.textContent)))
      .filter((row) => row.length >= 3);

    if (!rows.length) {
      return;
    }

    const headerRowIndex = rows.findIndex((row) => {
      const joined = row.join(" ").toLowerCase();
      return /(subject|course|paper|class)/.test(joined) && /(attend|present|total|conduct|held)/.test(joined);
    });

    if (headerRowIndex < 0) {
      return;
    }

    const headers = rows[headerRowIndex].map((header) => header.toLowerCase());
    const nameIndex = headerIndex(headers, ["subject", "course", "paper", "class"]);
    const attendedIndex = headerIndex(headers, ["attended", "present"]);
    const totalIndex = headerIndex(headers, ["total", "conducted", "held", "delivered"]);
    const percentageIndex = headerIndex(headers, ["overall ltp", "overall", "current l", "current t", "current p"]);

    if (nameIndex < 0 || (attendedIndex < 0 || totalIndex < 0) && percentageIndex < 0) {
      return;
    }

    rows.slice(headerRowIndex + 1).forEach((row) => {
      const name = clean(row[nameIndex]);
      const attended = attendedIndex >= 0 ? numberFrom(row[attendedIndex]) : null;
      const total = totalIndex >= 0 ? numberFrom(row[totalIndex]) : null;
      const percent = percentageIndex >= 0 ? numberFrom(row[percentageIndex]) : null;

      if (!name) {
        return;
      }

      if (attended !== null && total !== null && attended <= total) {
        foundSubjects.push({
          name,
          attended: Math.floor(attended),
          total: Math.floor(total),
          source: "counts",
        });
        return;
      }

      if (percent !== null) {
        foundSubjects.push({
          name,
          attended: Math.round(percent * 10),
          total: 1000,
          source: "percentage",
        });
      }
    });
  });

  return foundSubjects;
}

function parseAttendanceHtml(html) {
  const documentFromHtml = new DOMParser().parseFromString(html, "text/html");
  return extractSubjectsFromRoot(documentFromHtml);
}

async function syncFromSavedUrl(showAlerts = false) {
  const url = attendanceUrl.value.trim();

  if (!extensionApi || !url) {
    return;
  }

  setSyncStatus("Syncing attendance...");

  try {
    const foundSubjects = await scrapeSavedUrlInBackgroundTab(url);

    if (!foundSubjects.length) {
      setSyncStatus("Could not find attendance records. Your site may need a custom reader.");
      if (showAlerts) {
        alert("I could not find attendance records at that URL. Try opening the page once and using Sync from open site, or send me the page screenshot.");
      }
      return;
    }

    mergeSubjects(foundSubjects);
    saveSubjects();
    render();
    setSyncStatus(`Auto synced ${foundSubjects.length} CampusLynx row${foundSubjects.length === 1 ? "" : "s"}.`);
  } catch (error) {
    setSyncStatus("Auto sync failed. Log in to the university site once, then open this again.");
    if (showAlerts) {
      alert(`Auto sync failed: ${error.message}`);
    }
  }
}

function waitForTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Attendance page took too long to load"));
    }, 20000);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function scrapeSavedUrlInBackgroundTab(url) {
  const tab = await chrome.tabs.create({ url, active: false });

  try {
    await waitForTabComplete(tab.id);
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeAttendanceFromPage,
    });

    return result?.result || [];
  } finally {
    if (tab?.id) {
      chrome.tabs.remove(tab.id);
    }
  }
}

function render() {
  const target = normalizeCount(targetRange.value);
  const missed = normalizeCount(missInput.value);

  targetOutput.value = `${target}%`;
  missInput.value = missed;
  subjectList.innerHTML = "";

  const attendedSum = subjects.reduce((sum, subject) => sum + subject.attended, 0);
  const totalSum = subjects.reduce((sum, subject) => sum + subject.total, 0);
  const overall = percentage(attendedSum, totalSum);

  overallPercent.textContent = formatPercent(overall);
  overallMeta.textContent = totalSum ? `${attendedSum} of ${totalSum} classes` : "No classes yet";
  totalAttended.textContent = attendedSum;
  totalClasses.textContent = totalSum;
  subjectCount.textContent = `${subjects.length} ${subjects.length === 1 ? "subject" : "subjects"}`;
  emptyState.classList.toggle("is-visible", subjects.length === 0);

  subjects.forEach((subject) => {
    const clone = subjectTemplate.content.firstElementChild.cloneNode(true);
    const sessions = subject.sessions || [];
    const currentPercent = percentage(subject.attended, subject.total);
    const afterMiss = percentage(subject.attended, subject.total + missed);
    const need = neededClasses(subject.attended, subject.total, target);
    const canMiss = safeMisses(subject.attended, subject.total, target);
    const className = statusClass(currentPercent, target);

    clone.dataset.id = subject.id;
    clone.querySelector(".subject-title").textContent = subject.name;
    clone.querySelector(".subject-subtitle").textContent =
      sessions.length
        ? `${subject.attended} present, ${subject.total - subject.attended} absent from synced records`
        : subject.source === "percentage"
        ? "Synced from CampusLynx percentage"
        : `${subject.attended} attended out of ${subject.total} total`;

    const pill = clone.querySelector(".percent-pill");
    pill.textContent = formatPercent(currentPercent);
    pill.classList.toggle("warning", className === "warning");
    pill.classList.toggle("danger", className === "danger");

    const fill = clone.querySelector(".progress-fill");
    fill.style.width = `${Math.min(100, currentPercent)}%`;
    fill.classList.toggle("warning", className === "warning");
    fill.classList.toggle("danger", className === "danger");

    clone.querySelector(".after-miss").textContent = formatPercent(afterMiss);
    clone.querySelector(".needed-classes").textContent =
      need === Infinity ? "Not possible" : need === 0 ? "On target" : `${need} present`;
    clone.querySelector(".safe-misses").textContent = `${canMiss} class${canMiss === 1 ? "" : "es"}`;

    subjectList.appendChild(clone);
  });
}

subjectForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const attended = normalizeCount(attendedInput.value);
  const total = normalizeCount(totalInput.value);
  const name = subjectName.value.trim();
  const error = validateCounts(attended, total);

  if (!name) {
    alert("Please enter a subject name.");
    return;
  }

  if (error) {
    alert(error);
    return;
  }

  subjects.push({
    id: createId(),
    name,
    attended,
    total,
  });

  subjectForm.reset();
  attendedInput.value = 0;
  totalInput.value = 0;
  subjectName.focus();
  saveSubjects();
  render();
});

subjectList.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  const card = event.target.closest(".subject-card");

  if (!card) {
    return;
  }

  const subject = subjects.find((item) => item.id === card.dataset.id);

  if (!subject) {
    return;
  }

  if (!button) {
    showSubjectDetails(subject);
    return;
  }

  const action = button.dataset.action;

  if (action === "present") {
    subject.attended += 1;
    subject.total += 1;
  }

  if (action === "absent") {
    subject.total += 1;
  }

  if (action === "delete") {
    subjects = subjects.filter((item) => item.id !== subject.id);
  }

  if (action === "details") {
    showSubjectDetails(subject);
    return;
  }

  if (action === "edit") {
    editId.value = subject.id;
    editName.value = subject.name;
    editAttended.value = subject.attended;
    editTotal.value = subject.total;
    editDialog.showModal();
    return;
  }

  saveSubjects();
  render();
});

function showSubjectDetails(subject) {
  const sessions = subject.sessions || [];

  detailTitle.textContent = subject.name;
  detailMeta.textContent = sessions.length
    ? "Synced class-by-class records from CampusLynx"
    : "No detailed class records synced yet.";
  detailPresent.textContent = subject.attended;
  detailAbsent.textContent = Math.max(0, subject.total - subject.attended);
  detailTotal.textContent = subject.total;
  detailRows.innerHTML = "";

  if (!sessions.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "Open CampusLynx, click a subject once if needed, then sync again to capture detail rows.";
    row.appendChild(cell);
    detailRows.appendChild(row);
  }

  sessions.forEach((session) => {
    const row = document.createElement("tr");
    const dateCell = document.createElement("td");
    const statusCell = document.createElement("td");
    const typeCell = document.createElement("td");
    const byCell = document.createElement("td");
    const statusClassName = session.status.toLowerCase() === "present" ? "status-present" : "status-absent";

    dateCell.textContent = session.date;
    statusCell.textContent = session.status;
    statusCell.className = statusClassName;
    typeCell.textContent = session.classType;
    byCell.textContent = session.attendanceBy;

    row.append(dateCell, statusCell, typeCell, byCell);
    detailRows.appendChild(row);
  });

  detailDialog.showModal();
}

closeDetails.addEventListener("click", () => {
  detailDialog.close();
});

editForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const attended = normalizeCount(editAttended.value);
  const total = normalizeCount(editTotal.value);
  const name = editName.value.trim();
  const error = validateCounts(attended, total);

  if (!name) {
    alert("Please enter a subject name.");
    return;
  }

  if (error) {
    alert(error);
    return;
  }

  const subject = subjects.find((item) => item.id === editId.value);
  if (subject) {
    subject.name = name;
    subject.attended = attended;
    subject.total = total;
  }

  editDialog.close();
  saveSubjects();
  render();
});

cancelEdit.addEventListener("click", () => {
  editDialog.close();
});

targetRange.addEventListener("input", render);
missInput.addEventListener("input", render);

decreaseMiss.addEventListener("click", () => {
  missInput.value = Math.max(0, normalizeCount(missInput.value) - 1);
  render();
});

increaseMiss.addEventListener("click", () => {
  missInput.value = normalizeCount(missInput.value) + 1;
  render();
});

resetApp.addEventListener("click", () => {
  if (!subjects.length || confirm("Reset all attendance records?")) {
    subjects = [];
    saveSubjects();
    render();
  }
});

if (extensionApi) {
  chrome.storage.local.get(["subjects", "attendanceUrl"], (result) => {
    if (Array.isArray(result.subjects)) {
      subjects = result.subjects;
    }

    if (typeof result.attendanceUrl === "string") {
      attendanceUrl.value = result.attendanceUrl;
    }

    render();
    syncFromSavedUrl(false);
  });
} else {
  render();
}

saveAttendanceUrl.addEventListener("click", () => {
  if (!extensionApi) {
    return;
  }

  const url = attendanceUrl.value.trim();

  if (!url) {
    alert("Paste the exact university attendance page URL first.");
    return;
  }

  chrome.storage.local.set({ attendanceUrl: url }, () => {
    setSyncStatus("Attendance URL saved. Auto sync will run whenever you open this extension.");
    syncFromSavedUrl(true);
  });
});

syncFromSite.addEventListener("click", async () => {
  if (!extensionApi) {
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.id) {
    alert("Open your university attendance page first.");
    return;
  }

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: scrapeAttendanceFromPage,
  });

  const foundSubjects = result?.result || [];

  if (!foundSubjects.length) {
    alert("I could not find an attendance table on this page. Send me a screenshot or the page HTML and I can tune the reader.");
    return;
  }

  mergeSubjects(foundSubjects);
  saveSubjects();
  render();
  alert(`Synced ${foundSubjects.length} subject${foundSubjects.length === 1 ? "" : "s"}.`);
});

async function scrapeAttendanceFromPage() {
  function clean(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function numberFrom(text) {
    const match = clean(text).match(/\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  }

  function headerIndex(headers, words) {
    return headers.findIndex((header) => words.some((word) => header.includes(word)));
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function tableRows(table) {
    return Array.from(table.querySelectorAll("tr"))
      .map((row) => ({
        cells: Array.from(row.children),
        texts: Array.from(row.children).map((cell) => clean(cell.innerText || cell.textContent)),
      }))
      .filter((row) => row.texts.length >= 3);
  }

  function clickSubmitIfNeeded() {
    const button = Array.from(document.querySelectorAll("button, input[type='button'], input[type='submit']"))
      .find((item) => clean(item.innerText || item.value).toLowerCase() === "submit");

    if (button) {
      button.click();
    }
  }

  function findSummaryRows() {
    const summaryRows = [];

    Array.from(document.querySelectorAll("table")).forEach((table) => {
      const rows = tableRows(table);
      const headerRowIndex = rows.findIndex((row) => {
        const joined = row.texts.join(" ").toLowerCase();
        return /(subject|course|paper|class)/.test(joined) && /(attend|present|total|overall|ltp|current)/.test(joined);
      });

      if (headerRowIndex < 0) {
        return;
      }

      const headers = rows[headerRowIndex].texts.map((header) => header.toLowerCase());
      const nameIndex = headerIndex(headers, ["subject", "course", "paper", "class"]);
      const attendedIndex = headerIndex(headers, ["attended", "present"]);
      const totalIndex = headerIndex(headers, ["total", "conducted", "held", "delivered"]);
      const percentageIndex = headerIndex(headers, ["overall ltp", "overall", "current l", "current t", "current p"]);

      if (nameIndex < 0 || (attendedIndex < 0 || totalIndex < 0) && percentageIndex < 0) {
        return;
      }

      rows.slice(headerRowIndex + 1).forEach((row) => {
        const name = clean(row.texts[nameIndex]);
        const attended = attendedIndex >= 0 ? numberFrom(row.texts[attendedIndex]) : null;
        const total = totalIndex >= 0 ? numberFrom(row.texts[totalIndex]) : null;
        const percent = percentageIndex >= 0 ? numberFrom(row.texts[percentageIndex]) : null;
        const clickTarget = row.cells[percentageIndex]?.querySelector("a, button, span, div") || row.cells[percentageIndex];

        if (!name) {
          return;
        }

        summaryRows.push({
          name,
          attended,
          total,
          percent,
          clickTarget,
        });
      });
    });

    return summaryRows;
  }

  function parseDetailRows() {
    const detailTable = Array.from(document.querySelectorAll("table")).find((table) => {
      const joined = clean(table.innerText || table.textContent).toLowerCase();
      return joined.includes("attendance by") && joined.includes("status") && joined.includes("class type");
    });

    if (!detailTable) {
      return [];
    }

    const rows = tableRows(detailTable);
    const headerRowIndex = rows.findIndex((row) => {
      const joined = row.texts.join(" ").toLowerCase();
      return joined.includes("date") && joined.includes("status");
    });

    if (headerRowIndex < 0) {
      return [];
    }

    const headers = rows[headerRowIndex].texts.map((header) => header.toLowerCase());
    const dateIndex = headerIndex(headers, ["date"]);
    const byIndex = headerIndex(headers, ["attendance by", "faculty", "teacher"]);
    const statusIndex = headerIndex(headers, ["status"]);
    const typeIndex = headerIndex(headers, ["class type", "type"]);
    const periodIndex = headerIndex(headers, ["current/previous", "current"]);

    return rows.slice(headerRowIndex + 1).map((row) => ({
      date: clean(row.texts[dateIndex]),
      attendanceBy: clean(row.texts[byIndex]),
      status: clean(row.texts[statusIndex]),
      classType: clean(row.texts[typeIndex]),
      period: periodIndex >= 0 ? clean(row.texts[periodIndex]) : "",
    })).filter((row) => row.date && /present|absent/i.test(row.status));
  }

  async function waitForDetails() {
    const startedAt = Date.now();

    while (Date.now() - startedAt < 8000) {
      const rows = parseDetailRows();

      if (rows.length) {
        return rows;
      }

      await sleep(300);
    }

    return [];
  }

  function closeDetailDialog() {
    const closeButton = Array.from(document.querySelectorAll("button, .close, [aria-label]"))
      .find((item) => {
        const label = clean(item.innerText || item.getAttribute("aria-label"));
        return label === "X" || label.toLowerCase() === "close";
      });

    if (closeButton) {
      closeButton.click();
      return;
    }

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }

  clickSubmitIfNeeded();
  await sleep(2500);

  const subjects = [];
  const summaryRows = findSummaryRows();

  for (const row of summaryRows) {
    let sessions = [];

    if (row.clickTarget && row.percent !== null) {
      row.clickTarget.click();
      sessions = await waitForDetails();
      closeDetailDialog();
      await sleep(500);
    }

    const presentCount = sessions.filter((session) => session.status.toLowerCase() === "present").length;
    const absentCount = sessions.filter((session) => session.status.toLowerCase() === "absent").length;

    if (sessions.length) {
      subjects.push({
        name: row.name,
        attended: presentCount,
        total: presentCount + absentCount,
        source: "details",
        sessions,
      });
      continue;
    }

    if (row.attended !== null && row.total !== null && row.attended <= row.total) {
      subjects.push({
        name: row.name,
        attended: Math.floor(row.attended),
        total: Math.floor(row.total),
        source: "counts",
        sessions: [],
      });
      continue;
    }

    if (row.percent !== null) {
      subjects.push({
        name: row.name,
        attended: Math.round(row.percent * 10),
        total: 1000,
        source: "percentage",
        sessions: [],
      });
    }
  }

  return subjects;
}
