{
  mkShellNoCC,
  nodejs-slim,
  pnpm,
  eslint,
  prettier,
}:
mkShellNoCC {
  name = "ags-dev";
  packages = [
    nodejs-slim
    pnpm

    eslint
    prettier
  ];
}
