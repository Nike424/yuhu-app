/* ═══════════════════════════════════════════
   愈见 YuJian — Bluetooth LE 传感器对接
   支持 Capacitor 原生桥接 (Android APK) + Web Bluetooth API (浏览器)
   ═══════════════════════════════════════════ */

const BLE = {
  _device: null,
  _deviceId: null,
  _server: null,
  _service: null,
  _phChar: null,
  _uaChar: null,
  _tempChar: null,
  _batteryChar: null,
  _connected: false,
  _onData: null,
  _isNative: false,   // true = Capacitor native bridge, false = Web Bluetooth
  _nativeListeners: [],

  /* ── 设备信息（需与硬件固件协议一致）── */
  SERVICE_UUID: '0000ff00-0000-1000-8000-00805f9b34fb',
  PH_CHAR_UUID: '0000ff01-0000-1000-8000-00805f9b34fb',
  UA_CHAR_UUID: '0000ff02-0000-1000-8000-00805f9b34fb',
  TEMP_CHAR_UUID: '0000ff03-0000-1000-8000-00805f9b34fb',
  BATTERY_CHAR_UUID: '0000ff04-0000-1000-8000-00805f9b34fb',
  DEVICE_NAME_PREFIX: 'YuHu-Pet',

  /* ── 检测运行环境 ── */
  _detectEnvironment() {
    this._isNative = !!(
      window.Capacitor &&
      typeof window.Capacitor.nativePromise === 'function' &&
      window.Capacitor.isNativePlatform &&
      window.Capacitor.isNativePlatform()
    );
    return this._isNative;
  },

  /* ── 调用 Capacitor 原生 BLE 插件 ── */
  async _nativeCall(method, args = {}) {
    return window.Capacitor.nativePromise('BluetoothLe', method, args);
  },

  /* ── 扫描并连接 ── */
  async scanAndConnect() {
    this._detectEnvironment();

    if (this._isNative) {
      return this._scanAndConnectNative();
    } else {
      return this._scanAndConnectWeb();
    }
  },

  /* ── 原生 BLE 连接 (Capacitor) ── */
  async _scanAndConnectNative() {
    try {
      // 1. 初始化 BLE
      Utils.toast('正在初始化蓝牙...', 'warning');
      await this._nativeCall('initialize', { androidNeverForLocation: true });

      // 2. 检查蓝牙是否开启
      const enabledResult = await this._nativeCall('isEnabled');
      if (!enabledResult.value) {
        Utils.toast('请开启手机蓝牙', 'error');
        await this._nativeCall('requestEnable');
        // 再次检查
        const recheck = await this._nativeCall('isEnabled');
        if (!recheck.value) throw new Error('蓝牙未开启，无法连接设备');
      }

      // 3. 请求选择设备
      Utils.toast('正在扫描愈见设备...', 'warning');
      const device = await this._nativeCall('requestDevice', {
        services: [this.SERVICE_UUID]
      });

      if (!device || !device.deviceId) {
        throw new Error('未找到愈见设备。请确保设备已开机且在手机附近。');
      }

      this._deviceId = device.deviceId;
      Utils.toast(`正在连接 ${device.name || '设备'}...`, 'warning');

      // 4. 连接设备
      await this._nativeCall('connect', { deviceId: this._deviceId });

      // 5. 注册断开监听
      const disconnectKey = `disconnected|${this._deviceId}`;
      this._disconnectListener = window.Capacitor.addListener('BluetoothLe', disconnectKey, () => {
        this._connected = false;
        this._updateStatus(false);
        Utils.toast('设备已断开连接', 'error');
      });

      this._connected = true;
      this._updateStatus(true);

      // 6. 开始通知
      await this._startNativeNotifications();
      Utils.toast('愈见设备已连接', 'success');
      return true;
    } catch (err) {
      this._connected = false;
      this._updateStatus(false);
      if (err.message && err.message.includes('NotFoundError')) {
        throw new Error('未找到愈见设备。请确保设备已开机且在手机附近。');
      }
      throw err;
    }
  },

  /* ── 原生通知订阅 ── */
  async _startNativeNotifications() {
    const chars = [
      { uuid: this.PH_CHAR_UUID, key: 'phVoltage' },
      { uuid: this.UA_CHAR_UUID, key: 'uaCurrent' },
      { uuid: this.TEMP_CHAR_UUID, key: 'temperature' },
    ];

    for (const { uuid, key } of chars) {
      const notifKey = `notification|${this._deviceId}|${this.SERVICE_UUID}|${uuid}`;
      const listener = window.Capacitor.addListener('BluetoothLe', notifKey, (event) => {
        if (event && event.value !== undefined && this._onData) {
          const dv = this._hexToDataView(event.value);
          if (dv && dv.byteLength >= 4) {
            const val = dv.getFloat32(0, true);
            this._onData(key, val);
          }
        }
      });
      this._nativeListeners.push(listener);

      await this._nativeCall('startNotifications', {
        deviceId: this._deviceId,
        service: this.SERVICE_UUID,
        characteristic: uuid,
      });
    }
  },

  /* ── 将原生返回的 hex 字符串转为 DataView ── */
  _hexToDataView(hex) {
    if (!hex || typeof hex !== 'string') return null;
    const bytes = [];
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.substring(i, i + 2), 16));
    }
    return new DataView(new Uint8Array(bytes).buffer);
  },

  /* ── Web Bluetooth 连接 (浏览器) ── */
  async _scanAndConnectWeb() {
    if (!navigator.bluetooth) {
      throw new Error('当前浏览器不支持蓝牙。请使用Chrome安卓版或Edge打开。');
    }

    try {
      Utils.toast('正在扫描愈见设备...', 'warning');

      this._device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: this.DEVICE_NAME_PREFIX },
          { services: [this.SERVICE_UUID] }
        ],
        optionalServices: [this.SERVICE_UUID]
      });

      this._device.addEventListener('gattserverdisconnected', () => {
        this._connected = false;
        this._updateStatus(false);
        Utils.toast('设备已断开连接', 'error');
      });

      Utils.toast('正在连接...', 'warning');
      this._server = await this._device.gatt.connect();
      this._service = await this._server.getPrimaryService(this.SERVICE_UUID);

      this._phChar = await this._service.getCharacteristic(this.PH_CHAR_UUID);
      this._uaChar = await this._service.getCharacteristic(this.UA_CHAR_UUID);
      this._tempChar = await this._service.getCharacteristic(this.TEMP_CHAR_UUID);

      try {
        this._batteryChar = await this._service.getCharacteristic(this.BATTERY_CHAR_UUID);
      } catch (e) { /* 电量特征值可选 */ }

      this._connected = true;
      this._updateStatus(true);

      await this._startWebNotifications();
      Utils.toast('愈见设备已连接', 'success');
      return true;
    } catch (err) {
      this._connected = false;
      this._updateStatus(false);
      if (err.name === 'NotFoundError') {
        throw new Error('未找到愈见设备。请确保设备已开机且在手机附近。');
      }
      throw err;
    }
  },

  /* ── Web Bluetooth 通知 ── */
  async _startWebNotifications() {
    if (this._phChar) {
      await this._phChar.startNotifications();
      this._phChar.addEventListener('characteristicvaluechanged', (e) => {
        const value = e.target.value.getFloat32(0, true);
        if (this._onData) this._onData('phVoltage', value);
      });
    }
    if (this._uaChar) {
      await this._uaChar.startNotifications();
      this._uaChar.addEventListener('characteristicvaluechanged', (e) => {
        const value = e.target.value.getFloat32(0, true);
        if (this._onData) this._onData('uaCurrent', value);
      });
    }
    if (this._tempChar) {
      await this._tempChar.startNotifications();
      this._tempChar.addEventListener('characteristicvaluechanged', (e) => {
        const value = e.target.value.getFloat32(0, true);
        if (this._onData) this._onData('temperature', value);
      });
    }
  },

  /* ── 单次读取 ── */
  async readAll() {
    if (!this._connected) throw new Error('设备未连接');

    if (this._isNative) {
      return this._readAllNative();
    }
    return this._readAllWeb();
  },

  async _readAllNative() {
    const data = {};
    const readChar = async (uuid, key, parser) => {
      try {
        const result = await this._nativeCall('read', {
          deviceId: this._deviceId,
          service: this.SERVICE_UUID,
          characteristic: uuid,
        });
        if (result && result.value) {
          const dv = this._hexToDataView(result.value);
          if (dv && dv.byteLength >= 4) data[key] = parser(dv);
        }
      } catch (e) { /* ignore */ }
    };

    await readChar(this.PH_CHAR_UUID, 'phVoltage', dv => dv.getFloat32(0, true));
    await readChar(this.UA_CHAR_UUID, 'uaCurrent', dv => dv.getFloat32(0, true));
    await readChar(this.TEMP_CHAR_UUID, 'temperature', dv => dv.getFloat32(0, true));

    try {
      const batResult = await this._nativeCall('read', {
        deviceId: this._deviceId,
        service: this.SERVICE_UUID,
        characteristic: this.BATTERY_CHAR_UUID,
      });
      if (batResult && batResult.value) {
        const dv = this._hexToDataView(batResult.value);
        if (dv && dv.byteLength >= 1) data.battery = dv.getUint8(0);
      }
    } catch (e) { /* 电量可选 */ }

    return data;
  },

  async _readAllWeb() {
    const data = {};
    try { const v = await this._phChar.readValue(); data.phVoltage = v.getFloat32(0, true); } catch (e) {}
    try { const v = await this._uaChar.readValue(); data.uaCurrent = v.getFloat32(0, true); } catch (e) {}
    try { const v = await this._tempChar.readValue(); data.temperature = v.getFloat32(0, true); } catch (e) {}
    try {
      if (this._batteryChar) {
        const v = await this._batteryChar.readValue();
        data.battery = v.getUint8(0);
      }
    } catch (e) {}
    return data;
  },

  /* ── 断开连接 ── */
  async disconnect() {
    if (this._isNative) {
      if (this._deviceId) {
        try {
          // 移除监听器
          for (const listener of this._nativeListeners) {
            try { await listener.remove(); } catch (e) { /* ignore */ }
          }
          if (this._disconnectListener) {
            try { await this._disconnectListener.remove(); } catch (e) { /* ignore */ }
          }
          // 停止通知
          for (const uuid of [this.PH_CHAR_UUID, this.UA_CHAR_UUID, this.TEMP_CHAR_UUID]) {
            try {
              await this._nativeCall('stopNotifications', {
                deviceId: this._deviceId,
                service: this.SERVICE_UUID,
                characteristic: uuid,
              });
            } catch (e) { /* ignore */ }
          }
          await this._nativeCall('disconnect', { deviceId: this._deviceId });
        } catch (e) { /* ignore */ }
      }
    } else {
      if (this._device && this._device.gatt && this._device.gatt.connected) {
        await this._device.gatt.disconnect();
      }
    }

    this._connected = false;
    this._deviceId = null;
    this._device = null;
    this._server = null;
    this._service = null;
    this._phChar = null;
    this._uaChar = null;
    this._tempChar = null;
    this._batteryChar = null;
    this._nativeListeners = [];
    this._updateStatus(false);
  },

  /* ── UI状态更新 ── */
  _updateStatus(connected) {
    const el = document.getElementById('ble-indicator');
    if (!el) return;

    if (connected) {
      el.className = 'badge badge-teal badge-dot teal';
      el.textContent = '已连接';
    } else {
      el.className = 'badge badge-rose';
      el.textContent = '未连接';
    }
  },

  /* ── 数据回调设置 ── */
  setDataCallback(fn) { this._onData = fn; },

  /* ── 检查支持 ── */
  isSupported() {
    // 在 Capacitor 原生环境中，BLE 始终可用（插件已注册）
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      return true;
    }
    // 在浏览器中，检查 Web Bluetooth API
    return !!(navigator.bluetooth);
  },

  get isConnected() { return this._connected; }
};
