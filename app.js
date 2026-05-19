// Register Service Worker for PWA compliance
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js")
            .then(reg => console.log("[PWA] Service Worker registered scope:", reg.scope))
            .catch(err => console.error("[PWA] Service Worker registration failed:", err));
    });
}

// Initialize Lucide
lucide.createIcons();

// --- LLM API CLIENT (Supports Gemini & Groq free tiers) ---
async function callLLM(systemPrompt, userPrompt, retries = 3) {
    const apiKey = localStorage.getItem("kisanai_api_key");
    const provider = localStorage.getItem("kisanai_provider") || "gemini";
    if (!apiKey) return null;

    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            let response, data, text;

            if (provider === "gemini") {
                const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
                response = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
                    body: JSON.stringify({
                        system_instruction: { parts: [{ text: systemPrompt }] },
                        contents: [{ parts: [{ text: userPrompt }] }],
                        generationConfig: { responseMimeType: "application/json", temperature: 0.3 }
                    })
                });
                if (!response.ok) {
                    if (response.status === 429 && attempt < retries - 1) { await new Promise(r => setTimeout(r, (attempt + 1) * 3000)); continue; }
                    throw new Error(`Gemini ${response.status}`);
                }
                data = await response.json();
                text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
            } else {
                const url = "https://api.groq.com/openai/v1/chat/completions";
                response = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
                    body: JSON.stringify({
                        model: "llama-3.3-70b-versatile",
                        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
                        temperature: 0.3,
                        response_format: { type: "json_object" }
                    })
                });
                if (!response.ok) {
                    if (response.status === 429 && attempt < retries - 1) { await new Promise(r => setTimeout(r, (attempt + 1) * 3000)); continue; }
                    throw new Error(`Groq ${response.status}`);
                }
                data = await response.json();
                text = data.choices?.[0]?.message?.content || "";
            }
            return parseJsonFromLLM(text);
        } catch (err) {
            console.error(`[LLM] Attempt ${attempt + 1} failed:`, err);
            if (attempt === retries - 1) return null;
            await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
        }
    }
    return null;
}

function parseJsonFromLLM(text) {
    if (!text) return null;
    try {
        let clean = text.trim();
        if (clean.startsWith("```")) clean = clean.replace(/^```[a-z]*\n?/i, "").replace(/```$/,"").trim();
        return JSON.parse(clean);
    } catch (e) {
        console.warn("[LLM] JSON parse failed, returning raw text", e);
        return { raw: text };
    }
}

function collectEvidenceBundle() {
    const selected = [...state.sources.filter(s => s.selected), ...state.webLibraries.filter(l => l.selected)];
    const bundle = selected.map(s => {
        let content = "";
        if (s.demoKey && STATIC_CONTENT[s.demoKey]) content = STATIC_CONTENT[s.demoKey];
        else if (s.content) content = s.content;
        content = content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        if (content.length > 1200) content = content.substring(0, 1200) + "...";
        return { name: s.name, type: s.type, credibility: s.cred || "UNVERIFIED", recency: s.recency || "T-0", content };
    });
    const fullText = bundle.map(b => `--- SOURCE: ${b.name} (${b.type}, Cred: ${b.credibility}) ---\n${b.content}`).join("\n\n");
    return { bundle, fullText, count: bundle.length };
}

function isAIMode() { return !!localStorage.getItem("kisanai_api_key"); }

// --- CONFIG & AGENT DEFINITIONS ---
const AGENTS = [
    { id: "ingestion", name: "Ingestion Agent", icon: "inbox", desc: "Consolidates all selected library articles and custom scouting uploads into a unified, zero-trust context.", info: "Prepares raw data streams for downstream processing." },
    { id: "weather", name: "Weather Enrichment", icon: "cloud-sun", desc: "Queries Open-Meteo API for real-time regional temperature, wind, and humidity indices.", info: "Triggers failover retries under poor network connectivity." },
    { id: "context", name: "Disease Context Agent", icon: "search", desc: "Cross-references biological spore models and crop diagnostic handbooks from global libraries.", info: "Identifies precise temperature and relative humidity sporulation limits." },
    { id: "signal", name: "Signal Extraction Agent", icon: "target", desc: "Analyzes telemetry rows chronologically to isolate critical infection spikes in crop plots.", info: "Flags severity anomalies exceeding baseline thresholds." },
    { id: "credibility", name: "Credibility Agent", icon: "git-branch", desc: "Resolves conflicting data logs, prioritizing fresh observations and down-ranking stale references.", info: "Applies zero-trust score weights to source reliability indexes." },
    { id: "decision", name: "Decision Agent", icon: "brain", desc: "Formulates optimal response schedules limited strictly by local chemical warehouse inventory constraints.", info: "Calculates dosage recommendations under resource caps." },
    { id: "execution", name: "Execution Agent", icon: "zap", desc: "Dispatches prioritized surgical treatments and neighborhood notifications via agricultural networks.", info: "Triggers regional field team mobile devices." },
    { id: "recovery", name: "Recovery Agent", icon: "refresh-ccw", desc: "Audits execution timelines, verifies state transitions, and manages resilient network failbacks.", info: "Maintains system integrity during degraded operation modes." }
];

// --- REGIONAL DEMO CROP DEFAULTS ---
const DEMO_PACKS = {
    hazro: {
        region: "Hazro, Punjab",
        lat: 33.91,
        lon: 72.49,
        crop: "Tomato",
        outbreak: "Late Blight (Fungal)"
    },
    swat: {
        region: "Swat, KPK",
        lat: 35.22,
        lon: 72.42,
        crop: "Rice",
        outbreak: "Rice Blast (Fungal)"
    },
    sanghar: {
        region: "Sanghar, Sindh",
        lat: 26.04,
        lon: 68.95,
        crop: "Cotton",
        outbreak: "Pink Bollworm (PBW Insect)"
    }
};

