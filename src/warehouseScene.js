import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const CAMERA_PRESETS = {
  overview: { pos: [38, 28, 38], target: [0, 2, 0] },
  deepfreeze: { pos: [-16, 14, 18], target: [-15, 4, -5] },
  chilled: { pos: [14, 15, 18], target: [4, 2, -2] },
  blast: { pos: [-20, 10, 20], target: [-16, 3, 11] },
  docks: { pos: [26, 12, 22], target: [16, 2, 10] },
  plant: { pos: [34, 14, -18], target: [20, 3, -12] },
};

export class WarehouseScene {
  constructor(canvas, sim, onSelectDevice) {
    this.canvas = canvas;
    this.sim = sim;
    this.onSelectDevice = onSelectDevice;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#070d18');
    this.scene.fog = new THREE.FogExp2('#070d18', 0.0085);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 250);
    this.camera.position.set(...CAMERA_PRESETS.overview.pos);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 95;
    this.controls.target.set(...CAMERA_PRESETS.overview.target);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.pointerDownPos = { x: 0, y: 0 };

    this.deviceGroups = new Map();
    this.fans = [];
    this.iotLinksGroup = new THREE.Group();
    this.iotPackets = [];
    this.pathGroup = new THREE.Group();
    this.wallMeshes = [];
    this.zoneThermalMats = {};
    this.totes = [];

    this.camAnim = null;
    this.selectedDeviceId = null;

    this._buildLights();
    this._buildFloorAndZones();
    this._buildWalls();
    this._buildDeepFreezeZone();
    this._buildChilledZone();
    this._buildBlastFreezer();
    this._buildDockAndConveyor();
    this._buildPlantAndGateway();
    this._buildSelectionRing();
    this._buildIotLinks();

    this.scene.add(this.iotLinksGroup);
    this.scene.add(this.pathGroup);

