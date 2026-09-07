/* ============ CONFIG ============ */
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
}

const STORAGE_KEY = "treino-app-state-v1";
const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTHS = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

const GEMINI_TEMPLATE = `INSTRUÇÕES PARA VOCÊ (IA): preencha apenas o que está entre colchetes [ ] abaixo, mantendo exatamente esta estrutura — os títulos "# TREINO", a numeração dos exercícios e o separador " | " entre os campos. Não escreva nada fora deste modelo (sem introdução, sem texto solto, sem markdown como **negrito** ou tabelas). Repita o bloco "# TREINO" quantas vezes forem necessários para os dias de treino da semana.

# TREINO [LETRA, ex: A] — [grupo muscular do dia]
1. [nome do exercício] | [séries]x[repetições] | [carga]kg | descanso [segundos]s
2. [nome do exercício] | [séries]x[repetições] | [carga]kg | descanso [segundos]s
3. [nome do exercício] | [séries]x[repetições] | [carga]kg | descanso [segundos]s

# TREINO [LETRA, ex: B] — [grupo muscular do dia]
1. [nome do exercício] | [séries]x[repetições] | [carga]kg | descanso [segundos]s
2. [nome do exercício] | [séries]x[repetições] | [carga]kg | descanso [segundos]s

Regras:
- Se ainda não houver carga definida para um exercício, escreva "a definir" no lugar de "[carga]kg"
- Não use travessão, dois-pontos ou qualquer outro separador dentro da linha do exercício além de " | "
- A numeração dos exercícios reinicia em 1 a cada novo treino
- Para dias de cardio, use: CARDIO: [descrição, ex: Esteira 30 min ritmo moderado]

Meu perfil / objetivo: [idade, objetivo, frequência semanal de treino, restrições ou lesões].`;

