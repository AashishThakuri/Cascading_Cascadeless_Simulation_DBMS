import React, { useState, useEffect, useRef } from 'react';
import {
    Play, Pause, RotateCcw, ChevronRight, ChevronLeft,
    AlertTriangle, CheckCircle, XCircle, Lock, ShieldCheck,
    RefreshCw, Database, ArrowRight, Layers, Activity,
    HardDrive, Server, FileText
} from 'lucide-react';


const TransactionSimulation = () => {
    const [mode, setMode] = useState('cascading');
    const [currentStep, setCurrentStep] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [speed, setSpeed] = useState(1500);

    // Ref for auto-scrolling
    const scrollContainerRef = useRef(null);
    const activeStepRef = useRef(null);

    // --- Scenarios Data ---
    const scenarios = {
        cascading: {
            title: "Cascading Schedule (Dirty Read Failure)",
            badge: "UNSAFE",
            badgeColor: "bg-red-100 text-red-700 border-red-200",
            description: "Demonstrates the 'Domino Effect'. When T1 fails, T2 and T3 must also be rolled back because they consumed uncommitted data (Dirty Reads).",
            steps: [
                { id: 0, description: "System Ready. Database State: X=50, Y=50", action: "INIT" },
                { id: 1, tx: 1, op: "WRITE", var: "X", val: 100, prev: 50, description: "T1 writes X=100 (Uncommitted)", type: "write" },
                { id: 2, tx: 2, op: "READ", var: "X", val: 100, description: "T2 reads uncommitted X from T1", type: "read", dirty: true, depStep: 1 },
                { id: 3, tx: 2, op: "WRITE", var: "Y", val: 200, prev: 50, description: "T2 writes Y=200 (Derived from X)", type: "write" },
                { id: 4, tx: 3, op: "READ", var: "Y", val: 200, description: "T3 reads uncommitted Y from T2", type: "read", dirty: true, depStep: 3 },
                { id: 5, tx: 1, op: "CRASH", description: "CRITICAL FAILURE in T1 Execution", type: "error" },
                { id: 6, tx: 1, op: "ROLLBACK", description: "T1 Aborts. Reverting X to 50...", type: "abort" },
                { id: 7, tx: 2, op: "CASCADE", description: "T2 depended on T1. Forced Abort.", type: "abort", cascade: true, depStep: 6 },
                { id: 8, tx: 3, op: "CASCADE", description: "T3 depended on T2. Forced Abort.", type: "abort", cascade: true, depStep: 7 },
            ]
        },
        cascadeless: {
            title: "Cascadeless Schedule (ACA Protocol)",
            badge: "SAFE",
            badgeColor: "bg-emerald-100 text-emerald-700 border-emerald-200",
            description: "Enforces Read Committed. T2 is blocked from reading X until T1 finishes. This isolation prevents the failure from spreading.",
            steps: [
                { id: 0, description: "System Ready. Database State: X=50, Y=50", action: "INIT" },
                { id: 1, tx: 1, op: "WRITE", var: "X", val: 100, prev: 50, description: "T1 writes X=100", type: "write" },
                { id: 2, tx: 2, op: "REQ_READ", var: "X", description: "T2 requests X...", type: "req" },
                { id: 3, tx: 2, op: "BLOCK", description: "ACA Rule: X is dirty. T2 suspended.", type: "wait_persist", depStep: 1 },
                { id: 4, tx: 1, op: "CRASH", description: "CRITICAL FAILURE in T1 Execution", type: "error" },
                { id: 5, tx: 1, op: "ROLLBACK", description: "T1 Aborts. Reverting X to 50...", type: "abort" },
                { id: 6, tx: 2, op: "RESUME", description: "Lock released. T2 unblocked.", type: "resume" },
                { id: 7, tx: 2, op: "READ", var: "X", val: 50, description: "T2 reads stable X=50.", type: "read", dirty: false },
                { id: 8, tx: 2, op: "WRITE", var: "Y", val: 60, prev: 50, description: "T2 writes Y=60", type: "write" },
                { id: 9, tx: 2, op: "COMMIT", description: "T2 Commits (Durable).", type: "commit" },
                { id: 10, tx: 3, op: "READ", var: "Y", val: 60, description: "T3 reads committed Y.", type: "read", dirty: false },
                { id: 11, tx: 3, op: "COMMIT", description: "T3 Commits (Durable).", type: "commit" },
            ]
        }
    };

    const activeScenario = scenarios[mode];
    const maxSteps = activeScenario.steps.length - 1;

    // --- Effects ---

    // Auto-play
    useEffect(() => {
        let interval;
        if (isPlaying && currentStep < maxSteps) {
            interval = setInterval(() => {
                setCurrentStep(prev => prev + 1);
            }, speed);
        } else if (currentStep >= maxSteps) {
            setIsPlaying(false);
        }
        return () => clearInterval(interval);
    }, [isPlaying, currentStep, maxSteps, speed]);

    // Auto-scroll to active step
    useEffect(() => {
        if (activeStepRef.current && scrollContainerRef.current) {
            activeStepRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
        }
    }, [currentStep]);

   
    const handleReset = () => {
        setIsPlaying(false);
        setCurrentStep(0);
    };

    const toggleMode = () => {
        handleReset();
        setMode(prev => prev === 'cascading' ? 'cascadeless' : 'cascading');
    };

    // --- State Helpers ---
    const getTxStatus = (txId) => {
        let status = 'idle';
        if (currentStep === 0) return status;

        for (let i = 1; i <= currentStep; i++) {
            const step = activeScenario.steps[i];
            if (step.tx === txId) {
                if (step.type === 'abort') status = 'aborted';
                else if (step.type === 'commit') status = 'committed';
                else if (step.type === 'wait' || step.type === 'wait_persist') status = 'waiting';
                else if (status !== 'aborted' && status !== 'committed') status = 'active';
            }
        }
        return status;
    };

    const dbState = getCurrentState(activeScenario.steps, currentStep);

    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-800 overflow-hidden selection:bg-indigo-100">

            {/* --- Header --- */}
            <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 z-30 flex flex-col md:flex-row justify-between items-center gap-4 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="bg-indigo-600 p-2.5 rounded-xl shadow-lg shadow-indigo-200">
                        <Activity className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Transaction Sim <span className="text-indigo-600">v2.0</span></h1>
                        <p className="text-xs text-slate-500 font-medium flex items-center gap-1">
                            Concurrency Control Protocol Analysis
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 bg-slate-100/50 p-1.5 rounded-xl border border-slate-200/60">
                    <ModeButton
                        active={mode === 'cascading'}
                        onClick={() => mode !== 'cascading' && toggleMode()}
                        label="Cascading"
                        subLabel="Unsafe"
                        icon={<AlertTriangle className="w-4 h-4" />}
                        activeColor="bg-white text-rose-600 shadow-sm ring-1 ring-slate-100"
                        inactiveColor="text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                    />
                    <ModeButton
                        active={mode === 'cascadeless'}
                        onClick={() => mode !== 'cascadeless' && toggleMode()}
                        label="Cascadeless"
                        subLabel="ACA"
                        icon={<ShieldCheck className="w-4 h-4" />}
                        activeColor="bg-white text-emerald-600 shadow-sm ring-1 ring-slate-100"
                        inactiveColor="text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                    />
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">

                {/* --- Main Visualizer (Timeline) --- */}
                <div className="flex-1 flex flex-col relative bg-slate-50/50">

                    {/* Scenario Banner */}
                    <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-start justify-between gap-6 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] z-20">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h2 className="font-bold text-slate-800 text-lg">{activeScenario.title}</h2>
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${activeScenario.badgeColor}`}>
                                    {activeScenario.badge}
                                </span>
                            </div>
                            <p className="text-sm text-slate-500 max-w-2xl leading-relaxed">{activeScenario.description}</p>
                        </div>
                        <div className="flex gap-4 text-xs font-semibold text-slate-400">
                            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-teal-500 shadow-sm"></div> T1 (Root)</div>
                            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-sm"></div> T2 (Dependent)</div>
                            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm"></div> T3 (Dependent)</div>
                        </div>
                    </div>

                    {/* Scrolling Canvas */}
                    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto custom-scrollbar relative">
                        <div className="p-8 pb-32 min-h-full max-w-6xl mx-auto relative">

                            {/* Background Grid Pattern */}
                            <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
                                style={{ backgroundImage: 'radial-gradient(#4f46e5 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
                            </div>

                            {/* Swimlane Headers (Sticky) */}
                            <div className="grid grid-cols-3 gap-12 sticky top-0 z-20 mb-12">
                                {[1, 2, 3].map(txId => (
                                    <TxSwimlaneHeader key={txId} txId={txId} status={getTxStatus(txId)} />
                                ))}
                            </div>

                            {/* Continuous Vertical Threads */}
                            <div className="absolute top-16 bottom-0 left-0 right-0 grid grid-cols-3 gap-12 pointer-events-none px-8">
                                {[1, 2, 3].map(id => (
                                    <div key={id} className="relative h-full flex justify-center">
                                        {/* The Thread Line */}
                                        <div className={`w-0.5 h-full transition-colors duration-700 ${getTxStatus(id) === 'aborted' ? 'bg-rose-200' :
                                            getTxStatus(id) === 'committed' ? 'bg-emerald-200' :
                                                getTxStatus(id) === 'active' ? 'bg-indigo-200' : 'bg-slate-200'
                                            }`}></div>
                                    </div>
                                ))}
                            </div>

                            {/* Steps Render */}
                            <div className="space-y-8 relative z-10 mt-4">
                                {activeScenario.steps.slice(1, currentStep + 1).map((step, idx) => (
                                    <div
                                        key={idx}
                                        ref={idx === currentStep - 1 ? activeStepRef : null}
                                        className="grid grid-cols-3 gap-12 relative group"
                                    >
                                        {/* Render Step Card */}
                                        {[1, 2, 3].map(colId => (
                                            <div key={colId} className="flex justify-center min-h-[90px] relative">
                                                {step.tx === colId && (
                                                    <EnhancedOperationCard step={step} isLatest={idx === currentStep - 1} />
                                                )}
                                            </div>
                                        ))}

                                        {/* Render Dependency Flow */}
                                        {step.depStep && step.depStep <= idx + 1 && (
                                            <FluidDependency
                                                fromTx={activeScenario.steps[step.depStep].tx}
                                                toTx={step.tx}
                                                type={step.cascade ? 'cascade' : 'dirty'}
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* End of Timeline Spacer */}
                            <div className="h-32"></div>

                        </div>
                    </div>
                </div>

                {/* --- Sidebar Control Panel --- */}
                <aside className="w-[400px] bg-white/80 backdrop-blur-xl border-l border-slate-200 flex flex-col shadow-2xl z-40">

                    {/* Dashboard Header & Controls */}
                    <div className="p-6 border-b border-slate-100">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="font-bold text-slate-800 text-lg tracking-tight">Simulation Controller</h2>
                                <div className="flex items-center gap-2 mt-1">
                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                                    <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">System Online</span>
                                </div>
                            </div>
                            <button
                                onClick={handleReset}
                                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 rounded-full transition-colors"
                                title="Reset Simulation"
                            >
                                <RotateCcw className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Playback Controls */}
                        <div className="flex items-center justify-between gap-4 mb-6">
                            <button
                                onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                                disabled={currentStep === 0}
                                className="p-3 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 text-slate-600 disabled:opacity-30 disabled:hover:translate-y-0 disabled:hover:shadow-sm transition-all"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>

                            <button
                                onClick={() => setIsPlaying(!isPlaying)}
                                className={`flex-1 h-14 flex items-center justify-center rounded-2xl shadow-lg transition-all transform hover:-translate-y-0.5 active:translate-y-0 ${isPlaying
                                    ? 'bg-amber-100 text-amber-600 border border-amber-200 hover:shadow-amber-100'
                                    : 'bg-indigo-600 text-white shadow-indigo-200 hover:shadow-indigo-300'
                                    }`}
                            >
                                {isPlaying ? (
                                    <Pause className="w-6 h-6 fill-current" />
                                ) : (
                                    <Play className="w-6 h-6 fill-current ml-1" />
                                )}
                            </button>

                            <button
                                onClick={() => setCurrentStep(Math.min(maxSteps, currentStep + 1))}
                                disabled={currentStep === maxSteps}
                                className="p-3 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 text-slate-600 disabled:opacity-30 disabled:hover:translate-y-0 disabled:hover:shadow-sm transition-all"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Progress Bar */}
                        <div className="relative pt-1">
                            <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                                <span>Execution Progress</span>
                                <span>{Math.round((currentStep / maxSteps) * 100)}%</span>
                            </div>
                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-indigo-500 transition-all duration-300 ease-out"
                                    style={{ width: `${(currentStep / maxSteps * 100)}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>

                    {/* System Monitor (New Section) */}
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                            <Activity className="w-3 h-3" /> System Monitor
                        </h3>
                        <div className="grid grid-cols-3 gap-3">
                            {[1, 2, 3].map(txId => {
                                const status = getTxStatus(txId);
                                const activeTheme = {
                                    committed: 'bg-emerald-50 border-emerald-200 text-emerald-700',
                                    aborted: 'bg-rose-50 border-rose-200 text-rose-700',
                                    active: 'bg-indigo-50 border-indigo-200 text-indigo-700',
                                    waiting: 'bg-amber-50 border-amber-200 text-amber-700',
                                    idle: 'bg-white border-slate-200 text-slate-400'
                                }[status];

                                return (
                                    <div key={txId} className={`p-2 rounded-lg border text-center transition-colors ${activeTheme}`}>
                                        <div className="text-[10px] font-bold uppercase mb-1 opacity-70">TX {txId}</div>
                                        <div className="text-xs font-bold capitalize truncate">
                                            {status === 'active' ? 'Running' : status}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Execution Log */}
                    <div className="flex-1 overflow-y-auto relative bg-slate-50/30">
                        <div className="p-6 pb-20 space-y-4">
                            <h3 className="sticky top-0 bg-white/95 backdrop-blur py-2 z-10 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-4">
                                History Log
                            </h3>

                            {activeScenario.steps.slice(0, currentStep + 1).reverse().map((step, i) => {
                                const isLatest = i === 0;
                                return (
                                    <div key={step.id} className={`flex gap-3 relative ${!isLatest ? 'opacity-50 grayscale hover:grayscale-0 hover:opacity-100 transition-all' : ''}`}>
                                        {/* Timeline Line */}
                                        <div className="absolute left-[19px] top-6 bottom-[-20px] w-0.5 bg-slate-200 -z-10"></div>

                                        <div className={`mt-0.5 w-10 h-10 rounded-xl flex items-center justify-center border shadow-sm shrink-0 z-10 bg-white ${isLatest ? 'border-indigo-100 ring-2 ring-indigo-50' : 'border-slate-100'}`}>
                                            <div className="font-mono text-xs font-bold text-slate-500">{step.id}</div>
                                        </div>

                                        <div className="flex-1 pb-4">
                                            <div className={`p-3 rounded-xl border bg-white shadow-sm ${step.type === 'abort' || step.type === 'error' ? 'border-rose-100 bg-rose-50/30' :
                                                step.type === 'commit' ? 'border-emerald-100 bg-emerald-50/30' : 'border-slate-100'
                                                }`}>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded text-white ${step.tx === 1 ? 'bg-teal-500' : step.tx === 2 ? 'bg-indigo-500' : 'bg-rose-500'
                                                        }`}>T{step.tx}</span>
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase">{step.type}</span>
                                                    {step.dirty && (
                                                        <span className="text-[9px] font-bold text-amber-500 border border-amber-200 px-1 rounded bg-amber-50">DIRTY</span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-slate-600 leading-snug">{step.description}</p>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}

                            {currentStep === 0 && (
                                <div className="text-center py-10 text-slate-400 text-sm">
                                    Waiting to start simulation...
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Database State Visualization */}
                    <div className="bg-white p-6 border-t border-slate-200 shadow-negative z-20">
                        <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center justify-between">
                            <span>Persistent Storage</span>
                            <Database className="w-3.5 h-3.5" />
                        </h3>

                        <div className="grid grid-cols-2 gap-4">
                            {['X', 'Y'].map(varName => {
                                const val = varName === 'X' ? dbState.x : dbState.y;
                                const isDirty = varName === 'X' ? dbState.dirtyX : dbState.dirtyY;
                                return (
                                    <div key={varName} className="bg-slate-50 rounded-xl p-3 border border-slate-200 relative overflow-hidden">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-xs font-bold text-slate-500">VAR {varName}</span>
                                            {isDirty ? (
                                                <Lock className="w-3 h-3 text-amber-500" />
                                            ) : (
                                                <CheckCircle className="w-3 h-3 text-emerald-400" />
                                            )}
                                        </div>
                                        <div className="text-2xl font-black text-slate-700 tracking-tight">{val}</div>
                                        {isDirty && <div className="text-[9px] text-amber-600 font-bold mt-1">Uncommitted</div>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                </aside>

            </div>
        </div>
    );
};

// --- Sub Components ---

const ModeButton = ({ active, onClick, label, subLabel, icon, activeColor, inactiveColor }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${active ? activeColor : inactiveColor
            }`}
    >
        <div className={`p-1 rounded ${active ? 'bg-current/10' : 'bg-slate-200'}`}>
            {React.cloneElement(icon, { className: "w-3.5 h-3.5" })}
        </div>
        <div className="text-left leading-none">
            <div className="font-bold">{label}</div>
            <div className="text-[9px] opacity-70 uppercase tracking-wider mt-0.5">{subLabel}</div>
        </div>
    </button>
);

const TxSwimlaneHeader = ({ txId, status }) => {
    const themes = {
        1: 'teal',
        2: 'indigo',
        3: 'rose'
    };
    const color = themes[txId];

    const statusColors = {
        committed: 'bg-emerald-500 shadow-emerald-200',
        aborted: 'bg-rose-500 shadow-rose-200',
        waiting: 'bg-amber-500 shadow-amber-200',
        active: 'bg-indigo-500 shadow-indigo-200',
        idle: 'bg-slate-300'
    };

    const statusText = {
        committed: 'Success',
        aborted: 'Failed',
        waiting: 'Blocked',
        active: 'Running',
        idle: 'Idle'
    };

    return (
        <div className={`flex flex-col items-center transition-all duration-500 z-10 ${status === 'active' ? 'transform translate-y-2' : ''}`}>
            <div className={`
        w-full max-w-[180px] rounded-xl border-b-4 bg-white shadow-sm p-4 relative overflow-hidden
        ${status === 'aborted' ? 'border-rose-400 opacity-90' : `border-${color}-500`}
        ${status === 'active' ? 'shadow-lg ring-2 ring-indigo-100' : ''}
      `}>
                {/* Header Content */}
                <div className="flex justify-between items-center mb-2">
                    <span className={`font-black text-2xl text-slate-700`}>T{txId}</span>
                    <div className={`w-3 h-3 rounded-full shadow-[0_0_10px_currentColor] animate-pulse ${statusColors[status]}`}></div>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${status === 'committed' ? 'bg-emerald-100 text-emerald-700' :
                        status === 'aborted' ? 'bg-rose-100 text-rose-700' :
                            status === 'waiting' ? 'bg-amber-100 text-amber-700' :
                                status === 'active' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                        {statusText[status]}
                    </span>
                </div>
            </div>
        </div>
    );
};

const EnhancedOperationCard = ({ step, isLatest }) => {
    const theme = {
        1: 'teal',
        2: 'indigo',
        3: 'rose'
    }[step.tx];

    const getStyles = () => {
        switch (step.type) {
            case 'abort': return 'bg-rose-50 border-rose-200 text-rose-900';
            case 'error': return 'bg-rose-100 border-rose-300 text-rose-900';
            case 'commit': return 'bg-emerald-50 border-emerald-200 text-emerald-900';
            case 'wait':
            case 'wait_persist': return 'bg-amber-50 border-amber-200 text-amber-900 border-dashed';
            case 'resume': return 'bg-emerald-50/50 border-emerald-200 text-emerald-700 border-dashed';
            default: return `bg-white border-slate-200 text-slate-700`; // Default read/write
        }
    };

    const getIcon = () => {
        switch (step.type) {
            case 'write': return <div className={`text-[10px] font-black text-${theme}-600`}>WR</div>;
            case 'read': return <div className={`text-[10px] font-black text-${theme}-600`}>RD</div>;
            case 'abort': return <XCircle className="w-5 h-5 text-rose-500" />;
            case 'error': return <AlertTriangle className="w-5 h-5 text-rose-600" />;
            case 'commit': return <CheckCircle className="w-5 h-5 text-emerald-500" />;
            case 'wait':
            case 'wait_persist': return <Lock className="w-4 h-4 text-amber-500" />;
            case 'resume': return <ShieldCheck className="w-4 h-4 text-emerald-500" />;
            default: return null;
        }
    };

    return (
        <div className={`
      relative w-56 p-3 rounded-xl border-2 shadow-sm transition-all duration-700 group
      ${getStyles()}
      ${isLatest ? 'scale-105 shadow-xl ring-4 ring-indigo-50/50 z-20' : 'scale-100 z-10'}
      ${step.dirty ? 'ring-2 ring-amber-400 ring-offset-2' : ''}
    `}>
            {/* Connector Node on Thread */}
            <div className={`absolute -top-3 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-4 border-white shadow-sm z-30
         ${isLatest ? 'bg-indigo-500' : 'bg-slate-300'}
      `}></div>

            <div className="flex items-start gap-3">
                <div className={`
           w-10 h-10 rounded-lg flex items-center justify-center shadow-inner shrink-0
           ${step.type === 'error' || step.type === 'abort' ? 'bg-rose-100' : 'bg-slate-50'}
        `}>
                    {getIcon()}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                        <div className="text-[10px] font-bold uppercase opacity-50 tracking-wider">{step.op}</div>
                        {step.var && (
                            <div className="text-[10px] font-mono bg-slate-100 px-1.5 rounded text-slate-500">
                                MEM: 0x{step.var.charCodeAt(0).toString(16)}
                            </div>
                        )}
                    </div>

                    {step.var ? (
                        <div className="font-mono font-bold text-lg leading-none flex items-center gap-2">
                            {step.var}
                            <ArrowRight className="w-3 h-3 text-slate-300" />
                            <span className={step.dirty ? 'text-amber-600' : ''}>{step.val}</span>
                            {step.prev && (
                                <span className="text-[10px] text-slate-400 line-through decoration-rose-400 decoration-2 ml-1 opacity-50">
                                    {step.prev}
                                </span>
                            )}
                        </div>
                    ) : (
                        <div className="text-sm font-bold truncate">{step.type.toUpperCase()}</div>
                    )}
                </div>
            </div>

            {/* Warnings */}
            {step.dirty && (
                <div className="absolute -right-2 -top-2 bg-amber-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-lg animate-bounce">
                    DIRTY
                </div>
            )}
            {step.cascade && (
                <div className="absolute -right-2 -top-2 bg-rose-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-lg">
                    FAIL
                </div>
            )}
        </div>
    );
};

const FluidDependency = ({ fromTx, toTx, type }) => {
    const isRight = toTx > fromTx;
    const isCascade = type === 'cascade';
    const color = isCascade ? '#f43f5e' : '#f59e0b'; // Rose-500 or Amber-500

    

    return (
        <div className={`absolute top-1/2 -z-10 pointer-events-none h-24 -mt-12 flex items-center justify-center
      ${isRight ? 'left-1/2 w-[140%]' : 'right-1/2 w-[140%]'}
    `}>
          
            <svg
                width="100%"
                height="100%"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 overflow-visible"
            >
                <path
                    d={isRight
                        ? "M 0,50 C 30,50 30,80 50,80 S 70,50 100,50"
                        : "M 100,50 C 70,50 70,80 50,80 S 30,50 0,50"
                    }
                    fill="none"
                    stroke={color}
                    strokeWidth="3"
                    strokeDasharray={isCascade ? "8,4" : ""}
                    vectorEffect="non-scaling-stroke" 
                    className="drop-shadow-sm"
                >
                    <animate attributeName="stroke-dashoffset" from="100" to="0" dur="1s" fill="freeze" />
                </path>
            </svg>

           
            <div className={`absolute top-1/2 -translate-y-1/2 ${isRight ? '-right-1' : '-left-1'}`}>
                <svg width="12" height="12" viewBox="0 0 10 10" className={isRight ? '' : 'rotate-180'}>
                    <path d="M 0,0 L 10,5 L 0,10" fill={color} />
                </svg>
            </div>

            <div className="absolute top-[60%] left-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className={`
            flex items-center justify-center px-2 py-1 rounded shadow-sm border backdrop-blur-sm
            ${isCascade ? 'bg-rose-50/90 border-rose-200 text-rose-600' : 'bg-amber-50/90 border-amber-200 text-amber-600'}
         `}>
                    <span className="text-[9px] font-bold whitespace-nowrap tracking-wider leading-none">
                        {isCascade ? 'CASCADE' : 'DIRTY READ'}
                    </span>
                </div>
            </div>
        </div>
    );
};



// --- Logic ---
const getCurrentState = (steps, currentStep) => {
    let x = 50;
    let y = 50;
    let dirtyX = false;
    let dirtyY = false;

    const abortedTxs = new Set();
    const committedTxs = new Set();

    for (let i = 1; i <= currentStep; i++) {
        const s = steps[i];
        if (s.type === 'abort') abortedTxs.add(s.tx);
        if (s.type === 'commit') committedTxs.add(s.tx);
    }

    for (let i = 1; i <= currentStep; i++) {
        const s = steps[i];

        let hasAbortedYet = false;
        for (let j = 1; j <= currentStep; j++) {
            if (steps[j].tx === s.tx && steps[j].type === 'abort' && j >= i) hasAbortedYet = true;
        }

        if (s.type === 'write') {
            if (!hasAbortedYet) {
                if (s.var === 'X') { x = s.val; dirtyX = !committedTxs.has(s.tx); }
                if (s.var === 'Y') { y = s.val; dirtyY = !committedTxs.has(s.tx); }
            } else {
                if (s.var === 'X') { x = 50; dirtyX = false; }
                if (s.var === 'Y') { y = 50; dirtyY = false; }
            }
        }

        // Explicit Rollback
        if (s.type === 'abort') {
            if (s.tx === 1) { x = 50; dirtyX = false; }
            // T2/T3 aborts don't change data back to 50 explicitly here because they read dirty data, 
            // but in this sim we just revert the variables they touched if needed.
        }
    }
    return { x, y, dirtyX, dirtyY };
};

export default TransactionSimulation;