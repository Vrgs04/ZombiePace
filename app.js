const CONFIG = {
  zombieCount: {
    "Fácil": 4,
    Normal: 6,
    Intenso: 8
  },
  zombieSpeedMetersPerTick: {
    "Fácil": 2.2,
    Normal: 3.2,
    Intenso: 4.6
  },
  spawnMinMeters: 80,
  spawnMaxMeters: 220,
  attackDistanceMeters: 20,
  dangerDistanceMeters: 50,
  zombieTickMs: 1800,
  scoreTickMs: 1000,
  difficultyRampMs: 120000,
  historyKey: "zombie-pace-history"
};

const state = {
  map: null,
  userMarker: null,
  zombies: [],
  watchId: null,
  zombieTimer: null,
  scoreTimer: null,
  rampTimer: null,
  startedAt: null,
  lastPosition: null,
  currentPosition: null,
  followUser: true,
  mode: "Caminar",
  difficulty: "Normal",
  speedMultiplier: 1,
  distanceMeters: 0,
  points: 0,
  lives: 3,
  nearestZombieMeters: null,
  isRunning: false
};

const els = {
  startScreen: document.querySelector("#startScreen"),
  gameScreen: document.querySelector("#gameScreen"),
  summaryScreen: document.querySelector("#summaryScreen"),
  startButton: document.querySelector("#startButton"),
  stopButton: document.querySelector("#stopButton"),
  recenterButton: document.querySelector("#recenterButton"),
  newSessionButton: document.querySelector("#newSessionButton"),
  permissionMessage: document.querySelector("#permissionMessage"),
  sessionMode: document.querySelector("#sessionMode"),
  dangerBanner: document.querySelector("#dangerBanner"),
  timeStat: document.querySelector("#timeStat"),
  distanceStat: document.querySelector("#distanceStat"),
  speedStat: document.querySelector("#speedStat"),
  pointsStat: document.querySelector("#pointsStat"),
  livesStat: document.querySelector("#livesStat"),
  nearestStat: document.querySelector("#nearestStat"),
  summaryTime: document.querySelector("#summaryTime"),
  summaryDistance: document.querySelector("#summaryDistance"),
  summaryPoints: document.querySelector("#summaryPoints"),
  summaryDifficulty: document.querySelector("#summaryDifficulty"),
  summaryMode: document.querySelector("#summaryMode"),
  startHistoryList: document.querySelector("#startHistoryList"),
  summaryHistoryList: document.querySelector("#summaryHistoryList")
};

document.addEventListener("DOMContentLoaded", initApp);

function initApp() {
  renderHistory();
  els.startButton.addEventListener("click", startSession);
  els.stopButton.addEventListener("click", () => endSession("manual"));
  els.recenterButton.addEventListener("click", recenterMap);
  els.newSessionButton.addEventListener("click", showStartScreen);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {
      console.info("Service worker no registrado en este entorno.");
    });
  }
}

function startSession() {
  if (!("geolocation" in navigator)) {
    showPermissionMessage("Tu navegador no tiene soporte de geolocalización.");
    return;
  }

  state.mode = getSelectedValue("mode");
  state.difficulty = getSelectedValue("difficulty");
  resetSessionState();
  showPermissionMessage("Solicitando ubicación...");
  els.startButton.disabled = true;

  navigator.geolocation.getCurrentPosition(
    (position) => {
      showGameScreen();
      bootstrapMap(position);
      createZombies();
      startTracking();
      startGameLoops();
      updateStats();
      els.startButton.disabled = false;
    },
    (error) => {
      showPermissionMessage(getLocationErrorMessage(error));
      els.startButton.disabled = false;
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 2000
    }
  );
}

function resetSessionState() {
  clearGameLoops();
  state.zombies.forEach((zombie) => zombie.marker?.remove());
  state.zombies = [];
  state.startedAt = Date.now();
  state.lastPosition = null;
  state.currentPosition = null;
  state.distanceMeters = 0;
  state.points = 0;
  state.lives = 3;
  state.nearestZombieMeters = null;
  state.speedMultiplier = 1;
  state.followUser = true;
  state.isRunning = true;
}