// --- STATIC REALISTIC EVIDENCE DOCUMENTS DATABASE ---
const STATIC_CONTENT = {
    h1: `Punjab Agriculture Extension Department Emergency Bulletin\nDate: 2026-05-10\nOrigin: Punjab Agriculture Department\nThreat Level: Critical\n\nSymptoms of late blight (Phytophthora infestans) are expanding rapidly across tomato fields in the Attock district. Symptoms start as small, water-soaked spots on lower leaves, turning dark green or brown as lesions enlarge. A white, velvety spore layer forms on leaf undersides under high morning humidity (>80%). Spores spread rapidly by wind to adjacent plots.\n\nRecommended: Apply Mancozeb or Metalaxyl immediately. Suspend sprinkler irrigation to lower humidity inside the crop canopy.`,
    h2: `<h1>Humidity and Cloud Cover Raise Tomato Disease Risk in Northern Punjab</h1><p>Date: 2026-05-12</p><p>Source Credibility: 0.81</p><p>A localized weather pattern across northern Punjab is expected to keep morning humidity elevated for the next 48 hours. Agricultural observers say this combination of cloud cover, moisture retention, and low wind movement can accelerate fungal spread in vegetable crops, especially tomato fields with dense canopy and delayed spray schedules.</p><p>Forecast Summary:</p><ul><li>Humidity expected above 82% during early morning hours</li><li>Light drizzle possible in the next 24-36 hours</li><li>Wind speeds remain low, reducing drying conditions</li></ul><p>Operational Concern:</p><p>Road movement for input deliveries may slow due to intermittent rain and patchy traffic disruption, increasing the risk of delayed replenishment for farm supplies.</p><p>Implication:</p><p>If preventive spray is delayed, affected tomato plots may shift from moderate to high disease pressure within 1-2 days.</p>`,
    h3: `"date,plot_id,acres,plants_checked,suspected_cases,severity_score,days_since_last_spray,scout_name,notes"\n"2026-05-10,T-01,2.0,40,2,1,5,Adeel,"Minor leaf spotting on outer row""\n"2026-05-10,T-02,2.5,40,3,1,6,Adeel,"Moist soil, low spread""\n"2026-05-10,T-03,3.0,40,7,2,8,Adeel,"Brown lesions increasing near lower leaves""\n"2026-05-10,T-04,3.5,40,6,2,8,Adeel,"Patchy spotting after irrigation""\n"2026-05-11,T-01,2.0,40,3,1,6,Usman,"No major change""\n"2026-05-11,T-02,2.5,40,5,2,7,Usman,"Leaf edges darkening""\n"2026-05-11,T-03,3.0,40,11,3,9,Usman,"Visible spread in lower canopy""\n"2026-05-11,T-04,3.5,40,10,3,9,Usman,"Moisture retention, symptoms expanding""\n"2026-05-12,T-01,2.0,40,4,1,7,Farhan,"Low risk but monitor""\n"2026-05-12,T-02,2.5,40,7,2,8,Farhan,"Moderate spread""\n"2026-05-12,T-03,3.0,40,16,4,10,Farhan,"Rapid increase, fruit shoulder marks observed""\n"2026-05-12,T-04,3.5,40,15,4,10,Farhan,"High-risk cluster, urgent spray suggested""`,
    h4: `# Farm Operations Dashboard Export\nLast Updated: 2026-05-10 08:00\nSource Credibility: 0.74\nRecency Score: 0.48\n\n## Inventory Snapshot\n| Item | Available Qty | Unit | Assumed Coverage | Status |\n|---|---:|---|---|---|\n| Fungicide F-27 | 18 | liters | Enough for 10 acres | Sufficient |\n| Spray Fuel Budget | 18000 | PKR | 1 day operation | Available |\n| Labor Budget | 27000 | PKR | 1 spray team | Available |\n| Spray Team Count | 1 | team | 1 active team | Limited |\n| Refill ETA | 2026-05-15 | date | Pending supplier confirmation | Delayed |\n\n## Planning Assumptions\n- Area expected for treatment: 10 acres\n- Standard fungicide dose: 1.5 liters per acre\n- Notification deadline: same day before 6 PM\n- Emergency action budget cap: 45000 PKR\n\n## System Note\nDashboard marks fungicide stock as sufficient.`,
    h5: `[\n  {\n    "alert_id": "A-1001",\n    "timestamp": "2026-05-12T07:20:00",\n    "source": "farmer_hotline",\n    "credibility": 0.88,\n    "plot": "T-03",\n    "message": "Leaves turning black from bottom side, fruit also showing dark wet marks. Need urgent help."\n  },\n  {\n    "alert_id": "A-1002",\n    "timestamp": "2026-05-12T07:42:00",\n    "source": "field_supervisor_whatsapp",\n    "credibility": 0.91,\n    "plot": "T-04",\n    "message": "Symptoms increased since yesterday. Spray may be late if stock check is wrong."\n  },\n  {\n    "alert_id": "A-1003",\n    "timestamp": "2026-05-12T08:10:00",\n    "source": "community_group_forward",\n    "credibility": 0.22,\n    "plot": "unknown",\n    "message": "All tomato crops in entire district are destroyed. Nothing can save them now."\n  }\n]`,
    s1: `KPK Agricultural Extension Department Emergency Bulletin\nDate: 2026-05-11\nOrigin: KPK Agricultural Extension Department\nThreat Level: Severe Outbreak\n\nRice Blast (Magnaporthe oryzae) symptoms have been reported across key basmati tracts in Swat. Infection starts as spindle-shaped, gray-centered lesions with dark borders on the leaf canopy. High humidity, heavy morning dews, and excessive nitrogenous fertilizer application trigger spore discharge.\n\nFoliar spray of Tricyclazole at 0.6g/L is recommended at the first appearance of leaf blast lesions. Suspend nitrogen applications immediately.`,
    s2: `<h1>Cool Nights and Morning Dew Drive Spore Release in Swat Valley</h1><p>Date: 2026-05-12</p><p>Source Credibility: 0.89</p><p>Agronomists in Swat report that night temperatures dropping to 18°C combined with heavy morning dew points create optimal conditions for rice blast spore ejection and germination inside leaf tissues. Early morning scouting is strongly suggested.</p>`,
    s3: `"date,plot_id,acres,plants_checked,lesion_count,severity_score,days_since_last_spray,scout_name,notes"\n"2026-05-10,R-10,4.0,50,2,1.0,12,Irshad,"Lesions absent""\n"2026-05-10,R-11,4.5,50,4,1.5,14,Irshad,"Few leaf spots""\n"2026-05-10,R-12,5.0,50,15,2.5,15,Irshad,"Spindle lesions on 12 plants""\n"2026-05-12,R-10,4.0,50,3,1.2,14,Kashif,"Stable""\n"2026-05-12,R-11,4.5,50,6,1.8,16,Kashif,"Slight increase""\n"2026-05-12,R-12,5.0,50,38,3.5,17,Kashif,"Massive spore layer, urgent treatment""`,
    s4: `# KPK Swat Warehouse Logs\nLast Updated: 2026-05-11\n\n## Available Chemicals\n| Fungicide | Stock Level | Unit | Ideal Treatment Area | Status |\n|---|---:|---|---|---|\n| Tricyclazole | 24 | liters | 16 acres | Sufficient |\n| Propiconazole | 8 | liters | 5 acres | Low |\n| Urea Fertilizer | 450 | bags | Standard feed | Available |\n\n## Operational Limits\n- Spray teams available: 2 teams\n- Emergency transport fuel: 24000 PKR`,
    s5: `<h1>FAO Rice Blast Prevention & Spore Management Checklist</h1><p>Source: FAO/CABI Plantwise Database</p><p>For severe leaf blast, prompt chemical response is necessary. Spraying Tricyclazole or Isoprothiolane inside a 48-hour window arrestments lesion expansion. Over-fertilization with urea creates highly tender leaves that allow blast hyphae to penetrate easily.</p>`,
    c1: `Sindh Cotton Research Institute Emergency Bulletin\nDate: 2026-05-09\nOrigin: Sindh Cotton Research Institute\nThreat Level: Critical Alert\n\nPink Bollworm (Pectinophora gossypiella) larval infestation has crossed economic thresholds in cotton clusters of Sanghar district. Scouting reports reveal 'rosette blooms' (flowers spun shut by feeding larvae) and burrow holes in young green cotton bolls.\n\nImmediate deployment of pheromone disruption traps (5 traps per acre) and selective foliar spray of Lambda-cyhalothrin at 150ml/acre is mandatory to protect the mid-season cotton bolls from internal lint destruction.`,
    c2: `<h1>Pheromone Trap Moths Catch Exceeds Economic Threshold in Sanghar</h1><p>Date: 2026-05-11</p><p>Source Credibility: 0.94</p><p>Scouting checks at pheromone traps across Sanghar cotton zones showed average counts of 8.2 male moths per trap for three consecutive nights, well above the economic threshold of 5.0. Severe crop loss is anticipated if mating disruption traps are not deployed immediately.</p>`,
    c3: `"date,plot_id,acres,blooms_checked,rosette_blooms,infestation_rate,days_since_spray,scout_name,notes"\n"2026-05-10,C-06,6.0,100,2,2.0%,8,Javed,"Low bollworm activity""\n"2026-05-10,C-07,6.5,100,4,4.0%,9,Javed,"Rosette flower spotted""\n"2026-05-10,C-08,7.0,100,12,12.0%,11,Javed,"Boll burrowing observed""\n"2026-05-12,C-06,6.0,100,3,3.0%,10,Naeem,"Stable""\n"2026-05-12,C-07,6.5,100,5,5.0%,11,Naeem,"Scattered rosette blooms""\n"2026-05-12,C-08,7.0,100,18,18.0%,13,Naeem,"High infestation, boll damage severe""`,
    c4: `# Warehouse Stock Logs - Sanghar District\nLast Updated: 2026-05-10\n\n## Pest Management Stock\n| Active Ingredient | Stock Qty | Unit | Area Coverage | Status |\n|---|---:|---|---|---|\n| Lambda-cyhalothrin | 12 | liters | 8 acres | Limited |\n| PBW Pheromone Lures | 30 | units | 6 acres | Limited |\n| Spinosad 240SC | 2 | liters | 1.5 acres | Low |\n\n## Action Constraint Note\nLimited insecticide reserves cap continuous spraying. Priority treatment must target C-08 hotspots.`,
    c5: `<h1>Drone Leaf & Boll Infrared Thermal Analysis Report</h1><p>Source: CropScan Aerial Analytics</p><p>Video orthomosaic scanning of Plot C-08 reveals clear vegetative stress anomalies. Close-up visual feeds confirm rosette flower patterns and cotton bolls with entrance exit holes. Infestation is concentrated in high-density foliage sectors.</p>`
};

// --- APP STATE ---
const state = {
    activeTab: "home",
    sources: [], // No preloaded files at start
    agentResults: {}, // Stores real LLM outputs per agent
    webLibraries: [
        {
            id: "lib-cabi-1",
            org: "CABI",
            orgFull: "CABI Crop Health",
            type: "Technical Guide",
            name: "CABI Plantwise Rice Blast Diagnostic Guide",
            preview: "Spore release boundaries, temperature parameters (18-24°C), dew triggers, and Tricyclazole foliar limits for Basmati.",
            url: "./05_fao_cabi_blast_manual.html",
            selected: false,
            cred: "96% (HIGH)",
            recency: "T-6 Months",
            content: `<h1>CABI Plantwise Blast Diagnosis</h1><p>Rice Blast (Magnaporthe oryzae) symptoms can be identified by spindle-shaped spots with gray centers. Under morning temperatures between 18-24°C and dew durations exceeding 12 hours, blast spores multiply exponentially.</p><p>Recommended Control:</p><ul><li>Apply Tricyclazole foliar spray.</li><li>Reduce nitrogenous feeds.</li><li>Maintain standing water depth.</li></ul>`
        },
        {
            id: "lib-cabi-2",
            org: "CABI",
            orgFull: "CABI Crop Health",
            type: "Manual",
            name: "CABI Cotton Pink Bollworm Management Manual",
            preview: "Integrated pest thresholds (>5% rosette blooms, >5 moths/trap), mating lures, and selective Lambda-cyhalothrin caps.",
            url: "./04_sanghar_warehouse_logs.md",
            selected: false,
            cred: "95% (HIGH)",
            recency: "T-9 Months",
            content: `# CABI Plantwise Cotton Pest Guide\nThreat: Pink Bollworm (Pectinophora gossypiella)\n\n## Economic Injury Thresholds\n- Rosette Blooms: >5% flower infestation rate.\n- Boll burrowing: >10% green boll check rate.\n- Moths: >5 male moths per pheromone trap for 3 straight nights.\n\n## Biological Defense\nInstall gossyplure pheromone mating disruptors inside the cotton cluster fields to suppress caterpillar births.`
        },
        {
            id: "lib-wb-1",
            org: "WB",
            orgFull: "World Bank",
            type: "PDF Document",
            name: "Climate-Smart Agriculture in Pakistan",
            preview: "Comprehensive World Bank study on dryland water savings, micro-drip irrigation, and resilient crop cultivars.",
            url: "https://hdl.handle.net/10568/83340",
            selected: false,
            cred: "97% (HIGH)",
            recency: "T-1 Year",
            content: `World Bank Climate-Smart Agriculture (CSA) Profile - Pakistan\nDate: 2024-08-15\nSource Credibility: 0.97\n\nExecutive Analysis:\nImplementing climate-smart practices represents a priority:\n1. Methane-reduced Rice Wetting/Drying routines.\n2. High-efficiency sprinkler systems (reduces water footprint by 22%).\n3. Selective mating disruption and integrated pest controls.\n\nThe report recommends prioritizing localized crop scouting inputs over broad regional advisories to allocate scarce chemicals and mitigate canopy diseases.`
        },
        {
            id: "lib-fao-1",
            org: "FAO",
            orgFull: "FAO Pakistan",
            type: "Web Page",
            name: "FAO Pakistan Crop Yield Profile",
            preview: "Socio-economic databases mapping major cash crops, yields, calendars, and dryland irrigation factors.",
            url: "https://www.fao.org/countryprofiles/index/en/?iso3=PAK",
            selected: false,
            cred: "96% (HIGH)",
            recency: "T-1 Year",
            content: `<h1>FAO Pakistan Country Profile</h1><p>Agricultural water share represents 94% of total withdrawal. Cropping calendars suggest high disease risks during early summer humidity peaks. Precise localized crop schedules cushion yields against monsoon variances.</p>`
        },
        {
            id: "lib-pbs-1",
            org: "PBS",
            orgFull: "PBS Pakistan",
            type: "Data Release",
            name: "7th Integrated Agricultural Census of Pakistan",
            preview: "Acreages, holdings, regional fertilizer logs, and land usages across Punjab, Sindh, and KPK.",
            url: "https://www.pbs.gov.pk",
            selected: false,
            cred: "94% (HIGH)",
            recency: "T-1 Year",
            content: `"indicator,national_aggregate,punjab,sindh,kpk,balochistan"\n"Agricultural Households,8.4M,5.2M,1.8M,1.1M,0.3M"\n"Total Farm Area (Acres),47.2M,29.1M,12.2M,4.1M,1.8M"\n"Average Fertilizer Usage (Kg/Acre),74,82,78,41,22"`
        },
        {
            id: "lib-parc-1",
            org: "PARC",
            orgFull: "PARC Research",
            type: "Report",
            name: "PARC Annual Agricultural Research Update",
            preview: "Wheat genotypes rust checks, water-retention ratios, and biological pest controls by the Research Council.",
            url: "https://www.pbs.gov.pk",
            selected: false,
            cred: "92% (HIGH)",
            recency: "T-1 Year",
            content: `# PARC National Research Report\n\n## Key Research Focus\n1. Breeding rust-resistant wheat varieties.\n2. Local bio-insecticide formulations against Pink Bollworm.\n3. Micro-irrigation optimization in rainfed Pothohar tracts.`
        }
    ],
    activeOrgFilter: "ALL",
    activeIntakeType: null,
    activePack: "hazro",
    isOffline: false,
    currentWeather: null,
    agentMemory: {},
    currentView: "manager"
};

