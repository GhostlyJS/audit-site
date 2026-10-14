import { config } from '../config.js';
import { ESTIMATES, SCORING } from '../scoring/config.js';
import { computeGrades, colorFor, gradeColor } from '../scoring/grades.js';
import { coreWebVitals, estimateCo2, estimateLostVisitors, seoProblemCount } from '../scoring/estimates.js';
import { formatSeconds, topOwnerIssues } from '../scoring/phrases.js';
import type { AnalysisResult, AuditItem } from '../analyze/types.js';
import type { ReportRow, LeadRow } from '../db.js';
import { HONEYPOT_FIELD } from '../security/antispam.js';
import { dateFr, html, lhMarkdown, num, num1, pct, raw, type Safe } from './html.js';

// ---------- Accueil ----------

export function homePage(opts: { error?: string; url?: string; visits?: string }) {
  return html`
<h1>Votre site vous fait-il perdre des clients&nbsp;?</h1>
<p class="lead">Tapez l’adresse de votre site. En moins d’une minute, vous saurez s’il est assez rapide, s’il plaît à Google, et ce qu’il vous coûte. Gratuit, sans inscription.</p>
${opts.error ? html`<p class="error" role="alert">${opts.error}</p>` : ''}
<form class="analyse card" method="post" action="/analyser">
  <div>
    <label for="url">Adresse de votre site</label>
    <input id="url" name="url" type="text" inputmode="url" autocomplete="url" required placeholder="monentreprise.fr" value="${opts.url ?? ''}">
  </div>
  <div>
    <label for="visits">Nombre de visiteurs par mois, environ <span class="hint">(facultatif)</span></label>
    <input id="visits" name="visits" type="number" min="1" max="100000000" inputmode="numeric" placeholder="ex. 2000" value="${opts.visits ?? ''}" aria-describedby="visits-hint">
    <span id="visits-hint" class="hint">Vous ne savez pas&nbsp;? Laissez vide, nous afficherons un pourcentage.</span>
  </div>
  <button class="btn" type="submit">Analyser mon site</button>
</form>
<h2>Ce que vous allez découvrir</h2>
<ul>
  <li><strong>Combien de visiteurs</strong> repartent parce que votre site est trop lent.</li>
  <li><strong>Ce qui gêne votre référencement</strong> sur Google.</li>
  <li><strong>L’impact de votre site sur la planète</strong>, traduit en kilomètres en voiture.</li>
  <li>Un <strong>rapport technique</strong> à transmettre à votre prestataire.</li>
</ul>
<p class="muted small">Mesures réalisées avec des outils reconnus&nbsp;: Google Lighthouse et la méthode EcoIndex. <a href="/methode">Comment c’est calculé ?</a></p>`;
}

// ---------- Attente ----------

export function waitingPage(r: ReportRow, position: number) {
  return html`
<div style="margin-top:2rem" class="spinner" aria-hidden="true"></div>
<h1>Analyse de votre site en cours…</h1>
<p class="lead">${r.url}</p>
<p id="queue" aria-live="polite">${queueText(position)}</p>
<p>Cela prend en général 20 à 60 secondes. Pendant ce temps, nous&nbsp;:</p>
<ol class="steps">
  <li>ouvrons votre page comme le ferait un téléphone en 4G&nbsp;;</li>
  <li>mesurons le temps qu’elle met à s’afficher (méthode Google Lighthouse)&nbsp;;</li>
  <li>vérifions ce que Google voit de votre page&nbsp;;</li>
  <li>calculons son impact sur la planète (méthode EcoIndex).</li>
</ol>
<p class="muted small">Vous pouvez garder cette page ouverte : le résultat s’affichera tout seul.</p>
<noscript><meta http-equiv="refresh" content="8"></noscript>`;
}

export function queueText(position: number): string {
  if (position <= 0) return 'Votre analyse est en cours.';
  return position === 1
    ? '1 analyse avant la vôtre.'
    : `${position} analyses avant la vôtre.`;
}

export const waitingScript = (id: string) => `
(function(){var q=document.getElementById('queue');
function poll(){fetch('/rapport/${id}/statut',{cache:'no-store'}).then(function(r){return r.json()}).then(function(s){
if(s.status==='done'||s.status==='error'){location.reload();return}
if(q&&s.text)q.textContent=s.text;setTimeout(poll,3000)}).catch(function(){setTimeout(poll,6000)})}
setTimeout(poll,3000)})();`;

