import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const configurationError =
  !url || !key
    ? "Configuration Supabase absente. Copiez apps/web/.env.example vers apps/web/.env.local."
    : null;
export const supabase = createClient(
  url || "https://configuration-manquante.invalid",
  key || "configuration-manquante",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

export async function invoke<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, {
    body: body as Record<string, unknown>,
  });
  if (error) {
    const response = error.context as Response | undefined;
    let detail = error.message;
    if (response) {
      try {
        detail = JSON.stringify(await response.clone().json());
      } catch {
        detail = response.statusText || detail;
      }
    }
    throw new Error(detail);
  }
  return data as T;
}
