export const ZONES = {
  deepFreeze: { id: 'deepFreeze', name: 'Zone A — Deep Freeze', setpoint: -22.5, temp: -22.4, humidity: 42 },
  chilled: { id: 'chilled', name: 'Zone B — Chilled Storage', setpoint: 2.0, temp: 2.1, humidity: 65 },
  blast: { id: 'blast', name: 'Zone C — Blast Freezer', setpoint: -35.0, temp: -35.0, humidity: 35 },
  dock: { id: 'dock', name: 'Zone D — Cold Dock & Staging', setpoint: 4.0, temp: 4.2, humidity: 58 },
};

export function createInitialDevices() {
  return [
    {
      id: 'iot-gw-cloud-01',
      name: 'Cloud IoT Edge Gateway',
      type: 'Edge Gateway',
      zone: 'Plant / Cloud',
      topic: 'cryotwin/wh04/edge/gw-01/status',
      status: 'ok',
      metrics: { 'MQTT Broker': 'In-Kingdom IoT broker', 'Latency': '14 ms', 'Connected Nodes': '11 / 11', 'Uptime': '99.98%' },
      commands: ['Ping Cloud', 'Sync Twin State'],
    },
    {
      id: 'iot-evap-df-01',
      name: 'Evaporator Unit DF-01',
      type: 'Evaporator',
      zone: 'Zone A — Deep Freeze',
      topic: 'cryotwin/wh04/zone-a/evap-01/telemetry',
      status: 'ok',
      defrost: false,
      fanSpeed: 1.0,
      metrics: { 'Supply Air': '-24.1 °C', 'Return Air': '-22.2 °C', 'Fan RPM': '1450', 'Defrost': 'IDLE' },
      commands: ['Toggle Defrost', 'Boost Fan'],
    },
    {
      id: 'iot-asrs-crane-01',
      name: 'AS/RS Crane A-01',
      type: 'AS/RS Crane',
      zone: 'Zone A — Deep Freeze',
      topic: 'cryotwin/wh04/zone-a/asrs-01/motion',
      status: 'ok',
      active: true,
      metrics: { 'State': 'RETRIEVING', 'Bay / Tier': 'B04 / T03', 'Motor Temp': '-14.2 °C', 'Cycles/hr': '48' },
      commands: ['Pause / Resume', 'Home Crane'],
    },
    {
      id: 'iot-amr-01',
      name: 'Cold-Rated AMR-01',
      type: 'AMR Robot',
      zone: 'Zone B — Chilled',
      topic: 'cryotwin/wh04/zone-b/amr-01/telemetry',
      status: 'ok',
      active: true,
      battery: 88,
      metrics: { 'Mission': 'PALLET -> DOCK', 'Battery': '88%', 'Speed': '1.4 m/s', 'LiDAR': 'CLEAR' },
      commands: ['Pause / Resume', 'Dispatch Dock'],
    },
    {
      id: 'iot-amr-02',
      name: 'Cold-Rated AMR-02',
      type: 'AMR Robot',
      zone: 'Zone B — Chilled',
      topic: 'cryotwin/wh04/zone-b/amr-02/telemetry',
      status: 'ok',
      active: true,
      battery: 74,
      metrics: { 'Mission': 'RACK -> CONVEYOR', 'Battery': '74%', 'Speed': '1.3 m/s', 'LiDAR': 'CLEAR' },
      commands: ['Pause / Resume', 'Dispatch Dock'],
    },
    {
      id: 'iot-blast-01',
      name: 'Blast Chiller Core-01',
      type: 'Blast Freezer',
      zone: 'Zone C — Blast',
      topic: 'cryotwin/wh04/zone-c/blast-01/telemetry',
      status: 'ok',
      fanSpeed: 1.5,
      metrics: { 'Chamber Temp': '-35.0 °C', 'Core Probe': '-18.6 °C', 'Air Velocity': '6.2 m/s', 'Cycle': 'ACTIVE' },
      commands: ['Boost Fan', 'Cycle Complete'],
    },
    {
      id: 'iot-conv-01',
      name: 'Smart Conveyor & Scanner',
      type: 'Conveyor + Vision',
      zone: 'Zone D — Staging',
      topic: 'cryotwin/wh04/zone-d/conv-01/scans',
      status: 'ok',
      active: true,
      metrics: { 'Belt Speed': '0.8 m/s', 'Totes/min': '22', 'Barcode Read': '99.7%', 'Checkweigh': '18.4 kg' },
      commands: ['Pause / Resume', 'Trigger Scan'],
    },
    {
      id: 'iot-rfid-dock-01',
      name: 'RFID Dock Portal G1',
      type: 'RFID Gate',
      zone: 'Zone D — Cold Dock',
      topic: 'cryotwin/wh04/zone-d/rfid-01/reads',
      status: 'ok',
      lastTag: 'EPC-9941-FROZ',
      metrics: { 'Last Tag': 'EPC-9941-FROZ', 'Read Rate': '140 tags/s', 'RSSI': '-48 dBm', 'Gate': 'ARMED' },
      commands: ['Trigger Read'],
    },
    {
      id: 'iot-dock-door-02',
      name: 'Insulated Dock Door #2',
      type: 'Dock Door Sensor',
      zone: 'Zone D — Cold Dock',
      topic: 'cryotwin/wh04/zone-d/door-02/state',
      status: 'ok',
      doorOpen: false,
      metrics: { 'Door State': 'CLOSED', 'Air Seal': 'LOCKED', 'Open Duration': '0 s', 'Temp Delta': '+0.2 °C' },
      commands: ['Toggle Door'],
    },
    {
      id: 'iot-chiller-plant-01',
      name: 'CO₂ / NH₃ Chiller Plant',
      type: 'Compressor Plant',
      zone: 'Exterior Plant',
      topic: 'cryotwin/wh04/plant/chiller-01/telemetry',
      status: 'ok',
      fanSpeed: 1.0,
      metrics: { 'Power Draw': '142.8 kW', 'Head Pressure': '18.4 bar', 'COP': '3.42', 'Leak Sensor': '0 ppm' },
      commands: ['Boost Fan'],
    },
  ];
}