// ---------- Erreur d'analyse ----------

export function analysisErrorPage(r: ReportRow) {
  const code = r.error ?? '';
  let msg = 'Une erreur imprévue s’est produite pendant l’analyse.';
  if (code === 'TIMEOUT') msg = `Votre site a mis trop de temps à répondre (plus de ${config.queue.timeoutSec} secondes). C’est en soi un signal inquiétant : vos visiteurs risquent aussi d’abandonner.`;
  else if (code === 'BOT_PROTECTION') msg = 'Votre site est protégé par un système anti-robots qui a bloqué notre analyse. Nous ne pouvons donc pas le mesurer de façon fiable. Votre prestataire peut le tester avec PageSpeed Insights de Google.';
  else if (/DNS|NAME_NOT_RESOLVED/.test(code)) msg = 'Ce site est introuvable. Vérifiez l’adresse.';
  else if (/DOCUMENT_REQUEST|CONNECTION|PROTOCOL|CERT|SSL/.test(code)) msg = 'Impossible d’ouvrir votre site. Il est peut-être hors ligne, protégé, ou son certificat de sécurité pose problème.';
  else if (/NO_FCP|NO_LCP/.test(code)) msg = 'Votre page ne s’est jamais affichée pendant l’analyse (page blanche ou bloquée).';
  else if (/ERRORED_REQUIRED|STATUS_CODE/.test(code)) msg = 'Votre site a renvoyé une page d’erreur.';
  return html`
<h1>L’analyse n’a pas pu aboutir</h1>
<p class="lead">${r.url}</p>
<p class="notice">${msg}</p>
${retryForm(r, 'Réessayer')}
<p><a href="/">Analyser une autre adresse</a></p>`;
}

function retryForm(r: ReportRow, label: string) {
  return html`<form method="post" action="/analyser" class="noprint" style="display:inline">
<input type="hidden" name="url" value="${r.url}"><input type="hidden" name="visits" value="${r.monthly_visits ?? ''}">
<input type="hidden" name="force" value="1"><button class="btn secondary small" type="submit">${label}</button></form>`;
}

// ---------- Résultat patron ----------

