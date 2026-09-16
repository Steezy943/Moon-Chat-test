// Supabase Production Project Routing Handshakes
const SUPABASE_URL = "https://supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_oD3pjw8LGY6uFblF0azYZQ_5CuGNZtL";
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let isLoginMode = false;

// Toggles Authentication Mode Between Sign Up and Login Screen States
window.toggleAuthMode = function() {
    isLoginMode = !isLoginMode;
    document.getElementById('auth-title').innerText = isLoginMode ? "Welcome Back" : "Create Profile";
    document.getElementById('register-fields').style.display = isLoginMode ? "none" : "block";
    document.getElementById('auth-btn').innerText = isLoginMode ? "Log In" : "Sign Up & Join";
    document.getElementById('auth-toggle').innerHTML = isLoginMode ? "New here? <span>Create an account</span>" : "Already have an account? <span>Log In</span>";
}

// Orchestrates Registration Verification and Data Submissions
window.handleSubmit = async function() {
    const name = document.getElementById('username').value.trim();
    const password = document.getElementById('auth-password').value;
    const btn = document.getElementById('auth-btn');
    if (!name || !password) return alert("Please fill in username and password fields.");
    btn.disabled = true;

    if (isLoginMode) {
        // Authenticate User Credentials
        const { data, error } = await supabase.from('user_profiles').select('*').eq('username', name).eq('password_text', password).single();
        if (error || !data) { alert("Invalid account credentials. Try again."); btn.disabled = false; return; }
        enterChatroom(data);
    } else {
        const dob = document.getElementById('birthdate').value;
        const fileInput = document.getElementById('avatar-file');
        if (!dob) { btn.disabled = false; return alert("Birthdate required."); }

        // Username Anti-Theft Lock Checks
        const { data: existingUser } = await supabase.from('user_profiles').select('username').eq('username', name).maybeSingle();
        if (existingUser) { alert("Username is already taken! Choose another one."); btn.disabled = false; return; }

        let avatarUrl = `https://ui-avatars.com{encodeURIComponent(name)}&background=0D8ABC&color=fff`;
        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const fileName = `avatar_${Date.now()}.${file.name.split('.').pop()}`;
            const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file);
            if (!uploadError) avatarUrl = supabase.storage.from('avatars').getPublicUrl(fileName).data.publicUrl;
        }

        const { error: regError } = await supabase.from('user_profiles').insert([{ username: name, password_text: password, birthdate: dob, avatar_url: avatarUrl, hide_dob: false }]);
        if (regError) { alert("Registration database failure."); btn.disabled = false; return; }
        const { data: userProfile } = await supabase.from('user_profiles').select('*').eq('username', name).single();
        enterChatroom(userProfile);
    }
    btn.disabled = false;
}

// Launches Main Chat Panel Screen Layout
function enterChatroom(profile) {
    currentUser = profile;
    document.getElementById('header-avatar').src = profile.avatar_url;
    document.getElementById('header-name').innerText = profile.username;
    document.getElementById('hide-dob-checkbox').checked = profile.hide_dob;
    document.getElementById('setup-container').style.display = 'none';
    document.getElementById('chat-container').style.display = 'flex';
    loadExistingMessages();
    listenForMessages();
}

// Writes Text Input Packets to Database Server Storage
window.sendMessage = async function() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text || !currentUser) return;
    input.value = '';
    await supabase.from('chat_messages').insert([{ text, sender_name: currentUser.username, sender_dob: currentUser.birthdate, avatar_url: currentUser.avatarUrl }]);
}

// Structural Component Generation for Arriving Message Strings
function renderMessage(data) {
    const messagesDiv = document.getElementById('messages');
    const isOwn = currentUser && data.sender_name === currentUser.username;
    const isSenderMod = data.sender_name === 'Steezy';
    const isCurrentMod = currentUser && currentUser.username === 'Steezy';
    
    const msgHTML = `
        <div class="message ${isOwn ? 'own-message' : ''}" id="msg-${data.id}">
            <img class="avatar" src="${data.avatar_url}" alt="">
            <div class="msg-content">
                <div class="msg-meta" onclick="viewUserProfile('${data.sender_name}')">
                    <strong>${data.sender_name}</strong>
                    ${isSenderMod ? '<span class="mod-badge">MOD</span>' : ''}
                    ${isCurrentMod ? `<button class="del-btn" style="display:inline-block;" onclick="deleteMessage(${data.id}, event)">🗑️</button>` : ''}
                </div>
                <div class="msg-body">${data.text}</div>
            </div>
        </div>`;
    messagesDiv.innerHTML += msgHTML;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
// Target Interceptor for Moderator Trashcan Button Clicks
window.deleteMessage = async function(id, event) {
    event.stopPropagation();
    if(confirm("Delete this message permanently?")) {
        await supabase.from('chat_messages').delete().eq('id', id);
    }
}

// Pulls Past Message Histories on Initialization
async function loadExistingMessages() {
    document.getElementById('messages').innerHTML = '';
    const { data } = await supabase.from('chat_messages').select('*').order('created_at', { ascending: true });
    if (data) data.forEach(renderMessage);
}

// Socket Pipe Handlers Intercepting live DB additions/deletions
function listenForMessages() {
    supabase.channel('room1')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, p => renderMessage(p.new))
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, p => {
            const el = document.getElementById(`msg-${p.old.id}`);
            if(el) el.remove();
        })
        .subscribe();
}

