const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const absolutePath = path.join(__dirname, 'references.param');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,  // Permet d'utiliser Node.js dans le frontend
      contextIsolation: false,
      enableRemoteModule: true // Autorise l'utilisation des modules Electron
    }
  });

  // Charge l'application web existante (par exemple `index.html`)
  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
      mainWindow = null;

      const protocol = require('electron').protocol;

      protocol.interceptFileProtocol('file', (request, callback) => {
          const requestedUrl = request.url.substring(7); // Supprime "file://"
          const filePath = path.resolve(__dirname, requestedUrl); // Construire un chemin absolu
          callback(filePath);
      });
  });
}

ipcMain.handle('fetch-local-file', async (event, filePath) => {
    try {
        const absolutePath = path.resolve(__dirname, filePath); // Gère les chemins relatifs
        const fileContent = fs.readFileSync(absolutePath, 'utf8'); // Lecture du fichier
        return fileContent;
    } catch (error) {
        console.error("Erreur lors de la lecture du fichier local :", error);
        throw error; // Propager l'erreur au frontend
    }
});

app.whenReady().then(() => {
    createWindow();

});

ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });
    return result.filePaths[0];
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
