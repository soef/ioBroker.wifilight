"use strict";

var utils = require(__dirname + '/lib/utils'),
    soef = require(__dirname + '/lib/soef'),
    devices = new soef.Devices(),
    net = require('net'),
    colors = require(__dirname + '/lib/colors');

//"colorsys": "^1.0.9",
//"promise": "^7.1.1"

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var wifi = {};

var adapter = utils.adapter({
    name: 'wifilight',

    unload: function (callback) {
        try {
            for (var i in wifi) {
                wifi[i].close();
            }
            callback();
        } catch (e) {
            callback();
        }
    },
    discover: function (callback) {
    },
    install: function (callback) {
    },
    uninstall: function (callback) {
    },
    objectChange: function (id, obj) {
    },
    stateChange: function (id, state) {
        if (state && !state.ack) {
            stateChange(id, state);
        }
    },
    ready: function () {
        //adapter.log.debug = console.log;
        devices.init(adapter, function(err) {
            main();
        });
    }
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var cmds = require(__dirname + '/devices');

var usedStateNames = {
    online:      { n: 'reachable', val: 0,     common: { write: false, min: false, max: true }},
    status:      { n: 'on',        val: false, common: { min: false, max: true }},
    brightness:  { n: 'bri',       val: 0,     common: { min: 0, max: 100, unit: '%', desc: '0..100%' }},
    temperature: { n: 'ct',        val: 0,     common: { min: 0, max: 5000, unit: '°K', desc: 'in °Kelvin 0..5000' }},
    red:         { n: 'r',         val: 0,     common: { min: 0, max: 255 }},
    green:       { n: 'g',         val: 0,     common: { min: 0, max: 255 }},
    blue:        { n: 'b',         val: 0,     common: { min: 0, max: 255 }},
    progNo:      { n: 'progNo',    val: 38,    common: { min: 35, max: 56, desc: '36..56' }},
    progOn:      { n: 'progOn',    val: false, common: { min: false, max: true }},
    speed:       { n: 'speed',     val: 10,    common: { min: 0, max: 255 }},
    refresh:     { n: 'refresh',   val: false, common: { min: false, max: true, desc: 'read states from device' }},
    //alpha:       { n: 'sat',       val: 0, common: { min: 0, max: 255 }},
    transition:  { n: 'trans',     val: 30,    common: { unit: '\u2152 s', desc: 'in 10th seconds'} },
    command:     { n: 'command',   val: 'r:0, g:0, b:0, on:true, transition:30', desc: 'r:0, g:0, b:0, on:true, transition:2' }
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//function getState(id, state) {
//    //var s = id.replace(/\w+$/, state);
//    //var s = id.replace(/\w+$/, '');
//    var o = devices.get(id);
//    if (o === undefined) return undefined;
//    return o.val || 0;
//}

function stateChange(id, state) {
    var ar = id.split('.');
    //var dcs = adapter.idToDCS(id);
    var deviceName = ar[2], stateName = ar[3];
    var device = wifi[deviceName];
    if (device == undefined) return;
    var channel = "";
    //var transitionTime = getState(dcs(deviceName, 'tans')) || 3;
    var transitionTime = device.get(channel, usedStateNames.transition.n).val || 3;
    device.clearQueue();
    switch (stateName) {
        case 'on':
            device.on_off(channel, state.val >> 0 ? true : false);
            break;
        case 'r':
        case 'g':
        case 'b':
        case 'sat':
            if (typeof state.val == 'string' && state.val[0] == '#') {
                var co = {
                    r: parseInt(state.val.substr(1, 2), 16),
                    g: parseInt(state.val.substr(3, 2), 16),
                    b: parseInt(state.val.substr(5, 2), 16)
                };
                device.color(channel, co);
                break;
            }
            var colors = device.getRGBStates(channel);
            colors[stateName] = state.val >> 0;
            device.color(channel, colors.r, colors.g, colors.b, colors.sat);
            break;
        case usedStateNames.brightness.n:
            device.brightness(channel, state.val >> 0, transitionTime);
            break;
        case usedStateNames.temperature.n:
            device.temperature(channel, state.val >> 0, transitionTime);
            break;
        //case 'spped':
        case usedStateNames.speed.n:
            var progNo = device.get(channel, usedStateNames.progNo.n).val;
            device.add(channel, device.cmds.progNo, progNo, state.val);
            break;
        case 'progno':
        case usedStateNames.progNo.n:
            if (typeof state.val == 'string') {
                var ar = state.val.split(' ');
                if (!ar || ar.lengt < 2) ar = state.val.split(',');
                if (ar && ar.length >= 2) {
                    var speed = parseInt(ar[1]);
                    state.val = parseInt(ar[0]);
                }
            } else {
                var speed = device.get(channel, usedStateNames.speed.n).val | 30;
            }
            device.add(channel, device.cmds.progNo, state.val >> 0, speed);
            break;
        case usedStateNames.progOn.n:
        case 'progno':
            device.add(channel, state.val ? device.cmds.progOn : device.cmds.progOff);
            break;
        case usedStateNames.command.n:
            var v = state.val.replace(/^on$|red|green|blue|transition|bri|off/g, function(match) { return { on:'on:1', red:'r', green:'g', blue:'b', transition:'x', bri:'l', off:'on:0'}[match] });
            v = v.replace(/\s|\"|;$|,$/g, '').replace(/=/g, ':').replace(/;/g, ',').replace(/true/g, 1).replace(/(r|g|b|x|l|sat|on|ct)/g, '"$1"').replace(/^\{?(.*?)\}?$/, '{$1}');
            try {
                var colors = JSON.parse(v);
            } catch (e) {
                adapter.log.error("on Command: " + e.message + ': state.val="' + state.val + '"');
                return;
            }
            if (!colors || typeof colors !== 'object') return;
            var o = fullExtend(device.getRGBStates(channel), colors);
            adapter.log.debug(JSON.stringify(o));
            if (o.x !== undefined) {
                transitionTime = o.x >> 0;
            }
            if (o['on'] !== undefined) {
                device.on_off(channel, o.on >> 0 ? true : false);
            }
            if (colors.r!==undefined || colors.g!==undefined || colors.b!==undefined || colors.sat!==undefined) {
                if (transitionTime) device.fade(channel, o.r, o.g, o.b, transitionTime );
                else device.color(channel, o.r, o.g, o.b);
            }
            if (o['ct'] !== undefined) {
                device.temperature(channel, o.ct >> 0, transitionTime);
            }
            if (o['l'] !== undefined) {
                device.brightness(channel, o.l >> 0, transitionTime);
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
    this._updateTimer = null;
    //this.id = normalizedName(config.ip);
    this.dev = new devices.CDevice(config.ip, '');
    this.setOnline(false);
    this.locked = 0;
    this.queue = [];
    this.dataBuffer = new Uint8Array(200);
    this.dataBuffer.pos = 0;
    this.states = { red: this.get('r'), green: this.get('g'), blue: this.get('b') };

    this.cmds = cmds[config.type];
    if (!this.cmds) {
        adapter.log.error('wrong device type. ' + config.type + ' not yet supported!');
        return null;
    }
    if(this.cmds.vmax == undefined) this.cmds.vmax = 255;
    this.start(cb);
    return this;
}


wifiLight.prototype.start = function (cb) {
    var self = this;

    if (this.USE_SOCKET_ONCE) {
        wifi[this.dev.getFullId()] = self;
        cb();
        return;
    }

    self.client = new net.Socket();
    self.client.setTimeout(5000, function () {
        adapter.log.debug('self.client.setTimeout for ' + self.config.ip);
    });
    if (self._updateTimer) {
        clearTimeout(self._updateTimer);
        self._updateTimer = null;
    }

    self.client.on('data', function(data) {
        self.onData(data);
    });
    self.client.on('close', function(error) {
        self.setOnline(false);
        adapter.log.debug('onClose (' + self.config.ip + ')');
    });
    self.client.on('drain', function() {
        console.log("on drain!");
    });
    self.client.on('error', function(error) {
        adapter.log.debug('onError (' + self.config.ip + ') - ' + ((new Date().getTime() - self.ts) / 1000) + ' sec: ' + JSON.stringify(error));
        switch (error.errno) { //error.code
            case 'ECONNRESET':
                self.client.destroy();
                setTimeout(self.start.bind(self), 5000);
                break;
            case 'ETIMEDOUT':
                self.client.destroy();
                setTimeout(self.start.bind(self), 5000);
                break;
        }
        self.setOnline(false);
    });
    self.client.on('connect', function(error) {
        adapter.log.debug(self.config.ip + ' connected');
        self.setOnline(true);
    });

    self.client.connect(self.config.port, self.config.ip, function() {
        wifi[self.dev.getFullId()] = self;
        self.setOnline(true);
        self.updateTimer();
        if (cb) cb();
    });
};


//wifiLight.prototype.start = function () {
//    var self = this;
//    return new Promise(function(resolve, reject) {
//
//        wifi[self.id] = self;
//        resolve();
//        return;
//
//        self.ts = new Date().getTime();
//        self.client = new net.Socket();
//        self.client.setTimeout(5000, function () {
//             adapter.log.debug('self.client.setTimeout for ' + self.config.ip);
//        });
//        if (self._updateTimer) {
//            clearTimeout(self._updateTimer);
//            self._updateTimer = null;
//        }
//
//        self.client.on('data', function(data) {
//            self.onData(data);
//        });
//
//        self.client.on('close', function(error) {
//            self.setOnline(false);
//            adapter.log.debug('onClose (' + self.config.ip + ')');
//        });
//
//        self.client.on('drain', function() {
//            console.log("on drain!");
//        });
//
//
//        self.client.on('error', function(error) {
//            adapter.log.debug('onError (' + self.config.ip + ') - ' + ((new Date().getTime() - self.ts) / 1000) + ' sec: ' + JSON.stringify(error));
//            switch (error.errno) { //error.code
//                case 'ECONNRESET':
//                    self.client.destroy();
//                    setTimeout(self.start.bind(self), 5000);
//                    break;
//                case 'ETIMEDOUT':
//                    self.client.destroy();
//                    setTimeout(self.start.bind(self), 5000);
//                    break;
//            }
//            self.setOnline(false);
//        });
//
//        self.client.on('connect', function(error) {
//            adapter.log.debug(self.config.ip + ' connected');
//            self.setOnline(true);
//        });
//
//
//        self.client.connect(self.config.port, self.config.ip, function() {
//            wifi[self.id] = self;
//            self.setOnline(true);
//            self.updateTimer();
//            resolve();
//        });
//    });
//};

//wifiLight.prototype._write = function(data, cb) {
//
//    var self = this;
//    if (this.client) {
//        this.client.write(data, cb);
//        return;
//    }
//    this.client = new net.Socket();
//    this.client.setTimeout(5000, function () {
//        adapter.log.debug('self.client.setTimeout for ' + this.config.ip);
//    }.bind(this));
//
//    this.client.on('data', function(data) {
//        this.onData(data);
//        this.client.end();
//        this.client = null;
//    }.bind(this));
//    this.client.on('error', function(error) {
//        this.client.destroy();
//        this.client = null;
//    }.bind(this));
//
//    this.client.connect(this.config.port, this.config.ip, function() {
//        this.client.write(data, cb);
//    }.bind(this));
//};

wifiLight.prototype._write = function(data, cb) {

    var self = this;
    if (this.client) {
        this.client.write(data, cb);
        return;
    }
    this.client = new net.Socket();
    this.client.setTimeout(5000, function () {
        adapter.log.debug('self.client.setTimeout for ' + self.config.ip);
    });

    this.client.on('data', function(data) {
        self.onData(data);
        self.client.end();
        self.client = null;
    });
    this.client.on('error', function(error) {
        self.client.destroy();
        self.client = null;
    });

    this.client.connect(this.config.port, this.config.ip, function() {
        self.client.write(data, cb);
    });
};

wifiLight.prototype.get = function (channel, state) {
    return this.dev.get(channel, state);
};

wifiLight.prototype.unlock = function () {
    this.add({unlock: true});
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

wifiLight.prototype.updateTimer = function () {
    this.refresh();
    if (this.config.pollIntervall > 0) {
        this._updateTimer = setTimeout(this.updateTimer.bind(this), this.config.pollIntervall * 1000);
    }
};

wifiLight.prototype.setOnline = function (val) {
    this.dev.set(usedStateNames.online.n, !!val);
    //this.dev.update();
    devices.update();
};

wifiLight.prototype.doRrefresh = function(channel) {
    adapter.log.debug('sending refresh...');
    this.write(channel, this.cmds.statusRequest);
};

wifiLight.prototype.refresh = function(channel, ctrl) {
    //this.write(channel, this.cmds.statusRequest);
    this.add(channel, this.cmds.statusRequest, { ctrl: ctrl|true });
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
    adapter.log.debug(buf);
    this.USE_SOCKET_ONCE ? this._write(buf, cb) : this.client.write(buf, cb);
    //this.client.write(buf, cb);
};

wifiLight.prototype.clearQueue = function() {
    this.queue.length = 0;
};

wifiLight.prototype.add = function (varArgArray) {
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
        delay: opt && opt.delay ? opt.delay : 10,
        ts: 0,
        inProcess: 0,
        unlock: 0
    });
    if (this.queue.length && this.queue[0].inProcess === 1) {
        adapter.log.debug('add: return without calling exec');
        return;
    }
    adapter.log.debug('add: calling exec');
    this.exec();
};

wifiLight.prototype.send = wifiLight.prototype.add;

Array.prototype.eq = function (arr) {
    return this.length==arr.length && this.every(function(v,i) { return v === arr[i]});
};

wifiLight.prototype.exec = function () {
    adapter.log.debug('exec: queue.length=' + this.queue.length + (this.queue.length ? ' inProcess=' + this.queue[0].inProcess : ""));
    var akt;
    while(true) {
        if (this.queue.length <= 0) {
            adapter.log.debug('exec: returning queue.length=0');
            return;
        }
        akt = this.queue[0];
        if (!(akt.inProcess || (!akt.ctrl && akt.ts != 0 && akt.ts < new Date().getTime()))) {
            break;
        }
        adapter.log.debug('exec: removing queue entry ' + akt.cmd);
        if (this.queue.length <= 1 && !akt.cmd.eq (this.cmds.statusRequest)) {
            this.doRrefresh(akt.channel);
        }
        this.queue.shift();
    }
    if (akt.unlock) {
        this.unlock();
        if (!akt.cmd) return;
    }
    adapter.log.debug('exec: write: ' + akt.cmd);
    this.write (akt.channel, akt.cmd, function() {
        adapter.log.debug('exec: setTimeout: ' + akt.delay);
        setTimeout(this.exec.bind(this), akt.delay);
    }.bind(this));
    akt.inProcess = 1;
};


wifiLight.prototype.on_off = function (channel, state) {
    this.send(channel, state ? this.cmds.on : this.cmds.off);
};

//wifiLight.prototype.dim = function (channel, level, time) {
//    var co = { r:0, g:0, b:0 };
//
//    var max = parseInt(level*255/100);
//    var steps = parseInt(max * 54 / 100);
//    var delay = parseInt(time*1000 / steps);
//    var dif = 1;
//
//    for (var i = 0; i<steps; i++) {
//        this.color(channel, co.r, co.g, co.b, { delay:delay });
//        co.r += dif;
//        co.g += dif;
//        co.b += dif;
//        if (co.r > max || co.g > max || co.b > max) {
//            break;
//        }
//        var p = parseInt(i*5 / steps);
//        if (p>dif) dif = p;
//    }
//    //this.send(channel, state ? this.cmds.on : this.cmds.off);
//};

wifiLight.prototype.fade = function (channel, r,g,b, transitionTime) {
    if (typeof r == 'object') {
        transitionTime = g; g = r.g; b = r.b; r = r.r;
    }
    if (transitionTime === 0) {
        this.color(channel, r, g, b);
        return;
    }
    var co = { r: this.states.red, g: this.states.green, b: this.states.blue};
    var dif= { r: r - co.r, g: g - co.g, b: b - co.b };
    var maxSteps = Math.max(Math.abs(dif.r), Math.abs(dif.g), Math.abs(dif.b), 1);
    //maxSteps = parseInt(maxSteps * 54 / 100);
    dif.r /= maxSteps;
    dif.g /= maxSteps;
    dif.b /= maxSteps;

    var steps = maxSteps;
    var delay = parseInt(transitionTime*100 / maxSteps);

    for (var i = 0; i<steps; i++) {
        //this.color(channel, parseInt(co.r+0.5), parseInt(co.g+0.5), parseInt(co.b+0.5), { delay:delay });
        co.r += dif.r;
        co.g += dif.g;
        co.b += dif.b;
        this.color(channel, roundRGB(co, true), { delay:delay });
    }
};

wifiLight.prototype.color = function (channel, r, g, b, opt) {
    if (typeof r == 'object') {
        opt = g; g = r.g; b = r.b; r = r.r;
    }
    if (r > this.cmds.vmax) r = this.cmds.vmax;
    if (g > this.cmds.vmax) g = this.cmds.vmax;
    if (b > this.cmds.vmax) b = this.cmds.vmax;
    this.send(channel, this.cmds.rgb, r, g, b, opt);
};

wifiLight.prototype.temperature = function (channel, temp, transitionTime) {
    var co = ct2rgb(temp);
    var hsv = rgb2hsv(co);
    hsv.v = this.get(channel, 'bri').val;
    co = hsv2rgb(hsv);
    this.fade(channel, co, transitionTime);
};

wifiLight.prototype.getRGBStates = function (channel) {
    return {
        r: this.states.red,
        g: this.states.green,
        b: this.states.blue
    };
};

wifiLight.prototype.brightness = function (channel, bri, transitionTime) {
    var co = this.getRGBStates(channel);
    var hsv = rgb2hsv(co);
    hsv.v = Math.max (Math.min(bri, 100), 0);
    co = hsv2rgb(hsv);
    this.fade(channel, co, transitionTime);
};


wifiLight.prototype.onData = function (data) {

    var self = this;
    function set(n, val) {
        if (val != undefined) self.dev.set(n, val);
    }

    var self = this;
    var newPos = this.dataBuffer.pos + data.length;
    if (newPos > this.dataBuffer.length) {
        var b = new Uint8Array(newPos + 200);
        for (var i=0; i<this.dataBuffer.pos; i++) {
            b [i] = this.dataBuffer[i];
        }
        //this.dataBuffer.forEach(function (v, i) {
        //    b [i] = v;
        //});
        b.pos = this.dataBuffer.pos;
        this.dataBuffer = b;
    }

    this.dataBuffer.set(data, this.dataBuffer.pos);
    this.dataBuffer.pos += data.length;

    //if (this.dataBuffer.pos < this.cmds.responsLen) {
    //    return null;
    //}

    while (this.dataBuffer.pos >= this.cmds.responseLen)
    {
        var buf = this.dataBuffer.subarray(0, this.cmds.responseLen);
        var states = this.cmds.decodeResponse(buf);
        this.dataBuffer.copyWithin(0, this.cmds.responseLen, this.dataBuffer.pos);
        this.dataBuffer.pos -= this.cmds.responseLen;
        if (!states) break;
        this.states = states;
        adapter.log.debug('onData: raw:' + JSON.stringify(buf));
        adapter.log.debug('onData: ' + JSON.stringify(this.states));
        if (this.states) {
            set(usedStateNames.status.n, this.states.power);
            set(usedStateNames.red.n, this.states.red);
            set(usedStateNames.green.n, this.states.green);
            set(usedStateNames.blue.n, this.states.blue);
            set(usedStateNames.progNo.n, this.states.progNo);
            set(usedStateNames.progOn.n, this.states.progOn);
            set(usedStateNames.speed.n, this.states.speed);
            devices.update();
        }
    }
    return this.states;
};


//wifiLight.prototype.xonData = function (data) {
//
//    var self = this;
//    function set(n, val) {
//        if (val != undefined) self.dev.set(n, val);
//    }
//
//    var self = this;
//
//    this.dataBuffer.concat(data.buffer);
//    data.forEach(function(val) {
//        self.dataBuffer.push(val);
//    });
//    //this.dataBuffer.splice(this.dataBuffer.length, 0, data);
//
//    if (this.dataBuffer.length < this.cmds.responsLen) {
//        return null;
//    }
//
//    //var len = this.cmds.responsLen ? this.cmds.responsLen : data.length;
//    while (this.dataBuffer.length >= this.cmds.responseLen)
//    //for (var i=0; i<data.length; i+=len)
//    {
//        var buf = this.dataBuffer.splice(0, this.cmds.responseLen);
//        //var buf = data.slice(i, i + len);
//        var states = this.cmds.decodeResponse(buf);
//        if (!states) break;
//        this.states = states;
//        //var result = this.cmds.decodeResponse(data);
//        adapter.log.debug('onData: raw:' + JSON.stringify(buf));
//        adapter.log.debug('onData: ' + JSON.stringify(this.states));
//        if (this.states) {
//            set(usedStateNames.status.n, this.states.power);
//            set(usedStateNames.red.n, this.states.red);
//            set(usedStateNames.green.n, this.states.green);
//            set(usedStateNames.blue.n, this.states.blue);
//            set(usedStateNames.progNo.n, this.states.progNo);
//            set(usedStateNames.progOn.n, this.states.progOn);
//            set(usedStateNames.speed.n, this.states.speed);
//            devices.update();
//        }
//    }
//    return this.states;
//};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


function createAll (callback) {
    var dev = new devices.CDevice(0, '');

    for (var i=0; i<adapter.config.devices.length; i++) {
        var device = adapter.config.devices[i];
        dev.setDevice(device.ip, {common: {name: device.name, role: 'device'}, native: { type: device.type, intervall: device.pollIntervall } });
        for (var j in usedStateNames) {
            var st = Object.assign({}, usedStateNames[j]);
            dev.createNew(st.n, st);
        }
    }
    devices.update(callback);
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function normalizeConfigDevice(dev) {
    dev.pollIntervall = parseInt(dev.pollIntervall) | 0;
    dev.port = parseInt(dev.port) || 5577;
}

function main() {

    createAll();

    for (var i=0; i<adapter.config.devices.length; i++) {
        normalizeConfigDevice(adapter.config.devices[i]);

        new wifiLight(adapter.config.devices[i], function() {
        });
    }
    adapter.subscribeStates('*');
}