export function resultPage(r: ReportRow, res: AnalysisResult, technicalUrl: string) {
  const g = computeGrades(res.performance, res.seo, res.ecoindex.score);
  const lost = estimateLostVisitors(res.metrics.lcpMs, r.monthly_visits);
  const cwv = coreWebVitals(res.metrics.lcpMs, res.metrics.cls, res.metrics.tbtMs);
  const seoCount = seoProblemCount(res.seoFailures.length, cwv);
  const co2 = estimateCo2(res.ecoindex.ghgGrams, r.monthly_visits);
  const issues = topOwnerIssues(res.opportunities, res.seoFailures);
  const ageH = (Date.now() - res.analyzedAt) / 3600_000;

  const headline =
    g.overallGrade <= 'B' && lost.fast
      ? 'Votre site est en bonne forme'
      : !lost.fast || g.overallGrade >= 'E'
        ? 'Votre site vous fait perdre des clients'
        : 'Votre site peut mieux faire';

  const lostBlock = lost.fast
    ? html`<span class="big" style="color:var(--good)">Rapide&nbsp;✓</span>
       <span class="what">Votre page s’affiche vite</span><p class="small muted">Vous ne perdez pas de visiteurs à cause de la lenteur.</p>`
    : lost.visitsLow !== null
      ? html`<span class="big" style="color:var(--bad)">≈ ${num(lost.visitsLow)} à ${num(lost.visitsHigh!)}</span>
         <span class="what">visiteurs perdus par mois</span><p class="small muted">Estimation&nbsp;: ils repartent avant que votre page s’affiche (${formatSeconds(res.metrics.lcpMs)} sur mobile).</p>`
      : html`<span class="big" style="color:var(--bad)">≈ ${pct(lost.shareLow)} à ${pct(lost.shareHigh)}</span>
         <span class="what">de vos visiteurs repartent</span><p class="small muted">Estimation&nbsp;: avant d’avoir vu votre page, qui met ${formatSeconds(res.metrics.lcpMs)} à s’afficher sur mobile.</p>`;

  const googleBlock = html`<span class="big" style="color:var(${seoCount ? '--bad' : '--good'})">${seoCount === 0 ? 'Aucun problème' : seoCount === 1 ? '1 problème' : `${seoCount} problèmes`}</span>
    <span class="what">${seoCount === 0 ? 'détecté sur votre référencement' : 'qui pénalisent votre référencement Google'}</span>
    <p class="small muted">${cwv.allOk ? 'Votre page passe les critères de vitesse de Google.' : 'Votre page ne passe pas les critères de vitesse de Google.'}</p>`;

  const co2Block = html`<span class="big">≈ ${num(Math.max(1, co2.carKm))} km</span>
    <span class="what">en voiture&nbsp;: le CO₂ émis par votre page en un an</span>
    <p class="small muted">≈ ${num1(co2.kgPerYear)} kg de CO₂, ${co2.assumed ? html`<strong>pour ${num(co2.monthlyVisits)} visites par mois</strong> (hypothèse)` : `pour ${num(co2.monthlyVisits)} visites par mois`}.</p>`;

  const shareUrl = technicalUrl;
  const mailSubject = `Rapport technique de notre site ${new URL(res.finalUrl).hostname}`;
  const mailBody = `Bonjour,\n\nJ’ai fait analyser notre site. Voici le rapport technique détaillé avec les points à corriger :\n${shareUrl}\n\nPouvez-vous me dire ce que vous pouvez faire et dans quels délais ?\n\nMerci.`;
  const mailto = `mailto:?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`;

  return html`
<p class="muted small" style="margin-top:1.5rem">Analyse de <strong>${res.finalUrl}</strong> · ${dateFr(res.analyzedAt)}
${ageH >= 1 ? html` · ${retryForm(r, 'Relancer l’analyse')}` : ''}</p>
<h1>${headline}</h1>

<h2>Ce que ça vous coûte</h2>
<div class="costs">
  <div class="card cost">${lostBlock}</div>
  <div class="card cost">${googleBlock}</div>
  <div class="card cost">${co2Block}</div>
</div>
<p class="small"><a href="/methode">Comment c’est calculé ?</a> Ces chiffres sont des estimations prudentes, pas des certitudes.</p>

<h2>Le bulletin de notes de votre site</h2>
<div class="card report">
  <div><div class="grade ${gradeColor(g.overallGrade)}" role="img" aria-label="Note globale ${g.overallGrade}">${g.overallGrade}</div>
  <p class="small muted" style="text-align:center;margin:.4rem 0 0">Note globale<br>(de A à G)</p></div>
  <div>
    ${gauge('Vitesse', g.speed)}
    ${gauge('Visibilité Google', g.visibility)}
    ${gauge('Impact planète', g.planet)}
  </div>
</div>

${issues.length ? html`<h2>Ce qui vous coûte le plus</h2>
<ul class="issues">${issues.map((i) => html`<li>${i.text}</li>`)}</ul>` : ''}

<div class="actions">
  <a class="btn" href="/contact?rapport=${r.id}">${lost.fast && g.overallGrade <= 'B' ? 'Faire encore mieux avec un expert' : 'Récupérer ces clients : faire corriger par un expert'}</a>
  <details class="share card">
    <summary class="btn secondary">Envoyer à mon prestataire</summary>
    <p class="small">Votre prestataire trouvera dans ce rapport technique tout ce qu’il faut corriger.</p>
    <div class="copy"><input type="text" readonly value="${shareUrl}" id="share" aria-label="Lien du rapport technique">
    <button class="btn small" type="button" id="copy">Copier</button></div>
    <p><a class="btn secondary small" href="${mailto}">Écrire un email</a> <a class="small" href="${technicalUrl}">Voir le rapport technique</a></p>
  </details>
</div>`;
}

function gauge(label: string, score: number) {
  const c = colorFor(score);
  const word = c === 'good' ? 'Bien' : c === 'medium' ? 'Moyen' : 'Mauvais';
  return html`<div class="gauge ${c}"><div class="row"><span>${label}</span><span><span class="tag ${c}">${word}</span> ${score}/100</span></div>
<div class="bar" role="img" aria-label="${label} : ${score} sur 100"><span style="width:${Math.max(2, score)}%"></span></div></div>`;
}

