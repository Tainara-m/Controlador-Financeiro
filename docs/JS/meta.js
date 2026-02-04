import { supabase } from "./supabaseClient.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function setStatus(text, type = "ok") {
  const el = $("#saveStatus");
  if (!el) return;
  el.textContent = text;
  el.dataset.type = type;
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
}

async function listGoals(userId) {
  const { data, error } = await supabase
    .from("goals")
    .select("id, name, image_url, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function uploadGoalImage(userId, file) {
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("goal-images")
    .upload(path, file, { upsert: false, cacheControl: "3600" });

  if (upErr) throw upErr;

  const { data } = supabase.storage.from("goal-images").getPublicUrl(path);
  return data.publicUrl;
}

async function createGoal(userId, name, imageUrl) {
  const { error } = await supabase
    .from("goals")
    .insert({ user_id: userId, name, image_url: imageUrl || null });

  if (error) throw error;
}

async function updateGoal(goalId, patch) {
  const { error } = await supabase
    .from("goals")
    .update(patch)
    .eq("id", goalId);

  if (error) throw error;
}

async function deleteGoal(goalId) {
  const { error } = await supabase
    .from("goals")
    .delete()
    .eq("id", goalId);

  if (error) throw error;
}

function renderGoals(goals, query = "") {
  const wrap = $("#goalsList");
  if (!wrap) return;

  const q = (query || "").trim().toLowerCase();
  const filtered = goals.filter(g => !q || (g.name || "").toLowerCase().includes(q));

  if (!filtered.length) {
    wrap.innerHTML = `<p class="muted">Nenhuma meta encontrada.</p>`;
    return;
  }

  wrap.innerHTML = filtered.map(g => `
    <article class="goal-card">
      <div class="goal-thumb">
        ${g.image_url
          ? `<img src="${g.image_url}" alt="Imagem da meta">`
          : `<div class="thumb-placeholder">📌</div>`}
      </div>

      <div class="goal-body">
        <div class="goal-name">${escapeHtml(g.name)}</div>
        <div class="muted small">${new Date(g.created_at).toLocaleDateString("pt-BR")}</div>

        <div class="row mt" style="gap:8px;">
          <button class="btn ghost" type="button" data-edit="${g.id}">Editar</button>
          <button class="btn danger" type="button" data-del="${g.id}">Excluir</button>
        </div>
      </div>
    </article>
  `).join("");
}

export async function initMetaPage() {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return;

  let cachedGoals = [];

  async function refresh() {
    cachedGoals = await listGoals(user.id);
    renderGoals(cachedGoals, $("#goalSearch")?.value || "");
  }

  // Criar
  $("#goalForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = ($("#goalName")?.value || "").trim();
    const file = $("#goalImage")?.files?.[0];

    if (!name) return;

    try {
      $("#goalSubmit").disabled = true;
      setStatus("Salvando…", "warn");

      let imageUrl = null;
      if (file) imageUrl = await uploadGoalImage(user.id, file);

      await createGoal(user.id, name, imageUrl);

      $("#goalName").value = "";
      $("#goalImage").value = "";

      await refresh();
      setStatus("Salvo", "ok");
    } catch (err) {
      console.error(err);
      setStatus("Erro", "err");
      alert(err?.message || "Erro ao criar meta.");
    } finally {
      $("#goalSubmit").disabled = false;
    }
  });

  // Buscar
  $("#goalSearch")?.addEventListener("input", () => {
    renderGoals(cachedGoals, $("#goalSearch").value);
  });

  // Excluir / Editar (lista)
  $("#goalsList")?.addEventListener("click", async (e) => {
    const delBtn = e.target.closest("[data-del]");
    const editBtn = e.target.closest("[data-edit]");

    if (delBtn) {
      const id = delBtn.dataset.del;
      if (!confirm("Excluir esta meta?")) return;

      try {
        setStatus("Excluindo…", "warn");
        await deleteGoal(id);
        await refresh();
        setStatus("OK", "ok");
      } catch (err) {
        console.error(err);
        setStatus("Erro", "err");
        alert(err?.message || "Erro ao excluir meta.");
      }
      return;
    }

    if (editBtn) {
      const id = editBtn.dataset.edit;
      const goal = cachedGoals.find(g => g.id === id);
      if (!goal) return;

      $("#editGoalId").value = id;
      $("#editGoalName").value = goal.name || "";
      $("#editGoalImage").value = "";

      $("#goalEditDialog")?.showModal();
    }
  });

  // Modal: salvar / excluir
  $("#goalEditDialog")?.addEventListener("close", async () => {
    // nada
  });

  $("#editSaveBtn")?.addEventListener("click", async (e) => {
    e.preventDefault();

    const id = $("#editGoalId").value;
    const newName = ($("#editGoalName").value || "").trim();
    const file = $("#editGoalImage")?.files?.[0];

    if (!id || !newName) return;

    try {
      setStatus("Salvando…", "warn");

      const patch = { name: newName };

      if (file) {
        const url = await uploadGoalImage(user.id, file);
        patch.image_url = url;
      }

      await updateGoal(id, patch);
      await refresh();
      setStatus("OK", "ok");

      $("#goalEditDialog").close();
    } catch (err) {
      console.error(err);
      setStatus("Erro", "err");
      alert(err?.message || "Erro ao salvar.");
    }
  });

  $("#editDeleteBtn")?.addEventListener("click", async () => {
    const id = $("#editGoalId").value;
    if (!id) return;

    if (!confirm("Excluir esta meta?")) return;

    try {
      setStatus("Excluindo…", "warn");
      await deleteGoal(id);
      await refresh();
      setStatus("OK", "ok");
      $("#goalEditDialog").close();
    } catch (err) {
      console.error(err);
      setStatus("Erro", "err");
      alert(err?.message || "Erro ao excluir.");
    }
  });

  await refresh();
}