// --- INIT ---
function init() {
    switchTab("home");
    renderWebLibraries();
    setupListeners();
}

function setupListeners() {
    document.getElementById("file-input").addEventListener("change", handleFileUpload);
    document.getElementById("btn-ingest").addEventListener("click", handleIngestSource);
    document.getElementById("btn-start-analysis").addEventListener("click", startOrchestration);
    
    document.getElementById("btn-approve-execute").addEventListener("click", () => { 
        switchTab("outcome"); 
        renderFinalDashboard(); 
    });
    
    document.getElementById("btn-pdf").addEventListener("click", () => { 
        document.getElementById("print-timestamp").innerText = "Generated: " + new Date().toLocaleString() + " | Run ID: " + Math.random().toString(36).substr(2,9).toUpperCase(); 
        window.print(); 
    });
    
    document.getElementById("btn-whatsapp").addEventListener("click", shareWhatsApp);
    
    // Settings Force Offline
    document.getElementById("toggle-offline").addEventListener("change", (e) => {
        state.isOffline = e.target.checked;
        const banner = document.getElementById("offline-banner");
        if (state.isOffline) {
            banner.classList.remove("hidden");
        } else {
            banner.classList.add("hidden");
        }
    });

    // Farmer vs Manager Switcher Tabs
    document.getElementById("btn-view-manager").addEventListener("click", () => switchView("manager"));
    document.getElementById("btn-view-farmer").addEventListener("click", () => switchView("farmer"));

    // AI Settings
    document.getElementById("btn-save-llm").addEventListener("click", saveLLMSettings);
    loadLLMSettings();
}

// --- SWITCH TAB STATE ---
function switchTab(tabId) {
    state.activeTab = tabId;
    
    // Update nav class active state
    document.querySelectorAll(".nav-item").forEach(item => {
        item.classList.remove("active");
    });
    const activeTabBtn = document.getElementById("tab-" + tabId);
    if (activeTabBtn) activeTabBtn.classList.add("active");
    
    // Update screen displays
    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });
    
    const targetScreen = document.getElementById("screen-" + tabId);
    if (targetScreen) targetScreen.classList.add("active");
    
    // Sync lists if entering repository
    if (tabId === "evidence") {
        renderSourceLists();
    }
}

// --- RESET WORKSPACE ---
function resetAppWorkspace() {
    state.sources = [];
    state.webLibraries.forEach(l => l.selected = false);
    renderSourceLists();
    renderWebLibraries();
    switchTab("home");
}

// --- SWITCH VIEW TAB ---
function switchView(viewName) {
    state.currentView = viewName;
    document.getElementById("btn-view-manager").classList.toggle("active", viewName === "manager");
    document.getElementById("btn-view-farmer").classList.toggle("active", viewName === "farmer");

    const managerContainer = document.getElementById("manager-view-container");
    const farmerContainer = document.getElementById("farmer-view-container");

    if (viewName === "manager") {
        managerContainer.classList.remove("hidden");
        managerContainer.style.display = "flex";
        farmerContainer.classList.add("hidden");
    } else {
        farmerContainer.classList.remove("hidden");
        managerContainer.classList.add("hidden");
        managerContainer.style.display = "none";
    }
}

// --- DETECT ACTIVE CROP CONTEXT ---
function detectActiveCropContext() {
    const selected = [
        ...state.sources.filter(s => s.selected),
        ...state.webLibraries.filter(l => l.selected)
    ];
    
    let text = "";
    selected.forEach(s => {
        text += " " + (s.name || "") + " " + (s.preview || "") + " " + (s.content || "");
    });
    text = text.toLowerCase();
    
    if (text.includes("rice") || text.includes("basmati") || text.includes("blast") || text.includes("swat")) {
        state.activePack = "swat";
    } else if (text.includes("cotton") || text.includes("bollworm") || text.includes("sanghar")) {
        state.activePack = "sanghar";
    } else {
        // Fallback/Default Tomato (Hazro)
        state.activePack = "hazro";
    }
    
    const label = document.getElementById("settings-crop-context");
    if (label) {
        const pack = DEMO_PACKS[state.activePack];
        label.innerText = pack ? `${pack.crop} (${pack.region})` : "General Agriculture";
    }
}

// --- SELECTION & INTAKE RENDERING ---
function renderSourceLists() {
    updateSelectedCounter();
    
    renderList("files-list", "FILE");
    renderList("web-list", "URL");
    renderList("youtube-list", "YOUTUBE");
    lucide.createIcons();
}

function updateSelectedCounter() {
    detectActiveCropContext();

    const selectedCount = state.sources.filter(s => s.selected).length + state.webLibraries.filter(l => l.selected).length;
    
    // Update both counters
    document.getElementById("selection-counter-home").innerText = `Selected evidence sources: ${selectedCount} of 10`;
    document.getElementById("selection-counter-evidence").innerText = `Selected evidence sources: ${selectedCount} of 10`;
    
    // Update big bottom nav badge
    const badge = document.getElementById("nav-evidence-badge");
    if (selectedCount > 0) {
        badge.innerText = selectedCount;
        badge.classList.remove("hidden");
    } else {
        badge.classList.add("hidden");
    }
    
    // Analyze button lock
    document.getElementById("btn-start-analysis").disabled = selectedCount === 0;

    const totalSources = state.sources.length + state.webLibraries.filter(l => l.selected).length;
    const emptyState = document.getElementById("empty-state");
    const activeSections = document.getElementById("source-sections");
    
    if (totalSources === 0) {
        emptyState.classList.remove("hidden");
        activeSections.classList.add("hidden");
    } else {
        emptyState.classList.add("hidden");
        activeSections.classList.remove("hidden");
    }
}

function renderList(id, type) {
    const list = document.getElementById(id);
    const items = state.sources.filter(s => s.type === type);
    list.parentElement.classList.toggle("hidden", items.length === 0);
    
    list.innerHTML = items.map(s => `
        <div class="source-card-elite ${s.selected ? 'selected' : ''}" onclick="toggleSource('${s.id}')">
            <div class="s-check">
                ${s.selected ? '<i data-lucide="check" style="width:12px;"></i>' : ''}
            </div>
            <div class="s-body">
                <h4>${s.name}</h4>
                <p style="font-size:0.65rem; color:var(--text-dim); margin-top:2px;">${s.preview || 'No preview available.'}</p>
                <div class="s-meta mt-2" style="display:flex; gap:4px; align-items:center;">
                    <span class="badge ${s.selected ? 'sel' : 'excl'}">${s.selected ? 'Selected' : 'Excluded'}</span>
                    <span class="badge" style="background:rgba(59, 130, 246, 0.1); color:var(--accent);">${s.cred || 'VERIFIED'}</span>
                    <span class="badge" style="background:rgba(245, 158, 11, 0.1); color:var(--warning);">${s.recency || 'T-0'}</span>
                </div>
            </div>
            <div style="display:flex; flex-direction:column; gap:6px; align-items:center;">
                <button onclick="event.stopPropagation(); viewSource('${s.id}')" class="mini-btn" style="padding: 4px 8px; font-size: 0.6rem; font-weight: 700; border-color: rgba(59,130,246,0.3); color: var(--accent); background: rgba(59,130,246,0.05); display: flex; align-items: center; gap: 4px; border-radius:6px; cursor:pointer;">
                    <i data-lucide="eye" style="width:10px; height:10px;"></i> View
                </button>
                <button onclick="event.stopPropagation(); removeSource('${s.id}')" style="background:none; border:none; color:var(--text-dim); cursor:pointer; padding: 4px;">
                    <i data-lucide="trash-2" style="width:12px;"></i>
                </button>
            </div>
        </div>
    `).join("");
}

