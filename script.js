let processes = [];

// High-visibility dynamic color profiles
const colorPalette = [
    '#bfdbfe', '#bbf7d0', '#fef08a', '#fed7aa', '#fbcfe8', 
    '#c7d2fe', '#a5f3fc', '#fde2e4', '#e2ece9', '#chcbd9'
];

// Map a deterministic color based on the Process index or identification string
function getColor(index) {
    return colorPalette[index % colorPalette.length];
}

// DOM Elements
const algoSelect = document.getElementById('algo');
const tqGroup = document.getElementById('tq-group');
const priorityGroup = document.getElementById('priority-group');
const processForm = document.getElementById('process-form');
const inputTbody = document.getElementById('input-tbody');
const simulateBtn = document.getElementById('simulate-btn');
const clearBtn = document.getElementById('clear-btn');
const outputSection = document.getElementById('output-section');
const ganttChart = document.getElementById('gantt-chart');
const resultTbody = document.getElementById('result-tbody');
const avgTatSpan = document.getElementById('avg-tat');
const avgWtSpan = document.getElementById('avg-wt');

// Toggle fields conditionally based on algorithm selection
algoSelect.addEventListener('change', () => {
    const algo = algoSelect.value;
    tqGroup.style.display = (algo === 'rr') ? 'block' : 'none';
    const showPriority = (algo === 'priority-np' || algo === 'priority-p');
    priorityGroup.style.display = showPriority ? 'block' : 'none';
    document.querySelectorAll('.priority-col').forEach(el => {
        el.style.display = showPriority ? '' : 'none';
    });
    renderInputTable();
});

// Load Prepackaged Interactive Presets
function loadPreset(type) {
    processes = [];
    if (type === 'standard') {
        processes = [
            { pid: 'P1', at: 0, bt: 6, priority: 3 },
            { pid: 'P2', at: 1, bt: 4, priority: 1 },
            { pid: 'P3', at: 2, bt: 2, priority: 4 },
            { pid: 'P4', at: 3, bt: 5, priority: 2 }
        ];
    } else if (type === 'convoy') {
        processes = [
            { pid: 'P1', at: 0, bt: 30, priority: 1 },
            { pid: 'P2', at: 1, bt: 2, priority: 2 },
            { pid: 'P3', at: 2, bt: 1, priority: 3 }
        ];
        algoSelect.value = 'fcfs';
        algoSelect.dispatchEvent(new Event('change'));
    } else if (type === 'preemptive') {
        processes = [
            { pid: 'P1', at: 0, bt: 8, priority: 3 },
            { pid: 'P2', at: 1, bt: 4, priority: 1 },
            { pid: 'P3', at: 2, bt: 9, priority: 4 },
            { pid: 'P4', at: 3, bt: 5, priority: 2 }
        ];
        algoSelect.value = 'srtf';
        algoSelect.dispatchEvent(new Event('change'));
    }
    renderInputTable();
    simulateBtn.click(); // Auto execute for fast feedback loop
}

processForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const pid = document.getElementById('pid').value.trim();
    const at = parseInt(document.getElementById('at').value);
    const bt = parseInt(document.getElementById('bt').value);
    const priority = parseInt(document.getElementById('priority').value) || 0;

    if(processes.some(p => p.pid === pid)) {
        alert("Process ID must be unique!");
        return;
    }

    processes.push({ pid, at, bt, priority });
    renderInputTable();
    
    // Auto increment Process entry hint text helper
    document.getElementById('pid').value = 'P' + (processes.length + 1);
    document.getElementById('at').value = at + 1; 
});

function removeProcess(index) {
    processes.splice(index, 1);
    renderInputTable();
}

