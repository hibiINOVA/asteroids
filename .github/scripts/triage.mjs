'use strict'

// Triaje automatico de issues para el repo de Asteroids.
// Se ejecuta desde .github/workflows/issue-triage.yml con TRIAGE_TOKEN, que es un
// installation token de la GitHub App `asteroids-triage` (no el GITHUB_TOKEN
// automatico). Sin dependencias: solo fetch contra las APIs REST y GraphQL.

import { readFileSync, existsSync } from 'node:fs'

const REST = 'https://api.github.com'
const WEB = 'https://github.com'
const GRAPHQL = `${REST}/graphql`

const TOKEN = process.env.TRIAGE_TOKEN
const REPO = process.env.GITHUB_REPOSITORY || ''
const EVENT_NAME = process.env.GITHUB_EVENT_NAME || ''
const EVENT_PATH = process.env.GITHUB_EVENT_PATH || ''
const BRANCH = process.env.TRACKER_BRANCH || 'main'
const TRACKER_TITLE = 'Tracker de issues'

const [OWNER, NAME] = REPO.split('/')

// ── Marcadores ocultos ────────────────────────────────────────────────────────
const MARKER_META = '<!-- triage:meta -->'
const MARKER_TRACKER = '<!-- tracker:generated -->'
const MARKER_TEXT_META = 'triage:meta'

// ── Taxonomia de labels ───────────────────────────────────────────────────────
// Los tres prefijos de abajo (mas `necesita-triage`) son los unicos grupos que
// el bot puede agregar o quitar. Cualquier otro label puesto a mano no se toca.
const TYPE_PREFIX = 'tipo:'
const AREA_PREFIX = 'area:'
const PRIORITY_PREFIX = 'prioridad:'
const TRIAGE_LABEL = 'necesita-triage'
const FORMATTED_LABEL = 'auto-formateado'

// `form` lista los valores aceptados en los dropdowns de los Issue Forms.
// Es el mapeo autoritativo: el fallback por prefijo es solo una red de seguridad.
const TYPES = [
  { name: 'tipo:bug', color: 'd73a4a', description: 'Algo esta roto', form: ['Bug'] },
  { name: 'tipo:feature', color: 'a2eeef', description: 'Funcionalidad nueva', form: ['Feature', 'Funcionalidad'] },
  { name: 'tipo:mejora', color: 'c5def5', description: 'Ajuste sobre algo existente', form: ['Mejora'] },
  { name: 'tipo:chore', color: 'bfd4f2', description: 'Mantenimiento o tooling, sin cambio de juego', form: ['Chore', 'Mantenimiento'] },
  { name: 'tipo:docs', color: 'd4c5f9', description: 'Documentacion', form: ['Documentación', 'Docs'] }
]

const AREAS = [
  { name: 'area:gameplay', color: '0e8a16', description: 'Bucle de juego, nave, asteroides, niveles', form: ['Gameplay', 'Juego'] },
  { name: 'area:powerups', color: '1d76db', description: 'Power-ups, escudo, triple, velocidad, estrella fugaz', form: ['Power-ups', 'Powerup', 'Power-ups'] },
  { name: 'area:skins', color: '5319e7', description: 'Skins de nave y su persistencia', form: ['Skins', 'Pieles de la nave'] },
  { name: 'area:render', color: 'fbca04', description: 'Canvas, dibujado, particulas', form: ['Render', 'Dibujado'] },
  { name: 'area:ui', color: 'e99695', description: 'Textos en pantalla, menus, estados', form: ['UI', 'Interfaz'] },
  { name: 'area:performance', color: 'b60205', description: 'Rendimiento, fps, fisica', form: ['Rendimiento', 'Performance'] },
  { name: 'area:docs', color: '7057ff', description: 'README, AGENTS.md, documentacion', form: ['Documentación', 'Docs'] }
]

const PRIORITIES = [
  { name: 'prioridad:alta', color: 'b60205', description: 'Bloquea el juego o es un crash', form: ['Alta'] },
  { name: 'prioridad:media', color: 'd93f0b', description: 'Se nota, se puede convivir con el', form: ['Media'] },
  { name: 'prioridad:baja', color: 'fef2c0', description: 'Cosmetico o diferible', form: ['Baja'] }
]

const ALL_LABELS = [
  ...TYPES, ...AREAS, ...PRIORITIES,
  { name: TRIAGE_LABEL, color: 'ededed', description: 'No se pudo clasificar solo, requiere triage manual' },
  { name: FORMATTED_LABEL, color: 'c2e0c6', description: 'Cuerpo normalizado a la plantilla' }
]

