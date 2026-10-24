import type { NextConfig } from "next";

// O site público (public/site.html, gerado por scripts/montar-site.mjs) abre na raiz de todo
// endereço, menos em app.plist.com.br, onde a raiz é o sistema. O sistema continua em /canais.
// Em plist.com.br (e www) só o site fica; o resto vai para app.plist.com.br, para o login e o
// cookie da sessão ficarem sempre no mesmo endereço do sistema (APP_URL).
const SITE = "(www\\.)?plist\\.com\\.br";

const config: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:caminho((?!site\\.html$|plist-[\\w-]+\\.svg$).+)",
        has: [{ type: "host", value: SITE }],
        destination: "https://app.plist.com.br/:caminho",
        permanent: false,
      },
    ];
  },
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
