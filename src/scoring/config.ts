// Tous les seuils, pondérations et hypothèses des notes et estimations.
// Modifier ici suffit : aucune autre valeur n'est codée en dur ailleurs.

export const SCORING = {
  // Seuils de la note A–G (score strictement supérieur au seuil), identiques à EcoIndex.
  gradeThresholds: [
    ['A', 80],
    ['B', 70],
    ['C', 55],
    ['D', 40],
    ['E', 25],
    ['F', 10],
    ['G', 0],
  ] as const,

  // Visibilité Google = moyenne pondérée SEO / Performance.
  visibilityWeights: { seo: 1, performance: 1 },

  // Note globale = moyenne pondérée des trois jauges.
  overallWeights: { speed: 1, visibility: 1, planet: 1 },

  // Couleur d'une jauge 0–100 : >= good → vert, >= medium → orange, sinon rouge.
  colorThresholds: { good: 75, medium: 50 },

  // Critères Core Web Vitals « bons » publiés par Google (web.dev/vitals).
  coreWebVitals: { lcpMs: 2500, cls: 0.1, tbtMs: 200 },
} as const;

export const ESTIMATES = {
  // Hausse relative de la probabilité de rebond selon le temps de chargement mobile,
  // par rapport à 1 s. Source : Google / SOASTA Research, 2017
  // (« Find out how you stack up to new industry benchmarks for mobile page speed »).
  bounceCurve: [
    [1, 0],
    [3, 0.32],
    [5, 0.9],
    [6, 1.06],
    [10, 1.23],
  ] as const,

  // Site de référence considéré comme rapide (seuil « bon » du LCP).
  referenceSeconds: 2.5,

  // Taux de rebond de base d'un site rapide (hypothèse prudente, fourchette basse/haute).
  // Multiplié par la hausse relative ci-dessus pour obtenir une part de visiteurs perdus.
  baseBounce: { low: 0.15, high: 0.25 },

  // En dessous de ce pourcentage de visiteurs perdus, on affiche un message positif.
  negligibleShare: 0.02,

  // Hypothèse affichée quand le nombre de visiteurs est inconnu.
  defaultMonthlyVisits: 1000,

  // Voiture thermique moyenne : 218 gCO₂e/km. Source : ADEME, Impact CO₂ (impactco2.fr).
  carGramsPerKm: 218,
} as const;