// ── Clasificacion por keywords ────────────────────────────────────────────────
// Anclado al vocabulario real de game.js.
const KEYWORDS = {
  'tipo:bug': ['bug', 'bugfix', 'error', 'falla', 'fallo', 'rompe', 'no funciona', 'no responde',
    'regresion', 'se traba', 'congelado', 'pantalla negra', 'exception', 'undefined', 'nan', 'defecto',
    'no puedo', 'no se puede'],
  'tipo:feature': ['agregar', 'añadir', 'nueva feature', 'nuevo feature', 'nueva', 'nuevo', 'implementar',
    'quiero que se pueda', 'nuevo modo', 'nuevo tipo de', 'estrella fugaz', 'soporte para', 'se podria agregar'],
  'tipo:mejora': ['mejorar', 'mejora', 'optimizar', 'refactor', 'refactorizar', 'pulir', 'ajustar',
    'tweak', 'refine', 'deberia', 'podria', 'se ve feo', 'se siente mal'],
  'tipo:chore': ['workflow', 'action', 'pipeline', 'ci', 'dependencia', 'limpieza', 'cleanup',
    'automatizar', 'build', 'bump', 'dependabot'],
  'tipo:docs': ['readme', 'documentacion', 'docs', 'documentar', 'javadoc', 'changelog', 'typo',
    'correccion ortografica', 'comentar el codigo'],

  'area:powerups': ['power-up', 'power up', 'powerup', 'powerup_types', 'escudo', 'shield', 'triple',
    'disparo triple', 'velocidad', 'speed', 'puntos dobles', 'doble puntos', 'estrella fugaz',
    'shooting star', 'minialien', 'mini alien', 'alien', 'ttl'],
  'area:skins': ['skin', 'skins', 'trail', 'personalizacion', 'localstorage', 'seleccion de nave',
    'apariencia', 'color de la nave', 'tienda', 'forma de la nave', 'pieles'],
  'area:render': ['canvas', 'render', 'dibuj', 'draw', 'pint', 'particula', 'explosion', 'sprite',
    'animacion', 'ctx.', 'gradiente', 'trail', 'estela'],
  'area:performance': ['lag', 'fps', 'frame rate', 'rendimiento', 'performance', 'memoria', 'memory',
    'microflicker', 'stutter', 'consumo de cpu', 'optimizar el loop', 'dt'],
  'area:ui': ['hud', 'score', 'puntaje', 'menu', 'overlay', 'gameover', 'game over', 'contador',
    'vidas', 'texto en pantalla', 'invencibilidad', 'pantalla de', 'respawn'],
  'area:docs': ['readme', 'agents.md', 'agentes', 'documentacion', 'docs/', 'guia', 'contributing',
    'comentarios del codigo', 'convenciones'],
  'area:gameplay': ['asteroide', 'asteroides', 'oleada', 'nivel', 'level', 'partida', 'gameplay',
    'colision', 'wrap', 'toroidal', 'reproducir', 'respawn', 'nave', 'disparo', 'bullet', 'bala',
    'puntos', 'spawn', 'safezone', 'zona segura', 'invulnerabilidad', 'oleadas', 'game over']
}

const PRIORITY_KEYWORDS = {
  'prioridad:alta': ['crash', 'pantalla negra', 'congelado', 'se traba', 'no se puede jugar', 'bloquea',
    'perdida de partida', 'se pierde el progreso', 'dato perdido', 'injugable', 'imposible de'],
  'prioridad:media': ['error', 'falla', 'bug', 'rompe', 'se nota', 'retraso', 'regresion', 'inconsistente'],
  'prioridad:baja': ['cosmetico', 'cosmetic', 'texto', 'typo', 'color', 'detalle', 'idea', 'sugerencia',
    'agradable', 'nice to have']
}

// ── Info util para implementar el issue ───────────────────────────────────────
// Se inyecta en la seccion "Notas de implementacion".
const IMPL_NOTES = [
  'Todo el juego vive en `game.js` (un solo archivo, sin build ni bundler). `index.html` solo monta el canvas 800x600.',
  '',
  '**Gotchas del repo:**',
  '- `dt` esta acotado a `0.05` en el loop principal: no subas ese tope sin motivo, explota la fisica al cambiar de pestana.',
  '- `justPressed` lo consume `pressed()`: llamarlo mas de una vez por frame pierde el evento.',
  '- El espacio es toroidal, toda posicion pasa por `wrap()`.',
  '- `spawnAsteroids` respeta una zona segura de 130px alrededor del centro.',
  '- La colision de la nave usa `a.radius * 0.82` (a proposito: es mas indulgente).',
  '- `POWERUP_TYPES` esta indexado: usa `randInt(0, POWERUP_TYPES.length - 1)` al spawnear.',
  '- `RADII`, `SPEEDS` y `POINTS` son arrays indexados por tamano (1 pequeno, 2 mediano, 3 grande).',
  '- Estados posibles: `playing`, `dead`, `skins`, `gameover`.',
  '- `nextLevel()` limpia balas y particulas pero recalcula los asteroides segun `level`.',
  '- Los textos de UI y los comentarios del codigo van en espanol.',
  '- Las balas enemigas de `MiniAlien` usan `new Bullet(..., true)`: mira `b.isEnemy` para el escudo.'
]

const CHECKLIST_ITEMS = [
  'Reproducido en local siguiendo los pasos de arriba',
  'Causa raiz identificada en `game.js`',
  'Arreglo minimo implementado sin romper las convenciones del repo',
  'Probado en el navegador (canvas abre, sin errores en consola)',
  'Leido `AGENTS.md` antes de escribir codigo',
  'Actualizado `README.md` si el cambio es visible para quien juega'
]

