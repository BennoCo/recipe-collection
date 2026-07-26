import React, { useState, useEffect, useCallback, useRef } from "react";
import { Camera, Link as LinkIcon, Type, UtensilsCrossed, Plus, ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "./supabaseClient";

// ---------- Helpers ----------
function resizeImage(file, maxDim = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Bild konnte nicht geladen werden"));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl) {
  const [meta, base64] = dataUrl.split(",");
  const mime = meta.match(/:(.*?);/)[1];
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// Ruft die Supabase Edge Function "format-recipe" auf (KI-Formatierung).
async function formatRecipe({ mode, text, link, imageDataUrl }) {
  const { data, error } = await supabase.functions.invoke("format-recipe", {
    body: { mode, text, link, imageBase64: imageDataUrl },
  });
  if (error) throw new Error(error.message || "Formatierung fehlgeschlagen");
  return data;
}

// Wandelt eine DB-Zeile (recipes + verschachtelte ratings) in das App-interne Format.
function mapRecipe(row) {
  const ratings = {};
  (row.ratings || []).forEach((r) => {
    ratings[r.person] = { score: r.score };
  });
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    servings: row.servings,
    time: row.time,
    ingredients: row.ingredients || [],
    instructions: row.instructions || [],
    imageUrl: row.image_url,
    sourceLink: row.source_link,
    addedBy: row.added_by,
    createdAt: row.created_at,
    ratings,
  };
}

// ---------- Rating widget ----------
function ForkRating({ value, onChange, size = 20, readOnly = false }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <UtensilsCrossed
          key={n}
          size={size}
          onMouseEnter={() => !readOnly && setHover(n)}
          onMouseLeave={() => !readOnly && setHover(0)}
          onClick={() => !readOnly && onChange && onChange(n)}
          style={{
            cursor: readOnly ? "default" : "pointer",
            color: (hover || value) >= n ? "#E8A33D" : "#C9BFA8",
            transition: "color 120ms ease",
          }}
        />
      ))}
    </div>
  );
}

// ---------- Avatare ----------
function Avatar({ variant, size = 96 }) {
  const skin = "#F3D9B1";
  const ink = "#241C15";
  if (variant === "female") {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <path d="M18 52 Q13 92 26 97 L31 58 Z" fill="#B5482A" />
        <path d="M82 52 Q87 92 74 97 L69 58 Z" fill="#B5482A" />
        <ellipse cx="50" cy="41" rx="33" ry="30" fill="#B5482A" />
        <circle cx="50" cy="48" r="26" fill={skin} stroke={ink} strokeWidth="2" />
        <path d="M24 40 Q50 8 76 40 Q76 22 50 18 Q24 22 24 40 Z" fill="#B5482A" />
        <circle cx="41" cy="48" r="2.6" fill={ink} />
        <circle cx="59" cy="48" r="2.6" fill={ink} />
        <path d="M42 58 Q50 64 58 58" stroke={ink} strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <circle cx="33" cy="54" r="3.2" fill="#E8A33D" opacity="0.45" />
        <circle cx="67" cy="54" r="3.2" fill="#E8A33D" opacity="0.45" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="26" fill={skin} stroke={ink} strokeWidth="2" />
      <path d="M23 42 Q25 14 50 14 Q75 14 77 42 Q68 29 50 29 Q32 29 23 42 Z" fill={ink} />
      <circle cx="41" cy="50" r="2.6" fill={ink} />
      <circle cx="59" cy="50" r="2.6" fill={ink} />
      <path d="M42 60 Q50 65 58 60" stroke={ink} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M28 56 Q50 76 72 56 Q69 66 50 70 Q31 66 28 56 Z" fill="#7C9473" opacity="0.3" />
    </svg>
  );
}

