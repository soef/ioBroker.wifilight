
//"use strict";
// ohne const und use strict sind C_ global
const

    RGB_MAX = 255,
    HUE_MAX = 360,
    SV_MAX = 100,
    FLOAT_RGB_MAX = 255.0,
    FLOAT_HUE_MAX = 360.0,
    FLOAT_SV_MAX = 100.0;


exports.minmax = function (v, min, max) {
    if(v < min) return min;
    if(v > max) return max;
    return v;
};

exports.mmrgb = function (v) {
    return (minmax(v, 0, 255));
};

exports.checkRGB = function (co) {
    //for (var i in co) {
    //    co[i] = mmrgb(parseInt(co[i]));
    //}
    co.r = mmrgb(parseInt(co.r));
    co.g = mmrgb(parseInt(co.g));
    co.b = mmrgb(parseInt(co.b));
    if (co.w != undefined) co.w = mmrgb(parseInt(co.w));
    //return co;
};

exports.roundRGB = function (co, copy) {
    if (copy) {
        var c = {};
        //for (var i in co) {
        //    c[i] = mmrgb(Math.round(co[i]));
        //}
        c.r = mmrgb(Math.round(co.r));
        c.g = mmrgb(Math.round(co.g));
        c.b = mmrgb(Math.round(co.b));
        if(co.w != undefined) c.w = mmrgb(Math.round(co.w));
        //checkRGB(c);
        return c;
    }
    co.r = mmrgb(Math.round(co.r));
    co.g = mmrgb(Math.round(co.g));
    co.b = mmrgb(Math.round(co.b));
    if(co.w != undefined) co.w = mmrgb(Math.round(co.w));
    //checkRGB(co);
};

exports.xct2rgb = function (kelvin){
    var temp = (kelvin * (40000-1000) / 5000 + 1000) / 100;
    var co = { r: 255, g: 0, b: 255 };
    if( temp <= 66 ){
        co.r = 255;
        co.g = temp;
        co.g = 99.4708025861 * Math.log(co.g) - 161.1195681661;
        if( temp <= 19){
            co.b = 0;
        } else {
            co.b = temp-10;
            co.b = 138.5177312231 * Math.log(co.b) - 305.0447927307;
        }
    } else {
        co.r = temp - 60;
        co.r = 329.698727446 * Math.pow(co.r, -0.1332047592);
        co.g = temp - 60;
        co.g = 288.1221695283 * Math.pow(co.g, -0.0755148492 );
        co.b = 255;
    }
    checkRGB(co);
    return co;
};

exports.ct2rgb = function (kelvin) {
    var temperature = (kelvin * (40000-1000) / 5000 + 1000) / 100;
    //var temperature = kelvin / 100;
    var co = {r: 255, g: 0, b: 255 };

    if (temperature < 66.0) {
        //co.r = 255;
        co.g = temperature - 2;
        co.g = -155.25485562709179 - 0.44596950469579133 * co.g + 104.49216199393888 * Math.log(co.g);
        if (temperature <= 20.0) {
            co.b = 0;
        } else {
            co.b = temperature - 10;
            co.b = -254.76935184120902 + 0.8274096064007395 * co.b + 115.67994401066147 * Math.log(co.b);
        }
    } else {
        co.r = temperature - 55.0;
        co.r = 351.97690566805693+ 0.114206453784165 * co.r - 40.25366309332127 * Math.log(co.r);
        co.g = temperature - 50.0;
        co.g = 325.4494125711974 + 0.07943456536662342 * co.g - 28.0852963507957 * Math.log(co.g);
        //co.b = 255;
    }
    roundRGB(co);
    //checkRGB(co);
    return co;
};

////////////////////////////////////////////////////////////////////
//based on colorsys, https://github.com/netbeast/colorsys

exports.rgb2hsv = function (r, g, b) {
    if (typeof r === 'object') {
        g = r.g; b = r.b; r = r.r;
    }
    r = (r === RGB_MAX) ? 1 : (r % RGB_MAX / FLOAT_RGB_MAX);
    g = (g === RGB_MAX) ? 1 : (g % RGB_MAX / FLOAT_RGB_MAX);
    b = (b === RGB_MAX) ? 1 : (b % RGB_MAX / FLOAT_RGB_MAX);

    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var h, s, v = max;
    var d = max - min;

    s = max === 0 ? 0 : d / max;

    if (max === min) {
        h = 0;
    } else {
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break
        }
        h /= 6;
    }
    return { h: Math.floor(h * HUE_MAX), s: Math.floor(s * SV_MAX), v: Math.floor(v * SV_MAX) };
};

////////////////////////////////////////////////////////////////////
//based on colorsys, https://github.com/netbeast/colorsys

exports.hsv2rgb = function (h, s, v) {
    if (typeof h === 'object') {
        s = h.s; v = h.v; h = h.h;
    }

    h = (h === HUE_MAX) ? 1 : (h % HUE_MAX / FLOAT_HUE_MAX * 6);
    s = (s === SV_MAX) ? 1 : (s % SV_MAX / FLOAT_SV_MAX);
    v = (v === SV_MAX) ? 1 : (v % SV_MAX / FLOAT_SV_MAX);

    var i = Math.floor(h);
    var f = h - i;
    var p = v * (1 - s);
    var q = v * (1 - f * s);
    var t = v * (1 - (1 - f) * s);
    var mod = i % 6;
    var r = [v, q, p, p, t, v][mod];
    var g = [t, v, v, q, p, p][mod];
    var b = [p, p, t, v, v, q][mod];

    return { r: Math.round(r * RGB_MAX), g: Math.round(g * RGB_MAX), b: Math.round(b * RGB_MAX) };
};


for (var i in exports) {
    global[i] = exports[i];
}
