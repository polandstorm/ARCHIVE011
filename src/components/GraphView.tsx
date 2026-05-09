import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Lock, Terminal } from 'lucide-react';

interface Node extends d3.SimulationNodeDatum {
  id: string;
  isLocked: boolean;
  isRoot?: boolean;
}

interface Link extends d3.SimulationLinkDatum<Node> {}

interface GraphViewProps {
  dirs: { name: string; isLocked: boolean }[];
  onNodeClick: (dir: { name: string; isLocked: boolean }) => void;
}

export default function GraphView({ dirs, onNodeClick }: GraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || dirs.length === 0) return;

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    const nodes: Node[] = [
      { id: 'ROOT', isLocked: false, isRoot: true },
      ...dirs.map(d => ({ id: d.name, isLocked: d.isLocked }))
    ];

    // Add some noise links for a more "conspiratorial" background
    const links: Link[] = [
      ...dirs.map(d => ({ source: 'ROOT', target: d.name })),
      ...dirs.slice(0, -1).map((d, i) => ({ 
        source: d.name, 
        target: dirs[i+1].name,
        isExtra: true
      }))
    ];

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const simulation = d3.forceSimulation<Node>(nodes)
      .force("link", d3.forceLink<Node, Link>(links).id(d => d.id).distance(180))
      .force("charge", d3.forceManyBody().strength(-800))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(80));

    const link = svg.append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "#00ff41")
      .attr("stroke-opacity", d => (d as any).isExtra ? 0.05 : 0.2)
      .attr("stroke-dasharray", d => (d as any).isExtra ? "4 4" : "none")
      .attr("stroke-width", 1);

    const node = svg.append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .call(d3.drag<SVGGElement, Node>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended))
      .on("click", (event, d) => {
        if (!d.isRoot) {
          onNodeClick({ name: d.id, isLocked: d.isLocked });
        }
      })
      .style("cursor", d => d.isRoot ? "default" : "pointer");

    node.append("circle")
      .attr("r", d => d.isRoot ? 30 : 25)
      .attr("fill", "#0d0d0d")
      .attr("stroke", d => d.isLocked ? "#c82323" : "#00ff41")
      .attr("stroke-width", 3);

    node.append("text")
      .attr("dy", 45)
      .attr("text-anchor", "middle")
      .attr("fill", "#00ff41")
      .attr("font-size", "10px")
      .attr("font-weight", "bold")
      .text(d => d.id);

    simulation.on("tick", () => {
      link
        .attr("x1", d => (d.source as any).x)
        .attr("y1", d => (d.source as any).y)
        .attr("x2", d => (d.target as any).x)
        .attr("y2", d => (d.target as any).y);

      node
        .attr("transform", d => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    return () => { simulation.stop(); };
  }, [dirs, onNodeClick]);

  return (
    <div className="w-full h-full border-4 border-border-gray bg-black/50 relative">
      <div className="absolute top-4 left-4 text-[10px] opacity-40 uppercase font-bold">
        Mapeamento de Topologia de Rede
      </div>
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
}
