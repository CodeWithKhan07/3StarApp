const { app, BrowserWindow, net, protocol, shell } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

function registerAppProtocol() {
  const root = path.resolve(__dirname, "..", "out");
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    let relative = decodeURIComponent(url.pathname).replace(/^[/\\]+/, "");
    if (!path.extname(relative)) relative = path.join(relative, "index.html");
    const target = path.resolve(root, relative || "index.html");
    if (!target.startsWith(root)) return new Response("Forbidden", { status: 403 });
    return net.fetch(pathToFileURL(target).toString());
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 390,
    minHeight: 640,
    backgroundColor: "#f7f9fb",
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
  if (!app.isPackaged) window.loadURL("http://localhost:3000");
  else window.loadURL("app://bundle/");
}

app.whenReady().then(() => {
  if (app.isPackaged) registerAppProtocol();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