function renderInputTable() {
    inputTbody.innerHTML = '';
    const algo = algoSelect.value;
    const showPriority = (algo === 'priority-np' || algo === 'priority-p');

    processes.forEach((p, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="color-badge" style="background-color: ${getColor(idx)};"></span></td>
            <td><strong>${p.pid}</strong></td>
            <td>${p.at}</td>
            <td>${p.bt}</td>
            ${showPriority ? `<td>${p.priority}</td>` : ''}
            <td><button type="button" class="btn-danger" style="padding: 4px 10px; font-size:0.8rem;" onclick="removeProcess(${idx})">Delete</button></td>
        `;
        inputTbody.appendChild(tr);
    });
}

clearBtn.addEventListener('click', () => {
    processes = [];
    renderInputTable();
    outputSection.style.display = 'none';
    document.getElementById('pid').value = 'P1';
    document.getElementById('at').value = '0';
});

simulateBtn.addEventListener('click', () => {
    if (processes.length === 0) {
        alert("Add some processes first!");
        return;
    }
    
    const algo = algoSelect.value;
    let results = [];
    let timeline = [];
    let localData = processes.map((p, index) => ({
        ...p, 
        remainingBt: p.bt, 
        started: false, 
        responseTime: -1, 
        colorIndex: index
    }));

    switch(algo) {
        case 'fcfs': ({ results, timeline } = solveFCFS(localData)); break;
        case 'sjf':  ({ results, timeline } = solveSJF(localData)); break;
        case 'srtf': ({ results, timeline } = solveSRTF(localData)); break;
        case 'priority-np': ({ results, timeline } = solvePriorityNP(localData)); break;
        case 'priority-p':  ({ results, timeline } = solvePriorityP(localData)); break;
        case 'rr':
            const tq = parseInt(document.getElementById('time-quantum').value) || 2;
            ({ results, timeline } = solveRR(localData, tq));
            break;
        case 'hrrn': ({ results, timeline } = solveHRRN(localData)); break;
    }
    renderOutputs(results, timeline);
});

function compressTimeline(timeline) {
    if(timeline.length === 0) return [];
    let compressed = [timeline[0]];
    for(let i = 1; i < timeline.length; i++) {
        let last = compressed[compressed.length - 1];
        if(last.pid === timeline[i].pid) {
            last.end = timeline[i].end;
        } else {
            compressed.push(timeline[i]);
        }
    }
    return compressed;
}

// --- ALGORITHMS CORNER ---
function solveFCFS(data) {
    data.sort((a,b) => a.at - b.at);
    let currentTime = 0, timeline = [];
    data.forEach(p => {
        if(currentTime < p.at) {
            timeline.push({ pid: 'Idle', start: currentTime, end: p.at, color: '#f3f4f6' });
            currentTime = p.at;
        }
        let start = currentTime;
        p.rt = start - p.at;
        currentTime += p.bt;
        p.ct = currentTime;
        p.tat = p.ct - p.at;
        p.wt = p.tat - p.bt;
        timeline.push({ pid: p.pid, start, end: p.ct, color: getColor(p.colorIndex) });
    });
    return { results: data, timeline };
}

function solveSJF(data) {
    let currentTime = 0, completed = 0, n = data.length;
    let timeline = [], results = [], isCompleted = new Array(n).fill(false);

    while(completed < n) {
        let idx = -1, minBt = Infinity;
        for(let i=0; i<n; i++) {
            if(data[i].at <= currentTime && !isCompleted[i] && data[i].bt < minBt) {
                minBt = data[i].bt; idx = i;
            }
        }
        if(idx === -1) {
            let nextArrival = Infinity;
            for(let i=0; i<n; i++) { if(!isCompleted[i] && data[i].at < nextArrival) nextArrival = data[i].at; }
            timeline.push({ pid: 'Idle', start: currentTime, end: nextArrival, color: '#f3f4f6' });
            currentTime = nextArrival; continue;
        }
        let p = data[idx];
        p.rt = currentTime - p.at;
        let start = currentTime;
        currentTime += p.bt;
        p.ct = currentTime; p.tat = p.ct - p.at; p.wt = p.tat - p.bt;
        timeline.push({ pid: p.pid, start, end: p.ct, color: getColor(p.colorIndex) });
        isCompleted[idx] = true; results.push(p); completed++;
    }
    return { results, timeline };
}

function solveSRTF(data) {
    let currentTime = 0, completed = 0, n = data.length, timeline = [];
    let isCompleted = new Array(n).fill(false);
    while(completed < n) {
        let idx = -1, minRemaining = Infinity;
        for(let i=0; i<n; i++) {
            if(data[i].at <= currentTime && !isCompleted[i] && data[i].remainingBt < minRemaining) {
                minRemaining = data[i].remainingBt; idx = i;
            }
        }
        if(idx === -1) {
            timeline.push({ pid: 'Idle', start: currentTime, end: currentTime + 1, color: '#f3f4f6' });
            currentTime++; continue;
        }
        let p = data[idx];
        if(!p.started) { p.rt = currentTime - p.at; p.started = true; }
        timeline.push({ pid: p.pid, start: currentTime, end: currentTime + 1, color: getColor(p.colorIndex) });
        p.remainingBt--; currentTime++;
        if(p.remainingBt === 0) {
            p.ct = currentTime; p.tat = p.ct - p.at; p.wt = p.tat - p.bt;
            isCompleted[idx] = true; completed++;
        }
    }
    return { results: data, timeline: compressTimeline(timeline) };
}

function solvePriorityNP(data) {
    let currentTime = 0, completed = 0, n = data.length, timeline = [], results = [], isCompleted = new Array(n).fill(false);
    while(completed < n) {
        let idx = -1, highestPriority = Infinity;
        for(let i=0; i<n; i++) {
            if(data[i].at <= currentTime && !isCompleted[i]) {
                if(data[i].priority < highestPriority || (data[i].priority === highestPriority && data[i].at < (idx !== -1 ? data[idx].at : Infinity))) {
                    highestPriority = data[i].priority; idx = i;
                }
            }
        }
        if(idx === -1) {
            let nextArrival = Infinity;
            for(let i=0; i<n; i++) { if(!isCompleted[i] && data[i].at < nextArrival) nextArrival = data[i].at; }
            timeline.push({ pid: 'Idle', start: currentTime, end: nextArrival, color: '#f3f4f6' });
            currentTime = nextArrival; continue;
        }
        let p = data[idx];
        p.rt = currentTime - p.at;
        let start = currentTime; currentTime += p.bt;
        p.ct = currentTime; p.tat = p.ct - p.at; p.wt = p.tat - p.bt;
        timeline.push({ pid: p.pid, start, end: p.ct, color: getColor(p.colorIndex) });
        isCompleted[idx] = true; results.push(p); completed++;
    }
    return { results, timeline };
}

function solvePriorityP(data) {
    let currentTime = 0, completed = 0, n = data.length, timeline = [], isCompleted = new Array(n).fill(false);
    while(completed < n) {
        let idx = -1, highestPriority = Infinity;
        for(let i=0; i<n; i++) {
            if(data[i].at <= currentTime && !isCompleted[i]) {
                if(data[i].priority < highestPriority || (data[i].priority === highestPriority && data[i].at < (idx !== -1 ? data[idx].at : Infinity))) {
                    highestPriority = data[i].priority; idx = i;
                }
            }
        }
        if(idx === -1) {
            timeline.push({ pid: 'Idle', start: currentTime, end: currentTime + 1, color: '#f3f4f6' });
            currentTime++; continue;
        }
        let p = data[idx];
        if(!p.started) { p.rt = currentTime - p.at; p.started = true; }
        timeline.push({ pid: p.pid, start: currentTime, end: currentTime + 1, color: getColor(p.colorIndex) });
        p.remainingBt--; currentTime++;
        if(p.remainingBt === 0) {
            p.ct = currentTime; p.tat = p.ct - p.at; p.wt = p.tat - p.bt;
            isCompleted[idx] = true; completed++;
        }
    }
    return { results: data, timeline: compressTimeline(timeline) };
}

function solveRR(data, quantum) {
    data.sort((a,b) => a.at - b.at);
    let currentTime = data[0].at, timeline = [], queue = [], results = [], n = data.length;
    let isCompleted = new Array(n).fill(false), inQueue = new Array(n).fill(false);

    if(currentTime > 0) timeline.push({ pid: 'Idle', start: 0, end: currentTime, color: '#f3f4f6' });
    queue.push(0); inQueue[0] = true;

    while(queue.length > 0) {
        let idx = queue.shift(); let p = data[idx];
        if(!p.started) { p.rt = currentTime - p.at; p.started = true; }

        let slice = Math.min(p.remainingBt, quantum);
        timeline.push({ pid: p.pid, start: currentTime, end: currentTime + slice, color: getColor(p.colorIndex) });
        currentTime += slice; p.remainingBt -= slice;

        for(let i=0; i<n; i++) {
            if(data[i].at <= currentTime && !isCompleted[i] && !inQueue[i] && i !== idx) {
                queue.push(i); inQueue[i] = true;
            }
        }
        if(p.remainingBt === 0) {
            p.ct = currentTime; p.tat = p.ct - p.at; p.wt = p.tat - p.bt;
            isCompleted[idx] = true; results.push(p);
        } else {
            queue.push(idx);
        }

        if(queue.length === 0 && results.length < n) {
            let nextArrivalIdx = -1, nextArrivalTime = Infinity;
            for(let i=0; i<n; i++) {
                if(!isCompleted[i] && data[i].at < nextArrivalTime) { nextArrivalTime = data[i].at; nextArrivalIdx = i; }
            }
            if(nextArrivalIdx !== -1) {
                timeline.push({ pid: 'Idle', start: currentTime, end: nextArrivalTime, color: '#f3f4f6' });
                currentTime = nextArrivalTime; queue.push(nextArrivalIdx); inQueue[nextArrivalIdx] = true;
            }
        }
    }
    return { results, timeline: compressTimeline(timeline) };
}

function solveHRRN(data) {
    let currentTime = 0, completed = 0, n = data.length, timeline = [], results = [], isCompleted = new Array(n).fill(false);
    while(completed < n) {
        let idx = -1, maxHrrn = -1;
        for(let i=0; i<n; i++) {
            if(data[i].at <= currentTime && !isCompleted[i]) {
                let ratio = ((currentTime - data[i].at) + data[i].bt) / data[i].bt;
                if(ratio > maxHrrn) { maxHrrn = ratio; idx = i; }
            }
        }
        if(idx === -1) {
            let nextArrival = Infinity;
            for(let i=0; i<n; i++) { if(!isCompleted[i] && data[i].at < nextArrival) nextArrival = data[i].at; }
            timeline.push({ pid: 'Idle', start: currentTime, end: nextArrival, color: '#f3f4f6' });
            currentTime = nextArrival; continue;
        }
        let p = data[idx];
        p.rt = currentTime - p.at;
        let start = currentTime; currentTime += p.bt;
        p.ct = currentTime; p.tat = p.ct - p.at; p.wt = p.tat - p.bt;
        timeline.push({ pid: p.pid, start, end: p.ct, color: getColor(p.colorIndex) });
        isCompleted[idx] = true; results.push(p); completed++;
    }
    return { results, timeline };
}

// --- RENDER OUTPUT HANDLERS ---
function renderOutputs(results, timeline) {
    outputSection.style.display = 'block';
    ganttChart.innerHTML = '';
    resultTbody.innerHTML = '';

    // Render animated Gantt Timeline
    timeline.forEach((block) => {
        const blockDiv = document.createElement('div');
        blockDiv.className = `gantt-block ${block.pid === 'Idle' ? 'idle' : ''}`;
        blockDiv.style.flexGrow = block.end - block.start;
        blockDiv.style.backgroundColor = block.color;

        blockDiv.innerHTML = `
            <span>${block.pid}</span>
            <span class="gantt-time start">${block.start}</span>
            <span class="gantt-time end">${block.end}</span>
        `;
        ganttChart.appendChild(blockDiv);
    });

    const algo = algoSelect.value;
    const showPriority = (algo === 'priority-np' || algo === 'priority-p');
    let totalTat = 0, totalWt = 0;

    results.sort((a,b) => a.pid.localeCompare(b.pid));
    results.forEach(p => {
        totalTat += p.tat; totalWt += p.wt;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="color-badge" style="background-color: ${getColor(p.colorIndex)};"></span></td>
            <td><strong>${p.pid}</strong></td>
            <td>${p.at}</td>
            <td>${p.bt}</td>
            ${showPriority ? `<td>${p.priority}</td>` : ''}
            <td>${p.ct}</td>
            <td>${p.tat}</td>
            <td>${p.wt}</td>
            <td>${p.rt}</td>
        `;
        resultTbody.appendChild(tr);
    });

    avgTatSpan.innerText = (totalTat / results.length).toFixed(2);
    avgWtSpan.innerText = (totalWt / results.length).toFixed(2);
    
    // Smooth scrolling animation focus down to results
    outputSection.scrollIntoView({ behavior: 'smooth' });
}

// Initialize template default hints on startup
document.getElementById('pid').value = 'P1';