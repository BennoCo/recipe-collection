# Rezeptkasten – Setup (komplett ohne Terminal)

Eigenständige App (unabhängig vom Chat), nutzbar von mehreren Personen auf ihren
eigenen Geräten. Alles wird über Browser-Oberflächen eingerichtet – kein
Terminal, keine Kommandozeile nötig.

## 1. Supabase-Projekt erstellen

1. https://supabase.com → kostenloses Konto/Login
2. "New Project" → Namen vergeben (z. B. `rezeptkasten`) → Region wählen → Passwort setzen → erstellen (dauert ~2 Min.)

## 2. Datenbank einrichten

1. Im Projekt links auf **"SQL Editor"** → **"New query"**
2. Kompletten Inhalt von `supabase/migrations/0001_init.sql` einfügen → **"Run"**

Das legt Tabellen für Rezepte/Bewertungen sowie einen Foto-Speicher an.

## 3. Anthropic-API-Key besorgen (falls noch nicht vorhanden)

1. https://platform.claude.com → Konto erstellen/einloggen
2. "API Keys" → "Create Key" → Key kopieren
3. Etwas Guthaben aufladen (Billing) – bei wöchentlicher Nutzung durch 2 Personen
   bewegen sich die Kosten im Cent-Bereich pro Monat

## 4. Edge Function einrichten (im Browser, wie beim Cloudflare Worker)

1. Im Supabase-Dashboard links auf **"Edge Functions"**
2. **"Deploy a new function"** → **"Via Editor"**
3. Als Namen `format-recipe` eingeben
4. Kompletten Inhalt von `supabase/functions/format-recipe/index.ts` einfügen (vorhandenen Beispielcode ersetzen)
5. **"Deploy"** klicken

Danach den API-Key hinterlegen:

1. Im Dashboard: **"Edge Functions"** → **"Secrets"** (oder **Project Settings → Edge Functions**)
2. Neues Secret: Name `ANTHROPIC_API_KEY`, Wert = dein Key aus Schritt 3 → speichern

## 5. App-Zugangsdaten eintragen

1. `.env.example` zu `.env` umbenennen (in einem Texteditor öffnen, z. B. TextEdit/Notepad)
2. Im Supabase-Dashboard: **Project Settings → API**
3. "Project URL" → als `VITE_SUPABASE_URL` eintragen
4. "anon public" Key → als `VITE_SUPABASE_ANON_KEY` eintragen
5. Datei speichern

## 6. App online stellen (GitHub + Vercel, beides im Browser)

**a) Bei GitHub hochladen:**

1. https://github.com → kostenloses Konto/Login
2. Oben rechts "+" → **"New repository"** → Namen vergeben (z. B. `rezeptkasten`) → "Create repository"
3. Auf der neuen Repo-Seite: **"uploading an existing file"** anklicken
4. Alle Dateien und Ordner aus diesem Projektordner per Drag & Drop hineinziehen (außer `node_modules`, falls vorhanden – gibt es normalerweise nicht, da nichts installiert wurde)
5. Unten "Commit changes" klicken

**b) Bei Vercel verbinden:**

1. https://vercel.com → **"Sign Up"** → **"Continue with GitHub"** (verknüpft automatisch)
2. **"Add New"** → **"Project"** → dein `rezeptkasten`-Repo auswählen → "Import"
3. Vercel erkennt automatisch, dass es ein Vite-Projekt ist
4. Bei **"Environment Variables"**: die beiden Werte aus deiner `.env`-Datei eintragen:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. **"Deploy"** klicken (dauert ca. 1 Minute)

Du bekommst eine Adresse wie `https://rezeptkasten.vercel.app` – die kann
jede Person auf ihrem iPhone in Safari öffnen und optional über
"Zum Home-Bildschirm" wie eine App ablegen.

## Änderungen später

Änderst du später etwas am Code: einfach die geänderte Datei im GitHub-Repo
ersetzen (Datei öffnen → Stift-Symbol "Edit" oder erneut hochladen) – Vercel
deployt automatisch neu.

## Hinweis zur Sicherheit

Es gibt kein individuelles Login – wer die Adresse kennt, kann mitlesen und
-schreiben (passend für einen kleinen, privaten Personenkreis). Für mehr
Schutz später: Supabase Auth mit echtem Login ergänzen.

