/*
    This is a pseudo engine which provides basic functions for jobManager
    in case jobs are submitted through forks

*/
//var ps = require('ps-node');
var ps = require('./ps');
var events = require('events');
const path = require('path');
var childProcess = require('child_process');

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


 var killJobs = function (jobObjList) {
    var emitter = new events.EventEmitter();

    var targetJobID = jobObjList.map(function(jobObj) { return jobObj.id;})
    console.log("Potential pending target job ids are:");
    console.dir(targetJobID);

    var targetProcess = [];
    _psAUX()
    .on('listError', function(err) { emitter.emit('killError', err);})
    .on('data', function(psLookupDict){
        psLookupDict.nameUUID.forEach(function(uuid, i) {
            if(targetJobID.indexOf(uuid) >= 0)
                targetProcess.push(psLookupDict.id[i]);
        });
        _kill(targetProcess, emitter);
    });

    emitter.on('finalCount', function() {
        var i = 0;
        _psAUX().on('data', function(psLookupDict){
            psLookupDict.nameUUID.forEach(function(uuid, i) {
                if(targetJobID.indexOf(uuid) >= 0) i++;
            });
            if (i === 0)
                emitter.emit('cleanExit');
            else
                emitter.emit('leftExit', i);
        });
    });

    return emitter;
}

var _kill = function(processIDs, emitter) {
    var exec_cmd = childProcess.exec;
   // console.log('**kill -9 ' + processIDs.join(' '));
    if (processIDs.length == 0) {
        emitter.emit('emptyExit');
        return;
    }
    exec_cmd('kill -9 ' + processIDs.join(' '),
        function (err, stdout, stderr) {
            if (err) {
                //console.log('Error for scancel command : ' + err);
                emitter.emit('cancelError', err);
                return;
            }
            //** redo a count of job

            //console.log('Job kill ');
            emitter.emit('finalCount');
        }
    );

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
    cancelBin : _nullBin,
    kill : killJobs
};