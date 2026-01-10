import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, push, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { firebaseConfig } from './firebase-config.js';

// === GLOBAL STATE ===
const appState = {
    user: null, // { role: 'admin' | 'judge', token: string }
    data: {
        config: { title: "Lomba", criteria: [], judgeToken: "JURI123" },
        participants: {}
    }
};

// === INIT FIREBASE ===
let db;
try {
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    console.log("🔥 Firebase Connected:", firebaseConfig.projectId);
    hideLoading();
} catch (e) {
    console.error("Firebase Error:", e);
    Swal.fire("Error System", "Gagal koneksi ke database. Periksa internet.", "error");
}

// === EXPOSE TO WINDOW ===
window.switchTab = (tab) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add('active');
    document.querySelectorAll('.auth-form').forEach(f => f.classList.add('hidden'));
    document.getElementById(`${tab}Form`).classList.remove('hidden');
    document.getElementById('loginError').innerText = "";
};

window.attemptLogin = async (role) => {
    showLoading();
    const configRef = ref(db, 'config');
    onValue(configRef, (snapshot) => {
        // Use default if not set in DB
        const config = snapshot.val() || {};
        const dbJudgeToken = config.judgeToken || 'JURI123';
        const adminPass = '@Morleke11'; // Hardcoded Master Password

        let success = false;
        if (role === 'admin') {
            const pass = document.getElementById('adminPass').value;
            // Strict check
            if (pass === adminPass) success = true;
        } else {
            const token = document.getElementById('judgeToken').value.trim();
            // Strict check match with DB token
            if (token === dbJudgeToken) success = true;
        }

        if (success) {
            const session = { role, token: role === 'admin' ? 'ADMIN' : dbJudgeToken };
            localStorage.setItem('juri_session', JSON.stringify(session));
            initSession(session);
        } else {
            hideLoading();
            document.getElementById('loginError').innerText = "Akses ditolak. Cek password/token.";
        }
    }, { onlyOnce: true });
};

window.logout = () => {
    Swal.fire({
        title: 'Logout?',
        text: "Anda akan keluar dari sesi ini.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Ya, Keluar'
    }).then((result) => {
        if (result.isConfirmed) {
            localStorage.removeItem('juri_session');
            window.location.reload();
        }
    });
};

window.navTo = (page) => {
    document.querySelectorAll('.page-view').forEach(p => p.classList.add('hidden'));
    document.getElementById(`page-${page}`).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
    document.querySelector('.sidebar').classList.remove('open');
};

window.toggleSidebar = () => {
    document.querySelector('.sidebar').classList.toggle('open');
};

// === CORE LOGIC ===
function showLoading() { document.getElementById('loadingOverlay').style.opacity = '1'; document.getElementById('loadingOverlay').classList.remove('hidden'); }
function hideLoading() {
    setTimeout(() => {
        document.getElementById('loadingOverlay').style.opacity = '0';
        setTimeout(() => document.getElementById('loadingOverlay').classList.add('hidden'), 500);
    }, 500);
}

function initSession(session) {
    appState.user = session;
    document.getElementById('authSection').classList.add('hidden');
    document.getElementById('appSection').classList.remove('hidden');

    // Role Visibility
    if (session.role !== 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
    } else {
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    }
    document.getElementById('userRoleDisplay').innerText = session.role === 'admin' ? 'Administrator' : 'Dewan Juri';

    startRealtimeSync();
    hideLoading();


    // Show Global Lock for JUDGE (Not Admin)
    if (session.role !== 'admin') {
        const ga = document.getElementById('globalActions');
        if (ga) ga.style.display = 'flex';
    } else {
        const ga = document.getElementById('globalActions');
        if (ga) ga.style.display = 'none';

        // ADMIN SPECIFIC: Monitor Archive Existence to Color the Button
        checkArchiveStatus();
    }
}

function checkArchiveStatus() {
    console.log("DEBUG: checkArchiveStatus started...");
    const btn = document.getElementById('btnOpenArchive');
    if (!btn) {
        console.warn("DEBUG: Button btnOpenArchive NOT FOUND in DOM");
        return;
    }

    const archivesRef = ref(db, 'archives');
    onValue(archivesRef, (snap) => {
        const val = snap.val();
        console.log("DEBUG: Archive Snapshot Value:", val);
        const count = snap.exists() ? snap.numChildren() : 0;
        console.log("DEBUG: Archive Count:", count);

        if (snap.exists() && count > 0) {
            // Ada Arsip -> HIJAU
            console.log("DEBUG: Setting Button to GREEN");
            btn.style.borderColor = '#10b981';
            btn.style.color = '#10b981';
            btn.style.opacity = '1';
            btn.innerHTML = `<i class="fas fa-folder-open"></i> Buka Arsip Lama (${count} Data)`;
            // Force redraw hack if needed, but style change should trigger
        } else {
            // Kosong -> ABU-ABU
            console.log("DEBUG: Setting Button to GRAY");
            btn.style.borderColor = '#64748b';
            btn.style.color = '#64748b';
            btn.innerHTML = '<i class="fas fa-folder-open"></i> Buka Arsip Lama (Kosong)';
        }
    }); // Listener ini akan terus aktif
}