    this._bindEvents();
    this.resize();
  }

  _buildLights() {
    const hemi = new THREE.HemisphereLight('#bae6fd', '#0f172a', 0.85);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight('#f8fafc', 1.35);
    dir.position.set(28, 42, 24);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.near = 5;
    dir.shadow.camera.far = 110;
    const d = 38;
    dir.shadow.camera.left = -d;
    dir.shadow.camera.right = d;
    dir.shadow.camera.top = d;
    dir.shadow.camera.bottom = -d;
    this.scene.add(dir);

    const iceLight = new THREE.PointLight('#38bdf8', 1.6, 35);
    iceLight.position.set(-15, 10, -4);
    this.scene.add(iceLight);
  }

  _buildFloorAndZones() {
    const grid = new THREE.GridHelper(90, 45, 0x1e293b, 0x111827);
    grid.position.y = -0.02;
    this.scene.add(grid);

    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(56, 0.3, 38),
      new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.85, metalness: 0.1 })
    );
    slab.position.set(0, -0.15, 0);
    slab.receiveShadow = true;
    this.scene.add(slab);

    const addZoneFloor = (key, x, z, w, d, colorHex) => {
      const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      });
      this.zoneThermalMats[key] = mat;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.02, z);
      this.scene.add(mesh);
    };

    // Zone A: Deep Freeze (-22C)
    addZoneFloor('deepFreeze', -15, -4, 24, 26, '#0284c7');
    // Zone B: Chilled (+2C)
    addZoneFloor('chilled', 5, -4, 16, 26, '#0d9488');
    // Zone C: Blast Freezer (-35C)
    addZoneFloor('blast', -16, 13, 18, 10, '#38bdf8');
    // Zone D: Cold Dock & Staging (+4C)
    addZoneFloor('dock', 11, 13, 32, 10, '#0ea5e9');
  }

  _buildWalls() {
    const wallMat = new THREE.MeshStandardMaterial({
      color: '#334155',
      roughness: 0.4,
      metalness: 0.3,
      transparent: true,
      opacity: 0.32,
    });

    const addWall = (x, y, z, w, h, d) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      m.position.set(x, y, z);
      this.scene.add(m);
      this.wallMeshes.push(m);
    };

    // Perimeter insulated walls
    addWall(0, 5.5, -19, 56, 11, 0.4); // Back
    addWall(-28, 5.5, 0, 0.4, 11, 38); // Left
    addWall(28, 5.5, -4, 0.4, 11, 30); // Right upper
    // Thermal divider between Deep Freeze & Chilled
    addWall(-3, 5.5, -4, 0.3, 11, 26);
  }

  _registerDevice(deviceId, group, gatewayTargetPos) {
    group.traverse((obj) => {
      obj.userData.deviceId = deviceId;
    });
    group.userData.deviceId = deviceId;
    this.deviceGroups.set(deviceId, group);
    this.scene.add(group);
    if (gatewayTargetPos) {
      group.userData.iotOrigin = gatewayTargetPos.clone();
    }
  }

  _createPallet(color = '#d97706') {
    const g = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.18, 1.2),
      new THREE.MeshStandardMaterial({ color: '#92400e', roughness: 0.9 })
    );
    base.position.y = 0.09;
    const load = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 1.0, 1.1),
      new THREE.MeshStandardMaterial({ color, roughness: 0.55 })
    );
    load.position.y = 0.68;
    load.castShadow = true;
    g.add(base, load);
    return g;
  }

  _buildDeepFreezeZone() {
    // High-bay AS/RS Racks
    const rackMat = new THREE.MeshStandardMaterial({ color: '#64748b', metalness: 0.6, roughness: 0.4 });
    const rowXs = [-23, -17, -11, -7];
    rowXs.forEach((rx) => {
      for (let b = 0; b < 5; b++) {
        const z = -14 + b * 4.5;
        for (let t = 0; t < 4; t++) {
          const y = t * 2.3;
          const beam = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 4.2), rackMat);
          beam.position.set(rx, y + 0.1, z);
          this.scene.add(beam);
          if (Math.random() > 0.25) {
            const p = this._createPallet('#38bdf8');
            p.position.set(rx, y + 0.16, z);
            this.scene.add(p);
          }
        }
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 9.5, 0.14), rackMat);
        post.position.set(rx - 0.85, 4.75, z - 2);
        this.scene.add(post);
      }
    });

    // Interactive AS/RS Crane (iot-asrs-crane-01)
    const craneGroup = new THREE.Group();
    craneGroup.position.set(-14, 0, -5);
    const mast = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 9.6, 0.45),
      new THREE.MeshStandardMaterial({ color: '#f59e0b', metalness: 0.5, roughness: 0.3 })
    );
    mast.position.y = 4.8;
    const carriage = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.5, 1.5),
      new THREE.MeshStandardMaterial({ color: '#0ea5e9', emissive: '#0369a1', emissiveIntensity: 0.4 })
    );
    carriage.position.set(0, 3.2, 0);
    const cranePallet = this._createPallet('#7dd3fc');
    cranePallet.position.set(0, 3.45, 0);
    craneGroup.add(mast, carriage, cranePallet);
    this.asrsCrane = { group: craneGroup, carriage, pallet: cranePallet };
    this._registerDevice('iot-asrs-crane-01', craneGroup, new THREE.Vector3(-14, 8, -5));

    // Interactive Evaporator Unit DF-01 (iot-evap-df-01)
    const evapGroup = new THREE.Group();
    evapGroup.position.set(-15, 8.6, -15);
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(6.5, 1.6, 1.8),
      new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.5, roughness: 0.3 })
    );
    evapGroup.add(housing);
    for (let i = -1; i <= 1; i++) {
      const fan = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.15, 0.25),
        new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0284c7', emissiveIntensity: 0.6 })
      );
      fan.position.set(i * 2.0, 0, 0.95);
      evapGroup.add(fan);
      this.fans.push({ mesh: fan, axis: 'z', deviceId: 'iot-evap-df-01' });
    }
    this._registerDevice('iot-evap-df-01', evapGroup, new THREE.Vector3(-15, 8.6, -15));
  }

  _buildChilledZone() {
    const rackMat = new THREE.MeshStandardMaterial({ color: '#475569', metalness: 0.5, roughness: 0.4 });
    [1, 9].forEach((rx) => {
      for (let b = 0; b < 4; b++) {
        const z = -13 + b * 4.5;
        for (let t = 0; t < 3; t++) {
          const y = t * 2.2;
          const beam = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 4.0), rackMat);
          beam.position.set(rx, y + 0.1, z);
          this.scene.add(beam);
          const p = this._createPallet('#34d399');
          p.position.set(rx, y + 0.16, z);
          this.scene.add(p);
        }
      }
    });

    // Two Cold-Rated AMRs
    const buildAmr = (id, startPos, waypoints) => {
      const g = new THREE.Group();
      g.position.copy(startPos);
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.45, 1.9),
        new THREE.MeshStandardMaterial({ color: '#0f172a', metalness: 0.6, roughness: 0.3 })
      );
      body.position.y = 0.25;
      body.castShadow = true;
      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(1.54, 0.1, 1.94),
        new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0ea5e9', emissiveIntensity: 0.8 })
      );
      trim.position.y = 0.48;
      const lidar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.14, 0.18, 12),
        new THREE.MeshStandardMaterial({ color: '#22d3ee', emissive: '#06b6d4', emissiveIntensity: 1.0 })
      );
      lidar.position.set(0, 0.6, 0.75);
      const pallet = this._createPallet('#a7f3d0');
      pallet.position.y = 0.5;
      pallet.scale.set(0.85, 0.75, 0.85);
      g.add(body, trim, lidar, pallet);

      // Draw path line
      const pts = [...waypoints, waypoints[0]];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, 0.08, p.z)));
      const line = new THREE.Line(
        lineGeo,
        new THREE.LineBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.45 })
      );
      this.pathGroup.add(line);

      this._registerDevice(id, g, startPos.clone().setY(1.2));
      return { id, group: g, waypoints, wpIndex: 0 };
    };

    const wp1 = [
      new THREE.Vector3(5, 0, -13),
      new THREE.Vector3(5, 0, 5),
      new THREE.Vector3(12, 0, 5),
      new THREE.Vector3(12, 0, -13),
    ];
    const wp2 = [
      new THREE.Vector3(12, 0, 2),
      new THREE.Vector3(5, 0, 2),
      new THREE.Vector3(5, 0, -8),
      new THREE.Vector3(12, 0, -8),
    ];

    this.amrs = [
      buildAmr('iot-amr-01', wp1[0], wp1),
      buildAmr('iot-amr-02', wp2[0], wp2),
    ];
  }

  _buildBlastFreezer() {
    const g = new THREE.Group();
    g.position.set(-16, 0, 13);

    const glassMat = new THREE.MeshStandardMaterial({
      color: '#7dd3fc',
      transparent: true,
      opacity: 0.25,
      roughness: 0.15,
      metalness: 0.2,
    });
    const shell = new THREE.Mesh(new THREE.BoxGeometry(16, 6.5, 9), glassMat);
    shell.position.y = 3.25;
    g.add(shell);

    const unit = new THREE.Mesh(
      new THREE.BoxGeometry(5.5, 2.2, 2.0),
      new THREE.MeshStandardMaterial({ color: '#0284c7', emissive: '#0369a1', emissiveIntensity: 0.4 })
    );
    unit.position.set(0, 4.8, -3.2);
    g.add(unit);

    for (let i = -1; i <= 1; i += 2) {
      const fan = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.18, 0.25),
        new THREE.MeshStandardMaterial({ color: '#e0f2fe', emissive: '#38bdf8', emissiveIntensity: 0.7 })
      );
      fan.position.set(i * 1.4, 4.8, -2.1);
      g.add(fan);
      this.fans.push({ mesh: fan, axis: 'z', deviceId: 'iot-blast-01' });
    }

    this._registerDevice('iot-blast-01', g, new THREE.Vector3(-16, 6, 13));
  }

  _buildDockAndConveyor() {
    // Smart Conveyor & Vision Scanner (iot-conv-01)
    const convGroup = new THREE.Group();
    convGroup.position.set(14, 0, 2);
    const belt = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.9, 14),
      new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.5, roughness: 0.5 })
    );
    belt.position.y = 0.45;
    convGroup.add(belt);

    const scannerArch = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 2.0, 0.6),
      new THREE.MeshStandardMaterial({ color: '#0ea5e9', emissive: '#0284c7', emissiveIntensity: 0.5 })
    );
    scannerArch.position.set(0, 1.5, 0);
    convGroup.add(scannerArch);

    for (let i = 0; i < 4; i++) {
      const tote = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.55, 1.1),
        new THREE.MeshStandardMaterial({ color: '#38bdf8', roughness: 0.4 })
      );
      tote.position.set(0, 1.18, -5.5 + i * 3.5);
      convGroup.add(tote);
      this.totes.push(tote);
    }
    this._registerDevice('iot-conv-01', convGroup, new THREE.Vector3(14, 2.5, 2));

    // RFID Dock Portal G1 (iot-rfid-dock-01)
    const rfidGroup = new THREE.Group();
    rfidGroup.position.set(14, 0, 12);
    this.rfidMat = new THREE.MeshStandardMaterial({
      color: '#06b6d4',
      emissive: '#0891b2',
      emissiveIntensity: 0.6,
    });
    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.2, 0.45), this.rfidMat);
    postL.position.set(-1.6, 2.1, 0);
    const postR = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.2, 0.45), this.rfidMat);
    postR.position.set(1.6, 2.1, 0);
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.35, 0.45), this.rfidMat);
    topBar.position.set(0, 4.2, 0);
    rfidGroup.add(postL, postR, topBar);
    this._registerDevice('iot-rfid-dock-01', rfidGroup, new THREE.Vector3(14, 4.3, 12));

    // Insulated Dock Door #2 (iot-dock-door-02)
    const doorGroup = new THREE.Group();
    doorGroup.position.set(20, 0, 18.8);
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(4.6, 4.8, 0.4),
      new THREE.MeshStandardMaterial({ color: '#475569' })
    );
    frame.position.y = 2.4;
    this.dockDoorPanel = new THREE.Mesh(
      new THREE.BoxGeometry(4.0, 4.2, 0.25),
      new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.4, roughness: 0.4 })
    );
    this.dockDoorPanel.position.y = 2.1;
    this.dockDoorLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 12, 12),
      new THREE.MeshStandardMaterial({ color: '#34d399', emissive: '#10b981', emissiveIntensity: 1 })
    );
    this.dockDoorLight.position.set(2.5, 4.5, 0.25);
    doorGroup.add(frame, this.dockDoorPanel, this.dockDoorLight);
    this._registerDevice('iot-dock-door-02', doorGroup, new THREE.Vector3(20, 4.5, 18.8));

    // Reefer Trailer parked outside Bay 1
    const trailer = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 3.8, 10),
      new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.4 })
    );
    trailer.position.set(12, 2.2, 24.5);
    trailer.castShadow = true;
    this.scene.add(trailer);
  }

  _buildPlantAndGateway() {
    // Cloud IoT Edge Gateway Rack (iot-gw-cloud-01)
    const gwGroup = new THREE.Group();
    gwGroup.position.set(22, 0, -14);
    const rack = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 3.6, 1.8),
      new THREE.MeshStandardMaterial({ color: '#0f172a', metalness: 0.7, roughness: 0.25 })
    );
    rack.position.y = 1.8;
    const ledStrip = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.18, 1.85),
      new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#38bdf8', emissiveIntensity: 1.5 })
    );
    ledStrip.position.y = 3.1;
    const dish = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.15, 0.5, 16),
      new THREE.MeshStandardMaterial({ color: '#7dd3fc', emissive: '#0284c7', emissiveIntensity: 0.7 })
    );
    dish.position.y = 4.1;
    gwGroup.add(rack, ledStrip, dish);
    this.gatewayPos = new THREE.Vector3(22, 4.3, -14);
    this._registerDevice('iot-gw-cloud-01', gwGroup, this.gatewayPos);

    // Exterior CO2 / NH3 Chiller Plant (iot-chiller-plant-01)
    const plantGroup = new THREE.Group();
    plantGroup.position.set(33, 0, -8);
    const skid = new THREE.Mesh(
      new THREE.BoxGeometry(6.5, 3.2, 10),
      new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.6, roughness: 0.35 })
    );
    skid.position.y = 1.6;
    skid.castShadow = true;
    plantGroup.add(skid);

    for (let i = -1; i <= 1; i++) {
      const fan = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.14, 0.3),
        new THREE.MeshStandardMaterial({ color: '#34d399', emissive: '#059669', emissiveIntensity: 0.6 })
      );
      fan.position.set(0, 3.35, i * 3.0);
      plantGroup.add(fan);
      this.fans.push({ mesh: fan, axis: 'y', deviceId: 'iot-chiller-plant-01' });
    }
    this._registerDevice('iot-chiller-plant-01', plantGroup, new THREE.Vector3(33, 3.5, -8));
  }

  _buildSelectionRing() {
    this.selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(1.9, 2.3, 32),
      new THREE.MeshBasicMaterial({ color: '#38bdf8', side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.visible = false;
    this.scene.add(this.selectionRing);
  }

  _buildIotLinks() {
    const lineMat = new THREE.LineBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.25 });
    const pktGeo = new THREE.SphereGeometry(0.18, 8, 8);
    const pktMat = new THREE.MeshBasicMaterial({ color: '#7dd3fc' });

    this.deviceGroups.forEach((group, id) => {
      if (id === 'iot-gw-cloud-01') return;
      const start = group.userData.iotOrigin || group.position.clone();
      const end = this.gatewayPos;
      const mid = start.clone().lerp(end, 0.5);
      mid.y += 5.5;

      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const pts = curve.getPoints(20);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
      this.iotLinksGroup.add(line);

      const pkt = new THREE.Mesh(pktGeo, pktMat);
      this.iotLinksGroup.add(pkt);
      this.iotPackets.push({ mesh: pkt, curve, t: Math.random(), speed: 0.28 + Math.random() * 0.2 });
    });
  }

  _bindEvents() {
    this.canvas.addEventListener('pointerdown', (e) => {
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
    });

    this.canvas.addEventListener('pointerup', (e) => {
      const dx = e.clientX - this.pointerDownPos.x;
      const dy = e.clientY - this.pointerDownPos.y;
      if (Math.hypot(dx, dy) > 5) return; // Was a drag, not a click

      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(Array.from(this.deviceGroups.values()), true);
      if (hits.length > 0) {
        const id = hits[0].object.userData.deviceId;
        if (id) this.onSelectDevice(id);
      }
    });
  }

  selectDevice(id) {
    this.selectedDeviceId = id;
    const g = this.deviceGroups.get(id);
    if (g) {
      this.selectionRing.position.set(g.position.x, 0.12, g.position.z);
      this.selectionRing.visible = true;
    } else {
      this.selectionRing.visible = false;
    }
  }

  setCameraPreset(key) {
    const preset = CAMERA_PRESETS[key];
    if (!preset) return;
    this.camAnim = {
      startPos: this.camera.position.clone(),
      endPos: new THREE.Vector3(...preset.pos),
      startTarget: this.controls.target.clone(),
      endTarget: new THREE.Vector3(...preset.target),
      progress: 0,
    };
  }

  setLayerVisibility(layers) {
    this.iotLinksGroup.visible = layers.iot;
    this.pathGroup.visible = layers.paths;
    Object.values(this.zoneThermalMats).forEach((m) => {
      m.visible = layers.thermal;
    });
    this.wallMeshes.forEach((w) => {
      w.material.opacity = layers.xray ? 0.08 : 0.32;
    });
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  update(dt, elapsed) {
    // Camera preset lerp
    if (this.camAnim) {
      this.camAnim.progress = Math.min(1, this.camAnim.progress + dt * 2.2);
      const ease = 1 - Math.pow(1 - this.camAnim.progress, 3);
      this.camera.position.lerpVectors(this.camAnim.startPos, this.camAnim.endPos, ease);
      this.controls.target.lerpVectors(this.camAnim.startTarget, this.camAnim.endTarget, ease);
      if (this.camAnim.progress >= 1) this.camAnim = null;
    }

    this.controls.update();

    // Rotate fans based on device fanSpeed
    this.fans.forEach((f) => {
      const dev = this.sim.getDevice(f.deviceId);
      const mult = dev?.fanSpeed ?? 1.0;
      f.mesh.rotation[f.axis] += dt * 10 * mult;
    });

    // Animate AS/RS Crane
    const craneDev = this.sim.getDevice('iot-asrs-crane-01');
    if (craneDev?.active && this.asrsCrane) {
      this.asrsCrane.group.position.z = -5 + Math.sin(elapsed * 0.45) * 8;
      const liftY = 3.2 + Math.sin(elapsed * 0.9) * 2.2;
      this.asrsCrane.carriage.position.y = liftY;
      this.asrsCrane.pallet.position.y = liftY + 0.25;
    }

    // Animate AMRs along waypoints
    this.amrs.forEach((amr) => {
      const dev = this.sim.getDevice(amr.id);
      if (!dev?.active) return;
      const target = amr.waypoints[amr.wpIndex];
      const dir = target.clone().sub(amr.group.position);
      dir.y = 0;
      const dist = dir.length();
      if (dist < 0.2) {
        amr.wpIndex = (amr.wpIndex + 1) % amr.waypoints.length;
      } else {
        dir.normalize();
        amr.group.position.addScaledVector(dir, dt * 3.0);
        amr.group.lookAt(amr.group.position.clone().add(dir));
      }
    });

    // Animate Conveyor Totes
    const convDev = this.sim.getDevice('iot-conv-01');
    if (convDev?.active) {
      this.totes.forEach((t) => {
        t.position.z += dt * 1.8;
        if (t.position.z > 6.5) t.position.z = -6.5;
      });
    }

    // Dock Door #2 animation & status light
    const doorDev = this.sim.getDevice('iot-dock-door-02');
    if (doorDev && this.dockDoorPanel) {
      const targetY = doorDev.doorOpen ? 5.6 : 2.1;
      this.dockDoorPanel.position.y += (targetY - this.dockDoorPanel.position.y) * dt * 4;
      const color = doorDev.doorOpen ? '#f87171' : '#34d399';
      this.dockDoorLight.material.color.set(color);
      this.dockDoorLight.material.emissive.set(color);
    }

    // RFID Portal flash
    const rfidDev = this.sim.getDevice('iot-rfid-dock-01');
    if (rfidDev && this.rfidMat) {
      if (rfidDev.flashRequested) {
        this.rfidFlash = 1.0;
        rfidDev.flashRequested = false;
      }
      if (this.rfidFlash > 0) {
        this.rfidFlash = Math.max(0, this.rfidFlash - dt * 2.5);
        this.rfidMat.emissiveIntensity = 0.6 + this.rfidFlash * 2.2;
      }
    }

    // Thermal heatmap color response
    if (this.zoneThermalMats.dock) {
      const dockTemp = this.sim.zones.dock.temp;
      this.zoneThermalMats.dock.color.set(dockTemp > 6.0 ? '#ef4444' : '#0ea5e9');
      this.zoneThermalMats.dock.opacity = dockTemp > 6.0 ? 0.34 : 0.22;
    }

    // IoT Cloud Packets
    if (this.iotLinksGroup.visible) {
      this.iotPackets.forEach((p) => {
        p.t = (p.t + dt * p.speed) % 1;
        p.mesh.position.copy(p.curve.getPoint(p.t));
      });
    }

    // Selection ring pulse + follow moving AMR/Crane
    if (this.selectionRing.visible && this.selectedDeviceId) {
      const g = this.deviceGroups.get(this.selectedDeviceId);
      if (g) {
        this.selectionRing.position.set(g.position.x, 0.12, g.position.z);
        const s = 1 + Math.sin(elapsed * 5) * 0.08;
        this.selectionRing.scale.set(s, s, 1);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}
