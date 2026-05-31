# normalificador

> Normaliza + pacifica: deja los archivos de texto de un repositorio parejos y "en paz".

Herramienta para poner orden, **una vez**, en el formato de bajo nivel de los archivos de
un repo (fin de línea, BOM, espacios al final, salto de línea final, indentación) y dejar
configurada la convención para que mantenerla después sea gratis y los diffs queden limpios
y humanamente revisables.

La idea de fondo: respetar "el formato exacto" en cada commit es un esfuerzo (sobre todo en
Windows, donde los fines de línea se mezclan solos). Si en cambio se normaliza una sola vez
y se fija la convención con `.gitattributes` + `.editorconfig` + `.vscode/settings.json`,
el costo desaparece.

El nombre es un juego de palabras entre **normalizar** y **pacificar**.

---

## Qué normaliza, y dónde vive cada decisión

Cada "eje" de formato se controla desde **un solo archivo de configuración**, según qué
herramienta sea capaz de manejarlo. Para responder "¿qué le pasa a este archivo en tal eje?"
nunca hay que mirar dos archivos.

| Eje | Quién lo maneja | Archivo de config |
|---|---|---|
| Fin de línea (EOL) | Git | `.gitattributes` |
| BOM / charset | editor + normalificador | `.editorconfig` |
| Trailing spaces | editor + normalificador | `.editorconfig` |
| Salto de línea final | editor + normalificador | `.editorconfig` |
| Indentación (convención) | editor | `.editorconfig` |
| Mostrar whitespace al seleccionar | VSC | `.vscode/settings.json` |

### Fin de línea (EOL) — lo maneja Git

Va en `.gitattributes`, que es **per-repo y pisa la configuración global de Git**, así que no
hace falta tocar nada del Git global (ni romper otros repos que dependan de su comportamiento).

```gitattributes
# Default: al subir, Git normaliza a LF en el repo (el EOL desaparece de los diffs);
# al bajar, entrega el EOL nativo del SO (CRLF en Windows, LF en Linux).
* text=auto

# Excepciones puntuales, una por una:
ruta/al/archivo.crlf   text eol=crlf   # siempre CRLF, en todos lados
ruta/al/archivo.lf     text eol=lf     # siempre LF, en todos lados
ruta/al/archivo.raw    -text           # byte por byte: dejá todo como está (subir y bajar)
```

Requisito (asumido a propósito): este default da EOL **nativo** porque cada máquina lo
resuelve con su `core.eol`, cuyo valor por defecto (sin setear) ya es `native`. El
normalificador **no toca la configuración de Git** —ni global ni local—, así que el EOL
nativo queda como un requisito del entorno: funciona siempre que `core.eol` no esté fijado a
`lf`/`crlf`. Se verifica, sin modificar nada, con `git config --get core.eol`.

Al adoptar o cambiar el `.gitattributes`, los archivos ya commiteados no se reescriben solos;
hace falta una pasada única: `git add --renormalize .`.

### BOM / charset — lo maneja `.editorconfig`

Git **no** sabe agregar ni quitar el BOM; por eso este eje vive en `.editorconfig` (que VSC
respeta en vivo) y lo aplica el normalificador.

- Default: **UTF-8 sin BOM** (lo sano para JS/TS/JSON/web).
- `charset = utf-8-bom` → con BOM fijo (PowerShell 5.1 con no-ASCII, CSV para Excel, etc.).
- `charset = unset` → dejá el BOM como está, no lo toques.

### Trailing spaces y salto de línea final — `.editorconfig`

- `trim_trailing_whitespace = true` → quitar (default). `= false` → dejar como están
  (típico en Markdown, donde dos espacios al final son un salto de línea intencional).
- `insert_final_newline = true` → garantizar exactamente uno (default). `= false` → dejar
  como está.

### Indentación — convención para el editor, **no** reescritura

Por ahora la indentación se trata como **convención**, no como reescritura masiva (convertir
tab↔espacios es estructural, depende del lenguaje —Makefile *exige* tabs, Go usa tabs— y es
justo lo más invasivo).

- `.editorconfig`: `indent_style = space` (para no seguir agregando tabs), con excepciones
  registradas (`[Makefile] indent_style = tab`, Go, etc.).
- `.vscode/settings.json`: `editor.renderWhitespace = "selection"`, para que el whitespace se
  vea **solo al seleccionar** texto (los tabs aparecen como flechitas bajo demanda; sin
  selección no se ve nada). Se fija en el repo para garantizar ese comportamiento a todo el
  equipo, sin depender del default de VSC de cada uno.

```json
{
  "editor.renderWhitespace": "selection"
}
```

La conversión efectiva de tabs queda **fuera** de este workflow por ahora (ver `--tabs-*`).

### Ejemplo de `.editorconfig`

