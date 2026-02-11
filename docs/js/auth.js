import { supabase } from "./supabaseClient.js";

/** Redireciona se não estiver logado */
export async function requireAuth() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  if (!data.session) {
    window.location.href = "login.html";
    return null;
  }
  return data.session.user;
}

/** Redireciona para home se já estiver logado */
export async function redirectIfAuthed() {
  const { data } = await supabase.auth.getSession();
  if (data?.session) window.location.href = "index.html";
}

/** Login */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

/** Cadastro */
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data.user;
}

/** Logout */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** Envia e-mail de recuperação de senha */
export async function sendPasswordReset(email) {
  const clean = String(email || "").trim();
  if (!clean) throw new Error("Informe um e-mail válido.");

  const redirectTo = new URL("login.html", window.location.href).toString();

  const { error } = await supabase.auth.resetPasswordForEmail(clean, { redirectTo });
  if (error) throw error;
}


/** Atualiza a senha do usuário logado (usado após abrir link de recuperação) */
export async function updatePassword(newPassword) {
  const pwd = String(newPassword || "");
  if (pwd.length < 8) throw new Error("A senha deve ter no mínimo 6 caracteres.");

  const { data, error } = await supabase.auth.updateUser({ password: pwd });
  if (error) throw error;
  return data.user;
}
