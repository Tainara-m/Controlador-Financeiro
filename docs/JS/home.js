import { supabase } from "./supabaseClient.js";
import { THEMES, applyTheme, ensureProfile, saveThemeToProfile } from "./theme.js";

const $ = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => Array.from(ctx.querySelectorAll(s));

const DEFAULT_PAYMENT_METHODS = ["dinheiro", "pix", "debito", "credito"];
const DEFAULT_CATEGORIES = [
  "alimentacao", "saude", "lazer", "moradia", "transporte", "educacao",
  "contas", "assinaturas", "compras", "outros"
];

function humanize(s) {
  const map = {
    dinheiro: "Dinheiro",
    pix: "Pix",
    debito: "Débito",
    credito: "Crédito",
    alimentacao: "Alimentação",
    saude: "Saúde",
    lazer: "Lazer",
    moradia: "Moradia",
    transporte: "Transporte",
    educacao: "Educação",
    contas: "Contas",
    assinaturas: "Assinaturas",
    compras: "Compras",
    outros: "Outros",
  };
  return map[s] || s;
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
}

function renderCheckboxList(container, items, selected = []) {
  if (!container) return;
  container.innerHTML = items.map((key) => {
    const checked = selected.includes(key) ? "checked" : "";
    return `
      <label class="check">
        <input type="checkbox" value="${key}" ${checked} />
        <span>${humanize(key)}</span>
      </label>
    `;
  }).join("");
}

function getCheckedValues(container) {
  if (!container) return [];
  return $$('input[type="checkbox"]:checked', container).map(i => i.value);
}

function setStatus(text, type = "ok") {
  const el = $("#saveStatus");
  if (!el) return;
  el.textContent = text;
  el.dataset.type = type;
}

let saveTimer = null;
function debounceSave(fn, ms = 450) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(fn, ms);
}

/** ====== Profiles ====== */
async function loadProfile(userId) {
  // garante existência do profile (cria se não existir)
  const base = await ensureProfile(userId);

  // busca todas as colunas usadas na Home
  const { data, error } = await supabase
    .from("profiles")
    .select("theme, currency, payment_methods, categories, income_types")
    .eq("id", userId)
    .single();

  if (error) throw error;

  return {
    theme: data.theme || base.theme || "classic",
    currency: data.currency || "BRL",
    payment_methods: Array.isArray(data.payment_methods) ? data.payment_methods : [],
    categories: Array.isArray(data.categories) ? data.categories : [],
    income_types: Array.isArray(data.income_types) ? data.income_types : []
  };
}

async function saveProfile(userId, patch) {
  setStatus("Salvando…", "warn");

  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId);

  if (error) {
    setStatus("Erro ao salvar", "err");
    throw error;
  }
  setStatus("Salvo", "ok");
}

/** ====== Income Types (tipos de entrada) ====== */
function renderIncomeTypes(list) {
  const wrap = $("#incomeTypesList");
  if (!wrap) return;

  if (!list.length) {
    wrap.innerHTML = `<span class="muted">Nenhum tipo cadastrado.</span>`;
    return;
  }

  wrap.innerHTML = list.map((name, idx) => `
    <span class="chip-item">
      ${escapeHtml(name)}
      <button class="chip-x" type="button" data-income-del="${idx}" aria-label="Remover">×</button>
    </span>
  `).join("");
}

