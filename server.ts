import express from "express";
import session from "express-session";
import { google } from "googleapis";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import multer from "multer";
import AdmZip from "adm-zip";
import pidusage from "pidusage";
import os from "os";
import { exec, spawn } from "child_process";
import mysql from "mysql2/promise";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- MySQL / MariaDB Connection Pool ---
  let dbPool: mysql.Pool | null = null;
  try {
    dbPool = mysql.createPool({
      host: process.env.DB_HOST || "127.0.0.1",
      port: parseInt(process.env.DB_PORT || "3306"),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_DATABASE || "brain_db",
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
    console.log("[DB] Pool de conexão MySQL/MariaDB configurado");
  } catch (e) {
    console.warn("[DB] Erro ao configurar pool MySQL:", e);
  }

  app.set("trust proxy", 1);
  app.use(session({
    secret: process.env.SESSION_SECRET || "cyber-soviet-secret",
    resave: false,
    saveUninitialized: true,
    cookie: { 
      secure: true, 
      sameSite: "none",
      maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
  }));

  // --- Rclone / Backup API Enhanced ---
  const rcloneStatus = {
    running: false,
    lastRun: null as string | null,
    lastResult: null as "success" | "error" | null,
    lastError: "",
    logs: [] as string[],
    progress: ""
  };

  app.get("/api/backup/rclone-status", (req, res) => {
    exec(`rclone version`, (err, stdout) => {
      if (err) {
        return res.json({ 
          installed: false, 
          error: "rclone não encontrado no PATH",
          ...rcloneStatus 
        });
      }
      res.json({ 
        installed: true, 
        version: stdout.split("\n")[0],
        ...rcloneStatus 
      });
    });
  });

  app.get("/api/backup/rclone-progress", (req, res) => {
    res.json(rcloneStatus);
  });

  app.get("/api/system/db-status", async (req, res) => {
    if (!dbPool) return res.json({ connected: false, error: "Pool MySQL não inicializado" });
    try {
      const conn = await dbPool.getConnection();
      await conn.ping();
      conn.release();
      res.json({ 
        connected: true, 
        type: "MySQL/MariaDB",
        host: process.env.DB_HOST || "127.0.0.1",
        database: process.env.DB_DATABASE || "brain_db",
        status: "OPERACIONAL"
      });
    } catch (err) {
      res.json({ 
        connected: false, 
        error: err instanceof Error ? err.message : "Erro desconhecido de conexão",
        tip: "Verifique se o IP e porta estão acessíveis para o servidor na nuvem."
      });
    }
  });

  app.post("/api/backup/rclone-sync", (req, res) => {
    const { remoteName } = req.body;
    if (!remoteName) return res.status(400).json({ error: "Nome do remote não fornecido" });
    if (rcloneStatus.running) return res.status(409).json({ error: "Sync já está em andamento" });

    const sectors = ["setor_alfa", "setor_beta", "setor_gama", "setor_delta"];
    const backupBase = "BACKUPS/archive01";

    rcloneStatus.running = true;
    rcloneStatus.logs = [];
    rcloneStatus.lastError = "";
    rcloneStatus.progress = "Iniciando...";

    res.json({ success: true, message: "Sincronização iniciada" });

    const syncSector = (idx: number) => {
      if (idx >= sectors.length) {
        rcloneStatus.running = false;
        rcloneStatus.lastRun = new Date().toISOString();
        rcloneStatus.lastResult = "success";
        rcloneStatus.progress = "Concluído com sucesso!";
        return;
      }

      const sector = sectors[idx];
      rcloneStatus.progress = `Sincronizando ${sector.toUpperCase()} (${idx + 1}/${sectors.length})...`;

      const proc = spawn("rclone", [
        "copy",
        `./${sector}`,
        `${remoteName}:${backupBase}/${sector.toUpperCase()}`,
        "--create-empty-src-dirs",
        "--progress"
      ]);

      proc.stdout.on("data", (data) => {
        const line = data.toString().trim();
        if (line) {
          rcloneStatus.logs.push(`[${sector}] ${line}`);
          rcloneStatus.progress = line;
          if (rcloneStatus.logs.length > 100) rcloneStatus.logs = rcloneStatus.logs.slice(-100);
        }
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          rcloneStatus.running = false;
          rcloneStatus.lastRun = new Date().toISOString();
          rcloneStatus.lastResult = "error";
          rcloneStatus.lastError = `Falha no setor ${sector} (código ${code})`;
          rcloneStatus.progress = `ERRO: Falha no ${sector}`;
          return;
        }
        syncSector(idx + 1);
      });
    };

    syncSector(0);
  });

  // Runtime Stats: VM Wide (Hardware)
  app.get("/api/runtime/system-stats", async (req, res) => {
    try {
      const si = await import("systeminformation");
      const [cpu, mem, fsData, time] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.time()
      ]);

      const mainDisk = fsData.find((d: any) => d.mount === "/" || d.mount === "C:") || fsData[0];

      res.json({
        cpu: cpu.currentLoad,
        memory: (mem.active / mem.total) * 100,
        load: cpu.avgLoad || 0,
        uptime: time.uptime,
        disk: mainDisk ? {
          total: mainDisk.size,
          used: mainDisk.used,
          free: mainDisk.available,
          percent: mainDisk.use
        } : null
      });
    } catch (err) {
      res.status(500).json({ error: "Erro ao ler hardware" });
    }
  });

  // Configure Multer for uploads
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const { dirName } = req.params;
      // Read from query first as it's more reliable for path metadata in Multer
      const currentSubPath = (req.query.currentSubPath as string) || (req.body.currentSubPath as string) || "";
      const paths = (req.query.paths as string) || (req.body.paths as string) || "";
      
      const pathsMap = paths ? JSON.parse(paths) : {};
      const relativePath = pathsMap[file.originalname] || "";
      
      // Combine: Base Sector + Current Sub-navigation + Relative path from folder upload
      const baseDir = path.join(process.cwd(), dirName);
      let targetDir = baseDir;
      
      if (currentSubPath) {
        targetDir = path.join(targetDir, currentSubPath);
      }
      
      if (relativePath) {
        targetDir = path.join(targetDir, relativePath);
      }
      
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      cb(null, targetDir);
    },
    filename: (req, file, cb) => {
      cb(null, file.originalname);
    }
  });

  const upload = multer({ storage });

  // System Metrics API
  app.get("/api/system/metrics", async (req, res) => {
    try {
      const si = await import("systeminformation");
      const [cpuData, memData, diskData, timeData] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.time()
      ]);

      const mainDisk = diskData.find(d => d.mount === "/" || d.mount === "C:") || diskData[0];

      res.json({
        cpu: {
          load: cpuData.currentLoad,
          cores: os.cpus().length,
          model: os.cpus()[0]?.model || "Unknown"
        },
        memory: {
          total: memData.total,
          free: memData.free,
          used: memData.active,
          percent: (memData.active / memData.total) * 100
        },
        disk: mainDisk ? {
          total: mainDisk.size,
          free: mainDisk.available,
          used: mainDisk.used,
          percent: mainDisk.use
        } : { total: 0, free: 0, used: 0, percent: 0 },
        uptime: timeData.uptime,
        platform: os.platform(),
        arch: os.arch()
      });
    } catch (error) {
      console.error("Metrics error:", error);
      res.status(500).json({ error: "Falha ao obter telemetria" });
    }
  });

  // API Route to list directories with lock status
  app.get("/api/directories", (req, res) => {
    try {
      const rootPath = process.cwd();
      const items = fs.readdirSync(rootPath, { withFileTypes: true });
      
      const excluded = [
        "node_modules", ".git", "src", "dist", ".vite", "public", ".next", ".cache"
      ];
      
      const directories = items
        .filter(item => item.isDirectory())
        .map(item => item.name)
        .filter(name => !excluded.includes(name) && !name.startsWith("."))
        .map(name => {
          const dirPath = path.join(rootPath, name);
          const hasPasswordFile = fs.existsSync(path.join(dirPath, ".password"));
          return { name, isLocked: hasPasswordFile };
        });

      res.json({ directories });
    } catch (error) {
      res.status(500).json({ error: "Failed to list directories" });
    }
  });

  // Storage for running processes
  const runningProcesses = new Map<string, {
    pid: number;
    command: string;
    cwd: string;
    startTime: number;
    process: any;
    env?: Record<string, string>;
    logs: string[];
    alerts: string[];
  }>();

  const MAX_LOG_LINES = 500;
  const appendLog = (id: string, data: string) => {
    const p = runningProcesses.get(id);
    if (p) {
      const timestamp = new Date().toLocaleTimeString();
      const lines = data.split("\n").filter(l => l.trim().length > 0);
      const formatted = lines.map(l => `[${timestamp}] ${l}`);
      p.logs.push(...formatted);
      if (p.logs.length > MAX_LOG_LINES) {
        p.logs = p.logs.slice(-MAX_LOG_LINES);
      }
    }
  };

  // Search API (Recursive + Content search)
  app.get("/api/search", (req, res) => {
    const { q } = req.query;
    if (!q) return res.json({ results: [] });

    const query = (q as string).toLowerCase();
    const results: any[] = [];
    const roots = ["setor_alfa", "setor_beta", "setor_gama", "setor_delta"];

    const searchDir = (currentDir: string, relativePath: string) => {
      try {
        const items = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const item of items) {
          const itemPath = path.join(currentDir, item.name);
          const relPath = path.join(relativePath, item.name);
          
          if (item.name.startsWith(".") || item.name === "node_modules") continue;

          // Name matching
          if (item.name.toLowerCase().includes(query)) {
            const stats = fs.statSync(itemPath);
            results.push({
              name: item.name,
              path: relPath,
              isDir: item.isDirectory(),
              matchType: "name"
            });
          }

          if (item.isDirectory()) {
            searchDir(itemPath, relPath);
          } else {
            // Content matching (only for text files < 1MB)
            const ext = path.extname(item.name).toLowerCase();
            const textExts = [".txt", ".js", ".ts", ".json", ".py", ".html", ".css", ".md"];
            const stats = fs.statSync(itemPath);
            
            if (textExts.includes(ext) && stats.size < 1024 * 1024) {
              const content = fs.readFileSync(itemPath, "utf8");
              if (content.toLowerCase().includes(query)) {
                results.push({
                  name: item.name,
                  path: relPath,
                  isDir: false,
                  matchType: "content"
                });
              }
            }
          }
          if (results.length > 50) break; // Limit results
        }
      } catch (e) {
        console.error("Search error in", currentDir, e);
      }
    };

    for (const root of roots) {
      const rootPath = path.join(process.cwd(), root);
      if (fs.existsSync(rootPath)) {
        searchDir(rootPath, root);
      }
    }

    res.json({ results });
  });

  // Runtime: Execute Script (Enhanced)
  app.post("/api/runtime/run", (req, res) => {
    const { filePath, command, env } = req.body;
    try {
      const fullPath = filePath ? path.join(process.cwd(), filePath) : null;
      const cwd = fullPath ? path.dirname(fullPath) : (req.body.cwd ? path.join(process.cwd(), req.body.cwd) : process.cwd());
      const fileName = fullPath ? path.basename(fullPath) : null;
      
      const cmdParts = (command || "").split(" ");
      let baseCmd = cmdParts[0];
      let args = cmdParts.slice(1);

      if (fileName) {
        if (!baseCmd) {
          baseCmd = fileName.endsWith(".js") ? "node" : fileName.endsWith(".py") ? "python3" : null;
        }
        if (baseCmd) args = [fileName, ...args];
      }
      
      if (!baseCmd) return res.status(400).json({ error: "Comando inválido ou impossível de inferir" });

      const proc = spawn(baseCmd, args, { 
        cwd, 
        detached: true,
        env: { ...process.env, ...env }
      });
      
      const processId = `proc_${Date.now()}`;
      runningProcesses.set(processId, {
        pid: proc.pid,
        command: command || `${baseCmd} ${fileName || ""}`,
        cwd,
        startTime: Date.now(),
        process: proc,
        env: env || {},
        logs: [`[SYSTEM] PROCESSO INICIADO (PID: ${proc.pid})`],
        alerts: []
      });

      proc.stdout.on("data", (data: any) => appendLog(processId, data.toString()));
      proc.stderr.on("data", (data: any) => appendLog(processId, `[ERROR] ${data.toString()}`));

      proc.on("exit", (code: number) => {
        appendLog(processId, `[SYSTEM] PROCESSO FINALIZADO (CÓDIGO: ${code})`);
        setTimeout(() => runningProcesses.delete(processId), 30000); // Manter logs por 30s após fechar
      });

      res.json({ success: true, processId, pid: proc.pid });
    } catch (error) {
      console.error("Launch Error:", error);
      res.status(500).json({ error: "Falha fatal ao disparar processo" });
    }
  });

  // Runtime: Get Process Logs
  app.get("/api/runtime/logs/:id", (req, res) => {
    const p = runningProcesses.get(req.params.id);
    if (!p) return res.status(404).json({ error: "Monitor não encontrado" });
    res.json({ logs: p.logs, alerts: p.alerts });
  });

  // Runtime: Create Server (Project Directory)
  app.post("/api/runtime/create-server", (req, res) => {
    const { name, sector } = req.body;
    if (!name || !sector) return res.status(400).json({ error: "Parâmetros insuficientes" });
    
    // Ensure sector is valid
    const allowed = ["setor_alfa", "setor_beta", "setor_gama", "setor_delta"];
    if (!allowed.includes(sector)) return res.status(400).json({ error: "Setor restrito" });

    const serverDir = name.toLowerCase().replace(/[^a-z0-9]/g, "_");
    const fullPath = path.join(process.cwd(), sector, serverDir);

    try {
      if (fs.existsSync(fullPath)) return res.status(400).json({ error: "O servidor já existe" });
      fs.mkdirSync(fullPath, { recursive: true });
      
      // Seed with some boilerplate if needed
      fs.writeFileSync(path.join(fullPath, "config.json"), JSON.stringify({ name, created: new Date().toISOString(), status: "active" }, null, 2));
      
      res.json({ success: true, path: path.join(sector, serverDir) });
    } catch (err) {
      res.status(500).json({ error: "Falha na criação física do servidor" });
    }
  });

  // Runtime: List Processes
  app.get("/api/runtime/processes", async (req, res) => {
    const list = await Promise.all(
      Array.from(runningProcesses.entries()).map(async ([id, p]) => {
        let stats = { cpu: 0, memory: 0 };
        try {
          stats = await pidusage(p.pid);
          
          // Resource Monitor Alertas
          if (stats.cpu > 80) p.alerts.push(`[ALERTA] CPU ALTA: ${stats.cpu.toFixed(1)}%`);
          if (stats.memory > 512 * 1024 * 1024) p.alerts.push(`[ALERTA] MEMÓRIA ALTA: ${(stats.memory / (1024 * 1024)).toFixed(0)}MB`);
          if (p.alerts.length > 5) p.alerts = p.alerts.slice(-5);

        } catch (e) {
          // Process might have exited
        }
        return {
          id,
          pid: p.pid,
          command: p.command,
          cwd: p.cwd,
          uptime: Date.now() - p.startTime,
          cpu: stats.cpu || 0,
          memory: stats.memory || 0,
          alerts: p.alerts
        };
      })
    );
    res.json({ processes: list });
  });

  // Runtime: Stop Process
  app.post("/api/runtime/stop", (req, res) => {
    const { processId } = req.body;
    const p = runningProcesses.get(processId);
    if (p) {
      try {
        process.kill(-p.pid); // Kill process group if detached
      } catch (e) {
        p.process.kill();
      }
      runningProcesses.delete(processId);
      return res.json({ success: true });
    }
    res.status(404).json({ error: "Processo não encontrado" });
  });

  // API Route to list files and subdirectories within a specific directory
  app.get("/api/directories/:dirName/files", (req, res) => {
    const { dirName } = req.params;
    const { path: subPath } = req.query;
    try {
      const rootDir = path.join(process.cwd(), dirName);
      const targetPath = subPath ? path.join(rootDir, subPath as string) : rootDir;

      if (!fs.existsSync(targetPath)) return res.status(404).json({ error: "Ponto de acesso não encontrado" });

      const items = fs.readdirSync(targetPath, { withFileTypes: true });
      const files = items
        .filter(item => item.name !== ".password")
        .map(item => {
          const itemPath = path.join(targetPath, item.name);
          const stats = fs.statSync(itemPath);
          return {
            name: item.name,
            size: stats.isDirectory() ? 0 : stats.size,
            ext: stats.isDirectory() ? "folder" : (path.extname(item.name).slice(1) || "txt"),
            isDir: stats.isDirectory()
          };
        });

      res.json({ files });
    } catch (error) {
      console.error("List Error:", error);
      res.status(500).json({ error: "Erro ao ler conteúdo do setor" });
    }
  });

  // Create Sub-Directory within a sector
  app.post("/api/files/create-folder", (req, res) => {
    const { dirName, folderName, path: subPath } = req.body;
    try {
      const targetDir = subPath 
        ? path.join(process.cwd(), dirName, subPath, folderName)
        : path.join(process.cwd(), dirName, folderName);
        
      if (fs.existsSync(targetDir)) return res.status(400).json({ error: "Pasta já existe" });
      fs.mkdirSync(targetDir, { recursive: true });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao criar pasta" });
    }
  });

  // Get File Content
  app.get("/api/files/content", (req, res) => {
    const { path: filePath } = req.query;
    try {
      const fullPath = path.join(process.cwd(), filePath as string);
      if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "Arquivo não encontrado" });
      const content = fs.readFileSync(fullPath, "utf-8");
      res.json({ content });
    } catch (error) {
      res.status(500).json({ error: "Erro ao carregar conteúdo" });
    }
  });

  // Save File Content
  app.post("/api/files/save", (req, res) => {
    const { path: filePath, content } = req.body;
    try {
      const fullPath = path.join(process.cwd(), filePath);
      fs.writeFileSync(fullPath, content, "utf-8");
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao salvar arquivo" });
    }
  });

  // Delete File or Folder
  app.post("/api/files/delete", (req, res) => {
    const { path: filePath } = req.body;
    try {
      if (!filePath) return res.status(400).json({ error: "Caminho ausente" });
      const fullPath = path.join(process.cwd(), filePath);
      
      // Security: ensure it is within a valid directory and not escaping
      if (!fullPath.startsWith(process.cwd())) {
        return res.status(403).json({ error: "Operação proibida" });
      }

      if (fs.existsSync(fullPath)) {
        // Use rmSync with recursive: true to handle folders
        // Fallback to rmdirSync if rmSync is somehow missing (legacy node)
        if (typeof fs.rmSync === "function") {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
          fs.rmdirSync(fullPath, { recursive: true });
        }
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Alvo não encontrado" });
      }
    } catch (error) {
      console.error("Delete Error:", error);
      res.status(500).json({ error: "Erro fatal ao eliminar alvo" });
    }
  });

  // Runtime: List ALL System Processes (VM Wide)
  app.get("/api/runtime/system-processes", async (req, res) => {
    try {
      const si = await import("systeminformation");
      const procData = await si.processes();

      // Top 50 processos por consumo (CPU + memória)
      const list = procData.list
        .sort((a, b) => (b.cpu + b.mem) - (a.cpu + a.mem))
        .slice(0, 50)
        .map(p => ({
          pid: p.pid,
          name: p.name,
          cpu: parseFloat(p.cpu.toFixed(1)),
          memory: p.memRss,
          memoryMB: parseFloat((p.memRss / (1024 * 1024)).toFixed(1)),
          user: p.user,
          status: p.state,
          command: p.command || p.name
        }));

      res.json({ processes: list, total: procData.all });
    } catch (err) {
      console.error("System Proc Error:", err);
      res.status(500).json({ error: "Erro ao listar processos do sistema" });
    }
  });

  // Create File - Fixed to handle sub-paths correctly
  app.post("/api/files/create", (req, res) => {
    const { dirName, fileName, path: subPath } = req.body;
    try {
      const baseDir = path.join(process.cwd(), dirName);
      const targetDir = subPath ? path.join(baseDir, subPath) : baseDir;
      const fullPath = path.join(targetDir, fileName);

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      if (fs.existsSync(fullPath)) return res.status(400).json({ error: "Arquivo já existe" });
      
      fs.writeFileSync(fullPath, "", "utf-8");
      res.json({ success: true, path: subPath });
    } catch (error) {
      console.error("Create File Error:", error);
      res.status(500).json({ error: "Erro ao criar arquivo" });
    }
  });

  // Board State Persistence
  const BOARD_STATE_FILE = path.join(process.cwd(), ".board_state.json");

  app.get("/api/board/state", (req, res) => {
    try {
      if (fs.existsSync(BOARD_STATE_FILE)) {
        const data = fs.readFileSync(BOARD_STATE_FILE, "utf-8");
        res.json(JSON.parse(data));
      } else {
        res.json({ nodes: [], zoom: 1, offset: { x: 0, y: 0 } });
      }
    } catch (error) {
      res.status(500).json({ error: "Erro ao carregar mapa" });
    }
  });

  app.post("/api/board/save", (req, res) => {
    try {
      fs.writeFileSync(BOARD_STATE_FILE, JSON.stringify(req.body, null, 2));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao salvar mapa" });
    }
  });

  // Rename File
  app.post("/api/files/rename", (req, res) => {
    const { dirName, path: subPath, oldName, newName } = req.body;
    try {
      const baseDir = subPath ? path.join(process.cwd(), dirName, subPath) : path.join(process.cwd(), dirName);
      const oldPath = path.join(baseDir, oldName);
      const newPath = path.join(baseDir, newName);
      
      if (!fs.existsSync(oldPath)) return res.status(404).json({ error: "Alvo não encontrado" });
      if (fs.existsSync(newPath)) return res.status(400).json({ error: "Novo nome já existe" });

      fs.renameSync(oldPath, newPath);
      res.json({ success: true });
    } catch (error) {
      console.error("Rename Error:", error);
      res.status(500).json({ error: "Erro ao renomear" });
    }
  });

  // Create Directory
  app.post("/api/directories/create", (req, res) => {
    const { dirName } = req.body;
    try {
      const fullPath = path.join(process.cwd(), dirName);
      if (fs.existsSync(fullPath)) return res.status(400).json({ error: "Diretório já existe" });
      fs.mkdirSync(fullPath, { recursive: true });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao criar diretório" });
    }
  });

  // Delete Directory
  app.post("/api/directories/delete", (req, res) => {
    const { dirName } = req.body;
    try {
      const fullPath = path.join(process.cwd(), dirName);
      if (fs.existsSync(fullPath)) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao deletar diretório" });
    }
  });

  // Set Directory Password
  app.post("/api/directories/password", (req, res) => {
    const { dirName, password } = req.body;
    try {
      const rootPath = process.cwd();
      const dirPath = path.join(rootPath, dirName);
      
      if (!fs.existsSync(dirPath)) {
        return res.status(404).json({ error: "Diretório não encontrado" });
      }

      const passwordFilePath = path.join(dirPath, ".password");
      
      if (!password) {
        // Remove password
        if (fs.existsSync(passwordFilePath)) fs.unlinkSync(passwordFilePath);
        return res.json({ success: true, message: "Bloqueio removido" });
      }

      fs.writeFileSync(passwordFilePath, password, "utf-8");
      res.json({ success: true, message: "Bloqueio configurado" });
    } catch (error) {
      res.status(500).json({ error: "Erro ao salvar senha" });
    }
  });

  // ZIP Download for Directory
  app.get("/api/directories/:dirName/download", (req, res) => {
    const { dirName } = req.params;
    try {
      const dirPath = path.join(process.cwd(), dirName);
      if (!fs.existsSync(dirPath)) return res.status(404).json({ error: "Diretório não encontrado" });

      const zip = new AdmZip();
      zip.addLocalFolder(dirPath);
      const data = zip.toBuffer();

      res.set("Content-Type", "application/octet-stream");
      res.set("Content-Disposition", `attachment; filename=${dirName}.zip`);
      res.set("Content-Length", data.length.toString());
      res.send(data);
    } catch (error) {
      console.error("Zip Error:", error);
      res.status(500).json({ error: "Erro ao gerar ZIP" });
    }
  });

  // Multi-file Upload
  app.post("/api/directories/:dirName/upload", upload.array("files"), (req: any, res: any) => {
    const uploadedFiles = req.files || [];
    res.json({ success: true, count: uploadedFiles.length });
  });
  // Main Authentication
  app.post("/api/auth/main", (req, res) => {
    const { password } = req.body;
    if (password === "Jesuseachave33#") {
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false, error: "CÓDIGO INVÁLIDO" });
    }
  });

  // Directory Authentication
  app.post("/api/auth/directory", (req, res) => {
    const { dirName, password } = req.body;
    try {
      const passwordFilePath = path.join(process.cwd(), dirName, ".password");
      if (!fs.existsSync(passwordFilePath)) {
        return res.json({ success: true });
      }
      const correctPassword = fs.readFileSync(passwordFilePath, "utf-8").trim();
      if (password === correctPassword) {
        res.json({ success: true });
      } else {
        res.status(401).json({ success: false, error: "ACESSO NEGADO" });
      }
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // --- BRAIN / INTELLIGENCE MODULE (Merged from HabboNotes) ---
  const BRAIN_DIR = path.join(process.cwd(), "setor_gama", "BRAIN_STORAGE");
  const BRAIN_DB_FILE = path.join(BRAIN_DIR, "hierarchy.json");

  const ensureBrainDir = () => {
    try {
      if (!fs.existsSync(BRAIN_DIR)) fs.mkdirSync(BRAIN_DIR, { recursive: true });
      if (!fs.existsSync(BRAIN_DB_FILE)) {
        const defaultData = {
          hotels: [
            { id: "h1", name: "NÚCLEO CENTRAL", description: "Main Intelligence Hub", icon: "⬡", color: "#ff0000" }
          ],
          apartments: [
            { id: "a1", hotelId: "h1", name: "OPERAÇÃO STARGATE", description: "Classified Operations", icon: "📁", color: "#00ff41", position: 0 }
          ],
          rooms: [
            { id: "r1", apartmentId: "a1", name: "SETOR SITUACIONAL", description: "Primary Data Center", icon: "📂", floorType: "grid", position: 0 }
          ],
          furniture: [
            { id: "f1", roomId: "r1", name: "REGISTRO INICIAL", content: "# REGISTRO INICIAL\nSistemas operacionais. Sincronização de dados 100% concluída.\n\n---\nMonitorando sinais de setor delta.", spriteType: "console", positionX: 2, positionY: 2, position: 0 }
          ]
        };
        fs.writeFileSync(BRAIN_DB_FILE, JSON.stringify(defaultData, null, 2), "utf-8");
      }
    } catch (e) {
      console.error("[BRAIN] Erro ao assegurar diretórios:", e);
    }
  };

  ensureBrainDir();

  const readBrainDB = () => {
    try {
      ensureBrainDir();
      const content = fs.readFileSync(BRAIN_DB_FILE, "utf-8").trim();
      if (!content) {
        return { hotels: [], apartments: [], rooms: [], furniture: [] };
      }
      return JSON.parse(content);
    } catch (e) {
      console.error("[BRAIN] Erro crítico na leitura do banco:", e);
      return { hotels: [], apartments: [], rooms: [], furniture: [] };
    }
  };
  
  const writeBrainDB = (data: any) => {
    try {
      ensureBrainDir();
      const tmpFile = `${BRAIN_DB_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), "utf-8");
      
      // On Windows, renameSync can fail if file is busy. We try a few times.
      if (process.platform === "win32" && fs.existsSync(BRAIN_DB_FILE)) {
        try {
          fs.unlinkSync(BRAIN_DB_FILE);
        } catch (e) {
          // Ignore unlink error if it fails
        }
      }
      fs.renameSync(tmpFile, BRAIN_DB_FILE);
    } catch (e) {
      console.error("[BRAIN] Erro ao gravar banco:", e);
      // Fallback a gravação direta se o rename falhar catastroficamente
      try {
        fs.writeFileSync(BRAIN_DB_FILE, JSON.stringify(data, null, 2), "utf-8");
      } catch (e2) {
        console.error("[BRAIN] Falha total na persistência:", e2);
      }
    }
  };

  app.get("/api/brain/hierarchy", (req, res) => {
    res.json(readBrainDB());
  });

  app.post("/api/brain/furniture", (req, res) => {
    const db = readBrainDB();
    const newItem = { 
      id: `f_${Date.now()}`, 
      ...req.body, 
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.furniture.push(newItem);
    writeBrainDB(db);
    res.json(newItem);
  });

  app.patch("/api/brain/:type/:id", (req, res) => {
    const { type, id } = req.params;
    const db = readBrainDB();
    if (!db[type]) return res.status(400).json({ error: "Invalid type" });

    const idx = db[type].findIndex((item: any) => item.id === id);
    if (idx !== -1) {
      db[type][idx] = { ...db[type][idx], ...req.body, updatedAt: new Date().toISOString() };
      writeBrainDB(db);
      res.json(db[type][idx]);
    } else {
      res.status(404).json({ error: "Item not found" });
    }
  });

  app.post("/api/brain/merge", (req, res) => {
    const { ids, separator = "\n\n---\n\n" } = req.body;
    const db = readBrainDB();
    
    // Respect the order of IDs sent by user
    const itemMap = new Map(db.furniture.map((f: any) => [f.id, f]));
    const items = (ids as string[]).map(id => itemMap.get(id)).filter(Boolean) as any[];
    
    if (items.length === 0) return res.status(400).json({ error: "Nenhum item selecionado" });

    const mergedContent = items.map((f: any) => f.content).join(separator);
    
    const newId = `f_merged_${Date.now()}`;
    const firstItem = items[0];
    const newItem = {
      id: newId,
      roomId: firstItem.roomId,
      name: "LOG_FUSAO_DADOS",
      content: mergedContent,
      spriteType: "multi_console",
      positionX: firstItem.positionX,
      positionY: firstItem.positionY,
      position: db.furniture.length
    };

    db.furniture = db.furniture.filter((f: any) => !ids.includes(f.id));
    db.furniture.push(newItem);
    writeBrainDB(db);
    res.json(newItem);
  });

  app.post("/api/brain/split", (req, res) => {
    const { id, mode, size } = req.body;
    const db = readBrainDB();
    const item = db.furniture.find((f: any) => f.id === id);
    if (!item) return res.status(404).json({ error: "Item not found" });

    let chunks: string[] = [];
    if (mode === "chars") {
      const numSize = parseInt(size);
      for (let i = 0; i < item.content.length; i += numSize) {
        chunks.push(item.content.slice(i, i + numSize));
      }
    } else if (mode === "words") {
      const numSize = parseInt(size);
      const words = item.content.split(/\s+/);
      for (let i = 0; i < words.length; i += numSize) {
        chunks.push(words.slice(i, i + numSize).join(" "));
      }
    } else {
      chunks = item.content.split("\n").filter((l: string) => l.trim().length > 0);
    }

    const newItems = chunks.map((content, idx) => ({
      id: `f_split_${Date.now()}_${idx}`,
      roomId: item.roomId,
      name: `${item.name}_FRAGMENT_${idx + 1}`,
      content,
      spriteType: item.spriteType,
      positionX: item.positionX + idx,
      positionY: item.positionY,
      position: db.furniture.length + idx,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));

    db.furniture = db.furniture.filter((f: any) => f.id !== id);
    db.furniture.push(...newItems);
    writeBrainDB(db);
    res.json({ success: true, count: newItems.length });
  });

  // Export Brain to Zip
  app.get("/api/brain/export/:hotelId", (req, res) => {
    const db = readBrainDB();
    const hotel = db.hotels.find((h: any) => h.id === req.params.hotelId);
    if (!hotel) return res.status(404).json({ error: "Hotel not found" });

    const zip = new AdmZip();
    const hotelApts = db.apartments.filter((a: any) => a.hotelId === hotel.id);
    
    hotelApts.forEach((apt: any) => {
      const aptRooms = db.rooms.filter((r: any) => r.apartmentId === apt.id);
      aptRooms.forEach((room: any) => {
        const roomFurn = db.furniture.filter((f: any) => f.roomId === room.id);
        roomFurn.forEach((furn: any) => {
          const filePath = `${hotel.name}/${apt.name}/${room.name}/${furn.name}.md`;
          zip.addFile(filePath, Buffer.from(furn.content, "utf-8"));
        });
      });
    });

    const data = zip.toBuffer();
    res.set("Content-Type", "application/octet-stream");
    res.set("Content-Disposition", `attachment; filename=BRAIN_EXPORT_${hotel.name}.zip`);
    res.send(data);
  });

  // Generic Create Route (Renamed to avoid conflict)
  app.post("/api/brain/create/:type", (req, res) => {
    const { type } = req.params;
    const db = readBrainDB();
    if (!db[type]) return res.status(400).json({ error: "Tipo inválido" });
    
    const newItem = { 
      id: `${type.slice(0, 1)}_${Date.now()}`, 
      ...req.body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db[type].push(newItem);
    writeBrainDB(db);
    res.json(newItem);
  });

  app.delete("/api/brain/:type/:id", (req, res) => {
    const { type, id } = req.params;
    const db = readBrainDB();
    if (!db[type]) return res.status(400).json({ error: "Invalid type" });

    db[type] = db[type].filter((item: any) => item.id !== id);

    // CASCADE DELETES
    if (type === "hotels") {
      const aptIds = db.apartments.filter((a: any) => a.hotelId === id).map((a: any) => a.id);
      const roomIds = db.rooms.filter((r: any) => aptIds.includes(r.apartmentId)).map((r: any) => r.id);
      db.furniture = db.furniture.filter((f: any) => !roomIds.includes(f.roomId));
      db.rooms = db.rooms.filter((r: any) => !aptIds.includes(r.apartmentId));
      db.apartments = db.apartments.filter((a: any) => a.hotelId !== id);
    }

    if (type === "apartments") {
      const roomIds = db.rooms.filter((r: any) => r.apartmentId === id).map((r: any) => r.id);
      db.furniture = db.furniture.filter((f: any) => !roomIds.includes(f.roomId));
      db.rooms = db.rooms.filter((r: any) => r.apartmentId !== id);
    }

    if (type === "rooms") {
      db.furniture = db.furniture.filter((f: any) => f.roomId !== id);
    }

    writeBrainDB(db);
    res.json({ success: true });
  });

  // --- End Brain APIs ---

  // Site Preview (serves any file in the directory)
  app.get("/site/:dir/:filename(*)?", (req, res) => {
    const { dir, filename } = req.params;
    const subPath = filename ? filename : "index.html"; 
    const fullPath = path.join(process.cwd(), dir, subPath);
    
    if (fs.existsSync(fullPath) && !fs.lstatSync(fullPath).isDirectory()) {
      res.sendFile(fullPath);
    } else if (subPath === "/index.html" || subPath === "/") {
      res.status(404).send(`
        <body style="background:black;color:#00ff41;font-family:monospace;padding:50px;border: 2px solid #00ff41;">
          <h2>[ERRO DE SISTEMA: 404] PONTO DE ENTRADA AUSENTE</h2>
          <p>O DIRETÓRIO '${dir}' NÃO CONTÉM UM ARQUIVO 'index.html'.</p>
          <hr/>
          <p>DICA: Crie um arquivo index.html na pasta para ativar o domínio.</p>
        </body>
      `);
    } else {
      res.status(404).send("Arquivo não encontrado no diretório do site.");
    }
  });

  // Serve user files for preview
  app.use("/preview", (req, res, next) => {
    // Protection: don't serve passwords, env or node_modules
    const forbidden = [".password", ".env", "node_modules", ".git"];
    if (forbidden.some(pattern => req.path.includes(pattern))) {
      return res.status(403).send("ACESSO NEGADO");
    }
    next();
  }, express.static(process.cwd()));

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n-- SISTEMA INICIALIZADO --`);
    console.log(`Interno: http://localhost:${PORT}`);
    console.log(`Externo: http://20.161.72.67:${PORT}`);
    console.log(`Modo: ${process.env.NODE_ENV === 'production' ? 'PRODUÇÃO (DADOS BLINDADOS)' : 'DESENVOLVIMENTO'}\n`);
  });
}

startServer();
