# appease


Make peace in this app.


![extending](https://img.shields.io/badge/stability-extending-orange.svg)
[![npm-version](https://img.shields.io/npm/v/appease.svg)](https://npmjs.org/package/appease)
[![downloads](https://img.shields.io/npm/dm/appease.svg)](https://npmjs.org/package/appease)
[![build](https://github.com/emilioplatzer/appease/actions/workflows/build-and-test.yml/badge.svg)](https://github.com/emilioplatzer/appease/actions/workflows/build-and-test.yml)
[![security](https://socket.dev/api/badge/npm/package/appease)](https://socket.dev/npm/package/appease)
[![qa-control](https://github.com/emilioplatzer/appease/actions/workflows/qa-control.yml/badge.svg)](https://github.com/emilioplatzer/appease/actions/workflows/qa-control.yml)


language: ![English](https://raw.githubusercontent.com/codenautas/multilang/master/img/lang-en.png)
also available in:
[![Spanish](https://raw.githubusercontent.com/codenautas/multilang/master/img/lang-es.png)](LEEME.md)

A tool to bring order, **once**, to the low-level format of a repository's files (line
endings, BOM, trailing spaces, final newline, indentation), and to leave the convention
configured so that keeping it afterwards is free and diffs stay clean and humanly reviewable.

The underlying idea: honoring "the exact format" on every commit is an effort (especially on
Windows, where line endings get mixed on their own). If instead you normalize once and pin
the convention with `.gitattributes` + `.editorconfig` + `.vscode/settings.json`, the cost
disappears.

The name is a play on words between **normalize** and **appease** (to bring to peace).


---

## What it normalizes, and where each decision lives

Each format "axis" is controlled from **a single configuration file**, depending on which
tool is capable of handling it. To answer "what happens to this file on a given axis?" you
never have to look at two files.

| Axis | Who handles it | Config file |
|---|---|---|
| Line ending (EOL) | Git | `.gitattributes` |
| BOM / charset | editor + appease | `.editorconfig` |
| Trailing spaces | editor + appease | `.editorconfig` |
| Final newline | editor + appease | `.editorconfig` |
| Indentation (convention) | editor | `.editorconfig` |
| Show whitespace on selection | VSC | `.vscode/settings.json` |

### Line ending (EOL) — handled by Git

It lives in `.gitattributes`, which is **per-repo and overrides Git's global configuration**,
so there's no need to touch anything in global Git (nor break other repos that rely on its
behavior).


```gitattributes
# Default: on commit, Git normalizes to LF in the repo (EOL disappears from diffs);
# on checkout, it delivers the OS-native EOL (CRLF on Windows, LF on Linux).
* text=auto

# One-off exceptions, one by one:
path/to/file.crlf   text eol=crlf   # always CRLF, everywhere
path/to/file.lf     text eol=lf     # always LF, everywhere
path/to/file.raw    -text           # byte for byte: leave everything as-is (commit and checkout)
```

Requirement (assumed on purpose): this default yields **native** EOL because each machine
resolves it via its `core.eol`, whose default value (when unset) is already `native`. appease
**does not touch Git's configuration** —neither global nor local— so native EOL remains an
environment requirement: it works as long as `core.eol` is not pinned to `lf`/`crlf`. You can
verify it, without changing anything, with `git config --get core.eol`.

When adopting or changing `.gitattributes`, already-committed files are not rewritten on
their own; a one-time pass is needed: `git add --renormalize .`.

### BOM / charset — handled by `.editorconfig`

Git does **not** know how to add or remove the BOM; that's why this axis lives in
`.editorconfig` (which VSC honors live) and appease applies it.

- Default: **UTF-8 without BOM** (the sane choice for JS/TS/JSON/web).
- `charset = utf-8-bom` → with a fixed BOM (PowerShell 5.1 with non-ASCII, CSV for Excel, etc.).
- `charset = unset` → leave the BOM as-is, don't touch it.

### Trailing spaces and final newline — `.editorconfig`

- `trim_trailing_whitespace = true` → trim (default). `= false` → leave them as-is
  (typical in Markdown, where two trailing spaces are an intentional line break).
- `insert_final_newline = true` → guarantee exactly one (default). `= false` → leave
  as-is.

### Indentation — a convention for the editor, **not** a rewrite

For now indentation is treated as a **convention**, not as a mass rewrite (converting
tab↔spaces is structural, it depends on the language —Makefile *requires* tabs, Go uses tabs—
and it's exactly the most invasive change).

- `.editorconfig`: `indent_style = space` (to stop adding more tabs), with registered
  exceptions (`[Makefile] indent_style = tab`, Go, etc.).
- `.vscode/settings.json`: `editor.renderWhitespace = "selection"`, so that whitespace is
  shown **only when selecting** text (tabs appear as little arrows on demand; with no
  selection nothing shows). It's pinned in the repo to guarantee that behavior for the whole
  team, without depending on each person's VSC default.


```json
{
  "editor.renderWhitespace": "selection"
}
```

The actual conversion of tabs stays **out** of this workflow for now (see `--tabs-*`).

### Example `.editorconfig`


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

## Commands

Every command prints at the end **which files it created or modified**.

Each command takes the directory to process as an optional positional argument
(`appease <command> [dir]`; defaults to the current directory).


| Command | Reads | Writes | Destructive |
|---|---|---|---|
| `audit` | existing configs (or the defaults it would propose) + the files | nothing, only **reports** what is out of spec | no |
| `add-config-defaults` | — | the configs with **pure defaults** (without looking at reality) | no (only creates config) |
| `adapt-configs` | configs + audit | creates or **adapts** the configs to reflect what was found | does not touch source code |
| `fix-format` | configs | **modifies the files** (BOM, trailing, newline; EOL via Git) honoring the configs | yes (Git reverts) |

### `audit`: report format

`audit` prints canonical JSON with **two** lists. The key point is that conforming files
**appear in neither**: only the ones that need attention and the ones that couldn't be
evaluated are listed. A clean repo yields both lists empty:


```json
{
  "findings": [],
  "notAnalyzed": []
}
```

- **`findings`**: **analyzed files that deviate** from their resolved config. Each entry
  carries `path`, `deviations` (axes that differ from what the config asks for) and
  `unresolved` (axes governed by an unrecognized config value: not evaluated, reported as-is).
- **`notAnalyzed`**: files that were **not analyzed**, with their `reason`
  (`binary-extension`, `binary-content`, `gitattributes-notext`, `non-utf8`).

This format is **provisional**: today the output is the direct serialization of the
`AuditResult` type, meant to be easy to parse and test. It may grow if the value justifies it.

### `adapt-configs`: records every deviation as an exception

`adapt-configs` records **every** deviation it finds as an explicit exception, across all
axes equally (without classifying or guessing intent). This gives a safety invariant: **right
after `adapt-configs`, a `fix-format` changes nothing**, because the config describes
reality 100%. Only when you **prune** (delete) exceptions does `fix-format` touch *that and
only that*.

So, "everything is wrong and I want to fix it all at once" is solved by deleting the block of
exceptions: everything falls back to the default → `fix-format` rewrites whatever is needed.

Behavior details:

- A deviation can be **multi-axis** in a single file (CRLF + trailing + no final newline +
  BOM). Its entry covers several properties; deleting it reverts that entire file to the
  default. To keep a single property (rare) you edit the line instead of deleting it.
- Each exception lands in the **file that owns the axis**: EOL → `.gitattributes`, the rest →
  `.editorconfig`. "Select all and delete" is per config file (two places).

### `--tabs-*` (out of scope for now)

Indentation conversion (tab→spaces or vice versa) is left as separate switches, to be defined
later, since it's structural, risky and language-dependent. In the meantime, tabs are fixed
by hand.


---

## Suggested workflow

0. *(optional)* `add-config-defaults` → **commit**. Versions the "north star" (the pure
   norm), so that in step 1 deviations stand out in the diff against that norm.
1. `adapt-configs` → the `git diff` of the configs shows **every added exception = every
   deviation**. That diff is the real report.
2. Review those exceptions: keep the ones that were on purpose, **delete** by hand the ones
   that were junk (if almost everything is wrong, delete the whole block).
3. `fix-format` → normalizes everything no longer protected by an exception.

Since Git reverts anything, the destructive steps are safe to try.


---

## Architecture

Designed to **stand on its own** and to be integrable later as a dependency of another tool.

Text transformation is separated from orchestration (Git, file system, args), so the core is
pure and testable.

### Pure function (with its tests)

The heart is a side-effect-free function: it receives a file's content (already decoded) and
the options resolved for that file, and returns the normalized content plus a report of what
changed. It touches neither disk, nor Git, nor arguments.


```
normalizeText(content: string, options: Options): { content: string; report: Report }
```

- `Options`: BOM (remove | add | keep), trailing (trim | keep), final newline (ensure | keep).
  (EOL is Git's responsibility, not this function's.)
- `Report`: what was modified (so as not to fail silently).

The audit also has its pure core: given a chunk of text, it detects its current state (EOL
crlf/lf/mixed, BOM yes/no, trailing yes/no, final newline, indentation tabs/spaces/mixed).

Test cases: CRLF↔LF, mixed EOL, trailing, missing/excess final newline, BOM present/absent,
empty file, and **idempotence** (running twice changes nothing).

Strongly typed, `strict`, no `any`. Errors are handled, not ignored.


### `cli.ts`

Maps the commands (`audit`, `add-config-defaults`, `adapt-configs`, `fix-format`) to
TS calls and orchestrates the effects:

1. Discovers files (`git ls-files`), skips binaries and the ones marked `-text`.
2. Reads `.gitattributes` and `.editorconfig` to resolve the per-file options.
3. Depending on the command: only reports, generates/adapts configs, or reads each file, calls
   the pure function and rewrites if it changed.
4. Prints the summary of created/modified files.


---

## To be defined at implementation time

- Default value for `indent_size` (probably detected per project/language).
- Exact format of the `audit` report (provisional today, documented above).
- Binary detection and handling of files in encodings other than UTF-8.
- Concrete `--tabs-*` switches.