// Secciones canonicas y los titulos alternativos que aceptamos de un Issue Form
// o de un issue escrito a mano.
const CANONICAL_SECTIONS = [
  { title: 'Contexto', aliases: ['contexto', 'contexto extra', 'informacion adicional', 'informacion de contexto', 'contexto adicional'] },
  { title: 'Descripción', aliases: ['descripcion', 'que paso', 'que ocurre', 'descripcion del problema', 'problema', 'cuerpo', 'detalle'] },
  { title: 'Pasos para reproducir', aliases: ['pasos para reproducir', 'pasos', 'pasos para replicar', 'como reproducir', 'steps to reproduce', 'reproduccion'], onlyFor: 'tipo:bug' },
  { title: 'Comportamiento esperado', aliases: ['comportamiento esperado', 'resultado esperado', 'que esperaba', 'que deberia pasar', 'expected behavior'] },
  { title: 'Checklist', aliases: ['checklist', 'lista de verificacion', 'verificacion'] },
  { title: 'Notas de implementación', aliases: ['notas de implementacion', 'notas', 'detalles tecnicos', 'notas tecnicas', 'guias'] }
]

// Sección propia para que la firma no acabe absorbida dentro de otra al
// reparsear el cuerpo (si fuera texto suelto, cada pasada la duplicaría).
const MANAGED_SECTION = 'Notas de gestión'
const MANAGED_NOTE = `_Secciones gestionadas por \`.github/workflows/issue-triage.yml\`. Edita el contenido, no los títulos._`
const stripManagedNote = (s) =>
  String(s || '').split('\n').filter((l) => l.trim() !== MANAGED_NOTE).join('\n').trim()

// ── Utilidades ────────────────────────────────────────────────────────────────
const log = (msg) => console.log(`[triage] ${msg}`)

function die(msg) {
  throw new Error(msg)
}

const stripAccents = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const slug = (s) =>
  stripAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

// Para comparar "Power-ups" contra la cola "powerups".
const compact = (s) => stripAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, '')