export const copyScript = `
(function(){var b=document.getElementById('copy'),i=document.getElementById('share');if(!b||!i)return;
b.addEventListener('click',function(){i.select();(navigator.clipboard?navigator.clipboard.writeText(i.value):Promise.reject())
.catch(function(){document.execCommand('copy')}).finally(function(){b.textContent='Copié ✓'})})})();`;

// ---------- Rapport technique ----------

export function technicalPage(r: ReportRow, res: AnalysisResult, ownerUrl: string) {
  const g = computeGrades(res.performance, res.seo, res.ecoindex.score);
  const cwv = coreWebVitals(res.metrics.lcpMs, res.metrics.cls, res.metrics.tbtMs);
  const t = SCORING.coreWebVitals;
  const ok = (b: boolean) => html`<span class="tag ${b ? 'good' : 'bad'}">${b ? 'OK' : 'À corriger'}</span>`;
  return html`
<h1>Rapport technique</h1>
<p class="lead">Destiné au prestataire web. Mesures de laboratoire, une seule page analysée.</p>
<table>
<tr><th>Page analysée</th><td>${res.requestedUrl}${res.finalUrl !== res.requestedUrl ? html`<br><span class="small muted">→ ${res.finalUrl} (après redirection)</span>` : ''}</td></tr>
<tr><th>Date</th><td>${dateFr(res.analyzedAt)}</td></tr>
<tr><th>Outils</th><td>Lighthouse ${res.lighthouseVersion} (mobile, throttling simulé par défaut) · EcoIndex (formule publique, Chromium 1920×1080, cache désactivé)</td></tr>
</table>

<h2>Scores</h2>
<table>
<tr><th>Performance Lighthouse</th><td>${res.performance}/100</td></tr>
<tr><th>SEO Lighthouse</th><td>${res.seo}/100</td></tr>
<tr><th>EcoIndex</th><td>${num1(res.ecoindex.score)}/100 · note ${res.ecoindex.grade}</td></tr>
<tr><th>Note globale de l’outil</th><td>${g.overallGrade} (${g.overall}/100 = moyenne Vitesse ${g.speed}, Visibilité ${g.visibility}, Planète ${g.planet})</td></tr>
</table>

<h2>Core Web Vitals (laboratoire)</h2>
<table>
<tr><th>Métrique</th><th>Valeur</th><th>Seuil « bon »</th><th></th></tr>
<tr><td>LCP (Largest Contentful Paint)</td><td>${formatSeconds(res.metrics.lcpMs)}</td><td>≤ ${formatSeconds(t.lcpMs)}</td><td>${ok(cwv.lcpOk)}</td></tr>
<tr><td>CLS (Cumulative Layout Shift)</td><td>${res.metrics.cls}</td><td>≤ ${t.cls}</td><td>${ok(cwv.clsOk)}</td></tr>
<tr><td>TBT (Total Blocking Time, indicateur de l’INP)</td><td>${num(res.metrics.tbtMs)} ms</td><td>≤ ${t.tbtMs} ms</td><td>${ok(cwv.tbtOk)}</td></tr>
<tr><td>FCP (First Contentful Paint)</td><td>${formatSeconds(res.metrics.fcpMs)}</td><td>–</td><td></td></tr>
<tr><td>Speed Index</td><td>${formatSeconds(res.metrics.siMs)}</td><td>–</td><td></td></tr>
</table>

<h2>Sobriété</h2>
<table>
<tr><th>Poids de la page (transféré)</th><td>${num(res.ecoindex.sizeKb)} Ko</td></tr>
<tr><th>Nombre de requêtes</th><td>${num(res.ecoindex.requests)}</td></tr>
<tr><th>Éléments du DOM</th><td>${num(res.ecoindex.domElements)}</td></tr>
<tr><th>Gaz à effet de serre</th><td>${num1(res.ecoindex.ghgGrams)} gCO₂e par page vue</td></tr>
<tr><th>Eau</th><td>${num1(res.ecoindex.waterCl)} cl par page vue</td></tr>
<tr><th>Hébergement vert</th><td>${res.greenHosting === null ? 'Information indisponible' : res.greenHosting.green ? html`Oui${res.greenHosting.hostedBy ? html` (${res.greenHosting.hostedBy})` : ''}` : 'Non déclaré auprès de The Green Web Foundation'}</td></tr>
</table>

<h2>Opportunités d’amélioration de la performance</h2>
${res.opportunities.length ? res.opportunities.map(oppBlock) : html`<p>Aucune opportunité significative détectée.</p>`}

<h2>Audits SEO en échec</h2>
${res.seoFailures.length ? res.seoFailures.map(oppBlock) : html`<p>Aucun audit SEO en échec.</p>`}

${res.blockedHosts.length ? html`<h2>Ressources non chargées</h2><p class="small">Pour des raisons de sécurité, les requêtes vers ces hôtes non publics ont été bloquées pendant l’analyse : ${res.blockedHosts.join(', ')}.</p>` : ''}

<p class="noprint" style="margin-top:2rem"><button class="btn secondary small" type="button" id="print">Imprimer / enregistrer en PDF</button>
<a class="small" href="${ownerUrl}">Vue simplifiée</a></p>
<p class="small muted">Besoin d’aide pour corriger ? <a href="/contact?rapport=${r.id}">Contactez ${config.brand.ownerName}</a>.</p>`;
}

