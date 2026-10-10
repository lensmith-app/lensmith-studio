# Lensmith Studio

Tools and documentation for making **Lensmith** filters.

| | |
|---|---|
| [docs/filter-format.md](docs/filter-format.md) | The `.lensmith` package and `filter.json` format |
| [schema/filter.schema.json](schema/filter.schema.json) | JSON Schema for `filter.json` (editor autocomplete + checking) |
| [tools/lensmith_cli.py](tools/lensmith_cli.py) | Command line: check, pack and unpack filters |

Coming later: the web **Studio** editor, and scripted effects.

## Command line

Needs Python 3.10+ (and `pip install pillow` for picture checks).

```bash
python tools/lensmith_cli.py check  my-filter/            # is this folder a valid filter?
python tools/lensmith_cli.py pack   my-filter/            # → my-filter.lensmith (open it on your phone)
python tools/lensmith_cli.py unpack shared.lensmith out/  # .lensmith → folder
```

## Publishing

Filters are published through [lensmith-filters](https://github.com/lensmith-app/lensmith-filters) —
see its CONTRIBUTING guide.