function escapeCell(s) {
  return String(s || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim()
}

const labelNames = (issue) => (issue.labels || []).map((l) => (l.name ? l.name : String(l)))

const nowStamp = () => new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
const today = () => new Date().toISOString().slice(0, 10)

const blobUrl = (path) => `${WEB}/${REPO}/blob/${BRANCH}/${path}`

// ── HTTP ──────────────────────────────────────────────────────────────────────
async function api(method, path, body, allow404 = false) {
  const res = await fetch(REST + path, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${TOKEN}`,
      'User-Agent': 'asteroids-issue-triage',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })
  if (res.status === 204) return null
  const text = await res.text()
  if (res.status === 404 && allow404) return null
  if (!res.ok) die(`${method} ${path} -> ${res.status} ${text.slice(0, 400)}`)
  return text ? JSON.parse(text) : null
}

async function graphql(query, variables) {
  const res = await fetch(GRAPHQL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'User-Agent': 'asteroids-issue-triage',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  })
  const json = await res.json()
  if (json.errors) die(`graphql -> ${JSON.stringify(json.errors)}`)
  return json.data
}

async function* paginate(path, params = {}) {
  const sep = path.includes('?') ? '&' : '?'
  for (let page = 1; page <= 20; page++) {
    const query = new URLSearchParams({ ...params, per_page: '100', page: String(page) })
    const chunk = await api('GET', `${path}${sep}${query}`)
    if (!chunk || chunk.length === 0) return
    yield* chunk
    if (chunk.length < 100) return
  }
}

// ── Labels ────────────────────────────────────────────────────────────────────
async function ensureLabels() {
  const existing = new Set()
  for await (const label of paginate(`/repos/${REPO}/labels`)) existing.add(label.name)
  for (const want of ALL_LABELS) {
    if (existing.has(want.name)) continue
    await api('POST', `/repos/${REPO}/labels`, {
      name: want.name, color: want.color, description: want.description
    })
    log(`label creada: ${want.name}`)
  }
}

// ── Parseo de cuerpos ─────────────────────────────────────────────────────────
const EMPTY_VALUES = new Set(['', '_no response_', '_none_', '_sin respuesta_'])

function isEmptyValue(v) {
  return !v || EMPTY_VALUES.has(v.trim().toLowerCase())
}

// GitHub renderiza los campos de un Issue Form como "### <label>" + valor.
function parseFormFields(body) {
  const fields = {}
  if (!body) return fields
  const re = /^###[ \t]+(.+?)[ \t]*\r?$/gm
  const heads = []
  let m
  while ((m = re.exec(body)) !== null) {
    heads.push({ label: m[1].trim(), index: m.index, at: m.index + m[0].length })
  }
  for (let i = 0; i < heads.length; i++) {
    const from = heads[i].at
    const to = i + 1 < heads.length ? heads[i + 1].index : body.length
    const raw = body.slice(from, to).trim()
    fields[heads[i].label] = isEmptyValue(raw) ? '' : raw
  }
  return fields
}

// Extrae secciones de nivel ## y ### preservando el orden del cuerpo.
function extractSections(body) {
  const source = body || ''
  const re = /^(#{2,3})[ \t]+(.+?)[ \t]*\r?$/gm
  const heads = []
  let m
  while ((m = re.exec(source)) !== null) {
    heads.push({ level: m[1].length, title: m[2].trim(), at: m.index, contentAt: m.index + m[0].length })
  }
  const sections = heads.map((h, i) => ({
    level: h.level,
    title: h.title,
    key: slug(h.title),
    content: source.slice(h.contentAt, i + 1 < heads.length ? heads[i + 1].at : source.length).trim()
  }))
  const preamble = heads.length ? source.slice(0, heads[0].at).trim() : source.trim()
  const looksLikeForm = heads.length > 0 && heads[0].level === 3
  return { sections, preamble, looksLikeForm }
}

// ── Clasificacion ─────────────────────────────────────────────────────────────
// Secciones cuyo contenido genera el bot. No deben influir en la clasificación:
// las Notas de implementación citan escudo, triple, velocidad y estrella fugaz,
// así que incluirlas haría que todo issue se reetiquetara como powerups.
const BOT_SECTION_KEYS = new Set(['checklist', 'notas-de-implementacion', 'notas-de-gestion'])

// Desempate entre áreas cuando varias coinciden por keyword: gameplay es el
// comodín, así que siempre pierde contra un área específica.
const AREA_RANK = {
  'area:powerups': 0, 'area:skins': 1, 'area:render': 2,
  'area:performance': 3, 'area:ui': 4, 'area:docs': 5, 'area:gameplay': 9
}

// El cuerpo normalizado guarda el veredicto en su primera línea. Releerlo evita
// perder la respuesta del formulario (que deja de estar en forma de campo) y
// mantiene la clasificación estable entre ejecuciones.
const PREV_VERDICT =
  /Tipo \*\*([^*]+)\*\*, area \*\*([^*]+)\*\*, prioridad \*\*([^*]+)\*\*/

function previousVerdict(body) {
  const m = String(body || '').match(PREV_VERDICT)
  if (!m) return null
  return {
    type: m[1].trim(),
    area: m[2].trim() === 'sin clasificar' ? null : m[2].trim(),
    priority: m[3].trim()
  }
}

function authorText(title, body) {
  const { sections, preamble } = extractSections(body)
  const parts = [title]
  // El preámbulo de un cuerpo ya normalizado es del bot; el de uno en blanco
  // es del autor.
  if (preamble && !(body || '').includes(MARKER_TEXT_META)) parts.push(preamble)
  for (const s of sections) {
    if (BOT_SECTION_KEYS.has(s.key)) continue
    parts.push(s.content)
  }
  return parts.filter(Boolean).join('\n')
}

function findKeywordLabels(haystack) {
  const text = ' ' + stripAccents(String(haystack).toLowerCase()) + ' '
  const flat = ' ' + stripAccents(String(haystack).toLowerCase()).replace(/[^a-z0-9.-]+/g, ' ') + ' '
  const hits = []
  for (const [label, words] of Object.entries(KEYWORDS)) {
    const found = words.some((w) => {
      const k = stripAccents(w.toLowerCase())
      return flat.includes(' ' + k.replace(/[^a-z0-9.-]+/g, ' ') + ' ') || text.includes(k)
    })
    if (found) hits.push(label)
  }
  return hits
}

function findPriority(haystack) {
  const text = ' ' + stripAccents(String(haystack).toLowerCase()) + ' '
  const scores = []
  for (const [label, words] of Object.entries(PRIORITY_KEYWORDS)) {
    const weight = words.filter((w) => text.includes(stripAccents(w.toLowerCase()))).length
    if (weight > 0) scores.push([label, weight])
  }
  if (!scores.length) return null
  scores.sort((a, b) => b[1] - a[1])
  return scores[0][0]
}

// "Gameplay y niveles" -> "area:gameplay"; "Power-ups" -> "area:powerups";
// "Alta — bloquea el juego" -> "prioridad:alta"
function matchByPrefix(value, prefix) {
  if (!value) return null
  const cKey = compact(value)
  if (!cKey) return null
  const known = ALL_LABELS.filter((l) => l.name.startsWith(prefix))

  // 1) Valor exacto de un label ("Gameplay" -> area:gameplay).
  for (const l of known) if (slug(value) === slug(l.name)) return l.name
  // 2) Valor de la lista `form` del label, admitiendo sufijos descriptivos
  //    ("Rendimiento — lag, fps" -> area:performance).
  for (const l of known) {
    for (const form of l.form || []) {
      const cForm = compact(form)
      if (cKey === cForm || cKey.startsWith(cForm)) return l.name
    }
  }
  // 3) La cola del label, como red de seguridad ("gameplay-niveles" -> area:gameplay).
  for (const l of known) {
    const tail = compact(l.name.slice(prefix.length))
    if (tail && (cKey === tail || cKey.startsWith(tail))) return l.name
  }
  return null
}

function classify(issue) {
  const fields = parseFormFields(issue.body)
  const formField = (...names) => {
    for (const n of names) for (const k of Object.keys(fields)) {
      if (slug(k) === slug(n) && fields[k]) return fields[k]
    }
    return null
  }

  const typeFromForm = matchByPrefix(formField('Tipo', 'Tipo de issue'), TYPE_PREFIX)
  const areaFromForm = matchByPrefix(formField('Área', 'Area', 'Área del juego'), AREA_PREFIX)
  const prioFromForm = matchByPrefix(
    formField('Prioridad', 'Prioridad (impacto)', 'Impacto'), PRIORITY_PREFIX)

  const prev = previousVerdict(issue.body)
  const haystack = authorText(issue.title, issue.body)
  const hits = findKeywordLabels(haystack)
  const kwType = hits.find((h) => h.startsWith(TYPE_PREFIX)) || null
  const kwArea = hits
    .filter((h) => h.startsWith(AREA_PREFIX))
    .sort((a, b) => (AREA_RANK[a] ?? 8) - (AREA_RANK[b] ?? 8))[0] || null
  const kwPrio = findPriority(haystack)

  // Tipo y área: manda el formulario, luego el veredicto previo, luego keywords.
  // Prioridad: los keywords van antes que el veredicto previo, para que subir
  // la urgencia en una edición sí tenga efecto.
  const type = typeFromForm || prev?.type || kwType || 'tipo:bug'
  const area = areaFromForm || prev?.area || kwArea
  const priority = prioFromForm || kwPrio || prev?.priority || 'prioridad:media'

  const { looksLikeForm } = extractSections(issue.body)

  return {
    type,
    area,
    priority,
    resolved: Boolean(area),
    resolvedBy: areaFromForm ? 'formulario'
      : prev?.area ? 'veredicto previo'
        : kwArea ? 'keywords'
          : 'sin clasificar',
    fromForm: looksLikeForm,
    formFields: Object.keys(fields).length
  }
}

// ── Normalizacion del cuerpo ──────────────────────────────────────────────────
function normalizeBody(issue, verdict) {
  const { sections, preamble, looksLikeForm } = extractSections(issue.body)
  const byKey = new Map()
  for (const s of sections) if (!byKey.has(s.key)) byKey.set(s.key, s.content)

  const findExisting = (spec) => {
    for (const key of [slug(spec.title), ...spec.aliases.map(slug)]) {
      const value = byKey.get(key)
      if (value) return value
    }
    return null
  }

  const out = []
  // Solo tipo/área/prioridad: mantener esta línea estable es lo que hace
  // idempotente la normalización, y lo que permite recuperar el veredicto.
  out.push([
    MARKER_TEXT_META,
    `> Cuerpo normalizado por \`issue-triage\`. Tipo **${verdict.type}**, area **${verdict.area || 'sin clasificar'}**, prioridad **${verdict.priority}**.`
  ].join('\n'))

  // El preámbulo de un Issue Form es texto nuestro; en un cuerpo ya normalizado
  // es el marcador y el resumen que puso el bot. La prosa del autor se respeta.
  const botPreamble = looksLikeForm || (issue.body || '').includes(MARKER_TEXT_META)
  if (preamble && !botPreamble) out.push(preamble)

  for (const spec of CANONICAL_SECTIONS) {
    if (spec.onlyFor && verdict.type !== spec.onlyFor) continue
    const existing = findExisting(spec)
    out.push(`## ${spec.title}\n\n${existing ? stripManagedNote(existing) : defaultFor(spec.title)}`)
  }

  out.push(`## ${MANAGED_SECTION}\n\n${MANAGED_NOTE}`)
  return out.join('\n\n')
}

