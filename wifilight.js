"use strict";

var discovery = require(__dirname + '/lib/discovery'),
    colors = require(__dirname + '/lib/colors'),
    soef = require('soef'),
    net = require('net');

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var wifi = {};
var debug = false;

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

soef.extendAll();
var hex = soef.arrayToHex;

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var adapter = soef.Adapter (
    main,
    onStateChange,
    onMessage,
    onUnload,
    { name: 'wifilight' }
);

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function onMessage (obj) {
    if (!obj) return;
    switch (obj.command) {
        case 'discovery':
            discovery.scanForAllDevices(
                function(entry) {
                    var ret = !adapter.config.devices.some(function(e,i) {
                        return e.ip == entry.ip;
                    });
                    if (ret) {
                        var dev = cmds.knownDeviceNames[entry.name];
                        entry.type = dev ? dev.type : '';
                        entry.port = dev && dev.port ? dev.port : 5577;
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

function onUnload(callback) {
    Object.keys(wifi).forEach(function(v) {
        wifi[v].close();
        delete wifi[v];
        adapter.log.debug('unload: ' + v);
    });
    callback && callback();
}

// process.on('exit', function() {
//     if (adapter &&adapter.log) adapter.log.info('on process exit');
//     console.log('on process exit');
// });

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var cmds = require(__dirname + '/devices');

var usedStateNames = {
    online:      { n: 'reachable', g:1, val: 0,     common: { write: false, min: false, max: true }},
    on:          { n: 'on',        g:3, val: false, common: { min: false, max: true }},
    bri:         { n: 'bri',       g:3, val: 100,   common: { min: 0, max: 100, unit: '%', desc: '0..100%' }},
    ct:          { n: 'ct',        g:1, val: 0,     common: { min: 0, max: 5000, unit: '°K', desc: 'temperature in °Kelvin 0..5000' }},
    red:         { n: 'r',         g:3, val: 0,     common: { min: 0, max: 255, desc: '0..255 or #rrggbb[ww] (hex)' }},
    green:       { n: 'g',         g:3, val: 0,     common: { min: 0, max: 255, desc: '0..255 or #rrggbb[ww] (hex)' }},
    blue:        { n: 'b',         g:3, val: 0,     common: { min: 0, max: 255, desc: '0..255 or #rrggbb[ww] (hex)' }},
    white:       { n: 'w',         g:3, val: 0,     common: { min: 0, max: 255, desc: '0..255 or #rrggbb[ww] (hex)' }},
    disco:       { n: 'disco',     g:2, val: 1,     common: { min: 1, max: 9, desc: '1..9' }},
    progNo:      { n: 'progNo',    g:1, val: 38,    common: { min: 35, max: 56, desc: '37..56, 97=none' }},
    progOn:      { n: 'progOn',    g:1, val: false, common: { min: false, max: true, desc: 'program on/off' }},
    progSpeed:   { n: 'progSpeed', g:3, val: 10,    common: { min: 0, max: 255 }, desc: 'speed for preogram'},
    refresh:     { n: 'refresh',   g:1, val: false, common: { min: false, max: true, desc: 'read states from device' }},
    transition:  { n: 'trans',     g:1, val: 30,    common: { unit: '\u2152 s', desc: 'in 10th seconds'} },
    command:     { n: 'command',   g:3, val: 'r:0, g:0, b:0, on:true, transition:30', desc: 'r:0, g:0, b:0, on:true, transition:2' },
    rgb:         { n: 'rgb',       g:3, val: '',    common: { desc: '000000..ffffff' }},
    onTime:      { n: 'onTime',    g:3, val: '',    common: {}}
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
    var deviceName = ar[2], channelName = '';
    if (ar.length > 4) {
        channelName = ar.splice(3, 1)[0];
        deviceName += '.' + channelName;
    }
    var stateName = ar[3];
    var device = wifi[deviceName];
    if (device == undefined || !device.isOnline) return;
    if (device.cmds.decodeResponse) devices.invalidate(id);
    device.stopRunningProgram();
    device.onStateChange(channelName, stateName, state.val);
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var WifiLight = function (config, zone, cb) {
    if (!(this instanceof WifiLight)) {
        return new WifiLight(config, zone, cb);
    }
    if (!config) return this;
    //this.USE_SOCKET_ONCE = false; //true;
    this.config = config;
    this.isOnline = false;
    this.cmds = cmds[config.type];
    this.prgTimer = soef.Timer();
};

WifiLight.prototype.run = function (cb) {
    if (!this.cmds) {
        adapter.log.error('wrong device type. ' + this.config.type + ' not yet supported!');
        if (cb) cb(-1);
        return null;
    }
    if (this.cmds.vmax == undefined) this.cmds.vmax = 255;
    this.cmds.g = this.cmds.g || 1;

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
        this.states = { red: this.get('r'), green: this.get('g'), blue: this.get('b') };
        this.start(cb);
    }.bind(this));
    return this;
};

WifiLight.prototype.log = function (msg) {
    adapter.log.debug('[' + this.config.ip + '] ' + msg);
};

WifiLight.prototype.createDevice = function (cb) {
    this.dev = new devices.CDevice(0, '');
    this.dev.setDevice(this.config.ip, {common: {name: this.config.name, role: 'device'}, native: { type: this.config.type, intervall: this.config.pollIntervall } });
    if (this.zone !== undefined) {
        this.dev.setChannel(this.zone.toString(), ['All Zones', 'Zone 1', 'Zone 2', 'Zone 3', 'Zone 4'][this.zone]);
    }
    wifi[this.dev.getFullId()] = this;
    for (var j in usedStateNames) {
        if (j == 'white' && this.cmds.rgbw == undefined) continue;
        var st = Object.assign({}, usedStateNames[j]);
        if ((j === 'progNo' || j==='disco') && this.cmds.programNames) st.common.states = this.cmds.programNames;
        if (st.g & this.cmds.g) {
            this.dev.createNew(st.n, st);
        }
    }
    devices.update(cb);
};

WifiLight.prototype.onStateChange = function (channel, stateName, val) {

    var transitionTime = this.get(channel, usedStateNames.transition.n) || {val:0}.val || 0;
    this.clearQueue();
    switch (stateName) {
        case usedStateNames.transition.n:
            this.dev.updateVal(usedStateNames.transition.n, val);
            break;
        case 'onTime':
            this.onTime(channel, val);
            break;
        case 'on':
            this.on_off(channel, val >> 0 ? true : false);
            break;
        case 'rgbw':
        case 'rgb':
            var co = parseHexColors(val);
            this.color(channel, co);
            break;
        case 'r':
        case 'g':
        case 'b':
        case 'w':
        case 'sat':
            var co;
            if (typeof val == 'string' && val[0] == '#') {
                co = parseHexColors(val);
            } else {
                co = this.getRGBStates(channel);
                co[stateName] = val >> 0;
            }
            this.color(channel, co);
            break;
        case usedStateNames.refresh.n:
            this.refresh();
            this.dev.set(usedStateNames.refresh.n, false);
            this.dev.update();
            break;
        case usedStateNames.bri.n:
            this.bri(channel, val >> 0, transitionTime);
            break;
        case usedStateNames.ct.n:
            this.ct(channel, val >> 0, transitionTime);
            break;
        case usedStateNames.progSpeed.n:
            var progNo = this.get(channel, usedStateNames.progNo.n).val;
            this.addToQueue(channel, this.cmds.progNo, progNo, val);
            break;
        case usedStateNames.progNo.n:
            if (typeof val == 'string') {
                var ar = val.split(' ');
                if (!ar || ar.lengt < 2) ar = val.split(',');
                if (ar && ar.length >= 2) {
                    var speed = parseInt(ar[1]);
                    val = parseInt(ar[0]);
                }
            } else {
                var speed = this.getval(channel, usedStateNames.progSpeed.n, 30);
            }
            //if (this.cmds._setProgNo) _setProgNo(this, channel, val >> 0); else
            this.addToQueue(channel, this.cmds.progNo, val >> 0, speed);
            break;
        case usedStateNames.progOn.n:
            this.addToQueue(channel, val ? this.cmds.progOn : this.cmds.progOff);
            break;
        case usedStateNames.command.n:
            // var v = val.replace(/(^on$|red|green|blue|transition|bri|off)/g, function(match, p) { return { '#': '#', off:'off:1', on:'on:1', red:'r', green:'g', blue:'b', white: 'w', transition:'x', bri:'l'/*, off:'on:0'*/} [match] });
            // v = v.replace(/\s|\"|;$|,$/g, '').replace(/=/g, ':').replace(/;/g, ',').replace(/true/g, 1).replace(/((on|off),{1})/g, '$2:1,').replace(/#((\d|[a-f]|[A-F]|[.])*)/g, 'h:"$1"').replace(/(r|g|b|w|x|l|sat|off|on|ct|h)/g, '"$1"').replace(/^\{?(.*?)\}?$/, '{$1}');
            var v = val.replace(/(^on$|red|green|blue|transition|bri|off)/g, function(match, p) { return { '#': '#', off:'off:1', on:'on:1', red:'r', green:'g', blue:'b', white: 'w', transition:'x', bri:'l'/*, off:'on:0'*/} [match] });
            v = v.replace(/\s|\"|;$|,$/g, '').replace(/=/g, ':').replace(/;/g, ',').replace(/true/g, 1).replace(/((on|off),{1})/g, '$2:1,').replace(/#((\d|[a-f]|[A-F]|[.])*)/g, 'h:"$1"').replace(/(r|g|b|w|x|l|sat|off|on|ct|h|p)/g, '"$1"').replace(/^\{?(.*?)\}?$/, '{$1}');
            try {
                var colors = JSON.parse(v);
            } catch (e) {
                adapter.log.error("on Command: " + e.message + ': state.val="' + val + '"');
                return;
            }
            if (colors.p) {
                setTimeout(this.runJsonProgram.bind(this), 10, channel, colors.p);
                return;
            }
            if (colors.h) {
                Object.assign(colors, parseHexColors(colors.h));
                delete colors.h;
            }
            if (!colors || typeof colors !== 'object') return;
            if(colors.off !== undefined) {
                this.color(channel, {r:0, g:0, b:0, w: colors.w != undefined ? 0 : undefined});
                this.states.red = 0; this.states.green = 0; this.states.blue = 0; if (this.states.white != undefined) this.states.white = 0;
            }
            var o = fullExtend(this.getRGBStates(channel), colors);
            adapter.log.debug(JSON.stringify(o));
            if (o.x !== undefined) {
                transitionTime = o.x >> 0;
            }
            if (o['on'] !== undefined) {
                this.on_off(channel, o.on >> 0 ? true : false);
            }
            if (colors.r!==undefined || colors.g!==undefined || colors.b!==undefined || colors.w!==undefined || colors.sat!==undefined) {
                this.fade(channel, o, transitionTime);
            }
            if (o['ct'] !== undefined) {
                this.ct(channel, o.ct >> 0, transitionTime);
            }
            if (o['l'] !== undefined) {
                this.bri(channel, o.l >> 0, transitionTime);
            }
            break;
        default:
            return
    }
};

WifiLight.prototype.stopRunningProgram = function () {
    this.prgTimer.clear();
    this.refreshPaused = 0;
    this.clearQueue();
};

WifiLight.prototype.runJsonProgram =  function (channel, cmds) {
    var i = -1, self = this;
    var delay = 30;
    var lastCo = { red: self.states.red, green: self.states.green, blue: self.states.blue};
    this.prgTimer.clear();
    self.clearQueue();
    
    function doIt() {
        if (self.queue.length > 0) {
            setTimeout(doIt, self.queue.length*2);
            return;
        }
        if (++i >= cmds.length) i = 0;
        var cmd = cmds[i];
        if (cmd.x === undefined) cmd.x = 0;
        var delay = Math.abs(cmd.x);
        if (cmd.r !== undefined) {
            Object.assign(self.states, lastCo);
            self.fade(channel, cmd, delay);
            lastCo.red = cmd.r; lastCo.green = cmd.g; lastCo.blue = cmd.b;
        }
        if (cmd.x < 0) return;
        self.prgTimer.set(doIt, 10 + delay * 10);
    }
    if (cmds.length > 0) {
        this.refreshPaused = true;
        doIt();
    }
    else this.stopRunningProgram();
};


WifiLight.prototype.reconnect = function (cb, timeout) {
    if (cb && typeof cb != 'function') {
        timeout = cb;
        cb = undefined;
    }
    if (this.client) {
        this.destroyClient();
        setTimeout(this.start.bind(this, cb), timeout == undefined ? 5000 : timeout);
    }
};

WifiLight.prototype._write = function(data, cb) {
    this.client.write(data, cb);
};

WifiLight.prototype.start = function (cb) {
    
    if (this.USE_SOCKET_ONCE) {
        //wifi[this.dev.getFullId()] = this;
        //this._write = this.cmds.udp ? this.writeUdp : this.writeOnce;
        if (this.__proto__._write === WifiLight.prototype._write) {
            WifiLight.prototype._write = this.writeOnce;
        }
        return cb && cb(0);
    }

    var self = this;
    self.destroyClient();
    if (debug) {
        this.ts = new Date().getTime();
    }
    self.client = new net.Socket();
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
        self.log('onError: ' + ts + (error.code != undefined ? error.code : "") + ' ' + error.message);
        switch (error.errno) { //error.code
            case 'ECONNRESET':
            case 'ETIMEDOUT':
            case 'EPIPE':
                self.reconnect(5000);
                break;
        }
        self.setOnline(false);
    });
    self.client.connect(self.config.port, self.config.ip, function() {
        //wifi[self.dev.getFullId()] = self;
        self.log(self.config.ip + ' connected');
        self.setOnline(true);
        self.runUpdateTimer();
        adapter.log.debug('self.client.connect: connected');
        if (cb && typeof cb == 'function') cb();
    });
};

WifiLight.prototype.destroyClient = function () {
    if (this.updateTimer) {
        clearTimeout(this.updateTimer);
        this.updateTimer = null;
    }
    if (this.client) {
        this.client.destroy();
        this.client = null;
    }
};

WifiLight.prototype.writeOnce = function(data, cb) {

    if (this.client) {
        this.client.write(data, cb);
        return;
    }
    this.client = new net.Socket();
    // this.client.setTimeout(5000, function () {
    //     //this.log('self.client.setTimeout for ' + self.config.ip);
    // });

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

WifiLight.prototype.get = function (channel, state) {
    return this.dev.get(channel, state);
};
WifiLight.prototype.getval = function (channel, state, def) {
    var o = this.dev.get(channel, state);
    if (o && o.val !== undefined) return o.val;
    return def;
};

WifiLight.prototype.unlock = function () {
    this.addToQueue({unlock: true});
};
WifiLight.prototype.lock = function () {
    this.locked += 1;
};

WifiLight.prototype.close = function() {
    this.clearQueue();
    this.destroyClient();
    if (this.writeTimeout) {
        clearTimeout(this.writeTimeout);
        this.writeTimeout = null;
    }
    if (this.onTimerObject) {
        clearTimeout(this.onTimerObject);
        this.onTimerObject = null;
    }
    this.prgTimer.clear();
};

WifiLight.prototype.runUpdateTimer = function () {
    if (!this.cmds.decodeResponse) return;
    this.refresh();
    if (this.config.pollIntervall > 0) {
        this.updateTimer = setTimeout(this.runUpdateTimer.bind(this), this.config.pollIntervall * 1000);
    }
};

WifiLight.prototype.setOnline = function (val) {
    this.isOnline = val;
    if ((this.cmds.g & usedStateNames.online.g) === 0) return;
    this.dev.set(usedStateNames.online.n, val);
    //this.dev.update();
    devices.update();
    //this.isOnline = val;
};

WifiLight.prototype.directRefresh = function(channel) {
    if (!this.cmds.statusRequest || this.refreshPaused) return;
    this.log('sending refresh...');
    this.write(channel, this.cmds.statusRequest);
};

WifiLight.prototype.refresh = function(channel, ctrl) {
    if (!this.cmds.statusRequest || this.refreshPaused) return;
    this.addToQueue(channel, this.cmds.statusRequest, { ctrl: ctrl|true });
};

WifiLight.prototype.write = function(channel, cmd, cb) {
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
    if (!this.isOnline /*&& !this.USE_SOCKET_ONCE*/) {
        this.reconnect(function() {
            this._write(buf, cb);
        }.bind(this), 0);
        return;
    }
    this._write(buf, cb);
};

WifiLight.prototype.clearQueue = function() {
    this.queue.length = 0;
};

WifiLight.prototype.addToQueue = function (varArgArray) {
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
            //cmd[i] = varArgs[idx][i] < 0 && varArgs[idx][i] !== cmds.VARS.separator ? varArgs[j++] : varArgs[idx][i];
            cmd[i] = varArgs[idx][i] < 0 && varArgs[idx][i] !== cmds.VARS.separator && varArgs[idx][i] !== cmds.VARS.sepNoDelay ? varArgs[j++] : varArgs[idx][i];
        }
    } else {
        cmd = varArgs[idx];
    }
    var opt = undefined;
    if (varArgs.length >= j && typeof varArgs[j] == 'object') {
        opt = varArgs[j];
    }
    
    var _cmd = [];
    var last = cmd.length - 1;
    cmd.forEach(function(c, i) {
        var sep = 0;
        switch(c) {
            case cmds.VARS.separator: sep = 1; break;
            case cmds.VARS.sepNoDelay: sep = 2; break;
            default: _cmd.push(c);
        }
        if (sep || i === last) {
            this.queue.push({
                cmd: _cmd,
                ctrl: opt && opt.ctrl ? true : false,
                channel: channel,
                delay: sep & 2 ? 0 : opt && opt.delay !== undefined ? opt.delay : this.cmds.delay != undefined ? this.cmds.delay : 10,
                ts: 0,
                inProcess: 0,
                unlock: 0
            });
            _cmd = [];
        }
    }.bind(this));
    // this.queue.push ({
    //     cmd: cmd,
    //     ctrl: opt && opt.ctrl ? true : false,
    //     channel: channel,
    //     delay: opt && opt.delay ? opt.delay : this.cmds.delay != undefined ? this.cmds.delay : 10,
    //     ts: 0,
    //     inProcess: 0,
    //     unlock: 0
    // });
    if (this.queue.length && this.queue[0].inProcess === 1) {
        //this.log('addToQueue: return without calling exec');
        return;
    }
    this.exec();
};

WifiLight.prototype.exec = function () {
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
        this.writeTimeout = setTimeout(this.exec.bind(this), akt.delay);
    }.bind(this));
    akt.inProcess = 1;
};


