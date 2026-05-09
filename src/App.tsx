/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Folder, Terminal, Cpu, Database, Activity, Star, Lock, ShieldAlert, Key, Settings, Copy, Check, Network, LayoutGrid, FileText, ChevronLeft, Binary, Trash2, Plus, Save, X, Maximize, Minimize, ExternalLink, Link, Download, Upload, FolderPlus, Search, Square, Play, Cloud, LogOut, RefreshCw, Layers } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import IntelligenceModule from './components/IntelligenceModule';
import GraphView from './components/GraphView';

interface DirectoryInfo {
  name: string;
  isLocked: boolean;
}

interface FileInfo {
  name: string;
  size: number;
  ext: string;
  isDir?: boolean;
}

// SecondBrain Types (Military Theme)
interface BrainNucleus { id: string; name: string; description?: string; icon: string; color: string; }
interface BrainOperation { id: string; nucleusId: string; name: string; description?: string; icon: string; color: string; position: number; }
interface BrainSector { id: string; operationId: string; name: string; description?: string; icon: string; floorType: string; position: number; }
interface BrainRegistry { id: string; sectorId: string; name: string; content: string; spriteType: string; positionX: number; positionY: number; position: number; }

interface BrainHierarchy {
  hotels: BrainNucleus[]; // Kept keys for API compatibility but labeled with military terms
  apartments: BrainOperation[];
  rooms: BrainSector[];
  furniture: BrainRegistry[];
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'OPERATIONS' | 'INTELLIGENCE'>('OPERATIONS');
  const [brainData, setBrainData] = useState<BrainHierarchy | null>(null);
  const [selectedBrainItem, setSelectedBrainItem] = useState<{ type: string, id: string } | null>(null);
  const [brainViewMode, setBrainViewMode] = useState<'MAP' | 'EDITOR' | 'LIST'>('MAP');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['h1']));
  
  const [dirs, setDirs] = useState<DirectoryInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [time, setTime] = useState(new Date().toLocaleTimeString('pt-BR', { hour12: false }));
  const [searchQuery, setSearchQuery] = useState('');
  
  // Auth States
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [mainPassword, setMainPassword] = useState('');
  const [authError, setAuthError] = useState(false);
  
  // Directory Access/Admin States
  const [activeLockedDir, setActiveLockedDir] = useState<string | null>(null);
  const [dirPassword, setDirPassword] = useState('');
  const [dirAuthError, setDirAuthError] = useState(false);
  const [configDir, setConfigDir] = useState<string | null>(null);
  const [newDirPassword, setNewDirPassword] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'grid' | 'graph'>('grid');
  const [audioCtx, setAudioCtx] = useState<AudioContext | null>(null);

  // File Explorer States
  const [selectedDir, setSelectedDir] = useState<string | null>(null);
  const [currentSubPath, setCurrentSubPath] = useState<string | null>(null);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [editingFile, setEditingFile] = useState<{ path: string, content: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [systemMetrics, setSystemMetrics] = useState<any>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [starredDirs, setStarredDirs] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('pri_starred_dirs');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  
  useEffect(() => {
    localStorage.setItem('pri_starred_dirs', JSON.stringify(starredDirs));
  }, [starredDirs]);

  const toggleStarDir = (dirName: string) => {
    playClick();
    setStarredDirs(prev => 
      prev.includes(dirName) 
        ? prev.filter(d => d !== dirName) 
        : [...prev, dirName]
    );
  };
  const [isSearching, setIsSearching] = useState(false);
  const [activeProcesses, setActiveProcesses] = useState<any[]>([]);
  const [systemProcesses, setSystemProcesses] = useState<any[]>([]);
  const [showProcessManager, setShowProcessManager] = useState(false);
  const [showSystemProcesses, setShowSystemProcesses] = useState(false);
  const [metricsHistory, setMetricsHistory] = useState<any[]>([]);
  
  const [isCreatingServer, setIsCreatingServer] = useState(false);
  const [newServerData, setNewServerData] = useState({ name: '', sector: 'setor_alfa' });
  const [selectedProcessLogs, setSelectedProcessLogs] = useState<string | null>(null);
  const [processLogsList, setProcessLogsList] = useState<string[]>([]);
  const [processEnv, setProcessEnv] = useState<string>('');

  const handleCreateServer = async () => {
    if (!newServerData.name) return;
    try {
      const res = await fetch('/api/runtime/create-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newServerData)
      });
      if (res.ok) {
        alert("SERVIDOR CRIADO COM SUCESSO");
        setIsCreatingServer(false);
        setNewServerData({ name: '', sector: 'setor_alfa' });
        refreshDirs();
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (err) {
      alert("ERRO NA CONEXÃO");
    }
  };

  const fetchLogs = async (procId: string) => {
    try {
      const res = await fetch(`/api/runtime/logs/${procId}`);
      if (res.ok) {
        const data = await res.json();
        setProcessLogsList(data.logs);
      }
    } catch (err) {
      console.warn("Falha ao ler logs");
    }
  };

  useEffect(() => {
    let interval: any;
    if (selectedProcessLogs) {
      fetchLogs(selectedProcessLogs);
      interval = setInterval(() => fetchLogs(selectedProcessLogs), 2000);
    }
    return () => clearInterval(interval);
  }, [selectedProcessLogs]);
  const [isRcloneInstalled, setIsRcloneInstalled] = useState(false);
  const [rcloneRemote, setRcloneRemote] = useState('gdrive');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [rcloneStatus, setRcloneStatus] = useState<any>(null);
  const [showRcloneLogs, setShowRcloneLogs] = useState(false);

  // System Logs for Atmosphere
  const [logs, setLogs] = useState<string[]>(["SISTEMA INICIALIZADO", "NÚCLEO ESTÁVEL", "AGUARDANDO INPUT..."]);
  const [dbStatus, setDbStatus] = useState<any>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const checkDbStatus = async () => {
    try {
      const res = await fetch('/api/system/db-status');
      if (res.ok) setDbStatus(await res.json());
    } catch (e) {
      setDbStatus({ connected: false });
    }
  };

  useEffect(() => {
    checkDbStatus();
    const dbInterval = setInterval(checkDbStatus, 10000);
    return () => clearInterval(dbInterval);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString('pt-BR', { hour12: false }));
    }, 1000);

    // Random atmosphere logs
    const logTimer = setInterval(() => {
      const messages = [
        "RADIAÇÃO DE FUNDO: 0.12 mSv",
        "SINCRONIZANDO CANAIS PHOSPHOR...",
        "MEMÓRIA VAZANDO EM SETOR 0x4F",
        "PROTOCOLO OUROBOROS ATIVO",
        "RECEBENDO DADOS DE SVERDLOVSK",
        "INTEGRIDADE DO NÚCLEO: NOMINAL",
        "NÚCLEO CENTRAL CONECTADO",
        "OPERAÇÃO STARGATE: EM CURSO...",
        "PING: ESTAÇÃO ESPACIAL MIR... OK"
      ];
      setLogs(prev => [...prev.slice(-15), `[${new Date().toLocaleTimeString()}] ${messages[Math.floor(Math.random() * messages.length)]}`]);
    }, 4000);

    // Deep link check
    const params = new URLSearchParams(window.location.search);
    const sharedDir = params.get('dir');

    if (isAuthorized) {
      refreshDirs(sharedDir);
      fetchMetrics();
      fetchProcesses();
      fetchBrainData();
      const metricsInterval = setInterval(fetchMetrics, 3000);
      const procInterval = setInterval(fetchProcesses, 3000);
      return () => {
        clearInterval(timer);
        clearInterval(logTimer);
        clearInterval(metricsInterval);
        clearInterval(procInterval);
      };
    }

    return () => {
      clearInterval(timer);
      clearInterval(logTimer);
    };
  }, [isAuthorized]);

  const fetchBrainData = async () => {
    try {
      const res = await fetch('/api/brain/hierarchy');
      if (res.ok) setBrainData(await res.json());
    } catch (e) { console.warn("Intelligence Hub Offline"); }
  };

  const handleUpdateFurniture = async (id: string, updates: any) => {
    try {
      const res = await fetch(`/api/brain/furniture/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) fetchBrainData();
    } catch (e) { alert("ERROR UPDATING BRAIN"); }
  };

  const handleSplitBrainItem = async (id: string) => {
    const size = prompt("CHUNK SIZE (CHARS):", "500");
    if (!size) return;
    try {
      const res = await fetch('/api/brain/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, mode: 'chars', size: parseInt(size) })
      });
      if (res.ok) {
        alert("ITEM DIVIDIDO!");
        fetchBrainData();
      }
    } catch (e) { alert("FALHA NO SPLIT"); }
  };

  const handleMergeBrainItems = async (ids: string[]) => {
    if (ids.length < 2) return;
    try {
      const res = await fetch('/api/brain/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      if (res.ok) {
        alert("FUSÃO COMPLETA!");
        fetchBrainData();
      }
    } catch (e) { alert("FALHA NA FUSÃO"); }
  };

  const fetchMetrics = async () => {
    try {
      const siRes = await fetch('/api/system/metrics');
      if (siRes.ok) setSystemMetrics(await siRes.json());
      
      const statsRes = await fetch('/api/runtime/system-stats');
      if (statsRes.ok) {
        const data = await statsRes.json();
        // Update history for charts
        setMetricsHistory(prev => {
          const newPoint = {
            time: new Date().toLocaleTimeString(),
            cpu: data.cpu,
            ram: data.memory,
            disk: systemMetrics?.disk?.percent || 0
          };
          const next = [...prev, newPoint];
          return next.slice(-20);
        });
      }
    } catch (err) {
      console.warn("Telemetry offline");
    }
  };

  const fetchProcesses = async () => {
    try {
      // 1. Fetch internal tracked processes
      const res = await fetch('/api/runtime/processes');
      if (res.ok) {
        const data = await res.json();
        setActiveProcesses(data.processes);
      }

      // 2. Fetch all system processes (VM wide)
      const sysRes = await fetch('/api/runtime/system-processes');
      if (sysRes.ok) {
        const sysData = await sysRes.json();
        setSystemProcesses(sysData.processes);
      }
    } catch (err) {
      console.warn("Process monitor offline");
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    playProcessing();
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch (err) {
      alert("ERRO NA BUSCA");
    } finally {
      setIsSearching(false);
    }
  };

  const handleRunScript = async (file: FileInfo) => {
    playClick();
    const filePath = currentSubPath 
      ? `${selectedDir}/${currentSubPath}/${file.name}`
      : `${selectedDir}/${file.name}`;
    
    // Parse ENV vars if any (pattern: KEY=VAL,KEY2=VAL2)
    const runString = prompt("COMANDO [OPÇÕES] [ENV: VAR=VAL,...]:", file.name.endsWith('.js') ? 'node' : 'python3');
    if (!runString) return;

    let command = runString;
    let env: Record<string, string> = {};

    if (runString.includes("ENV:")) {
      const parts = runString.split("ENV:");
      command = parts[0].trim();
      const envPart = parts[1].trim();
      envPart.split(",").forEach(pair => {
        const [k, v] = pair.split("=");
        if (k && v) env[k.trim()] = v.trim();
      });
    }

    playProcessing();
    try {
      const res = await fetch('/api/runtime/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, command, env })
      });
      if (res.ok) {
        alert("PROCESSO INICIADO NO BACKEND!");
        fetchProcesses();
        setShowProcessManager(true);
      } else {
        const data = await res.json();
        alert(data.error || "ERRO AO EXECUTAR");
      }
    } catch (err) {
      alert("ERRO DE COMUNICAÇÃO");
    }
  };

  const handleStopProcess = async (processId: string) => {
    playClick();
    try {
      const res = await fetch('/api/runtime/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processId })
      });
      if (res.ok) fetchProcesses();
    } catch (err) {
      alert("ERRO AO PARAR");
    }
  };

  const checkRcloneStatus = async () => {
    try {
      const res = await fetch('/api/backup/rclone-status');
      const data = await res.json();
      setIsRcloneInstalled(data.installed);
    } catch (err) {
      console.warn("Rclone check offline");
    }
  };

  const handleRcloneBackup = async () => {
    playClick();
    if (!isRcloneInstalled) return alert("RCLONE NÃO DETECTADO NO SERVIDOR!");
    
    setIsBackingUp(true);
    try {
      const res = await fetch('/api/backup/rclone-sync', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remoteName: rcloneRemote })
      });
      if (res.ok) {
        setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] RCLONE: SYNC INICIADO PARA '${rcloneRemote.toUpperCase()}'`]);
        
        // Start Polling
        const pollResult = setInterval(async () => {
          const statusRes = await fetch('/api/backup/rclone-progress');
          if (statusRes.ok) {
            const data = await statusRes.json();
            setRcloneStatus(data);
            if (!data.running) {
              clearInterval(pollResult);
              setIsBackingUp(false);
              if (data.lastResult === 'success') {
                alert("BACKUP CONCLUÍDO COM SUCESSO!");
              } else {
                alert(`FALHA NO BACKUP: ${data.lastError}`);
              }
            }
          }
        }, 2000);
      } else {
        const data = await res.json();
        alert(data.error || "FALHA NO BACKUP");
        setIsBackingUp(false);
      }
    } catch (err) {
      alert("ERRO DE COMUNICAÇÃO");
      setIsBackingUp(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      checkRcloneStatus();
    }
  }, [isAuthorized]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const playClick = () => {
    let currentCtx = audioCtx;
    if (!currentCtx) {
      currentCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      setAudioCtx(currentCtx);
    }
    
    if (currentCtx.state === 'suspended') currentCtx.resume();
    
    const t = currentCtx.currentTime;
    
    // Impact component
    const osc1 = currentCtx.createOscillator();
    const gain1 = currentCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(2400, t);
    osc1.frequency.exponentialRampToValueAtTime(1500, t + 0.02);
    gain1.gain.setValueAtTime(0.08, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
    osc1.connect(gain1);
    gain1.connect(currentCtx.destination);

    // Mechanical thud
    const osc2 = currentCtx.createOscillator();
    const gain2 = currentCtx.createGain();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(140, t);
    osc2.frequency.exponentialRampToValueAtTime(60, t + 0.05);
    gain2.gain.setValueAtTime(0.04, t);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc2.connect(gain2);
    gain2.connect(currentCtx.destination);

    // Friction noise
    const bufferSize = currentCtx.sampleRate * 0.02;
    const buffer = currentCtx.createBuffer(1, bufferSize, currentCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = currentCtx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = currentCtx.createGain();
    noiseGain.gain.setValueAtTime(0.015, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
    noise.connect(noiseGain);
    noiseGain.connect(currentCtx.destination);
    
    osc1.start(t);
    osc1.stop(t + 0.02);
    osc2.start(t);
    osc2.stop(t + 0.05);
    noise.start(t);
  };

  const handleDownloadZip = () => {
    if (!selectedDir) return;
    playClick();
    window.location.href = `/api/directories/${selectedDir}/download`;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, isFolder: boolean = false) => {
    const filesList = e.target.files;
    if (!filesList || filesList.length === 0 || !selectedDir) return;

    playClick();
    const formData = new FormData();
    const pathsMap: { [key: string]: string } = {};

    // 1. Calculate paths first
    Array.from(filesList).forEach((file: File) => {
      if (isFolder && (file as any).webkitRelativePath) {
        const fullPath = (file as any).webkitRelativePath;
        const relativePath = fullPath.substring(0, fullPath.lastIndexOf('/'));
        pathsMap[file.name] = relativePath;
      }
    });

    // 2. Append non-file fields BEFORE files. This is CRITICAL for Multer
    if (currentSubPath) {
      formData.append('currentSubPath', currentSubPath);
    }
    formData.append('paths', JSON.stringify(pathsMap));

    // 3. Append files last
    Array.from(filesList).forEach((file: File) => {
      formData.append('files', file);
    });

    try {
      // Send metadata in query as well for better reliability with Multer diskStorage
      const queryParams = new URLSearchParams();
      if (currentSubPath) queryParams.append('currentSubPath', currentSubPath);
      queryParams.append('paths', JSON.stringify(pathsMap));

      const res = await fetch(`/api/directories/${selectedDir}/upload?${queryParams.toString()}`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        alert('UPLOAD CONCLUÍDO!');
        openFileExplorer(selectedDir, currentSubPath);
      } else {
        const err = await res.json();
        alert(`FALHA NO UPLOAD: ${err.error}`);
      }
    } catch (err) {
      alert('ERRO DE CONEXÃO DURANTE UPLOAD');
    }
  };

  // HDD "Processing" Sound Synthesis
  const playProcessing = () => {
    let currentCtx = audioCtx;
    if (!currentCtx) {
      currentCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      setAudioCtx(currentCtx);
    }
    if (currentCtx.state === 'suspended') currentCtx.resume();
    
    const t = currentCtx.currentTime;
    const count = 4 + Math.floor(Math.random() * 5);
    
    for(let i = 0; i < count; i++) {
      const startTime = t + (i * 0.035);
      const osc = currentCtx.createOscillator();
      const gain = currentCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(45 + Math.random() * 15, startTime);
      gain.gain.setValueAtTime(0.012, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.015);
      osc.connect(gain);
      gain.connect(currentCtx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.015);
    }
  };

  const handleCreateFile = async () => {
    playClick();
    const fileName = prompt("NOME DO NOVO ARQUIVO (EX: INDEX.HTML):");
    if (!fileName) return;

    playProcessing();
    const res = await fetch('/api/files/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        dirName: selectedDir, 
        fileName,
        path: currentSubPath 
      })
    });
    if (res.ok) {
      openFileExplorer(selectedDir!, currentSubPath);
    } else {
      const data = await res.json();
      alert(data.error || 'ERRO AO CRIAR ARQUIVO');
    }
  };

  const handleCreateFolder = async () => {
    playClick();
    const folderName = prompt("NOME DA NOVA PASTA:");
    if (!folderName) return;

    playProcessing();
    const res = await fetch('/api/files/create-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        dirName: selectedDir, 
        folderName,
        path: currentSubPath 
      })
    });
    if (res.ok) {
      openFileExplorer(selectedDir!, currentSubPath);
    } else {
      const data = await res.json();
      alert(data.error || 'ERRO AO CRIAR PASTA');
    }
  };

  const handleRenameFile = async (oldName: string) => {
    playClick();
    const newName = prompt("NOVO NOME DO ALVO:", oldName);
    if (!newName || newName === oldName) return;

    playProcessing();
    const res = await fetch('/api/files/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        dirName: selectedDir, 
        path: currentSubPath,
        oldName, 
        newName 
      })
    });
    
    if (res.ok) {
      openFileExplorer(selectedDir!, currentSubPath);
    } else {
      const data = await res.json();
      alert(data.error || 'ERRO AO RENOMEAR');
    }
  };

  const handleCreateDir = async () => {
    playClick();
    const dirName = prompt("NOME DA NOVA PASTA (DOMÍNIO):");
    if (!dirName) return;

    const res = await fetch('/api/directories/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dirName })
    });
    if (res.ok) {
      refreshDirs();
    } else {
      const data = await res.json();
      alert(data.error || 'ERRO AO CRIAR PASTA');
    }
  };

  const handleDeleteDir = async (dirName: string) => {
    playClick();
    if (!confirm(`CUIDADO: ESTA AÇÃO IRÁ APAGAR TODO O CONTEÚDO DE '${dirName}'. CONTINUAR?`)) return;
    
    const res = await fetch('/api/directories/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dirName })
    });
    if (res.ok) {
      refreshDirs();
    } else {
      alert('ERRO AO DELETAR PASTA');
    }
  };

  const handleEditFile = async (file: FileInfo) => {
    playClick();
    const filePath = currentSubPath 
      ? `${selectedDir}/${currentSubPath}/${file.name}`
      : `${selectedDir}/${file.name}`;
    try {
      const res = await fetch(`/api/files/content?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      setEditingFile({ path: filePath, content: data.content });
    } catch (err) {
      alert('ERRO AO CARREGAR ARQUIVO');
    }
  };

  const handleSaveFile = async () => {
    playClick();
    if (!editingFile) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/files/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: editingFile.path, content: editingFile.content })
      });
      if (res.ok) {
        setEditingFile(null);
        openFileExplorer(selectedDir!, currentSubPath);
      }
    } catch (err) {
      alert('ERRO AO SALVAR');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteFile = async (file: FileInfo) => {
    playClick();
    const confirmMsg = file.isDir 
      ? `CUIDADO: DESEJA ELIMINAR A PASTA '${file.name}' E TODOS OS SEUS ARQUIVOS INTERNOS?`
      : `TEM CERTEZA QUE DESEJA ELIMINAR ${file.name}?`;
      
    if (!confirm(confirmMsg)) return;
    
    const filePath = currentSubPath 
      ? `${selectedDir}/${currentSubPath}/${file.name}`
      : `${selectedDir}/${file.name}`;
    try {
      const res = await fetch('/api/files/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath })
      });
      if (res.ok) {
        openFileExplorer(selectedDir!, currentSubPath);
      } else {
        const errorData = await res.json();
        alert(`FALHA NA ELIMINAÇÃO: ${errorData.error}`);
      }
    } catch (err) {
      alert('ERRO DE CONEXÃO AO TENTAR DELETAR');
    }
  };

  const refreshDirs = (autoOpenDir?: string | null) => {
    setLoading(true);
    fetch('/api/directories')
      .then(res => res.json())
      .then(data => {
        const directoryList: DirectoryInfo[] = data.directories || [];
        setDirs(directoryList);
        setLoading(false);

        if (autoOpenDir) {
          const target = directoryList.find(d => d.name === autoOpenDir);
          if (target) handleDirAccess(target);
        }
      })
      .catch(err => {
        console.error(err);
        setError('ERRO DE CONEXÃO COM O NÚCLEO');
        setLoading(false);
      });
  };

  const handleMainLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/auth/main', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: mainPassword })
    });
    if (res.ok) {
      setIsAuthorized(true);
      setAuthError(false);
    } else {
      setAuthError(true);
      setMainPassword('');
    }
  };

  const handleDirAccess = async (dir: DirectoryInfo) => {
    setCurrentSubPath(null);
    if (dir.isLocked) {
      setActiveLockedDir(dir.name);
      setDirPassword('');
      setDirAuthError(false);
    } else {
      openFileExplorer(dir.name, null);
    }
  };

  const openFileExplorer = async (dirName: string, subPath: string | null = null) => {
    setSelectedDir(dirName);
    setCurrentSubPath(subPath);
    setFilesLoading(true);
    try {
      const url = subPath 
        ? `/api/directories/${dirName}/files?path=${encodeURIComponent(subPath)}`
        : `/api/directories/${dirName}/files`;
      const res = await fetch(url);
      const data = await res.json();
      setFiles(data.files || []);
    } catch (err) {
      console.error(err);
    } finally {
      setFilesLoading(false);
    }
  };

  const verifyDirPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/auth/directory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dirName: activeLockedDir, password: dirPassword })
    });
    if (res.ok) {
      const name = activeLockedDir!;
      setActiveLockedDir(null);
      openFileExplorer(name);
    } else {
      setDirAuthError(true);
      setDirPassword('');
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/directories/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dirName: configDir, password: newDirPassword })
    });
    if (res.ok) {
      setConfigDir(null);
      setNewDirPassword('');
      refreshDirs();
    } else {
      alert('ERRO AO DEFINIR SENHA');
    }
  };

  const copyLink = (dirName: string, type: 'explorer' | 'site' = 'explorer') => {
    let link = `${window.location.origin}/?dir=${dirName}`;
    if (type === 'site') {
      link = `${window.location.origin}/site/${dirName}`;
    }
    navigator.clipboard.writeText(link);
    setCopiedId(`${dirName}-${type}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredDirs = dirs.filter(d => 
    d.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isAuthorized) {
    return (
      <div className="h-screen w-full bg-terminal-bg flex items-center justify-center p-4 flicker font-mono overflow-hidden">
        <div className="crt-scanline" />
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full border-4 border-soviet-red p-8 bg-[#121212] shadow-[10px_10px_0px_#c82323] relative z-10"
        >
          <div className="flex flex-col items-center mb-8 gap-4">
            <ShieldAlert size={64} className="text-soviet-red animate-pulse" />
            <h1 className="text-4xl font-black uppercase text-soviet-red soviet-header glow-text">Acesso Restrito</h1>
            <p className="text-[10px] tracking-[0.4em] opacity-60 uppercase text-center">Protocolo de Segurança PRIYNKA-01</p>
          </div>

          <form onSubmit={handleMainLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-phosphor">Digite Código de Acesso:</label>
              <div className="relative">
                <input 
                  type="password" 
                  autoFocus
                  required
                  value={mainPassword}
                  onChange={(e) => { playClick(); setMainPassword(e.target.value); }}
                  className={`w-full bg-black border-2 ${authError ? 'border-red-600 animate-shake' : 'border-phosphor'} p-4 text-phosphor outline-none focus:glow-text uppercase tracking-[0.5em] text-center text-xl`}
                />
              </div>
              {authError && <p className="text-red-600 text-[10px] font-bold uppercase animate-pulse">Código de Acesso Recusado</p>}
            </div>
            <button className="w-full bg-soviet-red text-black font-bold p-4 uppercase hover:bg-phosphor transition-colors">Inicializar Terminal</button>
          </form>

          <footer className="mt-8 pt-4 border-t border-border-gray text-[8px] opacity-40 uppercase space-y-1">
            <p>Sistema de Defesa Civil S-400</p>
            <p>© 1982 Kremlin Tech • {time}</p>
          </footer>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col border-[12px] border-panel-bg relative overflow-hidden select-none flicker">
      <div className="crt-scanline" />
      <div className="scanline-beam" />
      
      <AnimatePresence>
        {editingFile && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black flex flex-col p-8 font-mono"
          >
            <div className="flex items-center justify-between mb-4 border-b-2 border-phosphor pb-4">
              <div className="flex items-center gap-3">
                <FileText className="text-phosphor" />
                <h3 className="text-xl font-bold uppercase tracking-widest text-phosphor">EDITOR DE NÚCLEO: {editingFile.path}</h3>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={handleSaveFile}
                  disabled={isSaving}
                  className="flex items-center gap-2 bg-phosphor text-black font-bold px-4 py-2 hover:bg-white transition-colors disabled:opacity-50"
                >
                  <Save size={16} /> {isSaving ? 'SALVANDO...' : 'SALVAR'}
                </button>
                <button 
                  onClick={() => { playClick(); setEditingFile(null); }}
                  className="flex items-center gap-2 border-2 border-phosphor text-phosphor font-bold px-4 py-2 hover:bg-phosphor hover:text-black transition-colors"
                >
                  <X size={16} /> FECHAR
                </button>
              </div>
            </div>
            <textarea 
              value={editingFile.content}
              onChange={(e) => { playClick(); setEditingFile({ ...editingFile, content: e.target.value }); }}
              className="flex-1 bg-black text-phosphor border-2 border-border-gray p-6 outline-none focus:border-phosphor resize-none text-lg leading-relaxed custom-scrollbar spell-check-false"
              autoFocus
            />
            <div className="mt-4 flex justify-between text-[10px] opacity-40 uppercase">
              <span>Linhas: {editingFile.content.split('\n').length}</span>
              <span>Encoding: UTF-8</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Configuration Modal */}
      <AnimatePresence>
        {configDir && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 cursor-default"
          >
            <div className="max-w-sm w-full border-4 border-soviet-red p-6 bg-terminal-bg shadow-[8px_8px_0px_#c82323]">
              <div className="flex items-center gap-4 mb-6">
                <Settings className="text-soviet-red" />
                <h3 className="text-xl font-bold uppercase tracking-tighter">Gestão do Setor: {configDir}</h3>
              </div>
              
              <form onSubmit={handleSetPassword} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-soviet-red">Nova Senha de Acesso:</label>
                  <input 
                    type="text" 
                    autoFocus
                    placeholder="DEIXE VAZIO PARA REMOVER..."
                    value={newDirPassword}
                    onChange={(e) => setNewDirPassword(e.target.value)}
                    className="w-full bg-black border-2 border-border-gray p-3 text-phosphor outline-none uppercase placeholder:text-[8px]"
                  />
                </div>
                <div className="flex gap-2 pt-4">
                  <button type="submit" className="flex-1 bg-soviet-red text-black font-bold p-2 uppercase text-xs">Salvar Alterações</button>
                  <button type="button" onClick={() => setConfigDir(null)} className="px-4 border-2 border-border-gray text-white font-bold p-2 uppercase text-xs hover:bg-border-gray">Cancelar</button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Directory Password Overlay */}
      <AnimatePresence>
        {activeLockedDir && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          >
            <div className="max-w-sm w-full border-4 border-phosphor p-6 bg-terminal-bg shadow-[8px_8px_0px_#00ff41]">
              <div className="flex items-center gap-4 mb-6">
                <Key className="text-phosphor" />
                <h3 className="text-xl font-bold uppercase tracking-tighter">Handshake de Segurança</h3>
              </div>
              <p className="text-[10px] uppercase opacity-60 mb-4 tracking-widest">O Diretório <span className="text-phosphor">/{activeLockedDir}</span> requer validação adicional.</p>
              
              <form onSubmit={verifyDirPassword} className="space-y-4">
                <input 
                  type="password" 
                  autoFocus
                  required
                  placeholder="CHAVE DE CRIPTOGRAFIA..."
                  value={dirPassword}
                  onChange={(e) => { playClick(); setDirPassword(e.target.value); }}
                  className="w-full bg-black border-2 border-phosphor p-3 text-phosphor outline-none uppercase text-center"
                />
                {dirAuthError && <p className="text-red-500 text-[10px] font-bold uppercase">Senha do Diretório Incorreta</p>}
                <div className="flex gap-2">
                  <button type="submit" className="flex-1 bg-phosphor text-black font-bold p-2 uppercase text-xs">Autorizar</button>
                  <button type="button" onClick={() => setActiveLockedDir(null)} className="px-4 border-2 border-phosphor text-phosphor font-bold p-2 uppercase text-xs hover:bg-phosphor hover:text-black">Abortar</button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="h-20 md:h-24 bg-panel-bg border-b-4 border-border-gray flex items-center justify-between px-4 md:px-8 z-10 shrink-0">
        <div className="flex flex-col">
          <h1 className="soviet-header text-2xl md:text-4xl text-soviet-red glow-text shadow-soviet-red leading-none">PRIYNKA</h1>
          <p className="text-[7px] md:text-[10px] text-phosphor font-bold opacity-90 mt-1">СИНТЕЗ И УРОБОРОС И ОРДО БАО ЧАО</p>
          <p className="hidden xs:block text-[6px] md:text-[8px] tracking-widest opacity-60 uppercase mt-0.5">Central de Diretórios Científicos V5.00</p>
        </div>
        <div className="flex items-center gap-4 md:gap-12 text-right">
          <div className="hidden sm:flex flex-col">
            <span className="text-[8px] md:text-[10px] opacity-60 uppercase">Tempo de Sistema</span>
            <span className="text-sm md:text-xl glow-text">{time}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[8px] md:text-[10px] opacity-60 uppercase">Terminal ID</span>
            <span className="text-sm md:text-xl glow-text">PRI-0{filteredDirs.length}</span>
          </div>
        </div>
      </header>


      {/* Body */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden z-10 bg-terminal-bg relative">
        {/* TACTICAL TAB NAV */}
        <div className="h-14 md:h-full w-full md:w-16 border-b-2 md:border-b-0 md:border-r-4 border-border-gray bg-[#0a0a0a] flex flex-row md:flex-col items-center justify-center md:justify-start py-0 md:py-8 gap-6 md:gap-10 shrink-0 z-20">
           <button 
             onClick={() => { playClick(); setActiveTab('OPERATIONS'); }}
             className={`p-2 md:p-3 transition-all ${activeTab === 'OPERATIONS' ? 'bg-phosphor text-black shadow-[0_0_15px_#00ff41]' : 'text-phosphor/30 hover:text-phosphor'}`}
             title="SISTEMAS OPERACIONAIS"
           >
             <LayoutGrid size={window.innerWidth < 768 ? 20 : 24} />
           </button>
           <button 
             onClick={() => { playClick(); setActiveTab('INTELLIGENCE'); }}
             className={`p-2 md:p-3 transition-all ${activeTab === 'INTELLIGENCE' ? 'bg-soviet-red text-black shadow-[0_0_15px_#c82323]' : 'text-phosphor/30 hover:text-soviet-red'}`}
             title="NÚCLEO DE INTELIGÊNCIA"
           >
             <Cpu size={window.innerWidth < 768 ? 20 : 24} />
           </button>
        </div>

        {activeTab === 'OPERATIONS' ? (
          <>
            {/* Sidebar */}
            <aside className="hidden lg:flex w-64 border-r-4 border-border-gray bg-[#121212] p-6 flex-col gap-8 shrink-0 overflow-y-auto">
          <div className="flex flex-col gap-2">
            <h3 className="text-[10px] font-bold border-b border-border-gray pb-1 uppercase opacity-60">Status do Sistema</h3>
            <div className="flex items-center text-sm"><span className="status-light"></span> CONECTADO</div>
            <div className="flex items-center text-sm"><span className="status-light"></span> ENERGIA: NOMINAL</div>
            <div className="flex items-center text-sm">
              <span className="status-light"></span> NÚCLEO: {systemMetrics ? `${(typeof systemMetrics.cpu === 'object' ? systemMetrics.cpu.load : systemMetrics.cpu).toFixed(1)}%` : '--'}
            </div>
            <div className="flex items-center text-sm">
              <span className="status-light"></span> MEMÓRIA: {systemMetrics ? `${(typeof systemMetrics.memory === 'object' ? systemMetrics.memory.percent : systemMetrics.memory).toFixed(1)}%` : '--'}
            </div>
            <div className="flex items-center text-sm">
              <span className={`status-light ${dbStatus?.connected ? 'bg-phosphor animate-pulse' : 'bg-red-600 shadow-[0_0_8px_#ff0000]'}`}></span> BANCO: {dbStatus ? (dbStatus.connected ? 'CONECTADO' : 'OFFLINE') : '--'}
            </div>
            <div className="flex items-center text-sm">
              <span className="status-light"></span> UPTIME: {systemMetrics ? `${Math.floor(systemMetrics.uptime / 3600)}H` : '--'}
            </div>
          </div>

          <div className="flex flex-col gap-3 p-3 bg-black/60 border border-phosphor/40 shadow-[4px_4px_0px_rgba(0,255,65,0.1)]">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold uppercase text-phosphor">Sistema Operacional</h3>
              <button 
                onClick={() => { playClick(); setShowProcessManager(!showProcessManager); }}
                className={`text-[9px] px-2 py-1 border transition-all ${showProcessManager ? 'bg-phosphor text-black border-phosphor' : 'border-phosphor/40 text-phosphor hover:bg-phosphor/10'}`}
              >
                {showProcessManager ? 'FECHAR GESTOR' : 'GESTOR PROC'}
              </button>
            </div>
            {systemMetrics && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-[8px] uppercase">
                    <span>CPU LOAD</span>
                    <span>{systemMetrics.cpu.load.toFixed(2)}</span>
                  </div>
                  <div className="h-1 bg-border-gray w-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-phosphor"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(systemMetrics.cpu.load * 50, 100)}%` }}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[8px] uppercase">
                    <span>RAM ({ (systemMetrics.memory.used / (1024**3)).toFixed(1) }G / { (systemMetrics.memory.total / (1024**3)).toFixed(1) }G)</span>
                    <span>{systemMetrics.memory.percent.toFixed(0)}%</span>
                  </div>
                  <div className="h-1 bg-border-gray w-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-phosphor"
                      initial={{ width: 0 }}
                      animate={{ width: `${systemMetrics.memory.percent}%` }}
                    />
                  </div>
                </div>
                {systemMetrics.disk.total > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[8px] uppercase">
                      <span>DISK ({ (systemMetrics.disk.used / (1024**3)).toFixed(1) }G / { (systemMetrics.disk.total / (1024**3)).toFixed(1) }G)</span>
                      <span>{systemMetrics.disk.percent.toFixed(0)}%</span>
                    </div>
                    <div className="h-1 bg-border-gray w-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-phosphor"
                        initial={{ width: 0 }}
                        animate={{ width: `${systemMetrics.disk.percent}%` }}
                      />
                    </div>
                  </div>
                )}
                <div className="border-t border-phosphor/20 pt-1 flex flex-col gap-1 text-[7px] opacity-60 uppercase font-mono">
                  <div>PLATFORM: {systemMetrics.platform} / {systemMetrics.arch}</div>
                  <div>UPTIME: {Math.floor(systemMetrics.uptime / 3600)}H {Math.floor((systemMetrics.uptime % 3600) / 60)}M</div>
                  <div>ATIVOS: {activeProcesses.length} SERVERS</div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 p-3 bg-black/60 border border-phosphor/40">
            <h3 className="text-[10px] font-bold uppercase text-phosphor">Gráfico de Disco (Histórico)</h3>
            <div className="h-24 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metricsHistory}>
                  <defs>
                    <linearGradient id="colorDisk" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00ff41" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#00ff41" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#000', border: '1px solid #00ff41', fontSize: '8px' }}
                    itemStyle={{ color: '#00ff41' }}
                    labelStyle={{ display: 'none' }}
                  />
                  <Area type="monotone" dataKey="disk" stroke="#00ff41" fillOpacity={1} fill="url(#colorDisk)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="text-[8px] opacity-40 uppercase text-center tracking-tighter">Telemetria de Armazenamento</div>
          </div>
          
          <div className="flex flex-col gap-2">
            <h3 className="text-[10px] font-bold border-b border-border-gray pb-1 uppercase opacity-60">Autenticação</h3>
            <div className="text-sm opacity-80 italic">COD. PRIYNKA, N.</div>
            <div className="text-[10px] text-soviet-red font-bold uppercase">Acesso: Root/Admin</div>
          </div>

          <div className="flex flex-col gap-3 p-3 bg-black/60 border border-phosphor/20">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold uppercase text-phosphor">Backup via Rclone</h3>
              <div className={`w-2 h-2 rounded-full ${isRcloneInstalled ? 'bg-phosphor shadow-[0_0_8px_#00ff41]' : 'bg-red-900 animate-pulse'}`} />
            </div>
            
            <div className="space-y-2">
              <div className="text-[8px] text-phosphor uppercase opacity-60 font-mono mb-1">
                {isRcloneInstalled ? 'Sincronizador Detectado' : 'Aguardando Rclone...'}
              </div>
              
              <input 
                type="text"
                placeholder="NOME DO REMOTE..."
                value={rcloneRemote}
                onChange={(e) => setRcloneRemote(e.target.value)}
                className="w-full bg-black border border-phosphor/30 p-1 text-[9px] text-phosphor outline-none uppercase"
              />

              <button 
                onClick={handleRcloneBackup}
                disabled={isBackingUp || !isRcloneInstalled}
                className="w-full bg-phosphor text-black py-2 text-[10px] font-bold uppercase hover:bg-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isBackingUp ? <RefreshCw size={14} className="animate-spin" /> : <Cloud size={14} />}
                {isBackingUp ? 'Sincronizando...' : 'Sync Total p/ Cloud'}
              </button>
              
              {isBackingUp && (
                <button 
                  onClick={() => setShowRcloneLogs(true)}
                  className="w-full border border-phosphor/40 text-phosphor py-1 text-[8px] font-bold uppercase hover:bg-phosphor/10"
                >
                  Ver Logs em Tempo Real
                </button>
              )}
            </div>
            {rcloneStatus?.progress && (
              <div className="text-[7px] text-phosphor animate-pulse uppercase text-center mt-1 truncate">
                {rcloneStatus.progress}
              </div>
            )}
            {rcloneStatus?.lastRun && !isBackingUp && (
               <div className="text-[7px] text-phosphor/40 uppercase text-center mt-1">
                 Último: {new Date(rcloneStatus.lastRun).toLocaleString()}
               </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-[10px] font-bold border-b border-border-gray pb-1 uppercase opacity-60">Modo de Visualização</h3>
            <div 
              className="flex items-center gap-3 text-xs p-2 bg-phosphor text-black"
            >
              <LayoutGrid size={14} /> GRELHA (GRID)
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0 bg-black/40 border border-border-gray/30 p-2 overflow-hidden">
            <h3 className="text-[8px] font-bold uppercase opacity-40 mb-1">Live Telemetry</h3>
            <div ref={logRef} className="flex-1 overflow-y-auto text-[8px] font-mono space-y-1 scrollbar-none">
              {logs.map((log, i) => <div key={i} className="opacity-70">{log}</div>)}
              <div className="animate-pulse">_</div>
            </div>
          </div>

          <div className="mt-auto border-4 border-soviet-red p-3 text-center bg-soviet-red text-black font-bold text-sm tracking-tighter uppercase leading-tight">
            Propriedade do Estado<br />Diretório Blindado
          </div>
        </aside>

        {/* Content */}
        <section className="flex-1 p-4 md:p-10 flex flex-col overflow-hidden">
          {selectedDir ? (
            // FILE EXPLORER VIEW
            <div className="flex flex-col h-full">
              {/* Search Interface */}
              <div className="mb-6">
                <form onSubmit={handleSearch} className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-phosphor/40" size={16} />
                    <input 
                      type="text" 
                      placeholder="PESQUISAR NOMES OU CONTEÚDOS EM TODO O SISTEMA..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-black/40 border border-phosphor/20 pl-10 pr-4 py-2 text-xs text-phosphor focus:border-phosphor outline-none transition-all uppercase placeholder:opacity-20"
                    />
                  </div>
                  <button 
                    type="submit"
                    disabled={isSearching}
                    className="bg-phosphor text-black px-4 sm:px-6 py-2 text-xs font-bold hover:bg-white transition-all disabled:opacity-50 flex items-center justify-center min-w-[40px]"
                  >
                    <span className="hidden sm:inline">{isSearching ? 'SCANNING...' : 'EXECUTAR BUSCA'}</span>
                    <div className="sm:hidden">
                      {isSearching ? <RefreshCw className="animate-spin" size={14} /> : <Search size={14} />}
                    </div>
                  </button>
                  {searchResults.length > 0 && (
                    <button 
                      type="button"
                      onClick={() => { setSearchQuery(""); setSearchResults([]); }}
                      className="text-soviet-red border border-soviet-red px-3 py-2 text-xs hover:bg-soviet-red hover:text-black transition-all"
                    >
                      LIMPAR
                    </button>
                  )}
                </form>

                {searchResults.length > 0 && (
                  <div className="mt-4 p-4 border border-phosphor/40 bg-black/60 max-h-60 overflow-y-auto custom-scrollbar">
                    <h4 className="text-[10px] font-bold text-phosphor mb-3 uppercase">Resultados ({searchResults.length})</h4>
                    <div className="grid gap-2">
                      {searchResults.map((res, i) => (
                        <div 
                          key={i}
                          onClick={() => {
                            const parts = res.path.split('/');
                            const dir = parts[0];
                            const sub = parts.slice(1, -1).join('/');
                            openFileExplorer(dir, sub || null);
                            setSearchResults([]);
                            setSearchQuery("");
                          }}
                          className="flex items-center justify-between p-2 border border-border-gray hover:border-phosphor cursor-pointer group"
                        >
                          <div className="flex items-center gap-3">
                            {res.isDir ? <Folder size={14} className="text-phosphor" /> : <FileText size={14} className="text-phosphor/40" />}
                            <div className="flex flex-col">
                              <span className="text-xs font-bold uppercase">{res.name}</span>
                              <span className="text-[9px] opacity-40 uppercase">{res.path}</span>
                            </div>
                          </div>
                          <span className="text-[8px] bg-phosphor/10 px-2 py-0.5 text-phosphor uppercase">{res.matchType === 'content' ? 'Conteúdo' : 'Nome'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Process Manager Overlay */}
              {showProcessManager && (
                <div className="mb-6 p-4 border-2 border-phosphor bg-black/80 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-phosphor animate-pulse" />
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-6">
                      <h2 className="text-xl font-bold glow-text flex items-center gap-3">
                        <Terminal size={20} /> GESTOR DE PROCESSOS
                      </h2>
                      <div className="flex border border-phosphor/20 bg-black/40">
                        <button 
                          onClick={() => setShowSystemProcesses(false)}
                          className={`px-4 py-1 text-[10px] font-bold uppercase transition-all ${!showSystemProcesses ? 'bg-phosphor text-black' : 'hover:bg-phosphor/10'}`}
                        >
                          Meus Comandos
                        </button>
                        <button 
                          onClick={() => setShowSystemProcesses(true)}
                          className={`px-4 py-1 text-[10px] font-bold uppercase transition-all ${showSystemProcesses ? 'bg-phosphor text-black' : 'hover:bg-phosphor/10'}`}
                        >
                          Sistema (VM Total)
                        </button>
                      </div>
                    </div>
                    <div className="text-[10px] opacity-40 uppercase">VM: {window.location.hostname}</div>
                  </div>
                  
                  {!showSystemProcesses ? (
                    activeProcesses.length === 0 ? (
                      <div className="py-8 text-center border border-dashed border-phosphor/20 text-xs opacity-40 uppercase">Nenhum comando em execução.</div>
                    ) : (
                      <div className="grid gap-3">
                        {activeProcesses.map(proc => (
                          <div key={proc.id} className="p-3 border border-phosphor/40 flex flex-col gap-3 group hover:bg-phosphor/5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 border border-phosphor flex items-center justify-center text-phosphor bg-phosphor/10">
                                  <span className="text-[10px] font-bold">PID {proc.pid}</span>
                                </div>
                                <div className="flex flex-col">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-phosphor uppercase">{proc.command}</span>
                                    {proc.alerts && proc.alerts.length > 0 && (
                                      <div className="flex items-center gap-1 animate-pulse bg-soviet-red text-black px-1 text-[8px] font-bold uppercase">
                                        <ShieldAlert size={10} /> ALERTA CRÍTICO
                                      </div>
                                    )}
                                  </div>
                                  <span className="text-[9px] opacity-40 uppercase truncate max-w-[400px]">PATH: {proc.cwd}</span>
                                </div>
                              </div>
                              <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 ml-auto">
                                <div className="text-left sm:text-right">
                                  <div className="text-[8px] sm:text-[10px] uppercase opacity-60">Recursos</div>
                                  <div className="text-[8px] sm:text-[9px] font-mono whitespace-nowrap text-phosphor">
                                    C: {proc.cpu.toFixed(1)}% | M: {(proc.memory / (1024 * 1024)).toFixed(1)}MB
                                  </div>
                                </div>
                                <div className="flex sm:flex-col gap-1 items-stretch">
                                  <button 
                                    onClick={() => { playClick(); setSelectedProcessLogs(proc.id); }}
                                    className="px-2 sm:px-3 py-1 border border-phosphor text-[8px] sm:text-[9px] font-bold uppercase hover:bg-phosphor hover:text-black transition-all flex items-center justify-center gap-2 flex-1"
                                  >
                                    <FileText size={10} /> <span className="hidden xs:inline">Logs</span>
                                  </button>
                                  <button 
                                    onClick={() => handleStopProcess(proc.id)}
                                    className="px-2 sm:px-3 py-1 bg-soviet-red text-black text-[8px] sm:text-[9px] font-bold uppercase hover:bg-white transition-all flex items-center justify-center gap-2 flex-1"
                                  >
                                    <Square size={10} /> <span className="hidden xs:inline">STOP</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                            
                            {proc.alerts && proc.alerts.length > 0 && (
                              <div className="border-t border-soviet-red/30 pt-2 space-y-1">
                                {proc.alerts.map((alert: string, idx: number) => (
                                  <div key={idx} className="text-[8px] text-soviet-red font-mono uppercase">{alert}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="grid gap-2 text-[10px] uppercase">
                      <div className="grid grid-cols-[1fr,60px,100px,60px] gap-4 border-b border-phosphor/20 pb-2 px-2 font-bold text-phosphor opacity-60">
                        <span>Processo (VM)</span>
                        <span>PID</span>
                        <span>Consumo (CPU/RAM)</span>
                        <span>User</span>
                      </div>
                      <div className="max-h-[300px] overflow-y-auto custom-scrollbar space-y-1">
                        {systemProcesses.map((p, idx) => (
                          <div key={idx} className="grid grid-cols-[1fr,60px,100px,60px] gap-4 px-2 py-1 border border-phosphor/5 hover:bg-phosphor/10 transition-colors">
                            <span className="truncate font-mono">{p.name}</span>
                            <span className="opacity-40">{p.pid}</span>
                            <div className="flex gap-2 font-mono">
                              <span className={p.cpu > 50 ? 'text-soviet-red' : 'text-phosphor'}>{p.cpu.toFixed(1)}%</span>
                              <span className="opacity-40">/</span>
                              <span>{(p.memory / (1024 * 1024)).toFixed(0)}MB</span>
                            </div>
                            <span className="opacity-40 truncate">{p.user}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      if (currentSubPath) {
                        const parts = currentSubPath.split('/');
                        parts.pop();
                        const newPath = parts.length > 0 ? parts.join('/') : null;
                        openFileExplorer(selectedDir!, newPath);
                      } else {
                        setSelectedDir(null);
                      }
                    }}
                    className="flex items-center gap-2 text-[10px] sm:text-xs border border-phosphor px-3 py-1 hover:bg-phosphor hover:text-black transition-all font-bold shrink-0"
                  >
                    <ChevronLeft size={14} /> {currentSubPath ? 'VOLTAR' : 'ROOT'}
                  </button>
                  <div className="h-4 w-[2px] bg-border-gray mx-1" />
                  <h2 className="text-lg sm:text-2xl font-bold tracking-tighter glow-text uppercase truncate">
                    SETOR: {selectedDir}
                  </h2>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-none scroll-smooth">
                  <button 
                    onClick={handleCreateFile}
                    className="flex items-center gap-2 text-[8px] sm:text-[10px] border border-phosphor px-3 py-1 hover:bg-phosphor hover:text-black transition-all font-bold uppercase whitespace-nowrap shrink-0"
                  >
                    <Plus size={12} /> Registro
                  </button>
                  <button 
                    onClick={handleCreateFolder}
                    className="flex items-center gap-2 text-[8px] sm:text-[10px] border border-phosphor px-3 py-1 hover:bg-phosphor hover:text-black transition-all font-bold uppercase whitespace-nowrap shrink-0"
                  >
                    <FolderPlus size={12} /> Pasta
                  </button>
                  <button 
                    onClick={() => {
                      playClick();
                      const url = `${window.location.origin}/site/${selectedDir}`;
                      navigator.clipboard.writeText(url);
                      alert('LINK DO SITE COPIADO!');
                    }}
                    className="flex items-center gap-2 text-[8px] sm:text-[10px] border border-white px-3 py-1 hover:bg-white hover:text-black transition-all font-bold uppercase whitespace-nowrap shrink-0"
                  >
                    Link
                  </button>
                  <button 
                    onClick={handleDownloadZip}
                    className="flex items-center gap-2 text-[8px] sm:text-[10px] border border-phosphor px-3 py-1 hover:bg-phosphor hover:text-black transition-all font-bold uppercase whitespace-nowrap shrink-0"
                    title="ZIP"
                  >
                    <Download size={12} /> ZIP
                  </button>

                  <div className="flex items-center gap-2 ml-auto">
                    <label className="flex items-center gap-2 text-[8px] sm:text-[10px] border border-phosphor px-3 py-1 hover:bg-phosphor hover:text-black transition-all font-bold uppercase cursor-pointer whitespace-nowrap shrink-0">
                      <Upload size={12} /> UPLOAD
                      <input 
                        type="file" 
                        multiple 
                        className="hidden" 
                        onChange={(e) => handleFileUpload(e)}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {filesLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                  <Binary className="text-phosphor animate-bounce" size={48} />
                  <p className="animate-pulse text-xs">DESCRIPTOGRAFANDO CAMADAS DE ARQUIVO...</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto border-4 border-border-gray bg-black/30 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 content-start p-6 gap-4">
                  <AnimatePresence>
                    {files.length > 0 ? (
                      files.map((file, i) => (
                        <motion.div 
                          key={file.name}
                          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                          onDoubleClick={() => {
                            if (file.isDir) {
                              const newPath = currentSubPath ? `${currentSubPath}/${file.name}` : file.name;
                              openFileExplorer(selectedDir!, newPath);
                            } else {
                              handleEditFile(file);
                            }
                          }}
                          className={`border-2 border-border-gray p-4 flex flex-col gap-4 group hover:border-phosphor transition-colors cursor-pointer ${file.isDir ? 'bg-phosphor/5' : ''}`}
                        >
                          <div className="flex items-center gap-4 flex-1 min-w-0">
                            {file.isDir ? (
                              <Folder className="text-phosphor shrink-0" />
                            ) : (
                              <FileText className="text-phosphor/40 group-hover:text-phosphor shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <span className="block text-sm font-bold uppercase truncate">{file.name}</span>
                              <span className="block text-[10px] opacity-40 uppercase">
                                {file.isDir ? 'DIRETÓRIO' : `${(file.size / 1024).toFixed(2)} KB`}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex gap-2 pt-2 border-t border-border-gray/30 opacity-0 group-hover:opacity-100 transition-opacity">
                            {file.isDir ? (
                              <button 
                                onClick={() => {
                                  const newPath = currentSubPath ? `${currentSubPath}/${file.name}` : file.name;
                                  openFileExplorer(selectedDir!, newPath);
                                }}
                                className="flex-1 text-[10px] font-bold text-black bg-phosphor py-1 hover:bg-white uppercase"
                              >
                                Abrir
                              </button>
                            ) : (
                              <>
                                <button 
                                  onClick={() => { 
                                    playClick(); 
                                    const path = currentSubPath ? `${selectedDir}/${currentSubPath}/${file.name}` : `${selectedDir}/${file.name}`;
                                    window.open(`/site/${path}`, '_blank'); 
                                  }}
                                  className="flex-1 text-[10px] font-bold text-black bg-phosphor py-1 hover:bg-white uppercase"
                                >
                                  Visualizar
                                </button>
                                <button 
                                  onClick={() => { 
                                    playClick(); 
                                    const path = currentSubPath ? `${selectedDir}/${currentSubPath}/${file.name}` : `${selectedDir}/${file.name}`;
                                    const url = `${window.location.origin}/site/${path}`;
                                    navigator.clipboard.writeText(url);
                                    alert('LINK DO ARQUIVO COPIADO!');
                                  }}
                                  className="flex-1 text-[10px] font-bold text-phosphor border border-phosphor py-1 hover:bg-phosphor hover:text-black uppercase"
                                >
                                  Link
                                </button>
                                <button 
                                  onClick={() => handleEditFile(file)}
                                  className="flex-1 text-[10px] font-bold text-phosphor border border-phosphor py-1 hover:bg-phosphor hover:text-black uppercase"
                                >
                                  Editar
                                </button>
                                {(file.name.endsWith('.js') || file.name.endsWith('.py') || file.name.endsWith('.ts') || file.name.endsWith('.sh')) && (
                                  <button 
                                    onClick={() => handleRunScript(file)}
                                    className="flex-1 text-[10px] font-bold bg-white text-black py-1 hover:bg-phosphor transition-colors uppercase flex items-center justify-center gap-1"
                                    title="Rodar no Servidor"
                                  >
                                    <Play size={10} /> Rodar
                                  </button>
                                )}
                              </>
                            )}
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                if (file.isDir) {
                                  // Add folder rename if needed, for now just use handleRenameFile but it expects file
                                  handleRenameFile(file.name);
                                } else {
                                  handleRenameFile(file.name);
                                }
                              }}
                              className="text-phosphor border border-phosphor p-1 hover:bg-phosphor hover:text-black uppercase"
                              title="Renomear"
                            >
                              <Binary size={12} />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteFile(file);
                              }}
                              className="text-soviet-red border border-soviet-red p-1 hover:bg-soviet-red hover:text-black uppercase"
                              title="Deletar"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </motion.div>
                      ))
                    ) : (
                      <div className="col-span-full py-20 text-center opacity-20">SETOR VAZIO. NENHUM DADO ENCONTRADO.</div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          ) : (
            // DIRECTORY LIST VIEW
            <>
              {/* Advanced Search Bar */}
              <div className="mb-8 p-4 bg-[#1a1a1a] border-2 border-border-gray flex items-center gap-4 group focus-within:border-phosphor transition-colors">
                <span className="text-phosphor font-bold animate-pulse">{'>'}_SEARCH:</span>
                <input 
                  type="text" 
                  placeholder="DIGITE O PADRÃO DE BUSCA..." 
                  value={searchQuery}
                  onChange={(e) => { playClick(); setSearchQuery(e.target.value); }}
                  className="bg-transparent border-none outline-none text-phosphor w-full font-mono placeholder:opacity-30 uppercase tracking-widest text-lg"
                  autoFocus
                />
                {searchQuery && (
                  <span className="text-[10px] opacity-40 uppercase whitespace-nowrap">
                    Filtros: {filteredDirs.length} Correspondências
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between mb-4 border-b border-border-gray pb-2">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl font-bold tracking-tighter glow-text uppercase">/ROOT_DIRECTORIES/LIST</h2>
                  <button 
                    onClick={handleCreateDir}
                    className="flex items-center gap-2 text-[10px] border border-phosphor px-3 py-1 hover:bg-phosphor hover:text-black transition-all font-bold uppercase"
                  >
                    <Plus size={12} /> Criar Pasta/Domínio
                  </button>
                </div>
                <div className="flex gap-4 text-[10px]">
                  <span className="opacity-60 cursor-pointer hover:text-phosphor" onClick={() => {
                    playClick();
                    const url = `${window.location.origin}/site/${selectedDir || ''}`;
                    navigator.clipboard.writeText(url);
                    alert('LINK DO DIRETÓRIO COPIADO!');
                  }}>DOME-URL: {selectedDir ? `/${selectedDir}` : 'ROOT'}</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar h-full">
                {loading ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4">
                    <div className="w-12 h-12 border-4 border-phosphor border-t-transparent rounded-full animate-spin"></div>
                    <p className="animate-pulse uppercase tracking-widest text-xs">Escaneando Setores...</p>
                  </div>
                ) : error ? (
                  <div className="border-4 border-soviet-red p-8 text-center bg-soviet-red/10">
                    <p className="text-soviet-red text-xl font-bold uppercase flicker">{error}</p>
                  </div>
                ) : viewMode === 'graph' ? (
                  <GraphView dirs={filteredDirs} onNodeClick={handleDirAccess} />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 auto-rows-min">
                    <AnimatePresence>
                      {filteredDirs.map((dir, index) => (
                        <motion.div
                          key={dir.name}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: index * 0.02 }}
                          className="directory-btn group relative"
                        >
                          {/* Control Icons Overlay */}
                          <div className="absolute top-2 right-2 flex gap-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={(e) => { e.stopPropagation(); toggleStarDir(dir.name); }}
                              title={starredDirs.includes(dir.name) ? "Remover dos Favoritos" : "Adicionar aos Favoritos"}
                              className={`p-1.5 bg-black border transition-colors ${starredDirs.includes(dir.name) ? 'border-yellow-500 text-yellow-500 hover:bg-yellow-500 hover:text-black' : 'border-white text-white hover:bg-white hover:text-black'}`}
                            >
                              <Star size={12} className={starredDirs.includes(dir.name) ? "fill-current" : "" } />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); copyLink(dir.name, 'site'); }}
                              title="Copiar Link do Site"
                              className="p-1.5 bg-black border border-white text-white hover:bg-white hover:text-black transition-colors"
                            >
                              {copiedId === `${dir.name}-site` ? <Check size={12} /> : <ExternalLink size={12} />}
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); copyLink(dir.name, 'explorer'); }}
                              title="Copiar Link de Acesso"
                              className="p-1.5 bg-black border border-phosphor text-phosphor hover:bg-phosphor hover:text-black transition-colors"
                            >
                              {copiedId === `${dir.name}-explorer` ? <Check size={12} /> : <Link size={12} />}
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setConfigDir(dir.name); }}
                              title="Configurar"
                              className="p-1.5 bg-black border border-soviet-red text-soviet-red hover:bg-soviet-red hover:text-black transition-colors"
                            >
                              <Settings size={12} />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleDeleteDir(dir.name); }}
                              title="Deletar Pasta"
                              className="p-1.5 bg-black border border-soviet-red text-soviet-red hover:bg-soviet-red hover:text-black transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>

                          <div 
                            className="flex flex-col h-full w-full"
                            onClick={() => handleDirAccess(dir)}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] opacity-60 uppercase font-bold group-hover:text-black tracking-tighter">
                                  {dir.isLocked ? 'STATUS: PROTEGIDO' : `SETOR_${(index + 1).toString().padStart(2, '0')}`}
                                </span>
                                {starredDirs.includes(dir.name) && (
                                  <Star size={10} className="fill-yellow-500 text-yellow-500 group-hover:text-black" />
                                )}
                              </div>
                              {dir.isLocked ? (
                                <Lock size={14} className="text-soviet-red group-hover:text-black" />
                              ) : (
                                <Terminal size={14} className="opacity-20 group-hover:opacity-100 group-hover:text-black" />
                              )}
                            </div>
                            <span className="text-lg font-bold truncate w-full uppercase leading-none group-hover:text-black">{dir.name}</span>
                            <div className="flex items-center gap-2 mt-3 opacity-40 group-hover:opacity-100 group-hover:text-black text-[9px] font-mono">
                              <Activity size={10} />
                              <span>UUID: {(index + 1000).toString(16).toUpperCase()}</span>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                      
                      {filteredDirs.length === 0 && (
                        <div className="col-span-full py-20 text-center border-4 border-dashed border-border-gray opacity-30">
                          <p className="text-2xl font-bold uppercase tracking-[0.3em]">Nenhum Registro Encontrado</p>
                          <p className="text-xs mt-2 uppercase">Refine os critérios de busca no terminal lateral</p>
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </>
    ) : (
      <IntelligenceModule data={brainData} onUpdate={fetchBrainData} playClick={playClick} />
    )}
      </main>

      {/* Footer */}
      <footer className="h-10 md:h-12 bg-soviet-red text-black px-4 md:px-8 flex items-center justify-between font-bold text-[10px] md:text-sm z-10 shrink-0">
        <div className="flex gap-4 md:gap-6 overflow-hidden">
          <span className="whitespace-nowrap">PRI-OS v5.0</span>
          <span className="hidden sm:inline">F2: SCAN</span>
          <span className="hidden sm:inline">F5: SYNC</span>
          <span className="hidden sm:inline">F10: LOGOUT</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden xs:inline text-[10px] opacity-60">KERNEL: STABLE</span>
          <span className="whitespace-nowrap">READY {'>>'}</span>
          <span className="animate-pulse">_</span>
        </div>
      </footer>

      {/* LOG MODAL */}
      <AnimatePresence>
        {selectedProcessLogs && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-10 backdrop-blur-sm"
          >
            <div className="w-full max-w-4xl h-[70vh] border-2 border-phosphor bg-black flex flex-col overflow-hidden relative shadow-[0_0_50px_rgba(0,255,65,0.3)]">
              <div className="bg-phosphor text-black px-4 py-2 flex items-center justify-between font-bold uppercase tracking-widest">
                <div className="flex items-center gap-2"><Terminal size={16} /> MONITOR DE LOGS EM TEMPO REAL</div>
                <button onClick={() => setSelectedProcessLogs(null)} className="hover:bg-black hover:text-phosphor px-2 py-1 transition-all"><X size={20} /></button>
              </div>
              <div className="flex-1 p-4 overflow-y-auto font-mono text-xs whitespace-pre-wrap bg-[#050505] text-phosphor/80">
                {processLogsList.map((log, i) => <div key={i} className="mb-0.5 border-l border-phosphor/10 pl-2">{log}</div>)}
                <div className="animate-pulse">_</div>
              </div>
              <div className="p-3 border-t border-phosphor/20 text-[9px] uppercase opacity-40 text-center">
                CONEXÃO ESTÁVEL - ATUALIZAÇÃO AUTOMÁTICA (2s)
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CREATE SERVER MODAL */}
      <AnimatePresence>
        {isCreatingServer && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-10 backdrop-blur-md"
          >
            <div className="w-full max-w-md border-2 border-phosphor bg-black p-6 flex flex-col gap-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-phosphor animate-pulse" />
              <div className="flex items-center justify-between">
                 <h2 className="text-xl font-bold uppercase tracking-tighter glow-text flex items-center gap-3">
                   <FolderPlus size={24} /> ALOCAR NOVO SERVIDOR
                 </h2>
                 <button onClick={() => setIsCreatingServer(false)} className="text-phosphor hover:text-soviet-red"><X size={24} /></button>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-phosphor">Setor de Destino</label>
                  <select 
                    value={newServerData.sector}
                    onChange={(e) => setNewServerData({ ...newServerData, sector: e.target.value })}
                    className="w-full bg-black border border-phosphor/40 p-2 text-sm text-phosphor outline-none appearance-none cursor-pointer hover:border-phosphor transition-all uppercase"
                  >
                    <option value="setor_alfa">ALFA (PRODUÇÃO)</option>
                    <option value="setor_beta">BETA (DESENVOLVIMENTO)</option>
                    <option value="setor_gama">GAMA (EXPERIMENTOS)</option>
                    <option value="setor_delta">DELTA (QUARENTENA)</option>
                  </select>
                </div>
                
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-phosphor">Identificador do Server</label>
                  <input 
                    type="text" 
                    placeholder="NOME_DO_SERVICO..."
                    value={newServerData.name}
                    onChange={(e) => setNewServerData({ ...newServerData, name: e.target.value })}
                    className="w-full bg-black border border-phosphor/40 p-2 text-sm text-phosphor outline-none hover:border-phosphor transition-all uppercase placeholder:opacity-20"
                  />
                </div>
              </div>

              <div className="p-3 border border-phosphor/20 bg-phosphor/5 text-[10px] opacity-60 uppercase italic leading-tight">
                Aviso: Isto criará um diretório blindado no setor escolhido para isolamento de processos e sub-pastas.
              </div>

              <button 
                onClick={handleCreateServer}
                className="w-full bg-phosphor text-black py-4 font-bold uppercase hover:bg-white transition-all transform active:scale-95"
              >
                CONFIRMAR ALOCAÇÃO
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* RCLONE LOGS MODAL */}
      <AnimatePresence>
        {showRcloneLogs && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/95 flex items-center justify-center p-10 backdrop-blur-sm"
          >
            <div className="w-full max-w-4xl h-[70vh] border-2 border-blue-500 bg-black flex flex-col overflow-hidden relative shadow-[0_0_50px_rgba(37,99,235,0.3)]">
              <div className="bg-blue-600 text-white px-4 py-2 flex items-center justify-between font-bold uppercase tracking-widest">
                <div className="flex items-center gap-2"><Cloud size={16} /> MONITOR DE SINCRONIZAÇÃO RCLONE</div>
                <button onClick={() => setShowRcloneLogs(false)} className="hover:bg-black hover:text-white px-2 py-1 transition-all"><X size={20} /></button>
              </div>
              <div className="flex-1 p-4 overflow-y-auto font-mono text-[10px] whitespace-pre-wrap bg-[#050505] text-blue-400/80">
                {rcloneStatus?.logs?.map((log: string, i: number) => <div key={i} className="mb-0.5 border-l border-blue-500/20 pl-2">{log}</div>)}
                {!rcloneStatus?.logs?.length && <div className="opacity-20 italic">AGUARDANDO STREAM DE DADOS...</div>}
                <div className="animate-pulse">_</div>
              </div>
              <div className="p-3 border-t border-blue-900/40 text-[9px] uppercase opacity-40 text-center bg-blue-900/10">
                PROCESSO ATIVO: {rcloneStatus?.progress || 'N/A'}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
