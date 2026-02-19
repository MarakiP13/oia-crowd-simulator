import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";

// --- Constants & Config ---
const API_KEY = process.env.API_KEY || "";
const MAP_WIDTH = 1200;
const MAP_HEIGHT = 800;

// Landmarks and Paths in Oia
const LANDMARKS = [
  { id: 'castle', name: 'Byzantine Castle (Sunset Point)', x: 100, y: 400, type: 'attraction' },
  { id: 'windmills', name: 'The Windmills', x: 150, y: 200, type: 'attraction' },
  { id: 'blue_domes', name: 'Blue Dome Churches', x: 450, y: 450, type: 'photo' },
  { id: 'main_square', name: 'Panagia Platsani Church', x: 700, y: 380, type: 'hub' },
  { id: 'entry', name: 'Oia Entrance (Bus/Taxi)', x: 1100, y: 350, type: 'hub' },
];

const PATHS = [
  // The main marble path
  { from: 'entry', to: 'main_square', weight: 1 },
  { from: 'main_square', to: 'blue_domes', weight: 1.2 },
  { from: 'blue_domes', to: 'castle', weight: 1.5 },
  { from: 'castle', to: 'windmills', weight: 0.8 },
];

// --- Types ---
interface Tourist {
  id: number;
  x: number;
  y: number;
  targetId: string;
  speed: number;
  color: string;
}

// --- Helper Functions ---
const getMonthName = (m: number) => {
  return ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m];
};

const getDayCycleColor = (hour: number) => {
  if (hour < 6) return '#0f172a'; // Deep night
  if (hour < 9) return '#cbd5e1'; // Dawn
  if (hour < 17) return '#f8fafc'; // Day
  if (hour < 20) return '#fed7aa'; // Sunset
  return '#1e293b'; // Night
};

