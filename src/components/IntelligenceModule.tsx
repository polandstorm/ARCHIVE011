import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as d3 from 'd3';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Plus, Trash2, Edit3, Save, X, ChevronRight, ChevronDown,
  RotateCcw, Database, Layers, FileText, Search, Maximize2, Minimize2,
  Star, Menu
} from 'lucide-react';

// --- Types & Interfaces ---
interface BrainNucleus { id: string; name: string; description?: string; icon: string; color: string; x?: number; y?: number; }
interface BrainOperation { id: string; nucleusId: string; name: string; description?: string; icon: string; color: string; position: number; x?: number; y?: number; }
interface BrainSector { id: string; operationId: string; name: string; description?: string; icon: string; floorType: string; position: number; x?: number; y?: number; }
interface BrainRegistry { id: string; sectorId: string; name: string; content: string; spriteType: string; positionX: number; positionY: number; position: number; x?: number; y?: number; }

interface BrainHierarchy {
  hotels: BrainNucleus[];
  apartments: BrainOperation[];
  rooms: BrainSector[];
  furniture: BrainRegistry[];
}

interface IntelligenceModuleProps {
  data: BrainHierarchy | null;
  onUpdate: () => void;
  playClick: () => void;
}

type ViewMode = 'MINDMAP' | 'EDITOR';
type SelectedItem = { type: 'nucleus' | 'operation' | 'sector' | 'registry'; id: string } | null;

// --- D3 Force Graph Components ---

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  type: 'nucleus' | 'operation' | 'sector' | 'registry' | 'root';
  icon?: string;
  color?: string;
  parentId?: string;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  id: string;
}

