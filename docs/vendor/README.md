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

## Must-Have

Vendor bellow package if not exists

- https://github.com/rybbit-io/rybbit ref 4a01c7a2bd18ca07cde3501413a339f376967555
- https://github.com/databuddy-analytics/Databuddy ref 92c15273d9a1e9a25f12be4aab84f2f7bf635d22
- https://github.com/plausible/analytics ref 5716baab58b7faf62d721453ed9880de18e48ede
- https://github.com/OpenLabs-so/openanalytics ref a6854247926260f614d700b5bd44c1c73b4590a4
- https://github.com/umami-software/umami ref ca661c7057984aa98ed4f7083d84dae2f65bfcb0