/* ============ STATE ============ */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!parsed.assessments) parsed.assessments = [];
      if (!parsed.runs) parsed.runs = [];
      if (!parsed.runPlans) parsed.runPlans = [];
      if (!parsed.trainingLogs) parsed.trainingLogs = [];
      return parsed;
    }
  } catch (e) {}
  return { workouts: [], sessions: [], assessments: [], runs: [], runPlans: [], trainingLogs: [] };
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
  else if (currentTab === "corrida") renderCorrida(view);
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
    if (entry) return { ...entry, date: state.sessions[i].date };
  }
  return null;
}
function formatShortDate(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}`;
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
  if (liveSession) {
    renderLiveSession(view);
    return;
  }
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
      const metaSeries = ex.series ? `${ex.series}x${ex.reps}` : ex.reps;
      const metaLine = last
        ? `Última vez (${formatShortDate(last.date)}): ${last.series ? last.series + "x" + last.reps : last.reps}${last.carga ? " · " + last.carga : ""}`
        : `Sugerido: ${metaSeries}${ex.carga ? " · " + ex.carga : ""}${ex.descanso ? " · descanso " + ex.descanso : ""}`;
      return `
      <div class="exercise-row" data-ex-id="${ex.id}">
        <div class="exercise-name">${ex.nome}${ex.isCardio ? " 🏃" : ""}</div>
        <div class="exercise-meta">${metaLine}</div>
        <div class="log-grid">
          <div><label>Séries</label><input type="number" inputmode="numeric" class="in-series" value="${last ? last.series : ex.series}"></div>
          <div><label>Reps</label><input type="text" inputmode="numeric" class="in-reps" value="${last ? last.reps : ex.reps}"></div>
          <div><label>Carga</label><input type="text" class="in-carga" value="${last ? last.carga : (ex.carga || "")}"></div>
        </div>
      </div>`;
    })
    .join("");

  view.innerHTML = `
    <div class="section-title">Treino de hoje</div>
    <div class="section-sub">${workout.foco || ""}</div>
    <div class="today-pick">${pills}</div>
    <button class="btn" id="start-live-btn" style="margin-bottom:14px;">▶ Iniciar treino com cronômetro</button>
    <div class="card">${rows}</div>
    <button class="btn secondary" id="save-session-btn">Salvar treino de hoje (sem cronômetro)</button>
  `;

  document.getElementById("start-live-btn").addEventListener("click", () => {
    startLiveSession(workout);
  });

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

/* ============ CRONÔMETRO / SESSÃO GUIADA ============ */
let liveSession = null;
let liveTickInterval = null;

function parseDescansoSeconds(str) {
  if (!str) return 60;
  const m = String(str).match(/(\d+)\s*(min|m|s|seg)?/i);
  if (!m) return 60;
  const n = parseInt(m[1], 10);
  if (/^m/i.test(m[2] || "")) return n * 60;
  return n;
}

function startLiveSession(workout) {
  const exercises = workout.exercises.map((ex) => {
    const last = lastLogFor(ex.nome);
    return {
      exId: ex.id,
      nome: ex.nome,
      isCardio: !!ex.isCardio,
      plannedSeries: parseInt(ex.series, 10) || 1,
      plannedReps: ex.reps || "",
      plannedDescansoSec: ex.isCardio ? 0 : parseDescansoSeconds(ex.descanso),
      carga: last ? last.carga : ex.carga || "",
      sets: [],
    };
  });
  liveSession = {
    workoutId: workout.id,
    workoutLetter: workout.letter,
    startTime: Date.now(),
    exIndex: 0,
    setIndex: 1,
    phase: "idle", // idle | set-running | resting | finished
    setStartTime: null,
    restStartTime: null,
    exercises,
  };
  if (liveTickInterval) clearInterval(liveTickInterval);
  liveTickInterval = setInterval(() => {
    if (liveSession && (liveSession.phase === "set-running" || liveSession.phase === "resting") && currentTab === "hoje") {
      render();
    }
  }, 1000);
  render();
}

function currentLiveExercise() {
  return liveSession ? liveSession.exercises[liveSession.exIndex] : null;
}

function liveStartSet() {
  liveSession.phase = "set-running";
  liveSession.setStartTime = Date.now();
  render();
}

function liveFinishSet(status) {
  const ex = currentLiveExercise();
  let actualReps = ex.plannedReps;
  if (status !== "completed") {
    const input = window.prompt(
      status === "failed_early" ? "Quantas repetições você conseguiu fazer?" : "Quantas repetições você fez até a falha?",
      ex.plannedReps || ""
    );
    if (input !== null && input.trim() !== "") actualReps = input.trim();
  }
  const setElapsedSec = liveSession.setStartTime ? (Date.now() - liveSession.setStartTime) / 1000 : 0;
  ex.sets.push({
    setNumber: liveSession.setIndex,
    status,
    actualReps,
    setElapsedSec: Math.round(setElapsedSec),
    restPlannedSec: ex.plannedDescansoSec,
    restActualSec: null,
    overtimeSec: 0,
  });
  liveSession.setStartTime = null;

  if (ex.plannedDescansoSec > 0) {
    liveSession.phase = "resting";
    liveSession.restStartTime = Date.now();
  } else {
    liveAdvance();
  }
  render();
}

function liveEndRest() {
  const ex = currentLiveExercise();
  const lastSet = ex.sets[ex.sets.length - 1];
  const restElapsedSec = liveSession.restStartTime ? (Date.now() - liveSession.restStartTime) / 1000 : 0;
  if (lastSet) {
    lastSet.restActualSec = Math.round(restElapsedSec);
    lastSet.overtimeSec = Math.max(0, Math.round(restElapsedSec - ex.plannedDescansoSec));
  }
  liveSession.restStartTime = null;
  liveAdvance();
  render();
}

function liveAdvance() {
  const ex = currentLiveExercise();
  liveSession.setIndex++;
  if (liveSession.setIndex > ex.plannedSeries) {
    liveSession.exIndex++;
    liveSession.setIndex = 1;
    if (liveSession.exIndex >= liveSession.exercises.length) {
      liveSession.phase = "finished";
      return;
    }
  }
  liveSession.phase = "idle";
}

function liveCancelSession() {
  if (confirm("Cancelar este treino sem salvar o progresso?")) {
    if (liveTickInterval) clearInterval(liveTickInterval);
    liveTickInterval = null;
    liveSession = null;
    render();
  }
}

function liveFinalizeSession() {
  const log = [];
  liveSession.exercises.forEach((ex) => {
    if (ex.sets.length === 0) return;
    const lastSet = ex.sets[ex.sets.length - 1];
    log.push({
      exId: ex.exId,
      nome: ex.nome,
      series: String(ex.sets.length),
      reps: lastSet.actualReps,
      carga: ex.carga,
    });
  });
  const workout = state.workouts.find((w) => w.id === liveSession.workoutId);
  state.sessions.push({
    id: uid(),
    date: todayISO(),
    workoutId: liveSession.workoutId,
    workoutLetter: liveSession.workoutLetter,
    log,
  });
  state.trainingLogs.push({
    id: uid(),
    date: todayISO(),
    workoutLetter: liveSession.workoutLetter,
    startTime: liveSession.startTime,
    endTime: Date.now(),
    exercises: liveSession.exercises.map((ex) => ({
      nome: ex.nome,
      plannedSeries: ex.plannedSeries,
      plannedReps: ex.plannedReps,
      plannedDescansoSec: ex.plannedDescansoSec,
      carga: ex.carga,
      sets: ex.sets,
    })),
  });
  saveState();
  if (liveTickInterval) clearInterval(liveTickInterval);
  liveTickInterval = null;
  liveSession = null;
  toast("Treino finalizado e salvo ✓");
  render();
}

function renderLiveSession(view) {
  const s = liveSession;
  const ex = currentLiveExercise();
  const totalElapsed = Math.round((Date.now() - s.startTime) / 1000);

  const dots = ex
    ? Array.from({ length: ex.plannedSeries }, (_, i) => (i < ex.sets.length ? "●" : i + 1 === s.setIndex ? "◐" : "○")).join(" ")
    : "";

  let phaseBlock = "";
  if (s.phase === "finished" || !ex) {
    phaseBlock = `
      <div class="card" style="text-align:center;">
        <div style="font-size:17px; font-weight:700; margin-bottom:6px;">Treino concluído 🎉</div>
        <div class="section-sub" style="margin-bottom:0;">Toque em "Finalizar e salvar" para registrar tudo.</div>
      </div>`;
  } else if (s.phase === "idle") {
    phaseBlock = `
      <div class="card">
        <div class="exercise-name">${ex.nome}${ex.isCardio ? " 🏃" : ""}</div>
        <div class="exercise-meta">Série ${s.setIndex} de ${ex.plannedSeries} · meta: ${ex.plannedReps || "—"} reps${ex.plannedDescansoSec ? " · descanso " + formatSecondsToClock(ex.plannedDescansoSec) : ""}</div>
        <div style="font-size:18px; letter-spacing:3px; margin:10px 0;">${dots}</div>
        <label>Carga (kg)</label>
        <input type="text" id="live-carga" value="${ex.carga || ""}">
        <button class="btn" id="live-start-set">▶ Iniciar série</button>
      </div>`;
  } else if (s.phase === "set-running") {
    const setElapsed = Math.round((Date.now() - s.setStartTime) / 1000);
    phaseBlock = `
      <div class="card">
        <div class="exercise-name">${ex.nome}</div>
        <div class="exercise-meta">Série ${s.setIndex} de ${ex.plannedSeries} · meta: ${ex.plannedReps || "—"} reps · carga ${ex.carga || "—"}</div>
        <div class="live-timer-big">${formatSecondsToClock(setElapsed)}</div>
        <div class="live-btn-row">
          <button class="btn" id="live-finish-ok">Terminei a série</button>
          <button class="btn secondary" id="live-finish-early">Não terminei</button>
          <button class="btn secondary" id="live-finish-failure">Fui até a falha</button>
        </div>
      </div>`;
  } else if (s.phase === "resting") {
    const restElapsed = (Date.now() - s.restStartTime) / 1000;
    const remaining = ex.plannedDescansoSec - restElapsed;
    const isOvertime = remaining < 0;
    const timerHtml = isOvertime
      ? `00:00 <span class="overtime">+${formatSecondsToClock(-remaining)}</span>`
      : formatSecondsToClock(remaining);
    phaseBlock = `
      <div class="card">
        <div class="exercise-name">Descanso</div>
        <div class="exercise-meta">Próxima: série ${s.setIndex + 1 > ex.plannedSeries ? "1 (próximo exercício)" : s.setIndex + 1} de ${ex.plannedSeries}</div>
        <div class="live-timer-big ${isOvertime ? "overtime" : ""}">${timerHtml}</div>
        <button class="btn" id="live-end-rest">Próxima série</button>
      </div>`;
  }

  view.innerHTML = `
    <div class="section-title">Treino de hoje</div>
    <div class="section-sub">Treino ${s.workoutLetter} em andamento · ${formatSecondsToClock(totalElapsed)}</div>
    ${phaseBlock}
    <button class="btn" id="live-finalize" style="margin-top:6px;">Finalizar e salvar</button>
    <div style="height:8px"></div>
    <button class="btn secondary" id="live-cancel">Cancelar treino</button>
    <div style="height:70px"></div>
  `;

  const byId = (id) => view.querySelector("#" + id);
  if (byId("live-start-set")) byId("live-start-set").addEventListener("click", liveStartSet);
  if (byId("live-carga"))
    byId("live-carga").addEventListener("change", (e) => {
      ex.carga = e.target.value;
    });
  if (byId("live-finish-ok")) byId("live-finish-ok").addEventListener("click", () => liveFinishSet("completed"));
  if (byId("live-finish-early")) byId("live-finish-early").addEventListener("click", () => liveFinishSet("failed_early"));
  if (byId("live-finish-failure")) byId("live-finish-failure").addEventListener("click", () => liveFinishSet("to_failure"));
  if (byId("live-end-rest")) byId("live-end-rest").addEventListener("click", liveEndRest);
  byId("live-finalize").addEventListener("click", liveFinalizeSession);
  byId("live-cancel").addEventListener("click", liveCancelSession);
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
          (ex) => `<div class="ex-list-item"><span>${ex.nome}${ex.isCardio ? " 🏃" : ""}</span><span class="n">${ex.series ? ex.series + "x" + ex.reps : ex.reps}${ex.carga ? " · " + ex.carga : ""}</span></div>`
        )
        .join("")}
    </div>`
    )
    .join("");

  view.innerHTML = `
    <div class="section-title">Meu Treino</div>
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
      <p class="section-sub">Importe o PDF ou TXT gerado pelo Gemini, ou baixe o modelo de preenchimento para ele usar.</p>
      <button class="btn" id="modal-import-pdf">Importar arquivo (PDF ou TXT)</button>
      <div style="height:10px"></div>
      <button class="btn secondary" id="modal-download-template">Baixar modelo para o Gemini (.txt)</button>
      <div style="height:8px"></div>
      <button class="btn secondary" id="modal-show-template">Ver modelo na tela</button>
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
  backdrop.querySelector("#modal-download-template").addEventListener("click", () => {
    downloadTextFile("modelo-treino-gemini.txt", GEMINI_TEMPLATE);
    toast("Modelo baixado");
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

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

document.getElementById("pdf-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const text = isPdf ? await extractPdfText(file) : await file.text();
    const parsed = parseWorkoutText(text);
    if (parsed.length === 0) {
      toast("Não consegui identificar exercícios nesse arquivo");
      return;
    }
    openReviewModal(parsed);
  } catch (err) {
    console.error(err);
    toast("Erro ao ler o arquivo");
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
  const rawLines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const workouts = [];
  let current = null;
  let inNotes = false;

  rawLines.forEach((rawLine) => {
    if (/^OBSERVA[ÇC][ÕO]ES/i.test(rawLine)) {
      inNotes = true;
      return;
    }
    // ignora linhas decorativas feitas só de =, -, * ou #
    if (/^[=\-*#\s]+$/.test(rawLine)) return;

    // normaliza: remove decoração tipo "#", "---", "===" ao redor do título
    const cleaned = rawLine.replace(/^[#\-=\s]+/, "").replace(/[\-=\s]+$/, "");

    const headerMatch = cleaned.match(/^TREINO\s+([A-Za-zÀ-ú0-9]+)\s*[:\-–—]?\s*(.*)$/i);
    if (headerMatch) {
      current = { id: uid(), letter: headerMatch[1].toUpperCase(), foco: headerMatch[2] || "", exercises: [] };
      workouts.push(current);
      inNotes = false;
      return;
    }

    if (inNotes) return; // ignora observações soltas após "OBSERVAÇÕES..."

    const numMatch = rawLine.match(/^\d+[\.\)]\s*(.+)$/);
    const bulletMatch = rawLine.match(/^[•\-*]\s*(.+)$/);
    const cardioMatch = rawLine.match(/^CARDIO\s*:?\s*(.*)$/i);

    let content = null;
    let isCardio = false;
    if (cardioMatch) {
      content = cardioMatch[1];
      isCardio = true;
    } else if (numMatch) {
      content = numMatch[1];
    } else if (bulletMatch) {
      content = bulletMatch[1];
    }
    if (content === null) return;

    if (!current) {
      current = { id: uid(), letter: String.fromCharCode(65 + workouts.length), foco: "", exercises: [] };
      workouts.push(current);
    }

    let nome, series = "", reps = "", carga = "", descanso = "";

    if (content.includes("|")) {
      // formato estrito: nome | Nx reps | carga | descanso
      const parts = content.split("|").map((p) => p.trim());
      nome = parts[0] || "Exercício";
      if (parts[1]) {
        const sr = parts[1].match(/(\d+)\s*[xX]\s*(.+)/);
        if (sr) { series = sr[1]; reps = sr[2].trim(); } else { reps = parts[1]; }
      }
      carga = parts[2] || "";
      descanso = (parts[3] || "").replace(/descanso/i, "").trim();
    } else if (isCardio) {
      nome = "Cardio";
      reps = content.trim();
    } else if (content.includes(":")) {
      // formato solto: "Nome do exercício: 3x 10-12" ou "Duração: 60 a 90 minutos"
      const idx = content.indexOf(":");
      nome = content.slice(0, idx).trim();
      const rest = content.slice(idx + 1).trim();
      const sr = rest.match(/(\d+)\s*[xX]\s*([\d\-–a\s]+)/i);
      if (sr) {
        series = sr[1];
        reps = sr[2].trim();
      } else {
        reps = rest;
      }
    } else {
      const sr = content.match(/(\d+)\s*[xX]\s*([\d\-–]+)/);
      if (sr) {
        nome = content.slice(0, sr.index).trim() || "Exercício";
        series = sr[1];
        reps = sr[2].trim();
      } else {
        nome = content.trim();
      }
    }

    current.exercises.push({ id: uid(), nome, series, reps, carga, descanso, isCardio });
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
      ${w.exercises.map((ex) => `<div class="ex-list-item"><span>${ex.nome}${ex.isCardio ? " 🏃" : ""}</span><span class="n">${ex.series ? ex.series + "x" + ex.reps : ex.reps}${ex.carga ? " · " + ex.carga : ""}</span></div>`).join("")}
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
  const arrowClass = improved ? "arrow-up" : "arrow-down";
  return `<div class="delta"><span class="${arrowClass}">${arrow}</span> ${Math.abs(diff).toFixed(1)} vs anterior</div>`;
}

function renderAvaliacao(view) {
  const list = state.assessments;
  if (list.length === 0) {
    view.innerHTML = `
      <div class="section-title">Avaliações</div>
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
    <div class="section-title">Avaliações</div>
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

