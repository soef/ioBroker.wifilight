"use strict";

const dgram = require('dgram'),
      os = require('os'),
      Netmask = require('netmask').Netmask;

const BROADCAST_PORT = 48899;

exports.scanForDevices = function (checkCb, cb) {

    const BC_ID = "HF-A11ASSISTHREAD";
    const msg = new Buffer(BC_ID);
    var boradcasts = [];
    var ifaces = os.networkInterfaces();

    for (var name in ifaces) {
        ifaces[name].forEach(function (iface) {
            if ('IPv4' !== iface.family || iface.internal) {
                return;
            }
            var netmask = new Netmask(iface.address, iface.netmask);
            boradcasts.push(netmask.broadcast);
        })
    }
    var result = [];
    var client = dgram.createSocket("udp4");
    client.bind(BROADCAST_PORT);
    client.on('listening', function () {
        client.setBroadcast(true);
    });
    client.on('message', function (message, rinfo) {
        var s = message.toString();
        if (rinfo.port !== BROADCAST_PORT || s === BC_ID) {
            return;
        }
        if (result.indexOf(s) > -1) return;
        result.push(s);
    });

    var interval = setInterval(function () {
        boradcasts.forEach(function (ip) {
            client.send(msg, 0, msg.length, BROADCAST_PORT, ip);
        });
    }, 300);

    setTimeout(function() {
        clearInterval(interval);
        client.close();

        for (var i=0; i<result.length; i++) {
            var ar = result[i].split(',');
            result[i] = {
                name: ar[2],
                mac: ar[1],
                ip: ar[0],
                type: '',
                port: 5577,
                pollIntervall: 30
            };
            if (checkCb && !checkCb(result[i])) {
                result.splice(i--, 1);
                continue;
            }
            switch(result [i].name) {
                case 'HF-LPB100-ZJ200':
                    result[i].type = 'LD382A';
                    break;
                case 'HF-A11-ZJ002':
                    result[i].type = 'LW12';
                    break;
            }
            //console.log('found: ' + JSON.stringify(result[i]));
        }
        if(cb) cb(result);
    }, 3000);
};


