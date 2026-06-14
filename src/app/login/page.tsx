import { LockKeyhole } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuthUsername, isAuthConfigured, safeNextPath } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const error = params.error;
  const nextPath = safeNextPath(params.next);
  const configured = isAuthConfigured();
  const username = getAuthUsername() ?? "";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg border bg-muted/40">
            <LockKeyhole className="size-4 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-normal">HL Grid Bot</h1>
            <p className="text-sm text-muted-foreground">Acces protege au terminal Propr.</p>
          </div>
        </div>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-sm">Connexion</CardTitle>
          </CardHeader>
          <CardContent>
            {!configured ? (
              <Alert variant="destructive">
                <AlertTitle>Authentification non configuree</AlertTitle>
                <AlertDescription>
                  Renseigne APP_AUTH_USERNAME, APP_AUTH_PASSWORD et APP_AUTH_SECRET dans l&apos;environnement serveur.
                </AlertDescription>
              </Alert>
            ) : null}

            {error === "invalid" ? (
              <Alert variant="destructive" className="mb-4">
                <AlertTitle>Identifiants invalides</AlertTitle>
                <AlertDescription>Verifie le login et le mot de passe du terminal.</AlertDescription>
              </Alert>
            ) : null}

            <form className="flex flex-col gap-4" action="/api/auth/login" method="post">
              <input type="hidden" name="next" value={nextPath} />
              <div className="grid gap-2">
                <Label htmlFor="username">Utilisateur</Label>
                <Input id="username" name="username" autoComplete="username" defaultValue={username} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Mot de passe</Label>
                <Input id="password" name="password" type="password" autoComplete="current-password" required />
              </div>
              <Button type="submit" disabled={!configured}>
                Se connecter
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