// Profile Stats Metrics Lookups Mapped Natively on Name Click Actions
window.viewUserProfile = async function(username) {
    const { data: profile } = await supabase.from('user_profiles').select('*').eq('username', username).single();
    const { count } = await supabase.from('chat_messages').select('*', { count: 'exact', head: true }).eq('sender_name', username);
    if (!profile) return;
    document.getElementById('prof-modal-avatar').src = profile.avatar_url;
    document.getElementById('prof-modal-title').innerText = profile.username;
    document.getElementById('prof-modal-role').innerText = profile.username === 'Steezy' ? 'Global Moderator' : 'User';
    document.getElementById('prof-modal-role').style.color = profile.username === 'Steezy' ? '#ef4444' : '#94a3b8';
    document.getElementById('prof-modal-count').innerText = count || 0;
    document.getElementById('prof-modal-dob').innerText = profile.hide_dob ? "Hidden" : profile.birthdate;
    openModal('profile-modal');
}

// Dispatches Profile Privacy Data Modifiers
window.updatePrivacy = async function(hideDob) {
    if (!currentUser) return;
    currentUser.hide_dob = hideDob;
    await supabase.from('user_profiles').update({ hide_dob: hideDob }).eq('username', currentUser.username);
}

// Swaps CSS Variable Constants dynamically
window.applyTheme = function(theme) {
    if (theme === 'cyberpunk') {
        document.documentElement.style.setProperty('--app-background', 'linear-gradient(135deg, #f107a3 0%, #0bf 100%)');
        document.documentElement.style.setProperty('--primary', '#ff007f');
    } else if (theme === 'matrix') {
        document.documentElement.style.setProperty('--app-background', 'linear-gradient(135deg, #000000 0%, #0d2c0d 100%)');
        document.documentElement.style.setProperty('--primary', '#00ff00');
    } else {
        document.documentElement.style.setProperty('--app-background', '#000000');
        document.documentElement.style.setProperty('--primary', '#0084ff');
    }
}

// Window Pane Visibility Handlers
window.openModal = function(id) { document.getElementById(id).style.display = 'flex'; }
window.closeModal = function(id) { document.getElementById(id).style.display = 'none'; }
window.closeModalOnOutsideClick = function(e, id) { if(e.target.id === id) closeModal(id); }
window.switchTab = function(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    document.getElementById(`panel-${tab}`).classList.add('active');
}
window.logout = function() { currentUser = null; document.getElementById('setup-container').style.display = 'block'; document.getElementById('chat-container').style.display = 'none'; }
window.handleKey = function(e) { if (e.key === 'Enter') sendMessage(); }

/* --- 3D FROSTED GLASS PARALLAX CONTROLLERS LOOKING TOWARDS CURSOR --- */
const panels = document.querySelectorAll('.glass-panel');
document.addEventListener('mousemove', (e) => {
    // Calculates cursor distance offsets relative to screen center coordinates
    const xAxis = (window.innerWidth / 2 - e.clientX) / 15;
    const yAxis = (window.innerHeight / 2 - e.clientY) / 15;
    panels.forEach(p => {
        p.style.transform = `rotateY(${-xAxis}deg) rotateX(${yAxis}deg)`;
    });
});
/* --- CURSOR REPELLING DYNAMIC DOTS ENGINE BACKGROUND CANVAS --- */
const canvas = document.getElementById('particle-canvas');
const ctx = canvas.getContext('2d');
let particles = [], mouse = { x: null, y: null, radius: 140 };

function resizeCanvas() {
    canvas.width = window.innerWidth; 
    canvas.height = window.innerHeight;
    particles = [];
    for (let i = 0; i < (canvas.width * canvas.height) / 8000; i++) {
        particles.push({
            x: Math.random() * canvas.width, 
            y: Math.random() * canvas.height,
            baseX: Math.random() * canvas.width, 
            baseY: Math.random() * canvas.height,
            size: Math.random() * 2.5 + 1, 
            density: (Math.random() * 25) + 12
        });
    }
}

function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    particles.forEach(p => {
        let dx = mouse.x - p.x, dy = mouse.y - p.y, dist = Math.hypot(dx, dy);
        // If mouse is close, push particle points away smoothly
        if (dist < mouse.radius) {
            let force = (mouse.radius - dist) / mouse.radius;
            p.x -= (dx / dist) * force * p.density * 0.5; 
            p.y -= (dy / dist) * force * p.density * 0.5;
        } else { 
            // Return to baseline coordinate grid anchors when mouse leaves proximity
            p.x += (p.baseX - p.x) / 15; 
            p.y += (p.baseY - p.y) / 15; 
        }
        ctx.beginPath(); 
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); 
        ctx.fill();
    });
    requestAnimationFrame(animate);
}

window.addEventListener('resize', resizeCanvas);
document.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
document.addEventListener('mouseout', () => { mouse.x = null; mouse.y = null; });
resizeCanvas(); 
animate();
