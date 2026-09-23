# Commit messages

Every commit on every branch follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
`.githooks/commit-msg` refuses anything else; `pnpm install` points git at it (`core.hooksPath`).

```text
type(scope): summary

Body: why the change was made, what was measured, what is left. Optional.

Co-Authored-By: …
```

## Type

Pick the one that describes what the reader of the site, or of the code, gets out of the commit.

| Type | Use it for | Example |
| --- | --- | --- |
| `feat` | Something new a reader can see or use: an article, a figure, a control, a page, an engine capability | `feat(playground): add cars you can get into and drive` |
| `fix` | Something that was wrong and now is not: a bug, a broken layout, a wrong number in an article | `fix(rt): counters overflow at 960×540` |
| `perf` | Same behaviour, faster or smaller | `perf(playground): cut the ground's long triangles` |
| `refactor` | Same behaviour, different structure. No reader-visible change | `refactor(light): two articles instead of four` |
| `docs` | Words only: `docs/`, `README.md`, comments, and rewording an article that already exists (title, prose, captions) | `docs(light-playground): use Paul's title` |
| `style` | Formatting with no change in meaning (Prettier, import order). Not CSS: a visual change is `feat` or `fix` | `style: prettier` |
| `test` | Only tests change | `test(e2e): retry the city's 'back to now' click` |
| `build` | Dependencies, bundler, `next.config`, asset packing scripts | `build(deps): bump next to 16.1` |
| `ci` | `.github/workflows` | `ci: cache the Playwright browsers` |
| `chore` | Repository upkeep that touches none of the above: hooks, `.gitignore`, editor settings | `chore(repo): enforce Conventional Commits` |
| `revert` | Undoing a commit; name it in the body | `revert: feat(home): hero animation` |

A new article is `feat`. Rewording an article that is already written is `docs`. A wrong number in an article is `fix`.

A commit that does two of these is two commits. When that is not practical, use the type of the more important half and
say the rest in the body.

## Scope

The area, lowercase, `[a-z0-9._/-]`. Optional only when the change really belongs to the whole repository
(`docs: production is blog.psheon.me`).

- **An article**: its slug or the short name already in the log: `cnn`, `transformer`, `diffusion`, `flappy`, `lite3`,
  `slam`, `city`, `scheduler`, `light`, `playground` (the figure), `light-playground` (the article's text),
  `head-camera`, `music-ai`.
- **Shared code**: `rt` (`lib/rt`), `ml`, `controls` (`components/lab`), `ui`, `site`, `home`, `header`, `search`, `post`.
- **Everything else**: `e2e`, `deps`, `research` (`docs/research`), `repo`, `release` (release PR titles only).

Look at `git log --format=%s | head -40` before inventing a new one.

## Summary

- Imperative, present tense, lower-case first letter, no full stop: `add`, `fix`, `port`, not `added`, `fixes`.
- Say what changed for the reader, not which file was edited.
- Aim for 72 characters. What does not fit goes in the body.
- English, like the rest of the repository's code and docs.
- A breaking change gets `!` before the colon and a `BREAKING CHANGE:` line in the body.

## Body

Optional, separated by a blank line. It is the place for why, for measurements (with the machine and the method, as in
the articles), and for what was deliberately left undone. Trailers (`Co-Authored-By:`) come last.

## Pull requests

PR titles take the same form. The release PR `dev` → `main` is `feat(release): …` naming what ships, e.g.
`feat(release): № 011 and № 012, a path tracer and its playground`. A PR for one article or one fix uses that area's
scope.

## What the hook lets through

`Merge …`, `Revert …`, `fixup! …` and `squash! …` pass unchecked, so GitHub's merge commits and `git commit --fixup`
keep working.

## History

The repository began this way and drifted (`spike(…)`, `edit(…)`, `publish:`, then "area: sentence") between 2026-09-18
and 2026-09-21. On 2026-09-21, with Paul's authorisation for that one rewrite, every drifted subject on `main`, `dev` and
`feat/vla` was corrected: 144 subjects, 236 commits rebuilt (the eleven merge commits over them included). Trees, authors,
dates and parents are unchanged, and a reworded commit keeps its whole original message, old subject first, as its body.
Hashes from `5c4844e` onward changed; [commit-rewrite-2026-09-21.tsv](commit-rewrite-2026-09-21.tsv) maps old to new,
for the hashes quoted in research notes. The PR titles on GitHub were renamed the same day; the PR pages still list the
old commits.
