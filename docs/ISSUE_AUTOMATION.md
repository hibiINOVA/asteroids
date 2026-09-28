# Automatización de issues

Cada issue creado en este repo pasa por `issue-triage`, un workflow que formatea
el cuerpo, aplica labels, publica una ficha de triage y mantiene el backlog al día.

```
.github/
├── ISSUE_TEMPLATE/
│   ├── bug.yml          # formulario de bug
│   ├── feature.yml      # formulario de feature / mejora
│   └── config.yml       # menú de plantillas
├── scripts/triage.mjs   # toda la lógica
└── workflows/issue-triage.yml
```

## Qué hace

| Paso | Resultado |
| --- | --- |
| **Siembra labels** | Crea las que falten antes de clasificar. Necesario porque el campo `labels:` de un Issue Form **no aplica labels que no existan todavía** en el repo. |
| **Clasifica** | Tipo y área desde los campos del formulario; si no están, por keywords del título y el cuerpo. |
| **Normaliza el cuerpo** | Reordena el contenido en secciones fijas y agrega la que falte, sin tocar lo que ya está escrito. |
| **Ficha de triage** | Un único comentario actualizado con área, tipo, prioridad, origen de la clasificación y siguiente paso. |
| **Tracker** | Un issue pineado con el índice de issues abiertos agrupado por área y ordenado por prioridad. |
| **`docs/ISSUES.md`** | El mismo backlog versionado en el repo, commiteado automáticamente. |

## Secciones canónicas del cuerpo

Se respeta el contenido existente; solo se inserta lo que falta.

| Sección | Cuándo |
| --- | --- |
| `Contexto` | siempre |
| `Descripción` | siempre |
| `Pasos para reproducir` | solo si el tipo es `tipo:bug` |
| `Comportamiento esperado` | siempre |
| `Checklist` | siempre |
| `Notas de implementación` | siempre — la inyecta el bot |

`Notas de implementación` es el motivo principal de existir: lleva el contrato
técnico del repo dentro de cada issue, para que implementarlo no implique
descubrir otra vez que `dt` está acotado a `0.05`, que `pressed()` consume
`justPressed`, que el espacio es toroidal o que `POWERUP_TYPES` está indexado.

## Taxonomía de labels

**Tipo** — `tipo:bug` `tipo:feature` `tipo:mejora` `tipo:chore` `tipo:docs`

**Área** — `area:gameplay` `area:powerups` `area:skins` `area:render` `area:ui` `area:performance` `area:docs`

**Prioridad** — `prioridad:alta` `prioridad:media` `prioridad:baja`

**Estado** — `necesita-triage` (no se pudo clasificar) · `auto-formateado` (cuerpo normalizado)

El bot solo agrega y quita labels de esos grupos. **Los labels que pongas a mano
nunca se tocan.** Si pones `area:render` a un issue, el bot no se lo va a quitar
en la siguiente edición: en `labeled` y `unlabeled` directamente no reclasifica.

## Cuándo reclasifica

| Evento | Acción |
| --- | --- |
| `opened` | clasifica, normaliza, publica ficha, refresca índices |
| `edited` | idem (reclasifica con el texto nuevo) |
| `labeled` / `unlabeled` | **no** reclasifica, solo refresca los índices. Así no pelea con quien etiqueta a mano |
| `closed` / `reopened` | solo refresca los índices |
| `schedule` (diario) | refresca índices |
| `workflow_dispatch` | refresca índices |

Las escrituras hechas con `GITHUB_TOKEN` **no** disparan nuevos runs, así que
`.github/workflows/issue-triage.yml` nunca se auto-dispara. Eso evita bucles
infinitos, y a la vez significa que el tracker depende de los eventos humanos
— por eso está el cron diario y el `workflow_dispatch`.

## Cómo se decide el área

En orden de preferencia:

