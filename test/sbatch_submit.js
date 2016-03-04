var spawn = require('child_process').spawn;
var fs = require('fs');


var workdir = '/data/dev/ardock/testGL'

var opt = {
        encoding: 'utf8',
        timeout: 0,
        maxBuffer: 200*1024, //increase here
        killSignal: 'SIGTERM',
        cwd: '//data/www_dev/ardock/lib/js/nSlurm'/*,
        env: process.env*/
    };

//opt = {};

 const out = fs.openSync('./out.log', 'a');
 const err = fs.openSync('./out.err', 'a');

//var process = spawn('sbatch', ['script_sbatch_scratch.sh'], opt);
var scriptFile = workdir + '/script_scratch.sbatch';
console.log(scriptFile);
var process = spawn('/data/www_dev/ardock/bin/slurm/bin/sbatch', [scriptFile],
                 { cwd : workdir });
//var process = spawn('/data/www_dev/ardock/bin/slurm/bin/sbatch', ['-h'],
//     stdio: [ 'ignore', out, err ]);
//var process = spawn('lsa', ['-alh'], opt);
console.log("pid-->" + process.pid);

process.stdout.on('data', function (data){
    console.log('stdout: ' + data );
});
process.on('error', function(err){
    console.log("error occured " + err);
})
process.stderr.on('data', function (data) {
    console.log('stderr: ' + data );
});

process.on('close', function(code) {
    console.log('child process exited with code ' + code);
});

/*
setTimeout(function(){
    process.kill();
}, 1500)
*/
return;

var exec = require('child_process').exec;

console.log("testing sbatch submission");
var cmd = './wrap.sh';
//cmd = "srun";
//cmd = "ls"
console.log("Executing child process \"" + cmd + "\"");

/*
var child = exec(cmd,
  function (error, stdout, stderr) {
    console.log('stdout: ' + stdout);
    console.log('stderr: ' + stderr);
    if (error !== null) {
    //error.code or error.signal
      console.log('exec error: ' + error);
    }
});
*/


var child = exec(cmd);

child.stdout.on('data', function(data) {
    console.log('stdout: ' + data);
});
child.stderr.on('data', function(data) {
    console.log('stdout: ' + data);
});
child.on('close', function(code) {
    console.log('closing code: ' + code);
});
