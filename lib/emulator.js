/*
    This is a pseudo engine which provides basic functions for jobManager
    in case jobs are submitted through forks

*/
var ps = require('ps-node');
var events = require('events');

var _psAUX = function() {
    var emitter = new events.EventEmitter();
    var results = {
        'id' : [],
        'partition' : [],
        'nameUUID' : [], // Only mandatory one
        'status' : []
    };
    console.log("HOUHOU");
    // A simple pid lookup
    ps.lookup({
        command: 'node',
        psargs: 'aux'
    }, function(err, resultList) {
        if (err) {
            throw new Error(err);
        }
        console.log("DONG");
        resultList.forEach(function(process) {
            if (process) {
                results.id.push(process.pid);
                results.partition.push(null);
                results.nameUUID.push(process.command);
                results.status.push(process.arguments);

                console.log("Accessible process attributes");
                console.dir(process);
                console.log('PID: %s, COMMAND: %s, ARGUMENTS: %s', process.pid, process.command, process.arguments);
            }
        });
        emitter.emit('data', results);
    });

    return emitter;
}
var _configure = function () {

}
module.exports = {
    list : _psAUX,
    generateHeader : function () {return '';},
    type : function () {return "emulator";},
    configure : _configure
};