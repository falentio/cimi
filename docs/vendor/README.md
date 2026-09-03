# docs/vendor

Local third-party source checkouts for research. Plain clones only — never git submodules. Everything under this directory is gitignored except this README.

## Layout

```text
docs/vendor/{forge}/{org}/{repo}/{ref}/**
```

- `forge`: `gh` (GitHub), `gl` (GitLab), `bb` (Bitbucket), etc.
- `org`: owner / group name, e.g. `withastro`.
- `repo`: repository name, e.g. `astro`.
- `ref`: pinned commit SHA preferred, else tag/branch, e.g. `29af6da5c11aff673133f96df029f40345674f0e`.

## Usage

```bash
ref=29af6da5c11aff673133f96df029f40345674f0e
git clone --no-checkout https://github.com/withastro/astro.git docs/vendor/gh/withastro/astro/$ref
git -C docs/vendor/gh/withastro/astro/$ref checkout $ref
```

Cite the exact path plus commit in research docs, e.g.
`docs/vendor/gh/withastro/astro/29af6da…/packages/integrations/node/src/server.ts`.
Delete checkouts when done; they are disposable and re-clonable.