function defaultFor(title) {
  if (title === 'Checklist') return CHECKLIST_ITEMS.map((i) => `- [ ] ${i}`).join('\n')
  if (title === 'Notas de implementación') {
    return [
      '_Generado automáticamente con el contrato técnico del repo, para no perder tiempo investigando durante la implementación._',
      '',
      ...IMPL_NOTES,
      '',
      `- [AGENTS.md](${blobUrl('AGENTS.md')}) — convenciones y gotchas, leer antes de tocar código`,
      `- [README.md](${blobUrl('README.md')}) — controles, puntuación y características`,
      `- [game.js](${blobUrl('game.js')}) — toda la lógica del juego`
    ].join('\n')
  }
  if (title === 'Pasos para reproducir') {
    return '_1._ ...\n_2._ ...\n_3._ ...\n\n_Pide también qué se esperaba en su lugar._'
  }
  if (title === 'Comportamiento esperado') return '_Qué debería pasar en su lugar._'
  if (title === 'Descripción') return '_Qué pasa, en una o dos frases._'
  return '_Dónde aparece el problema o de dónde viene la idea._'
}

// ── Ficha de metadatos ────────────────────────────────────────────────────────
const TS_ROW = /\| Actualizado \| [^|]* \|/g
const stripTimestamp = (s) => String(s || '').replace(TS_ROW, '| Actualizado | — |')

