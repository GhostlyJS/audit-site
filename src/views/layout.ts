import { config } from '../config.js';
import { html, raw, type Safe } from './html.js';

const CSS = `
:root{--bg:#fbfbf8;--fg:#1d2320;--muted:#5b645f;--card:#fff;--line:#dfe3dc;--accent:#1f6f4a;--accent-fg:#fff;
--good:#1a7f37;--medium:#9a4a00;--bad:#c62828;--good-bg:#e6f4ea;--medium-bg:#fdf0e1;--bad-bg:#fdecea}
@media (prefers-color-scheme:dark){:root{--bg:#141816;--fg:#e8ece9;--muted:#a3ada7;--card:#1d2320;--line:#333b36;
--accent:#5cc28f;--accent-fg:#0d1a13;--good:#5cc28f;--medium:#f0a04b;--bad:#ff7b72;--good-bg:#1b3326;--medium-bg:#3a2a17;--bad-bg:#3d1d1b}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent)}
main,.wrap{max-width:860px;margin:0 auto;padding:0 16px}
header.top{border-bottom:1px solid var(--line)}
header.top .wrap{display:flex;justify-content:space-between;align-items:center;min-height:56px;gap:12px}
.brand{font-weight:700;text-decoration:none;color:var(--fg)}
h1{font-size:1.9rem;line-height:1.2;margin:1.6rem 0 .6rem}
h2{font-size:1.3rem;margin:2rem 0 .8rem}
.lead{font-size:1.15rem;color:var(--muted);margin-top:0}
.muted{color:var(--muted)}.small{font-size:.88rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px}
form.analyse{display:grid;gap:14px;margin:1.5rem 0}
label{font-weight:600;display:block;margin-bottom:4px}
input[type=text],input[type=url],input[type=email],input[type=tel],input[type=number],textarea{width:100%;font:inherit;
padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg)}
input:focus,textarea:focus,button:focus,a:focus{outline:3px solid var(--accent);outline-offset:2px}
.hint{font-weight:400;color:var(--muted);font-size:.9rem}
.btn{display:inline-block;font:inherit;font-weight:700;padding:13px 22px;border-radius:8px;border:2px solid var(--accent);
background:var(--accent);color:var(--accent-fg);text-decoration:none;cursor:pointer;text-align:center}
.btn.secondary{background:transparent;color:var(--accent)}
.btn.small{padding:7px 14px;font-size:.9rem}
.error{background:var(--bad-bg);color:var(--bad);border-radius:8px;padding:12px 16px;font-weight:600}
.notice{background:var(--medium-bg);border-radius:8px;padding:12px 16px}
.costs{display:grid;gap:12px;grid-template-columns:1fr}
@media (min-width:680px){.costs{grid-template-columns:repeat(3,1fr)}}
.cost .big{font-size:1.9rem;font-weight:800;line-height:1.1;display:block;margin-bottom:6px}
.cost .what{font-weight:600}
.report{display:grid;gap:20px;align-items:center;grid-template-columns:1fr}
@media (min-width:680px){.report{grid-template-columns:auto 1fr}}
.grade{width:112px;height:112px;border-radius:50%;display:flex;align-items:center;justify-content:center;
font-size:3.6rem;font-weight:800;color:#fff;margin:0 auto}
.grade.good{background:var(--good)}.grade.medium{background:var(--medium)}.grade.bad{background:var(--bad)}
@media (prefers-color-scheme:dark){.grade{color:#141816}}
.gauge{margin:10px 0}.gauge .row{display:flex;justify-content:space-between;font-weight:600}
.bar{height:12px;border-radius:6px;background:var(--line);overflow:hidden}
.bar span{display:block;height:100%}
.good .bar span,.bar .good{background:var(--good)}.medium .bar span,.bar .medium{background:var(--medium)}.bad .bar span,.bar .bad{background:var(--bad)}
.tag{font-size:.82rem;font-weight:700;padding:2px 8px;border-radius:99px}
.tag.good{background:var(--good-bg);color:var(--good)}.tag.medium{background:var(--medium-bg);color:var(--medium)}.tag.bad{background:var(--bad-bg);color:var(--bad)}
ul.issues{padding:0;list-style:none}ul.issues li{padding:12px 0 12px 30px;border-bottom:1px solid var(--line);position:relative}
ul.issues li:before{content:"!";position:absolute;left:0;top:12px;width:20px;height:20px;border-radius:50%;background:var(--bad);color:#fff;
font-size:.8rem;font-weight:800;text-align:center;line-height:20px}
.actions{display:grid;gap:12px;margin:24px 0}
@media (min-width:680px){.actions{grid-template-columns:2fr 1fr;align-items:start}}
details.share summary{list-style:none}details.share summary::-webkit-details-marker{display:none}
details.share[open] summary{margin-bottom:12px}
.copy{display:flex;gap:8px}.copy input{font-size:.85rem}
table{width:100%;border-collapse:collapse;font-size:.95rem}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--line);vertical-align:top}
.opp{border-top:1px solid var(--line);padding:14px 0}.opp h3{font-size:1.05rem;margin:0 0 4px}
.opp ul{margin:6px 0;padding-left:20px;font-size:.85rem;word-break:break-all}
code{font-size:.88em;background:var(--line);padding:1px 4px;border-radius:4px}
.steps li{margin:6px 0}
.spinner{width:44px;height:44px;border:5px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:s 1s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.spinner{animation:none}}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.check{display:flex;gap:10px;align-items:flex-start;font-weight:400}.check input{margin-top:6px;width:20px;height:20px}
footer{margin:48px 0 0;padding:24px 0;border-top:1px solid var(--line);font-size:.9rem;color:var(--muted)}
footer nav a{display:inline-block;padding:8px 0;margin-right:16px}
@media print{header.top,footer,.actions,.noprint{display:none!important}body{background:#fff;color:#000;font-size:12pt}
.card{border:1px solid #999}a{color:#000}.opp{break-inside:avoid}}
`;

export interface LayoutOpts {
  title: string;
  body: Safe;
  nonce: string;
  noindex?: boolean;
  script?: string;
  head?: Safe;
}

export function layout(o: LayoutOpts): string {
  const b = config.brand;
  return html`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${o.title} · ${b.name}</title>
<meta name="description" content="Votre site vous fait-il perdre des clients ? Analyse gratuite de la vitesse, du référencement Google et de l’impact écologique de votre site, expliquée simplement.">
${o.noindex ? raw('<meta name="robots" content="noindex">') : ''}
<link rel="icon" href="data:,">
<style>${raw(CSS)}</style>
${o.head ?? ''}
</head>
<body>
<header class="top"><div class="wrap"><a class="brand" href="/">${b.name}</a><a href="/methode" class="small">Comment c’est calculé ?</a></div></header>
<main>
${o.body}
</main>
<footer><div class="wrap">
<p><strong>${b.name}</strong>, par ${b.ownerUrl ? html`<a href="${b.ownerUrl}">${b.ownerName}</a>` : b.ownerName}. ${b.ownerBio}</p>
<p>Cet outil est lui-même conçu pour être sobre : pas de traqueur, pas de cookie, pas de service tiers.</p>
<nav><a href="/contact">Me contacter</a><a href="/methode">Méthode</a><a href="/mentions-legales">Mentions légales</a><a href="/confidentialite">Confidentialité</a></nav>
</div></footer>
${o.script ? html`<script nonce="${o.nonce}">${raw(o.script)}</script>` : ''}
</body>
</html>`.value;
}