/** ====== Goals ====== */
async function listGoals(userId) {
  const { data, error } = await supabase
    .from("goals")
    .select("id, name, image_url, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

function renderGoals(goals) {
  const wrap = $("#goalsList");
  if (!wrap) return;

  if (!goals.length) {
    wrap.innerHTML = `<p class="muted">Nenhuma meta cadastrada ainda.</p>`;
    return;
  }

  wrap.innerHTML = goals.map(g => `
    <div class="goal-item">
      <div class="goal-thumb">
        ${g.image_url
          ? `<img src="${g.image_url}" alt="Imagem da meta">`
          : `<div class="thumb-placeholder">📌</div>`
        }
      </div>
      <div class="goal-meta">
        <div class="goal-name">${escapeHtml(g.name)}</div>
        <div class="muted small">${new Date(g.created_at).toLocaleDateString("pt-BR")}</div>
      </div>
      <button class="btn danger" data-goal-delete="${g.id}" type="button">Excluir</button>
    </div>
  `).join("");
}

async function uploadGoalImage(userId, file) {
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("goal-images")
    .upload(path, file, { upsert: false, cacheControl: "3600" });

  if (upErr) throw upErr;

  const { data } = supabase.storage
    .from("goal-images")
    .getPublicUrl(path);

  return data.publicUrl;
}

async function createGoal(userId, name, imageUrl) {
  const { error } = await supabase
    .from("goals")
    .insert({ user_id: userId, name, image_url: imageUrl || null });

  if (error) throw error;
}

async function deleteGoal(goalId) {
  const { error } = await supabase
    .from("goals")
    .delete()
    .eq("id", goalId);

  if (error) throw error;
}

/** ====== Init Home ====== */
export async function initHome() {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return;

  // carregar profile
  const profile = await loadProfile(user.id);

  // Tema select
  const themeSelect = $("#themeSelect");
  if (themeSelect) {
    themeSelect.innerHTML = THEMES
      .map(t => `<option value="${t.id}">${t.label}</option>`)
      .join("");

    applyTheme(profile.theme);
    themeSelect.value = profile.theme;

    themeSelect.addEventListener("change", async () => {
      const themeId = themeSelect.value;
      await saveThemeToProfile(user.id, themeId);
      applyTheme(themeId);
      setStatus("Salvo", "ok");
    });
  }

  // Moeda select
  const currencySelect = $("#currencySelect");
  if (currencySelect) {
    currencySelect.value = profile.currency;
    currencySelect.addEventListener("change", () => {
      debounceSave(async () => {
        await saveProfile(user.id, { currency: currencySelect.value });
      }, 200);
    });
  }

  // Métodos de pagamento
  const pmWrap = $("#paymentMethods");
  renderCheckboxList(pmWrap, DEFAULT_PAYMENT_METHODS, profile.payment_methods);
  pmWrap?.addEventListener("change", () => {
    debounceSave(async () => {
      const values = getCheckedValues(pmWrap);
      await saveProfile(user.id, { payment_methods: values });
    });
  });

  // Categorias
  const catWrap = $("#categories");
  renderCheckboxList(catWrap, DEFAULT_CATEGORIES, profile.categories);
  catWrap?.addEventListener("change", () => {
    debounceSave(async () => {
      const values = getCheckedValues(catWrap);
      await saveProfile(user.id, { categories: values });
    });
  });

  // Tipos de entrada
  renderIncomeTypes(profile.income_types);

  $("#incomeTypeForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#incomeTypeInput");
    const name = (input?.value || "").trim();
    if (!name) return;

    const current = Array.isArray(profile.income_types) ? profile.income_types : [];
    const next = current.some(x => String(x).toLowerCase() === name.toLowerCase())
      ? current
      : [name, ...current];

    try {
      if (input) input.value = "";
      profile.income_types = next;
      renderIncomeTypes(next);
      await saveProfile(user.id, { income_types: next });
    } catch (err) {
      console.error(err);
      alert(err?.message || "Erro ao salvar tipo de entrada.");
    }
  });

  $("#incomeTypesList")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-income-del]");
    if (!btn) return;

    const idx = Number(btn.dataset.incomeDel);
    const current = Array.isArray(profile.income_types) ? profile.income_types : [];
    const next = current.filter((_, i) => i !== idx);

    try {
      profile.income_types = next;
      renderIncomeTypes(next);
      await saveProfile(user.id, { income_types: next });
    } catch (err) {
      console.error(err);
      alert(err?.message || "Erro ao remover tipo de entrada.");
    }
  });

  // Metas (goals)
  const goals = await listGoals(user.id);
  renderGoals(goals);

  $("#goalForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = ($("#goalName")?.value || "").trim();
    const file = $("#goalImage")?.files?.[0];

    if (!name) return;

    try {
      const submitBtn = $("#goalSubmit");
      if (submitBtn) submitBtn.disabled = true;

      setStatus("Salvando…", "warn");

      let imageUrl = null;
      if (file) imageUrl = await uploadGoalImage(user.id, file);

      await createGoal(user.id, name, imageUrl);

      if ($("#goalName")) $("#goalName").value = "";
      if ($("#goalImage")) $("#goalImage").value = "";

      const updated = await listGoals(user.id);
      renderGoals(updated);

      setStatus("Salvo", "ok");
    } catch (err) {
      console.error(err);
      setStatus("Erro ao salvar", "err");
      alert(err?.message || "Erro ao salvar meta.");
    } finally {
      const submitBtn = $("#goalSubmit");
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  $("#goalsList")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-goal-delete]");
    if (!btn) return;

    const id = btn.dataset.goalDelete;
    if (!confirm("Excluir esta meta?")) return;

    try {
      setStatus("Salvando…", "warn");
      await deleteGoal(id);

      const updated = await listGoals(user.id);
      renderGoals(updated);

      setStatus("Salvo", "ok");
    } catch (err) {
      console.error(err);
      setStatus("Erro ao excluir", "err");
      alert(err?.message || "Erro ao excluir meta.");
    }
  });
  // ===== Seleção de mês (ano vigente automático) =====
  const monthSelect = document.querySelector("#monthSelect");
  if (monthSelect) {
    const currentYear = new Date().getFullYear();

    monthSelect.addEventListener("change", () => {
      const month = Number(monthSelect.value);
      if (!month) return;

      // reset visual
      monthSelect.value = "";

      window.location.href = `mes.html?ano=${currentYear}&mes=${month}`;
    });
  }

}