function startRealtimeSync() {
    // 1. Config
    onValue(ref(db, 'config'), (snapshot) => {
        const config = snapshot.val();
        if (config) {
            appState.data.config = config;
            updateUIConfig(config);
            // Re-render participants if criteria changes
            if (appState.data.participants) renderParticipants(appState.data.participants);
        } else {
            set(ref(db, 'config'), {
                title: "Lomba Baru 2026",
                adminPass: "admin123",
                judgeToken: "JURI" + Math.floor(Math.random() * 9999),
                criteria: [{ name: "Umum", weight: 100 }]
            });
        }
    });

    // 2. Participants
    onValue(ref(db, 'participants'), (snapshot) => {
        const data = snapshot.val() || {}; // Handle empty
        appState.data.participants = data;
        renderParticipants(data);
        renderStandings(data);
    });
}

// === RENDERERS ===
function updateUIConfig(config) {
    document.getElementById('competitionTitleDisplay').innerText = config.title;
    document.getElementById('confTitle').value = config.title;

    // Update Token Input if exists (Renamed from tokenDisplay)
    const tokenInp = document.getElementById('confJudgeToken');
    if (tokenInp) tokenInp.value = config.judgeToken || '';

    // Criteria List
    const cList = document.getElementById('criteriaListConfig');
    cList.innerHTML = '';
    let totalPoints = 0;

    (config.criteria || []).forEach((c, idx) => {
        totalPoints += parseFloat(c.weight || 0);
        cList.innerHTML += `
            <div class="criteria-input-group animate__animated animate__fadeIn">
                <input class="form-control" style="flex:2; margin-right:5px" onchange="window.updateCriteria(${idx}, 'name', this.value)" value="${c.name}" placeholder="Nama Kriteria">
                <input class="form-control text-center text-warning font-bold" style="flex:1; margin-right:5px" type="number" onchange="window.updateCriteria(${idx}, 'weight', this.value)" value="${c.weight}" placeholder="Max Poin">
                <button class="btn-sm btn-danger" onclick="window.deleteCriteria(${idx})"><i class="fas fa-trash"></i></button>
            </div>
        `;
    });

    // Feedback Total
    const feedback = document.getElementById('totalPointsFeedback');
    if (!feedback) cList.insertAdjacentHTML('afterend', '<div id="totalPointsFeedback" class="text-right text-sm mt-2 font-bold"></div>');
    const fbEl = document.getElementById('totalPointsFeedback');
    let color = Math.abs(totalPoints - 100) < 0.1 ? '#10b981' : '#f59e0b';
    fbEl.innerHTML = `<span style="color: ${color}">Total Kuota Poin: ${totalPoints.toFixed(0)} (Ideal: 100)</span>`;
}


