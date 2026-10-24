import Link from "next/link";
import { and, count, eq, max } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { anuncios, conexoesCanal } from "@/db/schema";
import { CANAIS, CANAIS_PRONTOS, CONECTAR, ERROS_ML, ERROS_SHOPEE, type Canal } from "@/lib/canais";
import { exigirConta } from "@/lib/conta";
import { Sincronizar } from "./sincronizar";

export const dynamic = "force-dynamic";
// a sincronização roda nesta página (server action) e pode levar alguns segundos com muitos anúncios
export const maxDuration = 60;
export const metadata = { title: "Inventário · Plist" };

const Logo = ({ canal }: { canal: Canal }) => (
  <span className="plogo" style={{ ["--c" as string]: `var(--c-${CANAIS[canal].cor})` }} aria-hidden="true">
    {CANAIS[canal].sigla}
  </span>
);

const quando = (d: Date | null) =>
  d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : null;

// Página inicial do sistema: traz os anúncios das contas conectadas para um inventário só.
export default async function Inventario({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { ml, ml_erro, shopee, shopee_erro } = await searchParams;
  const { conta } = await exigirConta("/inventario");

  const conexoes = await obterDb()
    .select({
      id: conexoesCanal.id,
      canal: conexoesCanal.canal,
      apelido: conexoesCanal.apelido,
      usuarioExterno: conexoesCanal.usuarioExterno,
      situacao: conexoesCanal.situacao,
      anuncios: count(anuncios.id),
      ultima: max(anuncios.atualizadoEm),
    })
    .from(conexoesCanal)
    .leftJoin(anuncios, eq(anuncios.conexaoId, conexoesCanal.id))
    .where(eq(conexoesCanal.contaId, conta.id))
    .groupBy(conexoesCanal.id);

  const conectados = new Set(conexoes.map((c) => c.canal));
  const disponiveis = (Object.keys(CANAIS) as Canal[]).filter((c) => c !== "venda_direta" && !conectados.has(c));
  const temMl = conexoes.some((c) => c.canal === "mercado_livre" && c.situacao === "ativa");

  return (
    <>
      {ml === "conectado" && <div className="trialbar" style={{ background: "var(--good-soft)", color: "var(--good)" }}>Mercado Livre conectado. Agora traga seus anúncios.</div>}
      {ml_erro && <div className="trialbar bad">{ERROS_ML[ml_erro] ?? `Não deu para conectar o Mercado Livre (${ml_erro}).`}</div>}
      {shopee === "conectado" && <div className="trialbar" style={{ background: "var(--good-soft)", color: "var(--good)" }}>Shopee conectada.</div>}
      {shopee_erro && <div className="trialbar bad">{ERROS_SHOPEE[shopee_erro] ?? `Não deu para conectar a Shopee (${shopee_erro}).`}</div>}

      <div className="inv-hero">
        <svg viewBox="0 0 320 170" role="img" aria-label="Anúncios de vários canais entrando num só inventário">
          <g>
            {(["ml", "shopee", "shein", "amazon"] as const).map((c, i) => (
              <rect key={c} x={32 + i * 72} y={18} width={40} height={40} rx={8} fill={`var(--c-${c})`} opacity={0.9} />
            ))}
          </g>
          <g fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" opacity=".7">
            <path d="M52 62 C52 88 80 96 104 104" />
            <path d="M124 62 V96" />
            <path d="M196 62 V96" />
            <path d="M268 62 C268 88 240 96 216 104" />
            <path d="M100 100 l5 4 -6 3 M120 92 l4 5 4 -5 M192 92 l4 5 4 -5 M220 100 l-5 4 6 3" />
          </g>
          <rect x="88" y="108" width="144" height="46" rx="6" fill="var(--surface)" stroke="var(--line)" strokeWidth="1.5" />
          <rect x="98" y="118" width="40" height="5" rx="2" fill="var(--line)" />
          <rect x="98" y="128" width="56" height="4" rx="2" fill="var(--sunk)" />
          <rect x="98" y="137" width="48" height="4" rx="2" fill="var(--sunk)" />
          <g fill="var(--bg)" stroke="var(--line)" strokeDasharray="3 2">
            <rect x="166" y="117" width="18" height="18" rx="3" />
            <rect x="190" y="117" width="18" height="18" rx="3" />
            <rect x="214" y="117" width="10" height="18" rx="3" />
          </g>
          <rect x="96" y="158" width="128" height="6" rx="3" fill="var(--sunk)" />
        </svg>
        <h1>Seu inventário num lugar só</h1>
        <p>O Plist traz os anúncios das contas conectadas, junta os que são da mesma peça e mantém preço e quantidade iguais em todos os canais.</p>
        {temMl ? (
          <Sincronizar />
        ) : (
          <a className="btn primary" href="/api/canais/mercado-livre/conectar?voltar=/inventario" style={{ textDecoration: "none" }}>
            Conectar Mercado Livre
          </a>
        )}
      </div>

      <div className="inv2">
        <div className="panel">
          <h2 className="ptitle">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--good)" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="m8 12 3 3 5-6" />
            </svg>
            Contas conectadas
          </h2>
          <p className="muted" style={{ fontSize: ".86rem", marginTop: 4 }}>Estas contas mandam os anúncios para o seu inventário.</p>
          {conexoes.length === 0 ? (
            <div className="emptybox">Nenhuma conta conectada ainda.</div>
          ) : (
            conexoes.map((c) => (
              <div className="plat" key={c.id}>
                <Logo canal={c.canal} />
                <div className="nm">
                  <b>{CANAIS[c.canal].nome}</b>
                  <small>
                    {c.apelido ?? c.usuarioExterno} ·{" "}
                    {c.anuncios ? `${c.anuncios} ${c.anuncios === 1 ? "anúncio" : "anúncios"} · atualizado em ${quando(c.ultima)}` : "ainda não sincronizado"}
                  </small>
                </div>
                {c.situacao === "ativa" ? (
                  <span className="pill p-good">Conectada</span>
                ) : (
                  <a className="btn small primary" href={`${CONECTAR[c.canal] ?? "/canais"}?voltar=/inventario`}>Reconectar</a>
                )}
              </div>
            ))
          )}
        </div>
        <div className="panel avail">
          <h2 className="ptitle">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v8M8 12h8" />
            </svg>
            Plataformas disponíveis
          </h2>
          <p className="muted" style={{ fontSize: ".86rem", marginTop: 4 }}>Conecte para trazer mais anúncios para o inventário.</p>
          {disponiveis.map((c) => (
            <div className="plat" key={c}>
              <Logo canal={c} />
              <div className="nm">
                <b>{CANAIS[c].nome}</b>
                <small>{CANAIS[c].descricao}</small>
              </div>
              {CANAIS_PRONTOS.includes(c) ? (
                <a className="btn small primary" href={`${CONECTAR[c]}?voltar=/inventario`}>Conectar</a>
              ) : (
                <span className="pill p-muted">Em breve</span>
              )}
            </div>
          ))}
          <p className="muted" style={{ fontSize: ".8rem", marginTop: 8 }}>
            Gerencie as conexões em <Link href="/canais">Canais</Link>.
          </p>
        </div>
      </div>
    </>
  );
}