/* ============ MINHA CORRIDA ============ */
function parseTimeToSeconds(str) {
  if (!str) return null;
  const clean = String(str).trim().replace(",", ".");
  const parts = clean.split(":").map((p) => parseFloat(p));
  if (parts.some((p) => isNaN(p))) return null;
  let sec = 0;
  if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
  else if (parts.length === 2) sec = parts[0] * 60 + parts[1];
  else if (parts.length === 1) sec = parts[0] * 60;
  return sec;
}
function formatSecondsToClock(sec) {
  if (sec == null || isNaN(sec)) return "—";
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
function formatPace(secPerKm) {
  if (!secPerKm || !isFinite(secPerKm) || isNaN(secPerKm)) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}
function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}
function weeklyKm() {
  const monday = mondayOf(new Date());
  return state.runs
    .filter((r) => new Date(r.date + "T00:00:00") >= monday)
    .reduce((sum, r) => sum + (r.km || 0), 0);
}
function historicAvgPace() {
  const totalSec = state.runs.reduce((s, r) => s + (r.totalTimeSec || 0), 0);
  const totalKm = state.runs.reduce((s, r) => s + (r.km || 0), 0);
  if (!totalKm) return null;
  return totalSec / totalKm;
}
function estimateCalories(km) {
  const last = state.assessments[state.assessments.length - 1];
  const peso = last ? last.peso : null;
  if (!peso || !km) return null;
  return Math.round(peso * km * 1.036);
}

