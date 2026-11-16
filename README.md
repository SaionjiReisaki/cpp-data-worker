# cpp-data-worker

A data mining worker for [Closure++](https://cpp.orz.tools).

You can find generated data at [cpp-data](https://github.com/SaionjiReisaki/cpp-data).

## Development

The toolchain comes from a [nix](https://nixos.org) devshell in `.nix/`, pinned by `.nix/flake.lock`. CI uses the same shell.

```shell
$ direnv allow                 # or: nix develop path:$PWD/.nix
$ pnpm install
$ pnpm tsx src '<work>'
```