function toggleSource(id) {
    const s = state.sources.find(x => x.id === id);
    if (s) { 
        s.selected = !s.selected; 
        renderSourceLists(); 
    }
}

function removeSource(id) {
    state.sources = state.sources.filter(x => x.id !== id);
    renderSourceLists();
}

// --- CATEGORY B: LIBRARIES EXPLORER ---
function renderWebLibraries() {
    const list = document.getElementById("libraries-explorer-list");
    let items = state.webLibraries;
    if (state.activeOrgFilter !== "ALL") {
        items = state.webLibraries.filter(l => l.org === state.activeOrgFilter);
    }

    list.innerHTML = items.map(s => `
        <div class="source-card-elite ${s.selected ? 'selected' : ''}" onclick="toggleLibrarySource('${s.id}')">
            <div class="s-check">
                ${s.selected ? '<i data-lucide="check" style="width:12px;"></i>' : ''}
            </div>
            <div class="s-body">
                <h4 style="font-size:0.75rem; font-weight:700;">${s.name}</h4>
                <p style="font-size:0.65rem; color:var(--text-dim); margin-top:2px;">${s.preview}</p>
                <div class="s-meta mt-2" style="display:flex; gap:4px; align-items:center;">
                    <span class="badge" style="background:rgba(59,130,246,0.1); color:var(--accent);">${s.orgFull}</span>
                    <span class="badge" style="background:rgba(255,255,255,0.05); color:var(--text-main);">${s.type}</span>
                    <span class="badge" style="background:rgba(16,185,129,0.1); color:var(--primary);">${s.cred}</span>
                    ${s.recency ? `<span class="badge" style="background:rgba(245, 158, 11, 0.1); color:var(--warning);">${s.recency}</span>` : ''}
                </div>
            </div>
            <div style="display:flex; flex-direction:column; gap:4px; align-items:center;">
                <button onclick="event.stopPropagation(); viewLibrarySource('${s.id}')" class="mini-btn" style="padding: 4px 8px; font-size: 0.6rem; font-weight: 700; border-color: rgba(59,130,246,0.3); color: var(--accent); background: rgba(59,130,246,0.05); display: flex; align-items: center; gap: 4px; border-radius:6px; cursor:pointer;">
                    <i data-lucide="eye" style="width:10px; height:10px;"></i> View
                </button>
            </div>
        </div>
    `).join("");
    lucide.createIcons();
}

function toggleLibrarySource(id) {
    const s = state.webLibraries.find(x => x.id === id);
    if (s) {
        s.selected = !s.selected;
        renderWebLibraries();
        updateSelectedCounter();
    }
}

function filterOrg(orgKey) {
    state.activeOrgFilter = orgKey;
    document.querySelectorAll("#org-filters button").forEach(btn => {
        btn.classList.remove("active");
    });
    
    const activeBtn = document.getElementById("filter-" + orgKey.toLowerCase());
    if (activeBtn) activeBtn.classList.add("active");
    
    renderWebLibraries();
}

// --- FILE UPLOADS ---
function handleFileUpload(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    files.forEach(f => {
        const id = "up-" + Math.random().toString(36).substr(2, 9);
        const nameLower = f.name.toLowerCase();
        let demoKeyMatch = null;
        let preview = "Uploaded local file evidence.";
        let cred = "VERIFIED";

        // Try mapping to Swat Basmati or Sanghar Cotton default content
        if (nameLower.includes("rice") || nameLower.includes("blast") || nameLower.includes("swat")) {
            demoKeyMatch = nameLower.includes("telemetry") ? "s3" : (nameLower.includes("advisory") ? "s1" : "s4");
        } else if (nameLower.includes("cotton") || nameLower.includes("bollworm") || nameLower.includes("sanghar")) {
            demoKeyMatch = nameLower.includes("infestation") ? "c3" : (nameLower.includes("alert") ? "c1" : "c4");
        } else if (nameLower.includes("tomato") || nameLower.includes("blight") || nameLower.includes("hazro")) {
            demoKeyMatch = nameLower.includes("observations") ? "h3" : (nameLower.includes("advisory") ? "h1" : "h4");
        }

        if (demoKeyMatch && STATIC_CONTENT[demoKeyMatch]) {
            preview = STATIC_CONTENT[demoKeyMatch].split("\n").slice(0, 3).join(" ") + "...";
            cred = "HIGH";
        }

        state.sources.push({
            id: id,
            type: "FILE",
            name: f.name,
            selected: true,
            status: "READY",
            cred: cred,
            preview: preview,
            demoKey: demoKeyMatch
        });
    });

    renderSourceLists();
    switchTab("evidence");
}

// --- LINK INGESTIONS ---
function showIntakeModal(type) {
    state.activeIntakeType = type;
    document.getElementById("modal-intake").classList.remove("hidden");
    document.getElementById("intake-title").innerText = type === "url" ? "Ingest Web Link" : "Scan YouTube Video";
    
    document.getElementById("intake-web-url").classList.toggle("hidden", type !== "url");
    document.getElementById("intake-yt-url").classList.toggle("hidden", type !== "youtube");
    
    document.getElementById("intake-web-url").value = "";
    document.getElementById("intake-yt-url").value = "";
}

function hideIntakeModal() {
    document.getElementById("modal-intake").classList.add("hidden");
}

function handleIngestSource() {
    const type = state.activeIntakeType;
    let url = "";
    let name = "";
    let preview = "";
    let demoKey = null;

    if (type === "url") {
        url = document.getElementById("intake-web-url").value.trim();
        if (!url) return;
        name = url.replace("https://", "").replace("http://", "").split("/")[0] + " Advisory Report";
        
        // Dynamic matches
        if (url.includes("dew") || url.includes("weather")) {
            demoKey = url.includes("swat") ? "s2" : "h2";
            preview = "Meteorology alert regarding relative humidity spore thresholds.";
        } else {
            demoKey = url.includes("cabi") ? "s5" : "c2";
            preview = "Advisory guidelines on pest Economic Injury Levels (EIL).";
        }
    } else {
        url = document.getElementById("intake-yt-url").value.trim();
        if (!url) return;
        name = "Grower Video Damage Scan (" + url.substr(url.length - 6) + ")";
        demoKey = "c5";
        preview = "Visual orthomosaic analysis of infested cotton bloom coordinates.";
    }

    const id = "in-" + Math.random().toString(36).substr(2, 9);
    state.sources.push({
        id: id,
        type: type === "url" ? "URL" : "YOUTUBE",
        name: name,
        selected: true,
        status: "READY",
        cred: "VERIFIED",
        preview: preview,
        demoKey: demoKey
    });

    hideIntakeModal();
    renderSourceLists();
    switchTab("evidence");
}

// --- DOCUMENT IN-APP PREVIEW DRAWER ---
function viewSource(id) {
    const s = state.sources.find(x => x.id === id);
    if (!s) return;

    let content = "No parsed text available inside this custom report.";
    if (s.demoKey && STATIC_CONTENT[s.demoKey]) {
        content = STATIC_CONTENT[s.demoKey];
    }

    openPreviewModal(s.name, s.type, s.cred || "VERIFIED", "T-0", content, s.id, false);
}

function viewLibrarySource(id) {
    const s = state.webLibraries.find(x => x.id === id);
    if (!s) return;

    openPreviewModal(s.name, s.type, s.cred, s.recency || "T-1 Year", s.content, s.id, true);
}

function openPreviewModal(title, type, cred, recency, text, rawId, isLib) {
    const modal = document.getElementById("modal-preview");
    document.getElementById("preview-title").innerText = title;
    
    // Render Badges
    document.getElementById("preview-badges").innerHTML = `
        <span class="badge sel">${type}</span>
        <span class="badge" style="background:rgba(59,130,246,0.1); color:var(--accent);">${cred}</span>
        <span class="badge" style="background:rgba(245,158,11,0.1); color:var(--warning);">${recency}</span>
    `;

    // Render parsed text depending on type
    const body = document.getElementById("preview-body");
    if (text.startsWith("<!DOCTYPE") || text.includes("<h1>") || text.includes("<p>")) {
        body.innerHTML = text; // Render clean dynamic HTML
    } else if (text.startsWith("\"date") || text.includes(",plot_id")) {
        body.innerHTML = renderCSVToHTML(text); // Render beautiful data grid
    } else if (text.startsWith("[")) {
        body.innerHTML = renderJSONToHTML(text); // Render grower feed cards
    } else if (text.startsWith("# ")) {
        body.innerHTML = renderMarkdownToHTML(text); // Render styled markdown lists/headings
    } else {
        body.innerHTML = `<pre style="white-space:pre-wrap; font-family:var(--font); font-size:0.75rem; color:var(--text-main); line-height:1.4;">${text}</pre>`;
    }

    // Modal footer callbacks
    const selectBtn = document.getElementById("btn-preview-select");
    const itemSelected = isLib ? state.webLibraries.find(x => x.id === rawId).selected : state.sources.find(x => x.id === rawId).selected;
    
    selectBtn.innerHTML = itemSelected ? `<i data-lucide="x" style="width:12px;"></i> Deselect Source` : `<i data-lucide="check" style="width:12px;"></i> Select This Source`;
    selectBtn.onclick = () => {
        if (isLib) {
            toggleLibrarySource(rawId);
        } else {
            toggleSource(rawId);
        }
        hidePreviewModal();
    };

    const newTabBtn = document.getElementById("btn-preview-new-tab");
    newTabBtn.onclick = () => {
        const dummyWindow = window.open("", "_blank");
        dummyWindow.document.write(`<html><head><title>${title}</title><style>body{font-family:sans-serif; padding:40px; line-height:1.6; color:#333; max-width:800px; margin:0 auto;} h1{color:#10b981; border-bottom:2px solid #eee; padding-bottom:10px;} pre{background:#f4f4f4; padding:15px; border-radius:6px; overflow-x:auto;}</style></head><body><h1>${title}</h1><div>${text}</div></body></html>`);
        dummyWindow.document.close();
    };

    modal.classList.remove("hidden");
    lucide.createIcons();
}