export const printScript = `document.getElementById('print').addEventListener('click',function(){window.print()});`;

function oppBlock(a: AuditItem): Safe {
  const gains = [
    a.savingsMs >= 50 ? `gain estimé ≈ ${formatSeconds(a.savingsMs)}` : '',
    a.savingsBytes >= 1024 ? `≈ ${num(Math.round(a.savingsBytes / 1024))} Ko économisables` : '',
  ].filter(Boolean);
  return html`<div class="opp"><h3>${a.title}</h3>
${a.displayValue || gains.length ? html`<p class="small"><strong>${[a.displayValue, ...gains].filter(Boolean).join(' · ')}</strong></p>` : ''}
<p class="small">${lhMarkdown(a.description)}</p>
${a.urls.length ? html`<ul>${a.urls.map((u) => html`<li>${u}</li>`)}</ul>` : ''}</div>`;
}

// ---------- Contact ----------

export interface ContactValues {
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
}

export function contactPage(o: { report?: ReportRow; values: ContactValues; errors: string[]; token: string }) {
  const v = o.values;
  return html`
<h1>${o.report ? 'Faire corriger votre site par un expert' : 'Me contacter'}</h1>
<p class="lead">${o.report ? html`Laissez vos coordonnées : ${config.brand.ownerName} vous recontacte pour vous expliquer ce qui peut être corrigé sur <strong>${o.report.url}</strong>, et combien cela coûterait. Sans engagement.` : 'Une question, un projet ? Laissez vos coordonnées, je vous réponds rapidement.'}</p>
${o.errors.length ? html`<div class="error" role="alert"><ul>${o.errors.map((e) => html`<li>${e}</li>`)}</ul></div>` : ''}
<form class="analyse card" method="post" action="/contact">
  <input type="hidden" name="rapport" value="${o.report?.id ?? ''}">
  <input type="hidden" name="jeton" value="${o.token}">
  <div class="hp" aria-hidden="true"><label for="${HONEYPOT_FIELD}">Ne pas remplir ce champ</label>
  <input id="${HONEYPOT_FIELD}" name="${HONEYPOT_FIELD}" type="text" tabindex="-1" autocomplete="off"></div>
  <div><label for="name">Votre nom</label><input id="name" name="name" type="text" maxlength="100" autocomplete="name" value="${v.name ?? ''}"></div>
  <div><label for="email">Votre email <span class="hint">(obligatoire)</span></label><input id="email" name="email" type="email" maxlength="200" required autocomplete="email" value="${v.email ?? ''}"></div>
  <div><label for="phone">Téléphone <span class="hint">(facultatif)</span></label><input id="phone" name="phone" type="tel" maxlength="30" autocomplete="tel" value="${v.phone ?? ''}"></div>
  <div><label for="message">Message <span class="hint">(facultatif)</span></label><textarea id="message" name="message" rows="4" maxlength="3000">${v.message ?? ''}</textarea></div>
  <label class="check"><input type="checkbox" name="consent" value="1" required>
  <span>J’accepte que mes coordonnées soient utilisées pour être recontacté au sujet de ma demande. <a href="/confidentialite">Politique de confidentialité</a></span></label>
  <button class="btn" type="submit">Être recontacté</button>
</form>`;
}