document.getElementById("corrida-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const text = isPdf ? await extractPdfText(file) : await file.text();
    const suggestions = parseRunSuggestions(text);
    if (suggestions.length === 0) {
      toast("Não encontrei sugestões de corrida nesse arquivo");
      return;
    }
    state.runPlans = suggestions;
    saveState();
    toast("Sugestões importadas ✓");
    render();
  } catch (err) {
    console.error(err);
    toast("Erro ao ler o arquivo");
  }
});

function parseRunSuggestions(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const dayRe = /^(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)[^:\-–]*[:\-–]\s*(.+)$/i;
  const out = [];
  lines.forEach((line) => {
    const m = line.match(dayRe);
    if (m) out.push({ id: uid(), dia: m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase(), descricao: m[2].trim() });
  });
  return out;
}

function openRunLogModal() {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <h3>Registrar corrida</h3>
      <label>Data</label>
      <input type="date" id="r-data" value="${todayISO()}">
      <label>Distância (km)</label>
      <input type="text" id="r-km" placeholder="ex: 5.2">
      <label>Tempo total (mm:ss ou h:mm:ss)</label>
      <input type="text" id="r-tempo" placeholder="ex: 32:15">
      <div class="check-row">
        <input type="checkbox" id="r-misto">
        <label style="margin:0;" for="r-misto">Foi circuito misto (andei + corri)</label>
      </div>
      <div id="r-misto-fields" style="display:none;">
        <label>Tempo andando (mm:ss)</label>
        <input type="text" id="r-tempo-andei" placeholder="ex: 10:00">
        <label>Tempo correndo (mm:ss)</label>
        <input type="text" id="r-tempo-correu" placeholder="ex: 22:15">
      </div>
      <label>Calorias gastas (kcal)</label>
      <input type="text" id="r-calorias" placeholder="ex: 320">
      <button class="btn secondary small" id="r-estimar" style="margin-bottom:10px;">Estimar calorias</button>
      <button class="btn" id="confirm-run">Salvar corrida</button>
      <div style="height:8px"></div>
      <button class="btn secondary" id="cancel-run">Cancelar</button>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector("#cancel-run").addEventListener("click", () => backdrop.remove());
  backdrop.querySelector("#r-misto").addEventListener("change", (e) => {
    backdrop.querySelector("#r-misto-fields").style.display = e.target.checked ? "block" : "none";
  });
  backdrop.querySelector("#r-estimar").addEventListener("click", () => {
    const km = parseFloat(backdrop.querySelector("#r-km").value.replace(",", "."));
    const est = estimateCalories(km);
    if (est) {
      backdrop.querySelector("#r-calorias").value = est;
      toast("Estimativa preenchida (baseada no seu último peso registrado)");
    } else {
      toast("Preencha a distância e registre uma avaliação com peso primeiro");
    }
  });
  backdrop.querySelector("#confirm-run").addEventListener("click", () => {
    const km = parseFloat(backdrop.querySelector("#r-km").value.replace(",", "."));
    const totalTimeSec = parseTimeToSeconds(backdrop.querySelector("#r-tempo").value);
    if (!km || !totalTimeSec) {
      toast("Preencha ao menos a distância e o tempo total");
      return;
    }
    const isMixed = backdrop.querySelector("#r-misto").checked;
    const walkTimeSec = isMixed ? parseTimeToSeconds(backdrop.querySelector("#r-tempo-andei").value) : null;
    const runTimeSec = isMixed ? parseTimeToSeconds(backdrop.querySelector("#r-tempo-correu").value) : null;
    const calorias = parseFloat(backdrop.querySelector("#r-calorias").value) || null;
    const record = {
      id: uid(),
      date: backdrop.querySelector("#r-data").value || todayISO(),
      km,
      totalTimeSec,
      isMixed,
      walkTimeSec,
      runTimeSec,
      calorias,
      paceSecPerKm: totalTimeSec / km,
    };
    state.runs.push(record);
    state.runs.sort((a, b) => a.date.localeCompare(b.date));
    saveState();
    backdrop.remove();
    toast("Corrida registrada ✓");
    render();
  });
}

