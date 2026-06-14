/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_STAKE_AND_ADVANCE_ADDRESS?: string;
  readonly VITE_DYNAMIC_ENVIRONMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