function ForceGraph({ 
  data, 
  selectedId, 
  onSelect,
  onRename,
  onNodeDragEnd,
  starredIds
}: { 
  data: BrainHierarchy; 
  selectedId: string | null; 
  onSelect: (item: SelectedItem) => void;
  onRename: (type: string, id: string, newName: string) => void;
  onNodeDragEnd: (type: string, id: string, x: number, y: number) => void;
  starredIds: Set<string>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);

  const nodes = useMemo(() => {
    const n: GraphNode[] = [{ id: 'ROOT', name: 'NÚCLEO CENTRAL', type: 'root', color: '#ff0000', fx: 0, fy: 0 }];
    
    data.hotels.forEach(h => {
      n.push({ id: h.id, name: h.name, type: 'nucleus', icon: h.icon, color: h.color, parentId: 'ROOT', fx: h.x, fy: h.y });
    });
    data.apartments.forEach(a => {
      n.push({ id: a.id, name: a.name, type: 'operation', icon: a.icon, color: a.color, parentId: a.hotelId, fx: a.x, fy: a.y });
    });
    data.rooms.forEach(r => {
      n.push({ id: r.id, name: r.name, type: 'sector', icon: r.icon, parentId: r.apartmentId, fx: r.x, fy: r.y });
    });
    data.furniture.forEach(f => {
      n.push({ id: f.id, name: f.name, type: 'registry', parentId: f.roomId, fx: f.x, fy: f.y });
    });
    
    return n;
  }, [data]);

  const links = useMemo(() => {
    const l: GraphLink[] = [];
    nodes.forEach(node => {
      if (node.parentId) {
        l.push({ 
          id: `${node.parentId}-${node.id}`,
          source: node.parentId, 
          target: node.id 
        });
      }
    });
    return l;
  }, [nodes]);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg.append('g');

    // Zoom setup
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => g.attr('transform', event.transform));

    svg.call(zoom);

    // Initial transform - centered and zoomed out more on mobile
    const initialScale = width < 768 ? 0.5 : 0.8;
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(initialScale));

    // Simulation
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .alphaDecay(0.08) // Cool down even faster
      .force('link', d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(d => {
        const targetType = (d.target as GraphNode).type;
        if (targetType === 'nucleus') return 180;
        if (targetType === 'operation') return 120;
        if (targetType === 'sector') return 80;
        return 40;
      }).strength(1)) // Maximum strength to reduce "fluidity"
      .force('charge', d3.forceManyBody().strength(-200))
      .force('x', d3.forceX(d => {
        // Vertical hierarchical alignment
        if (d.type === 'root') return 0;
        if (d.type === 'nucleus') return 0;
        if (d.type === 'operation') return 0;
        return 0;
      }).strength(0.1))
      .force('y', d3.forceY(d => {
        // Horizontal layer alignment
        if (d.type === 'root') return -200;
        if (d.type === 'nucleus') return -100;
        if (d.type === 'operation') return 0;
        if (d.type === 'sector') return 100;
        if (d.type === 'registry') return 200;
        return 0;
      }).strength(0.5))
      .force('collision', d3.forceCollide().radius(45));

    simulationRef.current = simulation;

    // Links
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#00ff41')
      .attr('stroke-opacity', 0.2)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '5,5');

    // Nodes
    const node = g.append('g')
      .selectAll('.node-group')
      .data(nodes)
      .join('g')
      .attr('class', 'node-group')
      .call(d3.drag<SVGGElement, GraphNode>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended))
      .on('click', (event, d) => {
        if (d.type === 'root') return;
        event.stopPropagation();
        onSelect({ type: d.type as any, id: d.id });
      })
      .on('dblclick', (event, d) => {
        if (d.type === 'root') return;
        event.stopPropagation();
        const newName = prompt('RENOMEAR PARA:', d.name);
        if (newName) onRename(d.type, d.id, newName);
      });

    // Shapes per type
    node.each(function(d) {
      const el = d3.select(this);
      const isSelected = d.id === selectedId;

      // Glow effect for selected
      if (isSelected) {
        el.append('circle')
          .attr('r', 35)
          .attr('fill', 'rgba(0, 255, 65, 0.05)')
          .attr('stroke', '#00ff41')
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '4 2')
          .attr('class', 'animate-pulse');
      }
      if (d.type === 'root') {
        // Hexagon for root
        el.append('path')
          .attr('d', "M0,-25 L21.6,-12.5 L21.6,12.5 L0,25 L-21.6,12.5 L-21.6,-12.5 Z")
          .attr('fill', '#ff0000')
          .attr('stroke', '#fff')
          .attr('stroke-width', 2);
      } else if (d.type === 'nucleus') {
        // Large Hexagon for Nucleo
        el.append('path')
          .attr('d', "M0,-20 L17.3,-10 L17.3,10 L0,20 L-17.3,10 L-17.3,-10 Z")
          .attr('fill', '#000')
          .attr('stroke', d.color || '#c82323')
          .attr('stroke-width', 2);
      } else if (d.type === 'operation') {
        // Square for Operacao
        el.append('rect')
          .attr('x', -15)
          .attr('y', -15)
          .attr('width', 30)
          .attr('height', 30)
          .attr('fill', '#000')
          .attr('stroke', '#00ff41')
          .attr('stroke-width', 1.5);
      } else if (d.type === 'sector') {
        // Circle for Sector
        el.append('circle')
          .attr('r', 12)
          .attr('fill', '#000')
          .attr('stroke', '#00aa30')
          .attr('stroke-width', 1.5);
      } else {
        // Diamond for Registry
        el.append('path')
          .attr('d', "M0,-10 L10,0 L0,10 L-10,0 Z")
          .attr('fill', '#00ff41')
          .attr('fill-opacity', 0.6);
      }

      // Icon/Text inside
      el.append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('font-size', '10px')
        .attr('fill', '#fff')
        .attr('pointer-events', 'none')
        .text(d.icon || (d.type === 'registry' ? '◈' : ''));

      // Star badge if starred
      if (starredIds.has(d.id)) {
        el.append('path')
          .attr('d', "M0,-3.5 L1,-1 L3.5,-0.7 L1.7,1 L2.2,3.5 L0,2.2 L-2.2,3.5 L-1.7,1 L-3.5,-0.7 L-1,-1 Z")
          .attr('transform', 'translate(12, -12)')
          .attr('fill', '#eab308')
          .attr('stroke', '#000')
          .attr('stroke-width', 0.5);
      }
    });

    // Labels
    node.append('text')
      .attr('dy', 28)
      .attr('text-anchor', 'middle')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', '8px')
      .attr('fill', d => d.id === selectedId ? '#00ff41' : '#888')
      .attr('letter-spacing', '0.1em')
      .attr('text-transform', 'uppercase')
      .attr('pointer-events', 'none')
      .text(d => d.name);

    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as GraphNode).x!)
        .attr('y1', d => (d.source as GraphNode).y!)
        .attr('x2', d => (d.target as GraphNode).x!)
        .attr('y2', d => (d.target as GraphNode).y!);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: any, d: GraphNode) {
      if (d.type === 'root') return;
      if (!event.active) simulation.alphaTarget(0.1).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: GraphNode) {
      if (d.type === 'root') return;
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: GraphNode) {
      if (d.type === 'root') return;
      if (!event.active) simulation.alphaTarget(0);
      d.fx = event.x;
      d.fy = event.y;
      onNodeDragEnd(d.type, d.id, event.x, event.y);
    }

    return () => { simulation.stop(); };
  }, [nodes, links, selectedId, starredIds]);

  return (
    <div ref={containerRef} className="w-full h-full bg-[#050505] overflow-hidden relative">
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-1 pointer-events-none">
        <div className="text-[10px] font-bold text-phosphor flex items-center gap-2">
          <Database size={12} /> NUCLEO DE INTELIGÊNCIA V.3.1
        </div>
        <div className="text-[8px] text-phosphor/40 uppercase">DÊ DUPLO CLIQUE PARA RENOMEAR</div>
      </div>
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
}

