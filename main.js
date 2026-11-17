const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, desktopCapturer, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const mediaScriptPath = name => path.join(app.isPackaged ? process.resourcesPath : __dirname, name);

if (!app.requestSingleInstanceLock()) app.quit();

const defaults = {
  bg: '#1b1d2a', spectrumColor: '#4cc9f0', spectrumRgb: false, spectrumGradient: false,
  spectrumColor1: '#4cc9f0', spectrumColor2: '#9b5de5', spectrumColor3: '#f15bb5',
  spectrum: true, showProgress: true, showCover: true, popup: true, pinned: false,
  barPos: 'right', coverSide: 'left', playerLayout: 'horizontal',
  buttons: [{ id: 'pin', on: true }, { id: 'gear', on: true }, { id: 'close', on: true }]
};
const W = 380;
let cfg, cfgPath, win, settingsWin, tray, ps, lastKey = '', hideTimer, popupShown = false;

let latestTrack = null;

const loadCfg = () => {
  try { cfg = { ...defaults, ...JSON.parse(fs.readFileSync(cfgPath, 'utf8')) }; }
  catch { cfg = { ...defaults }; }
};
const saveCfg = () => fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

function createWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    width: W, height: 140, x: wa.x + wa.width - W - 20, y: wa.y + wa.height - 160,
    frame: false, resizable: true, minWidth: 300, minHeight: 110, skipTaskbar: true, show: false, hasShadow: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  // Resize the width from the sides; fit the height to the player content.
  win.on('will-resize', (event, bounds, details) => {
    userTookOver();
    event.preventDefault();
    if (details.edge === 'top' || details.edge === 'bottom') return;
    const current = win.getBounds();
    win.setBounds({ x: bounds.x, y: current.y, width: bounds.width, height: current.height });
  });
  win.on('will-move', userTookOver);
  win.webContents.on('did-finish-load', () => {
    if (latestTrack) win.webContents.send('track', latestTrack);
  });
  win.loadFile('index.html');
  win.once('ready-to-show', () => { if (cfg.pinned) applyPin(); });
}

function userTookOver() { popupShown = false; clearTimeout(hideTimer); }

function applyPin() {
  userTookOver();
  win.setAlwaysOnTop(!!cfg.pinned, cfg.pinned ? 'screen-saver' : 'normal');
  // Desafixar não deve fechar nem ocultar a janela.
  if (!win.isVisible()) win.show();
  buildTrayMenu();
}

function schedulePopupHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (popupShown && !cfg.pinned) { win.hide(); win.setAlwaysOnTop(false); }
    popupShown = false;
  }, 3000);
}

function popup() {
  if (cfg.pinned || !cfg.popup) return;
  if (popupShown) return schedulePopupHide();   // já é um popup: reinicia os 3s
  if (win.isVisible()) return;                  // janela já aberta pelo usuário: não mexe
  popupShown = true;
  win.setAlwaysOnTop(true, 'screen-saver');
  win.showInactive();
  schedulePopupHide();
}

function startMediaWatcher() {
  if (process.platform !== 'win32') return;
  ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', mediaScriptPath('media.ps1')], { windowsHide: true });
  ps.stderr.on('data', d => console.error('SMTC:', d.toString().trim()));
  ps.on('error', error => console.error('SMTC:', error));
  let buf = '';
  ps.stdout.setEncoding('utf8');
  ps.stdout.on('data', d => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      try {
        const t = JSON.parse(line);
        latestTrack = { ...t, thumb: t.thumb || (latestTrack?.key === t.key ? latestTrack.thumb : ''),
          thumbMime: t.thumbMime || (latestTrack?.key === t.key ? latestTrack.thumbMime : '') };
        win.webContents.send('track', latestTrack);
        const key = t.status === 'Playing' && t.title ? t.key : '';
        if (key && key !== lastKey) popup();
        if (key) lastKey = key;
      } catch {}
    }
  });
}

