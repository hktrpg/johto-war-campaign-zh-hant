# Board battle sandbox (optional)

This folder is **not** the main product of the repo. The repo primary goal is **printing Pokémon cards** with D&D combat fields (range, AOE, d6).

Use this page to:

- Smoke-test `tools/build_za_move_data.py` exports
- Practice type effectiveness without mental math
- Try grid range / AOE roughly matching card text

```bash
python ../tools/build_za_move_data.py
python -m http.server 8765
```

Open http://localhost:8765
