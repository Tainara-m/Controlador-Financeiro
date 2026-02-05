import { supabase } from "./supabaseClient.js";
import { applyTheme } from "./theme.js";

export async function bootstrapProtectedPage() {
  const { data } = await supabase.auth.getSession();
  const session = data.session;

  if (!session) {
    window.location.href = "login.html";
    return;
  }

  // email no topo
  const emailEl = document.querySelector("[data-user-email]");
  if (emailEl) emailEl.textContent = session.user.email;

  // carregar e aplicar tema SEMPRE
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("theme")
    .eq("id", session.user.id)
    .single();

  if (error) {
    console.error("[THEME] erro ao carregar profile", error);
    return;
  }

  applyTheme(profile?.theme || "classic");
}
