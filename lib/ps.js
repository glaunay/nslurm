var events = require('events');
var ChildProcess = require('child_process');
var tableParser = require('table-parser');
var _lookup = function (query) {
    var emitter = new events.EventEmitter();
    /**
    * add 'lx' as default ps arguments, since the default ps output in linux like "ubuntu", wont include command arguments
    */
    query = query ? query : {};
    var exeArgs = query.psargs || ['aux'];
    var spawn = ChildProcess.spawn;
    //console.dir(exeArgs);
    const child = spawn('ps', [exeArgs]);
    var stdout = '';
    var stderr = null;

    child.stdout.on('data', function (data) {
      stdout += data.toString();
    });

    child.stderr.on('data', function (data) {

      if (stderr === null) {
        stderr = data.toString();
      }
      else {
        stderr += data.toString();
      }
    });

    child.on('exit', function () {
        if (stderr) {
        emitter.emit('psError', stderr);
        } else {
            var data = _parse(stdout);
            emitter.emit('data', data);
        }

    });

    return emitter;
};

var _parse = function(rawData) {
    var data = tableParser.parse(rawData);
    //console.log(data);
    return data;
}

var _kill = function( pid, signal, next ){};
/*
var _kill = function( pid, signal, next ){
  //opts are optional
  if(arguments.length == 2 && typeof signal == 'function'){
    next = signal;
    signal = undefined;
  }

  var checkTimeoutSeconds = (signal && signal.timeout) || 30;

  if (typeof signal === 'object') {
    signal = signal.signal;
  }

  try {
    process.kill(pid, signal);
  } catch(e) {
    return next && next(e);
  }

  var checkConfident = 0;
  var checkTimeoutTimer = null;
  var checkIsTimeout = false;

  function checkKilled(finishCallback) {
    exports.lookup({ pid: pid }, function(err, list) {
      if (checkIsTimeout) return;

      if (err) {
        clearTimeout(checkTimeoutTimer);
        finishCallback && finishCallback(err);
      } else if(list.length > 0) {
        checkConfident = (checkConfident - 1) || 0;
        checkKilled(finishCallback);
      } else {
        checkConfident++;
        if (checkConfident === 5) {
          clearTimeout(checkTimeoutTimer);
          finishCallback && finishCallback();
        } else {
          checkKilled(finishCallback);
        }
      }
    });
  }

  next && checkKilled(next);

  checkTimeoutTimer = next && setTimeout(function() {
    checkIsTimeout = true;
    next(new Error('Kill process timeout'));
  }, checkTimeoutSeconds * 1000);
};
*/

module.exports = {
    lookup : _lookup,
    kill : _kill
};