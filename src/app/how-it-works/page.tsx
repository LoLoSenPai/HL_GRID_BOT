import type { Metadata } from "next";
import { AlertTriangle, Calculator, Gauge, Layers3, ShieldCheck, Workflow } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Guide | HL Grid Bot",
  description: "Mecanique du grid bot, formules de sizing et garde-fous Propr.",
};

const operatingModel = [
  {
    title: "Compte d'exécution",
    body: "Le bot envoie les ordres uniquement sur le challenge Propr actif. Hyperliquid sert de référence marché pour les prix, les bougies et le contexte de funding.",
  },
  {
    title: "Structure du grid perp",
    body: "Le capital saisi correspond à la marge. Le notional effectif est cette marge multipliée par le levier, puis répartie sur les niveaux de la grille.",
  },
  {
    title: "Ordres et clôtures",
    body: "Chaque ordre reçoit un intent id unique. Les ordres de clôture sont reduce-only pour réduire la position existante sans ouvrir accidentellement le sens opposé.",
  },
  {
    title: "Suivi local",
    body: "Propr fusionne les positions par actif et par sens. L'app suit donc localement ses ordres, fills, frais et cycles pour estimer la performance par bot.",
  },
];

const formulas = [
  {
    title: "Formule de risque",
    body: "La marge recommandée suit la règle du tradeur: Capital_grid = R / D. R vaut 1% du capital du challenge. D est la distance entre le prix moyen de la grid et le stop d'invalidation.",
    detail: "Pavg = prix moyen de la grid. Le stop est placé au-delà de la grille, pas directement sur la borne basse ou haute, pour laisser un peu de débordement.",
  },
  {
    title: "Formule de spacing",
    body: "Le nombre de grilles recommandé vient de spacing_min = max(4 x frais round-trip, 0.5 x ATR local / Pavg). Ensuite N = Range% / spacing%.",
    detail: "Le multiplicateur de frais sert à éviter des grilles trop serrées où les frais mangent le profit de cycle.",
  },
  {
    title: "Worst case au stop",
    body: "SL risk + buffer estime la perte théorique si la position grossit contre le setup jusqu'au stop, avec un buffer au-dessus de la perte brute.",
    detail: "Si ce montant dépasse le budget recommandé, l'app prévient mais ne bloque plus automatiquement. Les stops daily et le suivi actif restent les garde-fous finaux.",
  },
];

const safeguards = [
  {
    title: "Daily safety stop",
    body: "L'app utilise un stop journalier interne à 2.75%, avant la limite Propr à 3%. Si le compte approche ce plancher, le worker peut annuler les ordres du bot et fermer l'exposition.",
  },
  {
    title: "Suivi du drawdown",
    body: "Le dashboard et le terminal affichent l'equity Propr, le drawdown utilisé, la marge daily restante et l'avancement vers l'objectif du challenge.",
  },
  {
    title: "Statuts preflight",
    body: "PASS signifie que la config est dans les règles. WARN signifie que le deploy reste possible mais que le risque théorique dépasse la recommandation. BLOCKED est réservé aux vrais blocages.",
  },
  {
    title: "Action d'urgence",
    body: "Le kill switch sert à annuler les ordres Propr et fermer l'exposition ouverte si l'état du compte devient dangereux ou incohérent.",
  },
];

const lifecycle = [
  "Choisir l'actif, le sens, le range, le stop, le take profit, la marge, le levier et le spacing.",
  "Lire le preview: ordres d'entrée, taille d'ordre, notional, profit par cycle et risque worst case.",
  "Appliquer les recommandations de risque ou de spacing si elles collent au modèle du tradeur.",
  "Armer le deploy explicitement, puis envoyer les ordres Propr sur le challenge actif.",
  "Le worker synchronise les fills, replace les niveaux de grid, suit les frais et met à jour les métriques.",
  "Si une règle de sécurité est touchée, le bot doit arrêter d'ajouter du risque et fermer ou annuler selon la logique de stop.",
];

const openQuestions = [
  "Confirmer si le risque accepté de 1% reste la règle par défaut pour tous les challenges et actifs.",
  "Confirmer si le daily stop interne à 2.75% doit être suivi au niveau compte seulement, ou aussi par bot/actif.",
  "Confirmer si les deploys en WARN doivent rester autorisés ou demander une confirmation plus stricte.",
  "Valider si une modification TP/SL doit seulement modifier le bot local, ou aussi remplacer les niveaux Propr live.",
];

export default function HowItWorksPage() {
  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4 lg:p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-normal">Guide du Bot</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Notes de fonctionnement du terminal: logique de grid perp, recommandations de sizing, garde-fous Propr et
          points à challenger avec le tradeur.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard icon={Workflow} title="Modèle d'exécution" items={operatingModel} />
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Layers3 className="size-4 text-primary" />
              Cycle de vie du bot
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-2 text-sm text-muted-foreground">
              {lifecycle.map((item, index) => (
                <li key={item} className="flex gap-3 rounded-md border bg-muted/20 p-3">
                  <span className="metric-mono text-xs text-primary">{index + 1}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard icon={Calculator} title="Recommandations" items={formulas} />
        <SectionCard icon={ShieldCheck} title="Garde-fous" items={safeguards} />
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Gauge className="size-4 text-primary" />
              Lecture du PnL
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground">
            <InfoBlock
              title="Grid profit"
              body="Profit des cycles de grid complétés après association locale des entrées et sorties. C'est la mesure la plus propre pour juger si la grid fonctionne."
            />
            <InfoBlock
              title="uPnL"
              body="Le PnL non réalisé vient de la position Propr fusionnée. Il peut bouger contre le bot même si le profit de grid reste positif."
            />
            <InfoBlock
              title="Frais et funding"
              body="Les frais sont suivis depuis les fills. Le funding est lu depuis l'état Propr quand il est disponible, car il change le résultat réel d'une grid perp."
            />
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-lg border-amber-300/20 bg-amber-300/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="size-4 text-amber-100" />
            Checklist de review tradeur
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-2">
            {openQuestions.map((item) => (
              <div key={item} className="rounded-md border border-amber-300/20 bg-background/50 p-3 text-sm text-muted-foreground">
                {item}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  items,
}: {
  icon: typeof Workflow;
  title: string;
  items: Array<{ title: string; body: string; detail?: string }>;
}) {
  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="size-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {items.map((item) => (
          <InfoBlock key={item.title} title={item.title} body={item.body} detail={item.detail} />
        ))}
      </CardContent>
    </Card>
  );
}

function InfoBlock({ title, body, detail }: { title: string; body: string; detail?: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="text-sm font-medium">{title}</div>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      {detail ? <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}
