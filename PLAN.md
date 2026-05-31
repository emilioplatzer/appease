# Plan de implementación — appease (versión inicial)

Resumen
- Implementar la herramienta CLI `appease` con núcleo puro en TypeScript.
- Código y comentarios en inglés; el `LEEME.md` queda en castellano.
- Objetivo de calidad: 100% de cobertura con `nyc` y subida de reports a Coveralls vía GHA.

Estructura del repositorio (inicial)
- `package.json`, `tsconfig.json` (strict)
- `src/` — código TypeScript exportable
- `bin/` — entrada CLI (`cli.ts` compilada a JS)
- `test/` — tests unitarios e integración
- `test/fixtures/` — archivos de ejemplo (CRLF/LF/BOM/trailing/etc.)
- `.github/workflows/` — CI (lint/build/test/coverage/upload)

Componentes principales

1) CLI
- `bin/cli.ts`: parsea switches (`--audit`, `--add-config-defaults`, `--adapt-configs`, `--fix-format`, `--yes`, `--dry-run`, `--verbose`) y llama a la API pública en `src/index.ts`.
- `--dry-run`: simula las acciones que escribirían o modificarían archivos; imprime el mismo reporte que en modo real pero no toca disco.
- `--yes`: omite confirmaciones interactivas para operaciones destructivas (usar con cuidado en CI).
- La herramienta operará en modo batch/scriptable; no habrá módulo interactivo en la versión inicial.

2) API pública
- `src/index.ts` exporta funciones consumibles desde Node:
  - `runAppease(options): Promise<RunReport>`
  - `analyzeContent(content: string): FormatReport`
  - utilidades para tests e integración.

3) Función pura de análisis
- `analyzeContent(content: string): FormatReport` detecta:
  - BOM: presente / ausente
  - EOL: `lf` / `crlf` / `mixed`
  - trailing spaces: presencia y líneas afectadas
  - final newline: presente / faltante / múltiple
  - indentación: `tabs` / `spaces` / `mixed` + tamaño de indentación detectado
  - archivo vacío
- Devuelve `FormatReport` (tipo TS).

4) Tipos TypeScript
- `src/types.ts` con tipos estrictos (sin `any`): `FormatReport`, `Options`, `ProjectConfig`, `AuditResult`, `RunReport`, `ExceptionEntry`, etc.

5) Lector de configuraciones
- Módulo que parsea y resuelve por ruta:
  - `.editorconfig` → charset, trim_trailing_whitespace, insert_final_newline, indent_style, indent_size y secciones por glob
  - `.gitattributes` → reglas `text` / `eol` / `-text`
  - `.vscode/settings.json` → `editor.renderWhitespace`
- API: `readConfigs(): Promise<ProjectConfig>`

6) Escritor de configuraciones
- Módulo para crear/actualizar `.editorconfig` y `.gitattributes` de forma legible e idempotente.
- Funciones: `writeEditorconfig`, `writeGitattributes`, respetando comentarios y orden razonable.

7) Evaluador / Auditoría
- Dada una colección de `FormatReport` (uno por archivo) y el `ProjectConfig`, producir `AuditResult` que lista desviaciones por eje y por archivo.
- `--audit` imprimirá por ahora el JSON serializado directamente del tipo producido (`AuditResult`) para facilitar parsers y pruebas (un único output canonicalizable).

8) Generador de configuración (`--adapt-configs`)
- Genera excepciones por archivo para reflejar la realidad detectada (una entrada por desviación o multi-eje).
- Además, si no existen configs o los defaults detectados no encajan con la realidad del repo, genera los `defaults` razonables en `.editorconfig` y `.gitattributes` (por ejemplo: `charset=utf-8`, `trim_trailing_whitespace=true`, `insert_final_newline=true`, `* text=auto`).
- Garantía: justo después de `--adapt-configs`, `--fix-format` (con las opciones adecuadas) no debe cambiar nada.

9) Aplicador de formato (`--fix-format`)
- Aplica transformaciones puras sobre el contenido: BOM, trailing, final newline.
- EOL: por defecto la herramienta respetará el manejo de EOL que indique `.gitattributes` y la política de Git (no forzar cambios de EOL). No obstante, para cerrar el flujo y obtener un `--audit` limpio, `--fix-format` podrá habilitar opcionalmente la normalización de EOL mediante una flag explícita (por ejemplo `--apply-eol`) que permita ejecutar `git add --renormalize .` o aplicar conversiones seguras cuando el usuario lo autorice.
- Escribir archivos solo si cambian; devolver reporte con lista de archivos modificados.

10) Requestador (interacción)
- OMITIDO en la versión inicial: no implementaremos un módulo interactivo. Las decisiones se tomarán por flags (`--yes`, `--dry-run`) y por la API programática.

11) Tests y cobertura
- Tests unitarios para cada función con fixtures; tests de integración para flujos `audit` → `adapt-configs` → `fix-format`.
- Nota: los fixtures de test serán generados por código (helpers que construyen contenidos con CRLF/LF mixtos, BOM, trailing spaces, etc.) para garantizar que cumplen las reglas que vamos a validar.
- Usar `nyc` para coverage; meta 100% (puede requerir pruebas exhaustivas y mocks para I/O).

12) CI / GitHub Actions
- Jobs: install, lint, tsc build, test+nyc, upload coverage to Coveralls.
- Policy: fallar si coverage disminuye bajo umbral configurable.

13) Documentación
- `README.md` en inglés (uso rápido de CLI y API). Mantener `LEEME.md` en castellano.
- `CONTRIBUTING.md` y ejemplos en `examples/`.

14) Pulido y publicación
- Preparar `package.json` con `bin` y `exports` para uso como dependencia y CLI.
- Considerar workflow de release y versión semántica en GHA.

Pendientes y decisiones a definir
- Valor por defecto de `indent_size` (detectar o configurar por proyecto).
- Detección de binarios y manejo de encodings distintos de UTF-8.
- Diseño de switches `--tabs-*` (fuera por ahora).

Próximo paso sugerido
- Scaffold inicial: crear `package.json`, `tsconfig.json`, `src/index.ts` con firmas, `bin/cli.ts`, y estructura de tests/fixtures. ¿Procedo a generar ese scaffold?