// ---------- Personen-Auswahl ----------
function PersonSelect({ onSelect }) {
  const people = [
    { key: "Gianna", variant: "female" },
    { key: "Benno", variant: "male" },
  ];
  return (
    <div style={styles.centerScreen}>
      <div style={{ textAlign: "center" }}>
        <div style={styles.eyebrowLight}>Rezeptkasten</div>
        <h2 style={styles.h2Light}>Wer bist du?</h2>
        <div style={{ display: "flex", gap: 18, marginTop: 24, justifyContent: "center" }}>
          {people.map((p) => (
            <button key={p.key} onClick={() => onSelect(p.key)} style={styles.personCard}>
              <Avatar variant={p.variant} size={80} />
              <div style={styles.personName}>{p.key}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Add recipe flow ----------
function AddRecipe({ username, onPublished, onCancel }) {
  const [mode, setMode] = useState("photo");
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const [step, setStep] = useState("input");
  const [draft, setDraft] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const fileRef = useRef(null);

  const canFormat =
    (mode === "photo" && imageDataUrl) || (mode === "link" && link.trim()) || (mode === "text" && text.trim());

  async function handleFormat() {
    setStep("loading");
    setErrorMsg("");
    try {
      const result = await formatRecipe({ mode, text, link: link.trim(), imageDataUrl });
      if (result.error) {
        setErrorMsg("Ich konnte darin kein Rezept erkennen. Probier ein anderes Foto oder einen anderen Link.");
        setStep("input");
        return;
      }
      setDraft({
        title: result.title || "",
        description: result.description || "",
        servings: result.servings || "",
        time: result.time || "",
        ingredients: result.ingredients || [],
        instructions: result.instructions || [],
      });
      setStep("preview");
    } catch (e) {
      setErrorMsg(`Formatierung fehlgeschlagen: ${e.message}`);
      setStep("input");
    }
  }

  async function handlePublish() {
    setStep("saving");
    try {
      let imageUrl = null;
      if (mode === "photo" && imageDataUrl) {
        const blob = dataUrlToBlob(imageDataUrl);
        const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        const { error: uploadError } = await supabase.storage.from("recipe-images").upload(path, blob, {
          contentType: "image/jpeg",
        });
        if (uploadError) throw uploadError;
        imageUrl = supabase.storage.from("recipe-images").getPublicUrl(path).data.publicUrl;
      }

      const { data, error } = await supabase
        .from("recipes")
        .insert({
          title: draft.title,
          description: draft.description,
          servings: draft.servings,
          time: draft.time,
          ingredients: draft.ingredients,
          instructions: draft.instructions,
          image_url: imageUrl,
          source_link: mode === "link" ? link.trim() : null,
          added_by: username,
        })
        .select()
        .single();
      if (error) throw error;

      onPublished(mapRecipe({ ...data, ratings: [] }));
    } catch (e) {
      setErrorMsg(`Speichern fehlgeschlagen: ${e.message}`);
      setStep("preview");
    }
  }

  if (step === "preview" && draft) {
    return (
      <div style={styles.screen}>
        <TopBar title="Vorschau" onBack={() => setStep("input")} />
        <div style={{ padding: "0 20px 100px" }}>
          <div style={styles.card}>
            <label style={styles.label}>Titel</label>
            <input style={styles.input} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <label style={styles.label}>Beschreibung</label>
            <input style={styles.input} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>Portionen</label>
                <input style={styles.input} value={draft.servings} onChange={(e) => setDraft({ ...draft, servings: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>Zeit</label>
                <input style={styles.input} value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
              </div>
            </div>
            <label style={styles.label}>Zutaten</label>
            <textarea
              style={{ ...styles.input, minHeight: 100 }}
              value={draft.ingredients.join("\n")}
              onChange={(e) => setDraft({ ...draft, ingredients: e.target.value.split("\n") })}
            />
            <label style={styles.label}>Zubereitung</label>
            <textarea
              style={{ ...styles.input, minHeight: 140 }}
              value={draft.instructions.join("\n")}
              onChange={(e) => setDraft({ ...draft, instructions: e.target.value.split("\n") })}
            />
          </div>
          {errorMsg && <p style={styles.errorText}>{errorMsg}</p>}
          <button style={{ ...styles.btnPrimary, width: "100%" }} onClick={handlePublish} disabled={step === "saving"}>
            {step === "saving" ? <Loader2 className="spin" size={18} /> : "Rezept veröffentlichen"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.screen}>
      <TopBar title="Neues Rezept" onBack={onCancel} />
      <div style={{ padding: "0 20px 100px" }}>
        <div style={styles.tabRow}>
          {[
            { key: "photo", label: "Foto", icon: Camera },
            { key: "link", label: "Link", icon: LinkIcon },
            { key: "text", label: "Text", icon: Type },
          ].map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setMode(key)} style={{ ...styles.tab, ...(mode === key ? styles.tabActive : {}) }}>
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        {mode === "photo" && (
          <div style={styles.card}>
            {imageDataUrl ? (
              <div>
                <img src={imageDataUrl} alt="Vorschau" style={{ width: "100%", borderRadius: 10, marginBottom: 12 }} />
                <button style={styles.btnGhost} onClick={() => setImageDataUrl(null)}>
                  Anderes Foto wählen
                </button>
              </div>
            ) : (
              <button style={styles.btnGhost} onClick={() => fileRef.current.click()}>
                <Camera size={18} /> Foto auswählen
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={async (e) => {
                const file = e.target.files[0];
                if (file) setImageDataUrl(await resizeImage(file));
              }}
            />
          </div>
        )}

        {mode === "link" && (
          <div style={styles.card}>
            <label style={styles.label}>Rezept-Link</label>
            <input style={styles.input} placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} />
            <p style={styles.pMuted}>
              Die Seite wird serverseitig gelesen (kein CORS-Problem mehr) - funktioniert bei den meisten Rezeptseiten zuverlässig.
            </p>
          </div>
        )}

        {mode === "text" && (
          <div style={styles.card}>
            <label style={styles.label}>Rezepttext</label>
            <textarea
              style={{ ...styles.input, minHeight: 160 }}
              placeholder="Zutaten und Zubereitung einfügen…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
        )}

        {errorMsg && <p style={styles.errorText}>{errorMsg}</p>}

        <button style={{ ...styles.btnPrimary, width: "100%" }} disabled={!canFormat || step === "loading"} onClick={handleFormat}>
          {step === "loading" ? (
            <>
              <Loader2 className="spin" size={18} /> Formatiere…
            </>
          ) : (
            "Mit KI formatieren"
          )}
        </button>
      </div>
    </div>
  );
}

function TopBar({ title, onBack }) {
  return (
    <div style={styles.topBar}>
      {onBack && (
        <button style={styles.iconBtn} onClick={onBack}>
          <ArrowLeft size={20} color="#FBF3E3" />
        </button>
      )}
      <span style={styles.topBarTitle}>{title}</span>
    </div>
  );
}

// ---------- Recipe detail ----------
function RecipeDetail({ recipe, username, onBack, onRate }) {
  const scores = Object.values(recipe.ratings || {}).map((r) => r.score);
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;
  const myRating = recipe.ratings?.[username]?.score || 0;

  return (
    <div style={styles.screen}>
      <TopBar title={recipe.title} onBack={onBack} />
      <div style={{ padding: "0 20px 60px" }}>
        {recipe.imageUrl && <img src={recipe.imageUrl} alt={recipe.title} style={styles.detailImage} />}
        <div style={styles.card}>
          <h1 style={styles.h1}>{recipe.title}</h1>
          {recipe.description && <p style={styles.pMuted}>{recipe.description}</p>}
          <div style={{ display: "flex", gap: 16, margin: "10px 0", fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, color: "#7C9473" }}>
            {recipe.servings && <span>👥 {recipe.servings}</span>}
            {recipe.time && <span>⏱ {recipe.time}</span>}
            <span>von {recipe.addedBy}</span>
          </div>
          {recipe.sourceLink && (
            <a href={recipe.sourceLink} target="_blank" rel="noreferrer" style={styles.link}>
              Original-Rezept öffnen
            </a>
          )}

          <div style={styles.divider} />
          <h3 style={styles.h3}>Zutaten</h3>
          <ul style={styles.list}>
            {recipe.ingredients.map((i, idx) => (
              <li key={idx}>{i}</li>
            ))}
          </ul>

          <h3 style={styles.h3}>Zubereitung</h3>
          <ol style={styles.list}>
            {recipe.instructions.map((s, idx) => (
              <li key={idx}>{s}</li>
            ))}
          </ol>

          <div style={styles.divider} />
          <h3 style={styles.h3}>Bewertungen {avg && `· Ø ${avg} (${scores.length})`}</h3>
          <p style={styles.pMuted}>Deine Bewertung</p>
          <ForkRating value={myRating} onChange={(v) => onRate(recipe.id, v)} size={26} />
          {Object.entries(recipe.ratings || {})
            .filter(([name]) => name !== username)
            .map(([name, r]) => (
              <div key={name} style={styles.ratingRow}>
                <span style={styles.pMuted}>{name}</span>
                <ForkRating value={r.score} readOnly size={14} />
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Recipe card ----------
function RecipeCard({ recipe, onClick, big }) {
  const scores = Object.values(recipe.ratings || {}).map((r) => r.score);
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;
  return (
    <div style={{ ...styles.recipeCard, ...(big ? styles.recipeCardBig : {}) }} onClick={onClick}>
      {recipe.imageUrl ? (
        <img src={recipe.imageUrl} alt={recipe.title} style={{ ...styles.cardImage, height: big ? 180 : 100 }} />
      ) : (
        <div style={{ ...styles.cardImage, height: big ? 180 : 100, ...styles.cardImagePlaceholder }}>
          <UtensilsCrossed size={big ? 32 : 20} color="#C9BFA8" />
        </div>
      )}
      <div style={{ padding: 12 }}>
        <div style={styles.eyebrow}>{recipe.addedBy}</div>
        <div style={{ ...styles.cardTitle, fontSize: big ? 22 : 16 }}>{recipe.title}</div>
        {avg && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
            <ForkRating value={Math.round(avg)} readOnly size={13} />
            <span style={{ fontSize: 12, color: "#7C9473", fontFamily: "'Space Grotesk', sans-serif" }}>{avg}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Main App ----------
export default function App() {
  const [person, setPerson] = useState(null); // wird bei jedem Start neu gewählt
  const [recipes, setRecipes] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [view, setView] = useState("home");
  const [activeId, setActiveId] = useState(null);

  const loadRecipes = useCallback(async () => {
    setLoadingList(true);
    const { data, error } = await supabase
      .from("recipes")
      .select("*, ratings(person, score)")
      .order("created_at", { ascending: false });
    if (!error && data) {
      setRecipes(data.map(mapRecipe));
    }
    setLoadingList(false);
  }, []);

  useEffect(() => {
    loadRecipes();
    // Live-Updates: läuft automatisch neu, wenn die andere Person etwas hinzufügt/bewertet.
    const channel = supabase
      .channel("rezeptkasten-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "recipes" }, loadRecipes)
      .on("postgres_changes", { event: "*", schema: "public", table: "ratings" }, loadRecipes)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadRecipes]);

  async function handleRate(recipeId, score) {
    setRecipes((prev) =>
      prev.map((r) => (r.id === recipeId ? { ...r, ratings: { ...r.ratings, [person]: { score } } } : r))
    );
    await supabase.from("ratings").upsert({ recipe_id: recipeId, person, score });
  }

  if (!person) return <PersonSelect onSelect={setPerson} />;

  if (loadingList && recipes.length === 0) {
    return (
      <div style={styles.centerScreen}>
        <Loader2 className="spin" size={28} color="#E8A33D" />
      </div>
    );
  }

  if (view === "add") {
    return (
      <AddRecipe
        username={person}
        onCancel={() => setView("home")}
        onPublished={(r) => {
          setRecipes((prev) => [r, ...prev]);
          setView("home");
        }}
      />
    );
  }

  if (view === "detail") {
    const recipe = recipes.find((r) => r.id === activeId);
    if (!recipe) {
      setView("home");
      return null;
    }
    return <RecipeDetail recipe={recipe} username={person} onBack={() => setView("home")} onRate={handleRate} />;
  }

  const [latest, ...archive] = recipes;

  return (
    <div style={styles.screen}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.9s linear infinite; }
      `}</style>
      <div style={styles.header}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={styles.eyebrowLight}>Rezeptkasten</div>
          <button style={styles.personSwitcher} onClick={() => setPerson(null)} title="Person wechseln">
            <Avatar variant={person === "Gianna" ? "female" : "male"} size={28} />
            <span>{person}</span>
          </button>
        </div>
        <h1 style={styles.pageTitle}>Diese Woche kocht {latest ? latest.addedBy : "…"}</h1>
      </div>

      <div style={{ padding: "0 20px 100px" }}>
        {!latest && (
          <div style={{ ...styles.card, textAlign: "center", padding: 32 }}>
            <UtensilsCrossed size={28} color="#B5482A" />
            <p style={{ ...styles.pMuted, marginTop: 10 }}>Noch kein Rezept diese Woche. Leg los!</p>
          </div>
        )}
        {latest && <RecipeCard recipe={latest} big onClick={() => { setActiveId(latest.id); setView("detail"); }} />}

        {archive.length > 0 && (
          <>
            <h3 style={{ ...styles.h3, marginTop: 28 }}>Archiv</h3>
            <div style={styles.grid}>
              {archive.map((r) => (
                <RecipeCard key={r.id} recipe={r} onClick={() => { setActiveId(r.id); setView("detail"); }} />
              ))}
            </div>
          </>
        )}
      </div>

      <button style={styles.fab} onClick={() => setView("add")}>
        <Plus size={24} color="#1F3625" />
      </button>
    </div>
  );
}

// ---------- Styles ----------
const styles = {
  screen: { minHeight: "100vh", background: "#1F3625", fontFamily: "'Inter', sans-serif" },
  centerScreen: { minHeight: "100vh", background: "#1F3625", display: "flex", alignItems: "center", justifyContent: "center" },
  header: { padding: "28px 20px 20px" },
  eyebrowLight: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "#E8A33D" },
  h2Light: { fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 24, color: "#FBF3E3", margin: "8px 0 0" },
  personCard: { background: "#FBF3E3", border: "none", borderRadius: 16, padding: "18px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "pointer" },
  personName: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15, color: "#241C15" },
  personSwitcher: { display: "flex", alignItems: "center", gap: 8, background: "rgba(251,243,227,0.1)", border: "1px solid rgba(251,243,227,0.25)", borderRadius: 20, padding: "4px 12px 4px 4px", cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, color: "#FBF3E3" },
  eyebrow: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#B5482A" },
  pageTitle: { fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 28, color: "#FBF3E3", margin: "6px 0 0" },
  topBar: { display: "flex", alignItems: "center", gap: 12, padding: "24px 20px 16px" },
  topBarTitle: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, color: "#FBF3E3", fontWeight: 500 },
  iconBtn: { background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex" },
  card: { background: "#FBF3E3", borderRadius: 14, padding: 18, marginBottom: 16 },
  h1: { fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 24, color: "#241C15", margin: 0 },
  h2: { fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 20, color: "#241C15", margin: 0 },
  h3: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, letterSpacing: 1, textTransform: "uppercase", color: "#B5482A", margin: "18px 0 8px" },
  pMuted: { fontFamily: "'Inter', sans-serif", fontSize: 14, color: "#6b5f4d", lineHeight: 1.5, margin: "4px 0" },
  label: { display: "block", fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#7C9473", marginTop: 12, marginBottom: 4 },
  input: { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #E3D9C0", fontFamily: "'Inter', sans-serif", fontSize: 14, color: "#241C15", background: "#fff", resize: "vertical" },
  btnPrimary: { background: "#E8A33D", color: "#1F3625", border: "none", borderRadius: 10, padding: "13px 18px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16 },
  btnGhost: { width: "100%", background: "#FBF3E3", border: "1.5px dashed #C9BFA8", borderRadius: 10, padding: "16px", fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, color: "#6b5f4d", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
  errorText: { color: "#B5482A", fontSize: 13, fontFamily: "'Inter', sans-serif", margin: "8px 0" },
  tabRow: { display: "flex", gap: 8, marginBottom: 16, marginTop: 4 },
  tab: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px", borderRadius: 10, border: "1px solid #3A5240", background: "transparent", color: "#C9BFA8", fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, cursor: "pointer" },
  tabActive: { background: "#E8A33D", borderColor: "#E8A33D", color: "#1F3625", fontWeight: 700 },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  recipeCard: { background: "#FBF3E3", borderRadius: 12, overflow: "hidden", cursor: "pointer" },
  recipeCardBig: { marginBottom: 8 },
  cardImage: { width: "100%", objectFit: "cover", display: "block" },
  cardImagePlaceholder: { display: "flex", alignItems: "center", justifyContent: "center", background: "#EFE6D0" },
  cardTitle: { fontFamily: "'Fraunces', serif", fontWeight: 600, color: "#241C15", lineHeight: 1.25, marginTop: 2 },
  detailImage: { width: "100%", height: 200, objectFit: "cover", borderRadius: 14, marginBottom: 16 },
  list: { paddingLeft: 20, color: "#241C15", fontSize: 14, lineHeight: 1.7, fontFamily: "'Inter', sans-serif" },
  divider: { height: 1, background: "#E3D9C0", margin: "16px 0" },
  link: { color: "#B5482A", fontSize: 13, fontFamily: "'Space Grotesk', sans-serif" },
  ratingRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #EFE6D0" },
  fab: { position: "fixed", bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, background: "#E8A33D", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 6px 16px rgba(0,0,0,0.3)" },
};
