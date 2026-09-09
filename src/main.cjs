const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { copyFile, mkdtemp, readFile, readdir, rm, stat, writeFile } = require('node:fs/promises');
const { watch } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// The interface is data-first and does not need GPU rendering. Disabling it
// avoids driver-specific Chromium startup failures on public Windows systems.
app.disableHardwareAcceleration();

// Keep the original user-data location so existing private-beta leagues,
// worlds, and preferences survive the public-facing product rename.
app.setPath('userData', path.join(app.getPath('appData'), 'Madden Fantasy Companion'));
app.setName('Franchise Fantasy Companion');

let mainWindow;
let saveWatcher;
let watchTimer;

function candidateSaveDirectories() {
  const home = os.homedir();
  return [
    path.join(home, 'OneDrive', 'Documents', 'Madden NFL 27', 'saves'),
    path.join(home, 'Documents', 'Madden NFL 27', 'saves'),
  ];
}

async function existingSaveDirectory() {
  for (const directory of candidateSaveDirectories()) {
    try {
      if ((await stat(directory)).isDirectory()) return directory;
    } catch {}
  }
  return null;
}

async function listSaves() {
  const directory = await existingSaveDirectory();
  if (!directory) return { directory: null, saves: [] };
  const entries = await readdir(directory, { withFileTypes: true });
  const saves = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.startsWith('CAREER-'))
      .map(async (entry) => {
        const filePath = path.join(directory, entry.name);
        const info = await stat(filePath);
        return { name: entry.name, path: filePath, modified: info.mtimeMs, size: info.size };
      }),
  );
  saves.sort((a, b) => b.modified - a.modified);
  return { directory, saves };
}

async function analyzeSave(sourcePath) {
  const { extractPlayerGameStats } = await import('./extractor.js');
  const tempDirectory = await mkdtemp(path.join(app.getPath('temp'), 'madden-fantasy-'));
  const copiedSave = path.join(tempDirectory, path.basename(sourcePath));
  try {
    await copyFile(sourcePath, copiedSave);
    const allGames = await extractPlayerGameStats(copiedSave);
    const completed = allGames.filter((game) => game.status !== 'Unplayed');
    const played = completed.filter(
      (game) =>
        !game.isSimmed &&
        (game.numberTimesPlayed > 0 || game.homeTeam?.isUserManaged || game.awayTeam?.isUserManaged),
    );
    return {
      sourcePath,
      games: (played.length ? played : completed.filter((game) => !game.isSimmed)).slice(-24).reverse(),
      leagueGames: completed,
      readAt: Date.now(),
    };
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

async function chooseSave() {
  const directory = await existingSaveDirectory();
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose a Madden 27 offline Franchise save',
    defaultPath: directory ?? os.homedir(),
    properties: ['openFile'],
  });
  return result.canceled ? null : result.filePaths[0];
}

async function exportJson(_event, { kind, data }) {
  if (!['backup', 'diagnostics'].includes(kind)) throw new Error('Unsupported export type.');
  const stamp = new Date().toISOString().slice(0, 10);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: kind === 'backup' ? 'Export Franchise Fantasy Companion backup' : 'Save support report',
    defaultPath: path.join(app.getPath('documents'), `Franchise-Fantasy-${kind}-${stamp}.json`),
    filters: [{ name: 'JSON files', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return null;
  const text = JSON.stringify(data, null, 2);
  if (Buffer.byteLength(text) > 20 * 1024 * 1024) throw new Error('Export is larger than the 20 MB safety limit.');
  await writeFile(result.filePath, text, 'utf8');
  return result.filePath;
}

async function importBackup() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Restore a Franchise Fantasy Companion backup',
    properties: ['openFile'],
    filters: [{ name: 'JSON files', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const info = await stat(result.filePaths[0]);
  if (info.size > 20 * 1024 * 1024) throw new Error('Backup is larger than the 20 MB safety limit.');
  return JSON.parse(await readFile(result.filePaths[0], 'utf8'));
}

function beginWatching(directory) {
  saveWatcher?.close();
  if (!directory) return;
  saveWatcher = watch(directory, (_event, filename) => {
    if (!filename?.toString().startsWith('CAREER-')) return;
    clearTimeout(watchTimer);
    watchTimer = setTimeout(() => mainWindow?.webContents.send('save-changed'), 1800);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#08110d',
    title: 'Franchise Fantasy Companion',
    icon: path.join(__dirname, '..', 'build', 'app-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
  if (process.env.MFC_SMOKE_TEST === '1') {
    mainWindow.webContents.on('did-finish-load', () => {
      const deadline = Date.now() + 30000;
      const timer = setInterval(async () => {
        const bodyText = await mainWindow.webContents.executeJavaScript('document.body.innerText');
        if (/Updated|could not be read|No played-game stats/.test(bodyText) || Date.now() > deadline) {
          clearInterval(timer);
          try {
            const result = await mainWindow.webContents.executeJavaScript(`(async () => {
              const tick = (delay = 250) => new Promise((resolve) => setTimeout(resolve, delay));
              if (!document.querySelector('#status span')?.textContent.startsWith('Updated')) return { startup: document.body.innerText.slice(0, 500) };
              document.querySelector('[data-view="league"]').click();
              document.getElementById('league-draft-mode').value = 'instant';
              document.getElementById('league-draft-mode').dispatchEvent(new Event('change', { bubbles: true }));
              document.getElementById('league-create').click(); await tick();
              const league = {
                dashboard: !document.getElementById('league-dashboard').hidden,
                projections: document.getElementById('league-projections').innerText,
                waiverOptions: document.getElementById('league-waiver-add').options.length,
                tradeOptions: document.getElementById('league-trade-team').options.length,
                playoffRows: document.getElementById('league-playoffs').children.length,
              };
              document.querySelector('[data-view="world"]').click();
              document.getElementById('world-create').click(); await tick(500);
              const world = {
                dashboard: !document.getElementById('world-dashboard').hidden,
                posts: document.getElementById('world-feed').children.length,
                stories: document.getElementById('world-story-list').children.length,
                formats: document.getElementById('world-league-list').innerText,
              };
              return { league, world };
            })()`);
            console.log(`SMOKE_TEST:${JSON.stringify(result)}`);
          } catch (error) {
            console.error(`SMOKE_TEST_ERROR:${error.stack ?? error.message}`);
          }
          app.quit();
        }
      }, 500);
    });
  }
}

ipcMain.handle('list-saves', listSaves);
ipcMain.handle('analyze-save', (_event, sourcePath) => analyzeSave(sourcePath));
ipcMain.handle('choose-save', chooseSave);
ipcMain.handle('export-json', exportJson);
ipcMain.handle('import-backup', importBackup);
ipcMain.handle('app-info', () => ({ version: app.getVersion(), platform: process.platform, arch: process.arch }));

app.whenReady().then(async () => {
  createWindow();
  beginWatching(await existingSaveDirectory());
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  saveWatcher?.close();
  if (process.platform !== 'darwin') app.quit();
});
