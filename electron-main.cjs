/**
 * Electron Main Process for Mishkat Library System
 * Provides controlled kiosk/desktop app environment for Students & Librarian
 */
const { app, BrowserWindow, shell, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.join(app.getPath('userData'), 'mishkat-config.json');
let mainWindow;

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading config:', err);
  }
  return null;
}

function saveConfig(data) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing config:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'نظام المشكاة لإدارة المكتبات المدرسية',
    icon: path.join(__dirname, 'public/favicon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'electron-preload.cjs'),
      sandbox: false,
    },
    show: false,
    backgroundColor: '#090d16',
  });

  Menu.setApplicationMenu(null);

  const existingConfig = loadConfig();

  if (!existingConfig) {
    // Show one-click Setup Wizard (Server vs Client)
    mainWindow.loadFile(path.join(__dirname, 'setup-wizard.html'));
  } else {
    // Load configured URL
    const targetUrl = existingConfig.role === 'server' 
      ? 'http://localhost:3000' 
      : (existingConfig.serverIp ? `http://${existingConfig.serverIp}:3000` : 'http://localhost:3000');
    mainWindow.loadURL(targetUrl);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  // Whitelisted portals support
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const allowedDomains = [
      'archive.org',
      'shamela.ws',
      'hindawi.org',
      'waqfeya.net',
      'al-maktaba.org',
      'quran.com',
      'sunnah.com',
      'wikipedia.org',
    ];
    if (allowedDomains.some(d => url.includes(d))) {
      return { action: 'allow' };
    }
    return { action: 'deny' };
  });
}

// IPC handler for wizard setup
ipcMain.on('save-setup-role', (event, data) => {
  saveConfig(data);

  // If user requested desktop shortcut, create Windows shortcut on Desktop
  if (data.createShortcut && process.platform === 'win32') {
    try {
      const desktopPath = app.getPath('desktop');
      const shortcutPath = path.join(desktopPath, 'نظام المشكاة للمكتبة.lnk');
      shell.writeShortcutLink(shortcutPath, {
        target: process.execPath,
        args: '',
        description: 'نظام المشكاة لإدارة المكتبات المدرسية والمطالعة الأكاديمية',
        icon: path.join(__dirname, 'public/favicon.ico'),
      });
    } catch (e) {
      console.error('Shortcut creation note:', e);
    }
  }

  const targetUrl = data.role === 'server'
    ? 'http://localhost:3000'
    : (data.serverIp ? `http://${data.serverIp}:3000` : 'http://localhost:3000');
  if (mainWindow) {
    mainWindow.loadURL(targetUrl);
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
