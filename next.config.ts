import type { NextConfig } from "next";

// O site público (public/site.html, gerado por scripts/montar-site.mjs) abre na raiz de todo
// endereço, menos em app.plist.com.br, onde a raiz é o sistema. O sistema continua em /canais.
const config: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/",
          missing: [{ type: "host", value: "app\\.plist\\.com\\.br" }],
          destination: "/site.html",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default config;
