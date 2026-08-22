<h1 align="center">🎲 Random Pick</h1>

<p align="center">
  Jump to a random item on <b>Discover</b> or <b>Library</b>.<br>
  A plugin for <a href="https://github.com/REVENGE977/stremio-enhanced">Stremio Enhanced</a>, 100% local (nothing is sent or synced).
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-7B5BF5" alt="Version">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-7B5BF5" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/plugin-Stremio%20Enhanced-191970" alt="Stremio Enhanced">
</p>

## Features

- **One button, one roulette** — adds a "🎲 Random pick" button next to the Film/Genre filters on Discover and Library.
- Picks among **whatever is currently shown** — so it respects any active filters from other plugins (folders, watched/unwatched, etc.) as well as Stremio's own type/genre/sort filters.
- Scrolls to the chosen card with a little highlight flash before opening its detail page, so you see what got picked.

## Installation

1. Download `random-pick.plugin.js` from this repo.
2. In **Stremio Enhanced** → **Settings**, scroll down and click **OPEN PLUGINS FOLDER**.
3. Copy the file into that folder.
4. Enable the plugin in the Settings list, then reload (`Ctrl+R`) or restart the app.

## How it works

The plugin is injected directly into the Stremio Web page and reads the native `#/discover` and `#/library` DOM to pick a random visible card — no server, no account changes, no data stored.

## License

[MIT](LICENSE)