function bootstrapMap(position) {
  const coords = toLatLng(position.coords);
  state.currentPosition = coords;
  state.lastPosition = {
    ...coords,
    timestamp: position.timestamp
  };

  if (!state.map) {
    state.map = L.map("map", {
      zoomControl: false,
      attributionControl: true,
      dragging: true,
      tap: false,
      touchZoom: true,
      scrollWheelZoom: false
    });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }).addTo(state.map);

    L.control.zoom({ position: "topright" }).addTo(state.map);
    state.map.on("dragstart zoomstart", () => {
      state.followUser = false;
      updateRecenterButton();
    });
  }

  state.map.setView(coords, 17);

  if (!state.userMarker) {
    state.userMarker = L.marker(coords, {
      icon: L.divIcon({
        className: "",
        html: "<span class=\"user-marker\"></span>",
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      }),
      interactive: false
    }).addTo(state.map);
  } else {
    state.userMarker.setLatLng(coords);
  }
}

function startTracking() {
  state.watchId = navigator.geolocation.watchPosition(
    handlePositionUpdate,
    (error) => {
      showPermissionMessage(getLocationErrorMessage(error));
    },
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 1000
    }
  );
}

function handlePositionUpdate(position) {
  if (!state.isRunning) return;

  const next = toLatLng(position.coords);
  const previous = state.lastPosition;
  state.currentPosition = next;

  if (previous) {
    const moved = distanceBetween(previous, next);
    if (moved > 1 && moved < 120) {
      state.distanceMeters += moved;
    }
  }

  state.lastPosition = {
    ...next,
    timestamp: position.timestamp,
    speed: position.coords.speed
  };

  state.userMarker.setLatLng(next);
  if (state.followUser) {
    state.map.panTo(next, { animate: true, duration: 0.55 });
  }
  updateStats();
}

function recenterMap() {
  if (!state.currentPosition || !state.map) return;

  state.followUser = true;
  state.map.panTo(state.currentPosition, { animate: true, duration: 0.45 });
  updateRecenterButton();
}

function createZombies() {
  const count = CONFIG.zombieCount[state.difficulty];
  for (let index = 0; index < count; index += 1) {
    const position = randomPointAround(state.currentPosition);
    const marker = L.marker(position, {
      icon: L.divIcon({
        className: "",
        html: "<span class=\"zombie-marker\"></span>",
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      }),
      interactive: false
    }).addTo(state.map);

    state.zombies.push({
      id: crypto.randomUUID ? crypto.randomUUID() : `zombie-${Date.now()}-${index}`,
      marker,
      position,
      hasRecentlyAttacked: false
    });
  }
}

function startGameLoops() {
  state.zombieTimer = window.setInterval(moveZombies, CONFIG.zombieTickMs);
  state.scoreTimer = window.setInterval(addSurvivalScore, CONFIG.scoreTickMs);
  state.rampTimer = window.setInterval(() => {
    state.speedMultiplier += 0.12;
  }, CONFIG.difficultyRampMs);
}

function clearGameLoops() {
  if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
  window.clearInterval(state.zombieTimer);
  window.clearInterval(state.scoreTimer);
  window.clearInterval(state.rampTimer);
  state.watchId = null;
  state.zombieTimer = null;
  state.scoreTimer = null;
  state.rampTimer = null;
}