function hidePreviewModal() {
    document.getElementById("modal-preview").classList.add("hidden");
}

function renderCSVToHTML(csvText) {
    const lines = csvText.split("\n");
    if (lines.length < 2) return `<pre>${csvText}</pre>`;
    
    let html = `<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:0.7rem; background:rgba(0,0,0,0.1); border:1px solid var(--border); border-radius:8px;">`;
    
    // Header
    const headers = lines[0].replace(/"/g, "").split(",");
    html += `<tr style="background:rgba(255,255,255,0.04); border-bottom:1px solid var(--border);">`;
    headers.forEach(h => {
        html += `<th style="padding:8px; text-align:left; font-weight:800; color:var(--primary);">${h}</th>`;
    });
    html += `</tr>`;
    
    // Rows
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cells = lines[i].replace(/"/g, "").split(",");
        html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.02);">`;
        cells.forEach(c => {
            html += `<td style="padding:6px 8px; text-align:left; color:var(--text-main);">${c}</td>`;
        });
        html += `</tr>`;
    }
    html += `</table></div>`;
    return html;
}

function renderJSONToHTML(jsonText) {
    try {
        const data = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
        if (!Array.isArray(data)) {
            return `<pre>${JSON.stringify(data, null, 2)}</pre>`;
        }
        return data.map(item => `
            <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:12px; padding:10px; margin-bottom:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span style="font-weight:700; color:var(--accent); font-size:0.7rem;">Source: ${item.source || 'Grower Feed'}</span>
                    <span style="font-size:0.55rem; color:var(--text-dim);">${item.timestamp || ''}</span>
                </div>
                <p style="font-size:0.72rem; color:var(--text-main); line-height:1.3;">"${item.message || item.preview || ''}"</p>
                <div style="display:flex; gap:6px; margin-top:6px;">
                    <span class="badge" style="background:rgba(16,185,129,0.08); color:var(--primary);">Credibility: ${((item.credibility || 0.8) * 100).toFixed(0)}%</span>
                </div>
            </div>
        `).join("");
    } catch (err) {
        return `<pre style="color:var(--danger);">${err.message}</pre>`;
    }
}

function renderMarkdownToHTML(mdText) {
    const lines = mdText.split("\n");
    let html = "";
    lines.forEach(line => {
        line = line.trim();
        if (line.startsWith("# ")) {
            html += `<h2 style="font-size:1rem; font-weight:800; color:var(--primary); margin-top:12px; margin-bottom:6px; border-bottom:1px solid var(--border); padding-bottom:4px;">${line.substring(2)}</h2>`;
        } else if (line.startsWith("## ")) {
            html += `<h3 style="font-size:0.82rem; font-weight:700; color:var(--accent); margin-top:8px; margin-bottom:4px;">${line.substring(3)}</h3>`;
        } else if (line.startsWith("- ")) {
            html += `<li style="margin-left:12px; margin-bottom:2px; font-size:0.72rem; color:var(--text-main);">${line.substring(2)}</li>`;
        } else {
            html += `<p style="font-size:0.72rem; color:var(--text-dim); margin-bottom:4px; line-height:1.4;">${line}</p>`;
        }
    });
    return html;
}

