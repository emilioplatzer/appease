<!--multilang v0 es:LEEME.md en:README.md -->
# appease

<!--lang:es-->

Normaliza + pacifica: deja los archivos de texto de un repositorio parejos y "en paz".

<!--lang:en--]

Make peace in this app.

[!--lang:*-->

<!-- cucardas -->
![designing](https://img.shields.io/badge/stability-designing-red.svg)
[![npm-version](https://img.shields.io/npm/v/appease.svg)](https://npmjs.org/package/appease)
[![downloads](https://img.shields.io/npm/dm/appease.svg)](https://npmjs.org/package/appease)
[![build](https://github.com/emilioplatzer/appease/actions/workflows/build-and-test.yml/badge.svg)](https://github.com/emilioplatzer/appease/actions/workflows/build-and-test.yml)
[![security](https://socket.dev/api/badge/npm/package/appease)](https://socket.dev/npm/package/appease)
[![qa-control](https://github.com/emilioplatzer/appease/actions/workflows/qa-control.yml/badge.svg)](https://github.com/emilioplatzer/appease/actions/workflows/qa-control.yml)

<!--multilang buttons-->

idioma: ![castellano](https://raw.githubusercontent.com/codenautas/multilang/master/img/lang-es.png)
también disponible en:
[![inglés](https://raw.githubusercontent.com/codenautas/multilang/master/img/lang-en.png)](README.md)

<!--lang:es-->
Herramienta para poner orden, **una vez**, en el formato de bajo nivel de los archivos de
un repo (fin de línea, BOM, espacios al final, salto de línea final, indentación) y dejar
configurada la convención para que mantenerla después sea gratis y los diffs queden limpios
y humanamente revisables.

<!--lang:en--]
A tool to bring order, **once**, to the low-level format of a repository's files (line
endings, BOM, trailing spaces, final newline, indentation), and to leave the convention
configured so that keeping it afterwards is free and diffs stay clean and humanly reviewable.

[!--lang:es-->
La idea de fondo: respetar "el formato exacto" en cada commit es un esfuerzo (sobre todo en
Windows, donde los fines de línea se mezclan solos). Si en cambio se normaliza una sola vez
y se fija la convención con `.gitattributes` + `.editorconfig` + `.vscode/settings.json`,
el costo desaparece.

<!--lang:en--]
The underlying idea: honoring "the exact format" on every commit is an effort (especially on
Windows, where line endings get mixed on their own). If instead you normalize once and pin
the convention with `.gitattributes` + `.editorconfig` + `.vscode/settings.json`, the cost
disappears.

[!--lang:es-->
El nombre es un juego de palabras entre **normalizar** y **pacificar**.

<!--lang:en--]
The name is a play on words between **normalize** and **appease** (to bring to peace).

[!--lang:*-->

---

<!--lang:es-->
## Qué normaliza, y dónde vive cada decisión

<!--lang:en--]
## What it normalizes, and where each decision lives

[!--lang:es-->
Cada "eje" de formato se controla desde **un solo archivo de configuración**, según qué
herramienta sea capaz de manejarlo. Para responder "¿qué le pasa a este archivo en tal eje?"
nunca hay que mirar dos archivos.

<!--lang:en--]
Each format "axis" is controlled from **a single configuration file**, depending on which
tool is capable of handling it. To answer "what happens to this file on a given axis?" you
never have to look at two files.

[!--lang:es-->
| Eje | Quién lo maneja | Archivo de config |
|---|---|---|
| Fin de línea (EOL) | Git | `.gitattributes` |
| BOM / charset | editor + normalificador | `.editorconfig` |
| Trailing spaces | editor + normalificador | `.editorconfig` |
| Salto de línea final | editor + normalificador | `.editorconfig` |
| Indentación (convención) | editor | `.editorconfig` |
| Mostrar whitespace al seleccionar | VSC | `.vscode/settings.json` |

<!--lang:en--]
| Axis | Who handles it | Config file |
|---|---|---|
| Line ending (EOL) | Git | `.gitattributes` |
| BOM / charset | editor + appease | `.editorconfig` |
| Trailing spaces | editor + appease | `.editorconfig` |
| Final newline | editor + appease | `.editorconfig` |
| Indentation (convention) | editor | `.editorconfig` |
| Show whitespace on selection | VSC | `.vscode/settings.json` |

[!--lang:es-->
### Fin de línea (EOL) — lo maneja Git

<!--lang:en--]
### Line ending (EOL) — handled by Git

[!--lang:es-->
Va en `.gitattributes`, que es **per-repo y pisa la configuración global de Git**, así que no
hace falta tocar nada del Git global (ni romper otros repos que dependan de su comportamiento).

<!--lang:en--]
It lives in `.gitattributes`, which is **per-repo and overrides Git's global configuration**,
so there's no need to touch anything in global Git (nor break other repos that rely on its
behavior).

[!--lang:*-->

```gitattributes
# Default: on commit, Git normalizes to LF in the repo (EOL disappears from diffs);
# on checkout, it delivers the OS-native EOL (CRLF on Windows, LF on Linux).
* text=auto

# One-off exceptions, one by one:
path/to/file.crlf   text eol=crlf   # always CRLF, everywhere
path/to/file.lf     text eol=lf     # always LF, everywhere
path/to/file.raw    -text           # byte for byte: leave everything as-is (commit and checkout)
```

<!--lang:es-->
Requisito (asumido a propósito): este default da EOL **nativo** porque cada máquina lo
resuelve con su `core.eol`, cuyo valor por defecto (sin setear) ya es `native`. El
normalificador **no toca la configuración de Git** —ni global ni local—, así que el EOL
nativo queda como un requisito del entorno: funciona siempre que `core.eol` no esté fijado a
`lf`/`crlf`. Se verifica, sin modificar nada, con `git config --get core.eol`.

<!--lang:en--]
Requirement (assumed on purpose): this default yields **native** EOL because each machine
resolves it via its `core.eol`, whose default value (when unset) is already `native`. appease
**does not touch Git's configuration** —neither global nor local— so native EOL remains an
environment requirement: it works as long as `core.eol` is not pinned to `lf`/`crlf`. You can
verify it, without changing anything, with `git config --get core.eol`.

[!--lang:es-->
Al adoptar o cambiar el `.gitattributes`, los archivos ya commiteados no se reescriben solos;
hace falta una pasada única: `git add --renormalize .`.

<!--lang:en--]
When adopting or changing `.gitattributes`, already-committed files are not rewritten on
their own; a one-time pass is needed: `git add --renormalize .`.

[!--lang:es-->
### BOM / charset — lo maneja `.editorconfig`

<!--lang:en--]
### BOM / charset — handled by `.editorconfig`

[!--lang:es-->
Git **no** sabe agregar ni quitar el BOM; por eso este eje vive en `.editorconfig` (que VSC
respeta en vivo) y lo aplica el normalificador.

<!--lang:en--]
Git does **not** know how to add or remove the BOM; that's why this axis lives in
`.editorconfig` (which VSC honors live) and appease applies it.

[!--lang:es-->
- Default: **UTF-8 sin BOM** (lo sano para JS/TS/JSON/web).
- `charset = utf-8-bom` → con BOM fijo (PowerShell 5.1 con no-ASCII, CSV para Excel, etc.).
- `charset = unset` → dejá el BOM como está, no lo toques.

<!--lang:en--]
- Default: **UTF-8 without BOM** (the sane choice for JS/TS/JSON/web).
- `charset = utf-8-bom` → with a fixed BOM (PowerShell 5.1 with non-ASCII, CSV for Excel, etc.).
- `charset = unset` → leave the BOM as-is, don't touch it.

[!--lang:es-->
### Trailing spaces y salto de línea final — `.editorconfig`

<!--lang:en--]
### Trailing spaces and final newline — `.editorconfig`

[!--lang:es-->
- `trim_trailing_whitespace = true` → quitar (default). `= false` → dejar como están
  (típico en Markdown, donde dos espacios al final son un salto de línea intencional).
- `insert_final_newline = true` → garantizar exactamente uno (default). `= false` → dejar
  como está.

<!--lang:en--]
- `trim_trailing_whitespace = true` → trim (default). `= false` → leave them as-is
  (typical in Markdown, where two trailing spaces are an intentional line break).
- `insert_final_newline = true` → guarantee exactly one (default). `= false` → leave
  as-is.

[!--lang:es-->
### Indentación — convención para el editor, **no** reescritura

<!--lang:en--]
### Indentation — a convention for the editor, **not** a rewrite

[!--lang:es-->
Por ahora la indentación se trata como **convención**, no como reescritura masiva (convertir
tab↔espacios es estructural, depende del lenguaje —Makefile *exige* tabs, Go usa tabs— y es
justo lo más invasivo).

<!--lang:en--]
For now indentation is treated as a **convention**, not as a mass rewrite (converting
tab↔spaces is structural, it depends on the language —Makefile *requires* tabs, Go uses tabs—
and it's exactly the most invasive change).

[!--lang:es-->
- `.editorconfig`: `indent_style = space` (para no seguir agregando tabs), con excepciones
  registradas (`[Makefile] indent_style = tab`, Go, etc.).
- `.vscode/settings.json`: `editor.renderWhitespace = "selection"`, para que el whitespace se
  vea **solo al seleccionar** texto (los tabs aparecen como flechitas bajo demanda; sin
  selección no se ve nada). Se fija en el repo para garantizar ese comportamiento a todo el
  equipo, sin depender del default de VSC de cada uno.

<!--lang:en--]
- `.editorconfig`: `indent_style = space` (to stop adding more tabs), with registered
  exceptions (`[Makefile] indent_style = tab`, Go, etc.).
- `.vscode/settings.json`: `editor.renderWhitespace = "selection"`, so that whitespace is
  shown **only when selecting** text (tabs appear as little arrows on demand; with no
  selection nothing shows). It's pinned in the repo to guarantee that behavior for the whole
  team, without depending on each person's VSC default.

[!--lang:*-->

```json
{
  "editor.renderWhitespace": "selection"
}
```

<!--lang:es-->
La conversión efectiva de tabs queda **fuera** de este workflow por ahora (ver `--tabs-*`).

<!--lang:en--]
The actual conversion of tabs stays **out** of this workflow for now (see `--tabs-*`).

[!--lang:es-->
### Ejemplo de `.editorconfig`

<!--lang:en--]
### Example `.editorconfig`

[!--lang:*-->

```editorconfig
root = true

# Default for everything
[*]
charset = utf-8                  # no BOM
trim_trailing_whitespace = true
insert_final_newline = true
indent_style = space

# Markdown: the two trailing spaces are intentional
[*.md]
trim_trailing_whitespace = false

# Examples of one-off exceptions
[test/fixtures/excel/**]
charset = utf-8-bom

[test/fixtures/raw/**]
charset = unset
trim_trailing_whitespace = false
insert_final_newline = false

[Makefile]
indent_style = tab
```

---

<!--lang:es-->
## Comandos

<!--lang:en--]
## Commands

[!--lang:es-->
Todos los comandos imprimen al final **qué archivos crearon o modificaron**.

Cada comando toma el directorio a procesar como argumento posicional opcional
(`appease <comando> [dir]`; por defecto, el directorio actual).

<!--lang:en--]
Every command prints at the end **which files it created or modified**.

Each command takes the directory to process as an optional positional argument
(`appease <command> [dir]`; defaults to the current directory).


[!--lang:es-->
| Comando | Lee | Escribe | Destructivo |
|---|---|---|---|
| `audit` | configs existentes (o los defaults que propondría) + los archivos | nada, solo **reporta** lo que está fuera de norma | no |
| `add-config-defaults` | — | los configs con **defaults puros** (sin mirar la realidad) | no (solo crea config) |
| `adapt-configs` | configs + audit | crea o **adapta** los configs para reflejar lo encontrado | no toca el código fuente |
| `fix-format` | configs | **modifica los archivos** (BOM, trailing, newline; EOL vía Git) respetando los configs | sí (Git revierte) |

<!--lang:en--]
| Command | Reads | Writes | Destructive |
|---|---|---|---|
| `audit` | existing configs (or the defaults it would propose) + the files | nothing, only **reports** what is out of spec | no |
| `add-config-defaults` | — | the configs with **pure defaults** (without looking at reality) | no (only creates config) |
| `adapt-configs` | configs + audit | creates or **adapts** the configs to reflect what was found | does not touch source code |
| `fix-format` | configs | **modifies the files** (BOM, trailing, newline; EOL via Git) honoring the configs | yes (Git reverts) |

[!--lang:es-->
### `audit`: formato del reporte

<!--lang:en--]
### `audit`: report format

[!--lang:es-->
`audit` imprime un JSON canónico con **dos** listas. La clave es que los archivos
**conformes no aparecen en ninguna**: solo se listan los que requieren atención y los que no
se pudieron evaluar. Un repo limpio da ambas listas vacías:

<!--lang:en--]
`audit` prints canonical JSON with **two** lists. The key point is that conforming files
**appear in neither**: only the ones that need attention and the ones that couldn't be
evaluated are listed. A clean repo yields both lists empty:

[!--lang:*-->

```json
{
  "findings": [],
  "notAnalyzed": []
}
```

<!--lang:es-->
- **`findings`**: archivos **analizados que se desvían** de su config resuelta. Cada entrada
  trae `path`, `deviations` (ejes que difieren de lo que pide la config) y `unresolved` (ejes
  gobernados por un valor de config no reconocido: no se evalúan, se reportan como están).
- **`notAnalyzed`**: archivos que **no se analizaron**, con su `reason`
  (`binary-extension`, `binary-content`, `gitattributes-notext`, `non-utf8`).

<!--lang:en--]
- **`findings`**: **analyzed files that deviate** from their resolved config. Each entry
  carries `path`, `deviations` (axes that differ from what the config asks for) and
  `unresolved` (axes governed by an unrecognized config value: not evaluated, reported as-is).
- **`notAnalyzed`**: files that were **not analyzed**, with their `reason`
  (`binary-extension`, `binary-content`, `gitattributes-notext`, `non-utf8`).

[!--lang:es-->
Este formato es **provisional**: hoy el output es la serialización directa del tipo
`AuditResult`, pensada para parsear y testear fácil. Puede crecer si el valor lo justifica.

<!--lang:en--]
This format is **provisional**: today the output is the direct serialization of the
`AuditResult` type, meant to be easy to parse and test. It may grow if the value justifies it.

[!--lang:es-->
### `adapt-configs`: registra toda desviación como excepción

<!--lang:en--]
### `adapt-configs`: records every deviation as an exception

[!--lang:es-->
`adapt-configs` registra **toda** desviación encontrada como excepción explícita, en todos
los ejes por igual (sin clasificar ni adivinar intención). Esto da una invariante de
seguridad: **justo después de `adapt-configs`, un `fix-format` no cambia nada**, porque la
config describe la realidad al 100%. Recién cuando uno **poda** (borra) excepciones,
`fix-format` toca *eso y solo eso*.

<!--lang:en--]
`adapt-configs` records **every** deviation it finds as an explicit exception, across all
axes equally (without classifying or guessing intent). This gives a safety invariant: **right
after `adapt-configs`, a `fix-format` changes nothing**, because the config describes
reality 100%. Only when you **prune** (delete) exceptions does `fix-format` touch *that and
only that*.

[!--lang:es-->
Así, "está todo mal y lo quiero arreglar de una" se resuelve borrando el bloque de
excepciones: todo cae al default → `fix-format` reescribe lo que haga falta.

<!--lang:en--]
So, "everything is wrong and I want to fix it all at once" is solved by deleting the block of
exceptions: everything falls back to the default → `fix-format` rewrites whatever is needed.

[!--lang:es-->
Detalles de comportamiento:

<!--lang:en--]
Behavior details:

[!--lang:es-->
- Una desviación puede ser **multi-eje** en un mismo archivo (CRLF + trailing + sin newline
  final + BOM). Su entrada cubre varias propiedades; borrarla revierte ese archivo entero al
  default. Para conservar una sola propiedad (raro) se edita la línea en vez de borrarla.
- Cada excepción cae en el **archivo dueño del eje**: EOL → `.gitattributes`, el resto →
  `.editorconfig`. "Marcar todo y borrar" es por archivo de config (dos lugares).

<!--lang:en--]
- A deviation can be **multi-axis** in a single file (CRLF + trailing + no final newline +
  BOM). Its entry covers several properties; deleting it reverts that entire file to the
  default. To keep a single property (rare) you edit the line instead of deleting it.
- Each exception lands in the **file that owns the axis**: EOL → `.gitattributes`, the rest →
  `.editorconfig`. "Select all and delete" is per config file (two places).

[!--lang:es-->
### `--tabs-*` (fuera por ahora)

<!--lang:en--]
### `--tabs-*` (out of scope for now)

[!--lang:es-->
La conversión de indentación (tab→espacios o viceversa) queda como switches aparte, a definir
más adelante, por ser estructural, riesgosa y dependiente del lenguaje. Mientras tanto, los
tabs se corrigen a mano.

<!--lang:en--]
Indentation conversion (tab→spaces or vice versa) is left as separate switches, to be defined
later, since it's structural, risky and language-dependent. In the meantime, tabs are fixed
by hand.

[!--lang:*-->

---

<!--lang:es-->
## Workflow sugerido

<!--lang:en--]
## Suggested workflow

[!--lang:es-->
0. *(opcional)* `add-config-defaults` → **commit**. Deja versionado el "norte" (la norma
   pura), para que en el paso 1 las desviaciones salten en el diff contra esa norma.
1. `adapt-configs` → el `git diff` de los configs muestra **cada excepción agregada = cada
   desviación**. Ese diff es el reporte de verdad.
2. Revisar esas excepciones: dejar las que eran a propósito, **borrar** a mano las que eran
   porquería (si está casi todo mal, borrar todo el bloque).
3. `fix-format` → normaliza todo lo que ya no quede protegido por una excepción.

<!--lang:en--]
0. *(optional)* `add-config-defaults` → **commit**. Versions the "north star" (the pure
   norm), so that in step 1 deviations stand out in the diff against that norm.
1. `adapt-configs` → the `git diff` of the configs shows **every added exception = every
   deviation**. That diff is the real report.
2. Review those exceptions: keep the ones that were on purpose, **delete** by hand the ones
   that were junk (if almost everything is wrong, delete the whole block).
3. `fix-format` → normalizes everything no longer protected by an exception.

[!--lang:es-->
Como Git revierte cualquier cosa, los pasos destructivos son seguros de probar.

<!--lang:en--]
Since Git reverts anything, the destructive steps are safe to try.

[!--lang:*-->

---

<!--lang:es-->
## Arquitectura

<!--lang:en--]
## Architecture

[!--lang:es-->
Pensado para **vivir solo** y poder integrarse luego como dependencia de otra herramienta.

<!--lang:en--]
Designed to **stand on its own** and to be integrable later as a dependency of another tool.

[!--lang:es-->
La transformación de texto está separada de la orquestación (Git, sistema de archivos, args),
para que el núcleo sea puro y testeable.

<!--lang:en--]
Text transformation is separated from orchestration (Git, file system, args), so the core is
pure and testable.

[!--lang:es-->
### Función pura (con sus tests)

<!--lang:en--]
### Pure function (with its tests)

[!--lang:es-->
El corazón es una función sin efectos: recibe el contenido de un archivo (ya decodificado) y
las opciones resueltas para ese archivo, y devuelve el contenido normalizado más un reporte
de qué cambió. No toca disco, ni Git, ni argumentos.

<!--lang:en--]
The heart is a side-effect-free function: it receives a file's content (already decoded) and
the options resolved for that file, and returns the normalized content plus a report of what
changed. It touches neither disk, nor Git, nor arguments.

[!--lang:*-->

```
normalizeText(content: string, options: Options): { content: string; report: Report }
```

<!--lang:es-->
- `Options`: BOM (quitar | poner | dejar), trailing (quitar | dejar), newline final
  (garantizar | dejar). (El EOL es responsabilidad de Git, no de esta función.)
- `Report`: qué se modificó (para no fallar en silencio).

<!--lang:en--]
- `Options`: BOM (remove | add | keep), trailing (trim | keep), final newline (ensure | keep).
  (EOL is Git's responsibility, not this function's.)
- `Report`: what was modified (so as not to fail silently).

[!--lang:es-->
La auditoría también tiene su núcleo puro: dada una porción de texto, detecta su estado
actual (EOL crlf/lf/mixto, BOM sí/no, trailing sí/no, newline final, indentación
tabs/espacios/mezcla).

<!--lang:en--]
The audit also has its pure core: given a chunk of text, it detects its current state (EOL
crlf/lf/mixed, BOM yes/no, trailing yes/no, final newline, indentation tabs/spaces/mixed).

[!--lang:es-->
Casos de test: CRLF↔LF, EOL mixto, trailing, falta/exceso de newline final, BOM presente/
ausente, archivo vacío, e **idempotencia** (correr dos veces no cambia nada).

<!--lang:en--]
Test cases: CRLF↔LF, mixed EOL, trailing, missing/excess final newline, BOM present/absent,
empty file, and **idempotence** (running twice changes nothing).

[!--lang:es-->
Tipado fuerte, `strict`, sin `any`. Los errores se tratan, no se ignoran.

<!--lang:en--]
Strongly typed, `strict`, no `any`. Errors are handled, not ignored.

[!--lang:*-->

### `cli.ts`

<!--lang:es-->
Mapea los comandos (`audit`, `add-config-defaults`, `adapt-configs`, `fix-format`) a
llamadas TS y orquesta los efectos:

<!--lang:en--]
Maps the commands (`audit`, `add-config-defaults`, `adapt-configs`, `fix-format`) to
TS calls and orchestrates the effects:

[!--lang:es-->
1. Descubre archivos (`git ls-files`), saltea binarios y los marcados `-text`.
2. Lee `.gitattributes` y `.editorconfig` para resolver las opciones por archivo.
3. Según el comando: solo reporta, genera/adapta configs, o lee cada archivo, llama a la función
   pura y reescribe si cambió.
4. Imprime el resumen de archivos creados/modificados.

<!--lang:en--]
1. Discovers files (`git ls-files`), skips binaries and the ones marked `-text`.
2. Reads `.gitattributes` and `.editorconfig` to resolve the per-file options.
3. Depending on the command: only reports, generates/adapts configs, or reads each file, calls
   the pure function and rewrites if it changed.
4. Prints the summary of created/modified files.

[!--lang:*-->

---

<!--lang:es-->
## Pendientes a definir al implementar

<!--lang:en--]
## To be defined at implementation time

[!--lang:es-->
- Valor por defecto de `indent_size` (probablemente detectado por proyecto/lenguaje).
- Formato exacto del reporte de `audit` (hoy provisional, documentado más arriba).
- Detección de binarios y manejo de archivos en encodings distintos de UTF-8.
- Switches concretos de `--tabs-*`.

<!--lang:en--]
- Default value for `indent_size` (probably detected per project/language).
- Exact format of the `audit` report (provisional today, documented above).
- Binary detection and handling of files in encodings other than UTF-8.
- Concrete `--tabs-*` switches.

[!--lang:*-->
