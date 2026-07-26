// Supabase Edge Function: format-recipe
// Nimmt Foto/Link/Text entgegen, lässt die KI ein einheitliches Rezept-JSON
// erzeugen. Hält den Anthropic-API-Key serverseitig geheim (nie im Browser).
//
// Einrichtung im Supabase-Dashboard (kein Terminal nötig):
//   Edge Functions -> "Deploy a new function" -> "Via Editor"
//   -> diesen Code einfügen -> Deploy
//   Danach: Edge Functions -> Secrets -> ANTHROPIC_API_KEY hinterlegen

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SCHEMA =
  'Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, keine Einleitung, keine Markdown-Backticks. Format: {"title": string, "description": string (1 Satz), "servings": string, "time": string, "ingredients": [string], "instructions": [string]}. Wenn du kein Rezept erkennen kannst, gib {"error": "not_found"} zurück.';

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!ANTHROPIC_API_KEY) {
    return json({ error: "Server ist nicht konfiguriert (ANTHROPIC_API_KEY fehlt)" }, 500);
  }

  try {
    const { mode, text, link, imageBase64 } = await req.json();
    let result;

    if (mode === "photo") {
      result = await callClaude({
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64.split(",").pop() } },
          { type: "text", text: `Lies das Rezept auf diesem Foto und formatiere es einheitlich. ${SCHEMA}` },
        ],
        maxTokens: 1200,
      });
    } else if (mode === "link") {
      result = await formatFromLink(link);
    } else {
      result = await callClaude({
        content: `Formatiere folgenden Rezepttext einheitlich:\n\n${text}\n\n${SCHEMA}`,
        maxTokens: 1200,
      });
    }

    return json(result, 200);
  } catch (err) {
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function callClaude({ content, maxTokens, tools }: { content: unknown; maxTokens: number; tools?: unknown[] }) {
  const body: Record<string, unknown> = {
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    messages: [{ role: "user", content }],
  };
  if (tools) body.tools = tools;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "Anthropic API-Fehler");

  const textBlocks = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text);
  if (!textBlocks.length) {
    if (data.stop_reason === "max_tokens") throw new Error("Antwort wurde abgeschnitten (zu lang)");
    throw new Error("Keine gültige Antwort erhalten");
  }
  return extractJson(textBlocks.join("\n"));
}

function extractJson(text: string) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Keine gültige Antwort erhalten");
  return JSON.parse(cleaned.slice(start, end + 1));
}

// Zwei-Wege-Versuch für Links. Läuft serverseitig -> kein CORS-Problem, im
// Gegensatz zur Browser-Variante.
async function formatFromLink(url: string) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (res.ok) {
      const buffer = await res.arrayBuffer();
      const html = new TextDecoder("utf-8").decode(buffer);
      const structured = extractJsonLdRecipe(html);
      const text = structured || extractReadableText(html);
      if (text && text.length > 100) {
        return await callClaude({
          content: `Hier ist der Inhalt einer Rezept-Webseite. Finde darin das Rezept und formatiere es einheitlich, ignoriere Navigation, Werbung und Kommentare:\n\n${text}\n\n${SCHEMA}`,
          maxTokens: 1200,
        });
      }
    }
  } catch {
    // Seite nicht erreichbar - unten per KI-Websuche versuchen
  }

  // Fallback: KI-Websuche
  return await callClaude({
    content: `Suche den Inhalt dieser Rezept-Seite und formatiere das Rezept einheitlich: ${url}\n\n${SCHEMA}`,
    maxTokens: 2000,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
  });
}

function extractJsonLdRecipe(html: string): string | null {
  const matches = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of matches) {
    let data;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const recipe = findRecipeNode(data);
    if (recipe) return recipeToText(recipe);
  }
  return null;
}

function findRecipeNode(node: any): any {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }
  const type = node["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((t: unknown) => typeof t === "string" && t.toLowerCase() === "recipe")) return node;
  if (node["@graph"]) return findRecipeNode(node["@graph"]);
  return null;
}

function plainText(val: any): string {
  if (!val) return "";
  if (typeof val === "string") return val.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (typeof val === "object" && val.text) return plainText(val.text);
  return "";
}

function recipeToText(recipe: any): string {
  const lines: string[] = [];
  if (recipe.name) lines.push(`Titel: ${plainText(recipe.name)}`);
  if (recipe.description) lines.push(`Beschreibung: ${plainText(recipe.description)}`);
  if (recipe.recipeYield) lines.push(`Portionen: ${[].concat(recipe.recipeYield).join(", ")}`);
  const time = recipe.totalTime || recipe.cookTime || recipe.prepTime;
  if (time) lines.push(`Zeit: ${time}`);

  const ingredients = recipe.recipeIngredient || recipe.ingredients || [];
  if (ingredients.length) {
    lines.push("Zutaten:");
    ingredients.forEach((i: any) => lines.push(`- ${plainText(i)}`));
  }

  let steps = recipe.recipeInstructions || [];
  if (typeof steps === "string") steps = [steps];
  if (steps.length) {
    lines.push("Zubereitung:");
    let n = 1;
    const flatten = (s: any) => {
      if (Array.isArray(s)) {
        s.forEach(flatten);
      } else if (s && s["@type"] === "HowToSection" && s.itemListElement) {
        flatten(s.itemListElement);
      } else {
        const t = plainText(s);
        if (t) lines.push(`${n++}. ${t}`);
      }
    };
    flatten(steps);
  }

  return lines.join("\n");
}

function extractReadableText(html: string): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|tr|h[1-6]|br)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&auml;/g, "ä")
    .replace(/&ouml;/g, "ö")
    .replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.slice(0, 15000);
}