function buildMetaComment(issue, verdict) {
  const names = labelNames(issue)
  const checklist = (issue.body || '').split('\n').filter((l) => /^- \[[ xX]\]/.test(l))
  const done = checklist.filter((l) => /^- \[[xX]\]/.test(l)).length
  const sections = extractSections(issue.body).sections.length

  const rows = [
    ['Área', verdict.area || '⚠️ sin clasificar'],
    ['Tipo', verdict.type],
    ['Prioridad', verdict.priority],
    ['Clasificado por', {
      'formulario': 'Issue Form',
      'veredicto previo': 'Veredicto de la ejecución anterior',
      keywords: 'Keywords del título y la descripción',
      'sin clasificar': 'Nada — requiere triage manual'
    }[verdict.resolvedBy]],
    ['Issue Form', verdict.fromForm ? `sí (${verdict.formFields} campos)` : 'no — creado en blanco o editado a mano'],
    ['Secciones en el cuerpo', sections],
    ['Checklist', checklist.length ? `${done}/${checklist.length} completados` : 'sin checklist'],
    ['Labels', names.length ? names.map((n) => `\`${n}\``).join(' ') : '(ninguno)'],
    ['Asignado a', (issue.assignees || []).map((a) => a.login).join(', ') || '—'],
    ['Actualizado', nowStamp()]
  ]

  return [
    MARKER_META,
    '',
    '### Ficha de triage',
    '',
    '| Campo | Valor |',
    '| --- | --- |',
    ...rows.map(([k, v]) => `| ${k} | ${v === '' || v === undefined ? '—' : v} |`),
    '',
    verdict.resolved
      ? `**Siguiente paso:** implementa siguiendo la sección _Notas de implementación_ de la descripción. El contrato del repo (dt acotado a 0.05, \`wrap()\`, \`POWERUP_TYPES\`, zona segura de 130px) ya está ahí.`
      : '**Siguiente paso:** quedó sin clasificar. Agrega un `area:*` a mano, o vuelve a abrirlo desde el Issue Form para que el bot resuelva el área.',
    '',
    `Contexto: [AGENTS.md](${blobUrl('AGENTS.md')}) · [game.js](${blobUrl('game.js')}) · [README.md](${blobUrl('README.md')})`
  ].join('\n')
}

async function syncMetaComment(issue, verdict) {
  const stale = []
  for await (const c of paginate(`/repos/${REPO}/issues/${issue.number}/comments`)) {
    if ((c.body || '').includes(MARKER_META)) stale.push(c)
  }
  const wanted = buildMetaComment(issue, verdict)
  const current = stale[0] || null
  // La fila de timestamp cambia siempre: se compara sin ella para no escribir en bucle.
  if (current && stale.length === 1 && stripTimestamp(current.body) === stripTimestamp(wanted)) {
    return false
  }
  for (const c of stale.slice(1)) {
    await api('DELETE', `/repos/${REPO}/issues/comments/${c.id}`)
    log(`#${issue.number} ficha duplicada eliminada (${c.id})`)
  }
  if (current) await api('PATCH', `/repos/${REPO}/issues/comments/${current.id}`, { body: wanted })
  else await api('POST', `/repos/${REPO}/issues/${issue.number}/comments`, { body: wanted })
  return true
}

// ── Aplicacion de labels ──────────────────────────────────────────────────────
function targetLabels(verdict) {
  const target = new Set([verdict.type, verdict.priority])
  target.add(verdict.area || TRIAGE_LABEL)
  return target
}

const isManaged = (name) =>
  name === TRIAGE_LABEL ||
  name === TYPE_PREFIX || name.startsWith(TYPE_PREFIX) ||
  name.startsWith(AREA_PREFIX) ||
  name.startsWith(PRIORITY_PREFIX)

async function applyLabels(issue, target) {
  const current = labelNames(issue)
  const currentSet = new Set(current)
  const toAdd = [...target].filter((l) => !currentSet.has(l))
  const toRemove = current.filter((l) => isManaged(l) && !target.has(l))

  if (toAdd.length) {
    await api('POST', `/repos/${REPO}/issues/${issue.number}/labels`, { labels: toAdd })
    log(`#${issue.number} + ${toAdd.join(', ')}`)
  }
  for (const l of toRemove) {
    await api('DELETE', `/repos/${REPO}/issues/${issue.number}/labels/${encodeURIComponent(l)}`)
    log(`#${issue.number} - ${l}`)
  }
  return current.filter((l) => !toRemove.includes(l)).concat(toAdd)
}

// ── Tracker pineado ───────────────────────────────────────────────────────────
const PRIO_RANK = { 'prioridad:alta': 0, 'prioridad:media': 1, 'prioridad:baja': 2 }
const rankOf = (names) => PRIO_RANK[names.find((n) => n.startsWith(PRIORITY_PREFIX))] ?? 9

function issueRow(i, withArea) {
  const names = labelNames(i)
  const pr = names.find((n) => n.startsWith(PRIORITY_PREFIX)) || '—'
  const ty = names.find((n) => n.startsWith(TYPE_PREFIX)) || '—'
  const ar = names.find((n) => n.startsWith(AREA_PREFIX)) || '⚠️ sin área'
  const warn = names.includes(TRIAGE_LABEL) ? ' ⚠️' : ''
  const head = withArea
    ? ['#', 'Título', 'Área', 'Tipo', 'Prioridad', 'Autor']
    : ['#', 'Título', 'Tipo', 'Prioridad', 'Autor']
  const cells = withArea
    ? [`#${i.number}`, i.title, ar, ty, pr, i.user.login]
    : [`#${i.number}`, i.title, ty, pr, i.user.login]
  return { head, cells: cells.map(escapeCell), warn }
}

