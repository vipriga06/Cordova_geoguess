
// Support both Cordova and browser environments
if (typeof cordova !== 'undefined') {
    document.addEventListener('deviceready', onDeviceReady, false);
} else {
    // If not running in Cordova, initialize immediately when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onDeviceReady);
    } else {
        onDeviceReady();
    }
}

const difficultySettings = {
    easy: { multiplier: 1, maxScore: 5000, falloff: 800000 },
    medium: { multiplier: 1.2, maxScore: 5000, falloff: 450000 },
    hard: { multiplier: 1.4, maxScore: 5000, falloff: 250000 }
};

const locationPool = [
    { name: 'Paris, Francia', lat: 48.85837, lng: 2.29448, hint: 'Torre iconica de hierro' },
    { name: 'Nueva York, USA', lat: 40.68925, lng: -74.0445, hint: 'Isla con estatua verde' },
    { name: 'Rio de Janeiro, Brasil', lat: -22.95191, lng: -43.21049, hint: 'Cristo en el cerro' },
    { name: 'El Cairo, Egipto', lat: 29.97923, lng: 31.1342, hint: 'Triangulos antiguos en el desierto' },
    { name: 'Sidney, Australia', lat: -33.85678, lng: 151.2153, hint: 'Techo de conchas blancas' },
    { name: 'Tokio, Japon', lat: 35.65858, lng: 139.74543, hint: 'Torre roja tipo Eiffel' },
    { name: 'Ciudad de Mexico, Mexico', lat: 19.43262, lng: -99.13321, hint: 'Centro historico latino' },
    { name: 'Londres, Reino Unido', lat: 51.50073, lng: -0.12463, hint: 'Reloj junto al rio' },
    { name: 'Roma, Italia', lat: 41.89021, lng: 12.49223, hint: 'Anfiteatro de piedra' },
    { name: 'Reikiavik, Islandia', lat: 64.127, lng: -21.8174, hint: 'Iglesia moderna en la costa' }
];

const state = {
    round: 0,
    score: 0,
    target: null,
    guess: null,
    map: null,
    targetMarker: null,
    guessMarker: null,
    lineLayer: null
};

function onDeviceReady() {
    if (typeof cordova !== 'undefined') {
        console.log('Running cordova-' + cordova.platformId + '@' + cordova.version);
    } else {
        console.log('Running in browser mode');
    }
    initUI();
    initMap();
    bindControls();
    setStatus('Listo para empezar. Pulsa "Nueva ronda".');
}

function initUI() {
    const selects = document.querySelectorAll('select');
    M.FormSelect.init(selects);
    const modals = document.querySelectorAll('.modal');
    M.Modal.init(modals);
}

function initMap() {
    if (!window.L) {
        setStatus('Leaflet no se cargo. Revisa tu conexion.');
        return;
    }

    state.map = L.map('pano', {
        worldCopyJump: true,
        zoomControl: true
    }).setView([20, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: ''
    }).addTo(state.map);

    state.map.on('click', onMapClick);

    window.addEventListener('resize', () => {
        if (state.map) {
            setTimeout(() => state.map.invalidateSize(), 150);
        }
    });
}

function bindControls() {
    const startBtn = document.getElementById('btnStart');
    const guessBtn = document.getElementById('btnGuess');
    const revealBtn = document.getElementById('btnReveal');
    const resetBtn = document.getElementById('btnReset');

    startBtn?.addEventListener('click', handleStartRound);
    guessBtn?.addEventListener('click', handleGuess);
    revealBtn?.addEventListener('click', handleReveal);
    resetBtn?.addEventListener('click', handleReset);
}

function handleStartRound() {
    if (!state.map) {
        setStatus('Mapa no listo.');
        return;
    }

    clearOverlays();
    state.round += 1;
    state.target = pickRandomLocation();
    state.guess = null;
    updateScoreboard();
    setDistance('--');
    state.map.setView([20, 0], 2);

    const hint = state.target?.hint ? ` Pista: ${state.target.hint}.` : '';
    setStatus(`Ronda ${state.round}: explora y marca tu guess.${hint}`);
}

function onMapClick(event) {
    state.guess = { lat: event.latlng.lat, lng: event.latlng.lng };
    placeGuessMarker(event.latlng);
    setStatus('Ubicacion marcada. Pulsa "Adivinar".');
}

