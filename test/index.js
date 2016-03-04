/*var should = require('chai').should(),
    nSlurm = require('../index'),
    squeue = nSlurm.squeue,
    submit = nSlurm.squeue;

    */



/* qbatch;nc->sbatch->nc */

s = require('../index.js');
s.start({ 'cacheDir' : '/data/dev/ardock/tmp',
          'tcp' : "192.168.117.151",
          'port' : '2222',
          'slurmBinaries' : '/data/www_dev/ardock/bin/slurm/bin'
        });
s.on('exhausted', function(){
        console.log("All jobs processed");
    });

setTimeout(function(){
    //j = s.push({'name' : 'dummyJob', 'gid' : 'ws_users', 'uid' : 'ws_ardock' });

    var titi='titiValue'
    j = s.push({'script' : 'example_script.sh', 'gid' : 'ws_users', 'uid' : 'ws_ardock',
                'exportVar' : { // List of variables which will be exported in the sbatch
                    'titi' : titi
                }
            });

    j.on('submitted', function(j){
        console.log('job submitted');
        s.jobsView();
    });

    j.on('timeOut', function(j){
        console.log('job ' + j.id + 'time Out !');
    }).on('completed', function(stdout, stderr, jobObject){
      /* We may have to apply buf.toString in end event*/
        stdout.on('data', function(buf){
            console.log('got %d bytes of data', buf.length);

            //console.log("this is stdout stream " + buf.toString());
            /*console.dir(jobObject);*/
            s.jobsView();
        });
    })
}, 1000);


 /*   s.test();
    s.squeue();
    j = s.push();
    console.dir(j);
    s.see_id();
    s.set_id(4444);
    s.see_id();*/


/*
var fsocket = 'helloWorld.sock';
var fs = require('fs');  // file system
var http = require('http');

var rstream = null;

var server = http.createServer(function (req, res) {
    console.log('WTF');
  // logic here to determine what file, etc
  fs.stat(fsocket, function(err, stat) {
    if(err == null) {
        console.log('File exists');
        rstream = openRstream(fsocket);
    } else if(err.code == 'ENOENT') {
        console.log("creating file")
        fs.writeFile(fsocket, 'Some log\n');
        rstream = openRstream(fsocket);
    } else {
        console.log('Some other error: ', err.code);
    }
});

});
server.listen(8000, '127.0.0.1');  // start
*/