function mdTable(head, rows) {
  return [
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.cells.join(' | ')} |${r.warn || ''}`)
  ].join('\n')
}

function sortIssues(list) {
  return [...list].sort((a, b) => rankOf(labelNames(a)) - rankOf(labelNames(b)) || a.number - b.number)
}

function collect(issues) {
  const byArea = new Map()
  for (const i of issues) {
    const areas = labelNames(i).filter((n) => n.startsWith(AREA_PREFIX))
    for (const a of (areas.length ? areas : ['(sin área)'])) {
      if (!byArea.has(a)) byArea.set(a, [])
      byArea.get(a).push(i)
    }
  }
  return byArea
}

function renderTrackerBody(issues) {
  const byArea = collect(issues)
  const out = [
    MARKER_TRACKER,
    '',
    '## Índice de issues abiertos',
    '',
    `_${issues.length} issues abiertos · ${today()} · ver también [docs/ISSUES.md](${blobUrl('docs/ISSUES.md')})_`,
    '',
    'Ordenados por prioridad. ⚠️ = sin clasificar, necesita triage manual.',
    ''
  ]
  for (const area of [...byArea.keys()].sort()) {
    out.push(`### ${area} (${byArea.get(area).length})`, '')
    out.push(mdTable(['#', 'Título', 'Tipo', 'Prioridad', 'Autor'],
      sortIssues(byArea.get(area)).map((i) => issueRow(i, false))))
    out.push('')
  }
  if (!issues.length) out.push('_No hay issues abiertos._', '')
  out.push('---', '',
    '_Generado por `.github/workflows/issue-triage.yml`. Se refresca con cada evento de issue y a diario. No editar a mano._')
  return out.join('\n')
}

async function listIssues(state) {
  const out = []
  for await (const i of paginate(`/repos/${REPO}/issues`, { state })) {
    if (i.pull_request) continue
    if ((i.body || '').includes(MARKER_TRACKER)) continue
    out.push(i)
  }
  return out
}

async function refreshTracker() {
  const issues = sortIssues(await listIssues('open'))
  const body = renderTrackerBody(issues)

  let existing = null
  for await (const i of paginate(`/repos/${REPO}/issues`, { state: 'open' })) {
    if ((i.body || '').includes(MARKER_TRACKER)) { existing = i; break }
  }

  if (existing) {
    if (existing.body === body) return { changed: false, number: existing.number, count: issues.length }
    await api('PATCH', `/repos/${REPO}/issues/${existing.number}`, { body })
    log(`tracker actualizado: #${existing.number} (${issues.length} issues)`)
    return { changed: true, number: existing.number, count: issues.length }
  }

  const created = await api('POST', `/repos/${REPO}/issues`, { title: TRACKER_TITLE, body })
  await pinIssue(created.node_id, true)
  log(`tracker creado y pineado: #${created.number}`)
  return { changed: true, number: created.number, count: issues.length }
}

// REST no expone el pin: hay que ir por GraphQL.
async function pinIssue(nodeId, pin) {
  if (!nodeId) return
  try {
    await graphql(
      `mutation($id: ID!) { ${pin ? 'pinIssue' : 'unpinIssue'}(input: { issueId: $id }) { issue { number isPinned } } }`,
      { id: nodeId })
    log(`tracker pineado`)
  } catch (e) {
    log(`aviso: no se pudo pinear (${e.message})`)
  }
}

// ── docs/ISSUES.md versionado ─────────────────────────────────────────────────
function renderIssuesDoc(issues) {
  const open = sortIssues(issues.filter((i) => i.state === 'open'))
  const has = (n) => (i) => labelNames(i).includes(n)
  const byType = TYPES.map((t) => `\`${t.name}\` ${open.filter(has(t.name)).length}`).join(' · ')

  return [
    '<!-- Generado por .github/workflows/issue-triage.yml. No editar a mano. -->',
    '',
    '# Índice de issues',
    '',
    '_Archivo autogenerado. La fuente de verdad son los issues de GitHub; esto existe para tener el backlog versionado junto al código._',
    '',
    `Actualizado: ${nowStamp()}`,
    '',
    '## Resumen',
    '',
    `- Abiertos: **${open.length}**`,
    `- Sin clasificar ⚠️: **${open.filter(has(TRIAGE_LABEL)).length}**`,
    `- Alta \`prioridad:alta\`: **${open.filter(has('prioridad:alta')).length}**`,
    `- Por tipo: ${byType}`,
    '',
    '## Por área',
    '',
    ...AREAS.map((a) => `- \`${a.name}\` — **${open.filter(has(a.name)).length}**`),
    '',
    '## Detalle',
    '',
    open.length
      ? mdTable(['#', 'Título', 'Área', 'Tipo', 'Prioridad', 'Autor'], open.map((i) => issueRow(i, true)))
      : '_No hay issues abiertos._',
    '',
    '---',
    '',
    '_Para regenerar a mano: Actions → _issue-triage_ → Run workflow._'
  ].join('\n')
}