function handleGuess() {
    if (!state.target) {
        M.toast({ html: 'Inicia una ronda primero' });
        return;
    }
    if (!state.guess) {
        M.toast({ html: 'Marca primero tu ubicacion' });
        return;
    }

    const distanceMeters = haversineDistance(state.guess, state.target) * 1000;
    const gained = calculateScore(distanceMeters);
    state.score += gained;

    placeTargetMarker(state.target);
    drawLine(state.guess, state.target);

    updateScoreboard(distanceMeters);
    setStatus(`Distancia: ${formatDistance(distanceMeters)}. Puntaje +${gained}.`);
    M.toast({ html: `Obtuviste ${gained} puntos` });
}

function handleReveal() {
    if (!state.target) {
        M.toast({ html: 'No hay ronda activa' });
        return;
    }
    placeTargetMarker(state.target);
    if (state.guess) {
        drawLine(state.guess, state.target);
    }
    setStatus('Ubicacion revelada.');
}

function handleReset() {
    clearOverlays();
    state.round = 0;
    state.score = 0;
    state.target = null;
    state.guess = null;
    updateScoreboard();
    setDistance('--');
    setStatus('Partida reiniciada.');
}

function pickRandomLocation() {
    const idx = Math.floor(Math.random() * locationPool.length);
    return locationPool[idx];
}

function placeGuessMarker(latlng) {
    if (!state.map) return;
    if (state.guessMarker) {
        state.guessMarker.setLatLng(latlng);
    } else {
        state.guessMarker = L.marker(latlng, { title: 'Tu guess' }).addTo(state.map);
    }
}

function placeTargetMarker(location) {
    if (!state.map || !location) return;
    const latlng = { lat: location.lat, lng: location.lng };
    if (state.targetMarker) {
        state.targetMarker.setLatLng(latlng);
    } else {
        state.targetMarker = L.marker(latlng, { title: location.name }).addTo(state.map);
    }
}

function drawLine(from, to) {
    if (!state.map || !from || !to) return;
    const points = [
        [from.lat, from.lng],
        [to.lat, to.lng]
    ];
    if (state.lineLayer) {
        state.lineLayer.setLatLngs(points);
    } else {
        state.lineLayer = L.polyline(points, { color: '#009688', weight: 3, opacity: 0.9 }).addTo(state.map);
    }
}

function clearOverlays() {
    if (state.guessMarker) {
        state.guessMarker.remove();
        state.guessMarker = null;
    }
    if (state.targetMarker) {
        state.targetMarker.remove();
        state.targetMarker = null;
    }
    if (state.lineLayer) {
        state.lineLayer.remove();
        state.lineLayer = null;
    }
}

function calculateScore(distanceMeters) {
    const difficulty = getDifficulty();
    const settings = difficultySettings[difficulty] || difficultySettings.easy;
    const raw = settings.maxScore * Math.exp(-distanceMeters / settings.falloff);
    const score = Math.max(0, Math.round(raw * settings.multiplier));
    return Math.min(score, Math.round(settings.maxScore * settings.multiplier));
}

function getDifficulty() {
    const select = document.getElementById('difficultySelect');
    return select?.value || 'easy';
}

function updateScoreboard(distanceMeters) {
    const roundLabel = document.getElementById('roundLabel');
    const scoreLabel = document.getElementById('scoreLabel');
    if (roundLabel) roundLabel.textContent = state.round || '--';
    if (scoreLabel) scoreLabel.textContent = state.score || 0;
    setDistance(distanceMeters ?? '--');
}

function setDistance(distanceMeters) {
    const distanceLabel = document.getElementById('distanceLabel');
    if (!distanceLabel) return;
    if (distanceMeters === '--') {
        distanceLabel.textContent = '--';
        return;
    }
    distanceLabel.textContent = formatDistance(distanceMeters);
}

function setStatus(message) {
    const statusLabel = document.getElementById('statusLabel');
    if (statusLabel) {
        statusLabel.textContent = message;
    }
}

function haversineDistance(a, b) {
    const R = 6371; // km
    const dLat = deg2rad(b.lat - a.lat);
    const dLon = deg2rad(b.lng - a.lng);
    const lat1 = deg2rad(a.lat);
    const lat2 = deg2rad(b.lat);

    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return R * c; // km
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

function formatDistance(distanceMeters) {
    if (distanceMeters < 1000) {
        return `${Math.round(distanceMeters)} m`;
    }
    const km = distanceMeters / 1000;
    return `${km.toFixed(km >= 100 ? 0 : km >= 10 ? 1 : 2)} km`;
}