// --- Hierarchy Tree Sidebar ---
function HierarchyTree({
  data,
  selectedItem,
  onSelect,
  onCreateItem,
  onDeleteItem,
  starredIds,
  onToggleStar
}: {
  data: BrainHierarchy;
  selectedItem: SelectedItem;
  onSelect: (item: SelectedItem) => void;
  onCreateItem: (type: string, parentId?: string, parentType?: string) => void;
  onDeleteItem: (type: string, id: string) => void;
  starredIds: Set<string>;
  onToggleStar: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(data.hotels.map(h => h.id)));

  const toggle = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const isSelected = (id: string) => selectedItem?.id === id;
  const isStarred = (id: string) => starredIds.has(id);

  return (
    <div className="flex-1 overflow-y-auto font-mono text-[10px] p-2 space-y-0.5 scrollbar-none bg-black/40">
      <div className="mb-4 px-2 py-3 border-b border-phosphor/10 flex items-center justify-between bg-white/5 rounded">
        <span className="text-[10px] text-phosphor uppercase tracking-widest font-bold">Diretórios</span>
        <button 
          onClick={() => onCreateItem('nucleus')} 
          className="flex items-center gap-1 px-2 py-1 bg-phosphor text-black rounded text-[9px] font-bold hover:bg-white transition-all shadow-[0_0_10px_rgba(0,255,65,0.3)]"
        >
          <Plus size={10} /> NOVO NÚCLEO
        </button>
      </div>

      {data.hotels.map(hotel => (
        <div key={hotel.id}>
          <div 
            onClick={() => onSelect({ type: 'nucleus', id: hotel.id })}
            className={`group flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded transition-all ${isSelected(hotel.id) ? 'bg-red-900/20 border-l-2 border-red-600' : 'hover:bg-white/5'}`}
          >
            <button onClick={e => toggle(hotel.id, e)} className="text-phosphor/30 shrink-0">
              {expanded.has(hotel.id) ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            </button>
            <span className="text-red-500">{hotel.icon}</span>
            <span className={`flex-1 truncate uppercase font-bold ${isSelected(hotel.id) ? 'text-red-400' : 'text-white/60'} flex items-center gap-2`}>
              {hotel.name}
            </span>
            <div className="flex items-center gap-1">
              <button 
                onClick={e => { e.stopPropagation(); onToggleStar(hotel.id); }} 
                className={`p-1 rounded transition-all ${isStarred(hotel.id) ? 'text-yellow-500' : 'text-phosphor/20 hover:text-phosphor/50'}`}
              >
                <Star size={10} className={isStarred(hotel.id) ? "fill-yellow-500" : ""} />
              </button>
              <button 
                onClick={e => { e.stopPropagation(); onCreateItem('operation', hotel.id, 'nucleus'); }} 
                className="p-1 hover:bg-phosphor/20 text-phosphor rounded transition-all"
                title="Nova Operação"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {expanded.has(hotel.id) && data.apartments.filter(a => a.hotelId === hotel.id).map(apt => (
            <div key={apt.id} className="ml-3 border-l border-phosphor/10">
              <div 
                onClick={() => onSelect({ type: 'operation', id: apt.id })}
                className={`group flex items-center gap-2 px-2 py-1 cursor-pointer transition-all ${isSelected(apt.id) ? 'bg-phosphor/10 border-l-2 border-phosphor' : 'hover:bg-white/5'}`}
              >
                <button onClick={e => toggle(apt.id, e)} className="text-phosphor/30">{expanded.has(apt.id) ? <ChevronDown size={9} /> : <ChevronRight size={9} />}</button>
                <span className="text-phosphor/60">{apt.icon}</span>
                <span className={`flex-1 truncate uppercase ${isSelected(apt.id) ? 'text-phosphor' : 'text-white/40'} flex items-center gap-2`}>
                  {apt.name}
                </span>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={e => { e.stopPropagation(); onToggleStar(apt.id); }} 
                    className={`p-1 rounded transition-all ${isStarred(apt.id) ? 'text-yellow-500' : 'text-phosphor/20 hover:text-phosphor/50'}`}
                  >
                    <Star size={9} className={isStarred(apt.id) ? "fill-yellow-500" : ""} />
                  </button>
                  <button 
                    onClick={e => { e.stopPropagation(); onCreateItem('sector', apt.id, 'operation'); }} 
                    className="p-1 hover:bg-phosphor/20 text-phosphor rounded transition-all"
                    title="Novo Setor"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>

              {expanded.has(apt.id) && data.rooms.filter(r => r.apartmentId === apt.id).map(room => (
                <div key={room.id} className="ml-3 border-l border-phosphor/10">
                  <div 
                    onClick={() => onSelect({ type: 'sector', id: room.id })}
                    className={`group flex items-center gap-2 px-2 py-1 cursor-pointer transition-all ${isSelected(room.id) ? 'bg-phosphor/20 border-l-2 text-phosphor' : 'hover:bg-white/5 opacity-50'}`}
                  >
                    <button onClick={e => toggle(room.id, e)} className="text-phosphor/20">{expanded.has(room.id) ? <ChevronDown size={8} /> : <ChevronRight size={8} />}</button>
                    <span>{room.icon}</span>
                    <span className="flex-1 truncate uppercase flex items-center gap-2">
                      {room.name}
                    </span>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={e => { e.stopPropagation(); onToggleStar(room.id); }} 
                        className={`p-1 rounded transition-all ${isStarred(room.id) ? 'text-yellow-500' : 'text-phosphor/20 hover:text-phosphor/50'}`}
                      >
                        <Star size={8} className={isStarred(room.id) ? "fill-yellow-500" : ""} />
                      </button>
                      <button 
                        onClick={e => { e.stopPropagation(); onCreateItem('registry', room.id, 'sector'); }} 
                        className="p-1 hover:bg-phosphor/20 text-phosphor rounded transition-all"
                        title="Novo Registro"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>

                  {expanded.has(room.id) && data.furniture.filter(f => f.roomId === room.id).map(furn => (
                    <div 
                      key={furn.id} 
                      onClick={() => onSelect({ type: 'registry', id: furn.id })}
                      className={`ml-6 px-2 py-0.5 flex items-center gap-2 cursor-pointer transition-all text-[9px] ${isSelected(furn.id) ? 'text-phosphor border-l border-phosphor bg-phosphor/5' : 'text-white/20 hover:text-white/40'}`}
                    >
                      <span>◈</span>
                      <span className="flex-1 truncate uppercase flex items-center gap-2">
                        {furn.name}
                      </span>
                      <button 
                        onClick={e => { e.stopPropagation(); onToggleStar(furn.id); }} 
                        className={`p-1 rounded transition-all ${isStarred(furn.id) ? 'text-yellow-500' : 'text-phosphor/20 hover:text-phosphor/50'}`}
                      >
                        <Star size={8} className={isStarred(furn.id) ? "fill-yellow-500" : ""} />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// --- Main Editor Panel ---
function ContentEditor({ 
  item, 
  onSave, 
  onDeleteItem,
  isFullscreen,
  onToggleFullscreen,
  isStarred,
  onToggleStar
}: { 
  item: { data: any, type: string } | null, 
  onSave: (id: string, updates: any) => void,
  onDeleteItem: (type: string, id: string) => void,
  isFullscreen: boolean,
  onToggleFullscreen: () => void,
  isStarred: boolean,
  onToggleStar: () => void
}) {
  const [content, setContent] = useState('');
  const [name, setName] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (item?.data) {
      setContent(item.data.content || '');
      setName(item.data.name || '');
      setIsDirty(false);
    }
  }, [item?.data?.id]);

  if (!item) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-phosphor/10 font-mono uppercase border-l border-phosphor/10 p-10 text-center">
        <Database size={48} className="mb-4 opacity-5" />
        <div className="text-xs">nenhum dado selecionado</div>
        <div className="text-[8px] mt-2 tracking-[0.2em]">selecione um nó no mapa para visualização</div>
      </div>
    );
  }

  const { type, data } = item;

  return (
    <div className="flex-1 flex flex-col bg-[#050505] border-l border-phosphor/15 h-full overflow-hidden">
      <div className="shrink-0 p-4 border-b border-phosphor/10 flex items-center justify-between bg-black/40">
        <div>
          <div className="text-[8px] text-phosphor/30 uppercase tracking-[0.3em] font-bold">{type}</div>
          <input 
            value={name}
            onChange={e => { setName(e.target.value); setIsDirty(true); }}
            className="bg-transparent border-none outline-none font-bold text-white uppercase text-sm w-full mt-1 focus:text-phosphor transition-colors"
          />
        </div>
        <div className="flex gap-2">
          <button 
            onClick={onToggleStar}
            className={`p-2 border transition-all rounded ${isStarred ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.3)]' : 'border-phosphor/30 text-phosphor/60 hover:bg-phosphor/20'}`}
            title={isStarred ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          >
            <Star size={14} className={isStarred ? "fill-yellow-500" : ""} />
          </button>
          <button 
            onClick={onToggleFullscreen}
            className="p-2 border border-phosphor/30 text-phosphor/60 hover:bg-phosphor/20 transition-all rounded"
            title={isFullscreen ? "Sair do Fullscreen" : "Modo Fullscreen"}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button 
            onClick={() => onDeleteItem(type, data.id)}
            className="p-2 border border-red-900/30 text-red-600 hover:bg-red-900/20 transition-all rounded"
          >
            <Trash2 size={14} />
          </button>
          {type === 'registry' && (
            <button 
              onClick={() => { onSave(data.id, { content, name }); setIsDirty(false); }}
              disabled={!isDirty}
              className={`flex items-center gap-2 px-4 py-1.5 rounded uppercase font-bold text-[10px] transition-all ${isDirty ? 'bg-phosphor text-black hover:bg-white' : 'bg-white/5 text-white/20 cursor-default'}`}
            >
              <Save size={14} /> salvar
            </button>
          )}
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto p-4 custom-scrollbar ${isFullscreen ? 'max-w-6xl mx-auto w-full' : ''}`}>
        {type === 'registry' ? (
          <div className="flex flex-col gap-4 h-full">
            <div className={`grid ${isFullscreen ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-12' : 'grid-cols-1 sm:grid-cols-2'} gap-6`}>
              <div className={`flex flex-col gap-2 ${isFullscreen ? 'lg:col-span-7' : ''}`}>
                <label className="text-[8px] text-phosphor/40 uppercase font-bold tracking-widest flex items-center gap-2">
                  <Edit3 size={10} /> Editor de Registro
                </label>
                <textarea 
                  autoFocus
                  value={content}
                  onChange={e => { setContent(e.target.value); setIsDirty(true); }}
                  className={`${isFullscreen ? 'h-[70vh]' : 'h-96'} w-full bg-black border border-phosphor/20 p-6 text-phosphor font-mono text-[13px] outline-none focus:border-phosphor/100 transition-all shadow-[0_0_25px_rgba(0,255,65,0.05)] resize-none leading-relaxed`}
                  spellCheck={false}
                />
              </div>
              <div className={`flex flex-col gap-2 ${isFullscreen ? 'lg:col-span-5' : ''}`}>
                <label className="text-[8px] text-phosphor/40 uppercase font-bold tracking-widest flex items-center gap-2">
                  <FileText size={10} /> Prévia Monitorada
                </label>
                <div className={`${isFullscreen ? 'h-[70vh]' : 'h-96'} w-full bg-black/40 border border-white/5 p-6 overflow-y-auto prose prose-invert prose-xs max-w-none prose-p:text-[12px] prose-headings:text-phosphor scrollbar-none`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                </div>
              </div>
            </div>
            <div className="mt-auto pt-4 border-t border-phosphor/5 flex gap-10 text-[8px] text-white/20 uppercase font-mono">
              <div>caracteres: {content.length}</div>
              <div>linhas: {content.split('\n').length}</div>
              <div>id de sistema: {data.id}</div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col p-6 border border-phosphor/10 bg-phosphor/5 rounded">
            <Edit3 size={32} className="mb-4 text-phosphor/20" />
            <h3 className="text-sm font-bold text-phosphor uppercase mb-2">Entidade de Estrutura</h3>
            <p className="text-[10px] text-white/40 leading-relaxed uppercase">
              Este registro é um marcador de diretório. Use-o para organizar os fluxos de inteligência. 
              Para adicionar conteúdo binário ou descritivo, crie um <span className="text-phosphor">Registro</span> dentro deste setor.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-2">
               <div className="flex justify-between items-center px-3 py-2 bg-black border border-phosphor/10 text-[10px]">
                 <span className="text-white/30 uppercase">ID ÚNICO</span>
                 <span className="font-mono text-phosphor">{data.id}</span>
               </div>
               <div className="flex justify-between items-center px-3 py-2 bg-black border border-phosphor/10 text-[10px]">
                 <span className="text-white/30 uppercase">ÍCONE</span>
                 <span>{data.icon}</span>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Main Module ---
export default function IntelligenceModule({ data, onUpdate, playClick }: IntelligenceModuleProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('MINDMAP');
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditorFullscreen, setIsEditorFullscreen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [starredIds, setStarredIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('brain_starred_ids');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    localStorage.setItem('brain_starred_ids', JSON.stringify(Array.from(starredIds)));
  }, [starredIds]);

  const toggleStar = (id: string) => {
    playClick();
    const next = new Set(starredIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setStarredIds(next);
  };

  const currentSelection = useMemo(() => {
    if (!selectedItem) return null;
    const typeMapping: any = {
      nucleus: 'hotels',
      operation: 'apartments',
      sector: 'rooms',
      registry: 'furniture'
    };
    const backendType = typeMapping[selectedItem.type] || selectedItem.type;
    const found = (data as any)[backendType]?.find((i: any) => i.id === selectedItem.id);
    return found ? { data: found, type: selectedItem.type } : null;
  }, [selectedItem, data]);

  const handleCreate = async (uiType: string, parentId?: string, parentType?: string) => {
    playClick();
    const typeMapping: any = {
      nucleus: 'hotels',
      operation: 'apartments',
      sector: 'rooms',
      registry: 'furniture'
    };
    
    // Support either old backend type name or new UI type name
    const type = typeMapping[uiType] || uiType;

    const displayNames: any = {
      hotels: 'NÚCLEO',
      apartments: 'OPERAÇÃO',
      rooms: 'SECTOR',
      furniture: 'REGISTRO'
    };
    const name = prompt(`NOME PARA ${displayNames[type] || type.toUpperCase()}:`);
    if (!name) return;

    const body: any = { 
      name, 
      icon: type === 'hotels' ? '⬡' : type === 'apartments' ? '📁' : type === 'rooms' ? '📂' : '◈',
      color: type === 'hotels' ? '#ff0000' : '#00ff41'
    };

    if (type === 'apartments') body.hotelId = parentId;
    if (type === 'rooms') body.apartmentId = parentId;
    if (type === 'furniture') {
      body.roomId = parentId;
      body.content = '# NOVO REGISTRO\n---\ndados aguardando processamento...';
      body.spriteType = 'console';
    }

    try {
      const res = await fetch(`/api/brain/create/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) onUpdate();
    } catch (e) { console.error(e); }
  };

  const handleNodeDragEnd = async (uiType: string, id: string, x: number, y: number) => {
    const typeMapping: any = {
      nucleus: 'hotels',
      operation: 'apartments',
      sector: 'rooms',
      registry: 'furniture'
    };
    const type = typeMapping[uiType] || uiType;
    try {
      await fetch(`/api/brain/${type}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y })
      });
      // Not calling onUpdate here to avoid jitter during simulation, but the data is saved
    } catch (e) { console.error(e); }
  };

  const handleRename = async (uiType: string, id: string, newName: string) => {
    const typeMapping: any = {
      nucleus: 'hotels',
      operation: 'apartments',
      sector: 'rooms',
      registry: 'furniture'
    };
    const type = typeMapping[uiType] || uiType;
    try {
      await fetch(`/api/brain/${type}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName })
      });
      onUpdate();
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (uiType: string, id: string) => {
    if (!confirm('CONFIRMAR EXCLUSÃO CRÍTICA? TODOS OS DADOS FILHOS SERÃO PERDIDOS.')) return;
    playClick();
    const typeMapping: any = {
      nucleus: 'hotels',
      operation: 'apartments',
      sector: 'rooms',
      registry: 'furniture'
    };
    const type = typeMapping[uiType] || uiType;
    try {
      const res = await fetch(`/api/brain/${type}/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSelectedItem(null);
        onUpdate();
      }
    } catch (e) { console.error(e); }
  };

  const handleSave = async (id: string, updates: any) => {
    playClick();
    const typeMapping: any = {
      nucleus: 'hotels',
      operation: 'apartments',
      sector: 'rooms',
      registry: 'furniture'
    };
    const backendType = typeMapping[currentSelection?.type || ''] || 'furniture';
    try {
      const res = await fetch(`/api/brain/${backendType}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) onUpdate();
    } catch (e) { console.error(e); }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0a0a0a] overflow-hidden">
      {/* Top Navbar */}
      <div className="h-12 border-b border-phosphor/20 flex items-center px-4 bg-black/80 justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => { playClick(); setIsSidebarOpen(!isSidebarOpen); }}
            className={`p-2 transition-all rounded hover:bg-phosphor/10 md:hidden ${isSidebarOpen ? 'text-phosphor' : 'text-phosphor/40'}`}
          >
            <Menu size={18} />
          </button>
          <div className="flex gap-1 h-8">
            <button 
              onClick={() => { playClick(); setViewMode('MINDMAP'); }}
              className={`px-4 md:px-6 py-1 text-[10px] uppercase font-bold tracking-widest transition-all skew-x-[-15deg] border-x border-phosphor/20 ${viewMode === 'MINDMAP' ? 'bg-phosphor text-black' : 'text-phosphor/40 hover:bg-phosphor/10'}`}
            >
              <span className="hidden sm:inline">Mapa Tático</span>
              <Layers size={14} className="sm:hidden" />
            </button>
            <button 
              onClick={() => { playClick(); setViewMode('EDITOR'); }}
              className={`px-4 md:px-6 py-1 text-[10px] uppercase font-bold tracking-widest transition-all skew-x-[-15deg] border-x border-phosphor/20 ${viewMode === 'EDITOR' ? 'bg-phosphor text-black' : 'text-phosphor/40 hover:bg-phosphor/10'}`}
            >
              <span className="hidden sm:inline">Acesso a Dados</span>
              <FileText size={14} className="sm:hidden" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-6">
          <div className="hidden xs:flex items-center gap-2 bg-black border border-phosphor/10 px-2 sm:px-3 py-1">
            <Search size={10} className="text-phosphor/20" />
            <input 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-transparent border-none text-[10px] outline-none text-phosphor w-16 sm:w-32 uppercase placeholder:opacity-20"
              placeholder="buscar..."
            />
          </div>
          <button 
            onClick={() => { playClick(); onUpdate(); }} 
            className="flex items-center gap-2 px-2 sm:px-3 py-1 bg-phosphor/10 border border-phosphor/20 text-phosphor/60 hover:text-phosphor transition-all text-[8px] uppercase font-bold rounded"
          >
             <RotateCcw size={12} /> <span className="hidden xs:inline">Sincronizar</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar */}
        <AnimatePresence>
          {!isEditorFullscreen && isSidebarOpen && (
            <motion.div 
              initial={{ x: -256 }}
              animate={{ x: 0 }}
              exit={{ x: -256 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute md:relative z-30 w-64 shrink-0 flex flex-col border-r border-phosphor/10 bg-[#0a0a0a] h-full"
            >
              <HierarchyTree 
                data={data}
                selectedItem={selectedItem}
                onSelect={(item) => {
                  setSelectedItem(item);
                  if (window.innerWidth < 768) setIsSidebarOpen(false);
                }}
                onCreateItem={handleCreate}
                onDeleteItem={handleDelete}
                starredIds={starredIds}
                onToggleStar={toggleStar}
              />
              <div className="p-4 border-t border-phosphor/10 bg-black/40">
                 <div className="text-[7px] text-phosphor/30 uppercase space-y-1">
                   <div className="flex justify-between"><span>NÚCLEOS</span> <span className="text-phosphor">{data.hotels.length}</span></div>
                   <div className="flex justify-between"><span>OPERAÇÕES</span> <span className="text-phosphor">{data.apartments.length}</span></div>
                   <div className="flex justify-between"><span>SECTORES</span> <span className="text-phosphor">{data.rooms.length}</span></div>
                   <div className="flex justify-between font-bold text-phosphor mt-2 border-t border-phosphor/5 pt-1"><span>TOTAL REGISTROS</span> <span>{data.furniture.length}</span></div>
                 </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {!isEditorFullscreen && (
            <div className="flex-1 relative border-r border-phosphor/10">
              {viewMode === 'MINDMAP' ? (
                <ForceGraph 
                  data={data}
                  selectedId={selectedItem?.id || null}
                  onSelect={setSelectedItem}
                  onRename={handleRename}
                  onNodeDragEnd={handleNodeDragEnd}
                  starredIds={starredIds}
                />
              ) : (
                <div className="w-full h-full p-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 overflow-y-auto content-start custom-scrollbar">
                  {data.furniture.filter(f => !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase())).map(f => (
                    <motion.div 
                      key={f.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => { playClick(); setSelectedItem({ type: 'registry', id: f.id }); }}
                      className={`p-3 border border-phosphor/10 bg-black/40 hover:border-phosphor/40 cursor-pointer flex items-start gap-3 rounded ${selectedItem?.id === f.id ? 'border-phosphor shadow-[inset_0_0_10px_rgba(0,255,65,0.1)]' : ''}`}
                    >
                      <div className="relative shrink-0">
                        <FileText size={18} className="text-phosphor/40" />
                        {starredIds.has(f.id) && (
                          <div className="absolute -top-1 -right-1">
                            <Star size={8} className="fill-yellow-500 text-yellow-500" />
                          </div>
                        )}
                      </div>
                      <div className="overflow-hidden">
                        <div className="text-[10px] font-bold text-white truncate uppercase">{f.name}</div>
                        <div className="text-[8px] text-white/20 truncate mt-1">{f.content.replace(/[#*`]/g, '').slice(0, 50)}...</div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Side Content Details / Editor */}
          <div className={`${isEditorFullscreen ? 'flex-1' : 'w-full md:w-80 lg:w-96'} flex flex-col overflow-hidden bg-black/20 transition-all duration-500 border-l border-phosphor/10 shadow-[0_0_30px_rgba(0,0,0,0.5)]`}>
            <ContentEditor 
              key={selectedItem?.id || 'empty'}
              item={currentSelection}
              onSave={handleSave}
              onDeleteItem={handleDelete}
              isFullscreen={isEditorFullscreen}
              onToggleFullscreen={() => setIsEditorFullscreen(!isEditorFullscreen)}
              isStarred={selectedItem ? starredIds.has(selectedItem.id) : false}
              onToggleStar={() => selectedItem && toggleStar(selectedItem.id)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