WifiLight.prototype.on_off = function (channel, state) {
    this.addToQueue(channel, state ? this.cmds.on : this.cmds.off);
    //if (!state && this.cmds.udp) this.addToQueue(channel, [0x4E,0x19,0x55]);
};

WifiLight.prototype.fade = function (channel, rgbw, transitionTime) {
    if (!transitionTime) {
        this.color(channel, rgbw);
        return;
    }
    var co = { r: this.states.red, g: this.states.green, b: this.states.blue, w: this.states.white};
    var dif= { r: rgbw.r - co.r, g: rgbw.g - co.g, b: rgbw.b - co.b};
    dif.w = (rgbw.w != undefined && co.w != undefined) ? rgbw.w - co.w : 0;
    var maxSteps = Math.max(Math.abs(dif.r), Math.abs(dif.g), Math.abs(dif.b), Math.abs(dif.w), 1);
    
    maxSteps = Math.min ((transitionTime*100) / this.cmds.delay, maxSteps);
    
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

WifiLight.prototype.color = function (channel, rgbw, opt) {
    rgbw.w == undefined ?
        this.addToQueue(channel, this.cmds.rgb, rgbw.r, rgbw.g, rgbw.b, opt) :
        this.addToQueue(channel, this.cmds.rgbw, rgbw.r, rgbw.g, rgbw.b, rgbw.w, opt);
};

WifiLight.prototype.ct = function (channel, temp, transitionTime) {
    var co = ct2rgb(temp);
    var hsv = rgb2hsv(co);
    //hsv.v = this.get(channel, 'bri').val;
    var v = this.get(channel, 'bri').val;
    if (v) hsv.v = v;
    co = hsv2rgb(hsv);
    this.fade(channel, co, transitionTime);
};
WifiLight.prototype.temperature = WifiLight.prototype.ct;

WifiLight.prototype.getRGBStates = function (channel) {
    return {
        r: this.states.red,
        g: this.states.green,
        b: this.states.blue,
        w: this.states.white
    };
};

WifiLight.prototype.bri = function (channel, bri, transitionTime) {
    var co = this.getRGBStates(channel);
    var hsv = rgb2hsv(co);
    hsv.v = Math.max (Math.min(bri, 100), 0);
    co = hsv2rgb(hsv);
    this.fade(channel, co, transitionTime);
};
//WifiLight.prototype.brightness = WifiLight.prototype.bri;

WifiLight.prototype.onTime = function (channel, val) {
    if (this.onTimerObject) {
        clearTimeout(this.onTimerObject);
        this.onTimerObject = null;
    }
    var timeout = val >> 0,
        cmd = '#00000000;x10';
    if (typeof val == 'string') {
        var ar = val.split(';');
        timeout = parseInt(ar.shift());
        cmd = ar.join(';');
    }
    if (timeout && timeout > 0) {
        this.onTimerObject = setTimeout(this.onStateChange.bind(this), timeout*100, channel, 'command', cmd);
    }
};

WifiLight.prototype.onData = function (data) {

    var newPos = this.dataBuffer.pos + data.length;
    if (newPos > this.dataBuffer.length) {
        var b = new Uint8Array(newPos + 200);
        //var b = new Buffer(newPos + 200);
        for (var i=0; i<this.dataBuffer.pos; i++) {
            b [i] = this.dataBuffer[i];
        }
        //this.dataBuffer.copy(b, 0, 0, this.dataBuffer.pos);
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
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var MiLight = function MiLight (config, zone, cb) {
    // MiLight.prototype._zone = function() {
    //     return zone;
    // };
    WifiLight.call(this, config);
    if (!this.cmds) return;
    //extend(this, WifiLight.call(this, config));
    this.zone = zone;
    //this.cmds = Object.assign({}, tmp, {v:1});
    //this.cmds = fullExtend({}, this.cmds);
    this.cmds = clone(this.cmds);
    this.cmds.setZone(this.zone);
    this.states = { on: 0, red: 0, green: 0, blue: 0, white: 0 };
    this.writeTimer = soef.Timer();
    this.isOnline = 'on demand';
};

MiLight.prototype = new WifiLight;
MiLight.prototype.construcor = WifiLight;

MiLight.prototype._write = function writeUdp (data, cb) {
    
    var self = this;
    //??this.writeTimer.clear();
    if (!this.client) {
        var dgram = require('dgram');
        self.client = dgram.createSocket('udp4');
        //self.client = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        self.client.on("listening", function (error) {
            if (error) return cb && cb(error);
            if (self.config.ip === '255.255.255.255') {
                self.client.setBroadcast(true);
            }
        });
        self.client.on('message', function (data, rinfo) {
        });
        this.client.on('error', function (error) {
        });
        this.client.on('close', function (error) {
            self.client = null;
            adapter.log.debug('udp socked closed');
        });
    }
    
    self.client.send(data, 0, data.length, self.config.port, self.config.ip, function(error, bytes) {
        self.writeTimer.set(function() {
            if (self && self.client) self.client.close();
        }, 2000);
        cb && cb();
    });
};


MiLight.prototype.bri = function (channel, bri, transitionTime) {
    this.addToQueue(channel, this.cmds._bri(bri));
};

MiLight.prototype.color = function (channel, rgbw, opt) {
    if (rgbw.w !== undefined) {
        this.addToQueue(channel, this.cmds._white((rgbw.w * 100 / 255) >> 0));
        return;
    }
    var hsv = rgb2hsv(rgbw);
    if (hsv.h === 0 && hsv.v === 0) {
        this.on_off(channel, false);
        return;
    }
    var color = (256 + 176 - Math.floor(Number(hsv.h) / 360.0 * 255.0)) % 256;
    this.addToQueue(channel, this.cmds.on);
    this.addToQueue(channel, this.cmds._color(color));
    this.addToQueue(channel, this.cmds._bri(hsv.v));
};

MiLight.prototype.pair = function pair() {
    for (var i=0; i<3; i++) {
        this.addToQueue(channel, this.pair, { delay: 1000 });
    }
};
MiLight.prototype.unPair = function pair() {
    for (var i=0; i<15; i++) {
        this.addToQueue(channel, this.unPair, { delay: 200 });
    }
};

MiLight.prototype.onStateChange = function (channel, stateName, val) {
    switch (stateName) {
        case 'disco':
            val = val >> 0;
            if (val === 0) {
                this.addToQueue(channel, this.cmds.off);
                return;
            }
            var bri = this.getval(channel, 'bri');
            var cmd = this.cmds._white(10).cc(this.cmds.on);
            while (val--) {
                cmd = cmd.cc(this.cmds.discoMode);
            }
            this.addToQueue(channel, cmd/*, {delay: 50}*/ );
            break;
        default:
            WifiLight.prototype.onStateChange.call(this, channel, stateName, val);
    }
};

function checkDeletedDevices(cb) {
    adapter.getDevices(function(err, res) {
        if (err || !res || res.length <= 0) return cb && cb();
        var reIp = /[^0-9]/g;
        var toDelete = [];
        res.forEach(function(obj) {
            var ar = obj._id.split('.');
            var ip = ar[2].replace(reIp, '.');
            var found = adapter.config.devices.find(function(v) {
                return v.ip === ip;
            });
            if (!found) {
                toDelete.push(obj._id);
            }
        });
        toDelete.forEachCallback(cb, function(id, next) {
            dcs.del(id, next);
        });
    });
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function normalizeConfigDevice(dev) {
    dev.pollIntervall = parseInt(dev.pollIntervall) | 0;
    if (dev.pollIntervall && dev.pollIntervall < 5) dev.pollIntervall = 5;
    dev.port = parseInt(dev.port) || 5577;
}

function main() {

    if (!adapter.config.devices) return;
    checkDeletedDevices(function(err) {
        // \/
    });
    for (var i=0; i<adapter.config.devices.length; i++) {
        normalizeConfigDevice(adapter.config.devices[i]);
        
        if (adapter.config.devices[i].type === 'MiLight') {
            for (var zone=0; zone<=4; zone++) {
                new MiLight(adapter.config.devices[i], zone).run(function() {
                });
            }
        } else
            new WifiLight(adapter.config.devices[i]).run(function() {
        });
    }
    devices.update();
    adapter.subscribeStates('*');
    adapter.subscribeObjects('*');
}



