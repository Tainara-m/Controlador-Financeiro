import { supabase } from "./supabaseClient.js";

export const THEMES = [
  { id: "classic", label: "Clássico" },
  { id: "dark", label: "Dark" },
  { id: "ocean", label: "Ocean" },
  { id: "sunset", label: "Sunset" },
  { id: "mint", label: "Mint" },
];

export function applyTheme(themeId) {
  console.log("[THEME] aplicando:", themeId);
  document.documentElement.setAttribute("data-theme", themeId);
}

export async function saveThemeToProfile(userId, themeId) {
  const { error } = await supabase
    .from("profiles")
    .update({ theme: themeId })
    .eq("id", userId);

  if (error) throw error;
}

export async function ensureProfile(userId) {
  const { data } = await supabase
    .from("profiles")
    .select("id, theme")
    .eq("id", userId)
    .single();

  if (data) return data;

  await supabase.from("profiles").insert({
    id: userId,
    theme: "classic"
  });

  return { id: userId, theme: "classic" };
}