// INTELLIGENT RENDERER: Updates DOM instead of replacing it to prevent Focus Loss
// INTELLIGENT RENDERER: Updates DOM instead of replacing it to prevent Focus Loss
function renderParticipants(participantsMap) {
    const grid = document.getElementById('scoringContainer');

    // Safety & Empty State Handler
    if (!participantsMap || Object.keys(participantsMap).length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-clipboard-list" style="font-size:3em; color:var(--text-muted); margin-bottom:10px;"></i>
                <p>Belum ada peserta.</p>
            </div>
        `;
        return;
    }

    // Sort participants
    const sorted = Object.entries(participantsMap).sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

    // 1. Remove deleted items (items in DOM but not in new Data)
    Array.from(grid.children).forEach(child => {
        if (child.classList.contains('empty-state')) {
            child.remove(); // Remove empty state if we have data
        } else if (child.dataset.pid && !participantsMap[child.dataset.pid]) {
            child.remove(); // Remove participant card
        }
    });

    // 2. Add or Update items
    sorted.forEach(([id, p]) => {
        let card = document.getElementById(`card-${id}`);
        const totalScore = calculateTotal(p.scores, appState.data.config.criteria);
        // Determine State
        const isPermLocked = p.locked === true;
        const isSubmitted = p.submitted === true;

        // CREATE NEW CARD
        if (!card) {
            card = document.createElement('div');
            card.id = `card-${id}`;
            card.dataset.pid = id;
            card.className = "participant-card animate__animated animate__zoomIn";

            // Basic Structure
            card.innerHTML = `
                <div class="p-header">
                    <div class="p-name">${p.name}</div>
                    <div class="p-score" id="score-${id}">0</div>
                </div>
                <div id="inputs-${id}"></div>
                <div class="action-footer mt-3" style="display:flex; justify-content:space-between; align-items:center;" id="actions-${id}">
                   <!-- Content injected in diffing -->
                </div>
            `;
            grid.appendChild(card);
        }

        // UPDATE BUTTONS DYNAMICALLY
        const actionContainer = document.getElementById(`actions-${id}`);
        // We use a data attribute to prevent constant HTML trashing if state is same
        const newStateSig = `${appState.user.role}-${isPermLocked}-${isSubmitted}`;
        if (actionContainer.dataset.sig !== newStateSig) {
            actionContainer.dataset.sig = newStateSig;
            if (appState.user.role === 'admin') {
                actionContainer.innerHTML = `
                    <button class="btn-icon text-danger" onclick="window.deleteParticipant('${id}')"><i class="fas fa-trash"></i> Hapus</button>
                    ${isPermLocked ? '<span class="badge bg-danger">FINAL</span>' : (isSubmitted ? '<span class="badge bg-success">SIAP</span>' : '<span class="badge bg-secondary">DRAFT</span>')}
                `;
            } else {
                // JUDGE VIEW
                if (isPermLocked) {
                    actionContainer.innerHTML = `<button disabled class="btn-sm" style="width:100%; background:#ef4444; border:none; color:white; padding:10px; border-radius:8px"><i class="fas fa-lock"></i> NILAI FINAL (TERKUNCI)</button>`;
                } else if (isSubmitted) {
                    actionContainer.innerHTML = `
                        <div style="display:flex; gap:10px; width:100%">
                             <button disabled class="btn-sm" style="flex:2; background:#10b981; border:none; opacity:1; color:white; padding:10px; border-radius:8px"><i class="fas fa-check"></i> SUDAH DISIMPAN</button>
                             <button onclick="window.setLocalStatus('${id}', false)" class="btn-sm" style="flex:1; background:#f59e0b; border:none; color:white; padding:10px; border-radius:8px"><i class="fas fa-edit"></i> EDIT</button>
                        </div>
                    `;
                } else {
                    actionContainer.innerHTML = `
                        <button onclick="window.setLocalStatus('${id}', true)" class="btn-sm" style="width:100%; background:var(--primary); border:none; color:white; padding:10px; border-radius:8px"><i class="fas fa-save"></i> SIMPAN</button>
                    `;
                }
            }
        }

        // UPDATE VALUES (Diffing)
        // 1. Total Score
        const scoreEl = document.getElementById(`score-${id}`);
        if (scoreEl.innerText !== totalScore) scoreEl.innerText = totalScore;

        // 2. Locked State update (for button text/style)
        if (appState.user.role === 'admin') {
            const lockBtn = document.getElementById(`lock-${id}`);
            if (lockBtn) {
                if (isLocked) {
                    lockBtn.innerHTML = '<i class="fas fa-lock"></i> TERKUNCI';
                    lockBtn.classList.add('btn-danger');
                    lockBtn.classList.remove('btn-secondary');
                } else {
                    lockBtn.innerHTML = '<i class="fas fa-unlock"></i> SIMPAN';
                    lockBtn.classList.add('btn-secondary');
                    lockBtn.classList.remove('btn-danger');
                }
            }
        }


        // 3. Inputs Logic
        const inputsContainer = document.getElementById(`inputs-${id}`);
        const criteria = appState.data.config.criteria || [];

        // Determine Input Lock State (Perm Locked or Soft Submitted)
        // ADMIN Should NOT be able to edit scores.
        const isAdmin = appState.user.role === 'admin';
        const disableInputs = isPermLocked || isSubmitted || isAdmin;

        // Ensure inputs match criteria length
        let existingInputs = inputsContainer.querySelectorAll('input');
        if (existingInputs.length !== criteria.length) {
            inputsContainer.innerHTML = criteria.map((c, i) => `
                <div class="criteria-input-group">
                    <label style="flex:1; text-align:left;">
                        ${c.name} 
                        <span style="font-size:0.7em; color:var(--text-muted); display:block;">Max: ${c.weight}</span>
                    </label>
                    <input type="number" 
                        id="input-${id}-${i}"
                        data-crit="${c.name}"
                        max="${c.weight}"
                        style="width: 70px; font-weight:bold;"
                        onfocus="this.select()"
                        oninput="window.handleInput('${id}', ${i}, this, ${c.weight})"
                        onkeydown="if(event.key === 'Enter') this.blur();"
                        placeholder="0">
                </div>
            `).join('');
            existingInputs = inputsContainer.querySelectorAll('input');
        }


        // Update Values & Attributes
        existingInputs.forEach((inp, idx) => {
            const criterion = criteria[idx];
            if (!criterion) return;

            const critName = criterion.name;
            const maxVal = parseFloat(criterion.weight);
            const serverVal = (p.scores && p.scores[critName]);

            // Update attributes
            inp.setAttribute('max', maxVal);

            // Disable if Admin or Locked
            if (inp.disabled !== disableInputs) inp.disabled = disableInputs;

            // Visual cue
            inp.style.opacity = disableInputs ? '0.6' : '1';
            inp.style.cursor = disableInputs ? 'not-allowed' : 'text';

            // Only update value if NOT focused to avoid cursor jumping
            if (document.activeElement !== inp) {
                // If server has value, show it. If 0/undefined, show empty string visually or 0
                const displayVal = (serverVal !== undefined) ? serverVal : '';
                if (inp.value != displayVal) {
                    inp.value = displayVal;
                }
            }
        });
    }); // END renderParticipants Loop

    // LIST ADMIN (Simple redraw is fine here as no inputs)
    const list = document.getElementById('participantListAdmin');
    if (list) {
        list.innerHTML = sorted.map(([id, p]) => `
            <div class="glass-panel mb-2 flex justify-between" style="display:flex; justify-content:space-between; align-items:center;">
                <span>${p.name}</span>
                <div>
                     <!-- Lock indicator logic -->
                    <span class="badge ${p.locked ? 'bg-danger' : 'bg-success'} mr-2">${p.locked ? 'Final' : 'Draft'}</span>
                    <button onclick="window.deleteParticipant('${id}')" class="text-danger"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');
    }
}

