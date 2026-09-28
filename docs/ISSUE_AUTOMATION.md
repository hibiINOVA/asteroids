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

## Por qué este workflow puede auto-dispararse (y cómo lo evita)

El workflow escribe con una **GitHub App**, no con el `GITHUB_TOKEN` automático.
Es una diferencia con consecuencias en las dos direcciones:

- Los writes hechos con `GITHUB_TOKEN` **no** generan eventos `issues`, así que
  el workflow nunca se auto-dispara.
- Los writes hechos con una App **sí** los generan. Sin más, cada vez que el bot
  normaliza un cuerpo o pone una label, GitHub crearía un run nuevo, ese run
  escribiría otra vez, y así hasta el infinito.

La barrera es un `if` a nivel de job:

```yaml
if: >-
  github.event_name == 'schedule' ||
  github.event_name == 'workflow_dispatch' ||
  github.event.sender.type != 'Bot'
```

Una App emite `sender.type: Bot` y una persona `type: User`, así que el guard
distingue las escrituras del bot de las humanas sin necesidad de una variable
extra con el slug de la App. De propina también se omiten los runs de
Dependabot y de cualquier otro bot.

Lo que **no** se puede evitar es que GitHub cree el registro del run: el guard
salta el job, no la creación del run. Salen runs extra marcados como *skipped* en
la pestaña Actions, pero no consumen minutos.

La otra red de seguridad es que el script es idempotente (ver más abajo): un run
encadenado que se colara no escribiría nada.

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

## Credenciales

El script lee **una sola** variable de entorno, `TRIAGE_TOKEN`, y es el
*installation token* que crea el paso `actions/create-github-app-token@v3` de
cada run.

| | |
| --- | --- |
| **Quién escribe** | la App `asteroids-triage` |
| **Qué escribe** | issues (cuerpo, labels, ficha, tracker) y `docs/ISSUES.md` |
| **Permisos de la App** | `Issues: Read & write`, `Contents: Read & write`. Nada más. |
| **Vencimiento** | 1 hora por token, pero se re-mintea en cada run. No hay nada que renovar. |
| **Si falta** | el job falla con instrucciones. **No hay fallback a `GITHUB_TOKEN`.** |

El `GITHUB_TOKEN` automático sigue existiendo en el job, pero ya solo se usa
para el `checkout`: el bloque `permissions:` del workflow bajó a
`contents: read`, así que no puede escribir ni en issues ni en el repo. Esa es
la ventaja de seguridad de la App — el workflow corre con el mismo poder que
tú, no con el poder de un PAT tuyo.

Los permisos se piden explícitamente en el paso de la action
(`permission-issues: write`, `permission-contents: write`) a propósito: eso hace
que la action valide contra el registro de la App y falle ahí, con un mensaje
de GitHub, en vez de reventar a mitad de la normalización con un `403` críptico.

> **Por qué una App y no un PAT.** Un personal access token emite sus eventos
> atribuyéndolos a la persona propietaria del token, no a un actor automático
> (`sender.type` sale `User`, no `Bot`). Si el PAT fuera tuyo, el guard por actor
> no podría distinguir las escrituras del bot de las tuyas y el workflow no
> triagearía nunca. Solo una App —o un PAT en una cuenta bot dedicada— resuelve
> las dos cosas a la vez.

## Puesta en marcha

Una vez, a mano. Son cinco minutos y no hay que repetirlos nunca.

1. **Mergea** el workflow a la rama por defecto (`main`).
2. **Crea la App.** Settings → Apps → Developer settings → New GitHub App:
   - App name: `asteroids-triage`
   - Repository permissions: `Issues` → *Read & write*, `Contents` → *Read & write*.
     Deja todo lo demás en *No access*.
   - Pulsa **Generate a private key** y descarga el `.pem`.
3. **Instálala** en el repo, y solo en él (no en la cuenta entera).
4. **Guarda las credenciales** en Settings → Secrets and variables → Actions:
   - pestaña *Actions* → **New repository variable** → `APP_CLIENT_ID` con el
     *Client ID* de la App. Ojo: es el **Client ID**, no el App ID.
   - pestaña *Actions* → **New repository secret** → `APP_PRIVATE_KEY` con el
     contenido del `.pem` entero. Sirve pegado con saltos de línea reales o con
     los `\n` literales: la action normaliza los dos formatos.
5. **Lanza el workflow a mano**: Actions → issue-triage → Run workflow. Es lo
   que crea todas las labels, el issue *Tracker* pineado y el primer
   `docs/ISSUES.md`.

### Comprobar que quedó bien

Abre la pestaña Actions después de editar un issue. Deberías ver **un** run que
termina en verde y, si el bot normalizó algo, runs *skipped* debajo. Si en vez
de eso ves runs verdes encadenados uno tras otro, el guard no está evaluando
como esperamos: revisa el primero con el log abierto.

El log del run empieza con la línea de credencial, que confirma qué App se usó
sin imprimir el token:

```
[triage] credencial: App asteroids-triage (instalacion 12345678)
```

### Si se filtra la private key

1. Settings → Apps → Developer settings → tu App → **Delete app**.
2. Crear la App de nuevo y generar una private key nueva.
3. Actualizar `APP_PRIVATE_KEY`.

Rotar la private key es barato precisamente porque no hay que reinstalar la App
ni tocar nada más.

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
