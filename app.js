/* ============ CONFIG ============ */
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
}

const STORAGE_KEY = "treino-app-state-v1";
const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTHS = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

const GEMINI_TEMPLATE = `Monte meu treino de academia seguindo EXATAMENTE este formato de texto simples (sem markdown extra, sem tabelas), para eu transformar em PDF depois:

# TREINO A — Peito e Tríceps
1. Supino reto | 4x10-12 | 40kg | descanso 90s
2. Crucifixo com halteres | 3x12 | 14kg | descanso 60s
3. Tríceps corda | 3x12-15 | 20kg | descanso 60s

# TREINO B — Costas e Bíceps
1. Puxada frente | 4x10-12 | 45kg | descanso 90s
...

Regras:
- Cada treino começa com uma linha "# TREINO <LETRA> — <foco>"
- Cada exercício é uma linha numerada, com as partes separadas por " | " nesta ordem: nome | séries x repetições | carga | descanso
- Não adicione texto fora desse formato.

Meu perfil / objetivo: [descreva aqui].`;

/* ============ STATE ============ */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!parsed.assessments) parsed.assessments = [];
      return parsed;
    }
  } catch (e) {}
  return { workouts: [], sessions: [], assessments: [] };
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
let state = loadState();

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/* ============ NAV ============ */
let currentTab = "hoje";
let hojeSelectedLetter = null;

function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  render();
}
document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

function render() {
  const view = document.getElementById("view");
  view.innerHTML = "";
  if (currentTab === "hoje") renderHoje(view);
  else if (currentTab === "treinos") renderTreinos(view);
  else if (currentTab === "progresso") renderProgresso(view);
  else if (currentTab === "avaliacao") renderAvaliacao(view);
  document.getElementById("topbar-date").textContent = formatDateLong(new Date());
}

