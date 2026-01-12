# PirateFlix Desktop

A modern, standalone media streaming desktop application built with Electron and React.
It allows you to browse and stream content from your ISP's media server directly, bypassing network restrictions.

## Features

- 🖥️ **Native Desktop App**: Runs on Windows (and other platforms supported by Electron).
- 🚀 **Direct Streaming**: Bypasses CORS and Mixed Content issues to stream directly from internal/legacy HTTP servers.
- ⏬ **Downloads**: Download movies and TV shows directly to your computer.
- 🎬 **TMDB Integration**: Automatic metadata fetching (posters, cast, ratings).
- 📝 **Subtitles**: Integrated subtitle search.

## Prerequisites

- **Node.js** (v18 or higher)
- A **TMDB API Key** (Get one at [themoviedb.org](https://www.themoviedb.org/settings/api))

## Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/yourusername/pirateflix-desktop.git
    cd pirateflix-desktop
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment:**
    Copy `.env.example` to `.env`:
    ```bash
    cp .env.example .env
    ```
    Edit `.env` and add your keys:
    ```env
    VITE_HTTP_SERVER_URL=http://cdn.dflix.live
    VITE_TMDB_API_KEY=your_actual_api_key
    ```

4.  **Run Development Mode:**
    ```bash
    npm run electron:dev
    ```

## Building for Production

To create an executable installer (`.exe`):

```bash
npm run electron:build
```

The output file will be in the `dist-electron` or `dist` directory.

## License

MIT