export function thanksPage(reportId?: string) {
  return html`<h1>Merci, c’est noté&nbsp;!</h1>
<p class="lead">${config.brand.ownerName} vous recontacte rapidement, en général sous 48&nbsp;heures ouvrées.</p>
${reportId ? html`<p><a href="/rapport/${reportId}">Revenir à votre résultat</a></p>` : html`<p><a href="/">Retour à l’accueil</a></p>`}`;
}

// ---------- Pages annexes ----------

export function methodPage() {
  const e = ESTIMATES;
  return html`
<h1>Comment c’est calculé&nbsp;?</h1>
<p class="lead">Nous nous appuyons sur des mesures reconnues, et nous indiquons clairement ce qui est une estimation.</p>
<h2>Ce qui est mesuré</h2>
<p>Seule la page dont vous avez donné l’adresse est analysée (pas tout le site), en une seule visite, depuis un serveur en Europe.</p>
<ul>
<li><strong>Google Lighthouse</strong> (outil officiel de Google, celui de PageSpeed Insights), en mode mobile avec une connexion 4G simulée&nbsp;: note de performance, note SEO, temps d’affichage.</li>
<li><strong>EcoIndex</strong> (méthode publique du collectif GreenIT.fr, <a href="https://www.ecoindex.fr/comment-ca-marche/">ecoindex.fr</a>)&nbsp;: à partir du poids de la page, du nombre de fichiers chargés et de sa complexité, une note de 0 à 100 et une estimation des gaz à effet de serre et de l’eau consommés par page vue. Nous avons réimplémenté la formule publiée.</li>
<li><strong>Hébergement vert</strong>&nbsp;: base de données de <a href="https://www.thegreenwebfoundation.org/">The Green Web Foundation</a>.</li>
</ul>
<h2>Les notes</h2>
<ul>
<li><strong>Vitesse</strong> = note de performance Lighthouse.</li>
<li><strong>Visibilité Google</strong> = moyenne de la note SEO Lighthouse et de la note de performance (Google tient compte de la vitesse).</li>
<li><strong>Impact planète</strong> = note EcoIndex.</li>
<li><strong>Note globale</strong> = moyenne des trois, convertie en lettre avec les seuils EcoIndex&nbsp;: A au-dessus de 80, B au-dessus de 70, C de 55, D de 40, E de 25, F de 10, sinon G.</li>
</ul>
<h2>Les estimations</h2>
<h3>Visiteurs perdus</h3>
<p>Une étude Google / SOASTA (2017) montre que la probabilité qu’un visiteur mobile reparte augmente de 32&nbsp;% quand la page passe de 1 à 3 secondes, de 90&nbsp;% à 5 secondes et de 123&nbsp;% à 10 secondes. Nous comparons votre temps d’affichage (l’affichage de l’élément principal, « LCP ») à celui d’un site rapide (${num1(e.referenceSeconds)}&nbsp;s), et appliquons cette hausse à un taux de départ de base prudent de ${pct(e.baseBounce.low)} à ${pct(e.baseBounce.high)}. D’où une fourchette.</p>
<p><strong>Limites</strong>&nbsp;: c’est une moyenne tous secteurs confondus, mesurée en laboratoire sur une connexion 4G simulée. Vos visiteurs réels peuvent être plus ou moins patients. Nous plafonnons au-delà de 10&nbsp;secondes.</p>
<h3>Visibilité Google</h3>
<p>Personne ne peut calculer honnêtement combien de places vous perdez sur Google. Nous comptons donc des problèmes vérifiables&nbsp;: les contrôles SEO de Lighthouse en échec, plus les critères de vitesse de Google (Core Web Vitals) non atteints&nbsp;: affichage en moins de 2,5&nbsp;s, page stable, réactivité.</p>
<h3>CO₂ par an</h3>
<p>Émissions par page vue selon EcoIndex × visiteurs par mois × 12. Si vous n’avez pas indiqué de nombre de visiteurs, nous prenons ${num(e.defaultMonthlyVisits)} visites par mois, et l’indiquons. Conversion en kilomètres avec ${e.carGramsPerKm}&nbsp;g de CO₂ par km pour une voiture thermique moyenne (source&nbsp;: ADEME, <a href="https://impactco2.fr/">impactco2.fr</a>).</p>
<p><strong>Limites</strong>&nbsp;: les émissions d’un site sont difficiles à mesurer précisément&nbsp;; EcoIndex donne un ordre de grandeur, utile pour comparer et progresser.</p>
<h2>Vos données</h2>
<p>Les résultats d’analyse sont conservés ${config.retentionDays}&nbsp;jours, puis supprimés automatiquement. Aucun traqueur, aucun cookie. <a href="/confidentialite">Politique de confidentialité</a>.</p>`;
}