function formatDateLong(d) {
  return `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1800);
}

/* ============ HOJE ============ */
function lastLogFor(exerciseName) {
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const entry = state.sessions[i].log.find((l) => l.nome === exerciseName);
    if (entry) return entry;
  }
  return null;
}

function suggestTodayLetter() {
  if (state.workouts.length === 0) return null;
  if (state.sessions.length === 0) return state.workouts[0].letter;
  const lastSession = state.sessions[state.sessions.length - 1];
  const idx = state.workouts.findIndex((w) => w.id === lastSession.workoutId);
  const nextIdx = idx === -1 ? 0 : (idx + 1) % state.workouts.length;
  return state.workouts[nextIdx].letter;
}

function renderHoje(view) {
  if (state.workouts.length === 0) {
    view.innerHTML = `
      <div class="empty">
        <div class="empty-mark">＋</div>
        <p>Nenhum treino cadastrado ainda.<br>Importe seu PDF na aba <strong>Treinos</strong> para começar.</p>
      </div>`;
    return;
  }

  if (!hojeSelectedLetter || !state.workouts.find((w) => w.letter === hojeSelectedLetter)) {
    hojeSelectedLetter = suggestTodayLetter();
  }
  const workout = state.workouts.find((w) => w.letter === hojeSelectedLetter);

  const pills = state.workouts
    .map((w) => `<button class="pill ${w.letter === hojeSelectedLetter ? "active" : ""}" data-letter="${w.letter}">Treino ${w.letter}</button>`)
    .join("");

  const rows = workout.exercises
    .map((ex) => {
      const last = lastLogFor(ex.nome);
      return `
      <div class="exercise-row" data-ex-id="${ex.id}">
        <div class="exercise-name">${ex.nome}</div>
        <div class="exercise-meta">Sugerido: ${ex.series}x${ex.reps} · ${ex.carga || "—"}${ex.descanso ? " · descanso " + ex.descanso : ""}</div>
        <div class="log-grid">
          <div><label>Séries</label><input type="number" inputmode="numeric" class="in-series" value="${last ? last.series : ex.series}"></div>
          <div><label>Reps</label><input type="text" inputmode="numeric" class="in-reps" value="${last ? last.reps : ex.reps}"></div>
          <div><label>Carga</label><input type="text" class="in-carga" value="${last ? last.carga : (ex.carga || "")}"></div>
        </div>
      </div>`;
    })
    .join("");

  view.innerHTML = `
    <div class="section-title">Hoje</div>
    <div class="section-sub">${workout.foco || ""}</div>
    <div class="today-pick">${pills}</div>
    <div class="card">${rows}</div>
    <button class="btn" id="save-session-btn">Salvar treino de hoje</button>
  `;

  view.querySelectorAll(".pill").forEach((p) =>
    p.addEventListener("click", () => {
      hojeSelectedLetter = p.dataset.letter;
      render();
    })
  );

  document.getElementById("save-session-btn").addEventListener("click", () => {
    const log = [];
    view.querySelectorAll(".exercise-row").forEach((row) => {
      const exId = row.dataset.exId;
      const ex = workout.exercises.find((e) => e.id === exId);
      log.push({
        exId,
        nome: ex.nome,
        series: row.querySelector(".in-series").value,
        reps: row.querySelector(".in-reps").value,
        carga: row.querySelector(".in-carga").value,
      });
    });
    state.sessions.push({
      id: uid(),
      date: todayISO(),
      workoutId: workout.id,
      workoutLetter: workout.letter,
      log,
    });
    saveState();
    toast("Treino de hoje salvo ✓");
    render();
  });
}

/* ============ TREINOS ============ */
function renderTreinos(view) {
  const cards = state.workouts
    .map(
      (w) => `
    <div class="card">
      <div class="workout-header">
        <div class="workout-letter">Treino ${w.letter}</div>
        <button class="btn danger small" data-del-workout="${w.id}">Excluir</button>
      </div>
      <div class="workout-foco">${w.foco || "Sem descrição"}</div>
      ${w.exercises
        .map(
          (ex) => `<div class="ex-list-item"><span>${ex.nome}</span><span class="n">${ex.series}x${ex.reps} · ${ex.carga || "—"}</span></div>`
        )
        .join("")}
    </div>`
    )
    .join("");

  view.innerHTML = `
    <div class="section-title">Treinos</div>
    <div class="section-sub">Modelos importados do seu PDF.</div>
    ${cards || `<div class="empty"><div class="empty-mark">▤</div><p>Nenhum treino cadastrado.</p></div>`}
    <div style="height:70px"></div>
  `;
  const fab = document.createElement("button");
  fab.className = "fab";
  fab.id = "add-workout-fab";
  fab.textContent = "+";
  view.appendChild(fab);
  fab.addEventListener("click", openImportModal);

  view.querySelectorAll("[data-del-workout]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const id = btn.dataset.delWorkout;
      if (confirm("Excluir este treino? O histórico salvo não será apagado.")) {
        state.workouts = state.workouts.filter((w) => w.id !== id);
        saveState();
        render();
      }
    })
  );
}

function openImportModal() {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <h3>Adicionar treino</h3>
      <p class="section-sub">Importe o PDF gerado pelo Gemini, ou veja o modelo de texto para pedir a ele.</p>
      <button class="btn" id="modal-import-pdf">Importar PDF</button>
      <div style="height:10px"></div>
      <button class="btn secondary" id="modal-show-template">Ver modelo para o Gemini</button>
      <div id="template-holder"></div>
      <div style="height:10px"></div>
      <button class="btn secondary" id="modal-cancel">Cancelar</button>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });
  backdrop.querySelector("#modal-cancel").addEventListener("click", () => backdrop.remove());
  backdrop.querySelector("#modal-import-pdf").addEventListener("click", () => {
    backdrop.remove();
    document.getElementById("pdf-input").click();
  });
  backdrop.querySelector("#modal-show-template").addEventListener("click", () => {
    const holder = backdrop.querySelector("#template-holder");
    holder.innerHTML = `<div class="template-box">${GEMINI_TEMPLATE.replace(/</g, "&lt;")}</div>
      <button class="btn secondary small" id="copy-template">Copiar texto</button>`;
    holder.querySelector("#copy-template").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(GEMINI_TEMPLATE);
        toast("Modelo copiado");
      } catch (e) {
        toast("Selecione e copie o texto manualmente");
      }
    });
  });
}

document.getElementById("pdf-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const text = await extractPdfText(file);
    const parsed = parseWorkoutText(text);
    if (parsed.length === 0) {
      toast("Não consegui identificar exercícios nesse PDF");
      return;
    }
    openReviewModal(parsed);
  } catch (err) {
    console.error(err);
    toast("Erro ao ler o PDF");
  }
});

async function extractPdfText(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // preserve line breaks by grouping items by their y position
    let lastY = null;
    let line = "";
    content.items.forEach((item) => {
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        fullText += line.trim() + "\n";
        line = "";
      }
      line += item.str + " ";
      lastY = y;
    });
    fullText += line.trim() + "\n";
  }
  return fullText;
}

function parseWorkoutText(text) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const headerRe = /^#?\s*TREINO\s+([A-Za-zÀ-ú0-9]+)\s*[-–—:]?\s*(.*)$/i;
  const exerciseRe = /^\d+[\.\)]\s*(.+)$/;

  const workouts = [];
  let current = null;

  lines.forEach((line) => {
    const h = line.match(headerRe);
    if (h) {
      current = { id: uid(), letter: h[1].toUpperCase(), foco: h[2] || "", exercises: [] };
      workouts.push(current);
      return;
    }
    const ex = line.match(exerciseRe);
    if (ex) {
      if (!current) {
        current = { id: uid(), letter: String.fromCharCode(65 + workouts.length), foco: "", exercises: [] };
        workouts.push(current);
      }
      const parts = ex[1].split("|").map((p) => p.trim());
      const nome = parts[0] || "Exercício";
      let series = "";
      let reps = "";
      if (parts[1]) {
        const sr = parts[1].match(/(\d+)\s*[xX]\s*(.+)/);
        if (sr) {
          series = sr[1];
          reps = sr[2].trim();
        } else {
          reps = parts[1];
        }
      }
      const carga = parts[2] || "";
      const descanso = (parts[3] || "").replace(/descanso/i, "").trim();
      current.exercises.push({ id: uid(), nome, series, reps, carga, descanso });
    }
  });

  return workouts.filter((w) => w.exercises.length > 0);
}

function openReviewModal(parsedWorkouts) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const summary = parsedWorkouts
    .map(
      (w) => `
    <div class="card">
      <div class="workout-header"><div class="workout-letter">Treino ${w.letter}</div></div>
      <div class="workout-foco">${w.foco || ""}</div>
      ${w.exercises.map((ex) => `<div class="ex-list-item"><span>${ex.nome}</span><span class="n">${ex.series}x${ex.reps} · ${ex.carga || "—"}</span></div>`).join("")}
    </div>`
    )
    .join("");

  backdrop.innerHTML = `
    <div class="modal">
      <h3>Confirmar importação</h3>
      <p class="section-sub">${parsedWorkouts.length} treino(s) encontrados. Você poderá editar depois.</p>
      ${summary}
      <button class="btn" id="confirm-import">Salvar treino(s)</button>
      <div style="height:8px"></div>
      <button class="btn secondary" id="cancel-import">Cancelar</button>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector("#cancel-import").addEventListener("click", () => backdrop.remove());
  backdrop.querySelector("#confirm-import").addEventListener("click", () => {
    // replace existing workouts with same letter, otherwise append
    parsedWorkouts.forEach((w) => {
      const idx = state.workouts.findIndex((existing) => existing.letter === w.letter);
      if (idx !== -1) state.workouts[idx] = w;
      else state.workouts.push(w);
    });
    saveState();
    backdrop.remove();
    toast("Treino(s) salvos ✓");
    setTab("treinos");
  });
}