function moveZombies() {
  if (!state.currentPosition) return;

  let nearest = Number.POSITIVE_INFINITY;
  const baseSpeed = CONFIG.zombieSpeedMetersPerTick[state.difficulty] * state.speedMultiplier;

  state.zombies.forEach((zombie) => {
    const distance = distanceBetween(zombie.position, state.currentPosition);
    nearest = Math.min(nearest, distance);

    if (distance < CONFIG.attackDistanceMeters) {
      handleZombieAttack(zombie);
      return;
    }

    const step = Math.min(baseSpeed, Math.max(distance - 1, 0));
    zombie.position = movePointToward(zombie.position, state.currentPosition, step);
    zombie.marker.setLatLng(zombie.position);
  });

  state.nearestZombieMeters = Number.isFinite(nearest) ? nearest : null;
  updateStats();
  updateDangerState();
}

function handleZombieAttack(zombie) {
  if (zombie.hasRecentlyAttacked) return;

  state.lives = Math.max(0, state.lives - 1);
  zombie.hasRecentlyAttacked = true;
  respawnZombie(zombie);

  window.setTimeout(() => {
    zombie.hasRecentlyAttacked = false;
  }, 1400);

  if (state.lives <= 0) {
    endSession("lost");
  }
}

function respawnZombie(zombie) {
  zombie.position = randomPointAround(state.currentPosition);
  zombie.marker.setLatLng(zombie.position);
}

function addSurvivalScore() {
  if (!state.isRunning) return;

  const distanceBonus = state.nearestZombieMeters && state.nearestZombieMeters > CONFIG.dangerDistanceMeters ? 2 : 0;
  const movementBonus = state.distanceMeters > 0 ? 1 : 0;
  state.points += 1 + distanceBonus + movementBonus;
  updateStats();
}

function endSession(reason) {
  if (!state.isRunning) return;

  state.isRunning = false;
  clearGameLoops();
  state.zombies.forEach((zombie) => zombie.marker?.remove());
  state.zombies = [];
  updateDangerState(false);

  const summary = buildSessionSummary(reason);
  saveSession(summary);
  renderSummary(summary);
  renderHistory();
  showSummaryScreen();
}

function buildSessionSummary(reason) {
  const durationSeconds = Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
  return {
    id: Date.now(),
    date: new Date().toISOString(),
    reason,
    durationSeconds,
    distanceMeters: Math.round(state.distanceMeters),
    points: state.points,
    difficulty: state.difficulty,
    mode: state.mode
  };
}

function saveSession(summary) {
  const history = getHistory();
  history.unshift(summary);
  localStorage.setItem(CONFIG.historyKey, JSON.stringify(history.slice(0, 10)));
}

function getHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONFIG.historyKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderSummary(summary) {
  els.summaryTime.textContent = formatDuration(summary.durationSeconds);
  els.summaryDistance.textContent = formatDistance(summary.distanceMeters);
  els.summaryPoints.textContent = String(summary.points);
  els.summaryDifficulty.textContent = summary.difficulty;
  els.summaryMode.textContent = summary.mode;
}

function renderHistory() {
  const history = getHistory();
  const html = history.length
    ? history.map(renderHistoryItem).join("")
    : "Sin sesiones guardadas todavía.";

  els.startHistoryList.innerHTML = html;
  els.summaryHistoryList.innerHTML = html;
  els.startHistoryList.classList.toggle("empty-state", history.length === 0);
  els.summaryHistoryList.classList.toggle("empty-state", history.length === 0);
}

function renderHistoryItem(session) {
  const date = new Date(session.date);
  const dateLabel = Number.isNaN(date.getTime())
    ? "Sesión"
    : date.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });

  return `
    <article class="history-item">
      <div>
        <strong>${session.mode} · ${session.difficulty}</strong>
        <span>${dateLabel} · ${formatDuration(session.durationSeconds)} · ${formatDistance(session.distanceMeters)}</span>
      </div>
      <strong>${session.points}</strong>
    </article>
  `;
}

function updateStats() {
  const elapsedSeconds = state.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : 0;
  els.timeStat.textContent = formatDuration(elapsedSeconds);
  els.distanceStat.textContent = formatDistance(state.distanceMeters);
  els.speedStat.textContent = `${getCurrentSpeedKmh().toFixed(1)} km/h`;
  els.pointsStat.textContent = String(state.points);
  els.livesStat.textContent = String(state.lives);
  els.nearestStat.textContent = state.nearestZombieMeters === null ? "-- m" : `${Math.round(state.nearestZombieMeters)} m`;
}

