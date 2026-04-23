# MyBrowser Android

This folder contains the Android (Expo + React Native) version of MyBrowser.

## Features

- WebView-based mobile browser UI
- Multi-tab browsing with tab strip and close/new controls
- Smart address bar input parsing (URL or Google search)
- Back, forward, reload/stop, and home navigation controls
- HTTPS security indicator in the address area
- Bookmark save/remove for the current page
- History tracking and a Library tab for saved pages/history
- Session restore for open tabs and active tab index
- Basic ad-domain blocking using host pattern checks

## Run

1. Install dependencies

   ```bash
   npm install
   ```

2. Start Expo

   ```bash
   npm run start
   ```

3. Open Android

   ```bash
   npm run android
   ```

## Main Files

- app/(tabs)/index.tsx: Main browser screen
- app/(tabs)/explore.tsx: Library screen for bookmarks/history
- constants/browser.ts: Shared browser constants/types/helpers

