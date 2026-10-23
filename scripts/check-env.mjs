const apps = [
  ["web", ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]],
  ["mobile", ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY", "EXPO_PUBLIC_EAS_PROJECT_ID"]],
];
let failed = false;
for (const [name, keys] of apps) {
  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length) {
    failed = true;
    console.error(`${name}: variables manquantes: ${missing.join(", ")}`);
  }
}
if (failed) process.exit(1);
console.log("Configuration publique présente.");
