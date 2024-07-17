import { defineConfig } from 'vitest/config';
import { config as dotenvConfig } from "dotenv";

export default defineConfig({
  test: {
    env: {
      ...dotenvConfig({ path: "./.env.test" }).parsed,
    }
  },
});
