"use strict";

const VARS = {
    red: -1,
    green: -2,
    blue: -3,
    prog: -4,
    speed: -5,
    white: -6,
    bright: -7
};

const programNames = {
    97: "none",
    37: "Seven Colors Cross Fade",
    38: "Red Gradual Change",
    39: "Green Gradual Change",
    40: "Blue Gradual Change",
    41: "Yellow Gradual Change",
    42: "Cyan Gradual Change",
    43: "Purple Gradual Change",
    44: "White Gradual Change",
    45: "Red,Green Cross Fade",
    46: "Red, Blue Cross Fade",
    47: "Green, Blue Cross Fade",
    48: "Seven Colors Strobe Flash",
    49: "Red Strobe Flash",
    50: "Green Strobe Flash",
    51: "Blue Strobe Flash",
    52: "Yellow Strobe Flash",
    53: "Cyan Strobe Flash",
    54: "Purple Strobe Flash",
    55: "White Strobe Flash",
    56: "Seven Colors Jumping Change"
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
    programNames: programNames,

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
    rgbw: [0x31, VARS.red, VARS.green, VARS.blue, VARS.white, 0x00, 0x0f],
    //bri: [ 0x31, 0xff, 0xff, 0xff, VARS.bright, 0x00, 0x0f ],
    progOn: [0x71, 0x21, 0x0f],
    progOff: [0x71, 0x20, 0x0f],
    progNo: [97, VARS.prog, VARS.speed, 0x0f],
    statusRequest: [0x81, 0x8A, 0x8B/*, 0x96*/],
    programNames: programNames,

    decodeResponse: function(data) {
        if (data.length < 14 || data[0] !== 129) return null;
        //[129, 4, 35, 97, 33, 9, 11, 22, 33, 255, 3, 0, 0, 119]
        return {
            power: ((data[2] === 0x23) ? true : false),
            //power: ((data[13] & 0x01) ? true : false),
            //power: ((data[13] & 0x01) ? false : true),
            progNo: data[3],//mode
            progOn: data[4] === 33, //modeRun
            speed: data[5], //modeSpeed
            red: data[6],
            green: data[7],
            blue: data[8],
            white: data[9]
        };
    }
};