```editorconfig
root = true

# Default para todo
[*]
charset = utf-8                  # sin BOM
trim_trailing_whitespace = true
insert_final_newline = true
indent_style = space

# Markdown: los dos espacios finales son intencionales
[*.md]
trim_trailing_whitespace = false

# Ejemplos de excepciones puntuales
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

## Modos

Todos los modos imprimen al final **qué archivos crearon o modificaron**.

| Modo | Lee | Escribe | Destructivo |
|---|---|---|---|
| `--audit` | configs existentes (o los defaults que propondría) + los archivos | nada, solo **reporta** lo que está fuera de norma | no |
| `--add-config-defaults` | — | los configs con **defaults puros** (sin mirar la realidad) | no (solo crea config) |
| `--adapt-configs` | configs + audit | crea o **adapta** los configs para reflejar lo encontrado | no toca el código fuente |
| `--fix-format` | configs | **modifica los archivos** (BOM, trailing, newline; EOL vía Git) respetando los configs | sí (Git revierte) |

### `--adapt-configs`: registra toda desviación como excepción

`--adapt-configs` registra **toda** desviación encontrada como excepción explícita, en todos
los ejes por igual (sin clasificar ni adivinar intención). Esto da una invariante de
seguridad: **justo después de `--adapt-configs`, un `--fix-format` no cambia nada**, porque la
config describe la realidad al 100%. Recién cuando uno **poda** (borra) excepciones,
`--fix-format` toca *eso y solo eso*.

Así, "está todo mal y lo quiero arreglar de una" se resuelve borrando el bloque de
excepciones: todo cae al default → `--fix-format` reescribe lo que haga falta.

Detalles de comportamiento:

- Una desviación puede ser **multi-eje** en un mismo archivo (CRLF + trailing + sin newline
  final + BOM). Su entrada cubre varias propiedades; borrarla revierte ese archivo entero al
  default. Para conservar una sola propiedad (raro) se edita la línea en vez de borrarla.
- Cada excepción cae en el **archivo dueño del eje**: EOL → `.gitattributes`, el resto →
  `.editorconfig`. "Marcar todo y borrar" es por archivo de config (dos lugares).

### `--tabs-*` (fuera por ahora)

La conversión de indentación (tab→espacios o viceversa) queda como switches aparte, a definir
más adelante, por ser estructural, riesgosa y dependiente del lenguaje. Mientras tanto, los
tabs se corrigen a mano.

---

## Workflow sugerido

0. *(opcional)* `--add-config-defaults` → **commit**. Deja versionado el "norte" (la norma
   pura), para que en el paso 1 las desviaciones salten en el diff contra esa norma.
1. `--adapt-configs` → el `git diff` de los configs muestra **cada excepción agregada = cada
   desviación**. Ese diff es el reporte de verdad.
2. Revisar esas excepciones: dejar las que eran a propósito, **borrar** a mano las que eran
   porquería (si está casi todo mal, borrar todo el bloque).
3. `--fix-format` → normaliza todo lo que ya no quede protegido por una excepción. (El EOL lo
   aplica Git con `git add --renormalize .`; el resto lo aplica el normalificador.)

Como Git revierte cualquier cosa, los pasos destructivos son seguros de probar.

---

## Arquitectura

Pensado para **vivir solo** y poder integrarse luego como dependencia de otra herramienta.

La transformación de texto está separada de la orquestación (Git, sistema de archivos, args),
para que el núcleo sea puro y testeable.

### Función pura (con sus tests)

El corazón es una función sin efectos: recibe el contenido de un archivo (ya decodificado) y
las opciones resueltas para ese archivo, y devuelve el contenido normalizado más un reporte
de qué cambió. No toca disco, ni Git, ni argumentos.

```
normalizarTexto(contenido: string, opciones: Opciones): { contenido: string; reporte: Reporte }
```

- `Opciones`: BOM (quitar | poner | dejar), trailing (quitar | dejar), newline final
  (garantizar | dejar). (El EOL es responsabilidad de Git, no de esta función.)
- `Reporte`: qué se modificó (para no fallar en silencio).

La auditoría también tiene su núcleo puro: dada una porción de texto, detecta su estado
actual (EOL crlf/lf/mixto, BOM sí/no, trailing sí/no, newline final, indentación
tabs/espacios/mezcla).

Casos de test: CRLF↔LF, EOL mixto, trailing, falta/exceso de newline final, BOM presente/
ausente, archivo vacío, e **idempotencia** (correr dos veces no cambia nada).

Tipado fuerte, `strict`, sin `any`. Los errores se tratan, no se ignoran.

### `cli.ts`

Mapea los switches (`--audit`, `--add-config-defaults`, `--adapt-configs`, `--fix-format`) a
llamadas TS y orquesta los efectos:

1. Descubre archivos (`git ls-files`), saltea binarios y los marcados `-text`.
2. Lee `.gitattributes` y `.editorconfig` para resolver las opciones por archivo.
3. Según el modo: solo reporta, genera/adapta configs, o lee cada archivo, llama a la función
   pura y reescribe si cambió.
4. Imprime el resumen de archivos creados/modificados.

---

## Pendientes a definir al implementar

- Valor por defecto de `indent_size` (probablemente detectado por proyecto/lenguaje).
- Formato exacto del reporte de `--audit`.
- Detección de binarios y manejo de archivos en encodings distintos de UTF-8.
- Switches concretos de `--tabs-*`.