export function legalPage() {
  return html`<h1>Mentions légales</h1>
<p class="notice"><strong>[À COMPLÉTER]</strong> Remplacez les éléments entre crochets.</p>
<h2>Éditeur</h2>
<p>[Nom ou raison sociale] — [Statut : entrepreneur individuel / société, capital]<br>[Adresse]<br>SIRET : [numéro]<br>Email : [adresse email]<br>Directeur de la publication : [nom]</p>
<h2>Hébergement</h2>
<p>[Nom de l’hébergeur du serveur] — [Adresse] — [Téléphone]</p>
<h2>Propriété intellectuelle</h2>
<p>[Texte à compléter]</p>`;
}

export function privacyPage() {
  return html`<h1>Politique de confidentialité</h1>
<p class="notice"><strong>[À COMPLÉTER / À FAIRE VALIDER]</strong> Ce texte décrit le fonctionnement réel de l’outil ; complétez les éléments entre crochets.</p>
<h2>Responsable du traitement</h2><p>[Nom], [adresse], [email].</p>
<h2>Données collectées</h2>
<ul>
<li><strong>Analyse d’un site</strong>&nbsp;: l’adresse du site analysé et, si vous l’indiquez, votre nombre de visiteurs mensuels. Conservées ${config.retentionDays}&nbsp;jours puis supprimées automatiquement (sauf si vous avez fait une demande de contact liée à cette analyse).</li>
<li><strong>Demande de contact</strong>&nbsp;: nom, email, téléphone et message que vous saisissez, ainsi que la date de votre consentement. Finalité&nbsp;: vous recontacter au sujet de votre demande. Base légale&nbsp;: votre consentement. Conservation&nbsp;: [durée, ex. 3 ans après le dernier contact].</li>
<li>Votre adresse IP est utilisée temporairement, en mémoire, pour limiter les abus (pas d’enregistrement en base).</li>
</ul>
<h2>Cookies et traqueurs</h2><p>Aucun cookie, aucun outil de statistiques, aucun service tiers n’est chargé dans votre navigateur.</p>
<h2>Destinataires</h2><p>Vos données ne sont ni vendues ni partagées. Les notifications passent par [fournisseur email]. Pour vérifier l’hébergement vert, seul le nom de domaine analysé est envoyé à The Green Web Foundation.</p>
<h2>Vos droits</h2><p>Accès, rectification, effacement, opposition&nbsp;: écrivez à [email]. Vous pouvez saisir la CNIL (cnil.fr).</p>`;
}

export function simplePage(title: string, text: string) {
  return html`<h1>${title}</h1><p class="lead">${text}</p><p><a href="/">Retour à l’accueil</a></p>`;
}

// ---------- Administration ----------

export function adminPage(leads: (LeadRow & { url: string | null })[]) {
  return html`<h1>Demandes de contact</h1>
<p>${leads.length} demande(s). <a href="/admin/leads.csv">Exporter en CSV</a></p>
<div style="overflow-x:auto"><table>
<tr><th>Date</th><th>Nom</th><th>Email</th><th>Téléphone</th><th>Message</th><th>Site</th><th>Email envoyé</th></tr>
${leads.map((l) => html`<tr><td>${dateFr(l.created_at)}</td><td>${l.name}</td><td><a href="mailto:${l.email}">${l.email}</a></td><td>${l.phone ?? ''}</td>
<td>${l.message ?? ''}</td><td>${l.report_id ? html`<a href="/rapport/${l.report_id}">${l.url ?? 'rapport'}</a> · <a href="/rapport/${l.report_id}/technique">technique</a>` : '–'}</td><td>${l.notified ? 'oui' : 'non'}</td></tr>`)}
</table></div>`;
}
