/*
    This is a pseudo engine which provides basic functions for jobManager
    in case jobs are submitted through forks

*/
//var ps = require('ps-node');
var ps = require('./ps');
var events = require('events');
const path = require('path');

var _psAUX = function() {
    var emitter = new events.EventEmitter();
    var results = {
        'id' : [],
        'partition' : [],
        'nameUUID' : [], // Only mandatory one
        'status' : []
    };
    var regex = /\.batch$/;
    ps.lookup().on('data', function(dataRecord){
        dataRecord.forEach(function(d) {
            if (d.COMMAND[0] !== 'sh') return;
            if (d.COMMAND.length === 1) return;
            if (!regex.test(d.COMMAND[1])) return;
            var uuid = path.basename(d.COMMAND[1]).replace(".batch", "");
            results.id.push(d.PID[0]);
            results.partition.push(null);
            results.nameUUID.push(uuid);
            results.status.push(d.STAT[0]);
        });
        emitter.emit('data', results);
    });

    return emitter;
}

var _nullBin = function () {
    return null;
}
var _configure = function () {
}

module.exports = {
    list : _psAUX,
    generateHeader : function () {return '';},
    type : function () {return "emulator";},
    configure : _configure,
    submitBin : _nullBin,
    cancelBin : _nullBin
};