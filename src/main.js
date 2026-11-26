import { TwinSimulation } from './twinState.js';
import { WarehouseScene } from './warehouseScene.js';

const sim = new TwinSimulation();
sim.pushLog('cryotwin/wh04/edge/gw-01/status', '{"broker":"in-kingdom-iot","twin":"SYNCED"}', 'info');

let selectedId = 'iot-gw-cloud-01';

const canvas = document.getElementById('scene-canvas');
const scene = new WarehouseScene(canvas, sim, (id) => {
  selectDevice(id);
});
scene.selectDevice(selectedId);

// DOM refs
const kpiDf = document.getElementById('kpi-df-temp');
const kpiCh = document.getElementById('kpi-ch-temp');
const kpiBf = document.getElementById('kpi-bf-temp');
const kpiPower = document.getElementById('kpi-power');
const kpiAlerts = document.getElementById('kpi-alerts');
const cloudDot = document.getElementById('cloud-status-dot');
const alertBanner = document.getElementById('alert-banner');
const alertBannerText = document.getElementById('alert-banner-text');

const deviceListEl = document.getElementById('device-list');
const inspectorEl = document.getElementById('inspector-content');
const mqttLogEl = document.getElementById('mqtt-log');

function selectDevice(id) {
  selectedId = id;
  scene.selectDevice(id);
  renderFleetList();
  renderInspector();
}

function renderFleetList() {
  deviceListEl.innerHTML = '';
  sim.devices.forEach((d) => {
    const btn = document.createElement('button');
    btn.className = `device-item${d.id === selectedId ? ' selected' : ''}`;
    btn.innerHTML = `
      <div>
        <span class="device-name">${d.name}</span>
        <span class="device-meta">${d.type} • ${d.zone}</span>
      </div>
      <span class="badge badge-${d.status}">${d.status === 'ok' ? 'OK' : d.status.toUpperCase()}</span>
    `;
    btn.addEventListener('click', () => selectDevice(d.id));
    deviceListEl.appendChild(btn);
  });
}

function renderInspector() {
  const d = sim.getDevice(selectedId);
  if (!d) return;

  const metricBoxes = Object.entries(d.metrics)
    .map(
      ([k, v]) => `
      <div class="tele-box">
        <span class="tele-label">${k}</span>
        <span class="tele-val">${v}</span>
      </div>`
    )
    .join('');

  const cmdButtons = d.commands
    .map((cmd) => `<button class="btn btn-primary" data-cmd="${cmd}">${cmd}</button>`)
    .join('');

  inspectorEl.innerHTML = `
    <div class="inspector-header">
      <h3 class="inspector-title">${d.name}</h3>
      <span class="badge badge-${d.status}">${d.status === 'ok' ? 'ONLINE' : d.status.toUpperCase()}</span>
    </div>
    <div class="inspector-topic">${d.topic}</div>
    <div class="telemetry-grid">${metricBoxes}</div>
    <div class="cmd-row">${cmdButtons}</div>
  `;

  inspectorEl.querySelectorAll('[data-cmd]').forEach((btn) => {
    btn.addEventListener('click', () => {
      sim.runCommand(d.id, btn.dataset.cmd);
      renderFleetList();
      renderInspector();
      renderMqttLog();
    });
  });
}

function renderMqttLog() {
  mqttLogEl.innerHTML = sim.logs
    .slice(0, 20)
    .map(
      (entry) => `
      <div class="mqtt-entry ${entry.level}">
        <span class="mqtt-topic"><span class="mqtt-time">${entry.time}</span>${entry.topic}</span>
        <span>${entry.payload}</span>
      </div>`
    )
    .join('');
}

// Camera preset buttons
document.querySelectorAll('#camera-presets [data-cam]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#camera-presets .pill').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    scene.setCameraPreset(btn.dataset.cam);
  });
});

// Layer toggles
const layerEls = {
  thermal: document.getElementById('layer-thermal'),
  iot: document.getElementById('layer-iot'),
  xray: document.getElementById('layer-xray'),
  paths: document.getElementById('layer-paths'),
};
const syncLayers = () => {
  scene.setLayerVisibility({
    thermal: layerEls.thermal.checked,
    iot: layerEls.iot.checked,
    xray: layerEls.xray.checked,
    paths: layerEls.paths.checked,
  });
};
Object.values(layerEls).forEach((el) => el.addEventListener('change', syncLayers));

// Scenario buttons
document.getElementById('btn-scenario-excursion').addEventListener('click', () => {
  sim.triggerFaultScenario();
  renderFleetList();
  renderInspector();
  renderMqttLog();
});

document.getElementById('btn-scenario-normal').addEventListener('click', () => {
  sim.restoreNominal();
  renderFleetList();
  renderInspector();
  renderMqttLog();
});

window.addEventListener('resize', () => scene.resize());

// Initial render
renderFleetList();
renderInspector();
renderMqttLog();

// Main animation + telemetry loop
let lastTime = performance.now();
let uiAccum = 0;

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  const { loadKw, alertCount } = sim.step(dt);
  scene.update(dt, now / 1000);

  uiAccum += dt;
  if (uiAccum >= 0.45) {
    uiAccum = 0;
    kpiDf.textContent = `${sim.zones.deepFreeze.temp.toFixed(1)} °C`;
    kpiCh.textContent = `${sim.zones.chilled.temp >= 0 ? '+' : ''}${sim.zones.chilled.temp.toFixed(1)} °C`;
    kpiBf.textContent = `${sim.zones.blast.temp.toFixed(1)} °C`;
    kpiPower.textContent = `${loadKw.toFixed(1)} kW`;
    kpiAlerts.textContent = String(alertCount);
    kpiAlerts.className = `kpi-value ${alertCount > 0 ? 'status-danger' : 'status-ok'}`;

    cloudDot.classList.toggle('alert', alertCount > 0);
    if (sim.faultActive) {
      alertBanner.classList.remove('hidden');
      alertBannerText.textContent = `THERMAL EXCURSION: Dock Door #2 Open • Zone D at +${sim.zones.dock.temp.toFixed(1)} °C`;
    } else {
      alertBanner.classList.add('hidden');
    }

    renderInspector();
    renderMqttLog();
  }
}

requestAnimationFrame(animate);
