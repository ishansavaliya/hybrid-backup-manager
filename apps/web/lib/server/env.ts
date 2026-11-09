export interface ServerEnv {
  supabaseUrl: string;
  supabaseSecretKey: string;
  adminUsername: string;
  adminPassword: string;
  sessionSecret: string;
  licensePrivateKey: string;
  cronSecret: string;
}

function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server setting: ${name}`);
  return value;
}

/** Server-only: never import from client components. */
export function serverEnv(): ServerEnv {
  return {
    supabaseUrl: need("SUPABASE_URL"),
    supabaseSecretKey: need("SUPABASE_SECRET_KEY"),
    adminUsername: need("BKP_ADMIN_USERNAME"),
    adminPassword: need("BKP_ADMIN_PASSWORD"),
    sessionSecret: need("BKP_SESSION_SECRET"),
    licensePrivateKey: need("LICENSE_SIGNING_PRIVATE_KEY"),
    cronSecret: need("CRON_SECRET"),
  };
}