function getPredikat(score) {
    if (score >= 91) return { label: "JUARA 1", class: "rank-1" };
    if (score >= 81) return { label: "JUARA 2", class: "rank-2" };
    if (score >= 71) return { label: "JUARA 3", class: "rank-3" };
    return { label: "TIDAK JUARA", class: "rank-none" };
}

function renderStandings(participantsMap) {
    const tbody = document.getElementById('standingsTable');
    tbody.innerHTML = '';
    const arr = Object.values(participantsMap).map(p => ({
        ...p,
        finalScore: Math.round(parseFloat(calculateTotal(p.scores, appState.data.config.criteria)))
    }));

    // Sort by Score Descending
    arr.sort((a, b) => b.finalScore - a.finalScore);

    arr.forEach((p, idx) => {
        const predikat = getPredikat(p.finalScore);

        tbody.innerHTML += `
            <tr class="animate__animated animate__fadeIn">
                <td style="font-weight:600">${p.name}</td>
                <td class="text-center font-bold text-lg">${p.finalScore}</td>
                <td class="${predikat.class} text-right" style="font-weight:bold; font-size: 1.1em">${predikat.label}</td>
            </tr>
        `;
    });
}

// === HELPERS ===
function calculateTotal(scores, criteria) {
    if (!scores || !criteria) return "0";
    let total = 0;
    criteria.forEach(c => {
        const s = parseFloat(scores[c.name]) || 0;
        total += s;
    });
    // Return whole number as requested
    return Math.round(total).toString();
}

window.handleInput = (id, critIdx, el, maxValParam) => {
    // 1. Resolve Criteria Name safely using Index (Fixes "Khoto'" quote bug)
    const criteria = appState.data.config.criteria;
    const critObj = criteria[critIdx];
    if (!critObj) return; // safety
    const critName = critObj.name;

    // Priority: Attribute Max (Dynamic) -> Param Max (Baked) 
    const attrMax = parseFloat(el.getAttribute('max'));
    // Fallback if needed
    const maxVal = !isNaN(attrMax) ? attrMax : maxValParam;

    let val = parseFloat(el.value);

    // Safety check
    if (isNaN(val)) val = 0;

    // Logic Popup jika melebihi batas
    if (val > maxVal) {
        val = maxVal;
        el.value = maxVal;
        Swal.fire({
            icon: 'error', title: 'MELEBIHI BATAS!', text: `Nilai Maksimal: ${maxVal}`,
            timer: 1000, showConfirmButton: false, toast: true, position: 'center',
            background: '#b91c1c', color: '#ffffff', iconColor: '#ffffff'
        });
    }

    // Negative check
    if (val < 0) { val = 0; el.value = 0; }

    // === OPTIMISTIC UPDATE ===
    if (!appState.data.participants[id].scores) appState.data.participants[id].scores = {};
    appState.data.participants[id].scores[critName] = val;

    const totalEl = document.getElementById(`score-${id}`);
    if (totalEl) {
        const newTotal = calculateTotal(appState.data.participants[id].scores, appState.data.config.criteria);
        totalEl.innerText = newTotal;
        totalEl.style.transition = '0.2s';
        totalEl.style.transform = 'scale(1.2)';
        setTimeout(() => totalEl.style.transform = 'scale(1)', 200);
    }

    update(ref(db, `participants/${id}/scores`), {
        [critName]: val
    });
};

window.setLocalStatus = (id, status) => {
    // Only update 'submitted' field (Soft Lock)
    update(ref(db, `participants/${id}`), { submitted: status });
};