1. **El campo `Área` del Issue Form.** El bot parsea los `### <campo>` del cuerpo
   que genera GitHub y los cruza contra la lista `form` de cada label. Esa lista
   es el mapeo autoritativo: `Rendimiento — lag, fps` → `area:performance`.
2. **El veredicto de la ejecución anterior.** La primera línea del cuerpo
   normalizado guarda el `tipo`, el `área` y la `prioridad` que se aplicaron. Sin
   esto, normalizar un issue destroyiría la respuesta del formulario, que deja de
   estar en forma de campo al convertirse en secciones `##`.
3. **Keywords del título y la descripción** — solo sobre el texto del autor.

Cuando hay empate entre áreas, gana la específica: `gameplay` es el comodín y
siempre pierde contra `powerups`, `skins`, `render`, `performance`, `ui` o `docs`.

**La prioridad es la excepción:** los keywords se evalúan *antes* que el veredicto
anterior, para que escribir "crash" en una edición suba el issue a
`prioridad:alta` de verdad.

### Las notas del bot no clasifican

`Notas de implementación` cita `POWERUP_TYPES`, `MiniAlien`, `escudo`, `0.05`,
`130px`. Todo eso es vocabulario de `area:powerups` y de `area:performance`, así
que si entrara en el análisis, el bot reetiquetaría sus propios issues con cada
ejecución. Por eso `Checklist`, `Notas de implementación` y `Notas de gestión`
quedan **excluidas** del texto que alimenta las keywords: solo cuenta lo que
escribió una persona.

## Idempotencia

El workflow no escribe si nada cambió:

- cuerpo: se compara el markdown normalizado contra el actual antes del `PATCH`
- labels: se releen del estado real del issue y se compara el conjunto objetivo,
  así que en la segunda pasada no hay ni un `POST`
- ficha: la fila `Actualizado` cambia siempre, así que se compara **excluyendo**
  esa fila para no reescribir el comentario en cada ejecución
- tracker y `docs/ISSUES.md`: se compara el contenido y solo se commitea si difiere

Además, el script **vuelve a leer el issue desde la API** en vez de confiar en el
payload del webhook. Un re-run de un job fallido reenvía el evento original, con
las labels y el cuerpo de antes de la primera pasada; sin el re-fetch eso
reescribía cosas que ya estaban bien.

Comprobado: primera pasada escribe labels + cuerpo + ficha + tracker + doc; la
segunda solo actualiza la ficha (el origen pasa de "formulario" a "veredicto
previo"); **la tercera no escribe absolutamente nada**.

## Puesta en marcha

1. Merge a la rama por defecto. Hasta entonces GitHub no muestra los formularios.
2. **Settings → Actions → General → Workflow permissions**: el bloque
   `permissions:` del workflow ya pide `issues: write` y `contents: write`, pero
   si algún run falla con `403`, cambia el default del repo a *Read and write
   permissions*.
3. Lanza el workflow a mano una vez: **Actions → issue-triage → Run workflow**.
   Es lo que crea todas las labels, el issue *Tracker* pineado y el primer
   `docs/ISSUES.md`.

## Ajustar el comportamiento

Todo está en `.github/scripts/triage.mjs`, sin dependencias ni build:

- `TYPES`, `AREAS`, `PRIORITIES` — la taxonomía. Añadir un item lo crea como label.
- `KEYWORDS` y `PRIORITY_KEYWORDS` — las reglas de deducción por texto.
- `CANONICAL_SECTIONS` — las secciones del cuerpo, con `aliases` para aceptar los
  títulos que la gente escriba a mano.
- `IMPL_NOTES` y `CHECKLIST_ITEMS` — el contenido que se inyecta en cada issue.
- `REFRESH_ONLY` — los eventos que no reclasifican.

Después de cambiar algo, conviene relanzar el workflow a mano para ver el efecto
sobre los issues existentes: el tracker y `docs/ISSUES.md` se regeneran, pero la
ficha de triage solo se actualiza en el issue que dispare el evento.
