/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Origin of the API, e.g. `https://api.example.com`. Left empty in dev and in the
   * Docker image, where the API is served from the same origin (via the Vite proxy
   * and the reverse proxy respectively), so no CORS-only code path exists.
   */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
