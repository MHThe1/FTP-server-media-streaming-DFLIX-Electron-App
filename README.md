# BetterFlix Desktop

**BetterFlix** is a desktop application that lets you stream movies and TV shows comfortably from your ISP's media server. It overcomes common browser restrictions (like Mixed Content and CORS) to provide a smooth, native streaming experience.

## 🚀 Features

- **Native Experience**: Runs as a standalone app on your desktop.
- **Direct Streaming**: Bypasses network restrictions to play content instantly.
- **Downloads**: One-click download for movies and episodes.
- **Smart Library**: Automatically fetches posters, ratings, and cast info from TMDB.
- **Subtitles**: Integrated search for subtitles.

## 📥 Download & Install

1.  Go to the **[Releases Page](https://github.com/MHThe1/FTP-server-media-streaming-DFLIX-Electron-App/releases)**.
2.  Download the latest installer (`BetterFlix Setup x.x.x.exe`).
3.  Run the installer.
4.  Launch **BetterFlix** from your desktop or start menu.

## 🛠Configuration

On the first run, you might need to configure your server settings if they aren't pre-set.
(If you are the administrator distributing this, you can pre-configure the `.env` settings before building).

---

## 👨‍💻 For Developers

If you want to contribute or build the app yourself:

### Prerequisites
- Node.js v18+
- TMDB API Key

### Build from Source

1.  **Clone the repo**
    ```bash
    git clone https://github.com/MHThe1/FTP-server-media-streaming-DFLIX-Electron-App.git
    cd FTP-server-media-streaming-DFLIX-Electron-App
    ```

2.  **Install**
    ```bash
    npm install
    ```

3.  **Setup Environment**
    Create a `.env` file:
    ```env
    VITE_HTTP_SERVER_URL=http://cdn.dflix.live
    VITE_TMDB_API_KEY=your_key_here
    ```

4.  **Run**
    ```bash
    npm run electron:dev
    ```

5.  **Build Installer**
    ```bash
    npm run electron:build
    ```
