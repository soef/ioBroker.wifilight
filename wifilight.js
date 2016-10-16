"use strict";

var discovery = require(__dirname + '/lib/discovery'),
    colors = require(__dirname + '/lib/colors'),
    soef = require('soef'),
    net = require('net');

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var wifi = {};
var debug = false;

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

Number.prototype.toHex = function () {
    return ('0' + this.toString(16)).substr(-2);
};

function hex(ar, len) {
    var s = "";
    if (len == undefined) len = ar.length;
    for (var i=0; i<len; i++) {
        s += ar[i].toHex() + ' ';
    }
    return s;
}

Array.prototype.hex = function () {
    return hex(this);
};

Array.prototype.eq = function (arr) {
    return this.length==arr.length && this.every(function(v,i) { return v === arr[i]});
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var adapter = soef.Adapter (
    main,
    onStateChange,
    onMessage,
    {
        name: 'wifilight',
        //discover: function (callback) {
        //},
        //install: function (callback) {
        //},
        uninstall: function (callback) {
        }
        //objectChange: function (id, obj) {
        //}
    }
);

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function onMessage (obj) {
    if (!obj) return;
    switch (obj.command) {
        case 'discovery':
            discovery.scanForDevices(
                function(entry) {
                    var ret = !adapter.config.devices.some(function(e,i) {
                        return e.ip == entry.ip;
                    });
                    if (ret) {
                        var dev = cmds.knownDeviceNames[entry.name];
                        entry.type = dev ? dev.type : '';
                        entry.port = 5577;
                        entry.pollIntervall = 30;
                    }
                    return ret;
                },
                function (result) {
                    if (obj.callback) {
                        adapter.sendTo (obj.from, obj.command, JSON.stringify(result), obj.callback);
                    }
                }
            );
            return true;
        default:
            adapter.log.warn("Unknown command: " + obj.command);
            break;
    }
    if (obj.callback) adapter.sendTo (obj.from, obj.command, obj.message, obj.callback);
    return true;
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var cmds = require(__dirname + '/devices');

var usedStateNames = {
    online:      { n: 'reachable', val: 0,     common: { write: false, min: false, max: true }},
    //status:      { n: 'on',        val: false, common: { min: false, max: true }},
    on:          { n: 'on',        val: false, common: { min: false, max: true }},
    //brightness:  { n: 'bri',       val: 0,     common: { min: 0, max: 100, unit: '%', desc: '0..100%' }},
    bri:         { n: 'bri',       val: 0,     common: { min: 0, max: 100, unit: '%', desc: '0..100%' }},
    //temperature: { n: 'ct',        val: 0,     common: { min: 0, max: 5000, unit: '°K', desc: 'temperature in °Kelvin 0..5000' }},
    ct:          { n: 'ct',        val: 0,     common: { min: 0, max: 5000, unit: '°K', desc: 'temperature in °Kelvin 0..5000' }},
    red:         { n: 'r',         val: 0,     common: { min: 0, max: 255, desc: '0..255 or #rrggbb[ww] (hex)' }},
    green:       { n: 'g',         val: 0,     common: { min: 0, max: 255, desc: '0..255 or #rrggbb[ww] (hex)' }},
    blue:        { n: 'b',         val: 0,     common: { min: 0, max: 255, desc: '0..255 or #rrggbb[ww] (hex)' }},
    white:       { n: 'w',         val: 0,     common: { min: 0, max: 255, desc: '0..255 or #rrggbb[ww] (hex)' }},
    progNo:      { n: 'progNo',    val: 38,    common: { min: 35, max: 56, desc: '37..56, 97=none' }},
    progOn:      { n: 'progOn',    val: false, common: { min: false, max: true, desc: 'program on/off' }},
    progSpeed:   { n: 'progSpeed', val: 10,    common: { min: 0, max: 255 }, desc: 'speed for preogram'},
    refresh:     { n: 'refresh',   val: false, common: { min: false, max: true, desc: 'read states from device' }},
    //alpha:       { n: 'sat',       val: 0, common: { min: 0, max: 255 }},
    transition:  { n: 'trans',     val: 30,    common: { unit: '\u2152 s', desc: 'in 10th seconds'} },
    command:     { n: 'command',   val: 'r:0, g:0, b:0, on:true, transition:30', desc: 'r:0, g:0, b:0, on:true, transition:2' },
    rgb:         { n: 'rgb',       val: '',    common: { desc: '000000..ffffff' }}

};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function parseHexColors(val) {
    val = val.toString();
    var ar = val.split('.');
    if (ar && ar.length > 1) val = ar[0];
    if (val[0] === '#') val = val.substr(1);
    var co = {
        r: parseInt(val.substr(0, 2), 16),
        g: parseInt(val.substr(2, 2), 16) || 0,
        b: parseInt(val.substr(4, 2), 16) || 0 //,
    };
    if (val.length > 7) {
        co.w = parseInt(val.substr(6, 2), 16);
    }
    if (ar && ar.length > 1) {
        var m = Number('.' + ar[1]);
        for (var i in co) {
            co[i] *= m;
        }
        roundRGB(co);
    }
    return co;
}

function onStateChange(id, state) {
    var ar = id.split('.');
    //var dcs = adapter.idToDCS(id);
    var deviceName = ar[2], stateName = ar[3];
    var device = wifi[deviceName];
    if (device == undefined) return;
    var channel = "";
    var transitionTime = device.get(channel, usedStateNames.transition.n).val || 3;
    device.clearQueue();
    devices.invalidate(id);
    switch (stateName) {
        case 'on':
            device.on_off(channel, state.val >> 0 ? true : false);
            break;
        case 'rgbw':
        case 'rgb':
            var co = parseHexColors(state.val);
            device.color(channel, co);
            break;
        case 'r':
        case 'g':
        case 'b':
        case 'w':
        case 'sat':
            var co;
            if (typeof state.val == 'string' && state.val[0] == '#') {
                co = parseHexColors(state.val);
            } else {
                co = device.getRGBStates(channel);
                co[stateName] = state.val >> 0;
            }
            device.color(channel, co);
            break;
        case usedStateNames.refresh.n:
            device.refresh();
            device.dev.set(usedStateNames.refresh.n, false);
            device.dev.update();
            break;
        case usedStateNames.bri.n:
            device.bri(channel, state.val >> 0, transitionTime);
            break;
        case usedStateNames.ct.n:
            device.ct(channel, state.val >> 0, transitionTime);
            break;
        case usedStateNames.progSpeed.n:
            var progNo = device.get(channel, usedStateNames.progNo.n).val;
            device.addToQueue(channel, device.cmds.progNo, progNo, state.val);
            break;
        case usedStateNames.progNo.n:
            if (typeof state.val == 'string') {
                var ar = state.val.split(' ');
                if (!ar || ar.lengt < 2) ar = state.val.split(',');
                if (ar && ar.length >= 2) {
                    var speed = parseInt(ar[1]);
                    state.val = parseInt(ar[0]);
                }
            } else {
                var speed = device.get(channel, usedStateNames.progSpeed.n).val | 30;
            }
            device.addToQueue(channel, device.cmds.progNo, state.val >> 0, speed);
            break;
        case usedStateNames.progOn.n:
            device.addToQueue(channel, state.val ? device.cmds.progOn : device.cmds.progOff);
            break;
        case usedStateNames.command.n:
            var v = state.val.replace(/(^on$|red|green|blue|transition|bri|off)/g, function(match, p) { return { '#': '#', off:'off:1', on:'on:1', red:'r', green:'g', blue:'b', white: 'w', transition:'x', bri:'l'/*, off:'on:0'*/} [match] });
            //v = v.replace(/\s|\"|;$|,$/g, '').replace(/=/g, ':').replace(/;/g, ',').replace(/true/g, 1).replace(/((on|off),{1})/g, '$2:1,').replace(/#((\d|[a-f]|[A-F])*)/g, 'h:"$1"').replace(/(r|g|b|w|x|l|sat|off|on|ct|h)/g, '"$1"').replace(/^\{?(.*?)\}?$/, '{$1}');
            v = v.replace(/\s|\"|;$|,$/g, '').replace(/=/g, ':').replace(/;/g, ',').replace(/true/g, 1).replace(/((on|off),{1})/g, '$2:1,').replace(/#((\d|[a-f]|[A-F]|[.])*)/g, 'h:"$1"').replace(/(r|g|b|w|x|l|sat|off|on|ct|h)/g, '"$1"').replace(/^\{?(.*?)\}?$/, '{$1}');
            try {
                var colors = JSON.parse(v);
            } catch (e) {
                adapter.log.error("on Command: " + e.message + ': state.val="' + state.val + '"');
                return;
            }
            if (colors.h) {
                var co = parseHexColors('#'+colors.h);
                //colors = Object.assign(colors, co);
                for (var i in co) {
                    colors[i] = co[i];
                }
                delete colors.h;
            }
            if (!colors || typeof colors !== 'object') return;
            if(colors.off !== undefined) {
                device.color(channel, {r:0, g:0, b:0, w: colors.w != undefined ? 0 : undefined});
                device.states.red = 0; device.states.green = 0; device.states.blue = 0; if (device.states.white != undefined) device.states.white = 0;
            }
            var o = fullExtend(device.getRGBStates(channel), colors);
            adapter.log.debug(JSON.stringify(o));
            if (o.x !== undefined) {
                transitionTime = o.x >> 0;
            }
            if (o['on'] !== undefined) {
                device.on_off(channel, o.on >> 0 ? true : false);
            }
            if (colors.r!==undefined || colors.g!==undefined || colors.b!==undefined || colors.w!==undefined || colors.sat!==undefined) {
                device.fade(channel, o, transitionTime);
            }
            if (o['ct'] !== undefined) {
                device.ct(channel, o.ct >> 0, transitionTime);
            }
            if (o['l'] !== undefined) {
                device.bri(channel, o.l >> 0, transitionTime);
            }
            break;
        default:
            return
    }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function wifiLight(config, cb) {
    this.USE_SOCKET_ONCE = false; //true;
    this.config = config;
    this.isOnline = false;

    this.cmds = cmds[config.type];
    if (!this.cmds) {
        adapter.log.error('wrong device type. ' + config.type + ' not yet supported!');
        if (cb) cb(-1);
        return null;
    }
    if(this.cmds.vmax == undefined) this.cmds.vmax = 255;

    this.createDevice(function(err) {
        this.setOnline(false);

        if (this.cmds.onlyConnectOnWrite) {
            this.USE_SOCKET_ONCE = true;
            this.setOnline('on demand');
        }
        this.locked = 0;
        this.queue = [];
        this.dataBuffer = new Uint8Array(200);
        //this.dataBuffer = new Buffer(200);
        this.dataBuffer.pos = 0;
        //this.dataBuffer = null;
        this.states = { red: this.get('r'), green: this.get('g'), blue: this.get('b') };
        this.start(cb);
    }.bind(this));
    return this;
}

wifiLight.prototype.log = function (msg) {
    adapter.log.debug('[' + this.config.ip + '] ' + msg);
};

wifiLight.prototype.createDevice = function (cb) {
    this.dev = new devices.CDevice(0, '');
    this.dev.setDevice(this.config.ip, {common: {name: this.config.name, role: 'device'}, native: { type: this.config.type, intervall: this.config.pollIntervall } });
    for (var j in usedStateNames) {
        if (j == 'white' && this.cmds.rgbw == undefined) continue;
        var st = Object.assign({}, usedStateNames[j]);
        if (j == 'progNo' && this.cmds.programNames) st.common.states = this.cmds.programNames;
        this.dev.createNew(st.n, st);
    }
    devices.update(cb);
};

wifiLight.prototype.reconnect = function (cb, timeout) {
    if (cb && typeof cb != 'function') {
        timeout = cb;
        cb = undefined;
    }
    if (this.client) {
        this.destroyClient();
        setTimeout(this.start.bind(this, cb), timeout == undefined ? 5000 : timeout);
    }
};

wifiLight.prototype.start = function (cb) {
    if (this.USE_SOCKET_ONCE) {
        wifi[this.dev.getFullId()] = this;
        cb(0);
        return;
    }

    var self = this;
    self.destroyClient();
    if (debug) {
        this.ts = new Date().getTime();
    }
    self.client = new net.Socket();
    self._write = this.USE_SOCKET_ONCE ? this.writeOnce : this.client.write.bind(this.client);

    //self.client.setKeepAlive(true,10000);
    //self.client.setNoDelay(true);

    self.client.setTimeout(5000, function () {
        //self.log('self.client.setTimeout for ' + self.config.ip);
    });
    self.client.on('data', function(data) {
        self.onData(data);
    });
    self.client.on('close', function(hasError) {
        self.setOnline(false);
        var ts = debug ? '(' + parseInt((new Date().getTime() - self.ts) / 1000) + ' sec) ' : "";
        self.log('onClose ' + ts + 'hasError=' + hasError + ' client=' + self.client);
    });
    self.client.on('error', function(error) {
        var ts = debug ? '(' + parseInt((new Date().getTime() - self.ts) / 1000) + ' sec) ' : "";
        self.log('onError: ' + ts + (error.code != undefined ? error.code : "") + error.message);
        switch (error.errno) { //error.code
            case 'ECONNRESET':
            case 'ETIMEDOUT':
            case 'EPIPE':
                self.reconnect(5000);
                break;
        }
        self.setOnline(false);
    });
    //self.client.on('connect', function(error) {
    //});

    self.client.connect(self.config.port, self.config.ip, function() {
        wifi[self.dev.getFullId()] = self;
        self.log(self.config.ip + ' connected');
        self.setOnline(true);
        self.runUpdateTimer();
        adapter.log.debug('self.client.connect: connected');
        if (cb && typeof cb == 'function') cb();
    });
};

wifiLight.prototype.destroyClient = function () {
    if (this.updateTimer) {
        clearTimeout(this.updateTimer);
        this.updateTimer = null;
    }
    if (this.client) {
        this.client.destroy();
        this.client = null;
    }
};

wifiLight.prototype.writeOnce = function(data, cb) {

    if (this.client) {
        this.client.write(data, cb);
        return;
    }
    this.client = new net.Socket();
    this.client.setTimeout(5000, function () {
        //this.log('self.client.setTimeout for ' + self.config.ip);
    });

    var self = this;
    this.client.on('data', function(data) {
        self.onData(data);
        self.client.end();
        self.client = null;
    });
    this.client.on('error', function(error) {
        self.destroyClient();
    });

    this.client.connect(this.config.port, this.config.ip, function() {
        self.client.write(data, cb);
    });
};

wifiLight.prototype.get = function (channel, state) {
    return this.dev.get(channel, state);
};

wifiLight.prototype.unlock = function () {
    this.addToQueue({unlock: true});
};
wifiLight.prototype.lock = function () {
    this.locked += 1;
};

wifiLight.prototype.close = function() {
    if (this.client) {
        this.client.destroy();
        this.client = null;
    }
};

wifiLight.prototype.runUpdateTimer = function () {
    this.refresh();
    if (this.config.pollIntervall > 0) {
        this.updateTimer = setTimeout(this.runUpdateTimer.bind(this), this.config.pollIntervall * 1000);
    }
};

wifiLight.prototype.setOnline = function (val) {
    this.dev.set(usedStateNames.online.n, val);
    //this.dev.update();
    devices.update();
    this.isOnline = val;
};

wifiLight.prototype.directRefresh = function(channel) {
    this.log('sending refresh...');
    this.write(channel, this.cmds.statusRequest);
};

wifiLight.prototype.refresh = function(channel, ctrl) {
    this.addToQueue(channel, this.cmds.statusRequest, { ctrl: ctrl|true });
};

wifiLight.prototype.write = function(channel, cmd, cb) {
    var varArgs = arguments, buf;
    if (this.cmds.useCheckSum) {
        buf = new Buffer(cmd.length + 1);
        var sum = 0;
        for (var i = 0; i < cmd.length; i++) {
            buf[i] = cmd[i];
            sum += buf[i];
        }
        buf[buf.length - 1] = sum & 0xFF;
    } else {
        buf = new Buffer(cmd);
    }
    //var s = buf.inspect();
    //this.log('writing: ' + buf.toString('hex').match(/.{2}/g).join(' '));
    this.log('write: ' + hex(buf));
    if (!this.isOnline) {
        this.reconnect(function() {
            this._write(buf, cb);
        }.bind(this), 0);
        return;
    }
    this._write(buf, cb);
};

wifiLight.prototype.clearQueue = function() {
    this.queue.length = 0;
};

wifiLight.prototype.addToQueue = function (varArgArray) {
    var varArgs = arguments,
        channel = "",
        idx = 0,
        cmd = [];
    if (!(varArgs[0] instanceof Array)) {
        channel = varArgs[0];
        idx = 1;
    }
    if (!(varArgs[idx] instanceof Array)) {
        return;
    }
    if (varArgs.length > idx+1) {
        for (var i = 0, j=idx+1; i < varArgs[idx].length; i++) {
            cmd[i] = varArgs[idx][i] < 0 ? varArgs[j++] : varArgs[idx][i];
        }
    } else {
        cmd = varArgs[idx];
    }
    var opt = undefined;
    if (varArgs.length >= j && typeof varArgs[j] == 'object') {
        opt = varArgs[j];
    }

    this.queue.push ({
        cmd: cmd,
        ctrl: opt && opt.ctrl ? true : false,
        channel: channel,
        delay: opt && opt.delay ? opt.delay : this.cmds.delay != undefined ? this.cmds.delay : 10,
        ts: 0,
        inProcess: 0,
        unlock: 0
    });
    if (this.queue.length && this.queue[0].inProcess === 1) {
        //this.log('addToQueue: return without calling exec');
        return;
    }
    //this.log('addToQueue: calling exec');
    this.exec();
};

wifiLight.prototype.exec = function () {
    //this.log('exec: queue.length=' + this.queue.length + (this.queue.length ? ' inProcess=' + this.queue[0].inProcess : ""));
    var akt;
    while(true) {
        if (this.queue.length <= 0) {
            //this.log('exec: returning queue.length=0');
            return;
        }
        akt = this.queue[0];
        if (!(akt.inProcess || (!akt.ctrl && akt.ts != 0 && akt.ts < new Date().getTime()))) {
            break;
        }
        //this.log('exec: removing queue entry ' + akt.cmd.hex());
        if (this.queue.length <= 1 && !akt.cmd.eq (this.cmds.statusRequest)) {
            this.directRefresh(akt.channel);
        }
        this.queue.shift();
    }
    if (akt.unlock) {
        this.unlock();
        if (!akt.cmd) return;
    }
    //this.log('exec: write: ' + akt.cmd.hex());
    this.write (akt.channel, akt.cmd, function() {
        //this.log('exec: setTimeout: ' + akt.delay);
        setTimeout(this.exec.bind(this), akt.delay);
    }.bind(this));
    akt.inProcess = 1;
};


wifiLight.prototype.on_off = function (channel, state) {
    this.addToQueue(channel, state ? this.cmds.on : this.cmds.off);
};

wifiLight.prototype.fade = function (channel, rgbw, transitionTime) {
    if (!transitionTime) {
        this.color(channel, rgbw);
        return;
    }
    var co = { r: this.states.red, g: this.states.green, b: this.states.blue, w: this.states.white};
    var dif= { r: rgbw.r - co.r, g: rgbw.g - co.g, b: rgbw.b - co.b};
    dif.w = (rgbw.w != undefined && co.w != undefined) ? rgbw.w - co.w : 0;
    var maxSteps = Math.max(Math.abs(dif.r), Math.abs(dif.g), Math.abs(dif.b), Math.abs(dif.w), 1);
    dif.r /= maxSteps;
    dif.g /= maxSteps;
    dif.b /= maxSteps;
    dif.w /= maxSteps;

    var steps = maxSteps;
    var delay = parseInt(transitionTime*100 / maxSteps);

    for (var i = 0; i<steps; i++) {
        co.r += dif.r;
        co.g += dif.g;
        co.b += dif.b;
        if (co.w != undefined) co.w += dif.w;
        this.color(channel, roundRGB(co, true), { delay:delay });
    }
};

wifiLight.prototype.color = function (channel, rgbw, opt) {
    rgbw.w == undefined ?
        this.addToQueue(channel, this.cmds.rgb, rgbw.r, rgbw.g, rgbw.b, opt) :
        this.addToQueue(channel, this.cmds.rgbw, rgbw.r, rgbw.g, rgbw.b, rgbw.w, opt);
};

wifiLight.prototype.ct = function (channel, temp, transitionTime) {
    var co = ct2rgb(temp);
    var hsv = rgb2hsv(co);
    //hsv.v = this.get(channel, 'bri').val;
    var v = this.get(channel, 'bri').val;
    if (v) hsv.v = v;
    co = hsv2rgb(hsv);
    this.fade(channel, co, transitionTime);
};
wifiLight.prototype.temperature = wifiLight.prototype.ct;

wifiLight.prototype.getRGBStates = function (channel) {
    return {
        r: this.states.red,
        g: this.states.green,
        b: this.states.blue,
        w: this.states.white
    };
};

wifiLight.prototype.bri = function (channel, bri, transitionTime) {
    var co = this.getRGBStates(channel);
    var hsv = rgb2hsv(co);
    hsv.v = Math.max (Math.min(bri, 100), 0);
    co = hsv2rgb(hsv);
    this.fade(channel, co, transitionTime);
};
wifiLight.prototype.brightness = wifiLight.prototype.bri;


wifiLight.prototype.onData = function (data) {

    var newPos = this.dataBuffer.pos + data.length;
    if (newPos > this.dataBuffer.length) {
        var b = new Uint8Array(newPos + 200);
        //var b = new Buffer(newPos + 200);
        for (var i=0; i<this.dataBuffer.pos; i++) {
            b [i] = this.dataBuffer[i];
        }
        b.pos = this.dataBuffer.pos;
        this.dataBuffer = b;
    }

    this.dataBuffer.set(data, this.dataBuffer.pos);
    this.dataBuffer.pos += data.length;

    while (this.dataBuffer.pos >= this.cmds.responseLen)
    {
        var states = this.cmds.decodeResponse(this.dataBuffer);
        this.log('onData: raw: ' + hex(this.dataBuffer, this.cmds.responseLen));
        this.dataBuffer.copyWithin(0, this.cmds.responseLen, this.dataBuffer.pos);
        this.dataBuffer.pos -= this.cmds.responseLen;
        if (!states) break;
        this.states = states;
        this.log('onData: ' + JSON.stringify(this.states));
        if (this.states) {
            //set(usedStateNames.status.n, this.states.power);
            this.dev.set(usedStateNames.on.n, this.states.on);
            this.dev.set(usedStateNames.red.n, this.states.red);
            this.dev.set(usedStateNames.green.n, this.states.green);
            this.dev.set(usedStateNames.blue.n, this.states.blue);
            this.dev.set(usedStateNames.progNo.n, this.states.progNo);
            this.dev.set(usedStateNames.progOn.n, this.states.progOn);
            this.dev.set(usedStateNames.progSpeed.n, this.states.progSpeed);
            this.dev.set(usedStateNames.white.n, this.states.white);
            var rgb = '#' + this.states.red.toHex() + this.states.green.toHex() + this.states.blue.toHex();
            if (this.states.white != undefined) rgb += this.states.white.toHex();
            this.dev.set(usedStateNames.rgb.n, rgb);
            devices.update();
        }
    }
    return this.states;
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function normalizeConfigDevice(dev) {
    dev.pollIntervall = parseInt(dev.pollIntervall) | 0;
    if (dev.pollIntervall && dev.pollIntervall < 5) dev.pollIntervall = 5;
    dev.port = parseInt(dev.port) || 5577;
}

function main() {

    if (!adapter.config.devices) return;
    for (var i=0; i<adapter.config.devices.length; i++) {
        normalizeConfigDevice(adapter.config.devices[i]);

        new wifiLight(adapter.config.devices[i], function() {
        });
    }
    devices.update();
    adapter.subscribeStates('*');
    adapter.subscribeObjects('*');
}

