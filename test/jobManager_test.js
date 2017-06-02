/*var should = require('chai').should(),
    nSlurm = require('../index'),
    squeue = nSlurm.squeue,
    submit = nSlurm.squeue;

    */
/* qbatch;nc->sbatch->nc */
var jsonfile = require('jsonfile');
var events = require('events');

var jobManager = require('../index.js');

var parseConfig = function (fileName){
    var obj = jsonfile.readFileSync(fileName);
    return obj;
};




var cacheDir, port, tcp, engineType;
var bean = {};

process.argv.forEach(function (val, index, array){
    /*if (val === '--local') bLocal = true;
    if (val === '--gpu') ardockFunc = PDB_Lib.arDock_gpu;
    */
    if (val === '-p'){
        if (! array[index + 1])
            throw("usage : ");
        port = array[index + 1];
    }
    if (val === '-d'){
        if (! array[index + 1])
            throw("usage : ");
        cacheDir = array[index + 1];
        console.log("cacheDir is  ==> " + cacheDir);
    }
    if (val === '-a'){
        if (! array[index + 1])
            throw("usage : ");
        tcp = array[index + 1];
        console.log("ip adress is  ==> " + tcp);
    }
    if (val === '-e'){
        if (! array[index + 1])
            throw("usage : ");
        engineType = array[index + 1];
        console.log("Scheduler engine type is ==> " + engineType);
    }
    if (val === '-f'){
        if (! array[index + 1])
            throw("usage : ");
        bean = parseConfig(array[index + 1]);
    }
});


port = port ? port : bean.port;
tcp = tcp ? tcp : bean.tcp;
engineType = engineType ? engineType : bean.engineType;

jobManager.configure({"engine" : engineType, "binaries" : bean.binaries });

jobManager.engine().list()
    .on('data', function() {process.exit();});

jobManager.start({ 'cacheDir' : bean.cacheDir,
          'tcp' : tcp,
          'port' : port
      });
jobManager.on('exhausted', function(){
        console.log("All jobs processed");
    });