// --- Main Component ---
const OiaSimulator = () => {
  const [month, setMonth] = useState(7); // August
  const [hour, setHour] = useState(18); // 6 PM
  const [aiInsight, setAiInsight] = useState<string>("Adjust the sliders to see how Oia changes...");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const touristsRef = useRef<Tourist[]>([]);
  const frameRef = useRef<number>();

  // Determine base crowd count based on month and hour
  // Peak: July/August (7/8), Midday to Sunset
  const crowdDensity = useMemo(() => {
    const monthFactor = [0.1, 0.15, 0.3, 0.5, 0.8, 1, 1.2, 1.2, 0.9, 0.6, 0.2, 0.1][month];
    const hourFactor = (hour >= 10 && hour <= 21) ? 1.0 : 0.3;
    const sunsetBonus = (hour >= 18 && hour <= 20) ? 1.5 : 1.0;
    return Math.floor(400 * monthFactor * hourFactor * sunsetBonus);
  }, [month, hour]);

  // AI Insight Generation
  useEffect(() => {
    const fetchInsight = async () => {
      if (!API_KEY) return;
      setIsAnalyzing(true);
      try {
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        const monthName = getMonthName(month);
        const prompt = `You are a Santorini travel planning expert. 
        Analyze this scenario in Oia: Month is ${monthName}, time is ${hour}:00. 
        The estimated crowd density is ${crowdDensity} units (on a scale of 0-500).
        Provide 2 sentences of tactical advice for a first-time visitor. Focus on photo wait times, walking comfort, and specific landmarks to visit or avoid right now. Keep it punchy and helpful.`;

        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
        });
        setAiInsight(response.text || "Unable to get insights.");
      } catch (e) {
        console.error(e);
        setAiInsight("Local guides are offline. Trust your instincts!");
      } finally {
        setIsAnalyzing(false);
      }
    };

    const timer = setTimeout(fetchInsight, 800);
    return () => clearTimeout(timer);
  }, [month, hour, crowdDensity]);

  // Simulation Engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Initialize/Update Tourists
    const currentCount = touristsRef.current.length;
    if (currentCount < crowdDensity) {
      for (let i = 0; i < crowdDensity - currentCount; i++) {
        const entryPoint = LANDMARKS[Math.floor(Math.random() * LANDMARKS.length)];
        touristsRef.current.push({
          id: Math.random(),
          x: entryPoint.x + (Math.random() - 0.5) * 50,
          y: entryPoint.y + (Math.random() - 0.5) * 50,
          targetId: LANDMARKS[Math.floor(Math.random() * LANDMARKS.length)].id,
          speed: 0.5 + Math.random() * 0.8,
          color: hour > 18 ? `hsl(${Math.random() * 60 + 20}, 70%, 70%)` : `hsl(${Math.random() * 40 + 200}, 20%, 50%)`
        });
      }
    } else if (currentCount > crowdDensity) {
      touristsRef.current.splice(0, currentCount - crowdDensity);
    }

    const animate = () => {
      // Clear with time-based sky color
      ctx.fillStyle = getDayCycleColor(hour);
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw Paths (Subtle)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 15;
      PATHS.forEach(p => {
        const from = LANDMARKS.find(l => l.id === p.from)!;
        const to = LANDMARKS.find(l => l.id === p.to)!;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      });

      // Update & Draw Tourists
      touristsRef.current.forEach(t => {
        const target = LANDMARKS.find(l => l.id === t.targetId)!;
        
        // Attraction Logic: If sunset, go to Castle
        let finalTarget = target;
        if (hour >= 18 && hour <= 20) {
            finalTarget = LANDMARKS.find(l => l.id === 'castle')!;
        }

        const dx = finalTarget.x - t.x;
        const dy = finalTarget.y - t.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 10) {
          t.targetId = LANDMARKS[Math.floor(Math.random() * LANDMARKS.length)].id;
        } else {
          // Slow down in high density
          const densityFactor = Math.max(0.2, 1 - (crowdDensity / 800));
          t.x += (dx / dist) * t.speed * densityFactor;
          t.y += (dy / dist) * t.speed * densityFactor;
        }

        // Draw Heatmap or Dots
        if (showHeatmap) {
            ctx.fillStyle = 'rgba(255, 50, 50, 0.1)';
            ctx.beginPath();
            ctx.arc(t.x, t.y, 25, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle = t.color;
            ctx.beginPath();
            ctx.arc(t.x, t.y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
      });

      // Draw Landmarks
      LANDMARKS.forEach(l => {
        ctx.fillStyle = '#005BA6';
        ctx.beginPath();
        ctx.arc(l.x, l.y, 6, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = hour > 18 ? '#fff' : '#1e293b';
        ctx.font = 'bold 12px Inter';
        ctx.fillText(l.name, l.x - 40, l.y - 15);
      });

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current!);
  }, [crowdDensity, hour, showHeatmap]);

  const stats = {
    vibe: crowdDensity > 350 ? 'Overwhelming' : crowdDensity > 150 ? 'Bustling' : 'Serene',
    photoWait: Math.floor(crowdDensity / 10) + ' min',
    speed: Math.max(1, 4 - (crowdDensity / 100)).toFixed(1) + ' km/h'
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      {/* Simulation Layer */}
      <div id="canvas-container" style={{ background: getDayCycleColor(hour) }}>
        <canvas 
          ref={canvasRef} 
          width={window.innerWidth} 
          height={window.innerHeight}
        />
      </div>

      {/* Header Panel */}
      <div className="absolute top-6 left-6 right-6 flex justify-between items-start pointer-events-none">
        <div className="glass p-6 rounded-2xl w-80 pointer-events-auto shadow-xl">
          <h1 className="text-2xl font-bold santorini-blue mb-1">Oia Planner</h1>
          <p className="text-sm text-slate-500 mb-4">Strategic Crowd Simulator</p>
          
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1 uppercase tracking-wider text-slate-400">
                <span>Month</span>
                <span className="text-slate-900">{getMonthName(month)}</span>
              </div>
              <input 
                type="range" min="0" max="11" value={month} 
                onChange={(e) => setMonth(parseInt(e.target.value))} 
              />
            </div>
            
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1 uppercase tracking-wider text-slate-400">
                <span>Time of Day</span>
                <span className="text-slate-900">{hour}:00</span>
              </div>
              <input 
                type="range" min="6" max="23" value={hour} 
                onChange={(e) => setHour(parseInt(e.target.value))} 
              />
            </div>

            <div className="pt-2 flex items-center gap-2">
                <input 
                    type="checkbox" id="heatmap" 
                    className="w-4 h-4 rounded" 
                    checked={showHeatmap}
                    onChange={(e) => setShowHeatmap(e.target.checked)}
                />
                <label htmlFor="heatmap" className="text-sm font-medium text-slate-700">Show Density Heatmap</label>
            </div>
          </div>
        </div>

        <div className="flex gap-4">
            <div className="glass p-4 rounded-xl pointer-events-auto shadow-lg text-center min-w-[100px]">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Walking Speed</div>
                <div className="text-xl font-bold santorini-blue">{stats.speed}</div>
            </div>
            <div className="glass p-4 rounded-xl pointer-events-auto shadow-lg text-center min-w-[100px]">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Photo Wait</div>
                <div className="text-xl font-bold santorini-blue">{stats.photoWait}</div>
            </div>
            <div className={`glass p-4 rounded-xl pointer-events-auto shadow-lg text-center min-w-[100px] ${crowdDensity > 300 ? 'border-red-400 border-2' : ''}`}>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Experience Vibe</div>
                <div className={`text-xl font-bold ${crowdDensity > 300 ? 'text-red-600' : 'text-emerald-600'}`}>{stats.vibe}</div>
            </div>
        </div>
      </div>

      {/* AI Insight Overlay */}
      <div className="absolute bottom-6 left-6 right-6 pointer-events-none flex justify-center">
        <div className="glass p-6 rounded-2xl max-w-2xl w-full pointer-events-auto shadow-2xl border-l-4 border-santorini-blue">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full bg-santorini-blue ${isAnalyzing ? 'analyzing' : ''}`}></div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Expert Guide Insights</span>
          </div>
          <p className="text-slate-800 text-lg leading-relaxed italic">
            {isAnalyzing ? "Analyzing pedestrian traffic patterns..." : `"${aiInsight}"`}
          </p>
        </div>
      </div>

      {/* Legend & Info */}
      <div className="absolute bottom-6 right-6 pointer-events-none">
          <div className="text-[10px] text-white/50 text-right">
              SIMULATED CROWD DENSITY: {crowdDensity} VISITORS<br/>
              MODEL: GEMINI-3-FLASH-PREVIEW
          </div>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<OiaSimulator />);
