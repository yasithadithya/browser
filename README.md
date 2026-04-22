# ⚡ MyBrowser

MyBrowser is a lightweight, custom-built web browser powered by Electron. Designed for a seamless and secure browsing experience, it features a built-in ad and tracker blocker, a modern multi-tab UI, and a more complete everyday browsing workflow with session restore, saved pages, history, and download tracking.

## 🚀 Features

- **Built-in Ad & Tracker Blocking**: Automatically fetches and applies rules from EasyList and EasyPrivacy to block ads, trackers, and malicious redirects at the network level.
- **Multi-Tab Support**: Easily manage multiple browsing sessions with a modern tab interface.
- **Spoofed Chrome User-Agent**: Bypasses typical Electron blocking (e.g., from Google and YouTube) by spoofing a real Chrome User-Agent.
- **Clean & Modern UI**: A custom-designed interface featuring sleek icons, dynamic progress bars, and a beautiful "New Tab" landing page.
- **Fast Search**: Built-in smart URL parsing allows you to seamlessly search Google directly from the address bar or type in URLs directly.
- **Security Indicators**: Visual indicators in the address bar warn you if a site is using HTTP instead of HTTPS.
- **Session Restore**: Reopens your tabs after restart so you can pick up where you left off.
- **Saved Pages**: Bookmark the current tab with `Ctrl+D` and access saved sites from the new-tab dashboard.
- **Recent History Panel**: Open browsing history with `Ctrl+H` and jump back into recent pages.
- **Download Tracking**: Live download progress and quick open/show-in-folder actions via `Ctrl+J`.
- **Reopen Closed Tabs**: Restore the most recently closed tab with `Ctrl+Shift+T`.

## 🛠️ Tech Stack

- **Electron**: Powers the desktop application window and backend processes.
- **HTML/CSS/JavaScript**: Vanilla web technologies used for a fast, responsive UI without the bloat of heavy front-end frameworks.

## 📦 Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yasithadithya/browser.git
   cd browser
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the application:**
   ```bash
   npm start
   ```

## 🏗️ Building for Production

To package the browser into a standalone executable (Portable Windows executable):

```bash
npm run build
```

This uses `electron-builder` to compile the app based on the settings in `package.json`. The output will be a `.exe` file you can distribute and run without needing Node.js installed.

## 🧩 File Structure

- `main.js`: The main Electron process, managing the application lifecycle and security settings.
- `renderer.js`: Handles the UI logic, tab management, persistence, bookmarks, history, and download panel state.
- `index.html`: The main user interface structure and styling.
- `adblock.js`: Handles downloading, caching, and parsing EasyList rules to filter network requests.
- `preload.js` / `webview-preload.js`: Bridge scripts connecting the renderer UI with secure backend operations.

## 🤝 Contributing

Contributions are welcome! Feel free to submit a Pull Request or open an Issue if you encounter any bugs or have feature requests.

## 📝 License

This project is licensed under the [ISC License](LICENSE).