function showSettings() {
  userTookOver();
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  const display = screen.getDisplayMatching(win && !win.isDestroyed() ? win.getBounds() : screen.getPrimaryDisplay().bounds);
  const { x, y, width, height } = display.workArea;
  const settingsWidth = 430, settingsHeight = 650;
  settingsWin = new BrowserWindow({
    width: settingsWidth, height: settingsHeight, minWidth: 390, minHeight: 500,
    x: Math.round(x + (width - settingsWidth) / 2),
    y: Math.round(y + (height - settingsHeight) / 2),
    show: false, center: false, title: 'Configurações do Mini Player', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  settingsWin.loadFile('settings.html');
  settingsWin.once('ready-to-show', () => settingsWin && !settingsWin.isDestroyed() && settingsWin.show());
  settingsWin.on('closed', () => { settingsWin = null; });
}

function buildTrayMenu() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: win.isVisible() ? 'Ocultar' : 'Mostrar', click: () => { userTookOver(); win.isVisible() ? win.hide() : win.show(); } },
    { label: 'Fixar na tela (pin)', type: 'checkbox', checked: cfg.pinned,
      click: m => { cfg.pinned = m.checked; saveCfg(); win.webContents.send('settings', cfg); applyPin(); } },
    { label: 'Configurações...', click: showSettings },
    { type: 'separator' },
    { label: 'Sair', click: () => app.quit() }
  ]));
}

app.whenReady().then(() => {
  cfgPath = path.join(app.getPath('userData'), 'settings.json');
  loadCfg();

  const buf = Buffer.alloc(16 * 16 * 4);
  for (let i = 0; i < 256; i++) buf.set([0xf0, 0xc9, 0x4c, 0xff], i * 4);
  tray = new Tray(nativeImage.createFromBitmap(buf, { width: 16, height: 16 }));
  tray.setToolTip('Mini Player');
  tray.on('click', () => { userTookOver(); win.isVisible() ? win.hide() : win.show(); });

  // Windows/Electron: compartilhar a tela primária e o áudio de saída (loopback).
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      if (!sources.length) return callback({});
      callback({ video: sources[0], audio: 'loopbackWithMute' });
    } catch (error) {
      console.error('Captura de tela/áudio:', error);
      callback({});
    }
  });
  createWindow();
  buildTrayMenu();
  startMediaWatcher();

  ipcMain.handle('get-settings', () => cfg);
  ipcMain.handle('set-settings', (_, patch) => {
    cfg = { ...cfg, ...patch }; saveCfg();
    if ('pinned' in patch) applyPin();
    if (win && !win.isDestroyed()) win.webContents.send('settings', cfg);
    return cfg;
  });
  ipcMain.handle('media-control', async (_, action, position) => {
    if (!['next','previous','seek','play','pause'].includes(action)) return false;
    return new Promise(resolve => {
      const args = ['-NoProfile','-ExecutionPolicy','Bypass','-File',mediaScriptPath('media-control.ps1'), action, String(Number(position) || 0)];
      const child = spawn('powershell.exe', args, { windowsHide: true });
      let out = ''; child.stdout.on('data', d => out += d.toString());
      child.on('close', code => resolve(code === 0 && out.trim() !== 'false'));
      child.on('error', () => resolve(false));
    });
  });
  ipcMain.on('resize', (_, h) => {
    if (!win || win.isDestroyed()) return;
    const height = Math.min(Math.max(Math.round(h), 110), 760);
    const [width, currentHeight] = win.getContentSize();
    if (Math.abs(currentHeight - height) > 2) win.setContentSize(width, height);
  });
  ipcMain.on('user-active', userTookOver);
  ipcMain.on('hide', () => win.hide());
  ipcMain.on('open-settings-window', showSettings);
});

app.on('window-all-closed', e => e.preventDefault());
app.on('before-quit', () => ps && ps.kill());
