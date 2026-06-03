# Bundled fonts for the weekly share card

The weekly "wrapped" PNG card (`app/services/weekly_card.py`) needs a Unicode
TTF that can render Uzbek Latin diacritics — `oʻ`, `gʻ`, `ʼ` (U+02BB / U+02BC),
the full Latin Extended-A range, and the digits. The font resolver in
`weekly_card.py` looks here **first** before falling back to system DejaVu Sans
so production output is deterministic and doesn't depend on whatever fonts the
host happens to have installed.

## Drop these files in (any one set is enough)

Preferred — Inter (designed for screens, what the brand mark uses):

```
Inter-Regular.ttf
Inter-Medium.ttf
Inter-Bold.ttf
```

Fallback — DejaVu Sans (ships with most Linux distros, free to redistribute):

```
DejaVuSans.ttf
DejaVuSans-Bold.ttf
```

## Where to get them

- Inter:    <https://github.com/rsms/inter/releases> → `Inter-X.Y.zip` → `Inter Desktop/Inter-*.ttf`
- DejaVu:   `apt-get install fonts-dejavu-core` puts them at
            `/usr/share/fonts/truetype/dejavu/DejaVuSans*.ttf` — copy them here.

## Why bundle vs. relying on the system

The card is generated inside a Celery worker on the VPS. If the worker container
ever runs on a host without DejaVu installed (slim image, alpine, etc.) the
resolver will silently fall back to Pillow's `load_default()` bitmap font — that
produces unreadable, tiny output. Shipping the TTFs in this directory removes
that risk.

## Licensing

- Inter is OFL-1.1 — copy the SIL Open Font License alongside the TTFs if you
  redistribute the repo publicly.
- DejaVu uses the Bitstream Vera License (permissive, redistribution allowed).

Do not commit other binary blobs here — this directory is reserved for fonts.
