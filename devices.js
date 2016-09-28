"use strict";

const VARS = {
    red: -1,
    green: -2,
    blue: -3,
    prog: -4,
    speed: -5,
    white: -6
};

exports.LW12 = {
    useCheckSum: false,
    port: 5577,
    //vmax: 100,
    vmax: 255,
    responseLen: 11,
    on: [0xCC, 0x23, 0x33],
    off: [0xCC, 0x24, 0x33],
    rgb: [0x56, VARS.red, VARS.green, VARS.blue, 0xAA],
    progOn: [0xCC, 0x21, 0x33],
    progOff: [0xCC, 0x20, 0x33],
    progNo: [0xBB, VARS.prog, VARS.speed, 0x44],
    statusRequest: [0xEF, 0x01, 0x77],

    decodeResponse: function(data) {
        if (data[0] == 0x66 && data[1] == 0x01) {
        }
        var result = {
            power: ((data[2] === 0x23) ? true : false),
            progNo: data[3],//mode
            progOn: data[4] === 33, //modeRun
            speed: data[5], //modeSpeed
            red: data[6],
            green: data[7],
            blue: data[8]
        };
        if (data[9] == 1 && data[10] == 0x99) {
        }
        return result;
    }
};

exports.LD382A = {
    useCheckSum: true,
    port: 5577,

    responseLen: 14,
    on: [0x71, 0x23, 0x0f/*, 0xa3*/],
    off: [0x71, 0x24, 0x0f/*, 0xa4*/],
    rgb: [0x31, VARS.red, VARS.green, VARS.blue, 0xff /*VARS.white*/, 0x00, 0x0f],
    rgbw: [0x31, VARS.red, VARS.green, VARS.blue, VARS.white /*VARS.white*/, 0x00, 0x0f],
    //progOn: [0xCC, 0x21, 0x33],
    //progOff: [0xCC, 0x20, 0x33],
    //progNo: [0xBB, VARS.prog, VARS.speed, 0x44],
    statusRequest: [0x81, 0x8A, 0x8B/*, 0x96*/],

    decodeResponse: function(data) {
        if (data.length < 14 || data[0] !== 129) return null;
        //[129, 4, 35, 97, 33, 9, 11, 22, 33, 255, 3, 0, 0, 119]
        return {
            power: ((data[13] & 0x01) ? true : false),
            prog: data[3],//mode
            progRun: data[4] === 33, //modeRun
            speed: data[5], //modeSpeed
            red: data[6],
            green: data[7],
            blue: data[8],
            white: data[9]
        };
    }
};