export class TwinSimulation {
  constructor() {
    this.zones = structuredClone(ZONES);
    this.devices = createInitialDevices();
    this.faultActive = false;
    this.logs = [];
    this.tickCount = 0;
  }

  getDevice(id) {
    return this.devices.find((d) => d.id === id) || null;
  }

  pushLog(topic, payload, level = 'info') {
    const now = new Date();
    const time = now.toTimeString().slice(0, 8);
    this.logs.unshift({ time, topic, payload, level });
    if (this.logs.length > 40) this.logs.pop();
  }

  triggerFaultScenario() {
    this.faultActive = true;
    const door = this.getDevice('iot-dock-door-02');
    const evap = this.getDevice('iot-evap-df-01');
    if (door) {
      door.doorOpen = true;
      door.status = 'danger';
      door.metrics['Door State'] = 'OPEN (UNSEALED)';
      door.metrics['Air Seal'] = 'BREACHED';
      door.metrics['Open Duration'] = '145 s';
    }
    if (evap) {
      evap.fanSpeed = 1.8;
      evap.status = 'warn';
      evap.metrics['Fan RPM'] = '2100 (MAX)';
    }
    this.pushLog(
      'cryotwin/wh04/zone-d/door-02/alert',
      '{"alert":"THERMAL_EXCURSION","door":"DOCK-02","delta":"+4.8C"}',
      'danger'
    );
  }

  restoreNominal() {
    this.faultActive = false;
    const door = this.getDevice('iot-dock-door-02');
    const evap = this.getDevice('iot-evap-df-01');
    if (door) {
      door.doorOpen = false;
      door.status = 'ok';
      door.metrics['Door State'] = 'CLOSED';
      door.metrics['Air Seal'] = 'LOCKED';
      door.metrics['Open Duration'] = '0 s';
      door.metrics['Temp Delta'] = '+0.2 °C';
    }
    if (evap) {
      evap.fanSpeed = 1.0;
      evap.defrost = false;
      evap.status = 'ok';
      evap.metrics['Fan RPM'] = '1450';
      evap.metrics['Defrost'] = 'IDLE';
    }
    this.pushLog('cryotwin/wh04/edge/gw-01/ack', '{"status":"NOMINAL_RESTORED"}', 'info');
  }

