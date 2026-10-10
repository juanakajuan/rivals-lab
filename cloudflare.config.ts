import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "rivals-lab",
    compatibilityDate: "2026-09-30",
    workersDev: true,
    domains: ["rivalslab.dev"],
    observability: {
      enabled: true,
      traces: { enabled: true, headSamplingRate: 0.01 },
    },
    assets: {
      notFoundHandling: "single-page-application",
    },
  },
});