async function commitIssuesDoc() {
  const all = []
  for await (const i of paginate(`/repos/${REPO}/issues`, { state: 'all' })) {
    if (i.pull_request) continue
    if ((i.body || '').includes(MARKER_TRACKER)) continue
    all.push(i)
  }
  const path = 'docs/ISSUES.md'
  const content = renderIssuesDoc(all)
  const current = await api('GET', `/repos/${REPO}/contents/${path}?ref=${BRANCH}`, null, true)
  const encoded = Buffer.from(content, 'utf8').toString('base64')

  if (current && current.type === 'file') {
    if (Buffer.from(current.content, 'base64').toString('utf8') === content) {
      return { changed: false }
    }
    await api('PUT', `/repos/${REPO}/contents/${path}`, {
      message: 'chore(issues): actualizar docs/ISSUES.md [skip ci]',
      content: encoded, branch: BRANCH, sha: current.sha
    })
  } else {
    await api('PUT', `/repos/${REPO}/contents/${path}`, {
      message: 'chore(issues): agregar docs/ISSUES.md [skip ci]',
      content: encoded, branch: BRANCH
    })
  }
  log('docs/ISSUES.md commiteado')
  return { changed: true }
}

// ── Orquestacion ──────────────────────────────────────────────────────────────
const REFRESH_ONLY = new Set(['labeled', 'unlabeled', 'closed', 'reopened', 'transferred', 'deleted'])

async function triageIssue(payloadIssue, action) {
  if (payloadIssue.pull_request) { log('es un pull request, se ignora'); return }

  if (REFRESH_ONLY.has(action)) {
    log(`#${payloadIssue.number} ${action}: no se reclasifica, solo se refresca el índice`)
    return
  }

  // El payload del webhook puede venir viejo: un re-run del job reenvía el
  // evento original. Releer el issue evita reescribir body y labels sin cambio.
  const issue = await api('GET', `/repos/${REPO}/issues/${payloadIssue.number}`)
  log(`#${issue.number} payload ${payloadIssue.labels.length} labels, estado real ${issue.labels.length} labels`)

  const verdict = classify(issue)
  log(`#${issue.number} veredicto: ${verdict.type} / ${verdict.area || '⚠️'} / ${verdict.priority} (${verdict.resolvedBy})`)

  let labels = await applyLabels(issue, targetLabels(verdict))

  const wantedBody = normalizeBody(issue, verdict)
  if (wantedBody !== (issue.body || '')) {
    await api('PATCH', `/repos/${REPO}/issues/${issue.number}`, { body: wantedBody })
    log(`#${issue.number} cuerpo normalizado`)
    issue.body = wantedBody
    if (!labels.includes(FORMATTED_LABEL)) {
      await api('POST', `/repos/${REPO}/issues/${issue.number}/labels`, { labels: [FORMATTED_LABEL] })
      labels = labels.concat(FORMATTED_LABEL)
      log(`#${issue.number} + ${FORMATTED_LABEL}`)
    }
  }

  // La ficha se genera con el cuerpo ya normalizado, para que el checklist cuente bien.
  issue.labels = labels
  if (await syncMetaComment(issue, verdict)) {
    log(`#${issue.number} ficha de triage actualizada`)
  }
}

async function main() {
  if (!TOKEN) {
    die(
      'falta TRIAGE_TOKEN. Se espera el installation token de la GitHub App ' +
      'asteroids-triage, que crea el paso "Crear token de instalacion" ' +
      '(actions/create-github-app-token@v3). Revisa que esten ' +
      'vars.APP_CLIENT_ID y el secret APP_PRIVATE_KEY, y que la App tenga ' +
      'Issues: Read & write y Contents: Read & write. No hay fallback a ' +
      'GITHUB_TOKEN a proposito. Ver docs/ISSUE_AUTOMATION.md'
    )
  }
  if (!OWNER || !NAME) die(`GITHUB_REPOSITORY invalido: "${REPO}"`)

  // Nunca se imprime el token, pero si deja constancia de que credencial uso el
  // run, que es lo primero que hace falta saber cuando algo falla.
  const slug = process.env.APP_SLUG
  const inst = process.env.APP_INSTALLATION_ID
  log(`credencial: App ${slug || '?'} (instalacion ${inst || '?'})`)

  const event = EVENT_PATH && existsSync(EVENT_PATH)
    ? JSON.parse(readFileSync(EVENT_PATH, 'utf8'))
    : {}
  const action = event.action || ''

  await ensureLabels()

  if (EVENT_NAME === 'issues') {
    if (!event.issue) die('evento issues sin payload de issue')
    if ((event.issue.body || '').includes(MARKER_TRACKER)) {
      log('el evento es del propio tracker, se ignora')
    } else {
      await triageIssue(event.issue, action)
    }
  } else {
    log(`trigger ${EVENT_NAME}: solo refresco de índice`)
  }

  const tracker = await refreshTracker()
  log(`tracker: ${tracker.changed ? 'actualizado' : 'sin cambios'} (#${tracker.number}, ${tracker.count} abiertos)`)

  const doc = await commitIssuesDoc()
  log(`docs/ISSUES.md: ${doc.changed ? 'commiteado' : 'sin cambios'}`)
}

main().catch((e) => {
  console.error(`[triage] fallo: ${e.message}`)
  process.exit(1)
})