function updateDangerState(forceVisible) {
  const isDanger = forceVisible ?? (state.nearestZombieMeters !== null && state.nearestZombieMeters < CONFIG.dangerDistanceMeters);
  els.dangerBanner.classList.toggle("is-visible", isDanger);
  els.gameScreen.classList.toggle("pulse-danger", isDanger);
}

function getCurrentSpeedKmh() {
  if (state.lastPosition?.speed && state.lastPosition.speed > 0) {
    return state.lastPosition.speed * 3.6;
  }

  const elapsedHours = (Date.now() - state.startedAt) / 3600000;
  return elapsedHours > 0 ? (state.distanceMeters / 1000) / elapsedHours : 0;
}

function randomPointAround(center) {
  const distance = randomBetween(CONFIG.spawnMinMeters, CONFIG.spawnMaxMeters);
  const bearing = randomBetween(0, 360);
  return destinationPoint(center, distance, bearing);
}

function movePointToward(from, to, meters) {
  const bearing = bearingBetween(from, to);
  return destinationPoint(from, meters, bearing);
}

function toLatLng(coords) {
  return {
    lat: coords.latitude,
    lng: coords.longitude
  };
}

function distanceBetween(a, b) {
  const earthRadius = 6371000;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const deltaLat = toRad(b.lat - a.lat);
  const deltaLng = toRad(b.lng - a.lng);
  const value =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function bearingBetween(a, b) {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const deltaLng = toRad(b.lng - a.lng);
  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function destinationPoint(start, meters, bearingDegrees) {
  const earthRadius = 6371000;
  const angularDistance = meters / earthRadius;
  const bearing = toRad(bearingDegrees);
  const lat1 = toRad(start.lat);
  const lng1 = toRad(start.lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
    Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    lat: toDeg(lat2),
    lng: ((toDeg(lng2) + 540) % 360) - 180
  };
}

function getSelectedValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`).value;
}

function showPermissionMessage(message) {
  els.permissionMessage.textContent = message;
}

function getLocationErrorMessage(error) {
  if (error.code === error.PERMISSION_DENIED) {
    return "Permiso de ubicación denegado. Actívalo para iniciar Zombie Pace.";
  }

  if (error.code === error.POSITION_UNAVAILABLE) {
    return "No se pudo obtener tu ubicación. Revisa señal GPS o permisos.";
  }

  if (error.code === error.TIMEOUT) {
    return "La ubicación tardó demasiado. Intenta de nuevo al aire libre.";
  }

  return "No se pudo iniciar la geolocalización.";
}

function showGameScreen() {
  els.startScreen.hidden = true;
  els.summaryScreen.hidden = true;
  els.gameScreen.hidden = false;
  els.sessionMode.textContent = `${state.mode} · ${state.difficulty}`;
  updateRecenterButton();
  window.setTimeout(() => state.map?.invalidateSize(), 100);
}

function showSummaryScreen() {
  els.startScreen.hidden = true;
  els.gameScreen.hidden = true;
  els.summaryScreen.hidden = false;
}

function showStartScreen() {
  els.summaryScreen.hidden = true;
  els.gameScreen.hidden = true;
  els.startScreen.hidden = false;
  showPermissionMessage("");
}

function updateRecenterButton() {
  els.recenterButton.textContent = state.followUser ? "Siguiendo" : "Mi ubicación";
  els.recenterButton.classList.toggle("is-following", state.followUser);
}

function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDistance(meters) {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }

  return `${Math.round(meters)} m`;
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function toRad(degrees) {
  return (degrees * Math.PI) / 180;
}

function toDeg(radians) {
  return (radians * 180) / Math.PI;
}