/* ============ PROGRESSO ============ */
function parseCargaNumber(str) {
  if (!str) return null;
  const m = String(str).match(/[\d.,]+/);
  if (!m) return null;
  return parseFloat(m[0].replace(",", "."));
}

function computeStreak() {
  const trainedDates = new Set(state.sessions.map((s) => s.date));
  let streak = 0;
  let cursor = new Date();
  while (true) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    if (trainedDates.has(iso)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function sessionsThisWeek() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return state.sessions.filter((s) => new Date(s.date + "T00:00:00") >= monday).length;
}

function renderProgresso(view) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay.getDay();
  const trainedDates = new Set(state.sessions.map((s) => s.date));

  let calCells = "";
  for (let i = 0; i < startOffset; i++) calCells += `<div class="cal-day empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    calCells += `<div class="cal-day ${trainedDates.has(iso) ? "trained" : ""}">${d}</div>`;
  }

  // per-exercise history
  const byExercise = {};
  state.sessions.forEach((s) => {
    s.log.forEach((l) => {
      if (!byExercise[l.nome]) byExercise[l.nome] = [];
      byExercise[l.nome].push({ date: s.date, carga: l.carga });
    });
  });
  const exerciseNames = Object.keys(byExercise);

  let progressHtml = "";
  if (exerciseNames.length === 0) {
    progressHtml = `<div class="empty"><div class="empty-mark">▲</div><p>Registre treinos na aba Hoje para ver sua evolução de carga aqui.</p></div>`;
  } else {
    progressHtml = exerciseNames
      .map((name) => {
        const entries = byExercise[name].slice(-8);
        const maxVal = Math.max(...entries.map((e) => parseCargaNumber(e.carga) || 0), 1);
        const bars = entries
          .map((e) => {
            const val = parseCargaNumber(e.carga);
            const pct = val ? Math.max(6, (val / maxVal) * 100) : 4;
            const shortDate = e.date.slice(5).split("-").reverse().join("/");
            return `<div class="bar-row">
              <div class="bar-date">${shortDate}</div>
              <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
              <div class="bar-val">${e.carga || "—"}</div>
            </div>`;
          })
          .join("");
        return `<div class="progress-exercise"><div class="name">${name}</div>${bars}</div>`;
      })
      .join("");
  }

  view.innerHTML = `
    <div class="section-title">Progresso</div>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-num">${computeStreak()}</div><div class="stat-label">dias seguidos</div></div>
      <div class="stat-box"><div class="stat-num">${sessionsThisWeek()}</div><div class="stat-label">treinos essa semana</div></div>
      <div class="stat-box"><div class="stat-num">${state.sessions.length}</div><div class="stat-label">total registrado</div></div>
    </div>
    <div class="section-sub" style="margin-bottom:8px; text-transform:capitalize;">${MONTHS[month]} ${year}</div>
    <div class="calendar">${calCells}</div>
    <div class="section-title" style="font-size:18px;">Evolução de carga</div>
    ${progressHtml}
  `;
}

/* ============ AVALIAÇÃO FÍSICA ============ */
function parseBRNumber(s) {
  if (s === undefined || s === null) return null;
  let clean = String(s).replace(/−/g, "-").trim();
  clean = clean.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}
function matchNum(re, txt) {
  const m = txt.match(re);
  return m ? m[1] : null;
}
function matchPair(re, txt) {
  const m = txt.match(re);
  return m ? { val: m[1], cls: m[2] } : null;
}
function brDateToISO(brDate) {
  if (!brDate) return todayISO();
  const [d, m, y] = brDate.split("/");
  return `${y}-${m}-${d}`;
}
function tagClass(word) {
  if (!word) return "";
  const w = word.toUpperCase();
  if (/NORMAL|BOM|ALTO(?!.*GORDURA)|ADEQUAD/.test(w)) return "ok";
  if (/ATEN[ÇC][ÃA]O|SOBREPESO|BAIXO/.test(w)) return "warn";
  if (/OBESIDADE|RUIM|ELEVAD/.test(w)) return "bad";
  return "ok";
}

function parseAssessmentText(text) {
  const r = {};
  r.dataISO = brDateToISO(matchNum(/DATA\s*DO\s*EXAME[\s\S]{0,15}?(\d{2}\/\d{2}\/\d{4})/i, text));
  r.peso = parseBRNumber(matchNum(/PESO\s*ATUAL[\s\S]{0,20}?([\d]+[.,]\d+)\s*kg/i, text));
  r.score = matchNum(/(\d{1,3})\s*\/\s*100\s*PTS/i, text);
  r.scoreClass = matchNum(/PTS[\s\S]{0,40}?SCORE\s*FITMASS\s*\n?\s*([A-ZÀ-Ú\s]+?)\n/i, text) || "";
  r.gorduraPct = parseBRNumber(matchNum(/GORDURA\s*\n\s*([\d]+[.,]\d+)\s*%/i, text));
  r.massaMuscularPct = parseBRNumber(matchNum(/MASSA\s*\n?\s*MUSCULAR\s*\n?\s*([\d]+[.,]\d+)\s*%/i, text));

  const imc = matchPair(/IMC\s*kg\s*\/\s*m[²2]?\s*([\d]+[.,]\d+)\s*([A-ZÀ-Ú]+)/i, text);
  r.imc = imc ? parseBRNumber(imc.val) : null;
  r.imcClass = imc ? imc.cls : "";

  const mm = matchPair(/Massa\s*muscular\s*kg\s*([\d]+[.,]\d+)\s*([A-ZÀ-Ú]+)/i, text);
  r.massaMuscularKg = mm ? parseBRNumber(mm.val) : null;
  r.massaMuscularClass = mm ? mm.cls : "";

  const gc = matchPair(/Gordura\s*corporal\s*kg\s*([\d]+[.,]\d+)\s*([A-ZÀ-Ú]+)/i, text);
  r.gorduraKg = gc ? parseBRNumber(gc.val) : null;
  r.gorduraClass = gc ? gc.cls : "";

  const tmb = matchPair(/Taxa\s*metab[oó]lica\s*basal\s*kcal\s*([\d.,]+)\s*([A-ZÀ-Ú]+)/i, text);
  r.taxaMetabolica = tmb ? parseBRNumber(tmb.val) : null;
  r.taxaMetabolicaClass = tmb ? tmb.cls : "";

  const mo = matchPair(/Massa\s*[oó]ssea\s*kg\s*([\d]+[.,]\d+)\s*([A-ZÀ-Ú]+)/i, text);
  r.massaOssea = mo ? parseBRNumber(mo.val) : null;
  r.massaOsseaClass = mo ? mo.cls : "";

  function seg(re) {
    const m = text.match(re);
    return m ? { magra: parseBRNumber(m[1]), gordura: parseBRNumber(m[2]) } : null;
  }
  r.segmentar = {
    bracoE: seg(/Bra[çc]o\s*E\s*([\d]+[.,]\d+)\s*([\d]+[.,]\d+)/i),
    bracoD: seg(/Bra[çc]o\s*D\s*([\d]+[.,]\d+)\s*([\d]+[.,]\d+)/i),
    tronco: seg(/Tronco\s*([\d]+[.,]\d+)\s*([\d]+[.,]\d+)/i),
    pernaE: seg(/Perna\s*E\s*([\d]+[.,]\d+)\s*([\d]+[.,]\d+)/i),
    pernaD: seg(/Perna\s*D\s*([\d]+[.,]\d+)\s*([\d]+[.,]\d+)/i),
  };
  return r;
}

document.getElementById("assessment-pdf-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const text = await extractPdfText(file);
    const parsed = parseAssessmentText(text);
    if (!parsed.peso && !parsed.gorduraPct) {
      toast("Não consegui reconhecer os campos desse PDF");
      return;
    }
    openAssessmentReviewModal(parsed);
  } catch (err) {
    console.error(err);
    toast("Erro ao ler o PDF");
  }
});

function openAssessmentReviewModal(p) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <h3>Confirmar avaliação</h3>
      <p class="section-sub">Confira os valores extraídos e ajuste se algo ficou errado.</p>
      <label>Data do exame</label>
      <input type="date" id="f-data" value="${p.dataISO}">
      <label>Peso (kg)</label>
      <input type="text" id="f-peso" value="${p.peso ?? ""}">
      <label>Gordura corporal (%)</label>
      <input type="text" id="f-gordurapct" value="${p.gorduraPct ?? ""}">
      <label>Gordura corporal (kg)</label>
      <input type="text" id="f-gordurakg" value="${p.gorduraKg ?? ""}">
      <label>Massa muscular (%)</label>
      <input type="text" id="f-mmpct" value="${p.massaMuscularPct ?? ""}">
      <label>Massa muscular (kg)</label>
      <input type="text" id="f-mmkg" value="${p.massaMuscularKg ?? ""}">
      <label>IMC</label>
      <input type="text" id="f-imc" value="${p.imc ?? ""}">
      <label>Taxa metabólica basal (kcal)</label>
      <input type="text" id="f-tmb" value="${p.taxaMetabolica ?? ""}">
      <label>Massa óssea (kg)</label>
      <input type="text" id="f-mo" value="${p.massaOssea ?? ""}">
      <label>Score FitMass (0-100)</label>
      <input type="text" id="f-score" value="${p.score ?? ""}">
      <button class="btn" id="confirm-assessment">Salvar avaliação</button>
      <div style="height:8px"></div>
      <button class="btn secondary" id="cancel-assessment">Cancelar</button>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector("#cancel-assessment").addEventListener("click", () => backdrop.remove());
  backdrop.querySelector("#confirm-assessment").addEventListener("click", () => {
    const g = (id) => document.getElementById(id).value;
    const record = {
      id: uid(),
      date: g("f-data") || todayISO(),
      peso: parseFloat(g("f-peso")) || null,
      gorduraPct: parseFloat(g("f-gordurapct")) || null,
      gorduraKg: parseFloat(g("f-gordurakg")) || null,
      gorduraClass: p.gorduraClass,
      massaMuscularPct: parseFloat(g("f-mmpct")) || null,
      massaMuscularKg: parseFloat(g("f-mmkg")) || null,
      massaMuscularClass: p.massaMuscularClass,
      imc: parseFloat(g("f-imc")) || null,
      imcClass: p.imcClass,
      taxaMetabolica: parseFloat(g("f-tmb")) || null,
      massaOssea: parseFloat(g("f-mo")) || null,
      score: parseInt(g("f-score")) || null,
      scoreClass: p.scoreClass,
      segmentar: p.segmentar,
    };
    state.assessments.push(record);
    state.assessments.sort((a, b) => a.date.localeCompare(b.date));
    saveState();
    backdrop.remove();
    toast("Avaliação salva ✓");
    render();
  });
}

function deltaHtml(curr, prev, higherIsBetter) {
  if (curr == null || prev == null) return "";
  const diff = curr - prev;
  if (Math.abs(diff) < 0.05) return `<div class="delta">= estável</div>`;
  const improved = higherIsBetter ? diff > 0 : diff < 0;
  const arrow = diff > 0 ? "▲" : "▼";
  return `<div class="delta ${improved ? "up" : "down"}">${arrow} ${Math.abs(diff).toFixed(1)} vs anterior</div>`;
}

function renderAvaliacao(view) {
  const list = state.assessments;
  if (list.length === 0) {
    view.innerHTML = `
      <div class="section-title">Avaliação física</div>
      <div class="empty">
        <div class="empty-mark">◆</div>
        <p>Nenhuma avaliação importada ainda.<br>Toque no "+" para importar o PDF da sua bioimpedância.</p>
      </div>
      <div style="height:70px"></div>`;
    addAssessmentFab(view);
    return;
  }

  const latest = list[list.length - 1];
  const prev = list.length > 1 ? list[list.length - 2] : null;

  const seg = latest.segmentar || {};
  const segRows = ["bracoE", "bracoD", "tronco", "pernaE", "pernaD"]
    .map((k) => {
      const labels = { bracoE: "Braço E", bracoD: "Braço D", tronco: "Tronco", pernaE: "Perna E", pernaD: "Perna D" };
      const s = seg[k];
      if (!s) return "";
      return `<tr><td>${labels[k]}</td><td>${s.magra} kg</td><td>${s.gordura} kg</td></tr>`;
    })
    .join("");

  const historyRows = [...list]
    .reverse()
    .map(
      (a) => `<div class="assessment-list-item">
        <span>${a.date.split("-").reverse().join("/")}</span>
        <span>${a.peso ?? "—"} kg · ${a.gorduraPct ?? "—"}% gordura</span>
        <button class="del" data-del-assess="${a.id}">excluir</button>
      </div>`
    )
    .join("");

  function evoBars(field, unit) {
    const entries = list.filter((a) => a[field] != null).slice(-8);
    if (entries.length === 0) return "";
    const maxVal = Math.max(...entries.map((e) => e[field]), 1);
    return entries
      .map((e) => {
        const pct = Math.max(6, (e[field] / maxVal) * 100);
        const shortDate = e.date.slice(5).split("-").reverse().join("/");
        return `<div class="bar-row">
          <div class="bar-date">${shortDate}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
          <div class="bar-val">${e[field]}${unit}</div>
        </div>`;
      })
      .join("");
  }

  view.innerHTML = `
    <div class="section-title">Avaliação física</div>
    <div class="card">
      <div class="score-card">
        <div class="score-ring"><span class="num">${latest.score ?? "—"}</span><span class="den">/100</span></div>
        <div class="score-info">
          <div class="cls">${latest.scoreClass || ""}</div>
          <div class="date">Avaliação de ${latest.date.split("-").reverse().join("/")}</div>
        </div>
      </div>
      <div class="metric-grid">
        <div class="metric-box">
          <div class="label">Peso</div>
          <div class="val">${latest.peso ?? "—"} kg</div>
          ${prev ? deltaHtml(latest.peso, prev.peso, false) : ""}
        </div>
        <div class="metric-box">
          <div class="label">IMC <span class="tag ${tagClass(latest.imcClass)}">${latest.imcClass || ""}</span></div>
          <div class="val">${latest.imc ?? "—"}</div>
        </div>
        <div class="metric-box">
          <div class="label">Gordura corporal <span class="tag ${tagClass(latest.gorduraClass)}">${latest.gorduraClass || ""}</span></div>
          <div class="val">${latest.gorduraPct ?? "—"}% <span style="font-size:12px; color:var(--chalk-dim)">(${latest.gorduraKg ?? "—"} kg)</span></div>
          ${prev ? deltaHtml(latest.gorduraPct, prev.gorduraPct, false) : ""}
        </div>
        <div class="metric-box">
          <div class="label">Massa muscular <span class="tag ${tagClass(latest.massaMuscularClass)}">${latest.massaMuscularClass || ""}</span></div>
          <div class="val">${latest.massaMuscularPct ?? "—"}% <span style="font-size:12px; color:var(--chalk-dim)">(${latest.massaMuscularKg ?? "—"} kg)</span></div>
          ${prev ? deltaHtml(latest.massaMuscularKg, prev.massaMuscularKg, true) : ""}
        </div>
        <div class="metric-box">
          <div class="label">Metabolismo basal</div>
          <div class="val">${latest.taxaMetabolica ?? "—"} kcal</div>
        </div>
        <div class="metric-box">
          <div class="label">Massa óssea</div>
          <div class="val">${latest.massaOssea ?? "—"} kg</div>
        </div>
      </div>
      ${segRows ? `
      <div class="label" style="margin-bottom:6px;">Análise segmentar</div>
      <table class="segment-table">
        <tr><th></th><th>Massa magra</th><th>Gordura</th></tr>
        ${segRows}
      </table>` : ""}
    </div>

    ${list.length > 1 ? `
    <div class="section-title" style="font-size:18px;">Evolução — peso</div>
    <div class="card">${evoBars("peso", " kg")}</div>
    <div class="section-title" style="font-size:18px;">Evolução — % gordura</div>
    <div class="card">${evoBars("gorduraPct", "%")}</div>
    <div class="section-title" style="font-size:18px;">Evolução — massa muscular</div>
    <div class="card">${evoBars("massaMuscularKg", " kg")}</div>
    ` : `<p class="section-sub">Importe uma próxima avaliação para começar a ver sua evolução.</p>`}

    <div class="section-title" style="font-size:18px;">Histórico</div>
    <div class="card">${historyRows}</div>
    <div style="height:70px"></div>
  `;

  view.querySelectorAll("[data-del-assess]").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (confirm("Excluir esta avaliação?")) {
        state.assessments = state.assessments.filter((a) => a.id !== btn.dataset.delAssess);
        saveState();
        render();
      }
    })
  );

  addAssessmentFab(view);
}

function addAssessmentFab(view) {
  const fab = document.createElement("button");
  fab.className = "fab";
  fab.textContent = "+";
  view.appendChild(fab);
  fab.addEventListener("click", () => document.getElementById("assessment-pdf-input").click());
}

/* ============ INIT ============ */
render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