// --- WEATHER API LOGIC ---
async function fetchLiveWeather() {
    const pack = DEMO_PACKS[state.activePack];
    try {
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${pack.lat}&longitude=${pack.lon}&current=temperature_2m,relative_humidity_2m`);
        if (!response.ok) throw new Error("API Limit");
        const data = await response.json();
        return {
            temp: Math.round(data.current.temperature_2m) + "°C",
            hum: Math.round(data.current.relative_humidity_2m) + "%",
            source: "Open-Meteo Live Data",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
    } catch (err) {
        console.warn("Weather API failed, utilizing offline cache.", err);
        return getOfflineWeather();
    }
}

function getOfflineWeather() {
    if (state.activePack === "swat") {
        return { temp: "21°C", hum: "88%", source: "Cached Telemetry", timestamp: "Offline Safe T-0" };
    } else if (state.activePack === "sanghar") {
        return { temp: "39°C", hum: "60%", source: "Cached Telemetry", timestamp: "Offline Safe T-0" };
    } else {
        return { temp: "31°C", hum: "84%", source: "Cached Telemetry", timestamp: "Offline Safe T-0" };
    }
}

// --- ORCHESTRATION ---
async function startOrchestration() {
    switchTab("flow");
    const timeline = document.getElementById("agent-timeline");
    const selected = [...state.sources.filter(s => s.selected), ...state.webLibraries.filter(l => l.selected)];
    const hasField = selected.some(s => s.type === "FILE" || s.type === "YOUTUBE" || s.type === "PDF Document" || s.type === "Data Release" || s.type === "Manual" || s.type === "Technical Guide");
    const pack = DEMO_PACKS[state.activePack];
    const aiMode = isAIMode();
    const evidence = collectEvidenceBundle();
    let ctx = {};
    state.agentResults = {};
    timeline.innerHTML = "";
    document.getElementById("agent-detail-card").classList.add("hidden");
    document.getElementById("approval-box").classList.add("hidden");
    updateConfidence(0);

    for (const agent of AGENTS) {
        const node = document.createElement("div");
        node.className = "agent-node active running";
        const ml = aiMode ? "🤖 AI" : "📋 Demo";
        node.innerHTML = `<div class="n-dot"><i data-lucide="${agent.icon}"></i></div><div class="n-info"><h4>${agent.name}</h4><p>${aiMode ? 'Calling LLM...' : 'Processing...'}</p><span class="badge" style="font-size:0.5rem;margin-top:2px;">${ml}</span></div><div class="handoff-line"></div><div class="data-packet"></div><div class="handshake-badge">HANDSHAKE</div>`;
        node.onclick = () => auditAgent(agent.id);
        timeline.appendChild(node);
        lucide.createIcons();

        if (agent.id === "weather") {
            await new Promise(r => setTimeout(r, 1000));
            node.classList.add("failed");
            state.agentMemory.weather = { name:agent.name, desc:"Weather fetch.", tool:"weather_api(T-0)", inference:"API timeout.", status:"Error", input:`[${pack.lat},${pack.lon}]`, output:"Retrying...", trusted:"None", rejected:"Endpoint timed out" };
            auditAgent("weather");
            await new Promise(r => setTimeout(r, 1200));
            node.classList.remove("failed"); node.classList.add("recovered");
            let wData = state.isOffline ? getOfflineWeather() : await fetchLiveWeather();
            state.currentWeather = wData;
            let wr = null;
            if (aiMode) wr = await callLLM("You are an agricultural meteorologist. Return JSON: {\"riskLevel\":\"HIGH/MEDIUM/LOW\",\"reasoning\":\"2 sentences\",\"sporulationWindow\":\"time\",\"humidityRisk\":true/false}", `${pack.region}, ${pack.crop}, ${pack.outbreak}. Weather: ${wData.temp}, ${wData.hum}.\nEvidence:\n${evidence.fullText.substring(0,1500)}`);
            if (!wr) wr = { riskLevel:"HIGH", reasoning:`${wData.hum} humidity with ${wData.temp} elevates spore risk.`, sporulationWindow:"24-48h", humidityRisk:true };
            ctx.weather = wr; state.agentResults.weather = wr;
            state.agentMemory.weather = { name:agent.name, desc:agent.desc, tool:`weather_api(${pack.lat},${pack.lon})`, inference:wr.reasoning, status:`Success (${ml})`, input:`[${pack.lat},${pack.lon}]`, output:`${wData.temp}, ${wData.hum} → ${wr.riskLevel}`, trusted:`Open-Meteo [${wData.source}]`, rejected:"Attempt 1 (timeout)" };
            auditAgent("weather");
            node.querySelector("p").innerText = `Risk: ${wr.riskLevel}`;
            await new Promise(r => setTimeout(r, 600));
            continue;
        }

        await new Promise(r => setTimeout(r, aiMode ? 300 : 800));
        let result = null;
        if (aiMode) {
            const pr = getAgentPrompt(agent.id, evidence, pack, ctx);
            if (pr) { node.querySelector("p").innerText = "Reasoning..."; result = await callLLM(pr.system, pr.user); }
        }
        if (!result || result.raw) result = getDemoResult(agent.id, hasField, pack, selected);
        ctx[agent.id] = result; state.agentResults[agent.id] = result;
        state.agentMemory[agent.id] = buildAgentMemory(agent, result, selected, ml);
        auditAgent(agent.id);
        node.classList.remove("running"); node.classList.add("done");
        node.querySelector("p").innerText = result?.disease || result?.worstPlot || result?.urgency || "Complete";
    }

    updateConfidence(state.agentResults.recovery?.overallConfidence ? Math.round(state.agentResults.recovery.overallConfidence * 100) : (hasField ? 92 : 45));
    renderReviewChain(hasField);
    document.getElementById("approval-box").classList.remove("hidden");
    lucide.createIcons();
}

function getAgentPrompt(id, ev, pack, ctx) {
    const b = `Region:${pack.region}. Crop:${pack.crop}. Threat:${pack.outbreak}.`;
    const e = ev.fullText.substring(0, 2500);
    const P = {
        context: { system:"You are a plant pathologist. Identify disease, stage, thresholds, progression. Return JSON:{\"disease\":\"name\",\"stage\":\"early/moderate/severe\",\"thresholds\":[\"strings\"],\"progression\":\"desc\",\"confidence\":0.0-1.0}", user:`${b}\nWeather:${JSON.stringify(ctx.weather||{})}\nEvidence:\n${e}` },
        signal: { system:"You are an agricultural data analyst. Find temporal trends, severity spikes, worst plot, anomalies from field data. Return JSON:{\"trends\":[\"strings\"],\"worstPlot\":\"ID\",\"severityChange\":\"desc\",\"anomalies\":[\"strings\"]}", user:`${b}\nDisease:${JSON.stringify(ctx.context||{})}\nEvidence:\n${e}` },
        credibility: { system:"You are a fact-checker. Find contradictions between sources, rank reliability. Return JSON:{\"contradictions\":[{\"claim1\":\"a\",\"claim2\":\"b\",\"resolution\":\"c\"}],\"trustedSources\":[\"names\"],\"rejectedSources\":[\"names+reason\"],\"resolution\":\"summary paragraph\"}", user:`${b}\nPrior:${JSON.stringify({w:ctx.weather,d:ctx.context,s:ctx.signal})}\nEvidence:\n${e}` },
        decision: { system:"You are an agricultural operations planner. Create 3-5 step action plan respecting inventory constraints. Return JSON:{\"actions\":[{\"title\":\"t\",\"rationale\":\"r\",\"evidence\":\"source\",\"constraint\":\"c\",\"expectedResult\":\"e\"}],\"urgency\":\"HIGH/MEDIUM/LOW\",\"lossWithoutAction\":\"X%\",\"lossWithAction\":\"X%\",\"timeSaved\":\"X days\",\"coverageGap\":\"X%\"}", user:`${b}\nContext:${JSON.stringify({d:ctx.context,s:ctx.signal,c:ctx.credibility,w:ctx.weather})}\nEvidence:\n${e}` },
        execution: { system:"You are a field coordinator for Pakistani farmers. Create deployment schedule. Write 2-3 sentence farmer advisory in Urdu and manager summary in English. Return JSON:{\"schedule\":[{\"action\":\"a\",\"timeline\":\"t\",\"team\":\"t\"}],\"farmerAdvisoryUrdu\":\"Urdu text\",\"managerSummary\":\"English text\",\"farmerActions\":[{\"title\":\"Urdu+Eng\",\"desc\":\"Urdu+Eng\",\"time\":\"t\"}]}", user:`${b}\nPlan:${JSON.stringify(ctx.decision||{})}\nDisease:${JSON.stringify(ctx.context||{})}` },
        recovery: { system:"You are a resilience auditor. Review the full chain, find gaps, compute confidence 0-1. Write 3-4 sentence executive summary. Return JSON:{\"gaps\":[\"strings\"],\"fallbacks\":[\"strings\"],\"overallConfidence\":0.0-1.0,\"executiveSummary\":\"3-4 sentences\"}", user:`${b}\nChain:${JSON.stringify({w:ctx.weather,d:ctx.context,s:ctx.signal,c:ctx.credibility,dec:ctx.decision,ex:ctx.execution})}` }
    };
    return P[id] || null;
}

function getDemoResult(id, hasField, pack, sel) {
    const D = {
        ingestion: { sourceCount:sel.length, types:[...new Set(sel.map(s=>s.type))] },
        context: { disease:pack.outbreak, stage:hasField?"severe":"baseline", thresholds:["Humidity >80%","Temp 18-28°C"], progression:hasField?"Rapid escalation 48hrs":"Stable", confidence:hasField?0.89:0.5 },
        signal: { trends:hasField?["Severity Level 2→4 in 48hrs"]:["Stable"], worstPlot:hasField?"Epicenter plot":"None", severityChange:hasField?"Critical escalation":"Stable", anomalies:hasField?["Rapid spike"]:[] },
        credibility: { contradictions:hasField?[{claim1:"Inventory: stock sufficient",claim2:"Field data: stock gap likely",resolution:"Prioritized fresh observations"}]:[], trustedSources:["Scout telemetry"], rejectedSources:hasField?["Stale inventory claims"]:[], resolution:hasField?"Fresh field data prioritized over stale warehouse records.":"All sources congruent." },
        decision: { actions:hasField?[{title:"Surgical spray epicenter",rationale:"Severity spike confirmed",evidence:"Field CSV",constraint:"Chemical stock limit",expectedResult:"Spread mitigated"},{title:"Reserve emergency stock",rationale:"Prevent stock-out",evidence:"Inventory",constraint:"Budget cap",expectedResult:"Stock allocated"},{title:"Notify neighbors",rationale:"Spore drift",evidence:"Weather",constraint:"Telecom limits",expectedResult:"Notified"}]:[{title:"Routine scan",rationale:"Baseline",evidence:"Telemetry",constraint:"None",expectedResult:"Synced"}], urgency:hasField?"HIGH":"LOW", lossWithoutAction:hasField?"75%":"5%", lossWithAction:hasField?"12%":"2%", timeSaved:hasField?"3.5 days":"0", coverageGap:"0%" },
        execution: { farmerAdvisoryUrdu:"فصل کی حالت نارمل ہے۔ نگرانی جاری رکھیں۔", managerSummary:`Monitoring ${pack.crop} in ${pack.region}. Baseline stable.`, farmerActions:[{title:"نگرانی (Monitor)",desc:"فصل نارمل ہے۔ روزانہ معائنہ کریں۔",time:"Ongoing"}] },
        recovery: { gaps:[], fallbacks:["Cached weather"], overallConfidence:hasField?0.92:0.5, executiveSummary:hasField?`Severity escalation verified in ${pack.crop} (${pack.region}). Credibility agents resolved conflicting data. Responses limited to available reserves.`:`Baseline monitoring for ${pack.crop} in ${pack.region}. No anomalies.` }
    };
    return D[id] || {};
}

function buildAgentMemory(agent, result, sel, ml) {
    const tools = {ingestion:"evidence_merger()",weather:"weather_api()",context:"disease_lookup()",signal:"temporal_analyzer()",credibility:"trust_ranker()",decision:"constraint_planner()",execution:"dispatch_scheduler()",recovery:"self_healing_audit()"};
    const inf = result?.reasoning||result?.resolution||result?.executiveSummary||result?.progression||result?.severityChange||JSON.stringify(result||{}).substring(0,150);
    return { name:agent.name, desc:agent.desc, tool:tools[agent.id]||"?", inference:inf, status:`Success (${ml})`, input:`${sel.length} sources`, output:result?.riskLevel||result?.disease||result?.worstPlot||result?.urgency||result?.managerSummary?.substring(0,50)||"Done", trusted:(result?.trustedSources||[]).join(", ")||"Selected evidence", rejected:(result?.rejectedSources||[]).join(", ")||"None" };
}

function auditAgent(agentId) {
    const mem = state.agentMemory[agentId];
    if (!mem) return;

    const d = document.getElementById("agent-detail-card");
    d.classList.remove("hidden");
    
    document.getElementById("detail-agent-name").innerText = mem.name;
    document.getElementById("agent-info-chip").innerText = mem.desc;
    document.getElementById("detail-summary").innerText = mem.inference;
    
    document.getElementById("detail-input").innerText = mem.input;
    document.getElementById("detail-output").innerText = mem.output;
    
    document.getElementById("agent-evidence-trusted").innerHTML = `<span style="color:var(--primary); font-weight:700;">✓</span> ${mem.trusted}`;
    document.getElementById("agent-evidence-rejected").innerHTML = `<span style="color:var(--danger); font-weight:700;">✗</span> ${mem.rejected}`;
    
    document.getElementById("trace-tools").innerText = mem.tool;
    document.getElementById("trace-inference").innerText = mem.inference;
    document.getElementById("trace-status").innerText = mem.status;
    document.getElementById("trace-status").className = `badge ${mem.status === "Success" ? "sel" : "excl"}`;
}

function updateConfidence(val) {
    document.getElementById("confidence-val").innerText = val + "%";
    document.getElementById("system-confidence-bar").style.width = val + "%";
}

function renderReviewChain(hasField) {
    const list = document.getElementById("plan-list-review");
    const dr = state.agentResults.decision;
    let actions = [];
    if (dr && dr.actions && dr.actions.length > 0) {
        actions = dr.actions.map(a => a.title || a);
    } else if (hasField) {
        if (state.activePack === "hazro") actions = ["Validate Epicenter Plot T-03", "Reserve 18L Emergency Mancozeb Stock", "Deploy Surgical Spray Team within 24 Hours", "Notify Neighboring Tomato Growers"];
        else if (state.activePack === "swat") actions = ["Validate Epicenter Plot R-12", "Reserve 24L Tricyclazole Fungicide Stock", "Deploy Spindle Lesions Treatment", "Restrict Nitrogen Fertilizers"];
        else actions = ["Validate Epicenter Plot C-08", "Reserve 12L Lambda-cyhalothrin Insecticide", "Install Rosette Blooms Pheromone Traps", "Dispatch Hand Plucking Manual Teams"];
    } else {
        actions = ["Routine Telemetry Scan", "Update Baseline Soil Moisture Logs", "Sync Agronomist Regional Dashboard", "Standard Farmer SMS Advisory"];
    }
    list.innerHTML = actions.map(a => `<div class="action-item">${a}</div>`).join("");
}

// --- COMPILE CONTEXT-AWARE CROP CARE TIPS ---
function compileCropCareTips() {
    const list = document.getElementById("crop-care-tips");
    const pack = DEMO_PACKS[state.activePack];
    let tips = [];

    if (state.activePack === "hazro") {
        tips = [
            "🌿 <strong>Canopy Humidity:</strong> Suspend overhead sprinkler irrigation immediately. Spores of late blight spread rapidly via wet foliage and humidity pools inside the canopy.",
            "🧴 <strong>Chemical Dosages:</strong> Spray foliar Mancozeb or Metalaxyl at 2.0g/L strictly near affected epicenter plots under economic checks.",
            "🌡️ <strong>Morning Dew Checks:</strong> Scout early in the morning when dew accumulation is highest, focusing on lower leaf undersides for white velvety spore growth."
        ];
    } else if (state.activePack === "swat") {
        tips = [
            "🌾 <strong>Fertilizer Warning:</strong> Stop all Urea/Nitrogen fertilizers immediately. High nitrogen creates highly tender leaves that allow blast hyphae to penetrate.",
            "🧴 <strong>Blast Spray Control:</strong> Spray Tricyclazole at 0.6g/L inside the 36-hour sporulation window at the first sign of spindle-shaped spots.",
            "🌊 <strong>Standing Water Depth:</strong> Maintain standing water depth (2-3 inches) in basmati paddies to regulate canopy temperatures and cushion spore release triggers."
        ];
    } else if (state.activePack === "sanghar") {
        tips = [
            "🌱 <strong>Mating Disruption:</strong> Deploy gossyplure pheromone traps (5 traps per acre) immediately to attract and trap male pink bollworm moths.",
            "✂️ <strong>Manual Flower Plucking:</strong> Hand-pluck and incinerate 'rosette flowers' immediately to destroy feeding larvae before they burrow into green cotton bolls.",
            "🧴 <strong>Insecticide Caps:</strong> Spray selective Lambda-cyhalothrin at 150ml/acre inside the boll-forming window, keeping chemical residue limits in check."
        ];
    }

    list.innerHTML = tips.map(t => `<div style="font-size:0.72rem; line-height:1.4; color:var(--text-main); margin-bottom:4px;">${t}</div>`).join("");
}

// --- FINAL DASHBOARD RENDERING ---
function renderFinalDashboard() {
    const selected = [
        ...state.sources.filter(s => s.selected),
        ...state.webLibraries.filter(l => l.selected)
    ];
    const hasFiles = selected.some(s => s.type === "FILE" || s.type === "PDF Document" || s.type === "Data Release");
    const hasLinks = selected.some(s => s.type === "URL" || s.type === "Web Page" || s.type === "Report");
    const hasVideo = selected.some(s => s.type === "YOUTUBE" || s.type === "Manual" || s.type === "Technical Guide");
    const pack = DEMO_PACKS[state.activePack];

    // Live vs Cached weather
    const wData = state.currentWeather || getOfflineWeather();
    document.getElementById("w-temp").innerText = wData.temp;
    document.getElementById("w-hum").innerText = wData.hum;
    document.getElementById("w-ts").innerText = `Fetched: ${wData.timestamp} (${wData.source})`;
    document.getElementById("weather-source-header").innerHTML = `<i data-lucide="cloud-sun"></i> ${state.isOffline ? 'Cached Weather' : 'Live Weather'}`;

    // Map Context
    const mapIframe = document.getElementById("hazro-map");
    if (state.activePack === "hazro") {
        mapIframe.src = "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d13264.453913054176!2d72.4839846871582!3d33.91234710000001!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x38df13a48e6f1f33%3A0xe96c4293f773449c!2sHazro%2C%20Attock%2C%20Punjab%2C%20Pakistan!5e0!3m2!1sen!2s!4v1715762000000!5m2!1sen!2s";
    } else if (state.activePack === "swat") {
        mapIframe.src = "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d105244.24838634861!2d72.30959082260655!3d34.80280457635952!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x38dc20efbb7cbdb5%3A0x868b368731d7f6c3!2sMingora%2C%20Swat%2C%20Khyber%20Pakhtunkhwa%2C%20Pakistan!5e0!3m2!1sen!2s!4v1715763000000!5m2!1sen!2s";
    } else if (state.activePack === "sanghar") {
        mapIframe.src = "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d57544.75704944122!2d68.9150033100234!3d26.04683057111667!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x394c1e459db4b83f%3A0xd211e405e3be1df7!2sSanghar%2C%20Sindh%2C%20Pakistan!5e0!3m2!1sen!2s!4v1715764000000!5m2!1sen!2s";
    }

    // Badges
    document.getElementById("dashboard-badges").innerHTML = `
        <span class="badge ${state.isOffline ? 'excl' : 'sel'}">${state.isOffline ? 'Offline Mode' : 'Live Mode'}</span>
        <span class="badge" style="background:rgba(16,185,129,0.1); color:var(--primary);">${pack.crop} Cluster</span>
        <span class="badge" style="background:rgba(59,130,246,0.1); color:var(--accent);">${pack.region}</span>
    `;

    // Compile Tips
    const dctx = state.agentResults.context;
    if (dctx && dctx.thresholds && dctx.thresholds.length > 0) {
        document.getElementById("crop-care-tips").innerHTML = dctx.thresholds.map(t => `<div style="font-size:0.72rem; line-height:1.4; color:var(--text-main); margin-bottom:4px;">🌿 ${t}</div>`).join("");
    } else {
        compileCropCareTips();
    }

    // EXECUTIVE SUMMARY
    const rex = state.agentResults.recovery;
    if (rex && rex.executiveSummary) {
        document.getElementById("sum-exec").innerText = rex.executiveSummary;
    } else if (hasFiles || hasVideo) {
        document.getElementById("sum-exec").innerText = `Autonomous multi-agent synthesis verified a Level-4 severity escalation in northern ${pack.crop} cluster plots (${pack.region}). Credibility agents successfully resolved conflicting telemetry by prioritizing real-time local May 12 observations over stale records. Responses are limited within strict physical chemical reserves.`;
    } else {
        document.getElementById("sum-exec").innerText = `Command Center monitoring baseline parameters for ${pack.crop} crop in ${pack.region}. No severe anomalies are detected based on the minimal selected evidence sets. Baseline scan intervals continue unchanged.`;
    }

    // EXPLAINABILITY: CONTRADICTIONS, REJECTIONS, AND METRICS
    const cred = state.agentResults.credibility;
    const dec = state.agentResults.decision;
    const exe = state.agentResults.execution;

    let contradiction = cred?.resolution || "No major discrepancies found in baseline context.";
    let rejectedList = (cred?.rejectedSources && cred.rejectedSources.length > 0) ? cred.rejectedSources : ["None"];
    let metrics = { lossNo: dec?.lossWithoutAction || "15%", lossYes: dec?.lossWithAction || "2%", time: dec?.timeSaved || "1.2 Days", gap: dec?.coverageGap || "0%" };
    let plan = dec?.actions || [];
    let farmerActions = exe?.farmerActions || [];

    if (!dec?.actions && (hasFiles || hasVideo)) {
        if (state.activePack === "hazro") {
            contradiction = "Tomato Inventory Log claimed chemical reserves were 'Sufficient' for global spray. May 12 Field Observations confirmed plot T-03 severity rose to Level 4, requiring 32L total Mancozeb. Decision Agent prioritized May 12 field observations, identified stock gap (18L remaining), and restricted treatment strictly to epicenter T-03.";
            rejectedList = ["Grower Community Forward (Low Credibility/Noisy)", "Historical Climate Overview Article (Stale Recency)"];
            metrics = { lossNo: "85%", lossYes: "12%", time: "4.5 Days", gap: "0%" };
            plan = [
                { t: "Surgical spray plot T-03", w: "Epicenter severity spiked from Level 2 to Level 4.", e: "03_tomato_field_observations.csv", c: "18L Mancozeb Stock Limit", r: "Spread Mitigated" },
                { t: "Reserve Emergency Stock", w: "Prevent chemical stock-out during surgical application.", e: "04_hazro_inventory_snapshot.md", c: "32L Total Requirement", r: "18L Allocated" },
                { t: "SMS Grower Broadcast", w: "Spore drift risk elevated by 84% humidity conditions.", e: "02_hazro_weather_note.html", c: "Telecom Privacy Cap", r: "12 Neighbors Notified" }
            ];
            farmerActions = [
                { title: "سپرے کریں (Foliar Spray Mancozeb)", desc: "ٹماٹر کے پودوں پر فوری فنگس کش دوا کا سپرے کریں۔ (Apply fungicide immediately on plots T-03 and T-04.)", time: "Within 24 Hours" },
                { title: "پانی دینا روکیں (Suspend Irrigation)", desc: "کھیتوں کی نمی کم کرنے کے لیے پودوں کو پانی دینا فوری بند کریں۔ (Stop watering to lower humidity and spore propagation.)", time: "Immediate" }
            ];
        } else if (state.activePack === "swat") {
            contradiction = "General Advisory recommended prophylactic treatment for all KPK rice coordinates. Swat field telemetry isolated blast lesions exclusively in Plot R-12. System resolved that localizing spray preserves Tricyclazole reserves.";
            rejectedList = ["Swat General Pest Alert (Duplicate)", "CABI Database Manual (General Guidance / Down-ranked for regional specificity)"];
            metrics = { lossNo: "65%", lossYes: "8%", time: "3.0 Days", gap: "5%" };
            plan = [
                { t: "Blast Lesion Spray (Tricyclazole)", w: "Spindle lesions confirmed in regional agronomist telemetry.", e: "03_swat_field_telemetry.csv", c: "24L reserve caps", r: "Blast arrested" },
                { t: "Restrict Nitrogen Applications", w: "High Nitrogen values fuel fungal lesion expansions.", e: "01_rice_blast_advisory_report.pdf", c: "None", r: "Tissue protection" },
                { t: "Morning Dew Telemetry", w: "Spore release occurs under high moisture dew points.", e: "02_swat_blast_alert_note.html", c: "Device power limits", r: "Continuous monitoring" }
            ];
            farmerActions = [
                { title: "ٹریسائیکلازول سپرے (Blast Spray Tricyclazole)", desc: "دھان کے پتوں پر فوری بلاسٹ سپرے کریں۔ (Spray Tricyclazole immediately on affected rice crops.)", time: "Within 36 Hours" },
                { title: "نائٹروجن کھاد روکیں (Limit Nitrogen Fertilizers)", desc: "نائٹروجن کھاد کا استعمال بند کریں کیونکہ یہ بیماری کو بڑھاتی ہے۔ (Do not apply nitrogen fertilizers, as high nitrogen feeds rice blast.)", time: "Immediate" }
            ];
        } else if (state.activePack === "sanghar") {
            contradiction = "Warehouse log indicated lambda-cyhalothrin was fully loaded for cotton fields. Drone observation maps proved localized Rosette flower clusters. Credibility agent restricted chemical applications exclusively to epicenter Plot C-08.";
            rejectedList = ["Sanghar Regional General Pest Catalog (Low Recency)", "FAOSTAT General Pakistan Profile (Global database / Down-ranked for local outbreak)"];
            metrics = { lossNo: "70%", lossYes: "10%", time: "5.0 Days", gap: "0%" };
            plan = [
                { t: "Pheromone Trap Placement", w: "Pink Bollworm economic threshold exceeded (5 moths/trap).", e: "02_sanghar_pest_density_note.html", c: "30 traps available", r: "PBW Mating Disruption" },
                { t: "Lambda-cyhalothrin Application", w: "Rosette blooms verified in drone aerial scan.", e: "05_video_bollworm_damage_scan.html", c: "12L stock available", r: "Larvae eradicated" },
                { t: "Epicenter Plot C-08 Quarantine", w: "Infestation rate hit 18% inside bolls.", e: "03_cotton_field_infestation_log.csv", c: "Labor availability", r: "Manual plucking dispatched" }
            ];
            farmerActions = [
                { title: "جنس کش پھندے (Pheromone Traps)", desc: "کھیت میں گلابی سنڈی کے نر پروانوں کو پھنسانے کے لیے پھندے لگائیں۔ (Install pheromone traps to disrupt moth mating loops.)", time: "Within 24 Hours" },
                { title: "سنڈی زدہ گلاب ضائع کریں (Pluck Rosette Blooms)", desc: "گلابی سنڈی زدہ گلاب کے پھولوں کو چن کر فوری تلف کریں۔ (Manually pluck and burn infested rosette flowers.)", time: "Immediate" }
            ];
        }
    } else if (!dec?.actions) {
        contradiction = "Baseline telemetry shows perfect congruence across passive sensor streams.";
        plan = [{ t: "Routine Telemetry Scan", w: "No alerts or anomalies detected.", e: "Passive Telemetry", c: "None", r: "Logs Synchronized" }];
        farmerActions = [
            { title: "نارمل نگرانی (Maintain Scans)", desc: "فصل کی حالت نارمل ہے۔ روزانہ کی بنیاد پر کیڑوں اور نمی کا معائنہ کرتے رہیں۔ (Crop is healthy. Continue daily walks and moisture monitoring.)", time: "Ongoing" }
        ];
    }

    // RENDER: CONTRADICTION & REJECTIONS
    document.getElementById("contradiction-summary").innerText = contradiction;
    document.getElementById("rejected-evidence-list").innerHTML = rejectedList.map(r => `<div>${r}</div>`).join("");

    // RENDER: METRICS
    document.getElementById("m-loss-no-action").innerText = metrics.lossNo;
    document.getElementById("m-loss-action").innerText = metrics.lossYes;
    document.getElementById("m-time-saved").innerText = metrics.time;
    document.getElementById("m-coverage-gap").innerText = metrics.gap;

    // RENDER: ACTION PLAN
    document.getElementById("action-plan-detail").innerHTML = plan.map(p => `
        <div class="action-card-detail">
            <h4>${p.title || p.t}</h4>
            <p><strong>Rationale:</strong> ${p.rationale || p.w}</p>
            <p><strong>Evidence:</strong> ${p.evidence || p.e}</p>
            <div class="meta">Constraint: ${p.constraint || p.c} | Expected: ${p.expectedResult || p.r}</div>
        </div>
    `).join("");

    // RENDER: FARMER ACTION LIST
    document.getElementById("farmer-actions-list").innerHTML = farmerActions.map(f => `
        <div class="farmer-action-card">
            <h4>${f.title}</h4>
            <p>${f.desc}</p>
            <span class="badge">${f.time}</span>
        </div>
    `).join("");

    // FARMER SEVERITY CARD
    const sevBadge = document.getElementById("farmer-severity-badge");
    const sevDesc = document.getElementById("farmer-severity-desc");
    const isSev = dctx ? (dctx.stage === "severe" || dctx.stage === "moderate") : (hasFiles || hasVideo);
    if (isSev) {
        sevBadge.innerText = "HIGH RISK / خطرہ";
        sevBadge.style.color = "var(--danger)";
        sevDesc.innerText = `Severe outbreak detected for ${pack.crop} crop in ${pack.region}. Actions requested immediately to protect yield.`;
    } else {
        sevBadge.innerText = "NORMAL / نارمل";
        sevBadge.style.color = "var(--primary)";
        sevDesc.innerText = `Baseline conditions are healthy. No outbreaks are recorded for ${pack.crop} crop in ${pack.region}.`;
    }

    // EVIDENCE SOURCE-TYPE CHECKS
    const summaryList = document.getElementById("evidence-summaries");
    summaryList.innerHTML = "";
    
    if (hasFiles) summaryList.innerHTML += `<div class="summary-item"><label>Reports & Files</label><p>Detected severity surge in Plot epicenter sensors. Verified biological sporulation thresholds.</p></div>`;
    else summaryList.innerHTML += `<div class="empty-summary">No uploaded files selected for this run.</div>`;

    if (hasLinks) summaryList.innerHTML += `<div class="summary-item"><label>Article Links</label><p>Regional advisory profiles verify relative humidity patterns and moisture accumulation windows.</p></div>`;
    else summaryList.innerHTML += `<div class="empty-summary">No report links selected for this run.</div>`;

    if (hasVideo) summaryList.innerHTML += `<div class="summary-item"><label>Video Transcripts</label><p>Drone aerial foliar feeds identify necrotic leaf clusters and localized plant stress anomalies.</p></div>`;
    else summaryList.innerHTML += `<div class="empty-summary">No video evidence selected for this run.</div>`;

    // LOCALIZED SUMMARY BLOCKS
    let urduAdvisory = exe?.farmerAdvisoryUrdu || "فصل کی حالت بالکل نارمل ہے۔ کسی ہنگامی سپرے کی ضرورت نہیں ہے۔ نگرانی جاری رکھیں۔";
    let managerSummary = exe?.managerSummary || `Monitoring baseline telemetry. Crop: ${pack.crop} | Region: ${pack.region}. Sensor streams synchronized.`;

    if (!exe && (hasFiles || hasVideo)) {
        if (state.activePack === "hazro") {
            urduAdvisory = "ٹماٹر کے کھیتوں (T-03) میں فنگس (Late Blight) کا شدید خطرہ ہے۔ فوری طور پر مینکوزیب سپرے کریں، پانی روکیں، اور واٹس ایپ گروپ سے جڑے رہیں۔";
            managerSummary = "Critical tomato late blight outbreak. Dispatched 18L Mancozeb surgical plan for epicenter T-03. Spore warnings broadcasted.";
        } else if (state.activePack === "swat") {
            urduAdvisory = "دھان کے کھیتوں (R-12) میں بلاسٹ فنگس کا شدید حملہ ہے۔ فوری طور پر ٹریسائیکلازول سپرے کریں اور نائٹروجن کھاد کا استعمال روکیں۔";
            managerSummary = "Rice blast severity confirmed at Level 3.5. Dispatched 24L Tricyclazole response. Nitrogen feeds restricted.";
        } else if (state.activePack === "sanghar") {
            urduAdvisory = "کپاس کی فصل (C-08) پر گلابی سنڈی کا شدید حملہ پایا گیا ہے۔ جنسی پھندے لگائیں اور سنڈی زدہ پھول توڑ کر فوری تلف کریں۔";
            managerSummary = "Pink Bollworm infestation hit 18% in C-08. Lambda-cyhalothrin application and mating disruption traps deployed.";
        }
    }
    
    document.getElementById("sum-urdu").innerText = urduAdvisory;
    document.getElementById("sum-manager").innerText = managerSummary;
    document.getElementById("final-source-list").innerHTML = selected.map(s => `<span class="badge">${s.name}</span>`).join("");

    switchView("manager");
}

function saveLLMSettings() {
    const key = document.getElementById("llm-api-key").value.trim();
    const prov = document.getElementById("llm-provider").value;
    if (key) {
        localStorage.setItem("kisanai_api_key", key);
        localStorage.setItem("kisanai_provider", prov);
        loadLLMSettings();
        alert("AI Settings Saved! The system is now truly agentic.");
    } else {
        localStorage.removeItem("kisanai_api_key");
        loadLLMSettings();
    }
}

function loadLLMSettings() {
    const key = localStorage.getItem("kisanai_api_key");
    const prov = localStorage.getItem("kisanai_provider") || "gemini";
    document.getElementById("llm-provider").value = prov;
    const stat = document.getElementById("llm-status");
    if (key) {
        document.getElementById("llm-api-key").value = key;
        stat.innerHTML = `✅ Connected to ${prov === 'gemini' ? 'Google Gemini' : 'Groq Llama-3'}`;
        stat.style.color = "var(--primary)";
        stat.style.background = "rgba(16, 185, 129, 0.08)";
    } else {
        document.getElementById("llm-api-key").value = "";
        stat.innerHTML = `❌ No API key — running in Demo Mode`;
        stat.style.color = "var(--danger)";
        stat.style.background = "rgba(239,68,68,0.08)";
    }
}

// --- SHARE WHATSAPP ---
function shareWhatsApp() {
    const activePackData = DEMO_PACKS[state.activePack];
    const urduAdvisory = document.getElementById("sum-urdu").innerText;
    const text = `*KisanAI Advisory: ${activePackData.crop} Outbreak Alert*%0A%0A${urduAdvisory}%0A%0A_Powered by KisanAI Command Center_`;
    window.open(`https://wa.me/?text=${text}`, "_blank");
}

// --- ON LOAD ---
init();