window.lockAllValues = () => {
    Swal.fire({
        title: 'Kunci SEMUA Nilai?',
        text: "Aksi ini PERMANEN! Nilai tidak bisa diedit lagi.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Ya, Kunci Permanen'
    }).then((res) => {
        if (res.isConfirmed) {
            const updates = {};
            const parts = appState.data.participants || {};
            Object.keys(parts).forEach(pid => {
                updates[`participants/${pid}/locked`] = true;
                updates[`participants/${pid}/submitted`] = true;
            });
            if (Object.keys(updates).length > 0) {
                update(ref(db), updates).then(() => {
                    Swal.fire('Terkunci', 'Semua nilai Final.', 'success');
                });
            } else {
                Swal.fire('Info', 'Tidak ada data peserta.', 'info');
            }
        }
    });
};

window.openAddModal = () => {
    Swal.fire({
        title: 'Tambah Peserta',
        html: `
            <div style="display:flex; justify-content:center; gap:10px; margin-bottom:15px;">
                <button type="button" id="tabManual" class="btn-sm" style="background:var(--primary); border:none; color:white; padding:8px 15px; border-radius:5px;" onclick="window.switchSwalTab('manual')">Manual</button>
                <button type="button" id="tabAuto" class="btn-sm" style="background:#334155; border:none; color:white; padding:8px 15px; border-radius:5px;" onclick="window.switchSwalTab('auto')">Otomatis (Paste)</button>
            </div>
            
            <div id="viewManual">
                <input id="swalName" class="swal2-input" placeholder="Nama Peserta">
            </div>

            <div id="viewAuto" style="display:none;">
                <textarea id="swalPaste" class="swal2-textarea" placeholder="Tempel disini...&#10;Contoh:&#10;1. Andi&#10;2. Budi&#10;3. Citra" style="height:150px; font-size:0.9em;"></textarea>
                <div style="font-size:0.8em; color:#94a3b8; text-align:left; margin-top:5px;">
                    *Sistem akan otomatis mendeteksi format "Angka. Nama"
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Simpan',
        cancelButtonText: 'Batal',
        didOpen: () => {
            // Focus Input
            document.getElementById('swalName').focus();
        },
        preConfirm: () => {
            const isManual = document.getElementById('viewManual').style.display !== 'none';
            if (isManual) {
                const name = document.getElementById('swalName').value;
                if (!name) return Swal.showValidationMessage('Nama wajib diisi');
                return { mode: 'manual', data: name };
            } else {
                const text = document.getElementById('swalPaste').value;
                if (!text) return Swal.showValidationMessage('Teks tidak boleh kosong');
                return { mode: 'auto', data: text };
            }
        }
    }).then((res) => {
        if (res.isConfirmed) {
            const { mode, data } = res.value;

            if (mode === 'manual') {
                pushRef(data);
                Swal.fire('Sukses', 'Peserta ditambahkan', 'success');
            } else {
                // Parse Auto
                // Strategy: Split by regex (\d+\.) to handle "1. Name 2. Name" inline or newline
                const rawParts = data.split(/\d+\./);
                const names = rawParts
                    .map(s => s.trim())
                    .filter(s => s.length > 0) // Remove empty empty splits
                    .filter(s => s.length < 100); // Sanity check length

                if (names.length === 0) {
                    Swal.fire('Gagal', 'Format tidak dikenali. Gunakan "1. Nama"', 'error');
                } else {
                    names.forEach(n => pushRef(n));
                    Swal.fire('Sukses', `${names.length} Peserta berhasil ditambahkan!`, 'success');
                }
            }
        }
    });

    function pushRef(name) {
        const newRef = push(ref(db, 'participants'));
        set(newRef, {
            id: newRef.key,
            name: name,
            createdAt: Date.now(),
            scores: {},
            locked: false,
            submitted: false
        });
    }
};

// Global helper for the Swal HTML
window.switchSwalTab = (mode) => {
    const manual = document.getElementById('viewManual');
    const auto = document.getElementById('viewAuto');
    const bM = document.getElementById('tabManual');
    const bA = document.getElementById('tabAuto');

    if (mode === 'manual') {
        manual.style.display = 'block';
        auto.style.display = 'none';
        bM.style.background = 'var(--primary)';
        bA.style.background = '#334155';
        document.getElementById('swalName').focus();
    } else {
        manual.style.display = 'none';
        auto.style.display = 'block';
        bM.style.background = '#334155';
        bA.style.background = 'var(--primary)';
        document.getElementById('swalPaste').focus();
    }
};

window.deleteParticipant = (id) => {
    Swal.fire({
        title: 'Hapus Peserta?',
        text: "Data akan hilang permanen.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Hapus'
    }).then((r) => {
        if (r.isConfirmed) {
            remove(ref(db, `participants/${id}`));
        }
    });
};

window.saveSettings = () => {
    const title = document.getElementById('confTitle').value;
    const judgeToken = document.getElementById('confJudgeToken').value;

    const updates = { title };

    // Only update token if it's not empty and different
    if (judgeToken && judgeToken.trim() !== "") {
        updates.judgeToken = judgeToken.trim();
    }

    update(ref(db, 'config'), updates).then(() => {
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Tersimpan!', timer: 1000, showConfirmButton: false });
    });
};

// === ARCHIVE SYSTEM ===
window.saveToArchive = () => {
    // Basic verification
    if (appState.user.role !== 'admin') {
        Swal.fire('Akses Ditolak', 'Hanya admin yang boleh mengarsipkan.', 'error');
        return;
    }

    Swal.fire({
        title: 'Arsipkan Lomba Saat Ini?',
        text: "Data saat ini akan disimpan ke folder Arsip (Aman di Firebase Cloud).",
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Ya, Arsipkan'
    }).then((result) => {
        if (result.isConfirmed) {
            const timestamp = Date.now();
            const dateStr = new Date().toLocaleDateString('id-ID');
            // Ensure data exists
            const currentParts = appState.data.participants || {};
            const currentConfig = appState.data.config || {};

            if (Object.keys(currentParts).length === 0) {
                Swal.fire('Info', 'Data peserta kosong, tidak ada yang perlu diarsipkan.', 'warning');
                return;
            }

            const archiveData = {
                timestamp: timestamp,
                dateDisplay: dateStr,
                config: currentConfig,
                participants: currentParts,
                archivedBy: appState.user.token
            };

            const newArchiveRef = push(ref(db, 'archives'));
            console.log("Saving archive...", archiveData);

            set(newArchiveRef, archiveData)
                .then(() => {
                    Swal.fire('Sukses', 'Data Lomba berhasil diamankan ke Arsip!', 'success');
                })
                .catch((err) => {
                    console.error("Archive Error:", err);
                    Swal.fire('Gagal', 'Terjadi kesalahan saat menyimpan: ' + err.message, 'error');
                });
        }
    });
};

window.toggleArchiveView = () => {
    const section = document.getElementById('archiveSection');
    // Toggle Logic
    if (section.style.display === 'none') {
        section.style.display = 'block';

        // INIT LOAD
        const listEl = document.getElementById('archiveList');
        listEl.innerHTML = `
            <div style="text-align:center; padding:10px;">
                <i class="fas fa-spinner fa-spin"></i> Memuat Data Arsip...
            </div>`;

        // FETCH REALTIME
        onValue(ref(db, 'archives'), (snapshot) => {
            if (!snapshot.exists() || !snapshot.val()) {
                listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#94a3b8"><i class="fas fa-folder-open" style="font-size:2em; margin-bottom:10px;"></i><br>Belum ada data arsip.</div>';
                return;
            }

            const data = snapshot.val();
            let html = '<ul style="list-style:none; padding:0;">';

            // Sort by latest desc
            const sortedKeys = Object.keys(data).sort((a, b) => {
                const nav = data[a].timestamp || 0;
                const nbv = data[b].timestamp || 0;
                return nbv - nav;
            });

            sortedKeys.forEach(key => {
                const item = data[key];
                const title = item.config?.title || "Tanpa Judul";
                const date = item.dateDisplay || new Date(item.timestamp).toLocaleDateString();
                const pCount = item.participants ? Object.keys(item.participants).length : 0;


                html += `
                    <li style="background:rgba(0,0,0,0.2); padding:10px; border-radius:8px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; border:1px solid rgba(255,255,255,0.05);">
                        <div>
                            <div style="font-weight:bold; color:var(--primary); font-size:1.05em;">${title}</div>
                            <small class="text-muted"><i class="far fa-calendar"></i> ${date} • <i class="fas fa-users"></i> ${pCount} Peserta</small>
                        </div>
                        <div style="display:flex; gap:5px;">
                            <button onclick="window.loadArchive('${key}')" class="btn-sm" style="background:#475569; border:none; color:white; cursor:pointer; padding:6px 12px; border-radius:6px; transition:0.2s" title="Download Laporan PDF">
                                 <i class="fas fa-file-pdf"></i> PDF
                            </button>
                            <button onclick="window.downloadArchiveExcel('${key}')" class="btn-sm" style="background:#10b981; border:none; color:white; cursor:pointer; padding:6px 12px; border-radius:6px; transition:0.2s" title="Download Excel">
                                 <i class="fas fa-file-excel"></i> Excel
                            </button>
                        </div>
                    </li>
                `;
            });
            html += '</ul>';
            listEl.innerHTML = html;
        }); // Realtime listener (no onlyOnce)

    } else {
        section.style.display = 'none';
    }
};



window.loadArchive = (key) => {
    onValue(ref(db, `archives/${key}`), (snapshot) => {
        const item = snapshot.val();
        if (!item) return;

        // Generate PDF directly from archive data
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const title = item.config.title || "Tanpa Judul";
        const date = item.dateDisplay || "-";

        doc.text(`ARSIP: ${title} (${date})`, 14, 20);

        const crit = item.config.criteria || [];
        const parts = Object.values(item.participants || {})
            .map(p => {
                // Re-calculate based on saved data
                let total = 0;
                crit.forEach(c => {
                    total += parseFloat(p.scores?.[c.name] || 0);
                });
                return { ...p, finalScore: Math.round(total) };
            })
            .sort((a, b) => b.finalScore - a.finalScore);

        const rows = parts.map(p => [p.name, p.finalScore, getPredikat(p.finalScore).label]);

        doc.autoTable({
            head: [['Nama Peserta', 'Total Nilai', 'Predikat/Juara']],
            body: rows,
            startY: 30,
        });
        doc.save(`Arsip-${title}.pdf`);
        Swal.fire({ toast: true, icon: 'success', title: 'Laporan Arsip diunduh' });
    }, { onlyOnce: true });
};

window.downloadArchiveExcel = (key) => {
    onValue(ref(db, `archives/${key}`), (snapshot) => {
        const item = snapshot.val();
        if (!item) return;

        const title = item.config.title || "Lomba";
        const crit = item.config.criteria || [];

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Nama Peserta,Total Nilai,Predikat/Juara";

        // Add Criteria Headers ? Optional. Keeping simple as requested first.
        // csvContent += "," + crit.map(c => c.name).join(","); 
        csvContent += "\n";

        const parts = Object.values(item.participants || {})
            .map(p => {
                let total = 0;
                crit.forEach(c => {
                    total += parseFloat(p.scores?.[c.name] || 0);
                });
                return { ...p, finalScore: Math.round(total) };
            })
            .sort((a, b) => b.finalScore - a.finalScore);

        parts.forEach((p) => {
            const pred = getPredikat(p.finalScore);
            const row = `"${p.name}",${p.finalScore},${pred.label}`;
            csvContent += row + "\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Arsip-${title}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        Swal.fire({ toast: true, icon: 'success', title: 'Excel Arsip diunduh' });
    }, { onlyOnce: true });
};

window.addCriteria = () => {
    const current = appState.data.config.criteria || [];
    // Generate Unique Name
    let newName = "Kriteria " + (current.length + 1);
    let i = 1;
    while (current.find(c => c.name === newName)) {
        i++;
        newName = "Kriteria " + (current.length + i);
    }

    const updated = [...current, { name: newName, weight: 25 }];
    update(ref(db, 'config'), { criteria: updated });
};

window.updateCriteria = (idx, field, val) => {
    const current = appState.data.config.criteria || [];

    // Prevent duplicate names and handle migration
    if (field === 'name') {
        if (!val) return;
        if (current.some((c, i) => i !== idx && c.name === val)) {
            Swal.fire('Error', 'Nama kriteria harus unik!', 'error');
            return; // Don't save duplicate
        }

        // DATA MIGRATION: If renaming, move the scores too!
        const oldName = current[idx].name;
        if (oldName && oldName !== val) {
            const updates = {};
            const parts = appState.data.participants || {};

            Object.keys(parts).forEach(pid => {
                const p = parts[pid];
                if (p.scores && p.scores[oldName] !== undefined) {
                    // Copy value to new key
                    updates[`participants/${pid}/scores/${val}`] = p.scores[oldName];
                    // Delete old key
                    updates[`participants/${pid}/scores/${oldName}`] = null;
                }
            });

            if (Object.keys(updates).length > 0) update(ref(db), updates);
        }
    }

    current[idx][field] = val;
    update(ref(db, 'config'), { criteria: current });
};

window.deleteCriteria = (idx) => {
    const current = appState.data.config.criteria || [];
    current.splice(idx, 1);
    update(ref(db, 'config'), { criteria: current });
};

window.autoDistribute = () => {
    const current = appState.data.config.criteria || [];
    if (current.length === 0) return;
    const count = current.length;
    const weightPerItem = Math.floor(100 / count);
    const updated = current.map((c, i) => {
        let w = weightPerItem;
        if (i === count - 1) w = 100 - (weightPerItem * (count - 1));
        return { ...c, weight: w };
    });
    update(ref(db, 'config'), { criteria: updated });
    Swal.fire('Sukses', `Reset ke ${count} kriteria (Total 100)`, 'success');
};

window.copyToken = () => {
    const t = document.getElementById('tokenDisplay').innerText;
    navigator.clipboard.writeText(t);
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Token Disalin!', timer: 1500, showConfirmButton: false });
};

window.downloadPDF = () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text(`Klasemen: ${appState.data.config.title}`, 14, 20);
    const rows = [];

    // Sort logic same as render
    const participants = Object.values(appState.data.participants).map(p => ({
        ...p,
        finalScore: Math.round(parseFloat(calculateTotal(p.scores, appState.data.config.criteria)))
    })).sort((a, b) => b.finalScore - a.finalScore);

    participants.forEach((p, i) => {
        const pred = getPredikat(p.finalScore);
        rows.push([p.name, p.finalScore, pred.label]);
    });

    doc.autoTable({
        head: [['Nama Peserta', 'Total Nilai', 'Predikat / Juara']],
        body: rows,
        startY: 30,
        columnStyles: {
            1: { halign: 'center' },
            2: { halign: 'right' }
        }
    });
    doc.save('klasemen-results.pdf');
};

window.downloadExcel = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Nama Peserta,Total Nilai,Predikat/Juara\n"; // Header

    // Sort logic same as render
    const participants = Object.values(appState.data.participants).map(p => ({
        ...p,
        finalScore: Math.round(parseFloat(calculateTotal(p.scores, appState.data.config.criteria)))
    })).sort((a, b) => b.finalScore - a.finalScore);

    participants.forEach((p) => {
        const pred = getPredikat(p.finalScore);
        const row = `"${p.name}",${p.finalScore},${pred.label}`;
        csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "klasemen_juri_pro.csv"); // CSV opens in Excel
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('juri_session');
    if (saved) {
        initSession(JSON.parse(saved));
    } else {
        hideLoading();
        document.getElementById('authSection').classList.remove('hidden');
    }
});

// === HOTFIXES OVERRIDES ===

// FIXED: Add Participant Modal with Robust Parsing and UI
window.openAddModal = () => {
    // Override helper to ensure it works
    window.switchSwalTab = (mode) => {
        const manual = document.getElementById('viewManual');
        const auto = document.getElementById('viewAuto');
        const bM = document.getElementById('tabManual');
        const bA = document.getElementById('tabAuto');

        if (manual && auto && bM && bA) {
            if (mode === 'manual') {
                manual.style.display = 'block';
                auto.style.display = 'none';
                bM.style.background = '#0ea5e9';
                bA.style.background = '#334155';
                setTimeout(() => { const el = document.getElementById('swalName'); if (el) el.focus(); }, 50);
            } else {
                manual.style.display = 'none';
                auto.style.display = 'block';
                bM.style.background = '#334155';
                bA.style.background = '#0ea5e9';
                setTimeout(() => { const el = document.getElementById('swalPaste'); if (el) el.focus(); }, 50);
            }
        }
    };

    Swal.fire({
        title: 'Tambah Peserta',
        html: `
            <div style="display:flex; justify-content:center; gap:10px; margin-bottom:15px;">
                <button type="button" id="tabManual" onclick="window.switchSwalTab('manual')"
                        style="background:#0ea5e9; border:none; color:white; padding:8px 15px; border-radius:5px; cursor:pointer;">
                    Manual
                </button>
                <button type="button" id="tabAuto" onclick="window.switchSwalTab('auto')"
                        style="background:#334155; border:none; color:white; padding:8px 15px; border-radius:5px; cursor:pointer;">
                    Otomatis (Paste)
                </button>
            </div>
            
            <div id="viewManual">
                <input id="swalName" class="swal2-input" placeholder="Nama Peserta">
            </div>

            <div id="viewAuto" style="display:none;">
                <textarea id="swalPaste" class="swal2-textarea" 
                          placeholder="Paste disini...&#10;Contoh format:&#10;1. Andi&#10;2. Budi" 
                          style="height:150px; font-size:0.9em; width:100%; box-sizing:border-box;"></textarea>
                <div style="font-size:0.8em; color:#94a3b8; text-align:left; margin-top:5px;">
                    *Salin daftar nama berformat angka dari Excel/Word lalu tempel disini.
                    <br>Atau cukup satu nama per baris.
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Simpan',
        cancelButtonText: 'Batal',
        didOpen: () => {
            window.switchSwalTab('manual');
        },
        preConfirm: () => {
            const isManual = document.getElementById('viewManual').style.display !== 'none';
            if (isManual) {
                const name = document.getElementById('swalName').value;
                if (!name) return Swal.showValidationMessage('Nama wajib diisi');
                return { mode: 'manual', data: name };
            } else {
                const text = document.getElementById('swalPaste').value;
                if (!text) return Swal.showValidationMessage('Teks tidak boleh kosong');
                return { mode: 'auto', data: text };
            }
        }
    }).then((res) => {
        if (res.isConfirmed) {
            const { mode, data } = res.value;

            if (mode === 'manual') {
                pushRef(data);
                Swal.fire('Sukses', 'Peserta ditambahkan', 'success');
            } else {
                // Improved Parsing for Auto
                let names = [];
                // Basic strategy: split by newlines, clean up numbering
                const lines = data.split('\n');
                lines.forEach(line => {
                    // Removes "1.", "1)", "1 " at start, and trims
                    const clean = line.replace(/^\s*\d+[.)\t\s]+\s*/, '').trim();
                    if (clean.length > 0 && clean.length < 100) names.push(clean);
                });

                if (names.length === 0) {
                    Swal.fire('Gagal', 'Format tidak dikenali. Pastikan ada nama peserta.', 'error');
                } else {
                    names.forEach(n => pushRef(n));
                    Swal.fire('Sukses', `${names.length} Peserta berhasil diimport!`, 'success');
                }
            }
        }
    });

    function pushRef(name) {
        if (!name) return;
        const newRef = push(ref(db, 'participants'));
        set(newRef, {
            id: newRef.key,
            name: name,
            createdAt: Date.now(),
            scores: {},
            locked: false,
            submitted: false
        });
    }
};