  runCommand(deviceId, cmd) {
    const d = this.getDevice(deviceId);
    if (!d) return;

    if (cmd === 'Toggle Defrost') {
      d.defrost = !d.defrost;
      d.status = d.defrost ? 'warn' : 'ok';
      d.metrics['Defrost'] = d.defrost ? 'HEATING' : 'IDLE';
      d.metrics['Fan RPM'] = d.defrost ? '0 (DEFROST)' : '1450';
      d.fanSpeed = d.defrost ? 0 : 1.0;
      this.pushLog(d.topic, `{"cmd":"DEFROST","state":"${d.metrics['Defrost']}"}`, d.defrost ? 'warn' : 'info');
    } else if (cmd === 'Boost Fan') {
      d.fanSpeed = d.fanSpeed > 1.3 ? 1.0 : 1.8;
      if (d.metrics['Fan RPM']) d.metrics['Fan RPM'] = d.fanSpeed > 1.3 ? '2100 (BOOST)' : '1450';
      this.pushLog(d.topic, `{"cmd":"FAN_SPEED","mult":${d.fanSpeed}}`, 'info');
    } else if (cmd === 'Pause / Resume') {
      d.active = !d.active;
      d.status = d.active ? 'ok' : 'warn';
      if (d.metrics['State']) d.metrics['State'] = d.active ? 'RETRIEVING' : 'PAUSED';
      if (d.metrics['Speed']) d.metrics['Speed'] = d.active ? '1.4 m/s' : '0.0 m/s';
      if (d.metrics['Belt Speed']) d.metrics['Belt Speed'] = d.active ? '0.8 m/s' : '0.0 m/s';
      this.pushLog(d.topic, `{"cmd":"MOTION","active":${d.active}}`, d.active ? 'info' : 'warn');
    } else if (cmd === 'Toggle Door') {
      d.doorOpen = !d.doorOpen;
      if (d.doorOpen) {
        this.triggerFaultScenario();
      } else {
        this.restoreNominal();
      }
    } else if (cmd === 'Trigger Read') {
      const code = `EPC-${Math.floor(1000 + Math.random() * 9000)}-COLD`;
      d.lastTag = code;
      d.metrics['Last Tag'] = code;
      d.flashRequested = true;
      this.pushLog(d.topic, `{"epc":"${code}","zone":"DOCK-G1","ok":true}`, 'info');
    } else if (cmd === 'Ping Cloud' || cmd === 'Sync Twin State') {
      this.pushLog(d.topic, `{"cmd":"${cmd.toUpperCase()}","rtt_ms":12}`, 'info');
    } else {
      this.pushLog(d.topic, `{"cmd":"${cmd}","ack":true}`, 'info');
    }
  }

  step(dt) {
    this.tickCount += dt;

    // Thermal physics approximation
    const targetDock = this.faultActive ? 9.5 : this.zones.dock.setpoint;
    const targetChilled = this.faultActive ? 3.8 : this.zones.chilled.setpoint;
    const evap = this.getDevice('iot-evap-df-01');
    const targetDF = evap?.defrost ? -17.5 : this.zones.deepFreeze.setpoint;

    this.zones.dock.temp += (targetDock - this.zones.dock.temp) * dt * 0.25 + (Math.random() - 0.5) * 0.03;
    this.zones.chilled.temp += (targetChilled - this.zones.chilled.temp) * dt * 0.15 + (Math.random() - 0.5) * 0.02;
    this.zones.deepFreeze.temp += (targetDF - this.zones.deepFreeze.temp) * dt * 0.2 + (Math.random() - 0.5) * 0.02;
    this.zones.blast.temp += (this.zones.blast.setpoint - this.zones.blast.temp) * dt * 0.2 + (Math.random() - 0.5) * 0.02;

    if (evap) {
      evap.metrics['Return Air'] = `${this.zones.deepFreeze.temp.toFixed(1)} °C`;
      evap.metrics['Supply Air'] = `${(this.zones.deepFreeze.temp - 1.8).toFixed(1)} °C`;
    }

    const door = this.getDevice('iot-dock-door-02');
    if (door && door.doorOpen) {
      door.metrics['Temp Delta'] = `+${(this.zones.dock.temp - 4.0).toFixed(1)} °C`;
    }

    const chiller = this.getDevice('iot-chiller-plant-01');
    const loadKw = (this.faultActive ? 186.4 : 142.8) + Math.sin(this.tickCount * 0.8) * 2.1;
    if (chiller) {
      chiller.metrics['Power Draw'] = `${loadKw.toFixed(1)} kW`;
    }

    // Periodic MQTT heartbeat
    if (Math.random() < dt * 0.45) {
      const sample = this.devices[Math.floor(Math.random() * this.devices.length)];
      if (sample.id === 'iot-rfid-dock-01') {
        const tag = `EPC-${Math.floor(1000 + Math.random() * 9000)}-COLD`;
        sample.metrics['Last Tag'] = tag;
        sample.flashRequested = true;
        this.pushLog(sample.topic, `{"epc":"${tag}","rssi":-46}`, 'info');
      } else if (sample.id === 'iot-evap-df-01') {
        this.pushLog(sample.topic, `{"temp":${this.zones.deepFreeze.temp.toFixed(1)},"rh":42}`, sample.status === 'ok' ? 'info' : 'warn');
      } else if (sample.id === 'iot-amr-01' || sample.id === 'iot-amr-02') {
        this.pushLog(sample.topic, `{"bat":${sample.battery},"status":"${sample.active ? 'MOVING' : 'PAUSED'}"}`, 'info');
      }
    }

    return {
      loadKw,
      alertCount: this.devices.filter((d) => d.status !== 'ok').length,
    };
  }
}
