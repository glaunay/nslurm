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
        console.log("Config file content:\n");
        console.dir(bean);
    }
});


port = port ? port : bean.port;
tcp = tcp ? tcp : bean.tcp;
engineType = engineType ? engineType : bean.engineType;

jobManager.configure({"engine" : engineType, "binaries" : bean.binaries });

jobManager.engine().list()
    .on('data', function(msg) {
        console.log("Testing engine list function");
        console.dir(msg);
    });

jobManager.start({ 'cacheDir' : bean.cacheDir,
          'tcp' : tcp,
          'port' : port
      });
jobManager.on('exhausted', function(){
        console.log("All jobs processed");
    });

var testJob = jobManager.push(bean.test.keyProfile, bean.test.jobSettings);
var testJob2 = jobManager.push(bean.test.keyProfile, bean.test.jobSettings);
var testJob3 = jobManager.push(bean.test.keyProfile, bean.test.jobSettings);

testJob.on("completed", function(stdout, stderr, jObj) {
    var content = '';
    stdout.on('data', function(buf) { content += buf.toString(); });
    stdout.on('end', function() {
        console.log(content);
    });
});



// if stopping the process using Ctrl + C
process.on('SIGINT', function () {
    console.log(' Try to close the jobManager processes...');
    jobManager.stop()
    .on('cleanExit', function () {
        console.log("All pending jobs killed");
        process.exit(0);
    })
    .on('leftExit', function (nbLeft) {
        console.log(nbLeft + " jobs left pending");
        process.exit(0);
    })
    .on('emptyExit', function () {
        console.log("No job to kill")
        process.exit(0);
    })
    .on('cancelError', function (err) {
        console.log("Error during pending job cancelation");
        process.exit(1);
    })
    .on('listError', function (err) {
        console.log("Error during pending job listing");
        process.exit(1);
    });
});