function openRunAddModal() {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <h3>Minha Corrida</h3>
      <button class="btn" id="opt-log-run">Registrar corrida</button>
      <div style="height:10px"></div>
      <button class="btn secondary" id="opt-import-suggestions">Importar sugestões do Gemini (PDF/TXT)</button>
      <div style="height:10px"></div>
      <button class="btn secondary" id="opt-cancel">Cancelar</button>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector("#opt-cancel").addEventListener("click", () => backdrop.remove());
  backdrop.querySelector("#opt-log-run").addEventListener("click", () => {
    backdrop.remove();
    openRunLogModal();
  });
  backdrop.querySelector("#opt-import-suggestions").addEventListener("click", () => {
    backdrop.remove();
    document.getElementById("corrida-input").click();
  });
}

function renderCorrida(view) {
  const runs = state.runs;
  const avgPace = historicAvgPace();
  const kmWeek = weeklyKm();

  const suggestionsCard = state.runPlans.length
    ? `<div class="card">
        <div class="label" style="color:var(--chalk-dim); font-size:12px; margin-bottom:6px;">Sugestões do Gemini</div>
        ${state.runPlans.map((p) => `<div class="suggestion-item"><span class="day">${p.dia}:</span>${p.descricao}</div>`).join("")}
      </div>`
    : "";

  if (runs.length === 0) {
    view.innerHTML = `
      <div class="section-title">Minha Corrida</div>
      ${suggestionsCard}
      <div class="empty">
        <div class="empty-mark">≈</div>
        <p>Nenhuma corrida registrada ainda.<br>Toque no "+" para registrar sua primeira corrida.</p>
      </div>
      <div style="height:70px"></div>`;
    addRunFab(view);
    return;
  }

  function evoBars(getVal, formatter) {
    const entries = runs.slice(-8);
    const maxVal = Math.max(...entries.map(getVal), 0.01);
    return entries
      .map((r) => {
        const val = getVal(r);
        const pct = Math.max(6, (val / maxVal) * 100);
        const shortDate = r.date.slice(5).split("-").reverse().join("/");
        return `<div class="bar-row">
          <div class="bar-date">${shortDate}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
          <div class="bar-val">${formatter(r)}</div>
        </div>`;
      })
      .join("");
  }

  const historyRows = [...runs]
    .reverse()
    .map(
      (r) => `<div class="run-list-item">
        <div class="info">
          <div class="d1">${r.date.split("-").reverse().join("/")} — ${r.km} km</div>
          <div class="d2">${formatSecondsToClock(r.totalTimeSec)} · ${formatPace(r.paceSecPerKm)}${r.isMixed ? ` · andou ${formatSecondsToClock(r.walkTimeSec)} / correu ${formatSecondsToClock(r.runTimeSec)}` : ""}${r.calorias ? ` · ${r.calorias} kcal` : ""}</div>
        </div>
        <button class="del" data-del-run="${r.id}">excluir</button>
      </div>`
    )
    .join("");

  view.innerHTML = `
    <div class="section-title">Minha Corrida</div>
    ${suggestionsCard}
    <div class="stat-row">
      <div class="stat-box"><div class="stat-num">${kmWeek.toFixed(1)}</div><div class="stat-label">km essa semana</div></div>
      <div class="stat-box"><div class="stat-num">${formatPace(avgPace)}</div><div class="stat-label">pace médio histórico</div></div>
      <div class="stat-box"><div class="stat-num">${runs.length}</div><div class="stat-label">corridas registradas</div></div>
    </div>

    <div class="section-title" style="font-size:18px;">Evolução — distância</div>
    <div class="card">${evoBars((r) => r.km, (r) => r.km + " km")}</div>

    <div class="section-title" style="font-size:18px;">Evolução — pace</div>
    <div class="card">${evoBars((r) => r.paceSecPerKm, (r) => formatPace(r.paceSecPerKm))}</div>

    <div class="section-title" style="font-size:18px;">Histórico</div>
    <div class="card">${historyRows}</div>
    <div style="height:70px"></div>
  `;

  view.querySelectorAll("[data-del-run]").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (confirm("Excluir esta corrida?")) {
        state.runs = state.runs.filter((r) => r.id !== btn.dataset.delRun);
        saveState();
        render();
      }
    })
  );

  addRunFab(view);
}

function addRunFab(view) {
  const fab = document.createElement("button");
  fab.className = "fab";
  fab.textContent = "+";
  view.appendChild(fab);
  fab.addEventListener("click", openRunAddModal);
}

/* ============ INIT ============ */
render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
