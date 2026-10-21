// Configuration de l'API agent — lue depuis l'environnement, jamais codee en dur.
// Le jeton n'est jamais commite : il vit dans l'environnement ou un fichier hors depot.
export interface AgentApiConfig {
  token: string;
  dbPath: string;
  port: number;
  host: string;
}

export const DEFAULT_PORT = 7421;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentApiConfig {
  const token = env.COMPTAL_AGENT_TOKEN ?? '';
  if (token.length < 16) {
    throw new Error(
      "COMPTAL_AGENT_TOKEN manquant ou trop court : fournir un jeton de 16+ caracteres " +
        "(ex. openssl rand -hex 32). Il n'est jamais commite dans le depot."
    );
  }
  const dbPath = env.COMPTAL_DB_PATH ?? '';
  if (!dbPath) {
    throw new Error('COMPTAL_DB_PATH manquant : chemin du fichier SQLite du profil Comptal2.1.');
  }
  const portRaw = env.COMPTAL_AGENT_PORT ?? String(DEFAULT_PORT);
  const port = Number.parseInt(portRaw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`COMPTAL_AGENT_PORT invalide : ${portRaw}`);
  }
  // Ecoute locale uniquement : jamais 0.0.0.0, l'API pilote des donnees personnelles.
  return { token, dbPath, port, host: '127.0.0.1' };
}
